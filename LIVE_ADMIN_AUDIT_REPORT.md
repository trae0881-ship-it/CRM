# Live Admin Audit Report

## Status

**COMPLETE AND LOCALLY VERIFIED:** platform metrics now come from the server-authorized `platform_dashboard_stats` RPC. Platform company creation, rename, suspend/reactivate and subscription assignment/update use authorized RPCs with audit history. Subscription assignment never creates a payment record.

**WAITING FOR DEPLOYMENT:** no Supabase staging credentials or authenticated live dashboard session are configured in this workspace. The displayed counts (one company, one user, zero active subscriptions, zero MRR) cannot be independently confirmed against the deployed database from here.

## Implemented

- Correct company, active/suspended, trial, distinct membership-user, active/expired subscription and active-plan MRR metrics.
- Subscription assignment for companies with no existing row.
- Plan/status changes, renewals through period fields, duplicate prevention through the unique organization subscription constraint.
- Subscription history and audit events.
- Company status reason required and recorded.
- Existing organization admin, team and lead surfaces remain tenant-scoped.
- YouPI remains disabled unless real configuration and verification are present. QR upload is not treated as payment confirmation.
- Growth Tools remain disabled/not installed.
- License register now exposes pinned version and pinned commit fields; all current values remain unpinned.
- Branding remains Adometa/adometa throughout the changed admin surfaces.

## Verification

- Local automated tests: passed.
- TypeScript lint: passed.
- Production build: passed.
- High-severity npm audit: passed.
- Live Supabase metrics, RPC execution, RLS, QR storage and cross-tenant access: **not verified**.

## Required staging checks

1. Apply migrations `202611020001` through `202611020020` in order to a disposable staging project.
2. Sign in as Super Admin and verify counts against direct SQL read-only queries.
3. Assign a configured plan to the existing company and verify exactly one subscription row and one history row.
4. Test suspension/reactivation with an explicit reason.
5. Test Company Owner, Organization Admin, Manager and Salesperson against two organizations.
6. Verify YouPI remains disabled and no payment row is created by manual plan assignment.
7. Verify Storage/RLS access for any future QR assets.

No production readiness claim is made until these live checks pass.
