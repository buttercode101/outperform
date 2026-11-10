import { randomUUID } from "node:crypto";
import { invariant } from "./errors.js";

export const EVIDENCE_STATUSES = Object.freeze(["VERIFIED", "REFUTED", "UNCERTAIN", "UNVERIFIED"]);

export function createEvidence({
  sessionId, claim, status = "UNVERIFIED", sourceType, sourceRef = null,
  findingId = null, observedAt = new Date().toISOString(), details = null
}) {
  invariant(typeof sessionId === "string" && sessionId.trim(), "INVALID_EVIDENCE", "sessionId is required.");
  invariant(typeof claim === "string" && claim.trim(), "INVALID_EVIDENCE", "A claim is required.");
  invariant(EVIDENCE_STATUSES.includes(status), "INVALID_EVIDENCE_STATUS", "Unknown evidence status.");
  invariant(typeof sourceType === "string" && sourceType.trim(), "INVALID_EVIDENCE", "sourceType is required.");
  invariant(status !== "VERIFIED" || (typeof sourceRef === "string" && sourceRef.trim()),
    "VERIFICATION_REQUIRES_SOURCE", "Verified evidence must reference an observable source.");
  return Object.freeze({
    id: randomUUID(), sessionId, findingId, claim: claim.trim(), status,
    sourceType: sourceType.trim(), sourceRef, observedAt, details
  });
}

export function adjudicateFinding(finding, evidenceRecords) {
  invariant(finding && typeof finding.id === "string", "INVALID_FINDING", "A finding is required.");
  invariant(Array.isArray(evidenceRecords), "INVALID_EVIDENCE_SET", "Evidence records must be an array.");
  const linked = evidenceRecords.filter((record) => record.findingId === finding.id);
  const hasVerified = linked.some((record) => record.status === "VERIFIED");
  const hasRefuted = linked.some((record) => record.status === "REFUTED");
  if (hasVerified && hasRefuted) return "UNCERTAIN";
  if (hasVerified) return "VERIFIED";
  if (hasRefuted) return "REFUTED";
  return "UNVERIFIED";
}
