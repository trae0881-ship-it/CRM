-- Company Owners may read their own organization's audit history, matching the
-- existing Organization Admin and Auditor read scopes.
create policy audit_company_owner_read on public.audit_logs
  for select using (
    organization_id is not null
    and public.has_org_role(organization_id, array['company_owner']::public.app_role[])
  );
