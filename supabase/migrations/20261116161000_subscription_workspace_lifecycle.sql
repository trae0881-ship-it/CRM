-- Subscription, workspace approval, and salesperson-seat lifecycle.
-- Additive only: preserves existing organizations, memberships, and payment history.

alter table public.organizations
  add column if not exists workspace_name text,
  add column if not exists approval_status text not null default 'approved';

alter table public.organizations
  drop constraint if exists organizations_approval_status_check;
alter table public.organizations
  add constraint organizations_approval_status_check
  check (approval_status in ('pending_approval', 'approved', 'rejected', 'suspended'));

alter table public.subscription_plans
  add column if not exists description text not null default '',
  add column if not exists currency_code text,
  add column if not exists price_quarterly numeric(14,2) not null default 0,
  add column if not exists price_half_yearly numeric(14,2) not null default 0,
  add column if not exists price_yearly numeric(14,2) not null default 0,
  add column if not exists max_salespeople integer,
  add column if not exists max_managers integer,
  add column if not exists max_admins integer,
  add column if not exists trial_days integer not null default 0,
  add column if not exists validity_days integer,
  add column if not exists renewal_behavior text not null default 'manual',
  add column if not exists expiry_behavior text not null default 'suspend',
  add column if not exists updated_at timestamptz not null default now();

alter table public.subscription_plans
  drop constraint if exists subscription_plans_currency_code_check,
  drop constraint if exists subscription_plans_renewal_behavior_check,
  drop constraint if exists subscription_plans_expiry_behavior_check,
  drop constraint if exists subscription_plans_trial_days_check,
  drop constraint if exists subscription_plans_validity_days_check,
  drop constraint if exists subscription_plans_sales_limits_check;
alter table public.subscription_plans
  add constraint subscription_plans_currency_code_check
    check (currency_code is null or currency_code ~ '^[A-Z]{3}$'),
  add constraint subscription_plans_renewal_behavior_check
    check (renewal_behavior in ('manual', 'contact_required')),
  add constraint subscription_plans_expiry_behavior_check
    check (expiry_behavior = 'suspend'),
  add constraint subscription_plans_trial_days_check
    check (trial_days >= 0),
  add constraint subscription_plans_validity_days_check
    check (validity_days is null or validity_days > 0),
  add constraint subscription_plans_sales_limits_check
    check (
      (max_salespeople is null or max_salespeople >= 0)
      and (max_managers is null or max_managers >= 0)
      and (max_admins is null or max_admins >= 1)
      and (max_users is null or max_users >= 1)
      and price_monthly >= 0 and price_quarterly >= 0
      and price_half_yearly >= 0 and price_yearly >= 0
    );

-- Existing plans retain currently available optional modules.
update public.subscription_plans
set features = coalesce(features, '{}'::jsonb)
  || jsonb_build_object(
    'sales_pipeline', coalesce(features -> 'sales_pipeline', 'true'::jsonb),
    'automation', coalesce(features -> 'automation', 'true'::jsonb)
  ),
  max_salespeople = coalesce(max_salespeople, max_users),
  updated_at = now();

alter table public.subscriptions
  add column if not exists billing_period text not null default 'monthly',
  add column if not exists has_custom_salesperson_limit boolean not null default false,
  add column if not exists salesperson_limit_override integer,
  add column if not exists status_before_suspend text;
alter table public.subscriptions
  drop constraint if exists subscriptions_status_check,
  drop constraint if exists subscriptions_billing_period_check,
  drop constraint if exists subscriptions_salesperson_override_check,
  drop constraint if exists subscriptions_status_before_suspend_check;
alter table public.subscriptions
  add constraint subscriptions_status_check
    check (status in ('trialing', 'active', 'past_due', 'cancelled', 'expired', 'suspended')),
  add constraint subscriptions_billing_period_check
    check (billing_period in ('monthly', 'quarterly', 'half_yearly', 'yearly')),
  add constraint subscriptions_salesperson_override_check
    check (
      (has_custom_salesperson_limit and salesperson_limit_override is not null and salesperson_limit_override >= 0)
      or (not has_custom_salesperson_limit and salesperson_limit_override is null)
    ),
  add constraint subscriptions_status_before_suspend_check
    check (status_before_suspend is null or status_before_suspend in ('trialing', 'active', 'past_due'));

alter table public.invoices
  add column if not exists currency_code text,
  add column if not exists billing_period text;
alter table public.payments
  add column if not exists currency_code text,
  add column if not exists verification_method text,
  add column if not exists external_reference text,
  add column if not exists verified_by uuid references public.profiles(id),
  add column if not exists verified_at timestamptz;
alter table public.payments
  drop constraint if exists payments_verification_method_check,
  drop constraint if exists payments_currency_code_check;
alter table public.payments
  add constraint payments_verification_method_check
    check (verification_method is null or verification_method in ('manual')),
  add constraint payments_currency_code_check
    check (currency_code is null or currency_code ~ '^[A-Z]{3}$');
create unique index if not exists payments_manual_reference_org_idx
  on public.payments (organization_id, external_reference)
  where verification_method = 'manual' and external_reference is not null;

create table if not exists public.workspace_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  company_name text not null check (char_length(trim(company_name)) between 2 and 160),
  workspace_name text not null check (char_length(trim(workspace_name)) between 2 and 160),
  contact_phone text not null check (char_length(trim(contact_phone)) between 7 and 32),
  requested_plan_id uuid not null references public.subscription_plans(id),
  additional_information text not null default '' check (char_length(additional_information) <= 2000),
  status text not null default 'pending'
    check (status in ('pending', 'information_requested', 'approved', 'rejected', 'cancelled')),
  admin_message text,
  rejection_reason text,
  approved_plan_id uuid references public.subscription_plans(id),
  decision_by uuid references public.profiles(id),
  decision_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists workspace_requests_one_open_per_user_idx
  on public.workspace_requests (requested_by)
  where status in ('pending', 'information_requested');
create index if not exists workspace_requests_status_created_idx
  on public.workspace_requests (status, created_at desc);
create index if not exists workspace_requests_org_idx
  on public.workspace_requests (organization_id);

create table if not exists public.subscription_change_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  request_type text not null check (request_type in ('plan_upgrade', 'additional_salespeople')),
  target_plan_id uuid references public.subscription_plans(id),
  requested_salespeople integer,
  message text not null default '' check (char_length(message) <= 2000),
  requester_followup text not null default '' check (char_length(requester_followup) <= 2000),
  status text not null default 'pending'
    check (status in ('pending', 'information_requested', 'approved', 'rejected', 'cancelled')),
  admin_message text,
  decision_by uuid references public.profiles(id),
  decision_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (request_type = 'plan_upgrade' and target_plan_id is not null and requested_salespeople is null)
    or (request_type = 'additional_salespeople' and requested_salespeople is not null and requested_salespeople >= 0)
  )
);
create unique index if not exists subscription_change_requests_one_open_idx
  on public.subscription_change_requests (organization_id)
  where status in ('pending', 'information_requested');
create index if not exists subscription_change_requests_status_idx
  on public.subscription_change_requests (status, created_at desc);

create table if not exists public.subscription_salesperson_limit_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  previous_limit integer,
  next_limit integer,
  reason text not null,
  created_at timestamptz not null default now()
);
create index if not exists subscription_salesperson_limit_history_org_idx
  on public.subscription_salesperson_limit_history (organization_id, created_at desc);

create or replace function public.enforce_subscription_membership_limits()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  plan_row public.subscription_plans;
  sub_row public.subscriptions;
  active_total integer;
  active_role_count integer;
  role_limit integer;
