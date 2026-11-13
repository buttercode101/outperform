import { createHash, randomUUID } from "node:crypto";
import { invariant } from "./errors.js";

export const WORKFLOW_ARTIFACT_VERSIONS = Object.freeze({
  BASELINE: 1,
  PRIMARY: 2,
  CHALLENGER: 3,
  FINAL: 4
});

export function hashContent(content) {
  invariant(typeof content === "string", "INVALID_ARTIFACT_CONTENT", "Artifact content must be a string.");
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function createArtifact({ sessionId, kind, content, createdBy, parentArtifactId = null }, now = new Date()) {
  for (const [field, value] of Object.entries({ sessionId, kind, createdBy })) {
    invariant(typeof value === "string" && value.trim(), "INVALID_ARTIFACT", `${field} must be a non-empty string.`);
  }
  invariant(typeof content === "string", "INVALID_ARTIFACT_CONTENT", "Artifact content must be a string.");
  return Object.freeze({
    id: randomUUID(),
    sessionId,
    kind,
    content,
    contentHash: hashContent(content),
    parentArtifactId,
    createdBy,
    createdAt: now.toISOString(),
    version: 1
  });
}

export function deriveArtifact(parent, { content, createdBy }, now = new Date()) {
  invariant(parent && typeof parent.id === "string", "INVALID_PARENT", "A valid parent artifact is required.");
  invariant(typeof content === "string", "INVALID_ARTIFACT_CONTENT", "Artifact content must be a string.");
  invariant(typeof createdBy === "string" && createdBy.trim(), "INVALID_ARTIFACT", "createdBy must be a non-empty string.");
  return Object.freeze({
    id: randomUUID(),
    sessionId: parent.sessionId,
    kind: parent.kind,
    content,
    contentHash: hashContent(content),
    parentArtifactId: parent.id,
    createdBy: createdBy.trim(),
    createdAt: now.toISOString(),
    version: parent.version + 1
  });
}
