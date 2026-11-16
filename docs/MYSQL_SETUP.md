# MySQL replica setup

Adometa uses Supabase PostgreSQL as the primary CRM database and MySQL as a server-side synchronized replica. MySQL is not a frontend database and must not be accessed from React. See [the dual database architecture](./DATABASE_DUAL_ARCHITECTURE.md).

## Obtain connection settings

Create a MySQL 8-compatible database with your approved managed database provider or private infrastructure. From the provider's database connection/service settings obtain:

| Variable | Value |
|---|---|
| `MYSQL_HOST` | Private DNS name or private endpoint for the server |
| `MYSQL_PORT` | Provider port, normally `3306` |
| `MYSQL_DATABASE` | Database name created for the replica |
| `MYSQL_USER` / `MYSQL_PASSWORD` | Least-privilege worker user credentials |
| `MYSQL_MIGRATION_USER` / `MYSQL_MIGRATION_PASSWORD` | Separate schema-owner account for reviewed migrations |
| `MYSQL_SSL` | Keep `true` for TLS |
| `MYSQL_SSL_CA` | Optional PEM trust certificate when required by the provider |

Set values in a local ignored `.env` for development or the server-side secret manager in deployment. Do not send MySQL passwords to the browser or use `VITE_` prefixes. Never open the MySQL port publicly; allow only the worker/API private network.

## Setup commands

Use Node.js 20.6+ and run:

```powershell
npm ci
npm run mysql:migrate
npm run mysql:test
npm run mysql:backfill -- --organization-id <staging-organization-uuid>
npm run mysql:worker
```

The migrator uses the separate `MYSQL_MIGRATION_USER` and `MYSQL_MIGRATION_PASSWORD`. The test command only connects when `MYSQL_TEST_DATABASE` exactly matches `MYSQL_DATABASE`; point it at a disposable database. See [mysql/README.md](../mysql/README.md) for user grants, migrations, TLS, backfill, retry, and recovery details.

Before backfill/worker startup, verify Supabase project identity and apply migration 025 to staging only. Do not automatically apply any Supabase migrations to production.

## Supabase configuration

The CRM/browser uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The worker/API requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the server. Configure `SUPABASE_ANON_KEY` only for functions that require a user-scoped client. The service-role key bypasses RLS; keep it private, rotate it if exposed, and grant access only to the worker/API service.

For real staging connectivity tests, set `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`, and a short-lived `SUPABASE_TEST_ACCESS_TOKEN` for a dedicated staging user. No live Supabase test passes without a real Auth token and successful Auth/PostgREST responses.

## Monitoring API

Deploy a persistent Node service and worker, configure `DATABASE_API_PORT`, `DATABASE_API_ALLOWED_ORIGIN`, and frontend `VITE_DATABASE_API_URL`, then use the Super Admin Database monitoring screen. The endpoint verifies the caller's current active Super Admin membership server-side. Do not enable the browser origin before HTTPS and access controls are ready.
