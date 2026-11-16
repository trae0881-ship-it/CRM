# Adometa CRM Staging Readiness Report

Date: 2026-11-02

## Final status

| Area | Status | Result |
|---|---|---|
| Local repository safety audit | PASS | Clean `main` worktree; no tracked environment secrets found |
| Local migration inventory | PASS | Migrations `202611020001` through `202611020021` exist in numeric order |
| Supabase staging verification | BLOCKED | No staging project, credentials, migration history, or deployed logs are available |
| Payment safety controls | PASS locally / BLOCKED in staging | Fail-closed code and static tests pass; no provider test was executed |
| Production readiness | BLOCKED | Staging database, RLS, auth, tenant isolation, Storage and provider tests are outstanding |

## Git safety

- Branch: `main`, tracking `origin/main`.
- Latest commit: `373327e` (`Merge remote main into local main`).
- Worktree status: clean; no modified or untracked files.
- `.env` exists locally, is empty, and is ignored.
- `.env.example` is tracked and contains placeholder values and variable names only.
- No private-key pattern or live Supabase/provider value was found in the repository audit.
- No commit or push was performed by this audit.

See [GIT_RELEASE_CHECKLIST.md](./GIT_RELEASE_CHECKLIST.md) before creating a release commit.

## Migration audit

All 21 expected migration files are present and ordered from `202611020001` through `202611020021`.

Migration 021 depends on objects created earlier:

- `organizations`, `profiles`, `subscriptions` and `payment_transactions`.
- Payment tables and statuses from migration 012.
- Organization role helpers such as `has_org_role`.
- Platform/profile authorization helpers used by its RLS policies.

The applied boundary is unknown. The authoritative check is:

```sql
select version
from supabase_migrations.schema_migrations
order by version;
```

Do not assume all versions are pending and do not run the full directory blindly. Compare the returned versions with the local files, review any gap, and apply only missing migrations in order to a confirmed disposable staging project.

## Supabase preparation

`supabase/config.toml` is absent. Edge Functions are present under `supabase/functions`, but deployment configuration and deployed logs are unavailable.

Required server-side names are listed in [SUPABASE_STAGING_SETUP.md](./SUPABASE_STAGING_SETUP.md). Values must be entered only in the staging project or local ignored environment, never in source control.

## Payment safety

Provider checkout, configuration, and webhook handlers have been removed. Generic transaction history, payment-state history and QR-review records remain. The forward migration has not been applied or tested in staging. No payment provider is deployed or verified.

## Exact next action

Create or identify a disposable Supabase staging project, obtain authorized access, inspect `supabase_migrations.schema_migrations`, and execute the staged checklist in [MIGRATION_DEPLOYMENT_PLAN.md](./MIGRATION_DEPLOYMENT_PLAN.md). Until that evidence exists, keep the overall gate **BLOCKED**.
