# Authentication test report

Status: **WAITING FOR DEPLOYMENT**

## Local evidence

The client configures Supabase Auth with persisted sessions, automatic token refresh and URL session detection. Auth service methods exist for sign-up, password sign-in, sign-out, password update and reset requests. Local tests do not prove a real Auth provider operation.

## Staging cases

| Case | Expected result | Status |
|---|---|---|
| Registration with valid email | Account created or confirmation required | Skipped |
| Invalid registration | Explicit Auth error | Skipped |
| Login with valid credentials | Session created and persisted after reload | Skipped |
| Invalid login | Explicit error; no session | Skipped |
| Logout | Session removed | Skipped |
| Password reset | Verified redirect and reset email | Skipped |
| Invitation acceptance | Member activated with intended role | Skipped |
| Deactivated account | Access rejected after refresh | Skipped |
| Suspended organization | Tenant access rejected | Skipped |
| Super Admin navigation | Platform metadata only | Skipped |
| Owner/Admin/Manager/Salesperson navigation | Role-appropriate routes | Skipped |

No fake authentication success is reported. Configure staging Auth and disposable identities before execution.
