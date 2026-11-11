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

async function createWorkSession(request, env, user) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return error("UNSUPPORTED_MEDIA_TYPE", "Send the session brief as application/json.", 415);
  }
  const raw = await request.text();
  if (raw.length > 120_000) return error("PAYLOAD_TOO_LARGE", "The session brief must be smaller than 120 KB.", 413);
  let body;
  try { body = JSON.parse(raw); } catch { return error("INVALID_JSON", "The request body is not valid JSON.", 400); }

  const objective = typeof body.objective === "string" ? body.objective.trim() : "";
  const taskType = typeof body.taskType === "string" ? body.taskType.trim().toUpperCase() : "";
  const context = typeof body.context === "string" ? body.context.trim() : "";
  if (!objective || objective.length > 8_000) return error("INVALID_OBJECTIVE", "Provide an objective between 1 and 8,000 characters.", 400);
  if (!["CODE", "RESEARCH", "DOCUMENT", "BUSINESS", "CREATIVE", "OTHER"].includes(taskType)) {
    return error("INVALID_TASK_TYPE", "Choose a supported task type.", 400);
  }
  if (context.length > 100_000) return error("CONTEXT_TOO_LARGE", "Context must be smaller than 100 KB.", 413);

  const budget = normalizeSessionBudget(body.budget);
  const requirements = Array.isArray(body.requirements) ? body.requirements.slice(0, 30) : [];
  const constraints = Array.isArray(body.constraints) ? body.constraints.slice(0, 30) : [];
  let session;
  try {
    session = createSession({ objective, taskType, budget, requirements, constraints });
  } catch (e) {
    return error(e.code ?? "INVALID_SESSION", e.message, 400);
  }

  const usageDate = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const dailyLimit = Math.max(1, Math.min(50, Number(env.MAX_DAILY_SESSIONS) || 10));
  const usageReservation = await env.DB.prepare(
    "INSERT INTO user_daily_usage (user_id, usage_date, sessions_created, created_at, updated_at) VALUES (?, ?, 1, ?, ?) ON CONFLICT(user_id, usage_date) DO UPDATE SET sessions_created = sessions_created + 1, updated_at = excluded.updated_at WHERE sessions_created < ? RETURNING sessions_created"
  ).bind(user.id, usageDate, now, now, dailyLimit).first();
  if (!usageReservation) {
    return error("DAILY_SESSION_LIMIT_REACHED", "You have reached today's " + dailyLimit + " new-session limit. Your existing work remains available; try again after the UTC day resets.", 429);
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

  for (const constraint of session.constraints) {
    statements.push(env.DB.prepare(
      "INSERT INTO constraints (id, session_id, description, type, created_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(constraint.id, session.id, constraint.description, constraint.type, session.createdAt));
  }

    await env.DB.batch(statements);
  } catch (e) {
    if (contextObjectKey) await env.ARTIFACTS.delete(contextObjectKey);
    await env.DB.prepare(
      "UPDATE user_daily_usage SET sessions_created = MAX(0, sessions_created - 1), updated_at = ? WHERE user_id = ? AND usage_date = ?"
    ).bind(new Date().toISOString(), user.id, usageDate).run();
    throw e;
  }
  return json({ session: { id: session.id, status: session.status, taskType, objective, createdAt: session.createdAt }, usage: { sessionsCreated: usageReservation.sessions_created, dailyLimit, usageDate } }, 201);
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/health" && request.method === "GET") {
    return json({
      ok: true,
      service: "outperform-api",
      database: Boolean(env.DB),
      artifactStorage: Boolean(env.ARTIFACTS),
      durableWorkflow: Boolean(env.OUTPERFORM_WORKFLOW),
      authenticationConfigured: Boolean(env.BETTER_AUTH_SECRET),
      modelProviderConfigured: Boolean(env.OPENROUTER_API_KEY && env.OPENROUTER_MODEL),
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

    if (url.pathname === "/api/usage" && request.method === "GET") {
      const usageDate = new Date().toISOString().slice(0, 10);
      const dailyLimit = Math.max(1, Math.min(50, Number(env.MAX_DAILY_SESSIONS) || 10));
      const usage = await env.DB.prepare(
        "SELECT sessions_created FROM user_daily_usage WHERE user_id = ? AND usage_date = ?"
      ).bind(user.id, usageDate).first();
      return json({ usageDate, sessionsCreated: usage?.sessions_created ?? 0, dailyLimit, remaining: Math.max(0, dailyLimit - (usage?.sessions_created ?? 0)), resetTimezone: "UTC" });
    }

    if (url.pathname === "/api/sessions" && request.method === "GET") {
      return json({ sessions: await listSessions(env, user.id) });
    }
    if (url.pathname === "/api/sessions" && request.method === "POST") {
      return createWorkSession(request, env, user);
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
          return error("INVALID_SESSION_STATE", `This session cannot start from ${session.status}.`, 409);
        }
        const claim = await env.DB.prepare(
          "UPDATE work_sessions SET status = 'UNDERSTANDING', version = version + 1, updated_at = ? WHERE id = ? AND owner_id = ? AND status IN ('CREATED','BLOCKED')"
        ).bind(new Date().toISOString(), session.id, user.id).run();
        if ((claim.meta?.changes ?? 0) !== 1) {
          return error("SESSION_ALREADY_RUNNING", "This session has already been started or changed.", 409);
        }
        const instanceId = `${session.id}-run-${session.version + 1}`;
        try {
          const instance = await env.OUTPERFORM_WORKFLOW.create({
            id: instanceId,
            params: { sessionId: session.id, userId: user.id }
          });
          await env.DB.prepare(
            "INSERT INTO session_events (id, session_id, event_type, payload_json, occurred_at) VALUES (?, ?, ?, ?, ?)"
          ).bind(crypto.randomUUID(), session.id, "WORKFLOW_STARTED",
            JSON.stringify({ workflowInstanceId: instance.id }), new Date().toISOString()).run();
          return json({ workflowInstanceId: instance.id, status: "STARTED" }, 202);
        } catch (workflowError) {
          await env.DB.prepare(
            "UPDATE work_sessions SET status = ?, version = version + 1, updated_at = ? WHERE id = ? AND owner_id = ? AND status = 'UNDERSTANDING'"
          ).bind(session.status, new Date().toISOString(), session.id, user.id).run();
          throw workflowError;
        }
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
