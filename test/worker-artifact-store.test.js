import test from "node:test";
import assert from "node:assert/strict";
import { storeArtifact } from "../worker/artifacts.js";

function makeEnvironment({ ignoreInserts = false } = {}) {
  const rows = new Map();
  const objects = new Map();

  const DB = {
    prepare(sql) {
      let values = [];
      return {
        bind(...args) {
          values = args;
          return this;
        },
        async run() {
          if (!sql.startsWith("INSERT OR IGNORE INTO artifacts")) {
            throw new Error("Unexpected SQL in fake D1 run: " + sql);
          }
          const [id, sessionId, kind, objectKey, contentHash, parentArtifactId, role, version, createdAt] = values;
          const idConflict = rows.has(id);
          const versionConflict = [...rows.values()].some(row => row.session_id === sessionId && row.version === version);
          if (ignoreInserts || version < 1 || idConflict || versionConflict) return { meta: { changes: 0 } };
          if (parentArtifactId && !rows.has(parentArtifactId)) throw new Error("FOREIGN KEY constraint failed");
          rows.set(id, {
            id,
            session_id: sessionId,
            kind,
            object_key: objectKey,
            content_hash: contentHash,
            parent_artifact_id: parentArtifactId,
            created_by: role,
            version,
            created_at: createdAt
          });
          return { meta: { changes: 1 } };
        },
        async first() {
          if (!sql.startsWith("SELECT id, session_id")) throw new Error("Unexpected SQL in fake D1 first: " + sql);
          return rows.get(values[0]) ?? null;
        }
      };
    }
  };

  const ARTIFACTS = {
    async put(key, value, metadata) { objects.set(key, { value, metadata }); },
    async delete(key) { objects.delete(key); }
  };

  return { env: { DB, ARTIFACTS }, rows, objects };
}

test("persists baseline and primary artifacts with positive, linked versions", async () => {
  const { env, rows, objects } = makeEnvironment();
  const session = { id: "session-a" };

  const baseline = await storeArtifact(env, session, "# Original brief", "BASELINE", 1);
  const primary = await storeArtifact(env, session, "# Primary draft", "PRIMARY", 2, baseline.id);

  assert.equal(baseline.version, 1);
  assert.equal(primary.version, 2);
  assert.equal(rows.get(baseline.id).created_by, "BASELINE");
  assert.equal(rows.get(primary.id).parent_artifact_id, baseline.id);
  assert.equal(objects.size, 2);
});

test("rejects version zero before writing an orphaned R2 object", async () => {
  const { env, objects } = makeEnvironment();
  await assert.rejects(
    () => storeArtifact(env, { id: "session-b" }, "# Baseline", "BASELINE", 0),
    /positive integers/
  );
  assert.equal(objects.size, 0);
});

test("detects an INSERT OR IGNORE that silently failed and removes the orphaned object", async () => {
  const { env, objects } = makeEnvironment({ ignoreInserts: true });
  await assert.rejects(
    () => storeArtifact(env, { id: "session-c" }, "# Primary", "PRIMARY", 2),
    /not persisted consistently/
  );
  assert.equal(objects.size, 0);
});

test("rejects a child artifact whose parent artifact is missing", async () => {
  const { env, objects } = makeEnvironment();
  await assert.rejects(
    () => storeArtifact(env, { id: "session-d" }, "# Primary", "PRIMARY", 2, "missing-baseline"),
    /FOREIGN KEY constraint failed/
  );
  assert.equal(objects.size, 0);
});

test("makes a retry idempotent only when the existing D1 row matches the object", async () => {
  const { env, rows, objects } = makeEnvironment();
  const session = { id: "session-e" };
  const first = await storeArtifact(env, session, "# Original brief", "BASELINE", 1);
  const retry = await storeArtifact(env, session, "# Original brief", "BASELINE", 1);

  assert.deepEqual(retry, first);
  assert.equal(rows.size, 1);
  assert.equal(objects.size, 1);
});

test("rejects a different artifact that collides with an existing session version", async () => {
  const { env, objects } = makeEnvironment();
  await storeArtifact(env, { id: "session-f" }, "# Baseline", "BASELINE", 1);
  await assert.rejects(
    () => storeArtifact(env, { id: "session-f" }, "# Other baseline", "OTHER", 1),
    /not persisted consistently/
  );
  assert.equal(objects.size, 1);
});
