-- Platform billing and company management hardening. Additive only.

create table if not exists public.subscription_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  actor_id uuid references public.profiles(id),
  action text not null,
  previous_plan_id uuid references public.subscription_plans(id),
  next_plan_id uuid references public.subscription_plans(id),
  previous_status text,
  next_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists subscription_history_org_date_idx
  on public.subscription_history (organization_id, created_at desc);

alter table public.subscription_history enable row level security;
create policy platform_subscription_history_read on public.subscription_history
  for select using (public.is_platform_admin());

create or replace function public.platform_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator permission required'; end if;
  select jsonb_build_object(
    'companies', (select count(*) from public.organizations),
    'active_companies', (select count(*) from public.organizations where is_active),
    'suspended_companies', (select count(*) from public.organizations where not is_active),
    'trial_companies', (select count(distinct organization_id) from public.subscriptions where status = 'trialing'),
    'users', (select count(distinct user_id) from public.organization_members),
    'active_subscriptions', (select count(*) from public.subscriptions where status in ('active','trialing')),
    'expired_subscriptions', (select count(*) from public.subscriptions where status in ('expired','cancelled')),
    'recurring_revenue', coalesce((select sum(p.price_monthly) from public.subscriptions s join public.subscription_plans p on p.id = s.plan_id where s.status = 'active'), 0)
  ) into result;
  return result;
end;
$$;

create or replace function public.platform_create_company(
  company_name text,
  company_slug text
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare result public.organizations;
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator permission required'; end if;
  insert into public.organizations (name, slug)
  values (nullif(trim(company_name), ''), lower(nullif(trim(company_slug), '')))
  returning * into result;
  if result.id is null then raise exception 'Company name and slug are required'; end if;
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (result.id, auth.uid(), 'company_created', 'organization', result.id, jsonb_build_object('name', result.name, 'slug', result.slug));
  return result;
end;
$$;

create or replace function public.platform_set_company_status(
  target_organization uuid,
  target_active boolean,
  status_reason text
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare result public.organizations;
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator permission required'; end if;
  if nullif(trim(status_reason), '') is null then raise exception 'A status reason is required'; end if;
  update public.organizations set is_active = target_active, updated_at = now()
    where id = target_organization returning * into result;
  if result.id is null then raise exception 'Company was not found'; end if;
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (target_organization, auth.uid(), case when target_active then 'company_activated' else 'company_suspended' end,
    'organization', target_organization, jsonb_build_object('reason', trim(status_reason)));
  return result;
end;
$$;

create or replace function public.platform_update_company(
  target_organization uuid,
  company_name text
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare result public.organizations;
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator permission required'; end if;
  update public.organizations set name = nullif(trim(company_name), ''), updated_at = now()
    where id = target_organization returning * into result;
  if result.id is null then raise exception 'Company was not found'; end if;
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (target_organization, auth.uid(), 'company_updated', 'organization', target_organization, jsonb_build_object('name', result.name));
  return result;
end;
$$;

create or replace function public.platform_upsert_subscription(
  target_organization uuid,
  target_plan uuid,
  target_status text,
  target_period_start timestamptz default null,
  target_period_end timestamptz default null
)
returns public.subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.subscriptions;
  previous public.subscriptions;
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator permission required'; end if;
  if target_status not in ('trialing','active','past_due','cancelled','expired') then raise exception 'Invalid subscription status'; end if;
  if not exists (select 1 from public.organizations where id = target_organization) then raise exception 'Company was not found'; end if;
  if not exists (select 1 from public.subscription_plans where id = target_plan and is_active) then raise exception 'Active subscription plan was not found'; end if;
  select * into previous from public.subscriptions where organization_id = target_organization for update;
  insert into public.subscriptions (organization_id, plan_id, status, current_period_start, current_period_end)
  values (target_organization, target_plan, target_status, coalesce(target_period_start, now()), target_period_end)
  on conflict (organization_id) do update set
    plan_id = excluded.plan_id, status = excluded.status,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end, updated_at = now()
  returning * into result;
  insert into public.subscription_history (
    organization_id, subscription_id, actor_id, action, previous_plan_id, next_plan_id,
    previous_status, next_status, metadata
  ) values (
    target_organization, result.id, auth.uid(),
    case when previous.id is null then 'subscription_created' else 'subscription_updated' end,
    previous.plan_id, result.plan_id, previous.status, result.status,
    jsonb_build_object('payment_record_created', false)
  );
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (target_organization, auth.uid(), 'subscription_changed', 'subscription', result.id,
    jsonb_build_object('status', result.status, 'plan_id', result.plan_id));
  return result;
end;
$$;

revoke all on function public.platform_dashboard_stats() from public, anon;
revoke all on function public.platform_create_company(text, text) from public, anon;
revoke all on function public.platform_set_company_status(uuid, boolean, text) from public, anon;
revoke all on function public.platform_update_company(uuid, text) from public, anon;
revoke all on function public.platform_upsert_subscription(uuid, uuid, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.platform_dashboard_stats() to authenticated;
grant execute on function public.platform_create_company(text, text) to authenticated;
grant execute on function public.platform_set_company_status(uuid, boolean, text) to authenticated;
grant execute on function public.platform_update_company(uuid, text) to authenticated;
grant execute on function public.platform_upsert_subscription(uuid, uuid, text, timestamptz, timestamptz) to authenticated;
