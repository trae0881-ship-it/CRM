-- Explicit grants and tenant-scope fixes for the SaaS hierarchy.
-- This migration does not reset or delete tenant data.

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, public.app_role[]) to authenticated;
grant execute on function public.is_team_manager(uuid) to authenticated;
grant execute on function public.is_team_member(uuid) to authenticated;
revoke execute on function public.is_org_member(uuid) from anon;
revoke execute on function public.has_org_role(uuid, public.app_role[]) from anon;
revoke execute on function public.is_team_manager(uuid) from anon;
revoke execute on function public.is_team_member(uuid) from anon;

revoke all on public.organizations from anon;
revoke all on public.profiles from anon;
revoke all on public.organization_members from anon;
revoke all on public.campaigns from anon;
revoke all on public.leads from anon;
revoke all on public.lead_activities from anon;
revoke all on public.follow_up_tasks from anon;
revoke all on public.meta_integrations from anon;
revoke all on public.meta_forms from anon;
revoke all on public.audit_logs from anon;
revoke all on public.teams from anon;
revoke all on public.team_members from anon;
revoke all on public.invitations from anon;
revoke all on public.calls from anon;
revoke all on public.site_visits from anon;
revoke all on public.bookings from anon;
revoke all on public.sales_targets from anon;
revoke all on public.subscription_plans from anon;
revoke all on public.subscriptions from anon;
revoke all on public.invoices from anon;
revoke all on public.payments from anon;

drop policy if exists team_members_admin_write on public.team_members;
create policy team_members_admin_write on public.team_members for all
using (
  public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[])
  or public.is_team_manager(team_id)
)
with check (
  public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[])
  or public.is_team_manager(team_id)
);

drop policy if exists invitations_admin_all on public.invitations;
create policy invitations_admin_all on public.invitations for all
using (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[]))
with check (
  public.has_org_role(organization_id, array['company_owner']::public.app_role[])
  or (
    public.has_org_role(organization_id, array['organization_admin']::public.app_role[])
    and role <> 'company_owner'
  )
);

drop policy if exists targets_admin_write on public.sales_targets;
create policy targets_admin_write on public.sales_targets for all
using (
  public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[])
  or (
    public.has_org_role(organization_id, array['manager']::public.app_role[])
    and team_id is not null
    and public.is_team_manager(team_id)
  )
)
with check (
  public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[])
  or (
    public.has_org_role(organization_id, array['manager']::public.app_role[])
    and team_id is not null
    and public.is_team_manager(team_id)
  )
);
