# SaaS implementation audit and roadmap

## Current state

The approved React/Vite UI, Supabase client/auth gate, lead repository, initial tenant RLS migration, and Meta webhook foundation are present. The production frontend build has passed after installing Node.js dependencies.

The application is not yet a complete SaaS platform. Campaigns and follow-ups are explicitly pending in configured environments, and the current UI does not yet expose owner, manager, team, subscription, calling, site-visit, booking, or report repositories.

## Added in the SaaS foundation migration

Migration `202611020003_saas_hierarchy.sql` adds the normalized tenant-owned entities needed for teams, invitations, calls, site visits, bookings, targets, subscription plans, subscriptions, invoices, and payments. `202611020005_security_hardening.sql` adds explicit authenticated grants, removes anonymous access to tenant tables, and narrows manager and admin write scopes. Each migration is additive and does not reset or delete existing data.

## Role mapping

The existing roles remain available. `company_owner` is added to the enum. The intended hierarchy is:

`super_admin` (platform-only operations) → `company_owner` → `organization_admin` → `manager` → `agent`.

Platform-level operations must use separate server-side operations and must not be implemented by weakening tenant RLS.

## Remaining implementation phases

1. Add server-side invitation and membership management.
2. Replace campaign/follow-up pending screens with typed repositories and persisted forms.
3. Add team, manager, owner, calling, visit, booking, and target screens.
4. Add authorized report queries and consistent metric definitions.
5. Add plan enforcement in secure RPC/Edge Functions.
6. Add verified payment-provider adapters only after credentials and webhooks exist.
7. Add cross-tenant, role-escalation, webhook, and workflow tests.
