# YouPI payment integration

Status: **BLOCKED — WAITING FOR CREDENTIALS AND PROVIDER VERIFICATION**.

The Edge Functions fail closed unless `YOUPI_ENABLED=true`, `YOUPI_API_CONTRACT_CONFIRMED=true`, server-only API configuration and webhook secret are present. The browser never receives the service-role key, merchant secret or webhook secret.

## Local safeguards

- Server-authoritative plan amount and INR currency.
- Organization Owner/Admin membership check.
- Required client idempotency key and unique organization-scoped ledger key.
- Server-side gateway order creation.
- Raw-body HMAC verification using `x-gateway-signature`.
- Unique webhook delivery id replay protection.
- Amount/currency comparison before ledger updates.
- UPI subscription activation only after `RECONCILED` plus UPI settlement confirmation.
- Payment state history for webhook transitions.
- Failed, cancelled and expired events do not activate subscriptions.
- Subscription assignment from the admin UI does not create a payment or claim payment success.

## Staging requirements

Configure only Supabase Edge Function Secrets:

- `YOUPI_API_URL`
- `YOUPI_CREATE_PAYMENT_PATH`
- `YOUPI_MERCHANT_ID`
- `YOUPI_WEBHOOK_SECRET`
- `YOUPI_RETURN_URL`
- `YOUPI_API_CONTRACT_CONFIRMED=true` only after the provider contract is independently reviewed
- `YOUPI_ENABLED=false` until sandbox verification succeeds
- `YOUPI_TEST_MODE=true`

The provider's current official signature, checkout, status and refund documentation is still required. No live or sandbox success is claimed here.
