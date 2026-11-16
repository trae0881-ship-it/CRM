# Adometa CRM Product Audit

Audit date: 2026-11-14

## Scope and evidence

Reviewed the Vite/React application in `src/`, all 21 original Supabase migrations, all 10 Supabase Edge Functions, the existing Node test suite, product/security/deployment documentation, and package scripts. Two additional migrations were created after schema/policy review. `.env` was intentionally not opened. No Supabase project, authenticated staging identities, provider credentials, or live database connection were available.

Baseline validation: 45/45 Node tests passed; `npm run lint`, `npm run build`, and `npm audit --audit-level=high` passed. These checks do not prove deployed behavior or RLS isolation.

## Summary

This repository contains substantial, tenant-aware implementation foundations: Supabase authentication, organization membership, CRM lead and activity services, operations, reports/exports, platform billing, payment hardening, Google Sheets Edge Functions, and 21 original additive migrations. Several production workflows remain incomplete or unverified. A screen or service is not treated as proof of end-to-end availability.

Highest-priority user-facing defects found before local remediation:

1. Authenticated navigation showed hard-coded workspace/user details and no real profile menu. The only logout control was a small overflow icon; it neither confirmed nor reported a failed `signOut`. **Locally remediated; role-based runtime verification remains blocked.**
2. Auth changes updated the session, but organization, lead, team, performance, and notification state was not cleared. Membership absence was not a blocking state, and the workspace shell rendered without verified membership. **Locally remediated with state clearing and membership gating; live expiry/account-switch tests remain blocked.**
3. Initial/sample lead and identity values remained in configured application state while live requests resolved or failed. **Configured-mode leads now start empty and load only after active membership verification.**
4. Lead creation accepts only name/company/phone; search is the only effective lead list control. Filter/date controls are visual only, and edit/archive/import and duplicate handling are absent from this view.
5. Pipeline movement has a persisted authorization RPC, but the UI uses native drag-and-drop only, has no touch workflow, stage configuration UI, and fetches customer leads through a query that is not visibly scoped by pipeline stage.
6. Google Sheets has OAuth/sync foundations, but its visible screen asks users to type spreadsheet and worksheet identifiers instead of selecting available resources; the browser message asks users to refresh rather than reconciling OAuth completion.
7. Numerous modules are foundations or deliberately pending: live Meta integration, campaigns in the configured app, complete Customer 360, workflow execution, and external payment verification.

## Product-area findings

### Authentication and account

- Supabase session bootstrap and auth-state subscription exist. Login, signup, reset and password update handlers exist.
- The Super Admin login route checks membership after authentication; this is frontend routing plus backend-backed membership data, not a substitute for backend authorization.
- A profile menu now displays Supabase-backed profile, membership, organization and team information; name/avatar updates use a self-only RPC. Migration 022 must be deployed before updates can work.
- Logout now has desktop/mobile controls, confirmation and checked Supabase sign-out; application state clears on sign-out/account switch and membership is required before CRM rendering. Role-specific behavior is not runtime-verified.

### CRM and operations

- Lead list/create/status, details/timeline, sharing/transfer, calling, follow-ups, visits, bookings, notifications and basic reports have Supabase-backed service calls.
- UI controls for some list filters, lead dates and campaign workflows are placeholders. Delete/archive, full lead editing, robust duplicate review, bulk import/export and activity capture are not complete in the primary lead workspace.
- Customer 360 currently displays lead/contact fields only.
- Reports are lead-record exports, not the requested complete source, conversion, team, salesperson, pipeline and follow-up analytics suite.
- Several workflows use browser prompts or generic toast messaging instead of accessible forms or durable validation feedback.

### Platform administration

- Platform statistics are obtained from `platform_dashboard_stats`; company, plan, subscription, payment overview, audit and member queries/RPCs exist.
- The visible dashboard includes company search and status changes, but no pagination, broad filter controls, or platform-wide plan editing/settings workflow.
- Error messages generally surface through toast callbacks, but initial loading/empty/error states are inconsistent. Audit records and database authorization require live verification.
- Platform-level settings, security/access management, full billing/payment review and plan CRUD are not demonstrated as complete by the current UI.

### Integrations and billing

- Google Sheets has OAuth state, server-side token encryption, organization checks, scheduled/manual sync endpoints, source-row identity and sync run records. Deployment, Google credentials and cross-tenant tests remain external blockers.
- Meta webhook ingestion code exists; organization-side connection/configuration UI is not established, so Meta must remain Coming Soon in product messaging.
- YouPI checkout is explicitly gated by server secrets, an approved API contract and enablement flags. Payment activation is tied to reconciliation logic. QR/manual review has schema/test evidence and should remain non-activating absent review.
- None of the payment or Google provider flows have been verified against live staging credentials.

### Responsive and accessibility

- CSS includes a mobile sidebar transform, top-bar changes, responsive grids and horizontally scrollable table styling.
- There is no automated browser/device viewport test in the configured test scripts. Several dense inline forms, multi-column reports, platform tables and native drag targets still need real viewport testing.
- The mobile drawer now has a backdrop, Escape handling and a sign-out action; focus containment and authenticated viewport testing remain outstanding.

## Environment limits

- No production or staging migration was run.
- Two backward-compatible migrations were added after reviewing profile schema/policies and the shared RLS membership predicate. Neither was applied to any database.
- No live cross-tenant test, external OAuth, gateway sandbox test, or role-specific browser test was possible.
- `git` is unavailable in this environment, so repository status/diff and pre-existing uncommitted changes could not be inspected.

## Local remediation in this task

- Added visible desktop profile menu and mobile drawer sign-out, confirmation, checked Supabase sign-out, role-correct login redirect, and expired-session messaging.
- Clear user/organization data on sign-out or identity change and block CRM rendering until active membership is checked.
- Display authenticated email, phone when present in Supabase Auth, profile name/avatar, role, organization/team, membership/organization status and last sign-in metadata.
- Added a restricted self-profile RPC for full name/avatar only. Migration deployment is required before profile edits can succeed against a database.
- Added a backward-compatible revision to shared membership, role and team authorization helpers so suspended companies no longer pass tenant RLS policies after deployment.
- Added a mobile drawer backdrop and Escape-to-close behavior.

The updated test suite, type check, production build and dependency audit pass. The two new migrations are not deployed. Browser viewport checks covered only the unauthenticated login page.

See [ADOMETA_FEATURE_COMPLETENESS.md](./ADOMETA_FEATURE_COMPLETENESS.md), [ADOMETA_BUG_REGISTER.md](./ADOMETA_BUG_REGISTER.md), [ADOMETA_SECURITY_AUDIT.md](./ADOMETA_SECURITY_AUDIT.md), [ADOMETA_RESPONSIVE_TEST_REPORT.md](./ADOMETA_RESPONSIVE_TEST_REPORT.md), and [ADOMETA_REDEVELOPMENT_ROADMAP.md](./ADOMETA_REDEVELOPMENT_ROADMAP.md).
