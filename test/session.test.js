import test from "node:test";
import assert from "node:assert/strict";
import { createSession, transitionSession, allowedTransitions, isTerminalStatus } from "../src/domain/session.js";
import { DomainError } from "../src/domain/errors.js";

const input = {
  objective: "Improve a real deliverable and verify the result",
  taskType: "DOCUMENT",
  budget: { maxModelCalls: 8, maxWallClockSeconds: 300, maxToolCalls: 12 },
  requirements: [{ description: "Preserve the original artifact", mandatory: true }]
};

test("creates a session with explicit defaults and immutable top-level state", () => {
  const session = createSession(input, new Date("2026-01-01T00:00:00.000Z"));
  assert.equal(session.status, "CREATED");
  assert.equal(session.objective, input.objective);
  assert.equal(session.requirements.length, 1);
  assert.equal(session.version, 1);
  assert.ok(Object.isFrozen(session));
});

test("rejects missing objective and invalid budgets", () => {
  assert.throws(() => createSession({ ...input, objective: " " }), DomainError);
  assert.throws(() => createSession({ ...input, budget: { maxModelCalls: 0, maxWallClockSeconds: 20 } }), DomainError);
});

test("allows valid transitions and increments version", () => {
  const first = createSession(input);
  const next = transitionSession(first, "UNDERSTANDING");
  assert.equal(next.status, "UNDERSTANDING");
  assert.equal(next.version, 2);
});

test("rejects skipping required workflow stages", () => {
  const session = createSession(input);
  assert.throws(() => transitionSession(session, "COMPLETED"), { code: "INVALID_TRANSITION" });
});

test("terminal sessions cannot transition", () => {
  let session = createSession(input);
  session = transitionSession(session, "CANCELLED");
  assert.equal(isTerminalStatus(session.status), true);
  assert.deepEqual(allowedTransitions(session.status), []);
  assert.throws(() => transitionSession(session, "EXECUTING"), { code: "INVALID_TRANSITION" });
});

test("allows a reviewed result to become completed after human approval", () => {
  const created = createSession(input);
  const understanding = transitionSession(created, "UNDERSTANDING");
  const awaitingReview = transitionSession(understanding, "AWAITING_APPROVAL");
  const completed = transitionSession(awaitingReview, "COMPLETED");
  assert.equal(completed.status, "COMPLETED");
  assert.equal(isTerminalStatus(completed.status), true);
});
