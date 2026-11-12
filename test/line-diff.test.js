import test from "node:test";
import assert from "node:assert/strict";
import { buildLineDiff } from "../src/domain/line-diff.js";

test("line diff identifies additions and removals while preserving shared lines", () => {
  const result = buildLineDiff("one\nkeep\nold", "one\nkeep\nnew\nextra");
  assert.equal(result.mode, "diff");
  assert.equal(result.added, 2);
  assert.equal(result.removed, 1);
  assert.deepEqual(result.rows.map((row) => row.type), ["context", "context", "removed", "added", "added"]);
});

test("line diff normalizes Windows newlines", () => {
  const result = buildLineDiff("a\r\nb", "a\nb");
  assert.equal(result.added, 0);
  assert.equal(result.removed, 0);
});

test("line diff falls back safely when comparison would exceed its work limit", () => {
  const result = buildLineDiff("a\nb\nc", "x\ny\nz", { maxCells: 2 });
  assert.equal(result.mode, "summary");
  assert.equal(result.added, null);
  assert.match(result.rows[0].text, /too large/);
});
