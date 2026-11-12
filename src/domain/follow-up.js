export function buildFollowUpContext({
  originalContext = "",
  previousCandidate = "",
  feedback = "",
  maxBytes = 100000
} = {}) {
  const parts = [
    typeof originalContext === "string" ? originalContext.trim() : "",
    "PREVIOUS CANDIDATE TO IMPROVE:",
    typeof previousCandidate === "string" && previousCandidate.trim() ? previousCandidate.trim() : "(No candidate text was loaded.)",
    "USER FEEDBACK FOR THIS PASS:",
    typeof feedback === "string" ? feedback.trim() : ""
  ].filter(Boolean);
  const context = parts.join("\n\n");
  const byteLength = new TextEncoder().encode(context).length;
  if (byteLength > maxBytes) {
    const error = new Error("The original context and previous candidate exceed the 100 KB session limit. Start a new session with a shorter excerpt.");
    error.code = "FOLLOW_UP_CONTEXT_TOO_LARGE";
    throw error;
  }
  if (!feedback.trim()) {
    const error = new Error("Add feedback before starting another improvement pass.");
    error.code = "FOLLOW_UP_FEEDBACK_REQUIRED";
    throw error;
  }
  return context;
}
