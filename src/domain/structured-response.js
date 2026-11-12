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
