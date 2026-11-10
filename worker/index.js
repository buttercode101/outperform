const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  }
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({
        ok: true,
        service: "outperform-api",
        environment: env.ENVIRONMENT ?? "unconfigured",
        timestamp: new Date().toISOString()
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "NOT_IMPLEMENTED", message: "This API route is not available yet." }, 404);
    }

    return env.ASSETS.fetch(request);
  }
};
