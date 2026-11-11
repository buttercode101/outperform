import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSessionBudget } from "../src/domain/budget.js";

test("uses the bounded production default budget", () => {
  assert.deepEqual(normalizeSessionBudget(), {
    maxModelCalls: 5, maxWallClockSeconds: 600, maxToolCalls: 4
  });
});

test("does not allow clients to raise model or tool budgets", () => {
  assert.deepEqual(normalizeSessionBudget({ maxModelCalls: 999, maxWallClockSeconds: 99999, maxToolCalls: 999 }), {
    maxModelCalls: 5, maxWallClockSeconds: 600, maxToolCalls: 4
  });
});

test("allows users to select a smaller supported model-call budget", () => {
  assert.equal(normalizeSessionBudget({ maxModelCalls: 3 }).maxModelCalls, 3);
  assert.equal(normalizeSessionBudget({ maxModelCalls: 4 }).maxModelCalls, 4);
});

test("rejects budgets too small to run the minimum workflow", () => {
  assert.equal(normalizeSessionBudget({ maxModelCalls: 1 }).maxModelCalls, 3);
  assert.equal(normalizeSessionBudget({ maxModelCalls: 0 }).maxModelCalls, 3);
});

test("falls back safely for malformed values", () => {
  assert.equal(normalizeSessionBudget({ maxModelCalls: "many" }).maxModelCalls, 5);
  assert.equal(normalizeSessionBudget(null).maxModelCalls, 5);
});
