import test from "node:test";
import assert from "node:assert/strict";
import { collectAccountObjectKeys } from "../worker/account-deletion.js";

function makeDatabase() {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async all() {
              calls.push({ sql, values });
              if (sql.includes("SELECT a.object_key")) {
                return { results: [{ object_key: "sessions/s1/artifacts/known.md" }, { object_key: "legacy/s1.md" }] };
              }
              if (sql.includes("SELECT context_object_key")) {
                return { results: [{ context_object_key: "sessions/s1/source/context.txt" }] };
              }
              if (sql.includes("SELECT id FROM work_sessions")) {
                return { results: [{ id: "s1" }, { id: "s2" }] };
              }
              throw new Error("Unexpected query: " + sql);
            }
          };
        }
      };
    }
  };
}

test("account deletion enumerates every object under each owned session, including orphaned objects and paginated results", async () => {
  const DB = makeDatabase();
  const listCalls = [];
  const ARTIFACTS = {
    async list({ prefix, cursor }) {
      listCalls.push({ prefix, cursor });
      if (prefix === "sessions/s1/" && !cursor) {
        return {
          objects: [{ key: "sessions/s1/artifacts/known.md" }, { key: "sessions/s1/orphaned-output.md" }],
          truncated: true,
          cursor: "s1-next"
        };
      }
      if (prefix === "sessions/s1/" && cursor === "s1-next") {
        return { objects: [{ key: "sessions/s1/source/context.txt" }, { key: "sessions/s1/orphaned-output-2.md" }], truncated: false };
      }
      if (prefix === "sessions/s2/" && !cursor) {
        return { objects: [{ key: "sessions/s2/source/context.txt" }], truncated: false };
      }
      throw new Error("Unexpected R2 listing: " + prefix + " " + cursor);
    }
  };

  const keys = await collectAccountObjectKeys({ DB, ARTIFACTS }, "user-1");
  assert.deepEqual(new Set(keys), new Set([
    "sessions/s1/artifacts/known.md",
    "legacy/s1.md",
    "sessions/s1/source/context.txt",
    "sessions/s1/orphaned-output.md",
    "sessions/s1/orphaned-output-2.md",
    "sessions/s2/source/context.txt"
  ]));
  assert.equal(listCalls.length, 3);
  assert.ok(listCalls.every(call => call.prefix === "sessions/s1/" || call.prefix === "sessions/s2/"));
  assert.equal(listCalls[1].cursor, "s1-next");
  assert.ok(DB.calls.every(call => call.values[0] === "user-1"));
});

test("account deletion fails closed when an R2 listing page is truncated without a cursor", async () => {
  const DB = makeDatabase();
  const ARTIFACTS = {
    async list() {
      return { objects: [], truncated: true };
    }
  };
  await assert.rejects(
    collectAccountObjectKeys({ DB, ARTIFACTS }, "user-1"),
    /truncated without a continuation cursor/
  );
});
