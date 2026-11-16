# Billing and payment verification

## Current status

Adometa retains plan/subscription administration, generic payment-history records, state history, and manual QR-review records. No payment-provider checkout, provider configuration, or payment webhook integration is included.

| Scenario | Current result | Status |
|---|---|---|
| Plan assignment | Administrative subscription update only; it does not collect or confirm payment | Locally implemented; staging unverified |
| Generic historical payment records | Preserved by schema retirement migration | Migration not applied |
| QR/manual review | Review records remain separate from settlement | Production workflow not verified |
| Provider checkout and webhook | No active implementation | Not implemented |
| Cross-tenant payment access | Existing RLS policies remain in place | Staging identities unavailable |
| Reconciliation or MRR from payments | No live provider settlement source | Not verified |

No live billing or payment-provider tests were run. Do not treat a frontend build, plan assignment, or uploaded receipt as proof of payment.
