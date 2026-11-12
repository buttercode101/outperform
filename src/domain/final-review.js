export function buildFinalReviewPrompt({
  objective,
  taskType,
  taskMethod,
  criteriaText,
  constraints = [],
  riskAssessment,
  qualityGate,
  finalContent
}) {
  const constraintsText = constraints.length
    ? constraints.map((item) => `- [${item.type || "OTHER"}] ${item.description}`).join("\n")
    : "(No additional constraints supplied)";

  return [
    `OBJECTIVE: ${objective}`,
    `TASK TYPE: ${taskType}`,
    `TASK-SPECIFIC METHOD: ${taskMethod}`,
    "",
    criteriaText,
    "",
    "CONSTRAINTS:",
    constraintsText,
    "",
    "HEURISTIC RISK ASSESSMENT:",
    JSON.stringify(riskAssessment),
    "",
    "DETERMINISTIC QUALITY GATE:",
    JSON.stringify(qualityGate),
    "",
    "FINAL ARTIFACT:",
    finalContent,
    "",
    "Assess how well the artifact addresses each requirement and constraint, use the mechanical check results as limited signals rather than proof of correctness, identify remaining gaps and flag claims needing external verification.",
    "OUTPUT CONTRACT: Return one valid JSON object with keys assessment, criteriaCoverage, remainingRisks and unverifiedClaims. Do not wrap the object in Markdown fences or add prose outside it.",
    "CRITERIA COVERAGE: Include one criteriaCoverage entry for every explicit user requirement and every material constraint. Each entry must identify the requirement, use status MET, PARTIAL, NOT_MET or UNVERIFIED, explain the rationale, and cite a specific section or say no supporting evidence was found. Never omit a requirement. Use UNVERIFIED rather than guessing.",
    "INTEGRITY: This is a model review, not an external test. Never claim code was executed, sources were checked, or facts were independently verified unless the supplied evidence explicitly demonstrates that."
  ].join("\n");
}
