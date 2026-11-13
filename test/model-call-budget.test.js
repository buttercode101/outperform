import test from "node:test";
import assert from "node:assert/strict";
import { countModelCallAttempts, reserveModelCall } from "../worker/model-call-budget.js";

function createMemoryDatabase() {
  const events = [];
  return {
    events,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async run() {
              assert.match(sql, /INSERT INTO session_events/);
              const [id, sessionId, payload, occurredAt, countSessionId, limit] = values;
              const count = events.filter(event =>
                event.session_id === countSessionId && event.event_type === "MODEL_CALL_STARTED"
              ).length;
              if (count >= limit) return { meta: { changes: 0 } };
              events.push({
                id,
                session_id: sessionId,
                event_type: "MODEL_CALL_STARTED",
                payload_json: payload,
                occurred_at: occurredAt
              });
              return { meta: { changes: 1 } };
            },
            async first() {
              assert.match(sql, /SELECT COUNT\(\*\) AS count/);
              const [sessionId] = values;
              return {
                count: events.filter(event =>
                  event.session_id === sessionId && event.event_type === "MODEL_CALL_STARTED"
                ).length
              };
            }
          };
        }
      };
    }
  };
}

test("provider request reservations enforce the exact per-session maximum", async () => {
  const db = createMemoryDatabase();
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const count = await reserveModelCall(db, {
      sessionId: "session-a",
      stage: "PRIMARY",
      model: "provider/model",
      maxModelCalls: 5,
      now: "2026-11-13T00:00:00.000Z"
    });
    assert.equal(count, attempt);
  }
  await assert.rejects(
    reserveModelCall(db, {
      sessionId: "session-a",
      stage: "FINAL_REVIEW",
      model: "provider/model",
      maxModelCalls: 5
    }),
    { code: "MODEL_BUDGET_EXHAUSTED" }
  );
  assert.equal(await countModelCallAttempts(db, "session-a"), 5);
});

test("provider request budgets are isolated by session", async () => {
  const db = createMemoryDatabase();
  await reserveModelCall(db, {
    sessionId: "session-a", stage: "PRIMARY", model: "a", maxModelCalls: 1
  });
  await reserveModelCall(db, {
    sessionId: "session-b", stage: "PRIMARY", model: "b", maxModelCalls: 1
  });
  assert.equal(await countModelCallAttempts(db, "session-a"), 1);
  assert.equal(await countModelCallAttempts(db, "session-b"), 1);
});

test("reservation records the provider stage, model and request mode", async () => {
  const db = createMemoryDatabase();
  await reserveModelCall(db, {
    sessionId: "session-a",
    stage: "FINAL_REVIEW",
    model: "provider/reviewer",
    maxModelCalls: 2,
    mode: "STRUCTURED_JSON",
    now: "2026-11-13T00:00:00.000Z"
  });
  const payload = JSON.parse(db.events[0].payload_json);
  assert.deepEqual(payload, {
    stage: "FINAL_REVIEW",
    model: "provider/reviewer",
    mode: "STRUCTURED_JSON",
    maxModelCalls: 2
  });
});

test("invalid budgets are rejected before reserving a provider request", async () => {
  const db = createMemoryDatabase();
  await assert.rejects(
    reserveModelCall(db, {
      sessionId: "session-a", stage: "PRIMARY", model: "provider/model", maxModelCalls: 6
    }),
    { code: "INVALID_MODEL_BUDGET" }
  );
  assert.equal(db.events.length, 0);
});
