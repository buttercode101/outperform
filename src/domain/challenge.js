import { invariant } from "./errors.js";

export const CHALLENGE_STRATEGIES = Object.freeze([
  "INDEPENDENT_SOLUTION",
  "ADVERSARIAL_REVIEW",
  "CONFIDENCE_CHALLENGE",
  "COMPETITIVE_PROVOCATION",
  "REVERSE_FRAMING",
  "SECOND_LOOK",
  "DOMAIN_SPECIALIST_REVIEW",
  "COUNTEREXAMPLE_SEARCH",
  "NO_CHALLENGE"
]);

const BASE_VALUE = Object.freeze({
  INDEPENDENT_SOLUTION: 0.78,
  ADVERSARIAL_REVIEW: 0.86,
  CONFIDENCE_CHALLENGE: 0.54,
  COMPETITIVE_PROVOCATION: 0.38,
  REVERSE_FRAMING: 0.48,
  SECOND_LOOK: 0.62,
  DOMAIN_SPECIALIST_REVIEW: 0.72,
  COUNTEREXAMPLE_SEARCH: 0.8,
  NO_CHALLENGE: 0.1
});

const TASK_BONUS = Object.freeze({
  CODE: { ADVERSARIAL_REVIEW: 0.08, COUNTEREXAMPLE_SEARCH: 0.1, INDEPENDENT_SOLUTION: 0.06 },
  RESEARCH: { COUNTEREXAMPLE_SEARCH: 0.12, DOMAIN_SPECIALIST_REVIEW: 0.1, INDEPENDENT_SOLUTION: 0.06 },
  DOCUMENT: { ADVERSARIAL_REVIEW: 0.08, SECOND_LOOK: 0.08, REVERSE_FRAMING: 0.04 },
  CREATIVE: { INDEPENDENT_SOLUTION: 0.1, REVERSE_FRAMING: 0.08, SECOND_LOOK: 0.06 }
});

const COST = Object.freeze({
  INDEPENDENT_SOLUTION: 3,
  ADVERSARIAL_REVIEW: 2,
  CONFIDENCE_CHALLENGE: 1,
  COMPETITIVE_PROVOCATION: 1,
  REVERSE_FRAMING: 1,
  SECOND_LOOK: 1,
  DOMAIN_SPECIALIST_REVIEW: 3,
  COUNTEREXAMPLE_SEARCH: 2,
  NO_CHALLENGE: 0
});

export function planChallenge({
  taskType,
  risk = "MEDIUM",
  uncertainty = 0.5,
  remainingModelCalls = 3,
  remainingToolCalls = 4,
  expectedBenefitThreshold = 0.35,
  allowedStrategies = CHALLENGE_STRATEGIES
}) {
  invariant(typeof taskType === "string" && taskType.trim(), "INVALID_TASK_TYPE", "taskType is required.");
  invariant(["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(risk), "INVALID_RISK", "Unknown risk level.");
  invariant(Number.isFinite(uncertainty) && uncertainty >= 0 && uncertainty <= 1,
    "INVALID_UNCERTAINTY", "uncertainty must be between 0 and 1.");
  invariant(Number.isInteger(remainingModelCalls) && remainingModelCalls >= 0,
    "INVALID_BUDGET", "remainingModelCalls must be a non-negative integer.");
  invariant(Number.isInteger(remainingToolCalls) && remainingToolCalls >= 0,
    "INVALID_BUDGET", "remainingToolCalls must be a non-negative integer.");
  invariant(Array.isArray(allowedStrategies), "INVALID_STRATEGIES", "allowedStrategies must be an array.");

  const taskBonuses = TASK_BONUS[taskType.toUpperCase()] ?? {};
  const riskMultiplier = risk === "CRITICAL" ? 1.25 : risk === "HIGH" ? 1.15 : risk === "LOW" ? 0.85 : 1;
  const candidates = allowedStrategies
    .filter((strategy) => CHALLENGE_STRATEGIES.includes(strategy) && strategy !== "NO_CHALLENGE")
    .filter((strategy) => remainingModelCalls >= COST[strategy])
    .filter((strategy) => remainingToolCalls >= (strategy === "COUNTEREXAMPLE_SEARCH" ? 1 : 0))
    .map((strategy) => {
      const raw = (BASE_VALUE[strategy] + (taskBonuses[strategy] ?? 0)) *
        (0.65 + uncertainty * 0.7) * riskMultiplier;
      const estimatedCost = COST[strategy];
      return {
        strategy,
        estimatedCost,
        expectedValue: Math.min(1, Number(raw.toFixed(3))),
        requiresIndependentContext: ["INDEPENDENT_SOLUTION", "DOMAIN_SPECIALIST_REVIEW"].includes(strategy)
      };
    })
    .filter((candidate) => candidate.expectedValue >= expectedBenefitThreshold)
    .sort((a, b) => (b.expectedValue / Math.max(1, b.estimatedCost)) - (a.expectedValue / Math.max(1, a.estimatedCost)));

  if (remainingModelCalls === 0 || candidates.length === 0) {
    return {
      strategy: "NO_CHALLENGE",
      rationale: remainingModelCalls === 0 ? "No model-call budget remains." : "No allowed strategy clears the expected-benefit threshold.",
      expectedValue: 0,
      estimatedCost: 0,
      requiresIndependentContext: false
    };
  }

  const selected = candidates[0];
  return {
    ...selected,
    rationale: `Selected for ${taskType.toLowerCase()} work with ${risk.toLowerCase()} risk and uncertainty ${uncertainty.toFixed(2)}; ranked by expected value relative to estimated cost.`
  };
}
