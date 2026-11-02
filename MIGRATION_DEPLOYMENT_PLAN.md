# Adometa CRM Migration Deployment Plan

Date: 2026-11-02

## Gate

**BLOCKED — no staging database connection or migration history is available.**

This is a plan only. No migration is applied automatically.

## Local inventory

The expected ordered set is:

`202611020001` through `202611020021`

Migration 021 (`payment_qr_hardening`) is additive and requires earlier organization, profile, subscription and payment objects. In particular, it uses payment tables/statuses from 012 and organization authorization helpers established by earlier migrations. Migration 020 must precede it for the complete platform billing foundation.

## Inspect applied history first

Run against the confirmed staging project only:

```sql
select version
from supabase_migrations.schema_migrations
order by version;
```

Save the output privately. Compare versions exactly with the local migration filenames. Do not infer pending status from the repository, timestamps or a previous deployment report.

## Apply pending migrations safely

1. Confirm the Supabase project reference is staging, not production.
2. Take and verify a staging backup or snapshot.
3. Check for gaps, duplicates or versions applied outside this repository.
4. Review dependencies and inspect every pending SQL file.
5. Apply only missing migrations in ascending numeric order using the approved Supabase CLI/dashboard workflow.
6. Stop on the first SQL error; do not skip, rerun or manually mark a version applied.
7. Re-query `supabase_migrations.schema_migrations`.
8. Verify expected schema objects, grants, RLS policies and function definitions.
9. Run database/security advisors.
10. Record command output and evidence in the private staging test log.

Do not reset, truncate, drop, overwrite or apply this plan to production.

## Required verification matrix

| Area | Evidence required | Current status |
|---|---|---|
| Migration history | Applied versions and SQL output | BLOCKED |
| Schema | Tables, indexes, constraints and functions | BLOCKED |
| RLS | Enabled state and effective policies | BLOCKED |
| Security-definer RPCs | Search path, grants and role checks | BLOCKED |
| Storage | Buckets and tenant-safe object policies | BLOCKED |
| Authentication | Real role accounts and expiry behavior | BLOCKED |
| Tenant isolation | Organization A/B API, RPC and Storage denial tests | BLOCKED |
| Google Sheets | OAuth, import, incremental sync and disconnect | BLOCKED |
| Billing | Plan, subscription, MRR and history checks | BLOCKED |
| YouPI | Sandbox signature, amount, replay and reconciliation tests | BLOCKED |
| QR payments | Provider QR contract, expiry and manual-review tests | BLOCKED |

## Rollback and stop conditions

Stop and obtain review if:

- The target cannot be proven to be staging.
- Applied history is missing, inconsistent or contains unknown versions.
- A migration attempts destructive behavior or conflicts with an existing policy.
- RLS, grants or function definitions differ from the expected authorization model.
- Any payment event can activate a subscription without verified reconciliation.
- Any cross-tenant read/write or Storage access succeeds.

Do not roll back by resetting the database. Use the approved staging recovery procedure and preserve evidence.

## Exact next action

Obtain staging access, run the history query, and return the applied-version list for comparison. Until then, all database and staging verification rows remain **BLOCKED**.
