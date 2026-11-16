-- Secure platform user directory and company membership management.
-- Auth records remain in Supabase Auth; profile and membership changes are additive.

alter table public.profiles
  add column if not exists phone text;

create or replace function public.platform_list_users(
  actor_user uuid,
  search_term text,
  company_filter uuid,
  role_filter public.app_role,
  status_filter text,
  page_number integer,
  page_size integer
)
returns table (
  user_id uuid,
  email text,
  full_name text,
  phone text,
  organization_id uuid,
  organization_name text,
  role public.app_role,
  membership_is_active boolean,
  account_status text,
  is_banned boolean,
  email_confirmed_at timestamptz,
  auth_created_at timestamptz,
  membership_created_at timestamptz,
  last_sign_in_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required';
  end if;
  if not exists (
    select 1 from public.organization_members
    where user_id = actor_user and is_active and role = 'super_admin'
  ) then
    raise exception 'Platform administrator permission required';
  end if;
  if page_number is null or page_size is null or page_number < 1 or page_size < 1 or page_size > 100 then
    raise exception 'Invalid pagination';
  end if;
  if status_filter is not null and status_filter not in ('active', 'inactive', 'invited') then
    raise exception 'Invalid account status filter';
  end if;

  return query
    select
      u.id,
      u.email::text,
      coalesce(p.full_name, ''),
      p.phone,
      m.organization_id,
      o.name,
      m.role,
      m.is_active,
      case
        when (u.banned_until is not null and u.banned_until > now()) or not m.is_active then 'inactive'
        when u.email_confirmed_at is null then 'invited'
        else 'active'
      end,
      u.banned_until is not null and u.banned_until > now(),
      u.email_confirmed_at,
      u.created_at,
      m.created_at,
      u.last_sign_in_at,
      count(*) over ()
    from auth.users u
    join public.organization_members m on m.user_id = u.id
    join public.organizations o on o.id = m.organization_id
    left join public.profiles p on p.id = u.id
    where (
      nullif(trim(search_term), '') is null
      or coalesce(u.email, '') ilike '%' || trim(search_term) || '%'
      or coalesce(p.full_name, '') ilike '%' || trim(search_term) || '%'
      or o.name ilike '%' || trim(search_term) || '%'
    )
      and (company_filter is null or m.organization_id = company_filter)
      and (role_filter is null or m.role = role_filter)
      and (
        status_filter is null
        or case
          when (u.banned_until is not null and u.banned_until > now()) or not m.is_active then 'inactive'
          when u.email_confirmed_at is null then 'invited'
          else 'active'
        end = status_filter
      )
    order by u.created_at desc, m.created_at desc, u.id
    limit page_size
    offset (page_number - 1) * page_size;
end;
$$;

create or replace function public.platform_find_auth_user_by_email(
  actor_user uuid,
  target_email text
)
returns table (
  user_id uuid,
  full_name text,
  phone text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required';
  end if;
  if not exists (
    select 1 from public.organization_members
    where user_id = actor_user and is_active and role = 'super_admin'
  ) then
    raise exception 'Platform administrator permission required';
  end if;

  return query
    select u.id, coalesce(p.full_name, ''), p.phone
    from auth.users u
    left join public.profiles p on p.id = u.id
    where lower(u.email) = lower(trim(target_email))
    limit 1;
end;
$$;

create or replace function public.platform_assign_user_membership(
  actor_user uuid,
  target_user uuid,
  target_organization uuid,
  target_role public.app_role,
  target_active boolean,
  target_full_name text,
  target_phone text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  organization_active boolean;
  user_limit integer;
  active_users integer;
  normalized_name text := nullif(trim(target_full_name), '');
  normalized_phone text := nullif(trim(target_phone), '');
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required';
  end if;
  if not exists (
    select 1 from public.organization_members
    where user_id = actor_user and is_active and role = 'super_admin'
  ) then
    raise exception 'Platform administrator permission required';
  end if;
  if target_role is null or target_role not in ('company_owner', 'organization_admin', 'manager', 'agent') then
    raise exception 'Choose a supported organization role';
  end if;
  if target_active is null then raise exception 'Company membership status is required'; end if;
  if normalized_name is null or length(normalized_name) > 100 then
    raise exception 'Full name must contain between 1 and 100 characters';
  end if;
  if normalized_phone is not null and length(normalized_phone) > 40 then
    raise exception 'Mobile number is too long';
  end if;
  if not exists (select 1 from auth.users where id = target_user) then
    raise exception 'Auth user was not found';
  end if;

  select is_active
    into organization_active
    from public.organizations
    where id = target_organization and slug not like 'adometa-platform-%'
    for update;
  if not found or not organization_active then
    raise exception 'Choose an active company';
  end if;
  if exists (
    select 1 from public.organization_members
    where organization_id = target_organization and user_id = target_user
  ) then
    raise exception using errcode = '23505', message = 'User is already assigned to this company';
  end if;

  select p.max_users
    into user_limit
    from public.subscriptions s
    join public.subscription_plans p on p.id = s.plan_id
    where s.organization_id = target_organization and s.status in ('trialing', 'active')
    limit 1;
  if target_active and user_limit is not null then
    select count(*)
      into active_users
      from public.organization_members
      where organization_id = target_organization and is_active;
    if active_users >= user_limit then
      raise exception using errcode = '23514', message = 'Subscription user limit reached';
    end if;
  end if;

  insert into public.profiles (id, full_name, phone)
    values (target_user, normalized_name, normalized_phone)
    on conflict (id) do update
      set full_name = case
            when nullif(trim(public.profiles.full_name), '') is null then excluded.full_name
            else public.profiles.full_name
          end,
          phone = coalesce(public.profiles.phone, excluded.phone);

  insert into public.organization_members (organization_id, user_id, role, is_active)
    values (target_organization, target_user, target_role, target_active);

  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (
      target_organization, actor_user, 'platform_user_assigned', 'organization_member', target_user,
      jsonb_build_object('role', target_role, 'is_active', target_active)
    );
end;
$$;

create or replace function public.platform_update_user_membership(
  actor_user uuid,
  target_user uuid,
  target_organization uuid,
  target_role public.app_role,
  target_active boolean,
  target_full_name text,
  target_phone text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  current_role public.app_role;
  current_active boolean;
  organization_active boolean;
  active_owners integer;
  active_users integer;
  user_limit integer;
  normalized_name text := nullif(trim(target_full_name), '');
  normalized_phone text := nullif(trim(target_phone), '');
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required';
  end if;
  if not exists (
    select 1 from public.organization_members
    where user_id = actor_user and is_active and role = 'super_admin'
  ) then
    raise exception 'Platform administrator permission required';
  end if;
  if target_role is null or target_role not in ('company_owner', 'organization_admin', 'manager', 'agent', 'auditor') then
    raise exception 'Choose a supported organization role';
  end if;
  if target_active is null then raise exception 'Company membership status is required'; end if;
  if normalized_name is null or length(normalized_name) > 100 then
    raise exception 'Full name must contain between 1 and 100 characters';
  end if;
  if normalized_phone is not null and length(normalized_phone) > 40 then
    raise exception 'Mobile number is too long';
  end if;

  select is_active
    into organization_active
    from public.organizations
    where id = target_organization and slug not like 'adometa-platform-%'
    for update;
  if not found or not organization_active then
    raise exception 'Choose an active company';
  end if;

  select role, is_active
    into current_role, current_active
    from public.organization_members
    where organization_id = target_organization and user_id = target_user
    for update;
  if not found then raise exception 'Company membership was not found'; end if;
  if current_role = 'super_admin' then raise exception 'Super Admin memberships cannot be changed here'; end if;

  if current_role = 'company_owner' and (not target_active or target_role <> 'company_owner') then
    select count(*)
      into active_owners
      from public.organization_members
      where organization_id = target_organization
        and role = 'company_owner'
        and is_active
        and user_id <> target_user;
    if active_owners = 0 then
      raise exception 'The last active Company Owner cannot be deactivated';
    end if;
  end if;

  if target_active and not current_active then
    select p.max_users
      into user_limit
      from public.subscriptions s
      join public.subscription_plans p on p.id = s.plan_id
      where s.organization_id = target_organization and s.status in ('trialing', 'active')
      limit 1;
    if user_limit is not null then
      select count(*)
        into active_users
        from public.organization_members
        where organization_id = target_organization and is_active;
      if active_users >= user_limit then
        raise exception using errcode = '23514', message = 'Subscription user limit reached';
      end if;
    end if;
  end if;

  update public.profiles
    set full_name = normalized_name, phone = normalized_phone, updated_at = now()
    where id = target_user;
  if not found then raise exception 'User profile was not found'; end if;

  update public.organization_members
    set role = target_role, is_active = target_active
    where organization_id = target_organization and user_id = target_user;

  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (
      target_organization, actor_user, 'platform_user_membership_updated', 'organization_member', target_user,
      jsonb_build_object('previous_role', current_role, 'role', target_role, 'is_active', target_active)
    );
end;
$$;

revoke all on function public.platform_list_users(uuid, text, uuid, public.app_role, text, integer, integer) from public, anon, authenticated;
revoke all on function public.platform_find_auth_user_by_email(uuid, text) from public, anon, authenticated;
revoke all on function public.platform_assign_user_membership(uuid, uuid, uuid, public.app_role, boolean, text, text) from public, anon, authenticated;
revoke all on function public.platform_update_user_membership(uuid, uuid, uuid, public.app_role, boolean, text, text) from public, anon, authenticated;
grant execute on function public.platform_list_users(uuid, text, uuid, public.app_role, text, integer, integer) to service_role;
grant execute on function public.platform_find_auth_user_by_email(uuid, text) to service_role;
grant execute on function public.platform_assign_user_membership(uuid, uuid, uuid, public.app_role, boolean, text, text) to service_role;
grant execute on function public.platform_update_user_membership(uuid, uuid, uuid, public.app_role, boolean, text, text) to service_role;
