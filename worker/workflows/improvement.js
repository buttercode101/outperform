import { WorkflowEntrypoint } from "cloudflare:workers";
import { planChallenge } from "../../src/domain/challenge.js";

const isoNow = () => new Date().toISOString();

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function recordEvent(db, sessionId, type, payload = {}) {
  await db.prepare(
    "INSERT INTO session_events (id, session_id, event_type, payload_json, occurred_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), sessionId, type, JSON.stringify(payload), isoNow()).run();
}

async function setStatus(db, sessionId, status, bestArtifactId = undefined) {
  if (bestArtifactId === undefined) {
    await db.prepare("UPDATE work_sessions SET status = ?, version = version + 1, updated_at = ? WHERE id = ?")
      .bind(status, isoNow(), sessionId).run();
  } else {
    await db.prepare("UPDATE work_sessions SET status = ?, best_artifact_id = ?, version = version + 1, updated_at = ? WHERE id = ?")
      .bind(status, bestArtifactId, isoNow(), sessionId).run();
  }
}

async function callModel(env, { system, prompt, temperature = 0.4, maxTokens = 3500 }) {
  if (!env.OPENROUTER_API_KEY || !env.OPENROUTER_MODEL) {
    const error = new Error("Model provider is not configured. Set OPENROUTER_API_KEY and OPENROUTER_MODEL before starting sessions.");
    error.code = "PROVIDER_NOT_CONFIGURED";
    throw error;
  }
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": env.BETTER_AUTH_URL || "https://outperform.work",
      "X-Title": "OUTPERFORM"
    },
    body: JSON.stringify({
      model: env.OPENROUTER_MODEL,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt }
      ]
    })
  });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 1200);
    const error = new Error(`Model provider returned HTTP ${response.status}: ${body}`);
    error.code = "MODEL_PROVIDER_ERROR";
    throw error;
  }
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    const error = new Error("Model provider returned an empty or unsupported response.");
    error.code = "EMPTY_MODEL_RESPONSE";
    throw error;
  }
  return content.trim();
}

