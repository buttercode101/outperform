async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function storeArtifact(env, session, content, role, version, parentArtifactId = null) {
  const id = `${session.id}-${role.toLowerCase()}-${version}`;
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`Artifact ${id} has an invalid version. Artifact versions must be positive integers.`);
  }
  if (typeof content !== "string" || !content.length) {
    throw new Error(`Artifact ${id} cannot be stored without content.`);
  }
  const contentHash = await sha256(content);
  const objectKey = `sessions/${session.id}/artifacts/${version}-${role.toLowerCase()}-${contentHash}.md`;

  await env.ARTIFACTS.put(objectKey, content, {
    httpMetadata: { contentType: "text/markdown; charset=utf-8" },
    customMetadata: { sessionId: session.id, artifactId: id, contentHash, role }
  });

  try {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO artifacts (id, session_id, kind, object_key, content_hash, parent_artifact_id, created_by, version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, session.id, "MARKDOWN", objectKey, contentHash, parentArtifactId, role, version, new Date().toISOString()).run();

    const persisted = await env.DB.prepare(
      "SELECT id, session_id, object_key, content_hash, parent_artifact_id, created_by, version FROM artifacts WHERE id = ?"
    ).bind(id).first();

    if (
      !persisted ||
      persisted.id !== id ||
      persisted.session_id !== session.id ||
      persisted.object_key !== objectKey ||
      persisted.content_hash !== contentHash ||
      (persisted.parent_artifact_id ?? null) !== parentArtifactId ||
      persisted.created_by !== role ||
      Number(persisted.version) !== version
    ) {
      throw new Error(`Artifact ${id} was not persisted consistently in D1. The storage operation was rejected or ignored.`);
    }
  } catch (error) {
    try { await env.ARTIFACTS.delete(objectKey); } catch {}
    throw error;
  }

  return { id, objectKey, contentHash, version, role };
}
