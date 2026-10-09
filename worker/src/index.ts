export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean }>;
  run(): Promise<{ success: boolean; meta?: { changes?: number } }>;
}

export interface Env {
  DB: D1Database;
  APP_ENV?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  FRONTEND_ORIGIN?: string;
}

type AccessClaims = {
  sub?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
};

type JobInput = {
  title?: unknown;
  company?: unknown;
  url?: unknown;
  location?: unknown;
  work_type?: unknown;
  salary?: unknown;
  source?: unknown;
  fit_score?: unknown;
  eligibility_status?: unknown;
  status?: unknown;
  notes?: unknown;
};

const json = (data: unknown, status = 200, origin?: string): Response => {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  if (origin) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "true");
    headers.set("vary", "Origin");
  }
  return new Response(JSON.stringify(data), { status, headers });
};

const base64UrlToBytes = (value: string): Uint8Array => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const decodePart = <T>(value: string): T =>
  JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as T;

let cachedJwks: { expiresAt: number; keys: JsonWebKey[] } | undefined;

async function verifyAccessToken(token: string, env: Env): Promise<AccessClaims | null> {
  const teamDomain = env.ACCESS_TEAM_DOMAIN?.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const audience = env.ACCESS_AUD?.trim();
  if (!teamDomain || !audience) return null;

  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = decodePart<{ alg?: string; kid?: string }>(parts[0]);
    const claims = decodePart<AccessClaims>(parts[1]);
    if (header.alg !== "RS256" || !header.kid || !claims.sub) return null;

    const issuer = `https://${teamDomain}`;
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== issuer || !claims.exp || claims.exp <= now || (claims.nbf && claims.nbf > now)) return null;
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(audience)) return null;

    if (!cachedJwks || cachedJwks.expiresAt <= Date.now()) {
      const response = await fetch(`${issuer}/cdn-cgi/access/certs`, {
        headers: { accept: "application/json" },
      });
      if (!response.ok) return null;
      const data = (await response.json()) as { keys?: JsonWebKey[] };
      if (!Array.isArray(data.keys)) return null;
      cachedJwks = { keys: data.keys, expiresAt: Date.now() + 10 * 60 * 1000 };
    }

    const jwk = cachedJwks.keys.find((key) => (key as JsonWebKey & { kid?: string }).kid === header.kid);
    if (!jwk) {
      cachedJwks = undefined;
      return null;
    }
    const publicKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      base64UrlToBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    return valid ? claims : null;
  } catch {
    return null;
  }
}

const asString = (value: unknown, max = 500): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length <= max ? normalized : null;
};

const optionalString = (value: unknown, fallback = "", max = 500): string | null =>
  value === undefined ? fallback : asString(value, max);

