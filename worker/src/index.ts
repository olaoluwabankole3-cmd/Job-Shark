export interface Env {
  APP_ENV?: string;
}

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "content-type",
          "access-control-max-age": "86400",
        },
      });
    }

    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405);
    }

    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "job-shark-api",
        environment: env.APP_ENV ?? "development",
        timestamp: new Date().toISOString(),
      });
    }

    if (url.pathname === "/") {
      return json({
        name: "Job-Shark API",
        status: "scaffold",
        message: "Backend foundation is running. Authenticated job endpoints are not enabled yet.",
        health: "/health",
      });
    }

    return json({ error: "Not found" }, 404);
  },
};
