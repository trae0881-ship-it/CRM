# Environment variables

This inventory was checked against `import.meta.env` in `src/` and `Deno.env.get`/`env(...)` calls in `supabase/functions/`. `.env.example` contains placeholders only; keep `.env` ignored and never copy server secrets into a `VITE_` variable.

## Frontend

| Exact name | Purpose | Required? | Where to obtain | Environments |
|---|---|---|---|---|
| `VITE_SUPABASE_URL` | Supabase project API URL used by the browser client. | Required for every running app. | Supabase Dashboard → Project Settings → API → Project URL. | Local, staging, production |
| `VITE_SUPABASE_ANON_KEY` | Browser publishable/anon key; access remains subject to Auth and RLS. | Required for every running app. | Supabase Dashboard → Project Settings → API → publishable key (or legacy anon key). | Local, staging, production |
| `VITE_DATABASE_API_URL` | Public HTTPS origin for the separate, Super Admin-authenticated Node database monitoring API. This is an API origin, not a MySQL connection string or credential. | Optional for the CRM; required to display live database monitoring. | Set to the deployed database API's HTTPS origin. | Local, staging, production when the monitoring service is deployed |
| `VITE_SUPABASE_AUTH_ALLOWED_REDIRECT_HOSTS` | Comma-separated custom-domain hostnames that have already been added to the Supabase Auth redirect allowlist. Workspace signup and password reset use a custom domain only when it appears here. | Optional; required before custom-domain Auth redirects are enabled in the browser. | Copy exact hostnames configured in Supabase Auth → URL Configuration. | Local, staging, production |

These are public frontend configuration values, not service credentials. The app validates both before rendering and reports only missing variable names, never values.

## Supabase Edge Functions

All values below belong in Supabase Edge Function secrets (or an approved server-side secret manager), not in the frontend.

| Exact name | Purpose | Required? | Where to obtain | Environments |
|---|---|---|---|---|
| `SUPABASE_URL` | Project URL used by server-side Supabase clients. | Required for each function that uses the Supabase client. | Supabase Dashboard project settings; Supabase-managed environment value where available. | Local function development, staging, production |
| `SUPABASE_ANON_KEY` | Publishable/anon key for authenticated user-scoped clients in bootstrap and payment creation. | Required for those functions; not required by every function. | Supabase Dashboard → Project Settings → API. | Local function development, staging, production when those functions are deployed |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side administrative client used by Edge Functions. Bypasses RLS; tightly restrict and rotate. | Required for functions that instantiate an administrative client. | Supabase Dashboard → Project Settings → API → service_role/secret key. | Local function development, staging, production when those functions are deployed |
| `SUPABASE_AUTH_ALLOWED_REDIRECT_HOSTS` | Comma-separated custom-domain hostnames confirmed in the Supabase Auth redirect allowlist; used before invitation emails target a workspace domain. | Optional; required before custom-domain invitation redirects are enabled. | Copy exact hostnames configured in Supabase Auth → URL Configuration. | Local function development, staging, production |
| `SUPER_ADMIN_BOOTSTRAP_SECRET` | One-time secret required by `bootstrap-super-admin`. | Required only during the one-time bootstrap. Remove/rotate after use. | Generate a high-entropy secret in a trusted password/secret manager; never commit it. | Staging/prod bootstrap only |
| `GOOGLE_CLIENT_ID` | OAuth client identifier for Google Sheets connection. | Required to enable Google Sheets OAuth and sync. | Google Cloud Console → APIs & Services → Credentials (OAuth client). | Local function development, staging, production when Google Sheets is enabled |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret. | Required to enable Google Sheets OAuth and sync. | Google Cloud Console → APIs & Services → Credentials. | Local function development, staging, production when Google Sheets is enabled |
| `GOOGLE_SHEETS_TOKEN_ENCRYPTION_KEY` | Base64-encoded 32-byte AES key for stored Google OAuth tokens. | Required to enable Google Sheets OAuth and sync. | Generate 32 random bytes with a cryptographically secure generator and base64 encode; store only as a server secret. | Local function development, staging, production when Google Sheets is enabled |
| `GOOGLE_SHEETS_SYNC_CRON_SECRET` | Secret header credential for scheduled sync requests. Authenticated manual sync does not require it. | Optional; required for a scheduler that invokes sync without a user session. | Generate a high-entropy secret in a trusted secret manager and configure it on the scheduler. | Staging/production if scheduled sync is enabled |
| `META_APP_SECRET` | Verifies signed Meta webhook payloads. | Required only if the webhook is deployed and activated. | Meta for Developers → app settings. | Staging/production if Meta webhooks are enabled |
| `META_VERIFY_TOKEN` | Verifies the Meta webhook handshake. | Required only if the webhook is deployed and activated. | Generate and keep the same private token in Meta webhook configuration and Edge Function secrets. | Staging/production if Meta webhooks are enabled |
| `META_GRAPH_API_VERSION` | Graph API version used for lead lookup. | Optional; code defaults to `v21.0`. | Select a supported version in Meta for Developers after compatibility review. | Staging/production if Meta webhooks are enabled |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are Supabase-managed runtime values in hosted Edge Functions where available. Configure them as secrets for local function development. Never place service-role credentials in `.env` values prefixed with `VITE_`.

