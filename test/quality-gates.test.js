import test from "node:test";
import assert from "node:assert/strict";
import { inspectArtifact } from "../src/domain/quality-gates.js";

test("passes mechanical checks for a substantive clean artifact", () => {
  const result = inspectArtifact("# Summary\n\nThis is a substantive deliverable with enough words to pass the minimum content threshold and no unfinished markers or unsupported verification claims. It includes context, useful structure, clear reasoning, and a complete practical conclusion for the intended reader.", { taskType: "DOCUMENT" });
  assert.equal(result.summary.outcome, "MECHANICAL_CHECKS_PASSED");
  assert.equal(result.summary.failed, 0);
});

test("flags short outputs for human review without pretending they are verified", () => {
  const result = inspectArtifact("A very short answer.", { taskType: "OTHER" });
  assert.equal(result.checks.find((item) => item.id === "minimum_substance").status, "FLAG");
  assert.equal(result.summary.outcome, "REVIEW_REQUIRED");
});

test("blocks artifacts with common unfinished placeholders", () => {
  const result = inspectArtifact("# Plan\n\nTODO: insert source here.", { taskType: "RESEARCH" });
  assert.equal(result.checks.find((item) => item.id === "placeholder_scan").status, "FAIL");
  assert.equal(result.summary.outcome, "FAILED_CHECKS");
});

test("flags unsupported claims that tests or verification were completed", () => {
  const result = inspectArtifact("The implementation is complete. All tests passed. The result is ready.", { taskType: "CODE" });
  assert.equal(result.checks.find((item) => item.id === "verification_language").status, "FLAG");
});

test("flags repeated headings", () => {
  const result = inspectArtifact("# Overview\n\nSome useful content with enough words to satisfy the content threshold for this check.\n\n# Overview", { taskType: "DOCUMENT" });
  assert.equal(result.checks.find((item) => item.id === "heading_consistency").status, "FLAG");
});

test("handles non-string input safely", () => {
  const result = inspectArtifact(null);
  assert.equal(result.summary.outcome, "FAILED_CHECKS");
});
