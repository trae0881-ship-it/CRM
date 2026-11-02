# Adometa CRM architecture

## Product boundary

The frontend is a React + TypeScript + Vite application. It will use Supabase Auth for sessions and PostgreSQL for organization-scoped records. Browser code must only use the publishable Supabase key; privileged operations belong in RLS-protected SQL or Edge Functions.

## Planned layers

- `src/features/<feature>`: feature screens and feature-specific components.
- `src/components/ui`: accessible shared controls.
- `src/services`: typed repositories and external-provider adapters.
- `src/lib`: Supabase client, query configuration, and environment validation.
- `supabase/migrations`: version-controlled schema and RLS.

The current UI keeps its temporary demo records in `src/App.tsx` so the shell can be reviewed without credentials. This state must be replaced with repository calls before production use.

## Delivery phases

1. Shell, routing, responsive states, and database design.
2. Auth, organization membership, roles, and RLS.
3. Leads, imports/exports, campaigns, and assignment.
4. Calling workspace, activity timeline, and follow-ups.
5. Teams, reports, analytics, integrations, and audit logs.
6. Automated tests, responsive verification, deployment documentation.

## SaaS role boundary

The browser reads the authenticated user's organization membership to select an appropriate navigation surface, but this is only presentation. Supabase RLS and server-side Edge Functions enforce tenant scope, role changes, invitations, team access, and privileged operations. Company owners and organization admins can manage their organization; managers are constrained to their assigned teams; agents are constrained to assigned leads; platform operations are separate from tenant operations.
