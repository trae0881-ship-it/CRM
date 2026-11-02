# Staging verification report

Verification date: 2026-11-02

## Environment result

Status: **WAITING FOR DEPLOYMENT**

No staging environment is configured in this workspace. The repository has no `supabase/config.toml`, no local `.env` file, no server-side Supabase secrets, and no authenticated staging accounts. The only configuration file is `.env.example`; it is not evidence of a connected or authenticated environment.

No Supabase project was connected, no migration was applied, and no production or staging data was changed.

The active workspace is `C:\Users\pc\Desktop\crm`; the user-requested `.gemini\antigravity\scratch\adometa-crm` path is not the active workspace and was not modified.

## Local verification

| Check | Result |
|---|---|
| `npm test` | 34 passed |
| `npm run lint` | passed |
| `npm run build` | passed |
| `npm audit --audit-level=high` | 0 vulnerabilities |
| Phase 10 migration/RLS source audit | passed locally |

These are local tests only and are not database-backed staging verification.

## Skipped live tests

The following were skipped because the required environment was unavailable:

- Sign-up, sign-in, session persistence, reset and invitation acceptance.
- Inactive-user and suspended-company rejection.
- All five role route and permission tests.
- Two-organization direct-query and RPC RLS tests.
- Lead, customer, call, follow-up, visit, booking, payment, campaign, ticket, import and notification isolation.
- Supabase Edge Function authorization and webhook delivery tests.
- YouPI-PG sandbox checkout, webhook, replay and reconciliation tests.
- Meta, WhatsApp and telephony provider tests.
- Growth Tool health checks and worker tests.
- Backup restore and point-in-time recovery verification.
- Fresh-session visibility after every database workflow.

See [`SUPABASE_SETUP_CHECKLIST.md`](./SUPABASE_SETUP_CHECKLIST.md), [`RLS_TEST_REPORT.md`](./RLS_TEST_REPORT.md), [`AUTHENTICATION_TEST_REPORT.md`](./AUTHENTICATION_TEST_REPORT.md), and [`DATABASE_WORKFLOW_REPORT.md`](./DATABASE_WORKFLOW_REPORT.md) for executable staging steps.

## Required staging execution

1. Create a disposable Supabase staging project and configure Auth.
2. Apply migrations `202611020001` through `202611020018` in order after reviewing the SQL. Migration 016 is required for authorized, auditable pipeline movement, migration 017 adds secure Super Admin bootstrap, and migration 018 hardens organization administration.
3. Create Organization Alpha and Organization Beta.
4. Create one Super Admin, one Owner, one Organization Admin, one Manager and two Salespeople per organization.
5. Execute the role and cross-tenant matrix in [`docs/TESTING.md`](C:/Users/pc/Desktop/crm/docs/TESTING.md).
6. Record direct table queries, RPC results, denied requests, webhook results and timestamps.
7. Configure provider sandbox credentials only, then repeat payment and webhook tests.
8. Capture evidence before considering any feature database-backed and staging verified.
