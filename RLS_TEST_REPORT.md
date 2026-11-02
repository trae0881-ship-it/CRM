# RLS test report

Status: **WAITING FOR DEPLOYMENT**

## Environment

No Supabase project, authenticated users or service connection is configured in this workspace. No RLS query was executed and no policy was weakened.

## Required Alpha/Beta matrix

| Resource | Alpha user may read Alpha | Alpha user must not read Beta | Write checks |
|---|---:|---:|---|
| Leads and customers | Pending | Pending | Own organization only |
| Calls and follow-ups | Pending | Pending | Authorized lead/team only |
| Site visits, bookings and payments | Pending | Pending | Authorized workflow only |
| Campaigns, targets and commissions | Pending | Pending | Role-limited administration |
| Reports and tickets | Pending | Pending | Tenant and role filtered |
| Imports and notifications | Pending | Pending | Tenant-scoped records |
| Documents and integrations | Pending | Pending | Storage path and organization policy |

## Required direct checks

Run as each authenticated role using the publishable client:

1. Select Alpha IDs while authenticated as Beta; expect zero rows or an authorization error.
2. Insert/update a row with the other organization ID; expect an authorization error.
3. Call every exposed RPC with a foreign organization or record ID; expect rejection.
4. Request a foreign Storage object; expect denial.
5. Invoke Edge Functions with missing, invalid and foreign-authenticated requests; expect 401/403.
6. Confirm Super Admin sees platform metadata only unless an explicit support grant exists.
7. Repeat after refreshing the session and in a new browser session.

These are not passed until results, timestamps and authenticated user IDs are recorded from staging.
