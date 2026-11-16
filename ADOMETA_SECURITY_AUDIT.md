# Adometa CRM Security Audit

Audit date: 2026-11-14

## Scope and limitations

Reviewed application authentication/session handling, tenant service patterns, all 21 original SQL migration files, platform and organization authorization RPCs, Google Sheets and payment Edge Functions, existing security-related tests and audit documents. `.env` was not read. No production or staging project was accessed and no migration was applied. Two additive migrations (022-023) were created after reviewing existing policies. This is a repository code review, not a security certification or live penetration test.

## Controls observed

- Supabase browser client uses the publishable/anon key and persisted, auto-refreshed auth sessions.
- Initial schema enables RLS on core tables. Later migrations add tenant policies, role checks and server-authorized RPCs.
- Platform dashboard, company, status, subscription and membership operations use `is_platform_admin()`-guarded RPCs in migration 020.
- Organization membership/profile operations use authorization RPCs with Super Admin/self-role restrictions, last-owner safeguards, seat-limit checks and audit events in migration 018.
- Pipeline stage movement has an authorization RPC, optimistic timestamp check and audit/history foundations.
- YouPI Edge Functions keep provider/service credentials server-side, validate membership, verify raw-body signatures and record idempotency/delivery state. Reconciliation gates subscription activation.
- Google Sheets OAuth and sync use server-side Google credentials and encrypted tokens, short-lived one-time OAuth state and organization membership checks.
- Existing local tests cover policy/RPC patterns, payment idempotency/reconciliation, QR review and Google sync source mapping.
- Migration 023 updates shared organization-membership, role, team-manager and team-member predicates to require an active organization, making suspension effective for tenant RLS policies using these helpers after deployment.

## Findings and risks

### High — client session changes did not clear tenant application state (remediated locally)

At audit baseline `src/App.tsx` set the session from Supabase auth events without resetting tenant state and rendered the shell when membership resolution returned `null`. The application now clears state on sign-out/user switch and blocks the workspace until active membership is verified. This reduces stale UI exposure but does not replace RLS. Authenticated multi-user testing remains unavailable.

### High — company suspension did not gate shared tenant membership (mitigation prepared)

The original membership, role and team helper predicates did not consistently check `organizations.is_active`. Migration `202611020023_block_suspended_organization_access.sql` adds the organization status condition to the shared authorization helpers. It is not deployed; staging must verify suspend/reactivate behavior across table policies and RPCs.

### Medium — user identity was not sourced from the authenticated profile (locally remediated)

The baseline shell displayed hard-coded organization/name/avatar data. It now queries the authenticated user's profile row and exposes only permitted name/avatar updates through a self-only RPC. Migration 022 is not deployed, so the profile editor requires staging validation before release.

### Medium — incomplete status/error reporting in service operations

Some Edge Function database writes are not checked before success-shaped responses (for example disconnect/update and sync status/counter writes). This can misrepresent completion and leave inconsistent integration state. Verify every privileged write result and fail explicitly; do not return success on a failed persistence operation.

### Medium — production isolation is unverified

No live Alpha/Beta tenant matrix, unauthorized RPC test, storage access test, role escalation test, Edge Function deployment configuration, or Supabase advisor result was available. Static policy tests are not runtime evidence.

### Low — search filter composition

Lead search interpolates user text into a PostgREST `.or()` expression. Validate/escape reserved filter syntax or use a server-side safe search function to avoid malformed filters and reduce query parsing risk.

### Profile update authorization — mitigation prepared, deployment required

The original profile table had no self-update RLS policy, so a client-side metadata update would not safely update the canonical profile row. Migration `202611020022_self_profile_update.sql` adds a `SECURITY DEFINER` RPC that requires `auth.uid()` and only changes that user's full name and HTTPS avatar URL; it grants execution to authenticated users only and accepts no role/permission fields. The RPC has not been applied to any database.

## Payment/integration safety

- Current code gates YouPI on `YOUPI_ENABLED` and `YOUPI_API_CONTRACT_CONFIRMED`; keep both false until documented staging checks pass.
- Do not enable QR production payments or activate paid subscriptions based on client assertions or uploaded receipts.
- Keep Meta labelled Coming Soon until real configuration and verification are completed.
- Check all database mutation errors in OAuth, sync, payment and webhook paths; ensure partial failures are retry-safe and visible.

## Verification outcomes

- Local static/source test suite: PASS (49 tests).
- Lint/build: PASS.
- `npm audit --audit-level=high`: PASS on initial baseline (zero reported vulnerabilities); final retry BLOCKED by registry DNS outage.
- Live RLS/RPC/tenant/storage testing: BLOCKED (no staging project/accounts).
- Edge Function deployment and secrets review: BLOCKED.
- External payment and OAuth staging: BLOCKED.
- Production migrations: NOT RUN.

## Required before release

Run the Alpha/Beta direct table/RPC/storage/Edge Function matrix from `RLS_TEST_REPORT.md`; verify each role and inactive-membership behavior; check Supabase security advisor and deployed function configuration; inspect logs for leaked sensitive payloads; test backup/restore; and record staging evidence. Findings above should be resolved or accepted by an accountable owner before production.
