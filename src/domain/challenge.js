import { invariant } from "./errors.js";

export const CHALLENGE_STRATEGIES = Object.freeze([
  "INDEPENDENT_SOLUTION",
  "ADVERSARIAL_REVIEW",
  "CONFIDENCE_CHALLENGE",
  "COMPETITIVE_PROVOCATION",
  "REVERSE_FRAMING",
  "SECOND_LOOK",
  "DOMAIN_SPECIALIST_REVIEW",
  "COUNTEREXAMPLE_GENERATION",
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
  COUNTEREXAMPLE_GENERATION: 0.8,
  NO_CHALLENGE: 0.1
});

const TASK_BONUS = Object.freeze({
  CODE: { ADVERSARIAL_REVIEW: 0.08, COUNTEREXAMPLE_GENERATION: 0.1, INDEPENDENT_SOLUTION: 0.06 },
  RESEARCH: { COUNTEREXAMPLE_GENERATION: 0.12, DOMAIN_SPECIALIST_REVIEW: 0.1, INDEPENDENT_SOLUTION: 0.06 },
  DOCUMENT: { ADVERSARIAL_REVIEW: 0.08, SECOND_LOOK: 0.08, REVERSE_FRAMING: 0.04 },
  CREATIVE: { INDEPENDENT_SOLUTION: 0.1, REVERSE_FRAMING: 0.08, SECOND_LOOK: 0.06 }
});

const COST = Object.freeze({
  INDEPENDENT_SOLUTION: 1,
  ADVERSARIAL_REVIEW: 1,
  CONFIDENCE_CHALLENGE: 1,
  COMPETITIVE_PROVOCATION: 1,
  REVERSE_FRAMING: 1,
  SECOND_LOOK: 1,
  DOMAIN_SPECIALIST_REVIEW: 1,
  COUNTEREXAMPLE_GENERATION: 1,
  NO_CHALLENGE: 0
});

const CHALLENGE_INSTRUCTIONS = Object.freeze({
  INDEPENDENT_SOLUTION: Object.freeze({
    includePrimary: false,
    instructions: "Solve the brief independently from the user's objective, context, requirements and constraints. You have not seen the primary candidate. Do not imitate an unseen answer; produce a complete, independently reasoned alternative."
  }),
  ADVERSARIAL_REVIEW: Object.freeze({
    includePrimary: true,
    instructions: "Actively try to falsify the primary candidate. Find its strongest weaknesses, contradictions, missing cases and ways it could fail. Then produce a complete alternative that fixes those weaknesses rather than returning critique alone."
  }),
  CONFIDENCE_CHALLENGE: Object.freeze({
    includePrimary: true,
    instructions: "Interrogate the primary candidate's confidence. Identify unsupported assumptions, fragile claims, uncertain dependencies and places where confidence exceeds evidence. Produce a complete alternative that makes uncertainty explicit and avoids overstating certainty."
  }),
  COMPETITIVE_PROVOCATION: Object.freeze({
    includePrimary: true,
    instructions: "Create a genuinely competitive alternative designed to outperform the primary candidate on correctness, completeness, clarity, usefulness and constraint adherence. Avoid superficial paraphrasing; change the approach where that creates a stronger result."
  }),
  REVERSE_FRAMING: Object.freeze({
    includePrimary: true,
    instructions: "Reverse the primary candidate's central assumptions and framing. Explore the strongest plausible opposite approach, test whether it solves the objective better, and produce the best practical alternative. Do not reverse assumptions merely for novelty."
  }),
  SECOND_LOOK: Object.freeze({
    includePrimary: true,
    instructions: "Perform a disciplined second pass over the primary candidate. Look for overlooked requirements, edge cases, contradictions, omissions, ambiguous instructions and practical friction. Produce a complete alternative that closes the most important gaps."
  }),
  DOMAIN_SPECIALIST_REVIEW: Object.freeze({
    includePrimary: true,
    instructions: "Apply a rigorous domain-specialist lens appropriate to the task. Examine relevant standards, terminology, failure modes and professional trade-offs from model knowledge. Do not claim to be a human specialist or to have checked current external standards; flag anything requiring external validation."
  }),
  COUNTEREXAMPLE_GENERATION: Object.freeze({
    includePrimary: true,
    instructions: "Generate concrete counterexamples, adversarial scenarios and boundary cases that could invalidate the primary candidate. Use internal reasoning only: no external search or source retrieval is available in this workflow. Produce a complete alternative that addresses the strongest counterexamples and clearly labels unverified assumptions."
  })
});

export function buildChallengeInstructions(strategy) {
  const selected = CHALLENGE_INSTRUCTIONS[strategy];
  invariant(selected, "INVALID_CHALLENGE_STRATEGY", "The selected challenge strategy is not implemented.");
  return Object.freeze({ strategy, ...selected });
}

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
    
    .map((strategy) => {
      const raw = (BASE_VALUE[strategy] + (taskBonuses[strategy] ?? 0)) *
        (0.65 + uncertainty * 0.7) * riskMultiplier;
      const estimatedCost = COST[strategy];
      return {
        strategy,
        estimatedCost,
        expectedValue: Math.min(1, Number(raw.toFixed(3))),
        requiresIndependentContext: strategy === "INDEPENDENT_SOLUTION",
        toolCallsRequired: 0
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
      requiresIndependentContext: false,
      toolCallsRequired: 0
    };
  }

  const selected = candidates[0];
  return {
    ...selected,
    rationale: `Selected for ${taskType.toLowerCase()} work with ${risk.toLowerCase()} risk and uncertainty ${uncertainty.toFixed(2)}; ranked by expected value relative to estimated cost.`
  };
}
