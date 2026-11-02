# Supabase staging setup checklist

Status: **WAITING FOR DEPLOYMENT**

## Required configuration

- [ ] Create a disposable Supabase staging project.
- [ ] Configure Auth email provider, redirect URLs and invitation email settings.
- [ ] Create a staging `.env` from `.env.example`; never commit it.
- [ ] Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to staging values.
- [ ] Configure Edge Function secrets separately; never use `VITE_` for server secrets.
- [ ] Configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY` for Edge Functions.
- [ ] Configure provider sandbox secrets only after reviewing each provider contract.

## Safe migration procedure

1. Confirm the project reference and that the target is disposable staging.
2. Take and verify a backup or snapshot.
3. Inspect the migration history before running anything.
4. Apply migrations `202611020001` through `202611020016` exactly once and in order.
5. Capture SQL output and migration history.
6. Verify tables, indexes, functions, triggers and RLS policies.
7. Run the authentication and two-organization tests in the reports.
8. Do not promote or apply to production until all denied-access cases pass.

Do not reset, truncate, drop or modify production data. No migrations were applied during this phase.

## Test identities

Create separate test accounts for Alpha and Beta for:

- SaaS Super Admin
- Company Owner
- Organization Admin
- Sales Manager
- Salesperson (two per organization)

Use unique test email addresses and disposable data. Record user IDs and organization IDs in a private test log, not in source control.
