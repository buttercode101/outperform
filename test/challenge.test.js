import test from "node:test";
import assert from "node:assert/strict";
import { planChallenge, buildChallengeInstructions } from "../src/domain/challenge.js";

test("selects a challenge appropriate to code work", () => {
  const plan = planChallenge({ taskType: "CODE", risk: "HIGH", uncertainty: 0.8 });
  assert.ok(["ADVERSARIAL_REVIEW", "COUNTEREXAMPLE_GENERATION", "INDEPENDENT_SOLUTION", "SECOND_LOOK", "CONFIDENCE_CHALLENGE"].includes(plan.strategy));
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


test("each advertised challenge strategy has a distinct executable instruction set", () => {
  const strategies = [
    "INDEPENDENT_SOLUTION", "ADVERSARIAL_REVIEW", "CONFIDENCE_CHALLENGE",
    "COMPETITIVE_PROVOCATION", "REVERSE_FRAMING", "SECOND_LOOK",
    "DOMAIN_SPECIALIST_REVIEW", "COUNTEREXAMPLE_GENERATION"
  ];
  const instructions = strategies.map(strategy => buildChallengeInstructions(strategy));
  assert.equal(new Set(instructions.map(item => item.instructions)).size, strategies.length);
  assert.equal(instructions[0].includePrimary, false);
  assert.ok(instructions.slice(1).every(item => item.includePrimary));
});

test("counterexample generation is explicitly model-only and does not claim external search", () => {
  const spec = buildChallengeInstructions("COUNTEREXAMPLE_GENERATION");
  assert.equal(spec.includePrimary, true);
  assert.match(spec.instructions, /internal reasoning only/i);
  assert.match(spec.instructions, /no external search/i);
});

test("every implemented challenge consumes one bounded model call", () => {
  const plan = planChallenge({
    taskType: "CODE",
    remainingModelCalls: 1,
    remainingToolCalls: 0,
    allowedStrategies: ["COUNTEREXAMPLE_GENERATION"]
  });
  assert.equal(plan.strategy, "COUNTEREXAMPLE_GENERATION");
  assert.equal(plan.estimatedCost, 1);
});

test("unimplemented legacy search strategy is rejected rather than silently simulated", () => {
  assert.throws(() => buildChallengeInstructions("COUNTEREXAMPLE_SEARCH"), {
    code: "INVALID_CHALLENGE_STRATEGY"
  });
});
