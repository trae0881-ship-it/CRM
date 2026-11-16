# Database plan

Supabase PostgreSQL/Auth remains the primary transactional database. A server-side Node/MySQL replica and transactional Supabase outbox are implemented in source; MySQL deployment and live database synchronization remain **BLOCKED** until credentials are configured and migration 025 is reviewed/applied to staging. See [the dual database architecture](./DATABASE_DUAL_ARCHITECTURE.md), [MySQL setup](./MYSQL_SETUP.md), and [mysql/README.md](../mysql/README.md).

MySQL mirrors approved source rows into namespaced `crm_mirror_*` JSON snapshot tables. It preserves canonical UUIDs, organization IDs, timestamps, deleted-row tombstones, and source row fields in the payload, but does not yet reproduce all PostgreSQL types or enforce the full relational foreign-key schema. It is not a second writeable CRM or a standalone relational source of truth.

All organization-owned tables include `organization_id`, timestamps, and soft-delete fields where appropriate. Foreign keys are scoped and indexes begin with `organization_id` to support tenant isolation and reporting.

Core tables: `organizations`, `profiles`, `organization_members`, `teams`, `team_members`, `invitations`, `leads`, `lead_activities`, `calls`, `follow_up_tasks`, `site_visits`, `bookings`, `campaigns`, `sales_targets`, `subscription_plans`, `subscriptions`, `invoices`, `payments`, `meta_integrations`, `meta_forms`, `webhook_events`, and `audit_logs`. Phase 2 also adds `lead_statuses`, `notifications`, `telephony_provider_configs`, and `provider_webhook_events`.
Migration 012 is a historical payment-schema migration. The forward retirement migration removes its provider configuration and overview function while retaining generic transaction, webhook-delivery, payment-state-history, and QR-review records. Do not edit historical migrations; the legacy provider identifier may remain in migration 012 and existing historical rows.
Migration 013 adds disabled-by-default Growth Tools configuration, organization access grants and tenant-scoped job history. It does not execute third-party tools.

RLS policies derive the active organization and role from `organization_members`, never from an untrusted request body. Agents see assigned leads and active shares; managers see leads assigned to their teams; owners and organization admins see authorized company records. Sensitive multi-row changes use transactions and audit entries. The additive SaaS migrations are `202611020002_add_company_owner_role.sql`, `202611020003_saas_hierarchy.sql`, `202611020004_harden_role_rls.sql`, `202611020005_security_hardening.sql`, `202611020006_lead_journey_sharing.sql`, `202611020007_calling_whatsapp.sql`, `202611020008_status_notifications_provider.sql`, `202611020009_phase_two_operations.sql`, `202611020010_platform_admin_audit.sql`, and `202611020011_security_corrections.sql`. Journey events are read-only to authenticated clients and written by controlled database triggers and RPCs. Calling, WhatsApp, operations, and exports require the same organization and lead authorization. Migration 010 adds explicit platform-admin metadata policies, support-grant storage, a bulk notification-read RPC, immutable timeline triggers for assignment/calls/follow-ups/visits/bookings, and deduplicated notification triggers for supported assignment/sharing/task/visit/booking events. Migration 011 narrows call, visit and booking writes to authorized leads and adds a server-side payment RPC that rejects overpayment. It does not grant Super Admin access to private lead rows.

## Migration review and execution order

Review and execute only after staging backup and schema inspection, in this order:

1. `202611020001_initial_crm.sql`
2. `202611020002_add_company_owner_role.sql`
3. `202611020003_saas_hierarchy.sql`
4. `202611020004_harden_role_rls.sql`
5. `202611020005_security_hardening.sql`
6. `202611020006_lead_journey_sharing.sql`
7. `202611020007_calling_whatsapp.sql`
8. `202611020008_status_notifications_provider.sql`
9. `202611020009_phase_two_operations.sql`
10. `202611020010_platform_admin_audit.sql`
11. `202611020011_security_corrections.sql`
12. `202611020012` (historical payment schema)
13. `202611020013_growth_tools.sql`
14. `202611020014_advanced_automation.sql`
15. `202611020015_sales_operations.sql`
16. `202611020016_phase9_pipeline_hardening.sql`
17. `202611020017_super_admin_bootstrap.sql`
18. `202611020018_organization_admin_hardening.sql`
19. `202611020019_google_sheets_and_pipeline_access.sql`
20. `202611020020_platform_billing_management.sql`
21. `202611020021_payment_qr_hardening.sql`
22. `202611020022_self_profile_update.sql`
23. `202611020023_block_suspended_organization_access.sql`
24. `202611020024_company_owner_audit_read.sql`
25. `202611020025_mysql_sync_outbox.sql`
26. `202611020026_platform_domains.sql`
27. `202611020027_public_contact_submissions.sql`
28. `20261116151122_assign_existing_super_admin.sql`
29. `20261116160000_platform_user_management.sql`
30. `20261116160100_retire_payment_gateway_config.sql`

