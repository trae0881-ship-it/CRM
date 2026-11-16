# Supabase Migration Review and Application Guide

**Do not run migrations against production from this guide.** The current repository contains migrations `202611020001` through `202611020027`; this does not prove that a remote Supabase project has the same history.

## What migration 026 does

`supabase/migrations/202611020026_platform_domains.sql`:

- Adds `platform_domains` and `platform_domain_audit`.
- Enables RLS and revokes direct access from `public`, `anon`, and `authenticated`; grants table access to `service_role`.
- Adds service-role-only management and verification `SECURITY DEFINER` RPCs with a fixed `search_path`.
- Exposes a public read-only canonical config RPC containing the active primary hostname and redirect preferences; it does not return the DNS challenge or audit log.
- Requires both DNS and HTTPS verification flags before assigning a primary domain.
- Adds the existing MySQL outbox triggers to domain and audit rows. This assumes migration 025 and its trigger/RPC have already been deployed and the MySQL worker allowlist includes these entities.

The server API calls the management RPC only after it validates the bearer session against Supabase Auth and confirms an active `super_admin` membership. The user-supplied `actor_user` is therefore derived from the verified token at the API boundary, not trusted from the browser request.

## What migration 027 does

`supabase/migrations/202611020027_public_contact_submissions.sql` adds the public website enquiry store:

- Stores the submitted name, mobile, email, optional company, subject, message, status, idempotency key and timestamps.
- Enables RLS and revokes direct `public`, `anon`, and `authenticated` access. Only the server-side `service_role` API can create or inspect submissions.
- Adds validation constraints, a unique idempotency key, status/email indexes and an `updated_at` trigger.
- Adds the contact table to the existing MySQL outbox. The MySQL replica allowlist includes the record and migration `002_contact_submissions` creates its mirror table.
- Does not configure WhatsApp Business notifications. The website offers a manual `wa.me` link for the visitor to review and send.

Migration 027 depends on migration 025's `enqueue_mysql_sync_change()` function for outbox synchronization. The migration 027 trigger is attached after the contact table is created, so the existing 025 migration does not need to be rerun.

## Review checklist before migration

1. Create/confirm an isolated staging Supabase project. Verify project URL/ID out of band.
2. Back up staging and record the remote migration history.
3. Compare every repository migration `001`–`027` to the remote schema. Do not blindly replay a migration over an unknown schema.
4. Confirm 025 is applied before 026. Confirm `enqueue_mysql_sync_change()` exists with compatible outbox entity fields.
5. Review expected provider/role permissions, function owners, grants, RLS status, indexes, duplicate domains and impact of audit rows/contact personal data.
6. Check PostgreSQL syntax in a disposable local/staging database and verify `auth.role()` returns `service_role` for the server admin client RPC calls.
7. Confirm the MySQL outbox trigger mirrors these two global tables and does not replicate secrets.
8. Export current schema and prepare a forward-fix/restore plan before any production change.

## Staging application procedure

The current checkout has no `supabase/config.toml` and the Supabase CLI is not installed/configured. Before using these commands, install the organization-approved CLI version. If this repository is intended to be a Supabase CLI project, initialize its local config once and review/commit the generated configuration before linking; do not overwrite existing project settings. Then authenticate and inspect staging:

```powershell
supabase init
supabase login
supabase --version
supabase projects list
```

After confirming the project reference, remote history and backups, link staging and use the project's approved migration workflow:

```powershell
supabase link --project-ref YOUR_STAGING_PROJECT_REF
supabase migration list --linked
supabase db push --dry-run
```

Review the dry-run output. Apply through the approved staged process only; require explicit release-owner approval. Never substitute a production project ref in a staging runbook. Do not use database reset commands. The Supabase CLI is not installed/configured in the current environment, and this repository session did not execute any migration.

If your established process applies SQL through the Dashboard, review the exact migration file and execute it only in the verified staging SQL editor with migration history captured. Avoid manually marking migrations as applied unless the schema has been independently proven identical.

## Verify after staging migration

- Check `to_regclass('public.platform_domains')`, `to_regclass('public.platform_domain_audit')`, and `to_regclass('public.contact_submissions')`.
- Apply MySQL migration `002_contact_submissions` through the repository migrator after reviewing the schema change; it is idempotent and only creates the missing mirror table.
- Confirm RLS enabled and grants match intended roles.
- Confirm authenticated/anon users cannot read/write either private domain table or call management/verification RPCs.
- Confirm the public config RPC reveals no domain challenge or audit data.
- Call the management API without a token, with a normal organization member, and with an active Super Admin; only the last may perform administrative operations.
- Confirm a pending domain cannot become primary and cannot get `active` state without backend success for both DNS TXT and HTTPS validation.
- Confirm created/updated/deleted/verified actions appear in audit history.
- With the MySQL staging worker running, confirm outbox events mirror the domain/audit record and replay/reconcile work.
- Submit a contact enquiry through the staging website; confirm a single `new` row with `created_at` exists, anon/authenticated roles cannot read it, its event reaches `crm_mirror_contact_submissions`, and no WhatsApp API notification is claimed.
- Test migration rollback only in a disposable database; production rollback should use a reviewed forward correction or tested restore, not destructive drop statements.

## Production

No production migration is authorized or performed by this audit. Production requires explicit change approval, a verified backup, a reconciled migration history, staging evidence, a maintenance/monitoring plan and an owner-approved rollback. See [rollback guide](./ROLLBACK_GUIDE.md).
