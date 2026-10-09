# Job-Shark API Worker setup

This backend Worker is separate from the existing `job-shark` frontend Worker. Never deploy this configuration over the frontend Worker.

## Database

The dedicated D1 database `job-shark-db` is configured in `wrangler.toml`. The schema in `schema.sql` creates `user_profiles`, `job_opportunities`, and `application_events`. Apply schema statements in the Cloudflare D1 Console if running the entire file as one request fails.

## Authentication is required

All `/api/*` routes require a valid Cloudflare Access JWT. The Worker validates the JWT signature using Cloudflare Access public keys and checks the issuer, audience, and expiry. It derives the owner ID from the verified token's `sub` claim; clients cannot choose a different user ID.

Before deploying the API, create a Cloudflare Access self-hosted application for the API hostname and an allow policy for the intended users. From the Access application, copy its **Application Audience (AUD) Tag**. Find the team domain in Cloudflare Zero Trust settings.

Configure these non-secret Worker variables in the `job-shark-api` Worker:
- `ACCESS_TEAM_DOMAIN`: the team domain only, such as `example.cloudflareaccess.com` (without `https://`).
- `ACCESS_AUD`: the Access application's audience tag.
- `FRONTEND_ORIGIN`: `https://job-shark.olaoluwabankole3.workers.dev`.

Do not put API tokens or private credentials in the repository or frontend variables. Until `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` are configured, the API fails closed and returns 503 for protected routes. `/health` remains public and reports whether auth is configured.

## Deploy separately

In Cloudflare Workers Builds, create a separate Worker build for this repository:
- Worker name: `job-shark-api`
- Branch: `main`
- Root directory: `worker`
- Build command: `npm install && npm run typecheck`
- Deploy command: `npx wrangler deploy`

Alternatively, deploy from the `worker` directory with Wrangler. Ensure Cloudflare's deployment uses `worker/wrangler.toml`, not the root frontend configuration. The existing frontend Worker `job-shark` must remain untouched.

## Endpoints currently implemented

- `GET /health`: public health/configuration check.
- `GET /api/profile`, `PUT /api/profile`: authenticated profile access.
- `GET /api/jobs`: list only the authenticated user's jobs; optional `?status=`.
- `POST /api/jobs`: create a job for the authenticated user.
- `PATCH /api/jobs/:id`, `DELETE /api/jobs/:id`: update/delete only jobs owned by the authenticated user.

The frontend still uses localStorage until it is explicitly integrated with this API. No live job feed or final application submission automation is active. Human approval must remain required before any application is finally submitted.