async function storeArtifact(env, session, content, role, version) {
  const id = `${session.id}-${role.toLowerCase()}-${version}`;
  const contentHash = await sha256(content);
  const objectKey = `sessions/${session.id}/artifacts/${version}-${role.toLowerCase()}-${contentHash}.md`;
  await env.ARTIFACTS.put(objectKey, content, {
    httpMetadata: { contentType: "text/markdown; charset=utf-8" },
    customMetadata: { sessionId: session.id, artifactId: id, contentHash, role }
  });
  await env.DB.prepare(
    "INSERT OR IGNORE INTO artifacts (id, session_id, kind, object_key, content_hash, parent_artifact_id, created_by, version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, session.id, "MARKDOWN", objectKey, contentHash, null, role, version, isoNow()).run();
  return { id, objectKey, contentHash, version, role };
}

function parseJudgeResponse(content) {
  const stripped = content.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  try {
    const value = JSON.parse(stripped);
    if (!["primary", "challenger"].includes(value.preferred)) throw new Error("preferred must be primary or challenger");
    return {
      preferred: value.preferred,
      rationale: typeof value.rationale === "string" ? value.rationale : "No rationale supplied.",
      strengths: Array.isArray(value.strengths) ? value.strengths.slice(0, 8) : [],
      risks: Array.isArray(value.risks) ? value.risks.slice(0, 8) : [],
      improvementIdeas: Array.isArray(value.improvementIdeas) ? value.improvementIdeas.slice(0, 8) : []
    };
  } catch {
    return {
      preferred: "primary",
      rationale: "The evaluator response could not be parsed. The primary output is shown without a quality endorsement.",
      strengths: [],
      risks: ["Evaluation response was not valid structured JSON."],
      improvementIdeas: []
    };
  }
}

export class ImprovementWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const { sessionId, userId } = event.payload;
    const session = await step.do("load-session", async () => {
      const row = await this.env.DB.prepare(
        "SELECT * FROM work_sessions WHERE id = ? AND owner_id = ?"
      ).bind(sessionId, userId).first();
      if (!row) throw new Error("Session not found or access denied.");
      return row;
    });

    await step.do("mark-understanding", async () => {
      await setStatus(this.env.DB, sessionId, "UNDERSTANDING");
      await recordEvent(this.env.DB, sessionId, "SESSION_UNDERSTANDING");
      return { status: "UNDERSTANDING" };
    });

    if (!this.env.OPENROUTER_API_KEY || !this.env.OPENROUTER_MODEL) {
      await step.do("block-unconfigured-provider", async () => {
        await setStatus(this.env.DB, sessionId, "BLOCKED");
        await recordEvent(this.env.DB, sessionId, "PROVIDER_NOT_CONFIGURED", {
          required: ["OPENROUTER_API_KEY", "OPENROUTER_MODEL"]
        });
        return { status: "BLOCKED" };
      });
      return { status: "BLOCKED", reason: "Model provider configuration is required." };
    }

    const contextObject = session.context_object_key
      ? await step.do("load-context", async () => {
          const object = await this.env.ARTIFACTS.get(session.context_object_key);
          return object ? await object.text() : "";
        })
      : "";

    await step.do("mark-baseline", async () => {
      await setStatus(this.env.DB, sessionId, "BASELINING");
      await recordEvent(this.env.DB, sessionId, "BASELINE_CAPTURED", { contextPresent: Boolean(contextObject) });
      return { status: "BASELINING" };
    });

    await step.do("mark-executing", async () => {
      await setStatus(this.env.DB, sessionId, "EXECUTING");
      await recordEvent(this.env.DB, sessionId, "PRIMARY_EXECUTION_STARTED");
      return { status: "EXECUTING" };
    });

    const primaryContent = await step.do(
      "primary-performance",
      { retries: { limit: 2, delay: "3 seconds", backoff: "exponential" } },
      async () => callModel(this.env, {
        system: "You are the primary performance engine inside OUTPERFORM. Produce the strongest useful deliverable for the user's objective. Respect constraints, distinguish facts from assumptions, and do not claim tests or research were performed unless they were.",
        prompt: `TASK TYPE: ${session.task_type}\nOBJECTIVE: ${session.objective}\nCONTEXT AND EXISTING WORK:\n${contextObject || "(No additional context supplied)"}\n\nProduce a complete first attempt. State material assumptions and unresolved uncertainties.`,
        temperature: 0.45
      })
    );
    const primaryArtifact = await step.do("store-primary-artifact", async () =>
      storeArtifact(this.env, session, primaryContent, "PRIMARY", 1)
    );
    await step.do("record-primary", async () => {
      await recordEvent(this.env.DB, sessionId, "PRIMARY_EXECUTION_COMPLETED", {
        artifactId: primaryArtifact.id, contentHash: primaryArtifact.contentHash
      });
      return { artifactId: primaryArtifact.id };
    });

    const plan = planChallenge({
      taskType: session.task_type,
      risk: "MEDIUM",
      uncertainty: 0.65,
      remainingModelCalls: Math.max(0, JSON.parse(session.budget_json).maxModelCalls - 1),
      remainingToolCalls: JSON.parse(session.budget_json).maxToolCalls ?? 0
    });

    let challengerArtifact = null;
    let challengerContent = null;
    if (plan.strategy !== "NO_CHALLENGE") {
      await step.do("mark-challenging", async () => {
        await setStatus(this.env.DB, sessionId, "CHALLENGING");
        await recordEvent(this.env.DB, sessionId, "CHALLENGE_SELECTED", plan);
        return { status: "CHALLENGING", strategy: plan.strategy };
      });
      challengerContent = await step.do(
        "independent-challenge",
        { retries: { limit: 2, delay: "3 seconds", backoff: "exponential" } },
        async () => callModel(this.env, {
          system: "You are an independent rival solution engine. You have not seen the primary answer. Do not imitate it. Solve the user's task independently and aim to outperform a strong competing system. Do not claim verification you did not perform.",
          prompt: `TASK TYPE: ${session.task_type}\nOBJECTIVE: ${session.objective}\nCONTEXT AND EXISTING WORK:\n${contextObject || "(No additional context supplied)"}\n\nProduce a complete independent alternative. Surface assumptions and uncertainty.`,
          temperature: 0.65
        })
      );
      challengerArtifact = await step.do("store-challenger-artifact", async () =>
        storeArtifact(this.env, session, challengerContent, "CHALLENGER", 2)
      );
      await step.do("record-challenger", async () => {
        await recordEvent(this.env.DB, sessionId, "CHALLENGE_COMPLETED", {
          strategy: plan.strategy, artifactId: challengerArtifact.id
        });
        return { artifactId: challengerArtifact.id };
      });
    }

    await step.do("mark-evaluating", async () => {
      await setStatus(this.env.DB, sessionId, "EVALUATING");
      await recordEvent(this.env.DB, sessionId, "EVALUATION_STARTED");
      return { status: "EVALUATING" };
    });

    const evaluationText = await step.do("independent-adjudication", async () =>
      callModel(this.env, {
        system: "You are an independent evaluator. Compare the candidates against the stated objective and task type. Return ONLY valid JSON with keys preferred (primary|challenger), rationale, strengths (array), risks (array), improvementIdeas (array). Do not claim external verification, factual validation, code execution or test results. If uncertain, prefer primary and explain why.",
        prompt: `OBJECTIVE: ${session.objective}\nTASK TYPE: ${session.task_type}\nPRIMARY CANDIDATE:\n${primaryContent}\n\nCHALLENGER CANDIDATE:\n${challengerArtifact ? challengerContent : "(No challenger candidate was produced)"}\n\nCompare for correctness, completeness, clarity, constraint adherence and likely usefulness. This is a model evaluation, not external verification.`,
        temperature: 0.1,
        maxTokens: 1800
      })
    );
    const evaluation = parseJudgeResponse(evaluationText);
    const selectedArtifact = evaluation.preferred === "challenger" && challengerArtifact ? challengerArtifact : primaryArtifact;

    await step.do("await-human-review", async () => {
      await setStatus(this.env.DB, sessionId, "AWAITING_APPROVAL", selectedArtifact.id);
      await recordEvent(this.env.DB, sessionId, "RESULT_READY_FOR_REVIEW", {
        selectedArtifactId: selectedArtifact.id,
        primaryArtifactId: primaryArtifact.id,
        challengerArtifactId: challengerArtifact?.id ?? null,
        evaluation,
        verificationStatus: "UNVERIFIED"
      });
      return { status: "AWAITING_APPROVAL", selectedArtifactId: selectedArtifact.id };
    });

    return {
      status: "AWAITING_APPROVAL",
      selectedArtifactId: selectedArtifact.id,
      primaryArtifactId: primaryArtifact.id,
      challengerArtifactId: challengerArtifact?.id ?? null,
      verificationStatus: "UNVERIFIED"
    };
  }
}
