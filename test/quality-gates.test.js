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


test("code playbook flags selected high-risk code patterns", () => {
  const result = inspectArtifact("# Review\n\nThis output contains enough explanatory words for the gate to inspect a potentially risky code example: eval(userInput). The pattern requires context-aware security review.", { taskType: "CODE" });
  assert.equal(result.checks.find((item) => item.id === "code_risk_patterns").status, "FLAG");
});

test("research playbook flags missing source links without claiming link validation", () => {
  const result = inspectArtifact("# Research\n\nThis is a sufficiently detailed research summary with claims, reasoning and conclusions but no traceable source URLs in the output.", { taskType: "RESEARCH" });
  assert.equal(result.checks.find((item) => item.id === "research_source_links").status, "FLAG");
});

test("research playbook detects source links but does not claim they were checked", () => {
  const result = inspectArtifact("# Research\n\nThe source supports this discussion. [Primary source](https://example.com/report). Additional context and analysis follow in this section.", { taskType: "RESEARCH" });
  const check = result.checks.find((item) => item.id === "research_source_links");
  assert.equal(check.status, "PASS");
  assert.match(check.detail, /have not been checked/);
});

test("business playbook flags quantified claims without an obvious basis", () => {
  const result = inspectArtifact("# Financial output\n\nRevenue will reach R 500000 in the first quarter and grow 25% in the next quarter. The plan is to scale quickly.", { taskType: "BUSINESS" });
  assert.equal(result.checks.find((item) => item.id === "business_claim_basis").status, "FLAG");
});

test("document playbook flags long unstructured output", () => {
  const content = "A long document paragraph ".repeat(30);
  const result = inspectArtifact(content, { taskType: "DOCUMENT" });
  assert.equal(result.checks.find((item) => item.id === "document_structure").status, "FLAG");
});