The Google OAuth callback URI is derived from the deployed `google-sheets-oauth` request URL and registered in Google Cloud; it is not an environment variable or an organization route.

## MySQL replica and server-side API

These settings are for the persistent Node worker/API only, except `VITE_DATABASE_API_URL` above. Configure them in local ignored `.env` or the server's secret manager. MySQL is not exposed to browser code.

| Exact name | Purpose | Required? | Where to obtain | Environments |
|---|---|---|---|---|
| `MYSQL_HOST` | Private DNS name or private endpoint for the MySQL server. | Required for migration, worker, API, and live tests. | MySQL provider console/database connection details. Use private networking. | Local development, staging, production |
| `MYSQL_PORT` | MySQL listener port; code defaults to `3306`. | Optional when default applies. | MySQL provider console. | Local, staging, production |
| `MYSQL_DATABASE` | Existing database/schema for prefixed `crm_mirror_*` records. The app does not create the database itself. | Required for migration, worker, API, and live tests. | Create it using the provider admin console. | Local, staging, production |
| `MYSQL_USER` | Least-privilege runtime account used by worker and monitoring API. | Required for migration, worker, API, and live tests. | Created by database owner; grant only required replica table reads/writes. | Local, staging, production |
| `MYSQL_PASSWORD` | Password for the runtime user. | Required for migration, worker, API, and live tests. | Generate/store in a trusted secret manager. | Local, staging, production |
| `MYSQL_MIGRATION_USER` | Separate MySQL schema-owner account for reviewed migrations. | Required only by `npm run mysql:migrate`. | Created by database owner; grant only on the replica database. | Local/staging; production only for approved release |
| `MYSQL_MIGRATION_PASSWORD` | Password for the migration account. | Required only by `npm run mysql:migrate`. | Generate/store in a trusted secret manager. | Local/staging; production only for approved release |
| `MYSQL_SSL` | Enables TLS; defaults to `true`. | Optional; keep enabled. | Set `true` for TLS, `false` only for isolated local tests. | Local, staging, production |
| `MYSQL_CONNECTION_LIMIT` | mysql2 pool size; defaults to `10`. | Optional. | Set according to the worker/API connection budget and server limit. | Local, staging, production |
| `MYSQL_CONNECT_TIMEOUT_MS` | Connection timeout in milliseconds; defaults to `10000`. | Optional. | Tune to provider/network response time. | Local, staging, production |
| `MYSQL_SSL_CA` | PEM CA certificate when the provider uses a private CA. | Optional. | Download from the provider's TLS documentation; keep it private if provider policy requires. | Staging/production as needed |
| `MYSQL_SSL_REJECT_UNAUTHORIZED` | TLS certificate verification; defaults to `true`. | Optional; do not disable in production. | Keep `true`; set false only for isolated local test certificates. | Local, staging, production |
| `MYSQL_SYNC_BATCH_SIZE` | Maximum outbox rows claimed per worker request; defaults to `25`, max `250`. | Optional. | Tune after measuring worker throughput. | Local, staging, production |
| `MYSQL_SYNC_POLL_MS` | Worker idle/retry poll interval; defaults to `2000` ms. | Optional. | Tune to outbox latency and database limits. | Local, staging, production |
| `MYSQL_SYNC_WORKER_ID` | Identifier attached to outbox leases; defaults to process ID. | Optional. | Assign unique service instance ID where practical. | Staging/production |
| `DATABASE_API_PORT` | Node monitoring API listen port; defaults to `8787` or platform `PORT`. | Optional. | Reserve a port on the Node host. | Local, staging, production |
| `DATABASE_API_ALLOWED_ORIGIN` | Exact browser origin allowed by API CORS; no path or trailing slash. | Required for browser-based monitoring on another origin. | Use the deployed CRM origin (for example `https://crm.example.com`). | Local, staging, production |
| `PLATFORM_DOMAIN_EXPECTED_TARGETS` | Comma-separated public IP addresses or hostnames expected from the approved hosting provider. DNS ownership can pass without this, but HTTPS verification and activation fail closed until the configured target matches. | Required to activate custom domains. | Copy the actual A/AAAA destination IPs or CNAME target from the hosting provider; do not guess. | Staging, production |
| `SUPABASE_AUTH_ALLOWED_REDIRECT_HOSTS` | Comma-separated custom-domain hostnames already registered in the Supabase Auth redirect allowlist; only these assigned domains may receive invitation redirects. | Optional; required before custom-domain invitation redirects are enabled. | Copy exact hostnames configured in Supabase Auth → URL Configuration. | Staging, production |
| `MYSQL_TEST_DATABASE` | Safety guard for live MySQL integration tests; must exactly equal `MYSQL_DATABASE`. | Required only to enable real MySQL test cases. | Create a disposable database reserved for test runs. | Local/staging test only |
| `SUPABASE_TEST_URL` | Staging Supabase URL used by the live PostgREST connectivity test. | Required only to run live Supabase tests. | Supabase Dashboard for a dedicated staging project. | Staging test only |
| `SUPABASE_TEST_ANON_KEY` | Staging public key paired with the Supabase test URL. | Required only to run live Supabase tests. | Supabase Dashboard → Project Settings → API. | Staging test only |
| `SUPABASE_TEST_ACCESS_TOKEN` | Short-lived access token for a dedicated staging test identity. | Required only to run live Supabase tests. | Sign in the dedicated staging test user; never use a production/admin token. | Staging test only |

