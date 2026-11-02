# Database plan

All organization-owned tables include `organization_id`, timestamps, and soft-delete fields where appropriate. Foreign keys are scoped and indexes begin with `organization_id` to support tenant isolation and reporting.

Core tables: `organizations`, `profiles`, `organization_members`, `teams`, `team_members`, `invitations`, `leads`, `lead_activities`, `calls`, `follow_up_tasks`, `site_visits`, `bookings`, `campaigns`, `sales_targets`, `subscription_plans`, `subscriptions`, `invoices`, `payments`, `meta_integrations`, `meta_forms`, `webhook_events`, and `audit_logs`. Phase 2 also adds `lead_statuses`, `notifications`, `telephony_provider_configs`, and `provider_webhook_events`.
Migration 012 adds the provider-neutral YouPI-PG ledger: `payment_gateway_configs`, `payment_transactions`, and `payment_webhook_deliveries`. It stores masked gateway metadata only; merchant secrets remain Edge Function secrets.
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
12. `202611020012_youpi_gateway.sql`
13. `202611020013_growth_tools.sql`
14. `202611020014_advanced_automation.sql`
15. `202611020015_sales_operations.sql`
16. `202611020016_phase9_pipeline_hardening.sql`

The review found overlapping lead timeline triggers in the prepared Phase 3 migration; migration 010 now scopes its trigger to assignment changes and leaves existing creation/status capture intact. Migration 011 is corrective, migration 012 adds the payment ledger, migration 013 adds disabled-by-default Growth Tools control-plane records, migration 014 adds tenant-scoped automation records, and migration 015 adds Customer 360, campaign costs, target history, commission, support ticket and import-job records. Workflow actions are structured JSON and cannot execute arbitrary user code. These migrations must be applied only after the earlier tables and columns exist. Verify existing constraints before applying because the original migrations are not universally idempotent.

## Phase 8 compatibility findings

- The execution dependency is strictly sequential: migration 002 extends the role enum, 003 creates hierarchy tables, 006 creates journey/sharing infrastructure, 010 adds platform triggers, 014 creates `pipeline_stages`, and 015 then references that table from `leads`.
- Migrations 001-015 are additive in intent, but several `create policy` statements are not safe to rerun because they do not consistently use `drop policy if exists`. Treat execution as one-time ordered deployment and verify the migration history table before retrying.
- Migration 015 uses `alter table ... add column if not exists` and `create table/index if not exists`, but its policy creation still requires a clean migration state.
- No rollback migration is supplied. Rollback must be a reviewed forward corrective migration or a verified database restore, never an ad hoc drop or truncate.
- Live foreign-key, RLS, trigger, RPC and query-plan compatibility has not been verified without a staging database.
- Migration 016 adds the authorized pipeline movement RPC, optimistic concurrency check, stage ownership validation and stage history write. It must be applied only after migrations 001-015.
- Phase 10 source audit confirms all 16 migration files are present in numeric order and verifies the pipeline foreign key is declared after the pipeline tables. This is a static check, not database execution.
