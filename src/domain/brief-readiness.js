export function assessBriefCompleteness({ objective = "", context = "", requirements = [] } = {}) {
  const objectiveText = typeof objective === "string" ? objective.trim() : "";
  const contextText = typeof context === "string" ? context.trim() : "";
  const criteria = Array.isArray(requirements) ? requirements.filter((item) => typeof item === "string" && item.trim()) : [];
  const checks = [
    {
      id: "objective",
      label: "Clear objective",
      complete: objectiveText.length >= 30,
      guidance: objectiveText.length === 0
        ? "Describe the outcome you want, not just the activity."
        : "Add a little more detail about the intended outcome."
    },
    {
      id: "success_criteria",
      label: "Success criteria",
      complete: criteria.length >= 2,
      guidance: "Add at least two observable conditions that would make the result successful."
    },
    {
      id: "context",
      label: "Existing work or context",
      complete: contextText.length >= 50,
      guidance: "Add relevant source material, constraints, background or an example. Sensitive information is best removed."
    }
  ];
  const completed = checks.filter((check) => check.complete).length;
  return {
    completed,
    total: checks.length,
    percentage: Math.round((completed / checks.length) * 100),
    checks,
    note: "A local completeness aid only. It does not assess correctness, factual accuracy or the quality of the eventual result."
  };
}
