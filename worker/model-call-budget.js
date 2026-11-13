const COUNT_SQL = `
  SELECT COUNT(*) AS count
  FROM session_events
  WHERE session_id = ? AND event_type = 'MODEL_CALL_STARTED'
`;

const RESERVE_SQL = `
  INSERT INTO session_events (id, session_id, event_type, payload_json, occurred_at)
  SELECT ?, ?, 'MODEL_CALL_STARTED', ?, ?
  WHERE (
    SELECT COUNT(*)
    FROM session_events
    WHERE session_id = ? AND event_type = 'MODEL_CALL_STARTED'
  ) < ?
`;

export async function countModelCallAttempts(db, sessionId) {
  if (!db?.prepare || typeof sessionId !== "string" || !sessionId) {
    throw new TypeError("A database binding and session ID are required.");
  }
  const row = await db.prepare(COUNT_SQL).bind(sessionId).first();
  return Number(row?.count ?? 0);
}

export async function reserveModelCall(db, {
  sessionId,
  stage,
  model,
  maxModelCalls,
  mode = "TEXT",
  now = new Date().toISOString()
}) {
  const limit = Number(maxModelCalls);
  if (!db?.prepare || typeof sessionId !== "string" || !sessionId) {
    throw new TypeError("A database binding and session ID are required.");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 5) {
    const error = new Error("The session model-request budget must be an integer from 1 to 5.");
    error.code = "INVALID_MODEL_BUDGET";
    throw error;
  }

  const result = await db.prepare(RESERVE_SQL).bind(
    crypto.randomUUID(),
    sessionId,
    JSON.stringify({ stage, model, mode, maxModelCalls: limit }),
    now,
    sessionId,
    limit
  ).run();

  const changes = Number(result?.meta?.changes ?? result?.changes ?? 0);
  if (changes !== 1) {
    const error = new Error(`The session has reached its limit of ${limit} provider request attempts.`);
    error.code = "MODEL_BUDGET_EXHAUSTED";
    throw error;
  }
  return countModelCallAttempts(db, sessionId);
}
