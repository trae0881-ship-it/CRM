-- Growth Tools control-plane metadata. Integrations remain isolated services.

create table if not exists public.growth_tool_configs (
  tool_id text primary key,
  service_url text,
  enabled boolean not null default false,
  health_status text not null default 'not_configured' check (health_status in ('not_configured','healthy','unhealthy')),
  last_health_check_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

create table if not exists public.growth_tool_access (
  tool_id text not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  allowed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (tool_id, organization_id)
);

create table if not exists public.growth_tool_jobs (
  id uuid primary key default gen_random_uuid(),
  tool_id text not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  job_type text not null,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  request_metadata jsonb not null default '{}'::jsonb,
  result_metadata jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists growth_tool_jobs_scope_idx on public.growth_tool_jobs (organization_id, tool_id, created_at desc);
alter table public.growth_tool_configs enable row level security;
alter table public.growth_tool_access enable row level security;
alter table public.growth_tool_jobs enable row level security;

create policy platform_growth_config_read on public.growth_tool_configs for select using (public.is_platform_admin());
create policy platform_growth_config_write on public.growth_tool_configs for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy platform_growth_access_all on public.growth_tool_access for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy growth_jobs_platform_read on public.growth_tool_jobs for select using (public.is_platform_admin());
create policy growth_jobs_org_read on public.growth_tool_jobs for select using (public.is_org_member(organization_id));
revoke insert, update, delete on public.growth_tool_jobs from anon, authenticated;
