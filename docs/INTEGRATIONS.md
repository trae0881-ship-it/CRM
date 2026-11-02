# Integrations

Integrations will use typed adapters with explicit states: `not_configured`, `pending`, `connected`, and `error`. Provider secrets remain server-side.

Inbound webhook adapters must validate payloads, verify signatures where supported, and persist an idempotency key before creating a lead. CSV import uses an import job and retains row-level validation errors. The current Phase 1 shell does not claim any provider connection.

## Meta Lead Ads setup

1. Create a Meta Developer app with Facebook Login for Business and add the `leads_retrieval` and `pages_manage_metadata` permissions subject to Meta review.
2. Set the server-only Supabase secrets from `.env.example` with `supabase secrets set`. `META_APP_SECRET`, `META_VERIFY_TOKEN`, and `SUPABASE_SERVICE_ROLE_KEY` must never be placed in a `VITE_` variable.
3. Deploy `supabase/functions/meta-lead-webhook` and configure the Page webhook callback as:
   `https://<project-ref>.supabase.co/functions/v1/meta-lead-webhook`

## Calling and WhatsApp status

The calling workspace currently supports explicit manual-confirmation mode and persists call outcomes, durations, follow-up requirements, and skip reasons. Automatic PSTN/browser calling is not claimed until a provider is configured with authenticated status webhooks.

The WhatsApp provider site at `https://bulkmarketing.techaasvik.in/` was reviewed on 2026-11-02. It documents official Meta Cloud API positioning, campaigns, templates, delivery analytics, and Embedded Sign-Up, but does not publish an API base URL, authentication format, request schema, response schema, or webhook contract. The project therefore includes provider-neutral `whatsapp_messages` storage and personal click-to-chat remains the safe fallback; no Techaasvik API endpoint is fabricated. Request the provider's official API documentation before implementing server-side sends.
4. Subscribe the Page to the `leadgen` field. During verification, Meta must send the same `META_VERIFY_TOKEN`; the function returns the challenge only when it matches.
5. Store each authorized Page in `meta_integrations` with `status = 'connected'` only after a real Graph API connection test, and store its Page token in `meta_integration_secrets` using a server-side operation. The browser cannot read that token table.
6. Submit a real Facebook or Instagram Instant Form test lead. The function verifies `X-Hub-Signature-256`, fetches the lead by `leadgen_id`, upserts by `(organization_id, meta_lead_id)`, and records the webhook/activity outcome.

The current repository does not include Meta credentials, a connected Page, or a test form, so a live delivery cannot be claimed yet. Historical sync and OAuth connection screens remain pending configuration work; no fake connected state is presented.

## Staging integration readiness

| Integration | Server-side inputs | Contract required before implementation | Security requirements |
|---|---|---|---|
| Meta Lead Ads | `META_APP_SECRET`, verify token, service-role key | Graph API permissions, webhook payloads, token lifecycle | Verify HMAC, persist webhook idempotency before lead creation, honor consent and opt-out |
| WhatsApp provider | Provider credential and sender configuration | Base URL, auth, send payload/response, delivery webhook | Keep secrets server-side, deduplicate provider message IDs, record opt-in and failures |
| Telephony | Provider account, webhook secret | Initiate/status payloads, call states, retry rules | Verify webhook signature, prevent duplicate state transitions, enforce do-not-call |
| Billing | Billing provider credentials | Plan/subscription/invoice/payment webhooks | Verify signatures, use idempotency keys, never expose payment secrets |

No endpoint is inferred where official documentation is unavailable. Each adapter must log a correlation ID and sanitized outcome only; tokens, passwords and full provider payload secrets must not be logged.

YouPI-PG has a documented REST contract and is implemented experimentally in `supabase/functions/youpi-create-payment` and `supabase/functions/youpi-webhook`. See [YOUPI-PG.md](./YOUPI-PG.md) for deployment and settlement requirements. Live payment processing is not claimed.

Phase 7 customer and sales operations use tenant-scoped database repositories. Calling and WhatsApp remain provider-neutral until official credentials and webhook contracts are configured.

Phase 8 connection status: Meta, WhatsApp, telephony, YouPI-PG and all Growth Tools are not live in this workspace. Required credentials, deployed endpoints and authenticated health checks are documented but absent.
