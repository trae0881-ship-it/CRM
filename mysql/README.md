# Adometa MySQL replica

The Supabase PostgreSQL database remains the authoritative CRM store. This Node.js service mirrors approved business rows to MySQL using a transactional Supabase outbox. It never writes application changes directly to MySQL, and it does not store Supabase Auth users, invitation hashes, webhook/OAuth state, Google tokens, or integration-secret tables.

The replica uses one isolated `crm_mirror_<supabase_table>` table per supported source entity. Each row retains the complete sanitized Supabase row in a MySQL JSON `payload`, plus the canonical source key/UUID, organization UUID, source event sequence, tombstone, and sync timestamp. This snapshot layout avoids guessing MySQL-native types for every evolving PostgreSQL column; it is not an independently editable relational model. Relationships are retained as source foreign-key fields in the payload and must be validated by reconciliation. No cross-database foreign-key constraint exists.

## Requirements and credentials

- Node.js 20.6 or newer (the commands use Node's `--env-file`).
- A MySQL 8-compatible server/database on a private network route from the worker/API.
- A least-privilege runtime account and a separate schema-migration account.
- A Supabase project whose migration 025 has been reviewed and applied to **staging**; public contact submissions additionally require reviewed migration 027.
- Server-side `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and MySQL settings in a protected `.env` for local work, or the hosting secret manager in a deployed environment.

Find the MySQL host, port, database name, user and TLS CA in the database provider's service/connection settings. Have the database owner create the database and application users. Never commit the password or copy it to `VITE_` variables.

Required runtime settings: `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_SSL`, `MYSQL_CONNECTION_LIMIT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

The migration command additionally requires `MYSQL_MIGRATION_USER` and `MYSQL_MIGRATION_PASSWORD`. Optional tuning/settings are `MYSQL_CONNECT_TIMEOUT_MS`, `MYSQL_SSL_CA`, `MYSQL_SSL_REJECT_UNAUTHORIZED`, `MYSQL_SYNC_BATCH_SIZE`, `MYSQL_SYNC_POLL_MS`, `MYSQL_SYNC_WORKER_ID`, and `DATABASE_API_PORT`. `DATABASE_API_ALLOWED_ORIGIN` sets the allowed browser origin. Set `PLATFORM_DOMAIN_EXPECTED_TARGETS` to the comma-separated public IPs or hostnames supplied by the approved hosting provider; domain verification remains pending until these actual targets match. The frontend monitoring page uses the public service URL `VITE_DATABASE_API_URL`; it is not a credential.

## Create database and restricted users

Run these commands from a trusted admin SQL session in the MySQL provider console; replace the example database and network account scope. Use a generated secret in the provider/secret manager, not a committed SQL file.

```sql
CREATE DATABASE adometa_replica
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'adometa_sync'@'10.%'
  IDENTIFIED BY 'set-a-generated-secret-in-your-secret-manager'
  REQUIRE SSL;
GRANT SELECT, INSERT, UPDATE
  ON adometa_replica.* TO 'adometa_sync'@'10.%';

CREATE USER 'adometa_migrate'@'10.%'
  IDENTIFIED BY 'set-a-different-generated-secret-in-your-secret-manager'
  REQUIRE SSL;
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX
  ON adometa_replica.* TO 'adometa_migrate'@'10.%';
```

`adometa_sync` is the worker/API runtime user. `adometa_migrate` is used only for schema migrations. Restrict both source hosts to the worker's private subnet/security group, enable TLS, and do not open port 3306 to the public internet. If a reconciliation cleanup test needs DELETE, use a disposable test-only user/database rather than expanding production runtime grants.

Configure `.env` from `.env.example` locally, or set the same values in the Node service's server-side secret manager. Set `MYSQL_DATABASE=adometa_replica`, `MYSQL_USER=adometa_sync`, and `MYSQL_MIGRATION_USER=adometa_migrate`. Keep `MYSQL_SSL=true`. When using a private CA, set `MYSQL_SSL_CA` to its PEM contents; leave certificate verification enabled.

## Apply the MySQL schema

The migrator creates only namespaced `crm_mirror_*`, `mysql_sync_events`, `mysql_sync_progress`, and migration metadata tables. It does not truncate or reset any existing tables.

```powershell
npm ci
npm run mysql:migrate
npm run mysql:test
```

The migration command requires explicit migration credentials. Migration `002_contact_submissions` is additive and creates the mirror table for website enquiries on existing replicas. The real integration test runs only if `MYSQL_TEST_DATABASE` exactly equals `MYSQL_DATABASE` and the test account can connect. Point it only at a disposable test database; it inserts random UUID records and removes only those exact rows.

## Prepare Supabase staging

Review the additive [migration 025](../supabase/migrations/202611020025_mysql_sync_outbox.sql) against the full target project's migration history. It installs row triggers and service-role-only RPCs on the supported business tables. The event is inserted in the same PostgreSQL transaction as the source change. Migration 027 adds contact submissions to that outbox after the table is created. Applying any migration is a separate, explicitly approved database operation; repository setup does not apply them automatically.

Do not run the worker until the exact staging Supabase project is confirmed and the migration is applied. Production migration requires a separate explicit approval and backup/recovery review.

## Backfill and automatic synchronization

Perform an organization-scoped backfill first, in staging:

```powershell
npm run mysql:backfill -- --organization-id 00000000-0000-0000-0000-000000000001
```

The backfill paginates 250 rows, upserts by stable source key, records per-organization/entity progress, resumes from the saved offset after interruption, and emits counts/errors without printing row contents. Run without `--organization-id` to backfill all organizations and global metadata. It never resets/truncates the target.

After schema/backfill, start a persistent worker:

```powershell
npm run mysql:worker
```

Deploy this as a continuously running Node service/worker, not as browser code or a short-lived request function. The worker claims ordered outbox events, writes data and a MySQL event ledger in one transaction, then acknowledges the source event. Duplicate event IDs are idempotent. Temporary failures retry with exponential delay up to 12 attempts; terminal failures remain visible until an authorized replay. Per-record earlier events block later events. Physical deletes become tombstones; soft deletes are copied from the row's `deleted_at`.

The primary remains Supabase. Do not edit `crm_mirror_*` rows independently. A higher source sequence wins, so stale events and backfill snapshots cannot overwrite newer replica state.

## Monitoring, retry and reconciliation

Set `DATABASE_API_PORT` and `DATABASE_API_ALLOWED_ORIGIN` on the Node service, and set `VITE_DATABASE_API_URL` to its HTTPS public API origin in the browser build configuration. Run the authenticated API alongside the worker:

```powershell
npm run mysql:api
```

`GET /health/live` returns only process liveness. `GET /health/db`, `POST /sync/replay`, and `POST /sync/reconcile` require a valid Supabase access token whose active database membership has the `super_admin` role. The app's Database monitoring view calls these endpoints. Responses contain connection booleans and safe error codes, never connection settings or raw database messages.

Use the Super Admin UI's organization-specific **Retry failed** action, or:

```powershell
Invoke-RestMethod -Method Post `
  -Uri "$env:VITE_DATABASE_API_URL/sync/replay" `
  -Headers @{ Authorization = "Bearer <short-lived-super-admin-access-token>" } `
  -ContentType "application/json" `
  -Body '{"organizationId":"00000000-0000-0000-0000-000000000001"}'
```

Reconcile without mutating records:

```powershell
npm run mysql:reconcile -- --organization-id 00000000-0000-0000-0000-000000000001
```

The report compares source and replica keys/payloads, counts missing/mismatched/extra active rows, and returns a safe error code on failure. Replay failed events and rerun reconciliation; investigate remaining mismatches before any manual repair. Never overwrite replica records by direct SQL to mask a conflict.

## Backup, restore and release

Back up MySQL using the managed provider's encrypted backup/PITR facility or an approved encrypted `mysqldump` to protected storage. Restore to a separate database first, validate migration version and organization/entity counts, then point the worker at the restored database. Back up Supabase independently; MySQL is a replica and cannot restore Supabase Auth, roles, RLS or primary records. Test both recovery paths.

Static Hostinger hosting only serves the React `dist/` output; it cannot host this persistent worker. Deploy `mysql:api` and `mysql:worker` to a Node-capable container/VM/private service, and configure the MySQL firewall to accept traffic only from that service. Configure the public `VITE_DATABASE_API_URL` with HTTPS and a strict origin allowlist. Do not place the worker or MySQL password in browser configuration.

## Verification state

Passing unit/build tests do not establish live connectivity. Live MySQL migration/connection/sync tests are **BLOCKED** until disposable `MYSQL_TEST_DATABASE` credentials are supplied. Live Supabase Auth/PostgREST tests are **BLOCKED** until staging-only `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`, and `SUPABASE_TEST_ACCESS_TOKEN` are supplied. No production migration or deployment is performed by these commands.
