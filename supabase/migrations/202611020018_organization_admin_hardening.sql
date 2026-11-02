-- Phase 11 organization administration hardening. Additive only.

create table if not exists public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  contact_email text,
  contact_phone text,
  address text,
  time_zone text not null default 'UTC',
  business_settings jsonb not null default '{}'::jsonb,
  lead_settings jsonb not null default '{}'::jsonb,
  notification_settings jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

alter table public.organization_settings enable row level security;
create policy organization_settings_member_read on public.organization_settings
  for select using (public.is_org_member(organization_id));
create policy organization_settings_admin_write on public.organization_settings
  for all using (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[]))
  with check (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[]));

create or replace function public.validate_team_manager()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.manager_id is not null and not exists (
    select 1 from public.organization_members
    where organization_id = new.organization_id
      and user_id = new.manager_id
      and is_active
      and role in ('company_owner','organization_admin','manager')
  ) then
    raise exception 'Team manager must be an active member of the same organization';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_team_manager_trigger on public.teams;
create trigger validate_team_manager_trigger
  before insert or update of organization_id, manager_id on public.teams
  for each row execute function public.validate_team_manager();

create or replace function public.assign_team_manager(target_team uuid, target_manager uuid)
returns public.teams
language plpgsql
security definer
set search_path = public
as $$
declare result public.teams;
begin
  select t into result from public.teams t where t.id = target_team for update;
  if result.id is null or not public.has_org_role(result.organization_id, array['company_owner','organization_admin']::public.app_role[]) then
    raise exception 'Team administration permission required';
  end if;
  update public.teams set manager_id = target_manager, updated_at = now()
    where id = target_team returning * into result;
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (result.organization_id, auth.uid(), 'team_manager_changed', 'team', result.id,
    jsonb_build_object('manager_id', target_manager));
  return result;
end;
$$;

revoke all on function public.assign_team_manager(uuid, uuid) from public, anon;
grant execute on function public.assign_team_manager(uuid, uuid) to authenticated;

create or replace function public.update_organization_member(
  target_organization uuid,
  target_user uuid,
  target_role public.app_role,
  target_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.app_role;
  current_role public.app_role;
  active_owner_count integer;
  active_user_count integer;
  user_limit integer;
begin
  select role into actor_role
    from public.organization_members
    where organization_id = target_organization
      and user_id = auth.uid()
      and is_active
    for update;
  if actor_role is null or actor_role not in ('company_owner','organization_admin') then
    raise exception 'Organization administration permission required';
  end if;
  if target_role = 'super_admin' then raise exception 'Super Admin role is not assignable here'; end if;
  if actor_role = 'organization_admin' and target_role = 'company_owner' then
    raise exception 'Organization Admin cannot assign Company Owner';
  end if;
  if target_user = auth.uid() then raise exception 'Users cannot change their own membership'; end if;

  select role into current_role
    from public.organization_members
    where organization_id = target_organization and user_id = target_user
    for update;
  if current_role is null then raise exception 'Membership was not found'; end if;
  if current_role = 'company_owner' and actor_role <> 'company_owner' then
    raise exception 'Only the Company Owner can manage an owner';
  end if;
  if current_role = 'company_owner' and not target_active then
    select count(*) into active_owner_count
      from public.organization_members
      where organization_id = target_organization
        and role = 'company_owner' and is_active;
    if active_owner_count <= 1 then raise exception 'The last active Company Owner cannot be deactivated'; end if;
  end if;

  if target_active then
    select max_users into user_limit
      from public.subscriptions s join public.subscription_plans p on p.id = s.plan_id
      where s.organization_id = target_organization
        and s.status in ('trialing','active');
    select count(*) into active_user_count
      from public.organization_members
      where organization_id = target_organization and is_active and user_id <> target_user;
    if user_limit is not null and active_user_count >= user_limit then
      raise exception 'Subscription user limit reached';
    end if;
  end if;

  update public.organization_members
    set role = target_role, is_active = target_active
    where organization_id = target_organization and user_id = target_user;

  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (target_organization, auth.uid(), 'organization_membership_changed', 'organization_member', target_user,
    jsonb_build_object('role', target_role, 'is_active', target_active));
end;
$$;

revoke all on function public.update_organization_member(uuid, uuid, public.app_role, boolean) from public, anon;
grant execute on function public.update_organization_member(uuid, uuid, public.app_role, boolean) to authenticated;

create or replace function public.update_organization_profile(
  target_organization uuid,
  target_name text
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare result public.organizations;
begin
  if not public.has_org_role(target_organization, array['company_owner','organization_admin']::public.app_role[]) then
    raise exception 'Organization administration permission required';
  end if;
  update public.organizations
    set name = nullif(trim(target_name), ''), updated_at = now()
    where id = target_organization
    returning * into result;
  if result.id is null then raise exception 'Organization was not found'; end if;
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (target_organization, auth.uid(), 'organization_profile_updated', 'organization', target_organization,
    jsonb_build_object('name', result.name));
  return result;
end;
$$;

revoke all on function public.update_organization_profile(uuid, text) from public, anon;
grant execute on function public.update_organization_profile(uuid, text) to authenticated;
