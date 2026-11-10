import { randomUUID } from "node:crypto";
import { invariant } from "./errors.js";

export const SESSION_STATUSES = Object.freeze([
  "CREATED", "UNDERSTANDING", "BASELINING", "EXECUTING",
  "CHALLENGING", "EVALUATING", "IMPROVING", "VERIFYING",
  "AWAITING_APPROVAL", "BLOCKED", "COMPLETED", "FAILED",
  "CANCELLED", "ROLLING_BACK", "ROLLED_BACK"
]);

const TRANSITIONS = Object.freeze({
  CREATED: ["UNDERSTANDING", "CANCELLED"],
  UNDERSTANDING: ["BASELINING", "AWAITING_APPROVAL", "BLOCKED", "FAILED", "CANCELLED"],
  BASELINING: ["EXECUTING", "BLOCKED", "FAILED", "CANCELLED"],
  EXECUTING: ["CHALLENGING", "EVALUATING", "AWAITING_APPROVAL", "BLOCKED", "FAILED", "CANCELLED"],
  CHALLENGING: ["EVALUATING", "AWAITING_APPROVAL", "BLOCKED", "FAILED", "CANCELLED"],
  EVALUATING: ["IMPROVING", "VERIFYING", "AWAITING_APPROVAL", "BLOCKED", "FAILED", "CANCELLED"],
  IMPROVING: ["VERIFYING", "AWAITING_APPROVAL", "BLOCKED", "FAILED", "CANCELLED"],
  VERIFYING: ["COMPLETED", "IMPROVING", "ROLLING_BACK", "AWAITING_APPROVAL", "BLOCKED", "FAILED", "CANCELLED"],
  AWAITING_APPROVAL: ["UNDERSTANDING", "EXECUTING", "CHALLENGING", "EVALUATING", "IMPROVING", "VERIFYING", "COMPLETED", "CANCELLED", "BLOCKED"],
  BLOCKED: ["UNDERSTANDING", "BASELINING", "EXECUTING", "CHALLENGING", "EVALUATING", "IMPROVING", "VERIFYING", "CANCELLED", "FAILED"],
  ROLLING_BACK: ["ROLLED_BACK", "FAILED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
  ROLLED_BACK: []
});

const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED", "ROLLED_BACK"]);

function requiredText(value, field) {
  invariant(typeof value === "string" && value.trim().length > 0,
    "INVALID_FIELD", `${field} must be a non-empty string.`);
  return value.trim();
}

function validateBudget(budget) {
  invariant(budget && typeof budget === "object", "INVALID_BUDGET", "A budget is required.");
  for (const field of ["maxModelCalls", "maxWallClockSeconds"]) {
    invariant(Number.isInteger(budget[field]) && budget[field] > 0,
      "INVALID_BUDGET", `${field} must be a positive integer.`);
  }
  if (budget.maxToolCalls !== undefined) {
    invariant(Number.isInteger(budget.maxToolCalls) && budget.maxToolCalls >= 0,
      "INVALID_BUDGET", "maxToolCalls must be a non-negative integer.");
  }
  if (budget.maxCostMinorUnits !== undefined) {
    invariant(Number.isInteger(budget.maxCostMinorUnits) && budget.maxCostMinorUnits >= 0,
      "INVALID_BUDGET", "maxCostMinorUnits must be a non-negative integer.");
  }
}

export function createSession(input, now = new Date()) {
  invariant(input && typeof input === "object", "INVALID_INPUT", "Session input is required.");
  const objective = requiredText(input.objective, "objective");
  const taskType = requiredText(input.taskType, "taskType");
  validateBudget(input.budget);

  const requirements = (input.requirements ?? []).map((item, index) => {
    invariant(item && typeof item === "object", "INVALID_REQUIREMENT", "Each requirement must be an object.", { index });
    return {
      id: item.id ?? randomUUID(),
      description: requiredText(item.description, `requirements[${index}].description`),
      source: item.source ?? "USER",
      mandatory: item.mandatory ?? true,
      verificationMethod: item.verificationMethod ?? null
    };
  });

  return Object.freeze({
    id: randomUUID(),
    status: "CREATED",
    taskType,
    objective,
    requirements,
    constraints: (input.constraints ?? []).map((item) => ({
      id: item.id ?? randomUUID(),
      description: requiredText(item.description, "constraint.description"),
      type: item.type ?? "OTHER"
    })),
    budget: Object.freeze({ ...input.budget }),
    baselineArtifactId: null,
    bestArtifactId: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    version: 1
  });
}

export function transitionSession(session, nextStatus, now = new Date()) {
  invariant(session && typeof session === "object", "INVALID_SESSION", "Session is required.");
  invariant(SESSION_STATUSES.includes(nextStatus), "UNKNOWN_STATUS", "The requested session status is unknown.");
  const allowed = TRANSITIONS[session.status] ?? [];
  invariant(allowed.includes(nextStatus), "INVALID_TRANSITION",
    `Cannot transition session from ${session.status} to ${nextStatus}.`,
    { from: session.status, to: nextStatus });
  return Object.freeze({
    ...session,
    status: nextStatus,
    updatedAt: now.toISOString(),
    version: session.version + 1
  });
}

export function isTerminalStatus(status) {
  return TERMINAL.has(status);
}

export function allowedTransitions(status) {
  return [...(TRANSITIONS[status] ?? [])];
}
