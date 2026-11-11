import { createSession } from "../src/domain/session.js";
import { normalizeSessionBudget } from "../src/domain/budget.js";
import { createAuth } from "./auth.js";

export { ImprovementWorkflow } from "./workflows/improvement.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-frame-options": "DENY"
  }
});

const error = (code, message, status) => json({ error: code, message }, status);

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function getUser(auth, request) {
  const result = await auth.api.getSession({ headers: request.headers });
  return result?.user ?? null;
}

async function listSessions(env, userId) {
  const result = await env.DB.prepare(
    "SELECT id, status, task_type, objective, best_artifact_id, version, created_at, updated_at FROM work_sessions WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 50"
  ).bind(userId).all();
  return result.results ?? [];
}


async function releaseDailyRunReservation(env, userId, usageDate) {
  await env.DB.prepare(
    "UPDATE user_daily_usage SET runs_started = MAX(0, runs_started - 1), updated_at = ? WHERE user_id = ? AND usage_date = ?"
  ).bind(new Date().toISOString(), userId, usageDate).run();
}

async function createWorkSession(request, env, user) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return error("UNSUPPORTED_MEDIA_TYPE", "Send the session brief as application/json.", 415);
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 120_000) return error("PAYLOAD_TOO_LARGE", "The session brief must be smaller than 120 KB.", 413);
  let body;
  try { body = JSON.parse(raw); } catch { return error("INVALID_JSON", "The request body is not valid JSON.", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return error("INVALID_SESSION", "Provide a session brief object.", 400);

  const objective = typeof body.objective === "string" ? body.objective.trim() : "";
  const taskType = typeof body.taskType === "string" ? body.taskType.trim().toUpperCase() : "";
  const context = typeof body.context === "string" ? body.context.trim() : "";
  if (!objective || objective.length > 8_000) return error("INVALID_OBJECTIVE", "Provide an objective between 1 and 8,000 characters.", 400);
  if (!["CODE", "RESEARCH", "DOCUMENT", "BUSINESS", "CREATIVE", "OTHER"].includes(taskType)) {
    return error("INVALID_TASK_TYPE", "Choose a supported task type.", 400);
  }
  if (new TextEncoder().encode(context).length > 100_000) return error("CONTEXT_TOO_LARGE", "Context must be smaller than 100 KB.", 413);

  const budget = normalizeSessionBudget(body.budget);
  if (body.requirements !== undefined && (!Array.isArray(body.requirements) || body.requirements.length > 20)) return error("INVALID_REQUIREMENTS", "Provide no more than 20 acceptance criteria.", 400);
  if (body.constraints !== undefined && (!Array.isArray(body.constraints) || body.constraints.length > 20)) return error("INVALID_CONSTRAINTS", "Provide no more than 20 constraints.", 400);
  const requirements = Array.isArray(body.requirements) ? body.requirements : [];
  const constraints = Array.isArray(body.constraints) ? body.constraints : [];
  if (requirements.some((item) => !item || typeof item.description !== "string" || item.description.trim().length > 500)) return error("INVALID_REQUIREMENTS", "Each acceptance criterion must be text no longer than 500 characters.", 400);
  if (constraints.some((item) => !item || typeof item.description !== "string" || item.description.trim().length > 500)) return error("INVALID_CONSTRAINTS", "Each constraint must be text no longer than 500 characters.", 400);
  let session;
  try {
    session = createSession({ objective, taskType, budget, requirements, constraints });
  } catch (e) {
    return error(e.code ?? "INVALID_SESSION", e.message, 400);
  }

  const contextObjectKey = context ? "sessions/" + session.id + "/source/context.txt" : null;
  try {
    if (contextObjectKey) {
      await env.ARTIFACTS.put(contextObjectKey, context, {
        httpMetadata: { contentType: "text/plain; charset=utf-8" },
        customMetadata: { sessionId: session.id, ownerId: user.id, kind: "source-context" }
      });
    }

    const statements = [
      env.DB.prepare(
        "INSERT INTO work_sessions (id, owner_id, status, task_type, objective, budget_json, context_object_key, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(session.id, user.id, session.status, session.taskType, session.objective,
        JSON.stringify(session.budget), contextObjectKey, session.version, session.createdAt, session.updatedAt),
      env.DB.prepare(
        "INSERT INTO session_events (id, session_id, event_type, payload_json, occurred_at) VALUES (?, ?, ?, ?, ?)"
      ).bind(crypto.randomUUID(), session.id, "SESSION_CREATED",
        JSON.stringify({ taskType: session.taskType, requirementsCount: session.requirements.length, contextPresent: Boolean(contextObjectKey) }),
        session.createdAt)
    ];
    for (const requirement of session.requirements) {
      statements.push(env.DB.prepare(
        "INSERT INTO requirements (id, session_id, description, source, mandatory, verification_method, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(requirement.id, session.id, requirement.description, requirement.source,
        requirement.mandatory ? 1 : 0, requirement.verificationMethod, session.createdAt));
    }
    for (const constraint of session.constraints) {
      statements.push(env.DB.prepare(
        "INSERT INTO session_constraints (id, session_id, description, constraint_type, created_at) VALUES (?, ?, ?, ?, ?)"
      ).bind(constraint.id, session.id, constraint.description, constraint.type, session.createdAt));
    }
    await env.DB.batch(statements);
  } catch (e) {
    if (contextObjectKey) await env.ARTIFACTS.delete(contextObjectKey);
    throw e;
  }
  return json({ session: { id: session.id, status: session.status, taskType, objective, createdAt: session.createdAt } }, 201);
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/health" && request.method === "GET") {
    const [dailyUsageTable, userPlaybooksTable] = env.DB ? await Promise.all([
      env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'user_daily_usage'").first().catch(() => null),
      env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'user_playbooks'").first().catch(() => null)
    ]) : [null, null];
    return json({
      ok: true,
      service: "outperform-api",
      database: Boolean(env.DB),
      dailyUsageConfigured: Boolean(dailyUsageTable),
      userPlaybooksConfigured: Boolean(userPlaybooksTable),
      artifactStorage: Boolean(env.ARTIFACTS),
      durableWorkflow: Boolean(env.OUTPERFORM_WORKFLOW),
      authenticationConfigured: Boolean(env.BETTER_AUTH_SECRET),
      modelProviderConfigured: Boolean(env.OPENROUTER_API_KEY && env.OPENROUTER_MODEL && env.OPENROUTER_CHALLENGER_MODEL),
      timestamp: new Date().toISOString()
    });
  }

  if (url.pathname.startsWith("/api/auth")) {
    const auth = createAuth(env, request);
    if (!auth) return error("AUTH_NOT_CONFIGURED", "Authentication secret or database binding is not configured.", 503);
    return auth.handler(request);
  }

  if (url.pathname.startsWith("/api/")) {
    if (!env.BETTER_AUTH_SECRET) return error("AUTH_NOT_CONFIGURED", "Authentication is not configured.", 503);
    const auth = createAuth(env, request);
    const user = await getUser(auth, request);
    if (!user) return error("UNAUTHENTICATED", "Sign in to access your workspace.", 401);

    if (url.pathname === "/api/account" && request.method === "DELETE") {
      let body;
      try { body = await request.json(); } catch { return error("INVALID_JSON", "Confirm account deletion explicitly.", 400); }
      if (body?.confirmation !== "DELETE MY ACCOUNT") {
        return error("CONFIRMATION_REQUIRED", "Send the exact confirmation text to delete this account.", 400);
      }
      const [artifactRows, contextRows] = await Promise.all([
        env.DB.prepare(
          "SELECT a.object_key FROM artifacts a INNER JOIN work_sessions s ON s.id = a.session_id WHERE s.owner_id = ?"
        ).bind(user.id).all(),
        env.DB.prepare(
          "SELECT context_object_key FROM work_sessions WHERE owner_id = ? AND context_object_key IS NOT NULL"
        ).bind(user.id).all()
      ]);
      const objectKeys = [...new Set([
        ...(artifactRows.results ?? []).map((item) => item.object_key),
        ...(contextRows.results ?? []).map((item) => item.context_object_key)
      ].filter(Boolean))];
      const deletions = await Promise.allSettled(objectKeys.map((key) => env.ARTIFACTS.delete(key)));
      const failedDeletes = deletions.filter((result) => result.status === "rejected");
      if (failedDeletes.length) {
        console.error("OUTPERFORM account deletion stopped because some R2 objects could not be deleted", {
          userId: user.id, failedObjects: failedDeletes.length
        });
        return error("ACCOUNT_DATA_CLEANUP_FAILED", "Some stored files could not be deleted. The account was retained; contact support before retrying.", 503);
      }
      await env.DB.batch([
        env.DB.prepare("DELETE FROM work_sessions WHERE owner_id = ?").bind(user.id),
        env.DB.prepare('DELETE FROM "user" WHERE id = ?').bind(user.id)
      ]);
      return json({ deleted: true, storedObjectsDeleted: objectKeys.length });
    }

    if (url.pathname === "/api/usage" && request.method === "GET") {
      const usageDate = new Date().toISOString().slice(0, 10);
      const dailyLimit = Math.max(1, Math.min(50, Number(env.MAX_DAILY_AI_RUNS) || 10));
      const [usage, modelUsage] = await Promise.all([
        env.DB.prepare(
          "SELECT runs_started FROM user_daily_usage WHERE user_id = ? AND usage_date = ?"
        ).bind(user.id, usageDate).first(),
        env.DB.prepare(
          "SELECT COUNT(*) AS model_calls, COALESCE(SUM(CAST(json_extract(e.payload_json, '$.totalTokens') AS INTEGER)), 0) AS total_tokens, COALESCE(SUM(CAST(json_extract(e.payload_json, '$.costCredits') AS REAL)), 0) AS cost_credits, COUNT(json_extract(e.payload_json, '$.costCredits')) AS cost_records FROM session_events e INNER JOIN work_sessions s ON s.id = e.session_id WHERE s.owner_id = ? AND e.event_type = 'MODEL_USAGE_RECORDED' AND date(e.occurred_at) = ?"
        ).bind(user.id, usageDate).first()
      ]);
      const runsStarted = usage?.runs_started ?? 0;
      return json({
        usageDate, runsStarted, dailyLimit, remaining: Math.max(0, dailyLimit - runsStarted),
        modelCalls: modelUsage?.model_calls ?? 0,
        totalTokens: modelUsage?.total_tokens ?? 0,
        costCredits: modelUsage?.cost_credits ?? 0,
        costRecords: modelUsage?.cost_records ?? 0,
        resetTimezone: "UTC"
      });
    }

    if (url.pathname === "/api/playbooks" && request.method === "GET") {
      const result = await env.DB.prepare(
        "SELECT id, name, task_type, description, objective_template, requirements_json, constraints_json, created_at, updated_at FROM user_playbooks WHERE owner_id = ? ORDER BY updated_at DESC"
      ).bind(user.id).all();
      return json({ playbooks: (result.results ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        taskType: item.task_type,
        description: item.description,
        objectiveTemplate: item.objective_template,
        requirements: JSON.parse(item.requirements_json || "[]"),
        constraints: JSON.parse(item.constraints_json || "[]"),
        createdAt: item.created_at,
        updatedAt: item.updated_at
      })) });
    }

    if (url.pathname === "/api/playbooks" && request.method === "POST") {
      let body;
      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > 20_000) return error("PAYLOAD_TOO_LARGE", "Playbooks must be smaller than 20 KB.", 413);
      try { body = JSON.parse(raw); } catch { return error("INVALID_JSON", "Provide a valid playbook.", 400); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return error("INVALID_PLAYBOOK", "Provide a playbook object.", 400);
      const allowedTypes = new Set(["CODE","RESEARCH","DOCUMENT","BUSINESS","CREATIVE","OTHER"]);
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const taskType = typeof body.taskType === "string" ? body.taskType.toUpperCase() : "";
      const description = typeof body.description === "string" ? body.description.trim() : "";
      const objectiveTemplate = typeof body.objectiveTemplate === "string" ? body.objectiveTemplate.trim() : "";
      if (name.length > 80 || description.length > 500 || objectiveTemplate.length > 3000) return error("INVALID_PLAYBOOK", "Playbook name, description or objective exceeds its allowed length.", 400);
      if (body.requirements !== undefined && (!Array.isArray(body.requirements) || body.requirements.length > 20)) return error("INVALID_PLAYBOOK", "A playbook can contain no more than 20 acceptance criteria.", 400);
      if (body.constraints !== undefined && (!Array.isArray(body.constraints) || body.constraints.length > 20)) return error("INVALID_PLAYBOOK", "A playbook can contain no more than 20 constraints.", 400);
      if ((body.requirements || []).some((item) => typeof item !== "string" || item.trim().length > 500)) return error("INVALID_PLAYBOOK", "Each acceptance criterion must be text no longer than 500 characters.", 400);
      if ((body.constraints || []).some((item) => typeof item !== "string" || item.trim().length > 500)) return error("INVALID_PLAYBOOK", "Each constraint must be text no longer than 500 characters.", 400);
      const requirements = Array.isArray(body.requirements) ? body.requirements.filter((item) => item.trim()).map((item) => item.trim()) : [];
      const constraints = Array.isArray(body.constraints) ? body.constraints.filter((item) => item.trim()).map((item) => item.trim()) : [];
      if (!name || !allowedTypes.has(taskType) || !objectiveTemplate) {
        return error("INVALID_PLAYBOOK", "A name, supported work type and objective template are required.", 400);
      }
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await env.DB.prepare(
        "INSERT INTO user_playbooks (id, owner_id, name, task_type, description, objective_template, requirements_json, constraints_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(id, user.id, name, taskType, description, objectiveTemplate, JSON.stringify(requirements), JSON.stringify(constraints), now, now).run();
      return json({ playbook: { id, name, taskType, description, objectiveTemplate, requirements, constraints, createdAt: now, updatedAt: now } }, 201);
    }

    const playbookMatch = url.pathname.match(/^\/api\/playbooks\/([^/]+)$/);
    if (playbookMatch && request.method === "DELETE") {
      const playbookId = decodeURIComponent(playbookMatch[1]);
      const result = await env.DB.prepare(
        "DELETE FROM user_playbooks WHERE id = ? AND owner_id = ?"
      ).bind(playbookId, user.id).run();
      if ((result.meta?.changes ?? 0) !== 1) return error("PLAYBOOK_NOT_FOUND", "The requested playbook was not found.", 404);
      return json({ deleted: true, id: playbookId });
    }

    if (url.pathname === "/api/sessions" && request.method === "GET") {
      return json({ sessions: await listSessions(env, user.id) });
    }
    if (url.pathname === "/api/sessions" && request.method === "POST") {
      return createWorkSession(request, env, user);
    }

    const verifyArtifactMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/artifacts\/([^/]+)\/verify$/);
    if (verifyArtifactMatch && request.method === "POST") {
      const sessionId = decodeURIComponent(verifyArtifactMatch[1]);
      const artifactId = decodeURIComponent(verifyArtifactMatch[2]);
      const artifact = await env.DB.prepare(
        "SELECT a.id, a.object_key, a.content_hash FROM artifacts a INNER JOIN work_sessions s ON s.id = a.session_id WHERE a.id = ? AND a.session_id = ? AND s.owner_id = ?"
      ).bind(artifactId, sessionId, user.id).first();
      if (!artifact) return error("ARTIFACT_NOT_FOUND", "The requested artifact was not found.", 404);
      const object = await env.ARTIFACTS.get(artifact.object_key);
      if (!object) return error("ARTIFACT_CONTENT_MISSING", "The artifact content is unavailable.", 404);
      const content = await object.text();
      const computedHash = await sha256Hex(content);
      const matches = computedHash === artifact.content_hash;
      const now = new Date().toISOString();
      const integrity = {
        artifactId,
        status: matches ? "VERIFIED" : "REFUTED",
        storedHash: artifact.content_hash,
        computedHash,
        matches,
        method: "SHA-256 recomputation against stored artifact metadata",
        checkedAt: now
      };
      await env.DB.batch([
        env.DB.prepare(
          "INSERT OR IGNORE INTO evidence_records (id, session_id, claim, status, source_type, source_ref, details_json, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(
          "integrity-" + artifactId,
          sessionId,
          "R2 artifact content matches its stored SHA-256 fingerprint.",
          matches ? "VERIFIED" : "REFUTED",
          "R2_SHA256_RECOMPUTATION",
          "r2://" + artifact.object_key,
          JSON.stringify(integrity),
          now
        ),
        env.DB.prepare(
          "INSERT OR IGNORE INTO session_events (id, session_id, event_type, payload_json, occurred_at) VALUES (?, ?, ?, ?, ?)"
        ).bind("integrity-event-" + artifactId, sessionId, "ARTIFACT_INTEGRITY_CHECKED", JSON.stringify(integrity), now)
      ]);
      return json({ integrity });
    }

    const artifactMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/artifacts\/([^/]+)$/);
    if (artifactMatch && request.method === "GET") {
      const sessionId = decodeURIComponent(artifactMatch[1]);
      const artifactId = decodeURIComponent(artifactMatch[2]);
      const artifact = await env.DB.prepare(
        "SELECT a.id, a.object_key, a.content_hash, a.kind, a.version FROM artifacts a INNER JOIN work_sessions s ON s.id = a.session_id WHERE a.id = ? AND a.session_id = ? AND s.owner_id = ?"
      ).bind(artifactId, sessionId, user.id).first();
      if (!artifact) return error("ARTIFACT_NOT_FOUND", "The requested artifact was not found.", 404);
      const object = await env.ARTIFACTS.get(artifact.object_key);
      if (!object) return error("ARTIFACT_CONTENT_MISSING", "The artifact content is unavailable.", 404);
      return json({ artifact: { id: artifact.id, kind: artifact.kind, version: artifact.version, contentHash: artifact.content_hash }, content: await object.text() });
    }

    const decisionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/decision$/);
    if (decisionMatch && request.method === "POST") {
      const sessionId = decodeURIComponent(decisionMatch[1]);
      let body;
      try { body = await request.json(); } catch { return error("INVALID_JSON", "Provide an APPROVE or REJECT decision.", 400); }
      const decision = typeof body.decision === "string" ? body.decision.toUpperCase() : "";
      if (!["APPROVE", "REJECT"].includes(decision)) {
        return error("INVALID_DECISION", "Decision must be APPROVE or REJECT.", 400);
      }
      const now = new Date().toISOString();
      const nextStatus = decision === "APPROVE" ? "COMPLETED" : "CANCELLED";
      const update = await env.DB.prepare(
        "UPDATE work_sessions SET status = ?, version = version + 1, updated_at = ? WHERE id = ? AND owner_id = ? AND status = 'AWAITING_APPROVAL'"
      ).bind(nextStatus, now, sessionId, user.id).run();
      if ((update.meta?.changes ?? 0) !== 1) {
        return error("DECISION_NOT_ALLOWED", "This session is no longer awaiting a decision.", 409);
      }
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO approvals (id, session_id, action, status, requested_at, decided_at, decided_by) VALUES (?, ?, ?, ?, ?, ?, ?)"
        ).bind(crypto.randomUUID(), sessionId, decision, decision === "APPROVE" ? "APPROVED" : "REJECTED", now, now, user.id),
        env.DB.prepare(
          "INSERT INTO session_events (id, session_id, event_type, payload_json, occurred_at) VALUES (?, ?, ?, ?, ?)"
        ).bind(crypto.randomUUID(), sessionId, decision === "APPROVE" ? "HUMAN_APPROVED" : "HUMAN_REJECTED",
          JSON.stringify({ decision, resultingStatus: nextStatus, decidedBy: user.id }), now)
      ]);
      return json({ sessionId, decision, status: nextStatus });
    }

    const match = url.pathname.match(/^\/api\/sessions\/([^/]+)(?:\/(start))?$/);
    if (match) {
      const sessionId = decodeURIComponent(match[1]);
      const action = match[2] ?? null;
      const session = await env.DB.prepare(
        "SELECT * FROM work_sessions WHERE id = ? AND owner_id = ?"
      ).bind(sessionId, user.id).first();
      if (!session) return error("SESSION_NOT_FOUND", "The requested session was not found.", 404);

      if (action === "start" && request.method === "POST") {
        if (!["CREATED", "BLOCKED"].includes(session.status)) {
          return error("INVALID_SESSION_STATE", "This session cannot start from " + session.status + ".", 409);
        }

        const usageDate = new Date().toISOString().slice(0, 10);
        const now = new Date().toISOString();
        const dailyLimit = Math.max(1, Math.min(50, Number(env.MAX_DAILY_AI_RUNS) || 10));
        const usageReservation = await env.DB.prepare(
          "INSERT INTO user_daily_usage (user_id, usage_date, runs_started, created_at, updated_at) VALUES (?, ?, 1, ?, ?) ON CONFLICT(user_id, usage_date) DO UPDATE SET runs_started = runs_started + 1, updated_at = excluded.updated_at WHERE runs_started < ? RETURNING runs_started"
        ).bind(user.id, usageDate, now, now, dailyLimit).first();
        if (!usageReservation) {
          return error("DAILY_RUN_LIMIT_REACHED", "You have used today's " + dailyLimit + " AI runs. Your saved work is safe; the allowance resets at midnight UTC.", 429);
        }

        let claim;
        try {
          claim = await env.DB.prepare(
            "UPDATE work_sessions SET status = 'UNDERSTANDING', version = version + 1, updated_at = ? WHERE id = ? AND owner_id = ? AND status IN ('CREATED','BLOCKED')"
          ).bind(new Date().toISOString(), session.id, user.id).run();
        } catch (claimError) {
          await releaseDailyRunReservation(env, user.id, usageDate);
          throw claimError;
        }
        if ((claim.meta?.changes ?? 0) !== 1) {
          await releaseDailyRunReservation(env, user.id, usageDate);
          return error("SESSION_ALREADY_RUNNING", "This session has already been started or changed.", 409);
        }

        const instanceId = session.id + "-run-" + (session.version + 1);
        let instance;
        try {
          instance = await env.OUTPERFORM_WORKFLOW.create({
            id: instanceId,
            params: { sessionId: session.id, userId: user.id }
          });
        } catch (workflowError) {
          await env.DB.prepare(
            "UPDATE work_sessions SET status = ?, version = version + 1, updated_at = ? WHERE id = ? AND owner_id = ? AND status = 'UNDERSTANDING'"
          ).bind(session.status, new Date().toISOString(), session.id, user.id).run();
          await releaseDailyRunReservation(env, user.id, usageDate);
          throw workflowError;
        }

        try {
          await env.DB.prepare(
            "INSERT INTO session_events (id, session_id, event_type, payload_json, occurred_at) VALUES (?, ?, ?, ?, ?)"
          ).bind(crypto.randomUUID(), session.id, "WORKFLOW_STARTED",
            JSON.stringify({ workflowInstanceId: instance.id }), new Date().toISOString()).run();
        } catch (eventError) {
          console.error("OUTPERFORM workflow started but event ledger write failed", {
            sessionId: session.id, workflowInstanceId: instance.id, message: eventError.message
          });
        }
        return json({
          workflowInstanceId: instance.id,
          status: "STARTED",
          usage: { runsStarted: usageReservation.runs_started, dailyLimit, usageDate }
        }, 202);
      }

      if (action === null && request.method === "GET") {
        const [artifacts, requirements, constraints, events] = await Promise.all([
          env.DB.prepare("SELECT id, kind, object_key, content_hash, parent_artifact_id, created_by, version, created_at FROM artifacts WHERE session_id = ? ORDER BY version DESC").bind(sessionId).all(),
          env.DB.prepare("SELECT id, description, source, mandatory, verification_method FROM requirements WHERE session_id = ? ORDER BY created_at").bind(sessionId).all(),
          env.DB.prepare("SELECT id, description, constraint_type, created_at FROM session_constraints WHERE session_id = ? ORDER BY created_at").bind(sessionId).all(),
          env.DB.prepare("SELECT event_type, payload_json, occurred_at FROM session_events WHERE session_id = ? ORDER BY occurred_at").bind(sessionId).all()
        ]);
        return json({
          session: {
            id: session.id, status: session.status, taskType: session.task_type,
            objective: session.objective, bestArtifactId: session.best_artifact_id,
            createdAt: session.created_at, updatedAt: session.updated_at
          },
          artifacts: artifacts.results ?? [],
          requirements: requirements.results ?? [],
          constraints: constraints.results ?? [],
          events: (events.results ?? []).map((event) => ({
            ...event, payload: JSON.parse(event.payload_json)
          }))
        });
      }
    }
    return error("NOT_FOUND", "API route not found.", 404);
  }
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await handleApi(request, env);
    } catch (e) {
      console.error("OUTPERFORM request failed", { code: e.code ?? "UNEXPECTED_ERROR", message: e.message });
      return error("INTERNAL_ERROR", "The request could not be completed.", 500);
    }
  }
};
