# Adometa CRM Redevelopment Roadmap

Audit date: 2026-11-14

Work should remain additive and preserve existing CRM data, Google Sheets foundations, payment safeguards, permissions and migration order. Do not apply database migrations to production.

## Phase 1 — Authentication, logout and account (P0)

1. Centralize auth-state transitions; clear membership, organization, lead, team and notification state when the session ends or changes.
2. Require a verified active membership before rendering tenant routes; route membership failures to an explicit recovery state without redirect loops.
3. Add a visible logout item in the desktop profile menu and mobile drawer; report sign-out failures and redirect after success.
4. Render actual profile, membership, organization and team data. Add a self-profile update path limited to approved profile fields; prohibit role/permission edits.
5. Add focused tests for logout, expiry, user switching, profile writes and all roles.

## Phase 2 — Responsive navigation and core CRM (P0/P1)

1. Implement accessible responsive drawer behavior: backdrop, Escape, focus, touch targets and close-on-navigation.
2. Remove sample records from configured/live mode; show loading, empty and error/retry states distinctly.
3. Complete lead CRUD/archive, assignment, role-aware filters, pagination, duplicate checks, import and data exports.
4. Add touch-friendly pipeline stage changes, stage configuration/history and server-authorized movement tests.
5. Add actual activity/reminder workflows and complete Customer 360 relations.
6. Validate all forms, tables, dialogs, charts and fixed controls at common desktop/tablet/mobile widths.

## Phase 3 — Super Admin completeness (P1)

1. Define and test exact metric semantics; reconcile organization, subscription, MRR and payment figures against database fixtures.
2. Add pagination/filtering, loading/error/empty states, plan CRUD, history and payment/QR review with immutable audit evidence.
3. Add platform settings and integration/access-management controls only where backed by server authorization.
4. Test unauthorized roles against UI routes, tables and every privileged RPC.

## Phase 4 — Organization access and pipeline (P1)

1. Establish a role/permission matrix and verify each service/RPC against it.
2. Implement team membership assignment and scoped manager access with atomic seat-limit enforcement.
3. Test cross-tenant read/write/RPC/storage denial in disposable staging.

## Phase 5 — Integrations and billing (P1/P2)

1. Complete Sheets resource selection, OAuth callback UX, mapping validation, scheduler, retries, row-level errors and disconnect/token revocation.
2. Retain Meta as Coming Soon until webhook/configuration and provider review are complete.
3. Keep YouPI and QR production disabled until current provider docs, credentials, staging and reconciliation evidence are approved.
4. Test duplicate deliveries/idempotency, invalid signatures, amount mismatch, payment lifecycle and audit logs.

## Phase 6 — Reporting and product completion (P2)

1. Implement actual source, conversion, pipeline, follow-up, team and salesperson reports, with consistent date boundaries and authorized data scope.
2. Add row/card responsive alternatives where horizontal scrolling is not suitable.
3. Add user-journey browser tests, axe/accessibility checks and multi-tenant data fixtures.

## Release gates

- `npm test`, `npm run lint`, `npm run build`, and `npm audit --audit-level=high` pass.
- Disposable staging verifies session roles and Alpha/Beta isolation for table, RPC, Edge Function and storage access.
- Visual QA and automated browser tests cover desktop/tablet/mobile flows.
- Migration review documents dependency impact; staging apply and rollback are verified before any production change.
- Provider features remain explicitly blocked/disabled until genuine end-to-end provider evidence exists.

## Current status

The updated local suite passes 49 tests and TypeScript lint/build. Dependency audit passed on the initial baseline with zero reported vulnerabilities; its final retry was blocked by registry DNS. This task adds the initial Phase 1 implementation: auth-state reset and membership gating, explicit desktop/mobile sign-out, expiry messaging, actual profile/organization/team display, and self-only profile update RPC. Migrations 022-023 are additive and require staging validation/deployment. No production migration was run. Staging, role matrix, authenticated browser viewport and external provider verification remain blocked by missing environment/credentials.