const allowedStatuses = new Set([
  "discovered",
  "review",
  "approved",
  "submitted",
  "interview",
  "rejected",
  "withdrawn",
  "archived",
]);

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().includes("application/json")) return null;
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? body as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    const allowedOrigin = env.FRONTEND_ORIGIN?.trim();
    const corsOrigin = origin && allowedOrigin && origin === allowedOrigin ? origin : undefined;

    if (origin && allowedOrigin && origin !== allowedOrigin) {
      return json({ error: "Origin not allowed" }, 403);
    }

    if (request.method === "OPTIONS") {
      if (origin && !corsOrigin) return json({ error: "Origin not allowed" }, 403);
      const response = new Response(null, { status: 204 });
      response.headers.set("access-control-allow-methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      response.headers.set("access-control-allow-headers", "content-type, authorization");
      response.headers.set("access-control-max-age", "86400");
      if (corsOrigin) {
        response.headers.set("access-control-allow-origin", corsOrigin);
        response.headers.set("access-control-allow-credentials", "true");
        response.headers.set("vary", "Origin");
      }
      return response;
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return json({
        ok: true,
        service: "job-shark-api",
        environment: env.APP_ENV ?? "development",
        databaseConfigured: Boolean(env.DB),
        authenticationConfigured: Boolean(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD),
        timestamp: new Date().toISOString(),
      }, 200, corsOrigin);
    }

    if (!env.DB) return json({ error: "Database is not configured" }, 503, corsOrigin);
    if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
      return json({ error: "Authentication is not configured. Protected endpoints are disabled." }, 503, corsOrigin);
    }

    const token = request.headers.get("cf-access-jwt-assertion")
      ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Authentication required" }, 401, corsOrigin);

    const claims = await verifyAccessToken(token, env);
    if (!claims?.sub) return json({ error: "Invalid or expired authentication token" }, 401, corsOrigin);
    const userId = claims.sub;

    if (url.pathname === "/api/profile") {
      if (request.method === "GET") {
        const profile = await env.DB.prepare(
          "SELECT target_role, country, work_types, skills_json, created_at, updated_at FROM user_profiles WHERE user_id = ?",
        ).bind(userId).first();
        return json({ profile: profile ?? null }, 200, corsOrigin);
      }
      if (request.method === "PUT") {
        const body = await readJson(request);
        if (!body) return json({ error: "Expected a JSON object" }, 400, corsOrigin);
        const targetRole = optionalString(body.target_role, "", 160);
        const country = optionalString(body.country, "", 120);
        const workTypes = optionalString(body.work_types, "", 300);
        const skillsJson = optionalString(body.skills_json, "[]", 5000);
        if (targetRole === null || country === null || workTypes === null || skillsJson === null) {
          return json({ error: "One or more profile fields are invalid or too long" }, 400, corsOrigin);
        }
        try {
          const parsedSkills: unknown = JSON.parse(skillsJson);
          if (!Array.isArray(parsedSkills) || !parsedSkills.every((skill) => typeof skill === "string")) {
            return json({ error: "skills_json must be a JSON array of strings" }, 400, corsOrigin);
          }
        } catch {
          return json({ error: "skills_json must be valid JSON" }, 400, corsOrigin);
        }
        await env.DB.prepare(
          `INSERT INTO user_profiles (id, user_id, target_role, country, work_types, skills_json)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             target_role = excluded.target_role,
             country = excluded.country,
             work_types = excluded.work_types,
             skills_json = excluded.skills_json,
             updated_at = CURRENT_TIMESTAMP`,
        ).bind(crypto.randomUUID(), userId, targetRole, country, workTypes, skillsJson).run();
        return json({ ok: true }, 200, corsOrigin);
      }
      return json({ error: "Method not allowed" }, 405, corsOrigin);
    }

    if (url.pathname === "/api/jobs" && request.method === "GET") {
      const status = url.searchParams.get("status");
      if (status && !allowedStatuses.has(status)) return json({ error: "Invalid status filter" }, 400, corsOrigin);
      const result = status
        ? await env.DB.prepare(
            "SELECT * FROM job_opportunities WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT 500",
          ).bind(userId, status).all()
        : await env.DB.prepare(
            "SELECT * FROM job_opportunities WHERE user_id = ? ORDER BY created_at DESC LIMIT 500",
          ).bind(userId).all();
      return json({ jobs: result.results }, 200, corsOrigin);
    }

    if (url.pathname === "/api/jobs" && request.method === "POST") {
      const body = await readJson(request) as JobInput | null;
      if (!body) return json({ error: "Expected a JSON object" }, 400, corsOrigin);
      const title = asString(body.title, 160);
      const company = asString(body.company, 160);
      const jobUrl = asString(body.url, 2048);
      if (!title || !company || !jobUrl) return json({ error: "title, company and url are required" }, 400, corsOrigin);
      try {
        const parsedUrl = new URL(jobUrl);
        if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error("invalid protocol");
      } catch {
        return json({ error: "url must be a valid HTTP or HTTPS URL" }, 400, corsOrigin);
      }
      const location = optionalString(body.location, "", 200);
      const workType = optionalString(body.work_type, "", 100);
      const salary = optionalString(body.salary, "", 160);
      const source = optionalString(body.source, "manual", 80);
      const eligibility = optionalString(body.eligibility_status, "unverified", 40);
      const status = optionalString(body.status, "discovered", 40);
      const notes = optionalString(body.notes, "", 10000);
      if ([location, workType, salary, source, eligibility, status, notes].some((value) => value === null)) {
        return json({ error: "One or more job fields are invalid or too long" }, 400, corsOrigin);
      }
      if (!allowedStatuses.has(status as string)) return json({ error: "Invalid status" }, 400, corsOrigin);
      const fitScore = body.fit_score === undefined || body.fit_score === null
        ? null
        : Number.isInteger(body.fit_score) && Number(body.fit_score) >= 0 && Number(body.fit_score) <= 100
          ? Number(body.fit_score)
          : undefined;
      if (fitScore === undefined) return json({ error: "fit_score must be an integer from 0 to 100" }, 400, corsOrigin);
      const id = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO job_opportunities
         (id, user_id, title, company, url, location, work_type, salary, source, fit_score, eligibility_status, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, userId, title, company, jobUrl, location, workType, salary, source, fitScore, eligibility, status, notes).run();
      return json({ ok: true, id }, 201, corsOrigin);
    }

    const jobMatch = url.pathname.match(/^\/api\/jobs\/([0-9a-f-]{36})$/i);
    if (jobMatch) {
      const jobId = jobMatch[1];
      if (request.method === "PATCH") {
        const body = await readJson(request) as JobInput | null;
        if (!body) return json({ error: "Expected a JSON object" }, 400, corsOrigin);
        const existing = await env.DB.prepare(
          "SELECT * FROM job_opportunities WHERE id = ? AND user_id = ?",
        ).bind(jobId, userId).first<JobInput & { id: string; status: string; fit_score: number | null }>();
        if (!existing) return json({ error: "Job not found" }, 404, corsOrigin);
        const merged = { ...existing, ...body };
        const title = asString(merged.title, 160);
        const company = asString(merged.company, 160);
        const jobUrl = asString(merged.url, 2048);
        if (!title || !company || !jobUrl) return json({ error: "title, company and url are required" }, 400, corsOrigin);
        try {
          if (!["http:", "https:"].includes(new URL(jobUrl).protocol)) throw new Error("invalid protocol");
        } catch {
          return json({ error: "url must be a valid HTTP or HTTPS URL" }, 400, corsOrigin);
        }
        const location = optionalString(merged.location, "", 200);
        const workType = optionalString(merged.work_type, "", 100);
        const salary = optionalString(merged.salary, "", 160);
        const source = optionalString(merged.source, "manual", 80);
        const eligibility = optionalString(merged.eligibility_status, "unverified", 40);
        const status = optionalString(merged.status, "discovered", 40);
        const notes = optionalString(merged.notes, "", 10000);
        if ([location, workType, salary, source, eligibility, status, notes].some((value) => value === null)) {
          return json({ error: "One or more job fields are invalid or too long" }, 400, corsOrigin);
        }
        if (!allowedStatuses.has(status as string)) return json({ error: "Invalid status" }, 400, corsOrigin);
        const fitScore = merged.fit_score === undefined || merged.fit_score === null
          ? null
          : Number.isInteger(merged.fit_score) && Number(merged.fit_score) >= 0 && Number(merged.fit_score) <= 100
            ? Number(merged.fit_score)
            : undefined;
        if (fitScore === undefined) return json({ error: "fit_score must be an integer from 0 to 100" }, 400, corsOrigin);
        await env.DB.prepare(
          `UPDATE job_opportunities SET title = ?, company = ?, url = ?, location = ?, work_type = ?,
           salary = ?, source = ?, fit_score = ?, eligibility_status = ?, status = ?, notes = ?,
           updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`,
        ).bind(title, company, jobUrl, location, workType, salary, source, fitScore, eligibility, status, notes, jobId, userId).run();
        return json({ ok: true }, 200, corsOrigin);
      }
      if (request.method === "DELETE") {
        const result = await env.DB.prepare(
          "DELETE FROM job_opportunities WHERE id = ? AND user_id = ?",
        ).bind(jobId, userId).run();
        if (!result.meta?.changes) return json({ error: "Job not found" }, 404, corsOrigin);
        return json({ ok: true }, 200, corsOrigin);
      }
      return json({ error: "Method not allowed" }, 405, corsOrigin);
    }

    if (url.pathname === "/") {
      return json({
        name: "Job-Shark API",
        status: "protected",
        endpoints: ["/health", "/api/profile", "/api/jobs", "/api/jobs/:id"],
        note: "All /api endpoints require a valid Cloudflare Access JWT.",
      }, 200, corsOrigin);
    }

    return json({ error: "Not found" }, 404, corsOrigin);
  },
};
