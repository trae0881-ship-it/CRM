# Integration status

| Integration | Status | Current implementation | Exact blocker |
|---|---|---|---|
| Meta Lead Ads | WAITING FOR CREDENTIALS | Signed/idempotent webhook foundation | Meta app, Page, tokens and staging delivery |
| Telephony | WAITING FOR CREDENTIALS | Provider-neutral manual fallback | Provider contract, credentials and status webhooks |
| WhatsApp provider | WAITING FOR CREDENTIALS | Personal click-to-chat and activity logging | Official API contract, credentials and delivery webhooks |
| YouPI-PG | INTEGRATION FOUNDATION ONLY | Server checkout, signed webhook and ledger | Merchant credentials, Edge Function deployment and reconciliation |
| Open SEO | WAITING FOR DEPLOYMENT | Isolated tool registry | Service deployment and authenticated adapter |
| Open SEO Crawler | WAITING FOR DEPLOYMENT | Isolated tool registry | Worker deployment, SSRF controls and health endpoint |
| Google Maps Scraper Kit | WAITING FOR DEPLOYMENT | Isolated tool registry | Worker deployment, legal review and source restrictions |
| LeadPro | BLOCKED BY LICENSE | Registry and blocked status | Written license permission or valid repository license |
| listmonk | WAITING FOR DEPLOYMENT | Registry and compliance notes | Separate deployment, PostgreSQL, SMTP and AGPL review |
## Phase 9 status

- Sales pipeline: **INTEGRATION FOUNDATION ONLY**. Drag/drop now persists through a tenant-authorized, optimistic-concurrency RPC, but no staging execution is available.
- Customer 360: **INTEGRATION FOUNDATION ONLY**. The current profile surface is lead-backed; complete cross-module activity joins remain deployment-dependent.
- Campaigns, targets and commissions: **INTEGRATION FOUNDATION ONLY**. Schemas and local calculations exist; authoritative database workflows are unverified.
- YouPI-PG: **WAITING FOR CREDENTIALS**.
- Growth Tools: **WAITING FOR DEPLOYMENT**.
- WhatsApp and telephony: **WAITING FOR CREDENTIALS**.
- Supabase Auth/RLS: **WAITING FOR DEPLOYMENT**.
