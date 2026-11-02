# Security plan

- Never expose a Supabase service-role key in the browser.
- Enforce tenant and role authorization with PostgreSQL RLS; UI checks are only for UX.
- Validate all form and import data at the repository boundary.
- Normalize phone and email values for duplicate detection without silently deleting records.
- Record role, ownership, assignment, deletion, and export changes in `audit_logs`.
- Keep webhook secrets server-side and verify signatures/idempotency keys when providers support them.
- Treat browser `tel:` and `wa.me` links as user-initiated actions; do not claim call recording or verified telephony analytics without a provider.
- Do not provision a default administrator with a known password.
- Meta Page access tokens are stored in the service-role-only `meta_integration_secrets` table, not in the browser-readable integration metadata.
- Webhook events are idempotent on the Meta lead ID and are retained with failed status/error text for retry tooling.
- Webhook event and token tables are RLS-enabled and revoked from browser roles; the Edge Function uses the service role only on the server.