The review found overlapping lead timeline triggers in the prepared Phase 3 migration; migration 010 now scopes its trigger to assignment changes and leaves existing creation/status capture intact. Migration 011 is corrective, migration 012 adds the payment ledger, migration 013 adds disabled-by-default Growth Tools control-plane records, migration 014 adds tenant-scoped automation records, and migration 015 adds Customer 360, campaign costs, target history, commission, support ticket and import-job records. Workflow actions are structured JSON and cannot execute arbitrary user code. These migrations must be applied only after the earlier tables and columns exist. Verify existing constraints before applying because the original migrations are not universally idempotent.

## Phase 8 compatibility findings

- The execution dependency is strictly sequential: migration 002 extends the role enum, 003 creates hierarchy tables, 006 creates journey/sharing infrastructure, 010 adds platform triggers, 014 creates `pipeline_stages`, and 015 then references that table from `leads`.
- Migrations 001-015 are additive in intent, but several `create policy` statements are not safe to rerun because they do not consistently use `drop policy if exists`. Treat execution as one-time ordered deployment and verify the migration history table before retrying.
- Migration 015 uses `alter table ... add column if not exists` and `create table/index if not exists`, but its policy creation still requires a clean migration state.
- No rollback migration is supplied. Rollback must be a reviewed forward corrective migration or a verified database restore, never an ad hoc drop or truncate.
- Live foreign-key, RLS, trigger, RPC and query-plan compatibility has not been verified without a staging database.
- Migration 016 adds the authorized pipeline movement RPC, optimistic concurrency check, stage ownership validation and stage history write. It must be applied only after migrations 001-015.
- Phase 10 source audit confirms all 17 migration files are present in numeric order and verifies the pipeline foreign key is declared after the pipeline tables. This is a static check, not database execution.
- Migration 017 adds a service-role-only, advisory-lock-protected first Super Admin bootstrap RPC and a platform membership update RPC that prevents browser assignment of the Super Admin role and protects the last active Super Admin.
- Migration 018 adds organization settings, server-authorized membership/profile operations, self-change and privilege-escalation guards, subscription seat-limit checks and audit events. It must be applied before enabling organization administration in staging.
- Migration 019 adds organization-scoped Google Sheets OAuth state, encrypted-token metadata, source-row mapping and sync history tables. It also hardens pipeline movement by role and assignment/team scope. OAuth tokens are not readable through frontend queries.
- Migration 021 adds organization-scoped payment idempotency, payment state history and pending QR/manual review records. Receipts remain pending until an authorized review; they never activate a subscription automatically.
- Migration 20261116160100 retires the provider configuration table and overview RPC, removes MySQL mirror events for that configuration only, and broadens generic payment provider identifiers. It does not delete transaction, webhook-delivery, state-history, or QR-review rows. Review/apply it in staging after confirming the prior migration history.
- The provider retirement is forward-only. There is no SQL rollback that restores deleted gateway configuration; if rollback/recovery is required, restore a verified pre-migration backup to an isolated environment and review it rather than re-enabling the retired provider in production. Payment transaction/history rows are not removed. The migration is safe to retry after a failed attempt because it drops the replacement constraints before recreating them; inspect the target migration history before retrying.
- Migration 025 (not applied by this repository task) adds a transactionally written, secret-filtering CRM outbox with service-role-only ordered claim/ack/failure/replay/health RPCs for the MySQL worker. Apply only after confirming the staging project and remote migration history.
- The new MySQL migration creates only namespaced replica tables and sync metadata. It does not truncate existing data. The real MySQL test suite skips unless an explicit disposable `MYSQL_TEST_DATABASE` equals `MYSQL_DATABASE`; passing source tests does not establish a live connection.
