export function extractJsonObject(content) {
  if (typeof content !== "string") return null;
  if (content.trimStart().startsWith("[")) return null;
  const start = content.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < content.length; index += 1) {
    const character = content[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }

    if (character === '"') {
      inString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(content.slice(start, index + 1));
          return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

export function normalizeModelContent(message) {
  if (!message || typeof message !== "object") return "";
  const content = message.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content.map(part => {
      if (typeof part === "string") return part;
      if (part && typeof part.text === "string") return part.text;
      if (part && typeof part.content === "string") return part.content;
      return "";
    }).filter(Boolean).join("\n").trim();
  }
  if (content && typeof content === "object") return JSON.stringify(content);
  if (typeof message.refusal === "string") return message.refusal.trim();
  return "";
}

export function parseAdjudicationResponse(content) {
  const value = extractJsonObject(content);
  if (!value || !["primary", "challenger"].includes(value.preferred)) {
    throw new Error("Adjudication must return a complete JSON object with preferred set to primary or challenger.");
  }
  const rationale = typeof value.rationale === "string" ? value.rationale.trim() : "";
  const listFields = ["strengths", "risks", "improvementIdeas"];
  if (!rationale || listFields.some(field => !Array.isArray(value[field]))) {
    throw new Error("Adjudication JSON must include a non-empty rationale and strengths, risks and improvementIdeas arrays.");
  }
  const normalizeList = (items) => items
    .filter(item => typeof item === "string" && item.trim())
    .slice(0, 3)
    .map(item => item.trim());
  const strengths = normalizeList(value.strengths);
  const risks = normalizeList(value.risks);
  const improvementIdeas = normalizeList(value.improvementIdeas);
  if (!strengths.length || !improvementIdeas.length) {
    throw new Error("Adjudication must include at least one strength and one improvement idea.");
  }
  return {
    preferred: value.preferred,
    rationale,
    strengths,
    risks,
    improvementIdeas,
    parsed: true
  };
}
