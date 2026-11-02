-- Advanced CRM automation foundation. Additive only; no third-party calls or arbitrary user code.

create table if not exists public.assignment_rules (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, priority integer not null default 100, mode text not null check (mode in ('round_robin','workload','team','source','location','campaign')),
  conditions jsonb not null default '{}'::jsonb, target_team_id uuid references public.teams(id) on delete set null,
  is_active boolean not null default true, created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.assignment_history (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade, assigned_to uuid references public.profiles(id), rule_id uuid references public.assignment_rules(id) on delete set null,
  outcome text not null check (outcome in ('assigned','unassigned','failed')), reason text, created_at timestamptz not null default now()
);
create table if not exists public.lead_scoring_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade, weights jsonb not null default '{}'::jsonb,
  hot_threshold integer not null default 75, warm_threshold integer not null default 45, cold_threshold integer not null default 20, updated_by uuid references public.profiles(id), updated_at timestamptz not null default now()
);
create table if not exists public.lead_score_history (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade, score integer not null check (score between 0 and 100), category text not null check (category in ('hot','warm','cold','unqualified')),
  breakdown jsonb not null default '[]'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.sales_pipelines (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, name text not null, is_default boolean not null default false, created_at timestamptz not null default now(), unique (organization_id, name)
);
create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(), pipeline_id uuid not null references public.sales_pipelines(id) on delete cascade, name text not null, position integer not null, category text not null check (category in ('open','won','lost')), requires_reason boolean not null default false, created_at timestamptz not null default now(), unique (pipeline_id, position)
);
create table if not exists public.lead_stage_history (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, lead_id uuid not null references public.leads(id) on delete cascade,
  from_stage_id uuid references public.pipeline_stages(id), to_stage_id uuid not null references public.pipeline_stages(id), actor_id uuid references public.profiles(id), lost_reason text, expected_value numeric(14,2), expected_close_date date, created_at timestamptz not null default now()
);
create table if not exists public.automation_workflows (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, name text not null,
  trigger_type text not null, conditions jsonb not null default '{}'::jsonb, actions jsonb not null default '[]'::jsonb, is_active boolean not null default false,
  execution_limit integer not null default 1000 check (execution_limit > 0), created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.automation_executions (
  id uuid primary key default gen_random_uuid(), workflow_id uuid not null references public.automation_workflows(id) on delete cascade, organization_id uuid not null references public.organizations(id) on delete cascade,
  event_key text not null, status text not null default 'queued' check (status in ('queued','running','completed','failed','skipped')), attempts integer not null default 0,
  error_message text, started_at timestamptz, completed_at timestamptz, created_at timestamptz not null default now(), unique (workflow_id, event_key)
);
create table if not exists public.automation_tasks (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade, lead_id uuid references public.leads(id) on delete cascade,
  assigned_to uuid references public.profiles(id), title text not null, due_at timestamptz not null, status text not null default 'open' check (status in ('open','completed','cancelled')), source_workflow_id uuid references public.automation_workflows(id) on delete set null, created_at timestamptz not null default now()
);
create index if not exists assignment_history_scope_idx on public.assignment_history (organization_id, lead_id, created_at desc);
create index if not exists score_history_scope_idx on public.lead_score_history (organization_id, lead_id, created_at desc);
create index if not exists automation_execution_scope_idx on public.automation_executions (organization_id, created_at desc);
create index if not exists automation_tasks_scope_idx on public.automation_tasks (organization_id, assigned_to, status, due_at);

alter table public.assignment_rules enable row level security; alter table public.assignment_history enable row level security;
alter table public.lead_scoring_settings enable row level security; alter table public.lead_score_history enable row level security;
alter table public.sales_pipelines enable row level security; alter table public.pipeline_stages enable row level security; alter table public.lead_stage_history enable row level security;
alter table public.automation_workflows enable row level security; alter table public.automation_executions enable row level security; alter table public.automation_tasks enable row level security;

create policy automation_org_rules on public.assignment_rules for all using (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[])) with check (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[]));
create policy automation_org_rules_read on public.assignment_rules for select using (public.is_org_member(organization_id));
create policy automation_org_history_read on public.assignment_history for select using (public.is_org_member(organization_id));
create policy scoring_admin_all on public.lead_scoring_settings for all using (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[])) with check (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[]));
create policy scoring_history_read on public.lead_score_history for select using (public.is_org_member(organization_id));
create policy pipeline_admin_all on public.sales_pipelines for all using (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[])) with check (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[]));
create policy pipeline_stage_member_read on public.pipeline_stages for select using (exists (select 1 from public.sales_pipelines p where p.id = pipeline_id and public.is_org_member(p.organization_id)));
create policy stage_history_member_read on public.lead_stage_history for select using (public.is_org_member(organization_id));
create policy workflow_admin_all on public.automation_workflows for all using (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[])) with check (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[]));
create policy workflow_member_read on public.automation_workflows for select using (public.is_org_member(organization_id));
create policy execution_member_read on public.automation_executions for select using (public.is_org_member(organization_id));
create policy task_member_scope on public.automation_tasks for select using (assigned_to = auth.uid() or public.has_org_role(organization_id, array['company_owner','organization_admin','manager']::public.app_role[]));

revoke insert, update, delete on public.assignment_history, public.lead_score_history, public.lead_stage_history, public.automation_executions from anon, authenticated;

create or replace function public.claim_automation_event(target_workflow uuid, target_event_key text)
returns uuid language plpgsql security definer set search_path = public as $$
declare execution_id uuid; target_org uuid;
begin
  select organization_id into target_org from public.automation_workflows where id = target_workflow and is_active;
  if target_org is null or not public.has_org_role(target_org, array['company_owner','organization_admin','manager']::public.app_role[]) then raise exception 'Workflow access denied'; end if;
  insert into public.automation_executions(workflow_id, organization_id, event_key, status, attempts)
  values (target_workflow, target_org, target_event_key, 'queued', 0)
  on conflict (workflow_id, event_key) do nothing returning id into execution_id;
  return execution_id;
end $$;
grant execute on function public.claim_automation_event(uuid,text) to authenticated;