begin
  if new.role = 'super_admin' or not new.is_active then return new; end if;
  perform 1 from public.organizations o where o.id = new.organization_id for update;
  if not found then raise exception 'Organization was not found'; end if;
  if not exists (
    select 1 from public.organizations o
    where o.id = new.organization_id and o.is_active and o.approval_status = 'approved'
  ) then raise exception 'Workspace is not approved and active'; end if;
  select * into sub_row from public.subscriptions s
    where s.organization_id = new.organization_id for update;
  if sub_row.id is null then return new; end if;
  if sub_row.status not in ('active', 'trialing')
    or (sub_row.current_period_start is not null and sub_row.current_period_start > now())
    or (case when sub_row.status = 'trialing'
      then coalesce(sub_row.trial_ends_at, sub_row.current_period_end)
      else sub_row.current_period_end end) is not null
      and (case when sub_row.status = 'trialing'
        then coalesce(sub_row.trial_ends_at, sub_row.current_period_end)
        else sub_row.current_period_end end) <= now() then
    raise exception 'An active subscription is required to activate users';
  end if;
  select * into plan_row from public.subscription_plans p where p.id = sub_row.plan_id;
  select count(*) into active_total from public.organization_members m
    where m.organization_id = new.organization_id and m.is_active
      and m.role <> 'super_admin' and m.user_id <> new.user_id;
  if plan_row.max_users is not null and active_total >= plan_row.max_users then
    raise exception 'Total active user limit reached for this plan';
  end if;
  if new.role = 'agent' then
    role_limit := case when sub_row.has_custom_salesperson_limit
      then sub_row.salesperson_limit_override else plan_row.max_salespeople end;
    select count(*) into active_role_count from public.organization_members m
      where m.organization_id = new.organization_id and m.is_active and m.role = 'agent'
        and m.user_id <> new.user_id;
  elsif new.role = 'manager' then
    role_limit := plan_row.max_managers;
    select count(*) into active_role_count from public.organization_members m
      where m.organization_id = new.organization_id and m.is_active and m.role = 'manager'
        and m.user_id <> new.user_id;
  elsif new.role in ('company_owner', 'organization_admin') then
    role_limit := plan_row.max_admins;
    select count(*) into active_role_count from public.organization_members m
      where m.organization_id = new.organization_id and m.is_active
        and m.role in ('company_owner', 'organization_admin') and m.user_id <> new.user_id;
  else
    role_limit := null;
    active_role_count := 0;
  end if;
  if role_limit is not null and active_role_count >= role_limit then
    raise exception 'Active user limit for role % reached on this plan', new.role;
  end if;
  return new;
end $$;
drop trigger if exists organization_members_subscription_limits on public.organization_members;
create trigger organization_members_subscription_limits
before insert or update
on public.organization_members
for each row execute function public.enforce_subscription_membership_limits();
revoke all on function public.enforce_subscription_membership_limits() from public, anon, authenticated;

alter table public.workspace_requests enable row level security;
alter table public.subscription_change_requests enable row level security;
alter table public.subscription_salesperson_limit_history enable row level security;

create policy workspace_requests_requester_or_platform_read
  on public.workspace_requests for select
  using (requested_by = auth.uid() or public.is_platform_admin());
create policy platform_subscription_plans_read_all
  on public.subscription_plans for select to authenticated
  using (public.is_platform_admin());
create policy subscription_change_requests_member_or_platform_read
  on public.subscription_change_requests for select
  using (public.is_platform_admin() or public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[]));
create policy subscription_seat_history_member_or_platform_read
  on public.subscription_salesperson_limit_history for select
  using (public.is_platform_admin() or public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[]));
revoke all on public.workspace_requests, public.subscription_change_requests,
  public.subscription_salesperson_limit_history from public, anon, authenticated;
grant select on public.workspace_requests, public.subscription_change_requests,
  public.subscription_salesperson_limit_history to authenticated;

create or replace function public.has_subscription_feature(target_org uuid, feature_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_org_member(target_org)
    and (
      not exists (select 1 from public.subscriptions s where s.organization_id = target_org)
      or exists (
        select 1
        from public.subscriptions s
        join public.subscription_plans p on p.id = s.plan_id
        where s.organization_id = target_org
          and s.status in ('trialing', 'active')
          and (s.current_period_start is null or s.current_period_start <= now())
          and (case when s.status = 'trialing'
            then coalesce(s.trial_ends_at, s.current_period_end)
            else s.current_period_end end is null
            or case when s.status = 'trialing'
              then coalesce(s.trial_ends_at, s.current_period_end)
              else s.current_period_end end > now())
          and p.features -> feature_name = 'true'::jsonb
      )
    );
$$;
revoke all on function public.has_subscription_feature(uuid, text) from public, anon;
grant execute on function public.has_subscription_feature(uuid, text) to authenticated;

-- Organization membership is denied for unapproved, suspended, or expired workspaces.
create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = target_org
      and m.user_id = auth.uid()
      and m.is_active
      and o.is_active
      and o.approval_status = 'approved'
      and (
        not exists (select 1 from public.subscriptions s where s.organization_id = target_org)
        or exists (
          select 1 from public.subscriptions s
          where s.organization_id = target_org
            and s.status in ('trialing', 'active')
            and (s.current_period_start is null or s.current_period_start <= now())
            and (case when s.status = 'trialing'
              then coalesce(s.trial_ends_at, s.current_period_end)
              else s.current_period_end end is null
              or case when s.status = 'trialing'
                then coalesce(s.trial_ends_at, s.current_period_end)
                else s.current_period_end end > now())
        )
      )
  );
$$;

create or replace function public.has_org_role(target_org uuid, allowed public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_org_member(target_org)
    and exists (
      select 1 from public.organization_members m
      where m.organization_id = target_org
        and m.user_id = auth.uid()
        and m.is_active
        and m.role = any(allowed)
    );
$$;
revoke all on function public.is_org_member(uuid) from public, anon;
revoke all on function public.has_org_role(uuid, public.app_role[]) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, public.app_role[]) to authenticated;

-- Plan-controlled modules are enforced in database policies and the pipeline RPC.
drop policy if exists pipeline_admin_all on public.sales_pipelines;
drop policy if exists pipeline_stage_member_read on public.pipeline_stages;
drop policy if exists stage_history_member_read on public.lead_stage_history;
create policy pipeline_admin_all on public.sales_pipelines for all
  using (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[])
    and public.has_subscription_feature(organization_id, 'sales_pipeline'))
  with check (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[])
    and public.has_subscription_feature(organization_id, 'sales_pipeline'));
create policy pipeline_stage_member_read on public.pipeline_stages for select
  using (exists (
    select 1 from public.sales_pipelines p
    where p.id = pipeline_id and public.is_org_member(p.organization_id)
      and public.has_subscription_feature(p.organization_id, 'sales_pipeline')
  ));
create policy stage_history_member_read on public.lead_stage_history for select
  using (public.is_org_member(organization_id)
    and public.has_subscription_feature(organization_id, 'sales_pipeline'));

drop policy if exists automation_org_rules on public.assignment_rules;
drop policy if exists automation_org_rules_read on public.assignment_rules;
drop policy if exists automation_org_history_read on public.assignment_history;
drop policy if exists scoring_admin_all on public.lead_scoring_settings;
drop policy if exists scoring_history_read on public.lead_score_history;
drop policy if exists workflow_admin_all on public.automation_workflows;
drop policy if exists workflow_member_read on public.automation_workflows;
drop policy if exists execution_member_read on public.automation_executions;
drop policy if exists task_member_scope on public.automation_tasks;
create policy automation_org_rules on public.assignment_rules for all
  using (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[])
    and public.has_subscription_feature(organization_id, 'automation'))
  with check (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[])
    and public.has_subscription_feature(organization_id, 'automation'));
create policy automation_org_rules_read on public.assignment_rules for select
  using (public.is_org_member(organization_id) and public.has_subscription_feature(organization_id, 'automation'));
