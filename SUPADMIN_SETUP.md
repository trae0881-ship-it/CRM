# SaaS Super Admin setup

Status: **WAITING FOR DEPLOYMENT**

Super Admin is not assignable through public signup. The one-time bootstrap requires:

1. Create a disposable staging Supabase project and apply migrations `202611020001` through `202611020017` in order.
2. Create and confirm the intended operator account through normal Supabase Auth signup or an administrator-approved invitation.
3. Configure the Edge Function secret `SUPER_ADMIN_BOOTSTRAP_SECRET` with a randomly generated value. Keep it only in the server/Edge Function environment.
4. Deploy `bootstrap-super-admin`.
5. Sign in as the intended operator at `/super-admin/login`.
6. From a trusted server-side runner, call the function with the authenticated bearer token and `x-bootstrap-secret`. Do not put the setup secret in browser code or frontend environment variables.
7. Confirm the response and inspect the platform audit row.
8. Remove or rotate `SUPER_ADMIN_BOOTSTRAP_SECRET` immediately after the first successful bootstrap.

The database RPC uses a transaction advisory lock, rejects an existing active Super Admin, verifies the Auth user, creates a platform organization and membership, and records an audit event. It is executable only by the Supabase `service_role`; the public client cannot call it directly.

The existing `provision_first_admin` function remains for the original organization onboarding flow and does not grant `super_admin`.
