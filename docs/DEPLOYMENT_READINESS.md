# Deployment Readiness

**Status: BLOCKED pending staging, database, authentication and hosting evidence.** This guide records the repository state and deployment sequence; it does not deploy services or change project settings.

## Recommended architecture

Based on the actual code:

1. **Frontend:** static Vite `dist/` on Hostinger (already has an Apache SPA fallback) or Vercel.
2. **Backend:** two persistent Node.js 20.6+ services from this repository on Railway or another long-running container host:
   - database API: `npm run mysql:api`
   - sync worker: `npm run mysql:worker`
3. **Primary database and Auth:** Supabase PostgreSQL/Auth.
4. **Replica:** MySQL reachable only from the backend private network, TLS required.
5. **DNS/SSL:** selected frontend host's custom-domain controls, with provider-issued record values.

Hostinger is the least-change frontend choice because `public/.htaccess` supplies SPA fallback. Railway is suitable for the persistent Node API and worker, but its service networking, secrets and deployment must be configured and verified by the operator. Vercel is also suitable for the static frontend; configure SPA routing and confirm that real guide files under `/domain-guides/` take precedence. No provider is connected or endorsed as deployed.

## Current gates

| Gate | State |
|---|---|
| Install, lint, test, build | Local checks pass; live DB tests skipped. |
| Frontend environment | Missing in current runtime; configure per deployment target. |
| Supabase schema | 27 ordered SQL migration files exist; remote migration history is unknown. |
| Migration 026 | Reviewed in source; not applied. |
| Migration 027 / MySQL migration 002 | Added for server-only public enquiries and their replica; not applied. |
| MySQL | Driver and services exist; credentials/host absent and live test skipped. |
| API/worker | Source and npm scripts exist; no persistent service deployed. |
| Supabase Auth URLs | Must be configured manually per environment. |
| Custom domain | No real DNS/TLS verification performed. |
| Root sitemap | API output exists; static root publication is not configured. |

## Local release checks

From the repository root, using Node.js 20.6 or newer:

```powershell
npm install
npm run lint
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

`npm run build` outputs the React application and the HTML guides into `dist/`. Local preview is not proof of cloud configuration or production availability.

## Deploy staging in order

1. Create a separate staging Supabase project and a disposable MySQL database.
2. Verify project identity, backups, migration history, least-privilege accounts and private TLS connectivity.
3. Follow [Supabase migration guide](./SUPABASE_MIGRATION_GUIDE.md); do not apply 026 until the previous migration history is reconciled.
4. Set server-only API/worker values in the host secret manager. Set only public `VITE_` frontend values in the frontend build environment.
5. Run the reviewed MySQL schema migration in staging, then staging backfill and reconciliation.
6. Start the API and worker as separate persistent services. Confirm `/health/live`, then Super Admin `/health/db` from the UI.
7. Deploy the static frontend to a staging origin and check all routes, guides, auth flows, CORS and mobile layouts.
8. Configure Supabase Auth callbacks and provider OAuth callbacks for staging.
9. Run live MySQL and Supabase tests only against disposable staging accounts/databases.
10. Configure root sitemap publication and verify that the application origin serves valid XML and robots policy.
11. Record results in the production checklist. Production is a separate approval/deploy step.

### Public contact and pricing

- Set `VITE_DATABASE_API_URL` to the deployed server API origin in the frontend build environment. Set `DATABASE_API_ALLOWED_ORIGIN` to the exact staging website origin, or activate the domain through the verified-domain configuration before relying on domain-based API CORS.
- Configure server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for the persistent API. The browser never receives a service-role key.
- After checking migration history, apply migration 027 in staging only. It adds `contact_submissions` with server-only RLS access and an outbox trigger; it depends on migration 025.
- Run `npm run mysql:migrate` with the approved MySQL migration account so existing installations receive version `002_contact_submissions`; deploy the updated API and sync worker.
- Pricing is read from active `subscription_plans` records. The schema contains no currency field; the public page explicitly asks the visitor to confirm currency and commercial terms. The contact page's WhatsApp link is user-initiated. No WhatsApp Business API notification credentials or automatic notification service are configured.
- The API applies idempotency, field validation, honeypot rejection and per-email rate limits. Contact data is personal information mirrored into the configured MySQL replica; establish retention and handling procedures before production launch.

### Publish static sitemap and robots files

After the backend has an active verified canonical hostname and the static frontend has been built, run this from the repository root with the actual public API and canonical HTTPS origins:

```powershell
npm run build
npm run seo:publish -- --api-origin https://YOUR_DATABASE_API_ORIGIN --canonical-origin https://YOUR_VERIFIED_CRM_HOSTNAME
```

The script fetches the generated public sitemap and robots policy, rejects non-canonical/private sitemap entries, writes `dist/sitemap.xml`, and updates `dist/robots.txt` to advertise the site-root sitemap. Upload the resulting full `dist/` folder. This is an explicit per-release publication step; it does not change DNS, API hosting, or Supabase settings. Use real configured origins in the deployment command, not the uppercase examples.

## Host-specific notes

- **Hostinger:** upload the *contents* of `dist/` including `.htaccess`, `robots.txt`, and `domain-guides/`. The fallback excludes existing files/directories, so guide assets should be served directly. The API/worker cannot run as a static-site process; host them separately.
- **Vercel:** build command `npm run build`, output directory `dist`. Configure SPA fallback without shadowing static files and test `/domain-guides/*.html`, `/robots.txt`, and all React routes. The separate API/worker still needs persistent hosting.
- **Railway:** use separate long-running services for `npm run mysql:api` and `npm run mysql:worker`; share code, but only the API needs a public web listener. Add MySQL on a private network or use a private managed endpoint. Do not expose port 3306 publicly.

## External work not performed

No Supabase project settings, DNS records, hosting configuration, GitHub workflow, API service, worker, or production release was modified. Do not treat status labels or source code as a successful deployment.
