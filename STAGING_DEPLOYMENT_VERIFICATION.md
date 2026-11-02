# Staging Deployment Verification

Date: 2026-11-02

## Gate result

**BLOCKED — STAGING NOT CONFIGURED.**

No Supabase project URL, staging credentials, `supabase/config.toml`, migration history, authenticated test accounts, Google OAuth credentials or deployed Edge Function logs were available in this workspace. No migration or database operation was executed. Production readiness is not claimed.

## Repository and build audit

| Check | Result | Evidence |
|---|---|---|
| Migrations 001-021 present and ordered | COMPLETE AND LOCALLY VERIFIED | 21 SQL files found in `supabase/migrations` |
| Merge conflict markers | COMPLETE AND LOCALLY VERIFIED | No `<<<<<<<`, `=======` or `>>>>>>>` markers found |
| Secrets committed | COMPLETE AND LOCALLY VERIFIED | `.env` is empty; `.env.example` contains placeholders/names only; no private key pattern found |
| Lockfile | COMPLETE AND LOCALLY VERIFIED | `package-lock.json`, lockfile version 3 |
| Hostinger fallback | COMPLETE AND LOCALLY VERIFIED | `dist/.htaccess` exists after build |
| Git commit state | PASS | Worktree is clean on `main`; no modified or untracked files were present at audit start. No commit or push was created by this audit. |

## Migration readiness

The local migration sequence is 001 through 021. Migrations 019 and 020 are additive and contain organization-scoped Google Sheets/pipeline access and platform billing RPCs. Migration 021 adds payment idempotency, state history and pending QR/manual review records. Existing migrations contain policies created without a universal `drop policy if exists` pattern, so rerunning an already-applied migration is unsafe.

The applied/pending boundary is **NOT VERIFIED** because there is no Supabase connection or migration history available. Do not run all 001-020 blindly. First query `supabase_migrations.schema_migrations`, compare versions, and apply only missing versions in order after reviewing dependencies.

## Database, RLS and Storage

**NOT VERIFIED.** The following require staging access:

- Tables, functions, indexes, constraints and migration history
- RLS enabled state and effective policies
- `SECURITY DEFINER` search paths and execute privileges
- Platform billing RPC authorization
- Google Sheets integration/sync authorization
- Pipeline movement authorization
- Storage buckets and QR/file policies
- Supabase security advisor output

## Authentication and tenant isolation

**NOT VERIFIED.** Real staging accounts are required for:

- Super Admin
- Company Owner A/B
- Organization Admin A/B
- Manager A/B
- Salesperson A/B

Required tests include direct routes, REST/RPC requests, direct organization-ID substitution, lead reads/writes, subscription access, integration access, Storage access and suspended/deactivated membership behavior.

## Google Sheets

Local status: **INTEGRATION FOUNDATION ONLY**.

The OAuth and sync Edge Functions, encrypted server-side token metadata, source-row mapping, duplicate protection, missing-row review and cron-secret path are implemented and covered by local tests. Real OAuth consent, spreadsheet access, initial/incremental sync, token refresh, disconnect, scheduled sync and Organization A/B isolation are **NOT VERIFIED**.

Required staging secrets:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_SHEETS_REDIRECT_URI`
- `GOOGLE_SHEETS_TOKEN_ENCRYPTION_KEY`
- `GOOGLE_SHEETS_SYNC_CRON_SECRET`

Google Sheets must not be shown as connected until a real account authorization and successful sync are recorded.

## Platform billing

Local status: **COMPLETE AND LOCALLY VERIFIED** for RPC definitions and UI behavior.

Migration 020 adds authoritative dashboard stats, company management RPCs, subscription assignment/update and subscription history. It explicitly does not create payment records during plan assignment. Real MRR, seat limits, expiry, history and payment-neutral behavior remain **NOT VERIFIED** in staging.

## Pipeline permissions

Local status: **COMPLETE AND LOCALLY VERIFIED** for the authorization logic.

Migration 019 restricts movement to Company Owner/Organization Admin, permitted team Manager or assigned Salesperson. Actual RPC/RLS behavior for four real roles and two organizations remains **NOT VERIFIED**.

## Payment gate

| Gate | Status | Reason |
|---|---|---|
| Supabase migrations | BLOCKED | Applied history and staging connection unavailable |
| RLS and tenant isolation | BLOCKED | No authenticated staging organizations |
| Authentication and role permissions | BLOCKED | No staging accounts |
| Google Sheets integration | BLOCKED | No Google credentials or real sync |
| YouPI sandbox integration | BLOCKED | Credentials and provider contract unavailable |
| QR payment integration | BLOCKED | No verified dynamic QR contract; manual receipts remain pending |
| Billing/subscription verification | BLOCKED | No live database/payment records |
| Edge Function/browser logs | BLOCKED | No deployed staging functions/log access |

Payment local status is **COMPLETE AND LOCALLY VERIFIED** for fail-closed configuration, idempotency, webhook replay/amount guards, UPI reconciliation gating and pending manual-review schema. It is not live payment verification.

## Regression results

- `npm test`: **45 passed**
- `npm run lint`: **passed**
- `npm run build`: **passed**
- `npm audit --audit-level=high`: **0 vulnerabilities**
- Browser console/API/Edge Function logs: **NOT VERIFIED**

## Required manual staging procedure

1. Create or select a disposable Supabase staging project and take a verified backup/snapshot.
2. Configure local Supabase CLI linking without committing credentials.
3. Query applied versions:

```sql
select version
from supabase_migrations.schema_migrations
order by version;
```

4. Compare the result with local migrations `202611020001` through `202611020021`.
5. Apply only pending migrations in numeric order through `202611020021` using the approved Supabase migration workflow. Never reset, truncate or drop production data.
6. Deploy Edge Functions and configure server-only secrets.
7. Create the nine staging identities and two organizations listed above.
8. Run the cross-tenant, billing, pipeline, Google OAuth and Storage tests.
9. Run Supabase database/security advisors and inspect Edge Function logs.
10. Configure YouPI only in staging with `YOUPI_ENABLED=false`, execute the scenarios in `BILLING_TEST_REPORT.md`, and enable it only after provider contract, signature and QR behavior are independently verified.
11. Record actual SQL/API responses and update this report before any production decision.

## Production recommendation

**DO NOT DEPLOY TO PRODUCTION YET.** Local implementation is validated, but the production gate requires successful staging migration, RLS, authentication, cross-tenant, billing, Google Sheets, Storage and Edge Function verification. 
