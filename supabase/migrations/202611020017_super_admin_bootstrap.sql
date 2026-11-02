-- Phase 10 secure SaaS Super Admin bootstrap. Additive only.

create or replace function public.bootstrap_first_super_admin(
  target_user uuid,
  platform_name text default 'Adometa Platform'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  platform_org uuid;
  platform_slug text;
begin
  perform pg_advisory_xact_lock(hashtext('adometa:first-super-admin'));

  if exists (
    select 1 from public.organization_members
    where role = 'super_admin'
  ) then
    raise exception 'A SaaS Super Admin already exists';
  end if;

  if not exists (select 1 from auth.users where id = target_user) then
    raise exception 'Authenticated user was not found';
  end if;

  platform_slug := 'adometa-platform-' || substr(encode(gen_random_bytes(6), 'hex'), 1, 12);
  insert into public.organizations (name, slug)
  values (nullif(trim(platform_name), ''), platform_slug)
  returning id into platform_org;

  insert into public.profiles (id)
  values (target_user)
  on conflict (id) do nothing;

  insert into public.organization_members (organization_id, user_id, role, is_active)
  values (platform_org, target_user, 'super_admin', true);

  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    null, target_user, 'super_admin_bootstrapped', 'platform_admin', target_user,
    jsonb_build_object('organization_id', platform_org, 'setup', 'one_time')
  );

  return platform_org;
end;
$$;

revoke all on function public.bootstrap_first_super_admin(uuid, text) from public, anon, authenticated;
grant execute on function public.bootstrap_first_super_admin(uuid, text) to service_role;

create or replace function public.platform_update_membership(
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
  current_role public.app_role;
  active_super_admins integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator permission required';
  end if;
  if target_role = 'super_admin' then
    raise exception 'Super Admin role can only be created by the one-time bootstrap';
  end if;

  select role into current_role
    from public.organization_members
    where organization_id = target_organization and user_id = target_user
    for update;
  if current_role is null then raise exception 'Membership was not found'; end if;

  if current_role = 'super_admin' and not target_active then
    select count(*) into active_super_admins
      from public.organization_members
      where role = 'super_admin' and is_active;
    if active_super_admins <= 1 then
      raise exception 'The last active Super Admin cannot be deactivated';
    end if;
  end if;

  update public.organization_members
    set role = target_role, is_active = target_active
    where organization_id = target_organization and user_id = target_user;

  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    target_organization, auth.uid(), 'platform_membership_changed', 'organization_member', target_user,
    jsonb_build_object('role', target_role, 'is_active', target_active)
  );
end;
$$;

revoke all on function public.platform_update_membership(uuid, uuid, public.app_role, boolean) from public, anon;
grant execute on function public.platform_update_membership(uuid, uuid, public.app_role, boolean) to authenticated;
