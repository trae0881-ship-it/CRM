# Changelog

## 2026-11-14 — MySQL replica implementation

- Added a server-side `mysql2` connection pool, versioned MySQL mirror schema, transactional Supabase outbox migration, persistent worker, retry/replay operations, backfill, reconciliation, and Super Admin monitoring API/view.
- Added server-only MySQL/Supabase configuration validation and explicit Node deployment/setup documentation; browser code receives only the monitoring API URL.
- Added focused unit/static tests and opt-in live MySQL and Supabase integration tests. Live database access and synchronization remain **BLOCKED** until staging credentials are configured and the Supabase outbox migration is approved and applied.
- Documented that current MySQL tables retain sanitized source rows as JSON snapshots and do not yet reproduce typed MySQL columns or source foreign-key constraints; this is not relational schema parity.
- Added the initial Super Admin custom-domain registry, server-verified DNS/TLS checks, centralized route inventory, canonical URL helper, and standalone responsive HTML domain guides under `/domain-guides/`.
- Added domain configuration and audit migration 026; it remains unapplied. Supabase Auth allowlists, provider DNS/SSL, and root sitemap publication still require explicit external configuration and verification.

## 2026-11-14 — Final deployment audit

- Added the requested production audit, readiness, environment, Supabase migration, custom-domain, production test, and rollback guides.
- Added an explicit static SEO publication command that validates canonical/public sitemap entries before writing root sitemap and robots files to the build output.
- Escaped PostgREST lead search delimiters/wildcards, moved Meta lead access tokens from URL query parameters to an Authorization header, and ensured anonymous session transitions refresh public page metadata.
- Local verification: dependency audit clean; lint/build pass; 85 tests pass and two live staging database tests remain skipped pending disposable credentials.
- Added a mocked-fetch end-to-end test for the SEO publication command, including root `sitemap.xml` and `robots.txt` output.

## 2026-11-14

- Added a fail-closed frontend configuration check for the two Supabase browser settings; missing or invalid values now show a safe setup message rather than the demo workspace.
- Added an exact source-derived environment variable inventory and corrected `.env.example` to include referenced Edge Function settings only.
- Documented existing role boundaries and migration deployment constraints in the environment/deployment guidance.
- Formalized the current Adometa reference palette as shared design tokens and fixed the mobile public navigation button hit area and keyboard close behavior.
- Connected organization settings and scoped audit activity to the existing Supabase tables/RLS, and added a narrowly scoped additive policy so Company Owners can read their own organization audit history.
- Documented both supplied design references, recorded the five-width public browser check, and updated the staging migration checklist through migration 024.
- Added role-scoped salesperson, organization administrator, and SaaS Super Admin documentation centers with search, workflow illustrations (clearly not screenshots), keyboard-accessible chapter navigation, print styles, and article metadata.
- Enforced documentation routes using the active database membership and redirected unauthorized members to an allowed help center; documentation routes do not fetch CRM workspace records.
- Added mobile chapter-drawer keyboard dismissal, scroll locking, searchable article navigation, and hash links into the WhatsApp setup chapter.
- Added an organization-scoped WhatsApp Business setup-required notice with no credential inputs; no provider connection is claimed because no supported server integration is configured.
- Aligned login surfaces to the inspected Adometa reference colors and added reusable authentication design tokens.
- Added role-matrix, documentation inventory, WhatsApp secret-safety, responsive-navigation, and login-token tests.
- Initial database audit found no MySQL implementation or credentials; the subsequent server-side replica implementation is recorded above.
- Documented Supabase-only record ownership and the blocked MySQL integration boundary without adding unused MySQL variables, speculative migrations, or dual writes.
