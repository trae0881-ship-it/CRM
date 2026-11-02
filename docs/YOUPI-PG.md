# YouPI-PG merchant integration

YouPI-PG is an experimental, self-hosted project. Its public README states that it is not certified, bank-approved, audited or production-ready. It is not a conventional hosted gateway contract, so no endpoint or response shape is treated as official without an independently reviewed deployment contract.

Current status: **INTEGRATION FOUNDATION ONLY**. No live gateway is configured or independently verified in this workspace.

Phase 9 result: the public repository was reviewed, but no merchant sandbox credentials, deployed Edge Functions or confirmed REST contract were available. Checkout, webhook replay, reconciliation and renewal tests remain skipped; live payments stay disabled.

## Server configuration

Configure these values as Supabase Edge Function secrets; never add them to a `VITE_` variable or expose them through the browser:

- `YOUPI_API_URL`
- `YOUPI_CREATE_PAYMENT_PATH`
- `YOUPI_MERCHANT_ID`
- `YOUPI_WEBHOOK_SECRET`
- `YOUPI_RETURN_URL`
- `YOUPI_API_CONTRACT_CONFIRMED`
- `YOUPI_ENABLED`
- `YOUPI_TEST_MODE`

The create-payment function accepts only an organization and subscription plan identifier. It loads the authoritative plan amount from the database and creates a unique merchant order. It refuses to call a provider until the exact create-payment path and response contract have been reviewed and `YOUPI_API_CONTRACT_CONFIRMED=true` is set. The current workspace has no confirmed provider contract or credentials.

## Webhook and settlement rules

The webhook reads the raw request body and verifies `X-Gateway-Signature` using HMAC-SHA256 with constant-time comparison. Delivery identifiers are unique and repeated deliveries are acknowledged without repeating fulfillment. Amount, currency, order, and supported event are checked against the immutable payment ledger.

For UPI, `OBSERVED_SUCCESS` is recorded but never activates a subscription. `MANUAL_REVIEW` is held. Only `RECONCILED` with `method = UPI` and `settlementState = RECONCILED` activates the subscription. `SUCCESS` is not UPI settlement and is recorded only as a non-bank-settlement event. No refund endpoint is implemented because the official merchant documentation does not define one.

## Staging checklist

1. Configure a test merchant and Edge Function secrets.
2. Create a test checkout from an authorized company owner account.
3. Verify that the amount comes from the selected database plan, not the browser.
4. Send invalid-signature, duplicate-delivery, amount-mismatch, `OBSERVED_SUCCESS`, `MANUAL_REVIEW`, and `RECONCILED` fixtures.
5. Confirm only reconciled UPI payments activate subscriptions.
6. Import the gateway-supported bank statement and verify reconciliation manually.
7. Review payment ledger and webhook audit rows without exposing secrets.
