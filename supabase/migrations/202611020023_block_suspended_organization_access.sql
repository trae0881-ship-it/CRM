-- Make existing organization-member RLS checks honor company suspension status.
create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = target_org
      and m.user_id = auth.uid()
      and m.is_active
      and o.is_active
  );
$$;

create or replace function public.has_org_role(target_org uuid, allowed public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = target_org
      and m.user_id = auth.uid()
      and m.is_active
      and o.is_active
      and m.role = any(allowed)
  );
$$;

create or replace function public.is_team_manager(target_team uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teams t
    join public.organization_members m on m.organization_id = t.organization_id
    join public.organizations o on o.id = t.organization_id
    where t.id = target_team
      and t.manager_id = auth.uid()
      and t.is_active
      and m.user_id = auth.uid()
      and m.is_active
      and o.is_active
  );
$$;

create or replace function public.is_team_member(target_team uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members tm
    join public.teams t on t.id = tm.team_id and t.organization_id = tm.organization_id
    join public.organization_members m on m.organization_id = tm.organization_id
    join public.organizations o on o.id = tm.organization_id
    where tm.team_id = target_team
      and tm.user_id = auth.uid()
      and t.is_active
      and m.user_id = auth.uid()
      and m.is_active
      and o.is_active
  );
$$;

revoke all on function public.is_org_member(uuid) from public, anon;
revoke all on function public.has_org_role(uuid, public.app_role[]) from public, anon;
revoke all on function public.is_team_manager(uuid) from public, anon;
revoke all on function public.is_team_member(uuid) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, public.app_role[]) to authenticated;
grant execute on function public.is_team_manager(uuid) to authenticated;
grant execute on function public.is_team_member(uuid) to authenticated;
