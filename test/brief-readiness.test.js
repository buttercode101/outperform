import test from "node:test";
import assert from "node:assert/strict";
import { assessBriefCompleteness } from "../src/domain/brief-readiness.js";

test("empty brief shows all completeness checks as incomplete", () => {
  const result = assessBriefCompleteness();
  assert.equal(result.completed, 0);
  assert.equal(result.percentage, 0);
});

test("complete brief meets all local completeness checks", () => {
  const result = assessBriefCompleteness({
    objective: "Produce a clear, tested implementation that preserves current behaviour.",
    requirements: ["Preserve existing functionality", "Document test evidence"],
    context: "Current implementation and relevant background details are supplied here for review."
  });
  assert.equal(result.completed, 3);
  assert.equal(result.percentage, 100);
});

test("criteria must be an array and incomplete context is not treated as complete", () => {
  const result = assessBriefCompleteness({ objective: "A sufficiently detailed objective with more than thirty characters.", requirements: "not an array", context: "short" });
  assert.equal(result.checks.find((item) => item.id === "success_criteria").complete, false);
  assert.equal(result.checks.find((item) => item.id === "context").complete, false);
});
