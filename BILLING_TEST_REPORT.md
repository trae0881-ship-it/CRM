# Billing test report

| Scenario | Expected result | Actual result | Status | Evidence |
|---|---|---|---|---|
| YouPI credentials unavailable | Gateway fails closed | No staging credentials available | BLOCKED | No Supabase staging configuration |
| Sandbox connection | Verified provider response | Not attempted | BLOCKED | Provider contract unavailable |
| Payment order creation | Server plan amount and INR only | Static safeguards present; live call unavailable | BLOCKED | `youpi-create-payment` |
| Successful verified payment | Reconciled UPI may activate subscription | Live webhook unavailable | BLOCKED | `youpi-webhook` |
| Failed/pending/cancelled/expired | No activation | Static state handling present; live test unavailable | BLOCKED | YouPI tests |
| Invalid signature | 401 and no payment update | Static test passed | PASS (LOCAL) | `tests/youpi-payment.test.mjs` |
| Duplicate webhook | No duplicate processing | Static test passed | PASS (LOCAL) | Unique delivery ID logic |
| QR generation | Provider-backed amount/reference | No verified QR provider | BLOCKED | `QR_PAYMENT_VERIFICATION.md` |
| QR success/expiry | Server confirmation only | Not attempted | BLOCKED | No provider contract |
| Incorrect amount | Reject and retain ledger state | Static guard present | PASS (LOCAL) | Webhook amount comparison |
| Cross-tenant payment access | Denied | RLS not live-tested | BLOCKED | Staging identities unavailable |
| Subscription activation | Only verified reconciliation | Static logic present | PASS (LOCAL) | UPI settlement condition |
| MRR/history | Verified database records only | Live records unavailable | BLOCKED | No staging connection |

Mocked/static tests are not presented as live payment integration tests.
