import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || "90cefa028781f749f5816c5748f04cd2";
const databaseId = process.env.D1_DATABASE_ID || "cb25ae38-f5bc-4e96-8ea2-b049456b5187";
const bucket = process.env.R2_BUCKET_NAME || "outperform-artifacts-prod";
const token = process.env.CLOUDFLARE_API_TOKEN;
const sqlPath = process.argv[2];
const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS || 30);

if (!token) throw new Error("CLOUDFLARE_API_TOKEN is required.");
if (!sqlPath) throw new Error("Pass the exported production D1 SQL file as the first argument.");
if (!Number.isInteger(retentionDays) || retentionDays < 7) throw new Error("BACKUP_RETENTION_DAYS must be an integer of at least 7.");

const apiRoot = "https://api.cloudflare.com/client/v4";
const authHeaders = { Authorization: "Bearer " + token };
const timestamp = new Date().toISOString();
const backupId = timestamp.replace(/[:.]/g, "-");
const prefix = "backups/snapshots/" + backupId;

function encodeKey(key) {
  return key.split("/").map(encodeURIComponent).join("/");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function api(path, init = {}) {
  const response = await fetch(apiRoot + path, {
    ...init,
    headers: { ...authHeaders, ...(init.headers || {}) }
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

async function queryD1(sql) {
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

async function uploadObject(key, bytes, contentType) {
  const response = await api("/accounts/" + accountId + "/r2/buckets/" + bucket + "/objects/" + encodeKey(key), {
    method: "PUT",
    headers: { "Content-Type": contentType || "application/octet-stream" },
    body: bytes
  });
  const data = await response.json();
  if (!data.success) throw new Error("R2 upload failed for " + key + ": " + JSON.stringify(data.errors || data.messages || data).slice(0, 1000));
}

async function verifyObject(key, expectedHash) {
  const response = await api("/accounts/" + accountId + "/r2/buckets/" + bucket + "/objects/" + encodeKey(key));
  const bytes = Buffer.from(await response.arrayBuffer());
  const actualHash = sha256(bytes);
  if (actualHash !== expectedHash) throw new Error("Backup checksum mismatch for " + key);
  return bytes.length;
}

const sqlBytes = await readFile(sqlPath);
if (!sqlBytes.length) throw new Error("The D1 export is empty.");
const sqlHash = sha256(sqlBytes);

const [liveObjects, referencedRows] = await Promise.all([
  listObjects("sessions/"),
  queryD1("SELECT object_key AS object_key FROM artifacts UNION SELECT context_object_key AS object_key FROM work_sessions WHERE context_object_key IS NOT NULL")
]);
const referencedKeys = [...new Set(referencedRows.map(row => row.object_key).filter(Boolean))];
const sourceMetadata = new Map(liveObjects.map(object => [object.key, object]));
const sourceKeys = [...new Set([...liveObjects.map(object => object.key), ...referencedKeys])];

const objectManifest = await mapLimit(sourceKeys, 4, async sourceKey => {
  const sourceResponse = await api("/accounts/" + accountId + "/r2/buckets/" + bucket + "/objects/" + encodeKey(sourceKey));
  const bytes = Buffer.from(await sourceResponse.arrayBuffer());
  const source = sourceMetadata.get(sourceKey);
  const contentType = source?.http_metadata?.contentType || sourceResponse.headers.get("content-type") || "application/octet-stream";
  const backupKey = prefix + "/r2/" + sourceKey;
  const digest = sha256(bytes);
  await uploadObject(backupKey, bytes, contentType);
  const verifiedBytes = await verifyObject(backupKey, digest);
  if (verifiedBytes !== bytes.length) throw new Error("Backup size mismatch for " + sourceKey);
  return {
    sourceKey,
    backupKey,
    size: bytes.length,
    etag: source?.etag || sourceResponse.headers.get("etag") || null,
    sha256: digest,
    contentType,
    httpMetadata: source?.http_metadata || {},
    customMetadata: source?.custom_metadata || {}
  };
});

const copiedKeys = new Set(objectManifest.map(item => item.sourceKey));
const missingReferences = referencedKeys.filter(key => !copiedKeys.has(key));
if (missingReferences.length) throw new Error("D1 references R2 objects that were not backed up: " + missingReferences.join(", "));

const sqlKey = prefix + "/database.sql";
await uploadObject(sqlKey, sqlBytes, "application/sql");
const verifiedSqlBytes = await verifyObject(sqlKey, sqlHash);
if (verifiedSqlBytes !== sqlBytes.length) throw new Error("D1 SQL backup size verification failed.");

const manifest = {
  format: "outperform-production-backup-v1",
  backupId,
  createdAt: timestamp,
  sourceCommit: process.env.GITHUB_SHA || null,
  database: { name: "outperform-prod", id: databaseId, sqlKey, sqlBytes: sqlBytes.length, sqlSha256: sqlHash },
  r2: { bucket, objectCount: objectManifest.length, referencedObjectCount: referencedKeys.length, objects: objectManifest },
  retentionDays
};
const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2));
const manifestKey = prefix + "/manifest.json";
await uploadObject(manifestKey, manifestBytes, "application/json");
await verifyObject(manifestKey, sha256(manifestBytes));

const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
const snapshots = await listObjects("backups/snapshots/");
const expired = snapshots.filter(object => {
  const uploadedAt = Date.parse(object.last_modified || "");
  return Number.isFinite(uploadedAt) && uploadedAt < cutoff;
});
const pruneResults = await mapLimit(expired, 8, async object => {
  await jsonApi("/accounts/" + accountId + "/r2/buckets/" + bucket + "/objects/" + encodeKey(object.key), { method: "DELETE" });
  return object.key;
});

console.log(JSON.stringify({
  success: true,
  backupId,
  manifestKey,
  sqlBytes: sqlBytes.length,
  sqlSha256: sqlHash,
  r2ObjectCount: objectManifest.length,
  referencedObjectCount: referencedKeys.length,
  prunedExpiredObjects: pruneResults.length,
  retentionDays
}, null, 2));
