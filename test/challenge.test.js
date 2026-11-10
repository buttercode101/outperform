import test from "node:test";
import assert from "node:assert/strict";
import { planChallenge } from "../src/domain/challenge.js";

test("selects a challenge appropriate to code work", () => {
  const plan = planChallenge({ taskType: "CODE", risk: "HIGH", uncertainty: 0.8 });
  assert.ok(["ADVERSARIAL_REVIEW", "COUNTEREXAMPLE_SEARCH", "INDEPENDENT_SOLUTION", "SECOND_LOOK", "CONFIDENCE_CHALLENGE"].includes(plan.strategy));
  assert.ok(plan.expectedValue > 0);
});

test("selects no challenge when no model-call budget remains", () => {
  const plan = planChallenge({ taskType: "RESEARCH", remainingModelCalls: 0 });
  assert.equal(plan.strategy, "NO_CHALLENGE");
});

test("respects explicitly allowed strategy set", () => {
  const plan = planChallenge({
    taskType: "DOCUMENT",
    allowedStrategies: ["COMPETITIVE_PROVOCATION"]
  });
  assert.equal(plan.strategy, "COMPETITIVE_PROVOCATION");
});

test("returns no challenge if no candidate meets the benefit threshold", () => {
  const plan = planChallenge({
    taskType: "UNKNOWN",
    expectedBenefitThreshold: 1,
    allowedStrategies: ["CONFIDENCE_CHALLENGE"]
  });
  assert.equal(plan.strategy, "NO_CHALLENGE");
});

test("rejects invalid uncertainty", () => {
  assert.throws(() => planChallenge({ taskType: "CODE", uncertainty: 1.2 }), {
    code: "INVALID_UNCERTAINTY"
  });
});
