import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/domain/session.js";
import { createArtifact, deriveArtifact } from "../src/domain/artifact.js";
import { runImprovementSession } from "../src/application/run-improvement-session.js";

const makeFixture = () => {
  const session = createSession({
    objective: "Improve and verify a document",
    taskType: "DOCUMENT",
    budget: { maxModelCalls: 8, maxWallClockSeconds: 120, maxToolCalls: 8 }
  });
  const baseline = createArtifact({
    sessionId: session.id, kind: "TEXT", content: "Initial draft", createdBy: "user"
  });
  const primary = deriveArtifact(baseline, { content: "Improved draft", createdBy: "primary-agent" });
  const improved = deriveArtifact(primary, { content: "Verified improved draft", createdBy: "improvement-agent" });
  const adapters = {
    executePrimary: async () => primary,
    runChallenge: async () => deriveArtifact(primary, { content: "Alternative draft", createdBy: "challenger" }),
    evaluate: async () => ({ findings: [{ id: "f1", severity: "HIGH", evidenceStatus: "VERIFIED" }] }),
    proposeImprovement: async () => ({ changes: [{ description: "Clarify the conclusion" }], requiresApproval: false }),
    applyImprovement: async () => improved,
    verify: async () => ({ passed: ["acceptance-criteria"], failed: [], regressions: [] })
  };
  return { session, baseline, adapters, improved };
};

test("runs a complete improvement loop and promotes verified artifact", async () => {
  const { session, baseline, adapters, improved } = makeFixture();
  const result = await runImprovementSession({ session, baselineArtifact: baseline, adapters });
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.finalArtifact.id, improved.id);
  assert.ok(result.events.some((event) => event.type === "SESSION_COMPLETED"));
});

test("stops before applying an improvement that requires approval", async () => {
  const { session, baseline, adapters } = makeFixture();
  adapters.proposeImprovement = async () => ({ changes: [{ description: "Modify content" }], requiresApproval: true });
  let applied = false;
  adapters.applyImprovement = async () => { applied = true; throw new Error("must not apply"); };
  const result = await runImprovementSession({ session, baselineArtifact: baseline, adapters });
  assert.equal(result.status, "AWAITING_APPROVAL");
  assert.equal(applied, false);
  assert.equal(result.events.at(-1).type, "APPROVAL_REQUIRED");
});

test("returns baseline artifact when verification detects a regression", async () => {
  const { session, baseline, adapters } = makeFixture();
  adapters.verify = async () => ({ passed: [], failed: [], regressions: ["original heading was removed"] });
  const result = await runImprovementSession({ session, baselineArtifact: baseline, adapters });
  assert.equal(result.status, "FAILED");
  assert.equal(result.finalArtifact.id, baseline.id);
});

test("rejects artifacts from another session", async () => {
  const { session, baseline, adapters } = makeFixture();
  const foreign = createArtifact({
    sessionId: "different-session", kind: "TEXT", content: "foreign", createdBy: "user"
  });
  const result = await runImprovementSession({ session, baselineArtifact: foreign, adapters });
  assert.equal(result.status, "FAILED");
  assert.equal(result.error.code, "ARTIFACT_SESSION_MISMATCH");
});
