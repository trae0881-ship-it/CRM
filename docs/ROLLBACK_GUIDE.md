# Rollback and Recovery Guide

This runbook is for an approved operator. It does not authorize or perform production changes. Prefer reversible configuration rollback and forward database corrections; do not reset or truncate production.

## Before any release

1. Capture the deployed frontend/API/worker versions and current hosting/DNS/Auth settings.
2. Verify recent Supabase backup/PITR coverage and MySQL backup retention; perform a restore test to a separate environment.
3. Record migration history and export schema. Identify the release owner and who can stop the worker/API.
4. Keep credentials in the provider secret manager; never include them in rollback tickets or logs.

## Frontend rollback

1. Redeploy the previous known-good static artifact from the hosting release history.
2. Confirm client assets, SPA fallback, `/domain-guides/`, Auth paths and robots behavior.
3. If runtime environment variables changed, restore the previous frontend *public* Supabase/API origins and rebuild/redeploy. Do not expose service-role or MySQL secrets.

## API and worker rollback

1. Stop or roll back the worker version if it is producing failed or malformed sync events.
2. Keep the Supabase outbox intact; do not delete queued or failed events.
3. Roll back the API/worker to the previous compatible version. Keep API CORS restricted to known frontend origins.
4. Restore service environment settings from the approved secret manager and test connection health.
5. Resume the worker only after checking ordering, retry state and idempotent application. Run reconciliation and review discrepancies.

## Domain/DNS/Auth rollback

1. Select the previous verified active domain as primary in the Super Admin domain page.
2. Restore the prior host-level HTTPS and www/root redirect rules to avoid loops.
3. Restore the previous Supabase Site URL and exact allowed redirect URLs; update provider OAuth callbacks if changed.
4. Keep old DNS records and certificates until login, signup confirmation, recovery, invitations and public routes work.
5. If the new host is unsafe, remove its primary status first; then investigate and remove the record only with audit review.

DNS caches can persist after a change. Do not declare rollback complete until public resolvers and real client flows use the expected destination.

## Database recovery and migrations 026–027

- Migration 026 has not been applied by this audit. It adds domain registry/audit tables, functions, grants and outbox triggers.
- Migration 027 has not been applied by this audit. It adds the server-only contact enquiry table and MySQL outbox trigger; MySQL migration 002 creates its JSON mirror table. If a staged rollout must be stopped, preserve submitted enquiry records and use a reviewed forward correction or approved restore rather than dropping the table.
- Public contact records contain personal information. Before any restore or retention cleanup, confirm the applicable retention policy and consider the independent Supabase backup and MySQL replica state.
- If an approved staging application fails, stop further changes, preserve logs and migration evidence, restore the disposable staging snapshot or use a reviewed corrective migration.
- Production migrations should not be reversed with ad hoc `DROP` statements. A forward fix is preferred; database restore requires explicit owner approval, known recovery point, data-loss assessment and verification.
- Do not remove domain audit history or MySQL outbox events as a cleanup shortcut.
- Restore Supabase primary data and MySQL replica independently. After restoring Supabase, inspect the outbox and reconcile the MySQL replica; after MySQL restore, backfill/reconcile from Supabase without truncating production data.

## Incident closeout

Record impact window, affected services, last good version, recovery actions, data consistency checks, Auth and tenant-isolation retests, DNS observations, and owner sign-off. Rotate a secret only if exposure is suspected or confirmed, and only through the provider's approved secret rotation process.
