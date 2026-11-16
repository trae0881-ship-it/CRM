# Deployment

The static frontend can be deployed to Vercel or Hostinger static hosting that supports SPA fallback. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the intended environment before deployment. The app blocks access with a safe configuration message if either value is missing or the URL is malformed. Build with `npm run build` and upload `dist/`.

Do not apply migrations until the project identity and remote migration history have been verified against the intended staging project. Never expose a service-role key. A secure first administrator must be provisioned through the one-time authenticated setup flow; no default password is provided.

Optional provider adapters (email, SMS, WhatsApp, telephony, and inbound lead sources) require their own server-side credentials and a continuously available Edge Function or API. Basic lead CRUD, assignment, and reporting must remain usable without those providers.

## Database configuration and verification

Supabase PostgreSQL and Auth remain the CRM's primary database. Configure the browser's `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the intended project. Configure `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` only in server-side runtimes that require them; the service-role key must never be embedded in the static build.

The repository includes a server-side MySQL replica implementation (`mysql2`, additive MySQL schema migration, Supabase transactional outbox migration, Node worker, backfill, reconciliation, and Super Admin monitoring API). Live MySQL connectivity and sync remain **BLOCKED** until MySQL/Supabase staging credentials are configured and the staging migration is reviewed/applied. Do not claim the replica is operational from a successful frontend build. See [MySQL setup](./MYSQL_SETUP.md) and [the dual database architecture](./DATABASE_DUAL_ARCHITECTURE.md).

Local automated tests and a production build do not establish database connectivity. Verify both Supabase and any future MySQL instance independently in staging using read/write, connection-loss, duplicate, authorization, organization-isolation, and restore tests. No staging database connection or remote migration history has been verified by this repository audit.

For Vercel, set the two `VITE_` variables in Project Settings and configure the SPA rewrite to `index.html`. For Hostinger, upload the Vite `dist/` output and configure its rewrite/fallback so client routes resolve to `index.html`. Deploy Supabase migrations and the `meta-lead-webhook` Edge Function separately.

## Custom domains and public SEO files

The Super Admin domain screens are `/saas/admin/domains` and `/saas/admin/domains/links`. They require a verified active Super Admin membership and the database API at `VITE_DATABASE_API_URL`; the server also requires its Supabase service-role configuration. The additive domain migration is `202611020026_platform_domains.sql`. Review migration history and apply it only to an approved staging project first. Do not apply it to production without explicit approval.

Standalone setup guides are built into `dist/domain-guides/` and are served at `/domain-guides/`; this separate path does not shadow the authenticated React `/docs` route. Hostinger deployments should retain the static asset/folder bypasses before the SPA fallback. Run `npm run build`, upload the complete `dist/` directory, and check the home page and each guide over the deployed HTTPS origin.

The API generates `/seo/sitemap.xml` and `/seo/robots.txt` using the active verified canonical hostname. Static hosting does not automatically publish these API responses at the public app root (`/sitemap.xml` and `/robots.txt`). Configure a hosting rewrite/proxy or a controlled publication job using the deployment's actual API origin, and verify response status, content type, canonical host, and public-only route contents. `public/robots.txt` is a conservative static policy and intentionally does not advertise an unverified sitemap. No root sitemap or provider rewrite is claimed as configured by this repository.

After selecting a canonical hostname, manually update Supabase Authentication → URL Configuration and any OAuth provider callback allowlists. Configure the provider's domain attachment, DNS records, HTTPS certificate and redirects using values displayed by the provider. The domain screen verifies the TXT ownership challenge and a certificate-validated HTTPS response; it does not change those external settings.

The static frontend cannot run the long-lived MySQL worker or database API. Deploy `npm run mysql:worker` and `npm run mysql:api` as a separate persistent Node.js 20.6+ service/container with server-side secrets and private MySQL network access. Set `VITE_DATABASE_API_URL` to its HTTPS origin and `DATABASE_API_ALLOWED_ORIGIN` to the exact frontend origin. Run `npm run mysql:migrate` with the separate migration account only after reviewing the schema. Backfill staging before worker activation, then verify the Super Admin monitor and reconciliation results. No migration or database service is automatically deployed by the frontend hosting flow.

## Growth Tools deployment

Growth Tools are intentionally not bundled into the React application. The selected upstream versions and full source commits are recorded in [GROWTH_TOOLS.md](./GROWTH_TOOLS.md) and [LICENSES.md](./LICENSES.md). No service has been deployed, and no Docker image, credentials, health endpoint, or backup exists in this repository. Open SEO and Open SEO Crawler are blocked by confirmed SSRF issues; LeadPro is blocked by its unresolved license; the other two remain blocked pending complete dependency/build review. Do not mark any service deployed or healthy until blockers are resolved and a real isolated staging deployment and checks are recorded.

- Keep service ports private; expose only an authenticated Adometa backend adapter.
- Store provider tokens, SMTP credentials and service credentials in server-side secret storage.
- Require Super Admin authorization and an explicit per-tool access grant.
- Record actor, organization, tool, action, result and job identifier in audit logs.
- Validate and re-resolve target URLs for every redirect before crawling.
- Block loopback, private, link-local and cloud metadata addresses.
- Respect robots.txt, terms, rate limits and suppression requests.
- Require review before importing discovered leads or sending campaigns.
- Pin each image to a built digest and source revision, run as a non-root user where supported, drop unnecessary capabilities, use a read-only root filesystem where supported, and apply per-service CPU, memory, process, network, and storage quotas.
- Use separate persistent volumes and encryption keys per service. Back up databases and required uploaded/configuration data, encrypt and restrict backups, document retention, and test restore before production use.

Open SEO, Open SEO Crawler, and Google Maps Scraper Kit require isolated workers. LeadPro is blocked until written licensing permission is verified. listmonk requires its own PostgreSQL/SMTP deployment and the completed AGPL checklist in [LISTMONK_AGPL_COMPLIANCE.md](./LISTMONK_AGPL_COMPLIANCE.md). CPU, RAM, storage, and concurrency requirements have not been measured for Adometa workloads; record vendor requirements and run representative isolated staging load tests before setting production quotas. Do not invent sizing values. Health status remains `NOT DEPLOYED` until authenticated health and recovery checks pass.

No separate per-project Compose configurations are supplied because none is cleared for deployment: two projects have confirmed SSRF issues, LeadPro's license is unresolved, and the remaining projects have incomplete dependency/build checks. Local source patches and validation results for the two SSRF issues are documented in [SECURITY_REMEDIATION_PATCHES.md](./SECURITY_REMEDIATION_PATCHES.md); they are not upstream commits and do not clear either deployment block. After blockers are fixed and review passes, create a separately pinned deployment file per cleared project and include its image digest, private network, health check, restart policy, resource limits, persistent storage, backup/restore procedure, and secret names (never secret values) in the deployment record.

## Phase 8 staging and recovery

Use a disposable staging Supabase project first. Apply migrations 001-018 in order and retain the migration history output. Take a verified backup before any production migration; do not assume a backup exists because a provider advertises backups.

For recovery, stop writes, preserve audit and error logs, identify the last known good migration, restore to a separate environment, validate Auth/RLS/workflows, and promote only after review. Use a forward corrective migration for schema fixes. Confirm point-in-time recovery and Storage object recovery independently with the Supabase project owner.