create policy automation_org_history_read on public.assignment_history for select
  using (public.is_org_member(organization_id) and public.has_subscription_feature(organization_id, 'automation'));
create policy scoring_admin_all on public.lead_scoring_settings for all
  using (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[])
    and public.has_subscription_feature(organization_id, 'automation'))
  with check (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[])
    and public.has_subscription_feature(organization_id, 'automation'));
create policy scoring_history_read on public.lead_score_history for select
  using (public.is_org_member(organization_id) and public.has_subscription_feature(organization_id, 'automation'));
create policy workflow_admin_all on public.automation_workflows for all
  using (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[])
    and public.has_subscription_feature(organization_id, 'automation'))
  with check (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[])
    and public.has_subscription_feature(organization_id, 'automation'));
create policy workflow_member_read on public.automation_workflows for select
  using (public.is_org_member(organization_id) and public.has_subscription_feature(organization_id, 'automation'));
create policy execution_member_read on public.automation_executions for select
  using (public.is_org_member(organization_id) and public.has_subscription_feature(organization_id, 'automation'));
create policy task_member_scope on public.automation_tasks for select
  using ((assigned_to = auth.uid() or public.has_org_role(organization_id, array['company_owner','organization_admin','manager']::public.app_role[]))
    and public.has_subscription_feature(organization_id, 'automation'));

