# Deployment

The static frontend can be deployed to Vercel or Hostinger static hosting that supports SPA fallback. Build with `npm run build` and upload `dist/`. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the deployment environment once Supabase integration is enabled.

Supabase migrations should be applied before enabling production data access. Do not expose a service-role key. A secure first administrator must be provisioned through an authenticated setup flow; no default password is provided.

Optional provider adapters (email, SMS, WhatsApp, telephony, and inbound lead sources) require their own server-side credentials and a continuously available Edge Function or API. Basic lead CRUD, assignment, and reporting must remain usable without those providers.

For Vercel, set the two `VITE_` variables in Project Settings and configure the SPA rewrite to `index.html`. For Hostinger, upload the Vite `dist/` output and configure its rewrite/fallback so client routes resolve to `index.html`. Deploy Supabase migrations and the `meta-lead-webhook` Edge Function separately.

## Growth Tools deployment

Growth Tools are intentionally not bundled into the React application. Each service requires a separate authenticated deployment with private networking, resource limits, timeouts, retry limits, structured logs and health checks.

- Keep service ports private; expose only an authenticated Adometa backend adapter.
- Store provider tokens, SMTP credentials and service credentials in server-side secret storage.
- Require Super Admin authorization and an explicit per-tool access grant.
- Record actor, organization, tool, action, result and job identifier in audit logs.
- Validate and re-resolve target URLs for every redirect before crawling.
- Block loopback, private, link-local and cloud metadata addresses.
- Respect robots.txt, terms, rate limits and suppression requests.
- Require review before importing discovered leads or sending campaigns.

Open SEO, Open SEO Crawler and Google Maps Scraper Kit require isolated workers. LeadPro must not be deployed until its repository license and outreach consent controls are resolved. listmonk requires PostgreSQL, SMTP configuration and AGPL-3.0 compliance review. No service is deployed by this phase; statuses remain `Not configured` until authenticated health checks pass.

## Phase 8 staging and recovery

Use a disposable staging Supabase project first. Apply migrations 001-016 in order and retain the migration history output. Take a verified backup before any production migration; do not assume a backup exists because a provider advertises backups.

For recovery, stop writes, preserve audit and error logs, identify the last known good migration, restore to a separate environment, validate Auth/RLS/workflows, and promote only after review. Use a forward corrective migration for schema fixes. Confirm point-in-time recovery and Storage object recovery independently with the Supabase project owner.
