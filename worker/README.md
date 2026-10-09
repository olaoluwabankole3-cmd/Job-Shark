# Job-Shark API Worker setup

This is the backend Worker. It must remain separate from the existing `job-shark` frontend Worker.

## 1. Create a dedicated D1 database

In Cloudflare Dashboard, open **Storage & databases → D1 SQL Database** and create a database named `job-shark-db`.

Do not select or reuse any database belonging to another project.

## 2. Apply the schema

From the repository root, install the Worker dependencies and apply the SQL file to the new database:

```bash
cd worker
npm install
npx wrangler d1 execute job-shark-db --remote --file=schema.sql
```

If Wrangler reports that the database name is not configured, create it with `npx wrangler d1 create job-shark-db` and copy the returned database ID into the `[[d1_databases]]` section of `wrangler.toml`.

## 3. Configure access before storing personal records

The current API deliberately exposes only a health check. Do not add public profile or job endpoints until authentication is implemented and enforced server-side. CORS is not authentication. Never place Cloudflare API tokens, CVs, or other secrets in frontend environment variables.

## 4. Deploy separately

After the database binding and authentication are configured, deploy from this directory:

```bash
npx wrangler deploy
```

This deploys `job-shark-api`; it must not replace the existing `job-shark` frontend Worker.

## Current limitations

- The frontend still uses browser `localStorage`; records do not sync across devices.
- D1 tables are defined in `schema.sql`, but private CRUD endpoints are not enabled.
- No live job feed or application submission automation is active.
- Human approval must remain a required checkpoint before any application is finally submitted.
