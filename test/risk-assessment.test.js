import test from "node:test";
import assert from "node:assert/strict";
import { assessWorkRisk } from "../src/domain/risk-assessment.js";

test("flags critical risk when multiple sensitive operational signals appear", () => {
  const result = assessWorkRisk({
    taskType: "CODE",
    objective: "Deploy production payment authentication and store customer credentials",
    context: "Database migration and privacy retention requirements",
    requirements: ["Preserve security and rollback"]
  });
  assert.equal(result.risk, "CRITICAL");
  assert.ok(result.signals.length >= 2);
});

test("flags a single high-risk signal", () => {
  const result = assessWorkRisk({ taskType: "OTHER", objective: "Review a payment flow", context: "Some context supplied." });
  assert.equal(result.risk, "HIGH");
  assert.deepEqual(result.signals, ["PAYMENT_OR_FINANCE"]);
});

test("uses a medium default for code, business and research work", () => {
  assert.equal(assessWorkRisk({ taskType: "CODE" }).risk, "MEDIUM");
  assert.equal(assessWorkRisk({ taskType: "BUSINESS" }).risk, "MEDIUM");
  assert.equal(assessWorkRisk({ taskType: "RESEARCH" }).risk, "MEDIUM");
});

test("uses a low default for other work without risk signals", () => {
  assert.equal(assessWorkRisk({ taskType: "CREATIVE" }).risk, "LOW");
});

test("raises uncertainty when context is missing and requirements increase", () => {
  const sparse = assessWorkRisk({ taskType: "OTHER", objective: "Improve this" });
  const detailed = assessWorkRisk({ taskType: "OTHER", objective: "Improve this", context: "x".repeat(800), requirements: ["one", "two", "three", "four"] });
  assert.ok(sparse.uncertainty > detailed.uncertainty);
});
