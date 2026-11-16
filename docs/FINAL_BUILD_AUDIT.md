# Adometa CRM — Final Build Audit

**Audit date:** 2026-11-16  
**Scope:** Repository implementation, migrations, frontend/backend wiring, configuration and local verification. This is not a production penetration test or a live database certification.

## Executive result

The frontend compiles and the local test suite passes, but the application is **not production deployment-ready**. There is no configured Supabase project, MySQL instance, deployed database API/worker, staging user, verified custom domain, or production hosting evidence in the current environment. No migrations, DNS records, production settings, or deployment were changed.

### Feature classification

| Area | Classification | Repository evidence and remaining work |
|---|---|---|
| Public website and authentication screens | Implemented, live verification blocked | React routes and Supabase client exist. Auth, confirmation, reset and recovery flows require actual Supabase Site URL/redirect allowlists and staging end-to-end testing. |
| Session/logout/profile | Implemented, database verification blocked | Auth-state cleanup, logout, profile display and self-profile update are wired. Migration 022 is required for profile writes; test all roles against staging. |
| Company Owner and Organization Admin | Partially implemented | Organization settings, membership roles, teams, invitations and Google Sheets panels exist; live permissions/seat limits and full member-team assignment/reporting are not verified. |
| Manager/Team Lead and Salesperson | Partially implemented | Role-sensitive routes, lead scope, calling, pipeline and personal reports exist. Runtime role matrix, team scopes, mobile pipeline workflow, edit/archive/assignment and activity authorization need staging tests. |
| Lead management | Partially implemented | Listing, search, creation, status changes, timeline and export foundations exist. Lead edit, archive/delete UI, pagination, duplicate review, complete import workflow and full assignment UI are incomplete. |
| Teams and reports | Partially implemented | Team creation/manager and report exports exist. Team membership assignment and requested source/conversion/performance analytics are incomplete. |
| Calling, follow-ups, visits and bookings | Partially implemented | Database-backed views/services exist. Provider telephony is not connected; reminder delivery and complete reschedule workflows are incomplete or not verified. |
| WhatsApp | Partially implemented / provider blocked | Click-to-chat and activity recording exist. No verified WhatsApp Business API delivery integration is configured. |
| Google Sheets | Implemented, external setup blocked | OAuth, token encryption, mapping and sync code exist; credentials, callback registration, worksheet selection UX and live failure/recovery tests are required. |
| Meta Lead Ads | Not enabled; foundation exists | Signed webhook code exists, but UI correctly says Coming Soon/Not Connected. No provider configuration or live verification. |
| Sales pipeline and automation | Partially implemented | Pipeline movement uses an authorization RPC; automation model/views exist. Touch workflows, stage configuration/history UX, scheduling/runtime and live role tests remain. |
| Customer 360 | Partially implemented | Customer search is currently a lead-backed listing; it is not a complete profile with merged timeline, documents, tasks and deal history. |
| Campaigns and UTM | Partially implemented | Some campaign/source fields and schemas exist. Authenticated campaign management currently shows a pending module; UTM attribution/reporting is incomplete. |
| Targets and commission | Partially implemented | Schemas and some reports exist. Complete administration and payout/ledger workflows are not verified. |
| Support tickets and imports | Partially implemented | Tables and some import abstractions exist. End-user support and full import/review/duplicate workflows are incomplete. |
| Notifications | Partially implemented | Notification records and read flows exist; delivery channels, reminders and notification runtime behavior are not live-verified. |
| Super Admin dashboard | Partially implemented | Server-authorized database RPCs and administration panels exist. Pagination, full plans/settings/security modules and live data/audit behavior need verification. |
| MySQL replica | Implemented in code; live integration blocked | `mysql2`, schema, outbox, worker, API, backfill, reconciliation and monitoring exist. No credentials/server or applied Supabase outbox migration; tests are skipped. Current MySQL mirror uses sanitized JSON snapshots, not relational schema parity. |
| Custom domain administration | Implemented in code; external verification blocked | Domain tables/RPC/API/UI and DNS/TLS probe exist in source. Migration 026 is unapplied; no hostname/DNS/TLS/provider test exists. |
| Domain URL registry and guides | Implemented locally | Route registry, canonical helper, `/domain-guides/` and HTML pages build and browser-smoke-test locally. Application is not proven on a deployed custom domain. |
| Sitemap publication | Partially implemented | API endpoints `/seo/sitemap.xml` and `/seo/robots.txt` exist. Root static-host mapping/proxy/publication is absent; the root `public/robots.txt` does not advertise an unverified sitemap. |
| Blog | Not implemented | No blog route, CMS, or blog content system was found. |
| Role-specific documentation | Implemented in app; live authorization unverified | Authenticated `/docs`, `/admin/docs`, and `/saas/admin/docs` pages exist. Do not confuse these with public standalone domain guides. |
| Billing/payments | Partially implemented; checkout unavailable | Platform plan/subscription administration, generic payment history, and manual review records remain. No payment-provider checkout or settlement integration is included. |
| QR payments | Not production-enabled | Review/hardening code exists, but production QR/manual approval is not verified; keep disabled. |

