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
    "Assess how well the artifact addresses each requirement and constraint, use the mechanical check results as limited signals rather than proof of correctness, identify remaining gaps and flag claims needing external verification."
  ].join("\n");
}