create or replace function public.claim_automation_event(target_workflow uuid, target_event_key text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare execution_id uuid; target_org uuid;
begin
  select organization_id into target_org from public.automation_workflows where id = target_workflow and is_active;
  if target_org is null or not public.has_org_role(target_org, array['company_owner','organization_admin','manager']::public.app_role[])
    or not public.has_subscription_feature(target_org, 'automation') then
    raise exception 'Workflow access denied';
  end if;
  insert into public.automation_executions(workflow_id, organization_id, event_key, status, attempts)
  values (target_workflow, target_org, target_event_key, 'queued', 0)
  on conflict (workflow_id, event_key) do nothing returning id into execution_id;
  return execution_id;
end $$;

create or replace function public.platform_create_company(company_name text, company_slug text)
returns public.organizations
language plpgsql security definer set search_path = public, pg_temp as $$
declare result public.organizations;
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator permission required'; end if;
  if char_length(trim(coalesce(company_name, ''))) not between 2 and 160
    or trim(coalesce(company_slug, '')) !~ '^[a-z0-9-]{2,100}$' then
    raise exception 'Enter a valid company name and URL slug';
  end if;
  insert into public.organizations (name, slug, is_active, approval_status)
    values (trim(company_name), lower(trim(company_slug)), false, 'pending_approval')
    returning * into result;
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (result.id, auth.uid(), 'company_created_pending_approval', 'organization', result.id,
      jsonb_build_object('name', result.name, 'slug', result.slug));
  return result;
end $$;

create or replace function public.get_my_workspace_access_status()
returns table (
  organization_id uuid, organization_name text, approval_status text,
  organization_active boolean, subscription_status text, plan_name text,
  current_period_end timestamptz, billing_period text
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Sign in to check workspace access'; end if;
  return query
    select o.id, o.name, o.approval_status, o.is_active, s.status, p.name,
      s.current_period_end, s.billing_period
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    left join public.subscriptions s on s.organization_id = o.id
    left join public.subscription_plans p on p.id = s.plan_id
    where m.user_id = auth.uid() and m.is_active and m.role <> 'super_admin'
    order by m.created_at desc limit 1;
end $$;

create or replace function public.move_lead_to_pipeline_stage(
  target_lead uuid, target_stage uuid, expected_updated_at timestamptz,
  target_lost_reason text default null, target_expected_deal_value numeric default null,
  target_expected_close_date date default null
)
returns table (lead_id uuid, pipeline_stage_id uuid, updated_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  lead_org uuid; current_stage uuid; current_updated_at timestamptz;
  lead_assignee uuid; lead_team uuid; stage_org uuid; stage_category text;
  stage_requires_reason boolean;
begin
  select l.organization_id, l.pipeline_stage_id, l.updated_at, l.assigned_to, l.team_id
    into lead_org, current_stage, current_updated_at, lead_assignee, lead_team
    from public.leads l where l.id = target_lead and l.deleted_at is null for update;
  if lead_org is null or not public.is_org_member(lead_org)
    or not public.has_subscription_feature(lead_org, 'sales_pipeline') then
    raise exception 'Pipeline access denied';
  end if;
  if not (
    public.has_org_role(lead_org, array['company_owner','organization_admin']::public.app_role[])
    or (public.has_org_role(lead_org, array['manager']::public.app_role[]) and lead_team is not null and public.is_team_manager(lead_team))
    or (public.has_org_role(lead_org, array['agent']::public.app_role[]) and lead_assignee = auth.uid())
  ) then raise exception 'Pipeline lead update access denied'; end if;
  if current_updated_at is distinct from expected_updated_at then raise exception 'Lead changed before the stage update; refresh and try again'; end if;
  select p.organization_id, s.category, s.requires_reason into stage_org, stage_category, stage_requires_reason
    from public.pipeline_stages s join public.sales_pipelines p on p.id = s.pipeline_id where s.id = target_stage;
  if stage_org is distinct from lead_org then raise exception 'Pipeline stage is outside the lead organization'; end if;
  if stage_org is null then raise exception 'Pipeline stage access denied'; end if;
  if stage_category = 'lost' and stage_requires_reason
    and nullif(trim(coalesce(target_lost_reason, '')), '') is null then raise exception 'Lost reason is required'; end if;
  if current_stage = target_stage then
    return query select target_lead, current_stage, current_updated_at;
    return;
  end if;
  if target_expected_deal_value is not null and target_expected_deal_value < 0 then raise exception 'Expected value must not be negative'; end if;
  update public.leads set pipeline_stage_id = target_stage,
    lost_reason = case when stage_category = 'lost' then nullif(trim(target_lost_reason), '') else null end,
    expected_deal_value = target_expected_deal_value, expected_close_date = target_expected_close_date,
    updated_at = now()
    where id = target_lead and updated_at = expected_updated_at
    returning id, pipeline_stage_id, updated_at into lead_id, pipeline_stage_id, updated_at;
  if not found then raise exception 'Lead was changed by another user; reload and retry'; end if;
  insert into public.lead_stage_history(organization_id, lead_id, from_stage_id, to_stage_id, actor_id, lost_reason, expected_value, expected_close_date)
  values (lead_org, target_lead, current_stage, target_stage, auth.uid(), nullif(trim(target_lost_reason), ''), target_expected_deal_value, target_expected_close_date);
  return next;
end $$;

create or replace function public.create_workspace_request(
  target_full_name text,
  target_company_name text,
  target_workspace_name text,
  target_phone text,
  target_plan_id uuid,
  target_additional_information text default ''
)
returns public.workspace_requests
language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare requester uuid := auth.uid(); request_row public.workspace_requests;
begin
  if requester is null then raise exception 'Sign in before requesting a workspace'; end if;
  if not exists (select 1 from auth.users u where u.id = requester and u.email_confirmed_at is not null) then
    raise exception 'Confirm your email address before requesting a workspace';
  end if;
  if char_length(trim(target_full_name)) not between 2 and 100
    or char_length(trim(target_company_name)) not between 2 and 160
    or char_length(trim(target_workspace_name)) not between 2 and 160
    or char_length(trim(target_phone)) not between 7 and 32
    or char_length(coalesce(target_additional_information, '')) > 2000 then
    raise exception 'Enter valid company, workspace, phone, and additional information';
  end if;
  if not exists (select 1 from public.subscription_plans p where p.id = target_plan_id and p.is_active) then
    raise exception 'Select an active subscription plan';
  end if;
  if exists (select 1 from public.organization_members m where m.user_id = requester and m.is_active) then
    raise exception 'This account already has an active organization membership';
  end if;
  insert into public.profiles (id, full_name, phone)
  values (requester, trim(target_full_name), trim(target_phone))
  on conflict (id) do update set phone = excluded.phone, full_name = excluded.full_name;
  insert into public.workspace_requests (
    requested_by, company_name, workspace_name, contact_phone, requested_plan_id, additional_information
  ) values (
    requester, trim(target_company_name), trim(target_workspace_name), trim(target_phone),
    target_plan_id, coalesce(trim(target_additional_information), '')
  ) returning * into request_row;
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (null, requester, 'workspace_request_submitted', 'workspace_request', request_row.id,
      jsonb_build_object('company_name', request_row.company_name, 'requested_plan_id', target_plan_id));
  return request_row;
end $$;

create or replace function public.resubmit_workspace_request(target_request uuid, target_additional_information text)
returns public.workspace_requests
language plpgsql security definer set search_path = public, pg_temp as $$
declare request_row public.workspace_requests;
begin
  if char_length(coalesce(target_additional_information, '')) > 2000 then raise exception 'Additional information is too long'; end if;
  update public.workspace_requests
  set status = 'pending', additional_information = trim(coalesce(target_additional_information, '')),
      admin_message = null, updated_at = now()
  where id = target_request and requested_by = auth.uid() and status = 'information_requested'
  returning * into request_row;
  if request_row.id is null then raise exception 'No workspace request is awaiting more information'; end if;
  return request_row;
end $$;

create or replace function public.platform_decide_workspace_request(
  target_request uuid,
  decision_name text,
  target_plan uuid default null,
  target_billing_period text default 'monthly',
  target_subscription_status text default 'trialing',
  target_salesperson_limit integer default null,
  target_period_start timestamptz default null,
  target_period_end timestamptz default null,
  manual_payment_confirmed boolean default false,
  manual_payment_amount numeric default null,
  manual_payment_currency text default null,
  manual_payment_reference text default null,
  admin_message text default null,
  rejection_reason text default null
)
returns public.workspace_requests
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  request_row public.workspace_requests; plan_row public.subscription_plans;
  new_org public.organizations; new_sub public.subscriptions;
  period_start timestamptz := coalesce(target_period_start, now());
  period_end timestamptz; expected_amount numeric; requester_name text;
  slug_base text; generated_slug text;
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator permission required'; end if;
  select * into request_row from public.workspace_requests where id = target_request for update;
  if request_row.id is null or request_row.status not in ('pending', 'information_requested') then
    raise exception 'Workspace request is not open';
  end if;
  if decision_name = 'information_requested' then
    if nullif(trim(admin_message), '') is null then raise exception 'A message is required when requesting more information'; end if;
    update public.workspace_requests set status = 'information_requested', admin_message = trim(admin_message),
      decision_by = auth.uid(), decision_at = now(), updated_at = now()
      where id = target_request returning * into request_row;
  elsif decision_name = 'reject' then
    if nullif(trim(rejection_reason), '') is null then raise exception 'A rejection reason is required'; end if;
    update public.workspace_requests set status = 'rejected', rejection_reason = trim(rejection_reason),
      admin_message = nullif(trim(admin_message), ''), decision_by = auth.uid(), decision_at = now(), updated_at = now()
      where id = target_request returning * into request_row;
  elsif decision_name = 'approve' then
    if target_billing_period not in ('monthly', 'quarterly', 'half_yearly', 'yearly')
      or target_subscription_status not in ('active', 'trialing') then
      raise exception 'Invalid billing period or subscription status';
    end if;
    if target_salesperson_limit is not null and target_salesperson_limit < 0 then raise exception 'Salesperson limit must not be negative'; end if;
    select * into plan_row from public.subscription_plans where id = coalesce(target_plan, request_row.requested_plan_id) and is_active;
    if plan_row.id is null then raise exception 'Select an active subscription plan'; end if;
    if target_subscription_status = 'trialing' then
      if plan_row.trial_days < 1 then raise exception 'This plan has no configured trial period'; end if;
      period_end := period_start + make_interval(days => plan_row.trial_days);
    else
      period_end := coalesce(target_period_end, period_start + case target_billing_period
        when 'monthly' then interval '1 month'
        when 'quarterly' then interval '3 months'
        when 'half_yearly' then interval '6 months'
        when 'yearly' then interval '1 year'
      end);
      if period_end <= period_start then raise exception 'Subscription end must be after its start'; end if;
      expected_amount := case target_billing_period
        when 'monthly' then plan_row.price_monthly
        when 'quarterly' then plan_row.price_quarterly
        when 'half_yearly' then plan_row.price_half_yearly
        when 'yearly' then plan_row.price_yearly
      end;
      if expected_amount > 0 then
        if not manual_payment_confirmed then raise exception 'Paid activation requires explicit manual payment confirmation'; end if;
        if plan_row.currency_code is null or manual_payment_currency is distinct from plan_row.currency_code then
          raise exception 'Manual payment currency must match the configured plan currency';
        end if;
        if manual_payment_amount is distinct from expected_amount then raise exception 'Manual payment amount must match the configured billing price'; end if;
        if nullif(trim(manual_payment_reference), '') is null or char_length(trim(manual_payment_reference)) > 160 then
          raise exception 'A valid payment reference is required';
        end if;
      elsif manual_payment_confirmed then
        raise exception 'Manual payment confirmation is not applicable to a free plan';
      end if;
    end if;
    select p.full_name into requester_name from public.profiles p where p.id = request_row.requested_by;
    slug_base := lower(regexp_replace(trim(request_row.workspace_name), '[^a-zA-Z0-9]+', '-', 'g'));
    slug_base := trim(both '-' from slug_base);
    if slug_base = '' then slug_base := 'workspace'; end if;
    generated_slug := left(slug_base, 48) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
    insert into public.organizations (name, slug, workspace_name, is_active, approval_status)
      values (request_row.company_name, generated_slug, request_row.workspace_name, true, 'approved')
      returning * into new_org;
    insert into public.organization_members (organization_id, user_id, role, is_active)
      values (new_org.id, request_row.requested_by, 'company_owner', true)
      on conflict (organization_id, user_id) do update set role = 'company_owner', is_active = true;
    insert into public.subscriptions (
      organization_id, plan_id, status, trial_ends_at, current_period_start, current_period_end,
      billing_period, has_custom_salesperson_limit, salesperson_limit_override
    ) values (
      new_org.id, plan_row.id, target_subscription_status,
      case when target_subscription_status = 'trialing' then period_end else null end,
      period_start, period_end, target_billing_period,
      target_salesperson_limit is not null, target_salesperson_limit
    ) returning * into new_sub;
    if target_salesperson_limit is not null then
      insert into public.subscription_salesperson_limit_history (
        organization_id, subscription_id, actor_id, previous_limit, next_limit, reason
      ) values (new_org.id, new_sub.id, auth.uid(), plan_row.max_salespeople, target_salesperson_limit, 'Workspace approval');
    end if;
    if target_subscription_status = 'active' and expected_amount > 0 then
      insert into public.invoices (organization_id, subscription_id, amount, status, due_at, paid_at, currency_code, billing_period)
        values (new_org.id, new_sub.id, expected_amount, 'paid', period_end, now(), plan_row.currency_code, target_billing_period);
      insert into public.payments (
        organization_id, invoice_id, amount, status, currency_code, verification_method,
        external_reference, verified_by, verified_at
      ) values (
        new_org.id, (select i.id from public.invoices i where i.organization_id = new_org.id order by i.created_at desc limit 1),
        expected_amount, 'succeeded', plan_row.currency_code, 'manual', trim(manual_payment_reference), auth.uid(), now()
      );
    end if;
    update public.workspace_requests set status = 'approved', organization_id = new_org.id,
      approved_plan_id = plan_row.id, admin_message = nullif(trim(admin_message), ''),
      decision_by = auth.uid(), decision_at = now(), updated_at = now()
      where id = target_request returning * into request_row;
    insert into public.subscription_history (
      organization_id, subscription_id, actor_id, action, next_plan_id, next_status, metadata
    ) values (new_org.id, new_sub.id, auth.uid(), 'workspace_approved', plan_row.id, target_subscription_status,
      jsonb_build_object('billing_period', target_billing_period, 'manual_payment_confirmed', manual_payment_confirmed,
        'salesperson_limit_override', target_salesperson_limit, 'request_id', target_request,
        'owner_name', requester_name));
    insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
      values (new_org.id, auth.uid(), 'workspace_approved', 'organization', new_org.id,
        jsonb_build_object('request_id', target_request, 'plan_id', plan_row.id, 'status', target_subscription_status));
  else
    raise exception 'Invalid workspace request decision';
  end if;
  if decision_name <> 'approve' then
    insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
      values (null, auth.uid(), 'workspace_request_' || decision_name, 'workspace_request', target_request,
        jsonb_build_object('message', coalesce(admin_message, rejection_reason)));
  end if;
  return request_row;
end $$;

create or replace function public.platform_upsert_subscription_plan(
  target_plan uuid,
  plan_code text,
  plan_name text,
  plan_description text,
  plan_currency text,
  monthly_price numeric,
  quarterly_price numeric,
  half_yearly_price numeric,
  yearly_price numeric,
  total_user_limit integer,
  salesperson_limit integer,
  manager_limit integer,
  admin_limit integer,
  lead_limit integer,
  plan_trial_days integer,
  plan_validity_days integer,
  plan_renewal_behavior text,
  plan_expiry_behavior text,
  plan_features jsonb,
  plan_active boolean
)
returns public.subscription_plans
language plpgsql security definer set search_path = public, pg_temp as $$
declare result public.subscription_plans;
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator permission required'; end if;
  if nullif(trim(plan_code), '') is null or plan_code !~ '^[a-z0-9_-]{2,64}$'
    or char_length(trim(plan_name)) not between 2 and 100
    or char_length(coalesce(plan_description, '')) > 1000 then raise exception 'Enter a valid plan code, name, and description'; end if;
  if plan_currency is not null and plan_currency !~ '^[A-Z]{3}$' then raise exception 'Currency must be a three-letter uppercase code'; end if;
  if monthly_price < 0 or quarterly_price < 0 or half_yearly_price < 0 or yearly_price < 0
    or (total_user_limit is not null and total_user_limit < 1)
    or (salesperson_limit is not null and salesperson_limit < 0)
    or (manager_limit is not null and manager_limit < 0)
    or (admin_limit is not null and admin_limit < 1)
    or lead_limit < 0 or plan_trial_days < 0 or (plan_validity_days is not null and plan_validity_days <= 0) then
    raise exception 'Plan prices, limits, and durations must not be negative';
  end if;
  if jsonb_typeof(plan_features) <> 'object'
    or jsonb_typeof(plan_features -> 'sales_pipeline') <> 'boolean'
    or jsonb_typeof(plan_features -> 'automation') <> 'boolean' then
    raise exception 'Set valid sales pipeline and automation feature access';
  end if;
  if (monthly_price > 0 or quarterly_price > 0 or half_yearly_price > 0 or yearly_price > 0) and plan_currency is null then
    raise exception 'A currency is required for paid plans';
  end if;
  if plan_renewal_behavior not in ('manual', 'contact_required') or plan_expiry_behavior <> 'suspend' then
    raise exception 'Select valid renewal and expiry behavior';
  end if;
  if target_plan is null then
    insert into public.subscription_plans (
      code, name, description, currency_code, price_monthly, price_quarterly, price_half_yearly, price_yearly,
      max_users, max_salespeople, max_managers, max_admins, max_leads, trial_days, validity_days,
      renewal_behavior, expiry_behavior, features, is_active, updated_at
    ) values (
      trim(plan_code), trim(plan_name), trim(coalesce(plan_description, '')), plan_currency,
      monthly_price, quarterly_price, half_yearly_price, yearly_price,
      total_user_limit, salesperson_limit, manager_limit, admin_limit, lead_limit, plan_trial_days,
      plan_validity_days, plan_renewal_behavior, plan_expiry_behavior, plan_features, plan_active, now()
    ) returning * into result;
  else
    update public.subscription_plans set
      code = trim(plan_code), name = trim(plan_name), description = trim(coalesce(plan_description, '')),
      currency_code = plan_currency, price_monthly = monthly_price, price_quarterly = quarterly_price,
      price_half_yearly = half_yearly_price, price_yearly = yearly_price, max_users = total_user_limit,
      max_salespeople = salesperson_limit, max_managers = manager_limit, max_admins = admin_limit,
      max_leads = lead_limit, trial_days = plan_trial_days, validity_days = plan_validity_days,
      renewal_behavior = plan_renewal_behavior, expiry_behavior = plan_expiry_behavior,
      features = plan_features, is_active = plan_active, updated_at = now()
      where id = target_plan returning * into result;
    if result.id is null then raise exception 'Subscription plan was not found'; end if;
  end if;
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (null, auth.uid(), case when target_plan is null then 'subscription_plan_created' else 'subscription_plan_updated' end,
      'subscription_plan', result.id, jsonb_build_object('code', result.code, 'active', result.is_active));
  return result;
end $$;

create or replace function public.platform_update_salesperson_limit(
  target_organization uuid, target_limit integer, change_reason text
)
returns public.subscriptions
language plpgsql security definer set search_path = public, pg_temp as $$
declare subscription_row public.subscriptions; previous_limit integer;
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator permission required'; end if;
  if target_limit < 0 or nullif(trim(change_reason), '') is null then raise exception 'A non-negative limit and reason are required'; end if;
  perform 1 from public.organizations where id = target_organization for update;
  if not found then raise exception 'Workspace was not found'; end if;
  select s.* into subscription_row
    from public.subscriptions s
    where s.organization_id = target_organization
    for update;
  if subscription_row.id is null then raise exception 'Workspace has no subscription'; end if;
  select case
      when subscription_row.has_custom_salesperson_limit then subscription_row.salesperson_limit_override
      else p.max_salespeople
    end
    into previous_limit
    from public.subscription_plans p
    where p.id = subscription_row.plan_id;
  update public.subscriptions set has_custom_salesperson_limit = true,
    salesperson_limit_override = target_limit, updated_at = now()
    where id = subscription_row.id returning * into subscription_row;
  insert into public.subscription_salesperson_limit_history (
    organization_id, subscription_id, actor_id, previous_limit, next_limit, reason
  ) values (target_organization, subscription_row.id, auth.uid(), previous_limit, target_limit, trim(change_reason));
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (target_organization, auth.uid(), 'salesperson_limit_updated', 'subscription', subscription_row.id,
      jsonb_build_object('previous_limit', previous_limit, 'next_limit', target_limit, 'reason', trim(change_reason)));
  return subscription_row;
end $$;

create or replace function public.platform_configure_subscription(
  target_organization uuid,
  target_plan uuid,
  target_status text,
  target_billing_period text,
  target_period_start timestamptz default null,
  target_period_end timestamptz default null,
  use_custom_salesperson_limit boolean default false,
  target_salesperson_limit integer default null,
  manual_payment_confirmed boolean default false,
  manual_payment_amount numeric default null,
  manual_payment_currency text default null,
  manual_payment_reference text default null
)
returns public.subscriptions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  plan_row public.subscription_plans;
  result public.subscriptions;
  previous public.subscriptions;
  period_start timestamptz := coalesce(target_period_start, now());
  period_end timestamptz;
  expected_amount numeric;
  new_invoice_id uuid;
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator permission required'; end if;
  if target_status not in ('active', 'trialing')
    or target_billing_period not in ('monthly', 'quarterly', 'half_yearly', 'yearly') then
    raise exception 'Select an active or trial status and valid billing period';
  end if;
  if use_custom_salesperson_limit and (target_salesperson_limit is null or target_salesperson_limit < 0) then
    raise exception 'Enter a non-negative salesperson limit';
  end if;
  if not use_custom_salesperson_limit and target_salesperson_limit is not null then
    raise exception 'A salesperson limit requires the custom limit option';
  end if;
  select * into plan_row from public.subscription_plans where id = target_plan and is_active;
  if plan_row.id is null then raise exception 'Select an active subscription plan'; end if;
  if target_status = 'trialing' then
    if plan_row.trial_days < 1 then raise exception 'This plan has no configured trial period'; end if;
    period_end := period_start + make_interval(days => plan_row.trial_days);
  else
    expected_amount := case target_billing_period
      when 'monthly' then plan_row.price_monthly
      when 'quarterly' then plan_row.price_quarterly
      when 'half_yearly' then plan_row.price_half_yearly
      when 'yearly' then plan_row.price_yearly
    end;
    period_end := coalesce(target_period_end, period_start + case target_billing_period
      when 'monthly' then interval '1 month'
      when 'quarterly' then interval '3 months'
      when 'half_yearly' then interval '6 months'
      when 'yearly' then interval '1 year'
    end);
    if plan_row.validity_days is not null and target_period_end is null then
      period_end := period_start + make_interval(days => plan_row.validity_days);
    end if;
    if period_end <= period_start then raise exception 'Subscription end must be after its start'; end if;
    if expected_amount > 0 then
      if not manual_payment_confirmed then raise exception 'Paid activation requires explicit manual payment confirmation'; end if;
      if plan_row.currency_code is null or manual_payment_currency is distinct from plan_row.currency_code then
        raise exception 'Manual payment currency must match the configured plan currency';
      end if;
      if manual_payment_amount is distinct from expected_amount then raise exception 'Manual payment amount must match the configured billing price'; end if;
      if nullif(trim(manual_payment_reference), '') is null or char_length(trim(manual_payment_reference)) > 160 then
        raise exception 'A valid payment reference is required';
      end if;
    elsif manual_payment_confirmed then
      raise exception 'Manual payment confirmation is not applicable to a free plan';
    end if;
  end if;
  if not exists (select 1 from public.organizations where id = target_organization) then raise exception 'Workspace was not found'; end if;
  perform 1 from public.organizations where id = target_organization for update;
  if exists (
    select 1 from public.organization_members m
    where m.organization_id = target_organization and m.is_active and m.role = 'super_admin'
  ) then raise exception 'The platform administration workspace cannot receive a company subscription'; end if;
  select * into previous from public.subscriptions where organization_id = target_organization for update;
  insert into public.subscriptions (
    organization_id, plan_id, status, trial_ends_at, current_period_start, current_period_end,
    billing_period, has_custom_salesperson_limit, salesperson_limit_override, status_before_suspend
  ) values (
    target_organization, plan_row.id, target_status,
    case when target_status = 'trialing' then period_end else null end,
    period_start, period_end, target_billing_period, use_custom_salesperson_limit,
    case when use_custom_salesperson_limit then target_salesperson_limit else null end, null
  ) on conflict (organization_id) do update set
    plan_id = excluded.plan_id, status = excluded.status, trial_ends_at = excluded.trial_ends_at,
    current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
    billing_period = excluded.billing_period, has_custom_salesperson_limit = excluded.has_custom_salesperson_limit,
    salesperson_limit_override = excluded.salesperson_limit_override, status_before_suspend = null,
    updated_at = now()
  returning * into result;
  update public.organizations set is_active = true, approval_status = 'approved', updated_at = now()
    where id = target_organization;
  if target_status = 'active' and expected_amount > 0 then
    insert into public.invoices (organization_id, subscription_id, amount, status, due_at, paid_at, currency_code, billing_period)
      values (target_organization, result.id, expected_amount, 'paid', period_end, now(), plan_row.currency_code, target_billing_period)
      returning id into new_invoice_id;
    insert into public.payments (
      organization_id, invoice_id, amount, status, currency_code, verification_method,
      external_reference, verified_by, verified_at
    ) values (
      target_organization, new_invoice_id, expected_amount, 'succeeded', plan_row.currency_code,
      'manual', trim(manual_payment_reference), auth.uid(), now()
    );
  end if;
  insert into public.subscription_history (
    organization_id, subscription_id, actor_id, action, previous_plan_id, next_plan_id,
    previous_status, next_status, metadata
  ) values (
    target_organization, result.id, auth.uid(),
    case when previous.id is null then 'subscription_created' else 'subscription_updated' end,
    previous.plan_id, result.plan_id, previous.status, result.status,
    jsonb_build_object('billing_period', target_billing_period, 'manual_payment_confirmed', manual_payment_confirmed,
      'salesperson_limit_override', case when use_custom_salesperson_limit then target_salesperson_limit else null end)
  );
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (target_organization, auth.uid(), 'subscription_configured', 'subscription', result.id,
      jsonb_build_object('plan_id', result.plan_id, 'status', result.status,
        'manual_payment_confirmed', manual_payment_confirmed));
  return result;
end $$;

create or replace function public.request_subscription_change(
  target_request_type text,
  target_plan uuid default null,
  target_salespeople integer default null,
  request_message text default ''
)
returns public.subscription_change_requests
language plpgsql security definer set search_path = public, pg_temp as $$
declare org_id uuid; request_row public.subscription_change_requests;
begin
  select m.organization_id into org_id from public.organization_members m
    where m.user_id = auth.uid() and m.is_active and m.role in ('company_owner', 'organization_admin')
    order by m.created_at desc limit 1;
  if org_id is null or not public.is_org_member(org_id) then raise exception 'Company owner or organization admin access required'; end if;
  if target_request_type = 'plan_upgrade' then
    if target_plan is null or target_salespeople is not null
      or not exists (select 1 from public.subscription_plans p where p.id = target_plan and p.is_active) then
      raise exception 'Select an active plan for an upgrade request';
    end if;
  elsif target_request_type = 'additional_salespeople' then
    if target_salespeople is null or target_salespeople < 0 or target_plan is not null then
      raise exception 'Enter a valid requested salesperson limit';
    end if;
  else raise exception 'Invalid subscription change request'; end if;
  if char_length(coalesce(request_message, '')) > 2000 then raise exception 'Request message is too long'; end if;
  insert into public.subscription_change_requests (
    organization_id, requested_by, request_type, target_plan_id, requested_salespeople, message
  ) values (org_id, auth.uid(), target_request_type, target_plan, target_salespeople, trim(coalesce(request_message, '')))
  returning * into request_row;
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (org_id, auth.uid(), 'subscription_change_requested', 'subscription_change_request', request_row.id,
      jsonb_build_object('type', target_request_type));
  return request_row;
end $$;

create or replace function public.resubmit_subscription_change_request(target_request uuid, requester_message text)
returns public.subscription_change_requests
language plpgsql security definer set search_path = public, pg_temp as $$
declare request_row public.subscription_change_requests;
begin
  if char_length(coalesce(requester_message, '')) not between 1 and 2000 then
    raise exception 'Enter a response between 1 and 2000 characters';
  end if;
  select * into request_row from public.subscription_change_requests
    where id = target_request and status = 'information_requested' for update;
  if request_row.id is null or not public.has_org_role(
    request_row.organization_id, array['company_owner','organization_admin']::public.app_role[]
  ) then raise exception 'No authorized request is awaiting more information'; end if;
  update public.subscription_change_requests set status = 'pending',
    requester_followup = trim(requester_message), admin_message = null,
    decision_by = null, decision_at = null, updated_at = now()
    where id = target_request returning * into request_row;
  return request_row;
end $$;

create or replace function public.platform_review_subscription_change_request(
  target_request uuid, decision_name text, admin_message text
)
returns public.subscription_change_requests
language plpgsql security definer set search_path = public, pg_temp as $$
declare request_row public.subscription_change_requests;
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator permission required'; end if;
  if decision_name not in ('information_requested', 'approved', 'rejected') then raise exception 'Invalid request decision'; end if;
  if decision_name <> 'approved' and nullif(trim(admin_message), '') is null then raise exception 'A message is required for this decision'; end if;
  update public.subscription_change_requests set status = decision_name, admin_message = nullif(trim(admin_message), ''),
    decision_by = auth.uid(), decision_at = now(), updated_at = now()
    where id = target_request and status in ('pending', 'information_requested')
    returning * into request_row;
  if request_row.id is null then raise exception 'Subscription change request is not open'; end if;
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (request_row.organization_id, auth.uid(), 'subscription_change_' || decision_name,
      'subscription_change_request', request_row.id, jsonb_build_object('message', admin_message));
  return request_row;
end $$;

create or replace function public.platform_list_workspace_requests()
returns table (
  id uuid, requested_by uuid, requester_name text, requester_email text,
  company_name text, workspace_name text, contact_phone text, requested_plan_id uuid,
  plan_name text, additional_information text, status text, admin_message text,
  rejection_reason text, created_at timestamptz
)
language plpgsql stable security definer set search_path = public, auth, pg_temp as $$
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator permission required'; end if;
  return query
    select r.id, r.requested_by, p.full_name, u.email::text,
      r.company_name, r.workspace_name, r.contact_phone, r.requested_plan_id,
      plan.name, r.additional_information, r.status, r.admin_message,
      r.rejection_reason, r.created_at
    from public.workspace_requests r
    join auth.users u on u.id = r.requested_by
    left join public.profiles p on p.id = r.requested_by
    join public.subscription_plans plan on plan.id = r.requested_plan_id
    order by r.created_at desc;
end $$;

create or replace function public.platform_list_subscription_change_requests()
returns table (
  id uuid, organization_id uuid, organization_name text, requested_by uuid,
  requester_name text, requester_email text, request_type text, target_plan_id uuid,
  target_plan_name text, requested_salespeople integer, message text, status text,
  admin_message text, created_at timestamptz
)
language plpgsql stable security definer set search_path = public, auth, pg_temp as $$
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator permission required'; end if;
  return query
    select r.id, r.organization_id, o.name, r.requested_by, p.full_name, u.email::text,
      r.request_type, r.target_plan_id, plan.name, r.requested_salespeople,
      r.message, r.status, r.admin_message, r.created_at
    from public.subscription_change_requests r
    join public.organizations o on o.id = r.organization_id
    join auth.users u on u.id = r.requested_by
    left join public.profiles p on p.id = r.requested_by
    left join public.subscription_plans plan on plan.id = r.target_plan_id
    order by r.created_at desc;
end $$;

create or replace function public.platform_list_workspace_seats()
returns table (
  organization_id uuid, organization_name text, subscription_status text,
  plan_id uuid, plan_name text, active_salespeople bigint,
  salesperson_limit integer, has_custom_limit boolean, total_active_users bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator permission required'; end if;
  return query
    select o.id, o.name, s.status, p.id, p.name,
      count(m.user_id) filter (where m.role = 'agent' and m.is_active),
      case when s.has_custom_salesperson_limit then s.salesperson_limit_override else p.max_salespeople end,
      s.has_custom_salesperson_limit,
      count(m.user_id) filter (where m.is_active)
    from public.organizations o
    join public.subscriptions s on s.organization_id = o.id
    join public.subscription_plans p on p.id = s.plan_id
    left join public.organization_members m on m.organization_id = o.id
    group by o.id, o.name, s.status, p.id, p.name, s.has_custom_salesperson_limit,
      s.salesperson_limit_override, p.max_salespeople
    order by o.name;
end $$;

create or replace function public.platform_set_company_status(
  target_organization uuid, target_active boolean, status_reason text
)
returns public.organizations
language plpgsql security definer set search_path = public, pg_temp as $$
declare result public.organizations; sub public.subscriptions;
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator permission required'; end if;
  if nullif(trim(status_reason), '') is null then raise exception 'A status reason is required'; end if;
  perform 1 from public.organizations where id = target_organization for update;
  if not found then raise exception 'Company was not found'; end if;
  if target_active then
    select * into sub from public.subscriptions where organization_id = target_organization for update;
    if sub.id is null or coalesce(sub.status_before_suspend, sub.status) not in ('active', 'trialing')
      or (sub.current_period_start is not null and sub.current_period_start > now())
      or ((case when coalesce(sub.status_before_suspend, sub.status) = 'trialing'
        then coalesce(sub.trial_ends_at, sub.current_period_end)
        else sub.current_period_end end) is not null
        and (case when coalesce(sub.status_before_suspend, sub.status) = 'trialing'
          then coalesce(sub.trial_ends_at, sub.current_period_end)
          else sub.current_period_end end) <= now()) then
      raise exception 'A valid active or trial subscription is required before workspace reactivation';
    end if;
    update public.subscriptions set status = coalesce(status_before_suspend, sub.status),
      status_before_suspend = null, updated_at = now()
      where id = sub.id and status = 'suspended';
    update public.organizations set is_active = true, approval_status = 'approved', updated_at = now()
      where id = target_organization returning * into result;
  else
    update public.subscriptions set status_before_suspend = case when status in ('active', 'trialing', 'past_due') then status else status_before_suspend end,
      status = 'suspended', updated_at = now()
      where organization_id = target_organization;
    update public.organizations set is_active = false, approval_status = 'suspended', updated_at = now()
      where id = target_organization returning * into result;
  end if;
  if result.id is null then raise exception 'Company was not found'; end if;
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (target_organization, auth.uid(), case when target_active then 'company_activated' else 'company_suspended' end,
      'organization', target_organization, jsonb_build_object('reason', trim(status_reason)));
  return result;
end $$;

create or replace function public.platform_dashboard_stats()
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator permission required'; end if;
  select jsonb_build_object(
    'companies', (select count(*) from public.organizations o where not exists (
      select 1 from public.organization_members m where m.organization_id = o.id and m.is_active and m.role = 'super_admin')),
    'active_companies', (select count(*) from public.organizations o where is_active and approval_status = 'approved' and not exists (
      select 1 from public.organization_members m where m.organization_id = o.id and m.is_active and m.role = 'super_admin')),
    'suspended_companies', (select count(*) from public.organizations o where (not is_active or approval_status = 'suspended') and not exists (
      select 1 from public.organization_members m where m.organization_id = o.id and m.is_active and m.role = 'super_admin')),
    'pending_workspace_requests', (select count(*) from public.workspace_requests where status in ('pending', 'information_requested')),
    'trial_companies', (select count(distinct organization_id) from public.subscriptions where status = 'trialing'
      and (current_period_end is null or current_period_end > now())),
    'users', (select count(distinct user_id) from public.organization_members),
    'organization_admins', (select count(distinct user_id) from public.organization_members
      where role in ('company_owner', 'organization_admin') and is_active),
    'super_admins', (select count(distinct user_id) from public.organization_members
      where role = 'super_admin' and is_active),
    'active_subscriptions', (select count(*) from public.subscriptions s join public.organizations o on o.id = s.organization_id
      where s.status in ('active','trialing') and o.is_active and o.approval_status = 'approved'
        and (s.current_period_start is null or s.current_period_start <= now())
        and (case when s.status = 'trialing' then coalesce(s.trial_ends_at, s.current_period_end)
          else s.current_period_end end is null
          or case when s.status = 'trialing' then coalesce(s.trial_ends_at, s.current_period_end)
            else s.current_period_end end > now())),
    'expired_subscriptions', (select count(*) from public.subscriptions
      where status in ('expired','cancelled') or (status in ('active','trialing')
        and (case when status = 'trialing' then coalesce(trial_ends_at, current_period_end)
          else current_period_end end <= now()))),
    'recurring_revenue', (
      select case when count(distinct p.currency_code) = 1
        then sum(case s.billing_period
          when 'monthly' then p.price_monthly
          when 'quarterly' then p.price_quarterly / 3
          when 'half_yearly' then p.price_half_yearly / 6
          when 'yearly' then p.price_yearly / 12
        end) else null end
      from public.subscriptions s join public.subscription_plans p on p.id = s.plan_id
      join public.organizations o on o.id = s.organization_id
      where s.status = 'active' and o.is_active and o.approval_status = 'approved'
        and (s.current_period_start is null or s.current_period_start <= now())
        and (s.current_period_end is null or s.current_period_end > now())
        and p.currency_code is not null
    ),
    'recurring_revenue_by_currency', coalesce((
      select jsonb_object_agg(revenue.currency_code, revenue.amount)
      from (
        select p.currency_code, sum(case s.billing_period
          when 'monthly' then p.price_monthly
          when 'quarterly' then p.price_quarterly / 3
          when 'half_yearly' then p.price_half_yearly / 6
          when 'yearly' then p.price_yearly / 12
        end) as amount
        from public.subscriptions s join public.subscription_plans p on p.id = s.plan_id
        join public.organizations o on o.id = s.organization_id
        where s.status = 'active' and o.is_active and o.approval_status = 'approved'
          and (s.current_period_start is null or s.current_period_start <= now())
          and (s.current_period_end is null or s.current_period_end > now())
          and p.currency_code is not null
        group by p.currency_code
      ) revenue
    ), '{}'::jsonb)
  ) into result;
  return result;
end $$;

-- The legacy assignment RPC could activate paid subscriptions without recording a payment.
create or replace function public.platform_upsert_subscription(
  target_organization uuid, target_plan uuid, target_status text,
  target_period_start timestamptz default null, target_period_end timestamptz default null
)
returns public.subscriptions
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator permission required'; end if;
  raise exception 'Use the explicit subscription approval flow; direct subscription assignment is disabled';
end $$;

create or replace function public.platform_expire_overdue_subscriptions()
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare overdue record; previous_status text; current_end timestamptz; expired_count integer := 0;
begin
  if not public.is_platform_admin()
    and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Platform administrator permission required';
  end if;
  for overdue in
    select s.id, s.organization_id from public.subscriptions s
    where s.status in ('active', 'trialing')
      and (case when s.status = 'trialing' then coalesce(s.trial_ends_at, s.current_period_end)
        else s.current_period_end end) is not null
      and (case when s.status = 'trialing' then coalesce(s.trial_ends_at, s.current_period_end)
        else s.current_period_end end) <= now()
    order by s.organization_id
  loop
    perform 1 from public.organizations o where o.id = overdue.organization_id for update;
    select s.status, case when s.status = 'trialing'
      then coalesce(s.trial_ends_at, s.current_period_end)
      else s.current_period_end end
      into previous_status, current_end
      from public.subscriptions s
      where s.id = overdue.id and s.status in ('active', 'trialing') for update;
    if previous_status is null or current_end is null or current_end > now() then continue; end if;
    update public.subscriptions set status = 'expired', updated_at = now() where id = overdue.id;
    update public.organizations set is_active = false, approval_status = 'suspended', updated_at = now()
      where id = overdue.organization_id;
    insert into public.subscription_history (
      organization_id, subscription_id, action, previous_status, next_status, metadata
    ) values (overdue.organization_id, overdue.id, 'subscription_expired', previous_status, 'expired',
      jsonb_build_object('expired_at', now()));
    insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
      values (overdue.organization_id, auth.uid(), 'subscription_expired', 'subscription', overdue.id,
        jsonb_build_object('expired_at', now(), 'previous_status', previous_status));
    expired_count := expired_count + 1;
  end loop;
  return expired_count;
end $$;

revoke all on function public.create_workspace_request(text,text,text,text,uuid,text) from public, anon;
revoke all on function public.resubmit_workspace_request(uuid,text) from public, anon;
revoke all on function public.get_my_workspace_access_status() from public, anon;
revoke all on function public.platform_decide_workspace_request(uuid,text,uuid,text,text,integer,timestamptz,timestamptz,boolean,numeric,text,text,text,text) from public, anon;
revoke all on function public.platform_upsert_subscription_plan(uuid,text,text,text,text,numeric,numeric,numeric,numeric,integer,integer,integer,integer,integer,integer,integer,text,text,jsonb,boolean) from public, anon;
revoke all on function public.platform_update_salesperson_limit(uuid,integer,text) from public, anon;
revoke all on function public.platform_configure_subscription(uuid,uuid,text,text,timestamptz,timestamptz,boolean,integer,boolean,numeric,text,text) from public, anon;
revoke all on function public.request_subscription_change(text,uuid,integer,text) from public, anon;
revoke all on function public.resubmit_subscription_change_request(uuid,text) from public, anon;
revoke all on function public.platform_review_subscription_change_request(uuid,text,text) from public, anon;
revoke all on function public.platform_list_workspace_requests() from public, anon;
revoke all on function public.platform_list_subscription_change_requests() from public, anon;
revoke all on function public.platform_list_workspace_seats() from public, anon;
revoke all on function public.platform_expire_overdue_subscriptions() from public, anon;
revoke all on function public.platform_upsert_subscription(uuid,uuid,text,timestamptz,timestamptz) from public, anon;
grant execute on function public.create_workspace_request(text,text,text,text,uuid,text) to authenticated;
grant execute on function public.resubmit_workspace_request(uuid,text) to authenticated;
grant execute on function public.get_my_workspace_access_status() to authenticated;
grant execute on function public.platform_decide_workspace_request(uuid,text,uuid,text,text,integer,timestamptz,timestamptz,boolean,numeric,text,text,text,text) to authenticated;
grant execute on function public.platform_upsert_subscription_plan(uuid,text,text,text,text,numeric,numeric,numeric,numeric,integer,integer,integer,integer,integer,integer,integer,text,text,jsonb,boolean) to authenticated;
grant execute on function public.platform_update_salesperson_limit(uuid,integer,text) to authenticated;
grant execute on function public.platform_configure_subscription(uuid,uuid,text,text,timestamptz,timestamptz,boolean,integer,boolean,numeric,text,text) to authenticated;
grant execute on function public.request_subscription_change(text,uuid,integer,text) to authenticated;
grant execute on function public.resubmit_subscription_change_request(uuid,text) to authenticated;
grant execute on function public.platform_review_subscription_change_request(uuid,text,text) to authenticated;
grant execute on function public.platform_list_workspace_requests() to authenticated;
grant execute on function public.platform_list_subscription_change_requests() to authenticated;
grant execute on function public.platform_list_workspace_seats() to authenticated;
grant execute on function public.platform_expire_overdue_subscriptions() to authenticated;
grant execute on function public.platform_expire_overdue_subscriptions() to service_role;
grant execute on function public.platform_upsert_subscription(uuid,uuid,text,timestamptz,timestamptz) to authenticated;

