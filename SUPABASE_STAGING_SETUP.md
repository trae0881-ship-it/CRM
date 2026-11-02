# Adometa CRM Supabase Staging Setup

Date: 2026-11-02

## Status

**BLOCKED — staging credentials and project details are unavailable.**

No production operation, database reset, migration application or deployment was performed.

## Create a safe staging target

1. Create or select a disposable Supabase staging project.
2. Confirm its project reference and URL; do not use the production project.
3. Configure an approved backup/snapshot procedure.
4. Configure Auth email provider, redirect URLs and invitation settings.
5. Create unique disposable test accounts for two organizations and the required roles.
6. Store test IDs in a private operator log, not in this repository.

## Client configuration

Create an ignored local `.env` from `.env.example` with staging values only:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Never use `VITE_` for service-role, payment, OAuth client secret, encryption key or bootstrap secret values.

## Edge Function configuration

Deploy only after migration history has been checked and the function source has been reviewed. Required names are:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPER_ADMIN_BOOTSTRAP_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_SHEETS_REDIRECT_URI`
- `GOOGLE_SHEETS_TOKEN_ENCRYPTION_KEY`
- `GOOGLE_SHEETS_SYNC_CRON_SECRET`
- `YOUPI_API_URL`
- `YOUPI_CREATE_PAYMENT_PATH`
- `YOUPI_MERCHANT_ID`
- `YOUPI_WEBHOOK_SECRET`
- `YOUPI_RETURN_URL`
- `YOUPI_API_CONTRACT_CONFIRMED`
- `YOUPI_ENABLED`
- `YOUPI_TEST_MODE`

Enter values through Supabase Edge Function Secrets or another approved secret manager. Do not print, commit or place them in browser storage or logs. Keep `YOUPI_ENABLED=false`, `YOUPI_API_CONTRACT_CONFIRMED=false` and `YOUPI_TEST_MODE=true` until the provider contract and sandbox are independently verified.

## Function deployment inventory

The repository contains:

- `bootstrap-super-admin`
- `google-sheets-oauth`
- `google-sheets-sync`
- `invite-member`
- `youpi-create-payment`
- `youpi-webhook`
- `meta-lead-webhook`

Meta integration remains disabled and must not be enabled as part of staging payment verification. `supabase/config.toml` is not present, so project linking and function deployment settings must be configured explicitly in the operator environment and must not be committed automatically.

## Post-migration verification

After applying only pending migrations:

1. Verify tables, indexes, constraints, functions and grants.
2. Verify RLS is enabled on all exposed tenant tables.
3. Verify `SECURITY DEFINER` functions have a fixed `search_path`, restricted grants and role checks.
4. Verify Storage buckets and object policies, including any receipt paths.
5. Run Supabase database and security advisors.
6. Deploy functions and inspect logs for authentication, provider and replay failures.
7. Execute Organization A/B direct URL, RPC, REST and Storage isolation tests.

## Exact next action

Provide the staging project reference and authorized deployment access to the release operator. Then run the migration-history query and follow [MIGRATION_DEPLOYMENT_PLAN.md](./MIGRATION_DEPLOYMENT_PLAN.md). Do not provide secrets in chat or source control.
