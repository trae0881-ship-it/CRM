# Adometa CRM Bug Register

Audit date: 2026-11-14. Severity reflects observed implementation risk, not confirmed production impact. "Not runtime verified" indicates no connected Supabase/staging environment.

| ID | Severity | Area | Finding | Status / verification |
|---|---|---|---|---|
| UX-001 | High | Auth/session | Sidebar profile used hard-coded initials/name/org; workspace membership and user metadata were not displayed. | Fixed locally with authenticated profile data/menu; live profile/RPC test blocked until migration deployment. |
| UX-002 | High | Logout/session | Logout was a menu-shaped icon with no visible text/menu, no error feedback and no centralized app-state reset. | Fixed locally with profile menu, mobile nav action, confirmation, error feedback and login redirect; role-specific runtime tests remain blocked. |
| SEC-001 | High | Tenant session | `membership` and tenant data were not cleared on sign-out/account switch; authenticated UI rendered even when membership resolution returned null. | Fixed locally by clearing auth-bound state and gating on active membership; multi-user isolation testing remains blocked. |
| SEC-002 | High | Company suspension | Original shared membership/role/team helpers did not consistently check `organizations.is_active`, so company suspension did not itself remove all tenant-policy access. | Fixed in additive migration 023; not deployed or live-verified. |
| UX-003 | High | Lead management | Lead list toolbar filter/date controls do not apply filters; edit/archive/import/duplicate review are absent. | Confirmed by view implementation. |
| CRM-001 | High | Leads | Configured workspace initialized with sample lead records and could retain them if live retrieval failed. | Fixed locally: configured mode now starts empty and requests wait for verified membership. |
| CRM-002 | High | Pipeline | Pipeline board supports desktop drag and select movement but no touch drag alternative; no visible stage administration or stage history screen. | Confirmed by view and service. |
| CRM-003 | Medium | Customer 360 | Customer view is a searchable lead table; communication, documents, activity and sales history are not assembled into a 360 profile. | Confirmed by view. |
| CRM-004 | Medium | Analytics | Reports export/filter lead rows only; requested conversion, source, performance, team, pipeline and follow-up reports are incomplete. | Confirmed by view/service. |
| INT-001 | Medium | Google Sheets | Spreadsheet listing endpoint exists but the UI does not invoke it; spreadsheet and worksheet are typed manually, and worksheet ID is not selected. | Confirmed by view and Edge Function. |
| INT-002 | Medium | Google Sheets | OAuth start UI opens a new tab and asks the user to refresh; callback completion is not reflected automatically. | Confirmed by view. |
| INT-003 | Medium | Google Sheets | Sync history view exposes aggregate status/counts but not row-level errors despite backend error records. | Confirmed by view and sync endpoint. |
| ADM-001 | Medium | Super Admin | Company list has search but no pagination/filter controls; data tables do not consistently expose loading, empty and retry states. | Confirmed by view. |
| ADM-002 | Medium | Platform setup | Plan CRUD, complete platform settings and security/access management screens are not present in the inspected navigation. | Confirmed by navigation/module inventory. |
| A11Y-001 | Medium | Mobile navigation | Drawer lacked a backdrop, Escape handling and explicit mobile logout entry; focus containment is also absent. | Backdrop, Escape close and explicit logout fixed locally. Focus containment and authenticated browser verification remain open. |
| DATA-001 | Medium | Lead sync | Service-level search builds a PostgREST `.or()` filter using direct user input; punctuation/query syntax should be validated/escaped before use. | Confirmed by source; production behavior not tested. |
| OPS-001 | Low | Feedback | Toast timers are not cancelled, so an earlier timer may dismiss a newer notification. | Confirmed by implementation pattern. |
| EXT-001 | Blocked | External services | No live Google, Meta, email, telephony, staging, or Supabase verification environment is available. | Environment blocker, not inferred as code failure. |

## Audit verification results

- `npm test`: PASS, 49 tests after local remediation.
- `npm run lint`: PASS.
- `npm run build`: PASS.
- `npm audit --audit-level=high`: PASS on initial baseline (zero reported vulnerabilities); final retry BLOCKED because registry DNS was unavailable.
- Supabase RLS, direct unauthorized RPC calls and cross-tenant attempts: BLOCKED (no staging identities/project).
- Responsive visual QA: PARTIAL; unauthenticated login page only.
- Production migrations: NOT RUN.

An integrated browser smoke check exercised the public login page at 1440x900, 1024x768, 768x1024, 390x844 and 320x700: no horizontal overflow and the auth card stayed within the viewport. Authenticated CRM screens remain untested without staging credentials.

## Priority

The first local pass now addresses session isolation, logout, hard-coded profile details and tenant access for suspended organizations. Deploy and verify migrations 022-023 in staging before profile-edit or suspension release. Keep user-facing placeholder controls explicitly disabled or implement their real behavior; do not report success for unconfirmed provider operations.
