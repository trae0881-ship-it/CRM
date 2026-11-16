# Production Environment Variables

Keep frontend build-time variables distinct from backend secrets. Do not commit credentials, include server secrets in Vite, or print secret values in logs. The canonical inventory is also in [ENVIRONMENT_VARIABLES.md](../ENVIRONMENT_VARIABLES.md) and [.env.example](../.env.example).

## Frontend build environment

| Variable | Required | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL. |
| `VITE_SUPABASE_ANON_KEY` | Yes | Publishable/anon key only; RLS still required. |
| `VITE_DATABASE_API_URL` | Required for Super Admin monitoring, public pricing and contact submission | Public HTTPS API origin; not a credential. |

Set these in local `.env` or the frontend provider's build settings. Never put `SUPABASE_SERVICE_ROLE_KEY`, MySQL, OAuth, payment or webhook secrets into a `VITE_` variable. The current `.env` file is empty; do not copy production keys into this audit workspace.

## Persistent Node API and worker

Configure as server-side secrets/environment:

| Variable | Required/use |
|---|---|
| `SUPABASE_URL` | Server-side Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Required for trusted API/worker access; highly privileged. |
| `SUPABASE_ANON_KEY` | Server-side user-scoped functions where required. |
| `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` | Private MySQL endpoint and runtime account. |
| `MYSQL_SSL`, `MYSQL_CONNECTION_LIMIT`, `MYSQL_CONNECT_TIMEOUT_MS`, `MYSQL_SSL_CA`, `MYSQL_SSL_REJECT_UNAUTHORIZED` | TLS/pool/timeout configuration; keep TLS verification enabled. |
| `MYSQL_MIGRATION_USER`, `MYSQL_MIGRATION_PASSWORD` | Separate schema migration user; do not use as runtime credentials. |
| `MYSQL_SYNC_BATCH_SIZE`, `MYSQL_SYNC_POLL_MS`, `MYSQL_SYNC_WORKER_ID` | Worker tuning/identity. |
| `DATABASE_API_PORT` or host `PORT` | API listener port. |
| `DATABASE_API_ALLOWED_ORIGIN` | Exact deployed frontend origin, including scheme, with no trailing slash/path; configure for staging/local, or use a backend-verified active custom domain. |

The API requires server Supabase configuration even if MySQL monitoring is not yet possible. Worker/migration commands require actual DB credentials. Configure these independently for staging and production.

The public contact endpoint uses only the existing API and Supabase server credentials; there are no WhatsApp Business API environment variables because no automatic WhatsApp notification provider is configured. The contact database table is server-only. Configure retention and privacy-request handling before production.

## Edge Function integrations (only when approved and enabled)

- Google Sheets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_SHEETS_REDIRECT_URI`, `GOOGLE_SHEETS_TOKEN_ENCRYPTION_KEY`; optionally `GOOGLE_SHEETS_SYNC_CRON_SECRET`.
- Meta webhook: `META_APP_SECRET`, `META_VERIFY_TOKEN`, optional `META_GRAPH_API_VERSION`. Do not enable before a provider test and deployment review.
- One-time Super Admin bootstrap: `SUPER_ADMIN_BOOTSTRAP_SECRET`; remove/rotate after bootstrap.
- YouPI: `YOUPI_API_URL`, `YOUPI_CREATE_PAYMENT_PATH`, `YOUPI_MERCHANT_ID`, `YOUPI_WEBHOOK_SECRET`, `YOUPI_RETURN_URL`, `YOUPI_API_CONTRACT_CONFIRMED`, `YOUPI_ENABLED`. Keep both activation flags false; production payments are not approved.

Hosted Supabase functions may supply `SUPABASE_URL` and service-role credentials automatically; verify the deployed function environment rather than assuming this.

## Test-only values

Use only a disposable staging environment:

- `MYSQL_TEST_DATABASE` must exactly equal the dedicated `MYSQL_DATABASE`.
- `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`, and `SUPABASE_TEST_ACCESS_TOKEN` must belong to a staging project and test user.

Without these values, the two real database tests are correctly skipped. Never use a production service-role token for integration tests.

## Canonical URL and external allowlists

There is no production hostname variable baked into the frontend. The primary verified domain is read from the Supabase public domain-config RPC. Supabase Auth Site URL/redirect allowlists, Google OAuth redirect URI, Meta callback/webhook settings, and hosting/DNS settings are separately maintained by their providers and must be configured manually.
