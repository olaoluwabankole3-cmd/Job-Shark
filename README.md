# Job-Shark

Job-Shark is a personal job discovery and application workflow dashboard.

## Current MVP
- Responsive React + TypeScript dashboard built with Vite.
- Manually add job listings and place them in a review queue.
- Search and filter jobs by title, company, skill, status, and work type.
- Edit a job-seeker profile and preferences.
- Update application statuses and export records to CSV.
- Local browser persistence using localStorage.
- Human-controlled workflow: approval means approved for preparation only; it does not submit an application.

## Important limitations
- Included rows are labelled demo data and are not real vacancies.
- Live job discovery, automated eligibility analysis, AI-tailored answers, secure CV storage/uploads, browser form filling, server-side storage, and authentication are not connected yet.
- Fit scores are illustrative only.
- Data is stored in the browser profile and is not synced across devices.

## Run locally
Requirements: Node.js 20+ and npm.

    npm install
    npm run dev

Open the local URL printed by Vite, usually http://localhost:5173.

Production build:

    npm run build
    npm run preview

## Deploy to Cloudflare Pages
1. Open Cloudflare dashboard → Workers & Pages.
2. Choose Create application → Pages → Connect to Git.
3. Connect GitHub and choose olaoluwabankole3-cmd/Job-Shark.
4. Build settings:
   - Framework preset: Vite
   - Build command: npm run build
   - Build output directory: dist
5. Deploy.

Pushes to the connected branch can trigger new deployments.

## Backend scaffold added
A starter Cloudflare Worker now lives in `worker/`:
- `worker/src/index.ts` exposes read-only `/` and `/health` routes.
- `worker/wrangler.toml` contains the Worker configuration and a placeholder for D1 binding.
- `worker/schema.sql` defines the initial profile, job and application-event tables.
- The API intentionally does not expose job/profile reads or writes yet. Authentication and user-level access controls must be implemented before those endpoints are enabled.

### Local Worker preview
From the repository root:

    cd worker
    npm install
    npx wrangler dev

The local Worker preview should expose `/health` on the URL printed by Wrangler. This scaffold has not yet been deployed to Cloudflare.

## Planned roadmap
1. Add authentication and user-scoped API access before connecting private records.
2. Create a D1 database and apply the schema in `worker/schema.sql`.
3. Connect the dashboard to the authenticated API and migrate from browser-only storage.
4. Define screening rules for location/work authorization, remote restrictions, work type, experience, skills and salary.
5. Connect permitted job feeds/APIs, preserve source URLs and deduplicate stale listings.
6. Add private CV storage and tailored application document preparation.
7. Add an application review screen showing the exact job, CV and answers before approval.
8. Add Playwright-assisted browser form filling in a separate supported runtime; pause before final submission and respect site terms, CAPTCHA and anti-bot requirements.
9. Add audit logs, scheduled discovery and follow-up reminders.

## Architecture direction
- Frontend: Vite + React on Cloudflare Pages.
- API and scheduled discovery: Cloudflare Workers.
- Relational records: Cloudflare D1.
- Private CV documents: Cloudflare R2 with access controls.
- Browser automation: separate Playwright runner, initially on Windows or another suitable runtime. Cloudflare Pages/Workers alone are not a general desktop Chromium runtime.
