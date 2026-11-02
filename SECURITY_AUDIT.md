# Security audit

## Controls present

- Tenant-owned tables use organization identifiers and RLS policies.
- Platform administrators receive metadata policies, not unrestricted lead access.
- Calls, visits and bookings have corrective authorization policies.
- Payment secrets and provider credentials are server-side only.
- YouPI-PG webhooks verify raw-body HMAC signatures and delivery identifiers.
- CSV/HTML export formula and markup injection is mitigated.
- Growth Tools default to disabled and isolated deployment.

## Unverified controls

- Live RLS behavior with two organizations.
- Authenticated role escalation and membership changes.
- Edge Function deployment permissions and secret configuration.
- Growth Tool SSRF enforcement in deployed workers.
- Webhook replay behavior in a deployed gateway.
- Backup restore and incident response.

## Known blockers

- No Supabase project is connected in this workspace.
- No authenticated staging accounts are available.
- No external provider credentials or isolated Growth Tool deployments exist.
- LeadPro has no declared license and must not be deployed.

These are verification and deployment gaps, not claims of security approval.

Phase 7 adds RLS-covered customer, support, commission and import records. The migration is prepared but not applied, so live policy behavior remains unverified.

Phase 8 verification could not run because no staging Supabase environment or authenticated test accounts are configured. Direct database and RPC isolation must be tested before production approval.
