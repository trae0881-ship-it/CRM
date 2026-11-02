# Testing

The planned test layers are:

- Business-rule unit tests for status transitions, duplicate normalization, and assignment rules.
- Supabase integration tests for RLS tenant isolation and role permissions.
- Component tests for forms, loading/empty/error states, and lead actions.
- Browser tests for login, lead creation, assignment, follow-up completion, and reports at 360px, 768px, and 1440px.

The development workspace has Node.js/npm available and runs the configured lint, test, and production build commands. Live RLS workflow tests still require authenticated users in a configured Supabase project.

The Supabase Edge Function includes a Deno test for HMAC signature creation and constant-time comparison in `supabase/functions/meta-lead-webhook/crypto.deno.ts`. Run it with `deno test --allow-env supabase/functions/meta-lead-webhook/crypto.deno.ts` in a Deno/Supabase CLI environment. The Node suite validates lead journey migration safety, duplicate-share protection, deterministic smart-priority ordering, call transitions, report generation, booking amount rules, site-visit lifecycle rules, date filters, true OOXML XLSX output, platform-admin migration restrictions, and lifecycle trigger coverage. Calling, RLS, provider webhooks and WhatsApp delivery still require a configured external provider and authenticated Supabase accounts. Phase 2/3 browser screens use real repositories and show an explicit configuration error when Supabase is unavailable; they do not fall back to fake records.

## Phase 4 staging test plan

Create two organizations with separate users:

| Role | Organization A | Organization B | Expected scope |
|---|---:|---:|---|
| Super Admin | 1 | — | Platform metadata only; no private lead access without an explicit support grant |
| Company Owner | 1 | 1 | Authorized organization management and company reports |
| Organization Admin | 1 | 1 | Member, team and status management within the own organization |
| Sales Manager | 1 | 1 | Assigned teams and authorized leads only |
| Salesperson | 2 | 2 | Own and explicitly shared leads only |

Execute and record pass/fail for:

1. Log in as every role and verify navigation.
2. Attempt to read a lead from the other organization and another salesperson's private lead.
3. Share a lead, verify recipient access, then transfer ownership and verify immutable history.
4. Create, complete, cancel and reschedule follow-ups; verify ownership restrictions.
5. Create and update a site visit and booking, including cross-organization ID attempts.
6. Record payments below, equal to and above the booking amount; overpayment must fail.
7. Generate personal and company reports; verify unauthorized users cannot export other users' rows.
8. Trigger assignment, sharing, follow-up, visit and booking events; verify recipient, unread state and deduplication.
9. Verify timeline actor, timestamp, organization and immutable historical rows.

These staging tests have not been run because no Supabase project or authenticated accounts are configured in this workspace.

The required two-organization RLS, role, payment and Growth Tools tests are therefore **WAITING FOR DEPLOYMENT**. Local tests do not substitute for authenticated staging evidence.

Phase 6 local tests cover deterministic assignment, workload balancing, explainable lead scoring, workflow event idempotency and tenant-scoped automation migration policies. Live assignment workers, pipeline drag-and-drop persistence, provider calling, WhatsApp delivery and authenticated RLS remain **WAITING FOR DEPLOYMENT**.

Phase 7 local tests cover stage validation, customer duplicate matching, target achievement, commission bounds and import-row validation. Customer 360, support, campaign, commission and import RLS require authenticated staging verification.

Phase 8 local status is **COMPLETE AND LOCALLY VERIFIED** for the listed deterministic tests only. The latest local suite contains 38 passing tests, including migration 018 organization-admin authorization assertions. Staging authentication, RLS, Edge Functions, provider sandbox, backup restore and two-organization tests are skipped and must be reported as **WAITING FOR DEPLOYMENT**, not passed. Staging authentication, RLS, Edge Functions, provider sandbox, backup restore and two-organization tests are skipped and must be reported as **WAITING FOR DEPLOYMENT**, not passed.

Phase 9 adds local coverage that verifies the pipeline hardening migration contains tenant stage validation, optimistic concurrency protection and auditable stage history. No database-backed pipeline execution has been run.

Payment-specific staging cases must include invalid HMAC signatures, replayed delivery identifiers, amount/currency mismatches, gateway-disabled checkout, `OBSERVED_SUCCESS`, `MANUAL_REVIEW`, COD `SUCCESS`, and UPI `RECONCILED`. Only the final case may activate a subscription.

## Dependency audit

`npm audit` previously reported `xlsx@0.18.5` with prototype-pollution and ReDoS advisories. It was removed and replaced with `fflate@0.8.3` plus a constrained OOXML writer in `src/lib/xlsx.ts`. Re-run `npm audit` after dependency installation; no forced audit fix is used.
