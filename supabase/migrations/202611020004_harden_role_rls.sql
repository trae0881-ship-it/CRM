-- Harden existing policies for the added company_owner role and manager team scope.
alter table public.leads add column if not exists team_id uuid references public.teams(id) on delete set null;
create index if not exists leads_team_idx on public.leads (organization_id, team_id) where deleted_at is null;

create or replace function public.is_team_manager(target_team uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.teams
    where id = target_team and manager_id = auth.uid() and is_active
  );
$$;

create or replace function public.is_team_member(target_team uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.team_members
    where team_id = target_team and user_id = auth.uid()
  );
$$;

drop policy if exists campaigns_member_all on public.campaigns;
create policy campaigns_member_all on public.campaigns for all
using (
  public.has_org_role(organization_id, array['super_admin','company_owner','organization_admin']::public.app_role[])
  or (public.has_org_role(organization_id, array['manager']::public.app_role[]) and created_by = auth.uid())
)
with check (
  public.has_org_role(organization_id, array['super_admin','company_owner','organization_admin','manager']::public.app_role[])
);

drop policy if exists leads_member_read on public.leads;
create policy leads_member_read on public.leads for select
using (
  public.is_org_member(organization_id)
  and (
    assigned_to = auth.uid()
    or public.has_org_role(organization_id, array['super_admin','company_owner','organization_admin','auditor']::public.app_role[])
    or (
      public.has_org_role(organization_id, array['manager']::public.app_role[])
      and team_id is not null
      and public.is_team_manager(team_id)
    )
  )
);

drop policy if exists leads_authorized_insert on public.leads;
create policy leads_authorized_insert on public.leads for insert
with check (
  public.is_org_member(organization_id)
  and public.has_org_role(organization_id, array['super_admin','company_owner','organization_admin','manager','agent']::public.app_role[])
);

drop policy if exists leads_authorized_update on public.leads;
create policy leads_authorized_update on public.leads for update
using (
  public.is_org_member(organization_id)
  and (
    assigned_to = auth.uid()
    or public.has_org_role(organization_id, array['super_admin','company_owner','organization_admin']::public.app_role[])
    or (team_id is not null and public.is_team_manager(team_id))
  )
)
with check (public.is_org_member(organization_id));

drop policy if exists teams_member_read on public.teams;
create policy teams_member_read on public.teams for select
using (
  public.has_org_role(organization_id, array['super_admin','company_owner','organization_admin']::public.app_role[])
  or public.is_team_manager(id)
  or public.is_team_member(id)
);

drop policy if exists team_members_member_read on public.team_members;
create policy team_members_member_read on public.team_members for select
using (
  public.has_org_role(organization_id, array['super_admin','company_owner','organization_admin']::public.app_role[])
  or public.is_team_manager(team_id)
  or user_id = auth.uid()
);

drop policy if exists meta_admin_all on public.meta_integrations;
create policy meta_admin_all on public.meta_integrations for all
using (public.has_org_role(organization_id, array['super_admin','company_owner','organization_admin']::public.app_role[]))
with check (public.has_org_role(organization_id, array['super_admin','company_owner','organization_admin']::public.app_role[]));

drop policy if exists forms_admin_read on public.meta_forms;
create policy forms_admin_read on public.meta_forms for select
using (
  exists (
    select 1 from public.meta_integrations i
    where i.id = integration_id
      and public.has_org_role(i.organization_id, array['super_admin','company_owner','organization_admin']::public.app_role[])
  )
);
