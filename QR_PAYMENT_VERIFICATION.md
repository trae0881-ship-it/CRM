# QR payment verification

Status: **BLOCKED — NO VERIFIED PROVIDER QR CONTRACT**.

The application does not treat an uploaded screenshot or frontend callback as payment confirmation. Migration 021 adds a pending manual-review record and payment state history, but no receipt is auto-approved and no subscription is activated by a receipt.

## Required provider-backed behavior

- Dynamic QR must be created by the verified provider for the server-authoritative INR amount.
- QR must reference the organization, subscription/invoice and unique payment transaction.
- Expiry and status must come from the provider or verified webhook.
- Duplicate payment and webhook identifiers must be rejected.
- Cross-organization reads and review actions must be denied by RLS and backend membership checks.
- Only an authorized Company Owner/Organization Admin may approve a manual review, with an audit record.

No QR generation, QR success, expiry, reconciliation or refund is marked live until a real sandbox contract and staging test pass.
