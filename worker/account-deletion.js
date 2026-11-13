export async function collectAccountObjectKeys(env, userId) {
  const [artifactRows, contextRows, sessionRows] = await Promise.all([
    env.DB.prepare(
      "SELECT a.object_key FROM artifacts a INNER JOIN work_sessions s ON s.id = a.session_id WHERE s.owner_id = ?"
    ).bind(userId).all(),
    env.DB.prepare(
      "SELECT context_object_key FROM work_sessions WHERE owner_id = ? AND context_object_key IS NOT NULL"
    ).bind(userId).all(),
    env.DB.prepare(
      "SELECT id FROM work_sessions WHERE owner_id = ?"
    ).bind(userId).all()
  ]);

  const objectKeys = new Set([
    ...(artifactRows.results ?? []).map((item) => item.object_key),
    ...(contextRows.results ?? []).map((item) => item.context_object_key)
  ].filter(Boolean));

  for (const session of sessionRows.results ?? []) {
    let cursor;
    do {
      const page = await env.ARTIFACTS.list({
        prefix: "sessions/" + session.id + "/",
        ...(cursor ? { cursor } : {})
      });
      for (const object of page.objects ?? []) {
        if (object?.key) objectKeys.add(object.key);
      }
      if (page.truncated && !page.cursor) {
        throw new Error("R2 session object listing was truncated without a continuation cursor.");
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  }

  return [...objectKeys];
}
