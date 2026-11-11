function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.floor(parsed))) : fallback;
}

export function normalizeSessionBudget(requested = {}) {
  const source = requested && typeof requested === "object" && !Array.isArray(requested) ? requested : {};
  return Object.freeze({
    maxModelCalls: boundedInteger(source.maxModelCalls, 5, 3, 5),
    maxWallClockSeconds: 600,
    maxToolCalls: 4
  });
}