## Repository checks

- Dependency installation: `npm install` completed; npm reported 95 packages audited and zero vulnerabilities.
- Lint/type check: `npm run lint` passed (`tsc -b --pretty false`).
- Build: `npm run build` passed; generated `dist/domain-guides/`.
- Tests: `npm test` passed 94 tests (96 total); 2 live MySQL/Supabase tests skipped due missing disposable staging credentials.
- Added regression coverage for lead search escaping, Meta token URL handling, domain route gating, DNS hostname validation, migration 026 guardrails, and guide links.
- Added an end-to-end local test that mocks the SEO API responses and verifies validated sitemap and robots files are written to the static build output; no live API or domain was tested.
- Fixed lead-search PostgREST filter escaping, moved the Meta Graph access token into the Authorization header, and corrected the anonymous-session metadata effect so public canonical metadata is applied after Supabase resolves a signed-out session.
- Added `npm run seo:publish` for an explicit, validating static-host sitemap/robots publication step after the API has an active canonical domain.
- The latest website task adds a staged-only public enquiry flow, server-served active plan details, contact submissions mirrored through the outbox, manual WhatsApp fallback links and public feature/about/integration/FAQ/legal content. Migration 027 and MySQL mirror migration 002 are not applied here; live submission and WhatsApp behavior remain unverified.
- The runtime environment reports no Supabase, MySQL, or domain API configuration values available. The project `.env` file is empty; it was not read for secrets.
- No production database, DNS provider, OAuth provider, or deployed origin was accessed.

## Deployment readiness assessments

**Score rubric (not percentages):** one point for passing local implementation/build checks, one for successful staging deployment plus live integration/security tests, and one for verified production deployment. A score of `1/3` means only local code-level gates passed. No percentage is inferred.

| Area | Assessment |
|---|---|
| Area | Score | Evidence |
|---|---:|---|
| Frontend | 1/3 | Local lint/build pass; no staging or production deployment verified. |
| Backend | 1/3 | Local API/security tests pass; no service deployment or live health check. |
| Database | 1/3 | Static migration/outbox tests pass; no live connectivity, remote history, or staging migration. |
| Authentication | 1/3 | Local source checks pass; no live Supabase settings or role flows. |
| Custom domains | 1/3 | Local tests/guide build pass; no actual DNS/TLS or production activation. |
| SEO | 1/3 | Metadata/publisher unit checks pass; root static files have not been published against a live API. |
| Security | 1/3 | Local security tests and dependency audit pass; no live tenant/RLS matrix, rate-limit, or production review. |
| Overall | 1/3 | Local release gate passed; staging and production gates remain blocked. Not ready for production traffic. |

## Release blockers

1. Establish disposable staging Supabase and MySQL instances; apply reviewed migrations there only.
2. Deploy and verify the persistent Node API and worker with private MySQL networking.
3. Configure Supabase Auth Site URL and exact allowed redirects; exercise confirmation, recovery, invitation and roles.
4. Configure the static frontend and public SEO route publication with the selected host.
5. Test tenant isolation, Super Admin authorization, backups/restoration, outbox retries/replay and reconciliation.
6. Connect a real custom domain only after provider DNS/TLS configuration; do not mark it live based on local code.
7. Keep provider checkout unavailable until a provider is separately selected, authorized, and verified in staging; do not treat receipts as settlement.

See [deployment readiness](./DEPLOYMENT_READINESS.md), [environment variables](./PRODUCTION_ENV_VARIABLES.md), [migration guide](./SUPABASE_MIGRATION_GUIDE.md), [production checklist](./PRODUCTION_TEST_CHECKLIST.md), and [rollback guide](./ROLLBACK_GUIDE.md).
