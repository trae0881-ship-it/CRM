# Production readiness

## Current decision

Adometa CRM is **not production-ready** yet. The local application builds and its deterministic tests pass, but the required live security, provider and operational evidence is unavailable.

Phase 8 staging status: **WAITING FOR DEPLOYMENT**. No staging project, authenticated accounts, provider sandbox or verified backup is available in this workspace.

## Local evidence

- `npm test`: 34 passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm audit --audit-level=high`: 0 vulnerabilities.

## Required gates before production

1. Apply migrations 001-017 to a disposable staging project after schema review.
2. Create two organizations and test every role and cross-tenant denial.
3. Configure Supabase Auth, Edge Functions, logging and backups.
4. Deploy and health-check each Growth Tool separately.
5. Obtain YouPI-PG test credentials and verify signed webhooks plus bank-statement reconciliation.
6. Resolve LeadPro licensing in writing before deployment.
7. Configure monitoring, alerting, retry queues and rollback procedures.
8. Re-run automated tests against staging and record evidence.
