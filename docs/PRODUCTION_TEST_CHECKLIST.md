# Production Test Checklist

Complete this checklist in staging before production approval. Record evidence, date, tester and environment without including secrets, tokens, personal lead data, or sensitive database errors.

## Build and static deployment

- [ ] `npm install` completes from the lockfile.
- [ ] `npm run lint` passes.
- [ ] `npm test` passes; skipped live tests are run separately against disposable staging services.
- [ ] `npm run build` succeeds and includes `dist/domain-guides/`, guide assets and `dist/robots.txt`.
- [ ] Deploy the static directory to staging; refresh direct routes such as `/login`, `/reset-password`, `/saas/admin/domains` and `/domain-guides/DNS_CONFIGURATION.html`.
- [ ] Confirm no `localhost`, staging URL or secret appears in the production asset bundle.
- [ ] Check desktop/tablet/mobile layouts and browser console/network errors.

## Supabase, Auth and tenant isolation

- [ ] Verify Supabase project identity and migration history against 001–026; apply only approved staging migrations.
- [ ] Run Supabase Auth sign-up/confirmation, sign-in, password recovery, invitation and logout.
- [ ] Test expired/revoked session behavior and protected route denial.
- [ ] Test a two-organization matrix: salesperson, manager, organization admin, company owner, auditor and Super Admin.
- [ ] Attempt cross-organization reads/writes through direct PostgREST and RPC calls; expect database denial.
- [ ] Verify suspended organizations lose tenant access; reactivate and retest.
- [ ] Verify profile changes cannot alter role, organization or permissions.
- [ ] Verify domain management/audit tables deny direct client reads/writes and only service-side RPCs manage domains.
- [ ] Review Supabase Security Advisor, Storage rules, function auth config and logs.

## MySQL replica

- [ ] Provision a disposable MySQL test database; verify private network access and TLS certificate validation.
- [ ] Apply reviewed MySQL schema migration with the migration account.
- [ ] Set `MYSQL_TEST_DATABASE` exactly equal to the disposable `MYSQL_DATABASE` and run `npm run mysql:test`.
- [ ] Set staging-only Supabase test values and run `npm run mysql:test`; verify Auth and PostgREST access.
- [ ] Verify insert/update/delete tombstone, idempotency, ordering, retries, replay, backfill resume, reconciliation and organization scoping.
- [ ] Stop/restart the worker and test MySQL/Supabase connection loss and recovery.
- [ ] Confirm sanitized payloads do not include passwords, provider tokens, or service credentials.
- [ ] Verify API `/health/live`, Super Admin `/health/db`, CORS and unauthorized request denial.

## Custom domain and SEO

- [ ] Add actual provider-issued DNS records; verify root and www separately.
- [ ] Confirm TXT challenge mismatch keeps DNS unverified and cannot activate.
- [ ] Confirm absent, untrusted or hostname-mismatched TLS keeps SSL unverified and cannot activate.
- [ ] Confirm the API alone records verification and that only verified active domains may become primary.
- [ ] Test canonical redirect, HTTPS redirect, alternate hostname, path/query preservation and no redirect loop.
- [ ] Test `/domain-guides/` pages and assets; confirm authenticated `/docs` route still requires membership.
- [ ] Configure and request public-origin `/sitemap.xml` and `/robots.txt`; validate status, MIME type, canonical host, robots exclusions and public-only sitemap paths.
- [ ] Check canonical, Open Graph, Twitter, and JSON-LD metadata on each public indexable page.
- [ ] Confirm login, dashboard, admin, Super Admin, sessions and protected API paths are not in the sitemap and use noindex where applicable.

## Integrations and business flows

- [ ] Verify Google OAuth state, redirect, token encryption, disconnect, spreadsheet/worksheet selection, manual sync, row errors and replay.
- [ ] Keep Meta Lead Ads disabled until webhook signature, page mapping, dedupe, error recording and lead scope pass provider staging.
- [ ] Keep YouPI and production QR payments disabled; never activate subscriptions on unverified webhook/client state.
- [ ] Test lead create/search/status/assignment/activity permissions and data exports.
- [ ] Test teams, invites, seat limit, calling, follow-ups, notifications, bookings, pipeline moves and reports for each role.
- [ ] Mark incomplete CRM modules clearly; do not claim customer 360, campaign analytics, support/import workflows or integrations are complete without functional evidence.

## Recovery and approval

- [ ] Verify Supabase and MySQL backup configuration; perform and document a restore test in isolated staging.
- [ ] Record all migrations, service versions, environment names, DNS records and change owners.
- [ ] Confirm security findings, accepted limitations and monitoring/alert owners.
- [ ] Obtain explicit production release approval; production migration, DNS and deployment remain manual.
