-- Google Sheets lead sync and pipeline access hardening. Additive only.

create table if not exists public.google_oauth_states (
  state_hash text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz
);

create table if not exists public.google_sheet_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  provider_account_email text,
  spreadsheet_id text not null,
  spreadsheet_name text,
  worksheet_id text,
  worksheet_name text,
  status text not null default 'connected' check (status in ('pending','connected','error','disconnected')),
  auto_sync boolean not null default false,
  sync_frequency_minutes integer not null default 60 check (sync_frequency_minutes between 5 and 10080),
  row_limit integer not null default 5000 check (row_limit between 1 and 100000),
  column_mapping jsonb not null default '{}'::jsonb,
  crm_managed_fields jsonb not null default '["full_name","phone","email"]'::jsonb,
  token_ciphertext text,
  token_expires_at timestamptz,
  last_successful_sync_at timestamptz,
  next_scheduled_sync_at timestamptz,
  total_rows_processed integer not null default 0,
  new_leads_imported integer not null default 0,
  existing_leads_updated integer not null default 0,
  duplicate_rows_skipped integer not null default 0,
  failed_rows integer not null default 0,
  last_error text,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists google_sheet_org_spreadsheet_idx
  on public.google_sheet_integrations (organization_id, spreadsheet_id, coalesce(worksheet_id, ''));

create table if not exists public.google_sheet_source_rows (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.google_sheet_integrations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_row_key text not null,
  source_row_number integer not null,
  row_hash text not null,
  lead_id uuid references public.leads(id) on delete set null,
  source_status text not null default 'active' check (source_status in ('active','missing','error','duplicate')),
  last_seen_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integration_id, source_row_key)
);

create table if not exists public.google_sheet_sync_runs (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.google_sheet_integrations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  status text not null check (status in ('queued','running','completed','failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  total_rows integer not null default 0,
  new_leads integer not null default 0,
  updated_leads integer not null default 0,
  duplicate_rows integer not null default 0,
  failed_rows integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id)
);

create index if not exists google_sheet_runs_scope_idx
  on public.google_sheet_sync_runs (organization_id, started_at desc);
create index if not exists google_sheet_rows_scope_idx
  on public.google_sheet_source_rows (organization_id, integration_id, source_status);

alter table public.google_oauth_states enable row level security;
alter table public.google_sheet_integrations enable row level security;
alter table public.google_sheet_source_rows enable row level security;
alter table public.google_sheet_sync_runs enable row level security;

create policy google_oauth_state_admin on public.google_oauth_states for all
  using (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[]))
  with check (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[]));
create policy google_sheet_integration_admin on public.google_sheet_integrations for all
  using (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[]))
  with check (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[]));
create policy google_sheet_rows_admin on public.google_sheet_source_rows for select
  using (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[]));
create policy google_sheet_runs_admin on public.google_sheet_sync_runs for select
  using (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[]));

create or replace function public.move_lead_to_pipeline_stage(
  target_lead uuid,
  target_stage uuid,
  expected_updated_at timestamptz,
  target_lost_reason text default null,
  target_expected_deal_value numeric default null,
  target_expected_close_date date default null
)
returns table (lead_id uuid, pipeline_stage_id uuid, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  lead_org uuid;
  current_stage uuid;
  current_updated_at timestamptz;
  lead_assignee uuid;
  lead_team uuid;
  stage_org uuid;
  stage_category text;
  stage_requires_reason boolean;
begin
  select l.organization_id, l.pipeline_stage_id, l.updated_at, l.assigned_to, l.team_id
    into lead_org, current_stage, current_updated_at, lead_assignee, lead_team
    from public.leads l where l.id = target_lead and l.deleted_at is null for update;
  if lead_org is null or not public.is_org_member(lead_org) then raise exception 'Lead access denied'; end if;
  if not (
    public.has_org_role(lead_org, array['company_owner','organization_admin']::public.app_role[])
    or (public.has_org_role(lead_org, array['manager']::public.app_role[]) and lead_team is not null and public.is_team_manager(lead_team))
    or (public.has_org_role(lead_org, array['agent']::public.app_role[]) and lead_assignee = auth.uid())
  ) then raise exception 'Pipeline lead update access denied'; end if;

  select p.organization_id, s.category, s.requires_reason into stage_org, stage_category, stage_requires_reason
    from public.pipeline_stages s join public.sales_pipelines p on p.id = s.pipeline_id where s.id = target_stage;
  if stage_org is null or stage_org <> lead_org then raise exception 'Pipeline stage access denied'; end if;
  if stage_category = 'lost' and stage_requires_reason and nullif(trim(coalesce(target_lost_reason, '')), '') is null then raise exception 'Lost reason is required'; end if;
  if current_stage = target_stage then return query select target_lead, current_stage, current_updated_at; return; end if;
  update public.leads set pipeline_stage_id = target_stage,
    lost_reason = case when stage_category = 'lost' then nullif(trim(target_lost_reason), '') else null end,
    expected_deal_value = target_expected_deal_value, expected_close_date = target_expected_close_date, updated_at = now()
    where id = target_lead and updated_at = expected_updated_at;
  if not found then raise exception 'Lead was changed by another user; reload and retry'; end if;
  insert into public.lead_stage_history (organization_id, lead_id, from_stage_id, to_stage_id, actor_id, lost_reason, expected_value, expected_close_date)
    values (lead_org, target_lead, current_stage, target_stage, auth.uid(),
      case when stage_category = 'lost' then nullif(trim(target_lost_reason), '') else null end,
      target_expected_deal_value, target_expected_close_date);
  return query select l.id, l.pipeline_stage_id, l.updated_at from public.leads l where l.id = target_lead;
end;
$$;

revoke all on function public.move_lead_to_pipeline_stage(uuid, uuid, timestamptz, text, numeric, date) from public, anon;
grant execute on function public.move_lead_to_pipeline_stage(uuid, uuid, timestamptz, text, numeric, date) to authenticated;
