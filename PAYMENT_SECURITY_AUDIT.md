# Payment security audit

## Gate status

**BLOCKED.** Supabase staging credentials, YouPI sandbox credentials and current provider documentation are unavailable. No payment migration was applied.

## Locally verified

- Credentials are read from Edge Function environment variables, not frontend code.
- Service-role and provider secrets are not placed in `VITE_` variables.
- Checkout amount comes from an active database plan.
- Organization membership is checked server-side.
- Payment orders require an idempotency key.
- Webhook signatures use the raw request body and constant-time comparison.
- Webhook delivery IDs are unique and replay-safe.
- Amount and currency mismatches are rejected.
- Only verified UPI reconciliation activates a subscription.
- Payment state transitions are recorded.
- QR/manual receipts remain pending and cannot auto-approve payment.

## Not verified

- Provider signature compatibility.
- Sandbox checkout and status APIs.
- Dynamic QR creation and expiry.
- Refund contract and behavior.
- Edge Function secret configuration.
- Browser console, logs and database security advisor output.
- Two-organization payment and Storage isolation.