Use the provider's network ACL/security group to permit MySQL only from the Node worker/API private subnet. `MYSQL_MIGRATION_USER` is not used by the runtime worker. Never print environment values in logs.

## Not used / not configured

- A MySQL server, staging credentials, and remote Supabase migration history are not configured in this workspace; these settings describe the new server-side implementation, not a verified live connection.
- `.env.example` contains placeholders, not credentials. The local `.env` had no assigned key names during the audit; its values were not printed. Supabase connectivity is not verified by the presence of variable names in a template.
- Authentication redirects use `window.location.origin` and `/reset-password`, not a separate environment variable. Add the exact local, staging, and production origins/redirect paths to Supabase Auth URL Configuration.
- Custom-domain verification stays at `HTTPS Pending` until the persistent API has a `PLATFORM_DOMAIN_EXPECTED_TARGETS` allowlist from the hosting provider, and Supabase Auth redirect URLs and hosting routes are configured manually.
- `META_APP_ID` is mentioned in older setup notes but is not read by runtime source code and is intentionally excluded from `.env.example`.

## Setup and verification

1. Copy `.env.example` to `.env` for local frontend development. `.env` and `.env.*` are ignored by Git; `.env.example` is the only allowed tracked env file.
2. Set the two `VITE_` variables from the intended Supabase project. Never paste service-role keys or OAuth secrets into the frontend configuration.
3. Configure only the Edge Function secrets for integrations that have been reviewed and are actually being deployed.
4. Configure Supabase Auth Site URL and allowed redirect URLs for localhost, staging, and production separately.
5. Before any migration, verify the project URL/identity and remote migration history against staging. No remote database or migration status is verified by local build/tests.
6. Configure MySQL only on the persistent Node service and verify with the real staging integration tests. No MySQL endpoint or credentials were configured during this implementation.
