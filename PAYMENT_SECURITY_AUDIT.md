# Payment security status

## Current gate

No payment-provider checkout, provider configuration, or webhook integration is currently implemented. This is a removal decision, not a claim that a payment provider passed integration testing.

## Preserved controls and records

- Subscription and plan administration remain separate from payment collection.
- Generic payment transactions, webhook-delivery history, payment-state history, and QR-review records are retained.
- Payment records remain subject to the existing row-level security policies.
- Manual receipt uploads do not automatically confirm settlement.

## Migration and deployment limitations

- The forward migration removes the provider-specific configuration table and overview function and generalizes provider identifiers without deleting transaction history.
- The migration has not been applied or tested against a staging database.
- Any already-deployed Supabase Edge Functions must be removed from the project separately; deleting local function source does not undeploy a remote function.
- Live RLS, backup/restore, and billing workflows remain unverified.
