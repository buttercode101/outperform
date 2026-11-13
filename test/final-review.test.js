import test from "node:test";
import assert from "node:assert/strict";
import { buildFinalReviewPrompt } from "../src/domain/final-review.js";

test("final review prompt includes acceptance criteria and explicit constraints", () => {
  const prompt = buildFinalReviewPrompt({
    objective: "Improve the onboarding workflow",
    taskType: "CODE",
    taskMethod: "Preserve existing interfaces and behaviour.",
    criteriaText: "USER REQUIREMENTS:\n- [MUST] Keep sign-in optional for guest tools",
    constraints: [
      { type: "SECURITY", description: "Never expose private workspace data to guests" },
      { type: "COMPATIBILITY", description: "Keep the current API response shape" }
    ],
    riskAssessment: { risk: "HIGH", uncertainty: 0.4 },
    qualityGate: { summary: { outcome: "REVIEW_REQUIRED" } },
    finalContent: "# Improved onboarding\nA reviewed deliverable."
  });

  assert.match(prompt, /Keep sign-in optional for guest tools/);
  assert.match(prompt, /Never expose private workspace data to guests/);
  assert.match(prompt, /Keep the current API response shape/);
  assert.match(prompt, /HEURISTIC RISK ASSESSMENT/);
  assert.match(prompt, /DETERMINISTIC QUALITY GATE/);
  assert.match(prompt, /# Improved onboarding/);
  assert.match(prompt, /OUTPUT CONTRACT/);
  assert.match(prompt, /one criteriaCoverage entry for every explicit user requirement/);
  assert.match(prompt, /Use UNVERIFIED rather than guessing/);
});

test("final review prompt clearly states when no additional constraints exist", () => {
  const prompt = buildFinalReviewPrompt({
    objective: "Improve a document",
    taskType: "DOCUMENT",
    taskMethod: "Preserve meaning.",
    criteriaText: "USER REQUIREMENTS:\n(No explicit requirements supplied)",
    constraints: [],
    riskAssessment: {},
    qualityGate: {},
    finalContent: "Final document"
  });
  assert.match(prompt, /No additional constraints supplied/);
});
