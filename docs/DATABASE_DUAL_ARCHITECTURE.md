# Supabase and MySQL dual database architecture

## Ownership and flow

```text
CRM browser
  └─ Supabase Auth + PostgREST/RLS
       └─ Supabase PostgreSQL (authoritative transactional records)
            └─ transaction triggers → mysql_sync_outbox
                 └─ persistent Node worker → MySQL crm_mirror_* replica
```

- Supabase PostgreSQL is the source of truth for CRM transactions, authentication, sessions, memberships, roles, authorization, and RLS.
- MySQL is a read/analytics replica; independent MySQL edits are unsupported and are not reverse-synchronized.
- UUIDs in Supabase remain canonical. A record with an `id` keeps that UUID in MySQL `source_record_id` and the unchanged key in `source_record_key`; existing composite-key records use a deterministic field-composite key because the Supabase schema does not define a UUID primary key for those rows.
- `organization_id` is copied as the same Supabase organization UUID. Global records such as plans/profiles can have a null replica organization field.
- Database credentials, Auth users/sessions, invitation token hashes, OAuth state, provider secret tables, passwords, tokens, API keys, and secret-like JSON fields are excluded or recursively stripped from replication.

## Mirror shape and column/relationship semantics

Each approved Supabase source table maps to a dedicated MySQL `crm_mirror_<table>` table. The replica stores a sanitized JSON copy of the complete PostgreSQL row (preserving source column names and values), plus indexed canonical source key/UUID, organization UUID, sequence, source timestamps, event UUID, and a tombstone. JSON is used because PostgreSQL types/defaults/check constraints do not have a safe one-to-one MySQL translation across all 24 evolving migration files.

The global `platform_domains` registry and `platform_domain_audit` records are also mirrored by migration 026 and the existing transactional outbox. DNS challenges are public verification strings, not credentials; Auth settings, provider tokens, and DNS provider credentials are not stored. Domain administration and verification remain service-managed and Super Admin-authorized.

This design mirrors business records but is **not** a typed relational replacement for Supabase. Source foreign-key fields are preserved in JSON, but MySQL does not enforce PostgreSQL foreign-key constraints or independently reproduce every source type/check/index. Consumers requiring relational MySQL queries must use the source database or obtain a reviewed versioned projection/schema migration before release. A JSON mirror must not be described as a relationally equivalent schema.

## Outbox and consistency

Migration 025 adds `public.mysql_sync_outbox` and after-row triggers for supported business tables. The outbox event is committed atomically with the Supabase row change. The Node worker claims events through service-role-only RPCs, serializes each entity/key in source sequence order, commits the MySQL row and unique MySQL sync ledger event in a transaction, and only then acknowledges the Supabase event.

- Duplicate event delivery uses the unique event UUID and source sequence.
- A stale backfill/event cannot overwrite a higher source sequence.
- Retries use exponential backoff; after 12 attempts the event remains failed until Super Admin replay.
- Earlier non-completed changes for the same record block later events.
- `DELETE` writes a tombstone; soft-deleted records preserve `deleted_at`.
- Reconciliation reads source and replica per organization and reports missing, mismatched, and extra active rows without overwriting them.
- This is asynchronous eventual consistency. There is no cross-database atomic commit; monitoring must surface pending/failed work.

## Supported mapping

Local source tables are mapped by name under MySQL prefix `crm_mirror_`: organizations, profiles, organization members/teams, campaigns/leads/activities, calls/follow-ups/visits/bookings, statuses/pipeline/history, targets/commission, customers/notes/support/imports, notifications/WhatsApp click records, subscription/payment ledgers, integration metadata, audit history, automation, and sync metadata. The exact allowlist is in [mysql/schemas/entities.mjs](../mysql/schemas/entities.mjs). Secret-bearing tables and authentication state are excluded; the outbox itself is not mirrored.

The only existing third-party data sync is Google Sheets → Supabase. It is separate from the new Supabase → MySQL mirror; it does not dual-write or create a reverse MySQL flow.

## Environment and deployment

Configure MySQL and Supabase server settings through a private runtime secret manager. The two Supabase `VITE_` values and `VITE_DATABASE_API_URL` are public browser configuration; no MySQL credential may use `VITE_`. The worker/API need a private MySQL network route and a restricted TLS-enabled account. Apply MySQL migrations with a separate migration user. Migration 025 must be reviewed and manually applied to staging after project identity/history checks; production requires explicit approval.

Static hosting (including Hostinger static `dist/` hosting) cannot run a persistent worker. Deploy the API and worker to a Node.js 20.6+ service/container/VM, restrict ingress, configure health monitoring, and keep MySQL private.

## Test status and recovery

Automated unit tests validate allowlists, secret stripping, event schema/order, configuration validation, and safe errors. Live MySQL tests require a disposable `MYSQL_TEST_DATABASE` equal to `MYSQL_DATABASE`; live Supabase tests require an explicit staging user token. If these are unavailable, database connectivity is BLOCKED, not PASS.

No automatic destructive recovery is used. Retry failed events, reconcile, and investigate conflicts. Back up and test restore of MySQL and Supabase independently. Restoring MySQL does not restore Supabase Auth, RLS, or primary transactions. See [MySQL deployment steps](./MYSQL_SETUP.md) and [mysql/README.md](../mysql/README.md).
