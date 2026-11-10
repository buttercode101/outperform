import test from "node:test";
import assert from "node:assert/strict";
import { createArtifact, deriveArtifact, hashContent } from "../src/domain/artifact.js";
import { createEvidence, adjudicateFinding } from "../src/domain/evidence.js";

test("artifact content is hashed and source artifact remains unchanged", () => {
  const original = createArtifact({
    sessionId: "session-1", kind: "TEXT", content: "Original", createdBy: "user"
  });
  const improved = deriveArtifact(original, { content: "Improved", createdBy: "engine" });
  assert.equal(original.content, "Original");
  assert.equal(improved.parentArtifactId, original.id);
  assert.equal(improved.version, 2);
  assert.notEqual(improved.contentHash, original.contentHash);
  assert.equal(hashContent("Original").length, 64);
});

test("verified evidence requires an observable source reference", () => {
  assert.throws(() => createEvidence({
    sessionId: "s1", claim: "The test passed", status: "VERIFIED", sourceType: "TEST_RUN"
  }), { code: "VERIFICATION_REQUIRES_SOURCE" });
});

test("finding adjudication remains uncertain when evidence conflicts", () => {
  const finding = { id: "f1" };
  const evidence = [
    { findingId: "f1", status: "VERIFIED" },
    { findingId: "f1", status: "REFUTED" }
  ];
  assert.equal(adjudicateFinding(finding, evidence), "UNCERTAIN");
  assert.equal(adjudicateFinding(finding, []), "UNVERIFIED");
  const linked = createEvidence({
    sessionId: "s1", findingId: "f1", claim: "Observed regression",
    status: "VERIFIED", sourceType: "TEST_RUN", sourceRef: "run:123"
  });
  assert.equal(adjudicateFinding(finding, [linked]), "VERIFIED");
});
