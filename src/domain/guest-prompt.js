export function buildGuestPrompt(item = {}) {
  const taskType = typeof item.taskType === "string" ? item.taskType : "OTHER";
  const objective = typeof item.objective === "string" ? item.objective.trim() : "";
  const context = typeof item.context === "string" ? item.context.trim() : "";
  const requirements = Array.isArray(item.requirements)
    ? item.requirements.filter((value) => typeof value === "string" && value.trim())
    : [];
  return [
    "# OUTPERFORM — Ready-to-use work improvement prompt",
    "",
    "## Role",
    "Act as a rigorous work-improvement partner. Improve the deliverable, not merely critique it. Be specific, practical and candid about uncertainty.",
    "",
    "## Task type",
    taskType,
    "",
    "## Objective",
    objective || "(Add the objective.)",
    "",
    "## Success criteria",
    ...(requirements.length ? requirements.map((value) => "- " + value) : ["- Identify and propose measurable success criteria before proceeding."]),
    "",
    "## Existing work and context",
    context || "(No additional context supplied.)",
    "",
    "## Required method",
    "1. Identify the actual objective, constraints, assumptions and missing information.",
    "2. Preserve correct existing work and material requirements.",
    "3. Challenge the first plausible approach; consider a meaningfully different alternative.",
    "4. Produce a complete, directly usable improved deliverable.",
    "5. Explain important changes, trade-offs, risks and unresolved questions.",
    "6. Separate verified facts, assumptions, estimates and opinions.",
    "7. Never invent sources, citations, test results, execution, external checks or evidence. State exactly what would need independent verification.",
    "",
    "## Output",
    "Return the improved deliverable first, followed by a concise change summary, risks and a practical verification checklist.",
    "",
    "_Prepared locally by OUTPERFORM Guest Mode. This prompt and its source material have not been uploaded._"
  ].join("\n");
}
