export function assessWorkRisk({ taskType = "OTHER", objective = "", context = "", requirements = [] } = {}) {
  const riskText = [objective, context, ...requirements].join("\n");
  const signals = [
    ["SECURITY_OR_AUTH", /\b(?:security|authentication|authorization|credential|secret|permission)\b/i],
    ["PAYMENT_OR_FINANCE", /\b(?:payment|billing|invoice|financial|revenue|bank|transaction)\b/i],
    ["PRODUCTION_OR_MIGRATION", /\b(?:production|deployment|migration|database|rollback|release)\b/i],
    ["PRIVACY_OR_COMPLIANCE", /\b(?:privacy|personal data|compliance|regulation|legal|retention)\b/i]
  ].filter(([, pattern]) => pattern.test(riskText)).map(([signal]) => signal);
  const risk = signals.length >= 2
    ? "CRITICAL"
    : signals.length === 1
      ? "HIGH"
      : ["CODE", "BUSINESS", "RESEARCH"].includes(taskType)
        ? "MEDIUM"
        : "LOW";
  const uncertainty = Number(Math.max(0.3, Math.min(0.95,
    0.4 + requirements.length * 0.025 +
    (context.length < 300 ? 0.15 : 0) +
    (context.length === 0 ? 0.1 : 0)
  )).toFixed(2));
  return { method: "KEYWORD_HEURISTIC", risk, uncertainty, signals };
}
