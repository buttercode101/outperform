import { createHash } from "node:crypto";

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || "90cefa028781f749f5816c5748f04cd2";
const bucket = process.env.R2_BUCKET_NAME || "outperform-artifacts-prod";
const token = process.env.CLOUDFLARE_API_TOKEN;
const apiRoot = "https://api.cloudflare.com/client/v4";
if (!token) throw new Error("CLOUDFLARE_API_TOKEN is required.");

function encodeKey(key) {
  return key.split("/").map(encodeURIComponent).join("/");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function api(path, init = {}) {
  const response = await fetch(apiRoot + path, {
    ...init,
    headers: { Authorization: "Bearer " + token, ...(init.headers || {}) }
  });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 1200);
    throw new Error("Cloudflare API " + (init.method || "GET") + " " + path + " returned HTTP " + response.status + ": " + body);
  }
  return response;
}

async function jsonApi(path, init = {}) {
  const response = await api(path, init);
  const data = await response.json();
  if (!data.success) throw new Error("Cloudflare API rejected " + path + ": " + JSON.stringify(data.errors || data.messages || data).slice(0, 1200));
  return data;
}

async function listObjects(objectPrefix) {
  const objects = [];
  let cursor;
  do {
    const params = new URLSearchParams({ prefix: objectPrefix, per_page: "1000" });
    if (cursor) params.set("cursor", cursor);
    const data = await jsonApi("/accounts/" + accountId + "/r2/buckets/" + bucket + "/objects?" + params.toString());
    objects.push(...(data.result || []));
    const info = data.result_info || {};
    if (info.is_truncated && !info.cursor) throw new Error("R2 listing was truncated without a continuation cursor for " + objectPrefix);
    cursor = info.is_truncated ? info.cursor : undefined;
  } while (cursor);
  return objects;
}

async function queryD1(databaseId, sql) {
  const data = await jsonApi("/accounts/" + accountId + "/d1/database/" + databaseId + "/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql })
  });
  return data.result?.[0]?.results || [];
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
    }
  }));
  return results;
}

const snapshotObjects = await listObjects("backups/snapshots/");
const manifests = snapshotObjects
  .filter(object => object.key?.endsWith("/manifest.json"))
  .sort((a, b) => Date.parse(b.last_modified || "") - Date.parse(a.last_modified || ""));
const manifestKey = process.env.BACKUP_MANIFEST_KEY || manifests[0]?.key;
if (!manifestKey) throw new Error("No complete production backup manifest was found.");

const manifestResponse = await api("/accounts/" + accountId + "/r2/buckets/" + bucket + "/objects/" + encodeKey(manifestKey));
const manifest = JSON.parse(await manifestResponse.text());
if (manifest.format !== "outperform-production-backup-v1") throw new Error("Unsupported backup manifest format.");
if (!manifest.database?.sqlKey || !Array.isArray(manifest.r2?.objects)) throw new Error("Backup manifest is incomplete.");

const sqlResponse = await api("/accounts/" + accountId + "/r2/buckets/" + bucket + "/objects/" + encodeKey(manifest.database.sqlKey));
const sqlBytes = Buffer.from(await sqlResponse.arrayBuffer());
if (sha256(sqlBytes) !== manifest.database.sqlSha256) throw new Error("Stored D1 SQL checksum does not match the backup manifest.");
if (sqlBytes.length !== manifest.database.sqlBytes) throw new Error("Stored D1 SQL size does not match the backup manifest.");

const tempName = "outperform-restore-smoke-" + Date.now();
let tempDatabaseId;
let temporaryDatabaseDeleted = false;
let resultSummary;
try {
  const created = await jsonApi("/accounts/" + accountId + "/d1/database", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: tempName, primary_location: "OC" })
  });
  tempDatabaseId = created.result?.uuid;
  if (!tempDatabaseId) throw new Error("Temporary D1 database creation returned no database ID.");

  const imported = await jsonApi("/accounts/" + accountId + "/d1/database/" + tempDatabaseId + "/raw", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql: sqlBytes.toString("utf8") })
  });

  const [tables, migrations, foreignKeys, restoredReferences] = await Promise.all([
    queryD1(tempDatabaseId, "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'"),
    queryD1(tempDatabaseId, "SELECT COUNT(*) AS count FROM d1_migrations"),
    queryD1(tempDatabaseId, "PRAGMA foreign_key_check"),
    queryD1(tempDatabaseId, "SELECT object_key AS object_key FROM artifacts UNION SELECT context_object_key AS object_key FROM work_sessions WHERE context_object_key IS NOT NULL")
  ]);

  const tableCount = Number(tables[0]?.count || 0);
  const migrationCount = Number(migrations[0]?.count || 0);
  const foreignKeyViolations = foreignKeys.length;
  if (tableCount < 5) throw new Error("Restored database has an unexpectedly small schema: " + tableCount + " tables.");
  if (migrationCount < 1) throw new Error("Restored database has no migration history.");
  if (foreignKeyViolations) throw new Error("Restored database has " + foreignKeyViolations + " foreign-key violations.");

  const backupKeys = new Set(manifest.r2.objects.map(object => object.sourceKey));
  const missingReferences = restoredReferences.map(row => row.object_key).filter(key => key && !backupKeys.has(key));
  if (missingReferences.length) throw new Error("Restored D1 references R2 objects absent from the backup manifest: " + missingReferences.join(", "));

  const verifiedObjects = await mapLimit(manifest.r2.objects, 4, async object => {
    const response = await api("/accounts/" + accountId + "/r2/buckets/" + bucket + "/objects/" + encodeKey(object.backupKey));
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== object.size || sha256(bytes) !== object.sha256) {
      throw new Error("R2 backup integrity check failed for " + object.sourceKey);
    }
    return object.sourceKey;
  });

  resultSummary = {
    success: true,
    manifestKey,
    backupId: manifest.backupId,
    importedStatements: imported.result?.length || 0,
    restoredTables: tableCount,
    restoredMigrations: migrationCount,
    foreignKeyViolations,
    restoredObjectReferences: restoredReferences.length,
    verifiedR2Objects: verifiedObjects.length
  };
} finally {
  if (tempDatabaseId) {
    await jsonApi("/accounts/" + accountId + "/d1/database/" + tempDatabaseId, { method: "DELETE" });
    temporaryDatabaseDeleted = true;
  }
}
console.log(JSON.stringify({ ...resultSummary, temporaryDatabaseDeleted }, null, 2));
