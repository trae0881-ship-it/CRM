-- Assign the existing Auth account as a platform Super Admin.
-- This does not create an Auth user or change any other organization membership.
-- The email check is an additional guard against assigning a reused or mistyped UUID.
--
-- Rollback: see the guarded rollback block at the end of this file. Do not roll back
-- the only active Super Admin; first establish another verified platform administrator.

do $migration$
declare
  target_user constant uuid := '52cc151f-651e-4abd-87fa-bb1e28fb36eb';
  target_email constant text := 'am123allindiafree@gmail.com';
  actual_email text;
  platform_organization uuid;
  platform_organization_count integer;
  previous_role public.app_role;
  previous_active boolean;
  membership_found boolean;
  rows_changed integer;
begin
  perform pg_advisory_xact_lock(hashtext('adometa:first-super-admin'));

  select lower(email)
    into actual_email
    from auth.users
    where id = target_user;

  if not found or actual_email is distinct from lower(target_email) then
    raise exception 'The specified Auth user ID and email do not match an existing account';
  end if;

  if exists (
    select 1
      from public.organization_members m
      join public.organizations o on o.id = m.organization_id
      where m.role = 'super_admin'
        and o.slug not like 'adometa-platform-%'
  ) then
    raise exception 'A Super Admin membership exists outside the recognized platform organization; manual review is required';
  end if;

  insert into public.profiles (id)
    values (target_user)
    on conflict (id) do nothing;

  select count(distinct m.organization_id)
    into platform_organization_count
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    where m.role = 'super_admin'
      and o.slug like 'adometa-platform-%';

  if platform_organization_count > 1 then
    raise exception 'Multiple platform organizations with Super Admin memberships require manual review';
  elsif platform_organization_count = 1 then
    select m.organization_id
      into platform_organization
      from public.organization_members m
      join public.organizations o on o.id = m.organization_id
      where m.role = 'super_admin'
        and o.slug like 'adometa-platform-%'
      order by m.organization_id
      limit 1;
  else
    select count(*)
      into platform_organization_count
      from public.organizations
      where slug like 'adometa-platform-%';

    if platform_organization_count > 1 then
      raise exception 'Multiple platform organizations exist without a Super Admin membership; manual review is required';
    elsif platform_organization_count = 1 then
      select id
        into platform_organization
        from public.organizations
        where slug like 'adometa-platform-%'
        order by id
        limit 1;
    else
      insert into public.organizations (name, slug)
        values (
          'Adometa Platform',
          'adometa-platform-' || substr(encode(gen_random_bytes(6), 'hex'), 1, 12)
        )
        returning id into platform_organization;
    end if;
  end if;

  select role, is_active
    into previous_role, previous_active
    from public.organization_members
    where organization_id = platform_organization
      and user_id = target_user
    for update;
  membership_found := found;

  if membership_found and previous_role = 'super_admin' and previous_active then
    return;
  end if;

  insert into public.organization_members (organization_id, user_id, role, is_active)
    values (platform_organization, target_user, 'super_admin', true)
    on conflict (organization_id, user_id) do update
      set role = 'super_admin', is_active = true;
  get diagnostics rows_changed = row_count;

  if rows_changed > 0 then
    insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
      values (
        null,
        null,
        'super_admin_assigned',
        'platform_admin',
        target_user,
        jsonb_build_object(
          'migration', '20261116151122_assign_existing_super_admin',
          'platform_organization_id', platform_organization,
          'previous_role', previous_role,
          'previous_is_active', previous_active
        )
      );
  end if;
end;
$migration$;

create or replace function public.platform_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator permission required';
  end if;

  select jsonb_build_object(
    'companies', (select count(*) from public.organizations),
    'active_companies', (select count(*) from public.organizations where is_active),
    'suspended_companies', (select count(*) from public.organizations where not is_active),
    'trial_companies', (select count(distinct organization_id) from public.subscriptions where status = 'trialing'),
    'users', (select count(distinct user_id) from public.organization_members),
    'organization_admins', (
      select count(distinct user_id)
        from public.organization_members
        where role = 'organization_admin' and is_active
    ),
    'super_admins', (
      select count(distinct user_id)
        from public.organization_members
        where role = 'super_admin' and is_active
    ),
    'active_subscriptions', (select count(*) from public.subscriptions where status in ('active','trialing')),
    'expired_subscriptions', (select count(*) from public.subscriptions where status in ('expired','cancelled')),
    'recurring_revenue', coalesce((
      select sum(p.price_monthly)
        from public.subscriptions s
        join public.subscription_plans p on p.id = s.plan_id
        where s.status = 'active'
    ), 0)
  ) into result;
  return result;
end;
$$;

revoke all on function public.platform_dashboard_stats() from public, anon;
grant execute on function public.platform_dashboard_stats() to authenticated;

-- Verification (run after applying the migration):
-- select u.id, u.email, o.id as platform_organization_id, o.slug, m.role, m.is_active
-- from auth.users u
-- join public.organization_members m on m.user_id = u.id
-- join public.organizations o on o.id = m.organization_id
-- where u.id = '52cc151f-651e-4abd-87fa-bb1e28fb36eb'
--   and lower(u.email) = lower('am123allindiafree@gmail.com')
--   and o.slug like 'adometa-platform-%';
-- Run public.platform_dashboard_stats() through an authenticated Supabase session
-- to confirm the assigned account is included in super_admins.

-- Guarded rollback (execute manually only after reviewing the verification query):
-- This restores the prior membership role/status when available, otherwise leaves a
-- disabled membership row. It refuses to remove the only active platform Super Admin.
/*
do $rollback$
declare
  target_user constant uuid := '52cc151f-651e-4abd-87fa-bb1e28fb36eb';
  assignment public.audit_logs%rowtype;
  previous_role text;
  previous_active boolean;
  other_active_admins integer;
begin
  select *
    into assignment
    from public.audit_logs
    where action = 'super_admin_assigned'
      and entity_type = 'platform_admin'
      and entity_id = target_user
      and metadata->>'migration' = '20261116151122_assign_existing_super_admin'
    order by created_at desc
    limit 1;
  if not found then
    raise exception 'No assignment made by this migration was found; no rollback performed';
  end if;

  previous_role := assignment.metadata->>'previous_role';
  previous_active := (assignment.metadata->>'previous_is_active')::boolean;

  select count(*)
    into other_active_admins
    from public.organization_members
    where role = 'super_admin'
      and is_active
      and user_id <> target_user;

  if (previous_role is distinct from 'super_admin' or previous_active is distinct from true)
     and other_active_admins = 0 then
    raise exception 'Rollback would remove the last active Super Admin; assign another administrator first';
  end if;

  update public.organization_members
    set role = coalesce(previous_role::public.app_role, 'super_admin'::public.app_role),
        is_active = coalesce(previous_active, false)
    where organization_id = (assignment.metadata->>'platform_organization_id')::uuid
      and user_id = target_user
      and role = 'super_admin';

  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (
      null, null, 'super_admin_assignment_rolled_back', 'platform_admin', target_user,
      jsonb_build_object('migration', '20261116151122_assign_existing_super_admin')
    );
end;
$rollback$;
*/
