import test from "node:test";
import assert from "node:assert/strict";
import { buildFollowUpContext } from "../src/domain/follow-up.js";

test("follow-up context carries forward source material, previous candidate and feedback", () => {
  const context = buildFollowUpContext({
    originalContext: "Original source notes",
    previousCandidate: "Previous improved deliverable",
    feedback: "Add measurable acceptance criteria"
  });
  assert.match(context, /Original source notes/);
  assert.match(context, /Previous improved deliverable/);
  assert.match(context, /Add measurable acceptance criteria/);
});

test("follow-up context rejects missing feedback and oversized payloads", () => {
  assert.throws(() => buildFollowUpContext({ feedback: " " }), { code: "FOLLOW_UP_FEEDBACK_REQUIRED" });
  assert.throws(() => buildFollowUpContext({ previousCandidate: "x".repeat(101000), feedback: "Make it shorter" }), { code: "FOLLOW_UP_CONTEXT_TOO_LARGE" });
});
