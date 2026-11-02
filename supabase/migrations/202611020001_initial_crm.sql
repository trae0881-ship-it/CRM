create extension if not exists pgcrypto;

create type public.app_role as enum ('super_admin', 'organization_admin', 'manager', 'agent', 'auditor');
create type public.lead_status as enum ('new', 'contacted', 'qualified', 'follow_up', 'won', 'lost');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null default 'agent',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  external_id text not null default encode(gen_random_bytes(6), 'hex'),
  full_name text not null,
  phone text,
  email text,
  company text,
  city text,
  state text,
  source text not null default 'manual',
  status public.lead_status not null default 'new',
  score integer not null default 0 check (score between 0 and 100),
  assigned_to uuid references public.profiles(id),
  campaign_id uuid references public.campaigns(id) on delete set null,
  meta_lead_id text,
  meta_page_id text,
  meta_form_id text,
  meta_ad_id text,
  meta_created_time timestamptz,
  custom_fields jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, meta_lead_id)
);

create table public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  activity_type text not null,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.follow_up_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  assigned_to uuid references public.profiles(id),
  title text not null,
  due_at timestamptz not null,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status text not null default 'open' check (status in ('open', 'completed', 'cancelled')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meta_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  page_id text not null,
  page_name text not null,
  status text not null default 'pending' check (status in ('pending', 'connected', 'error', 'disconnected')),
  last_webhook_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, page_id)
);

create table public.meta_integration_secrets (
  integration_id uuid primary key references public.meta_integrations(id) on delete cascade,
  page_access_token text not null,
  updated_at timestamptz not null default now()
);

create table public.meta_forms (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.meta_integrations(id) on delete cascade,
  form_id text not null,
  form_name text not null,
  created_at timestamptz not null default now(),
  unique (integration_id, form_id)
);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_key text not null unique,
  page_id text,
  form_id text,
  external_lead_id text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received' check (status in ('received', 'processed', 'failed')),
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index leads_org_created_idx on public.leads (organization_id, created_at desc) where deleted_at is null;
create index leads_org_status_idx on public.leads (organization_id, status) where deleted_at is null;
create index lead_activities_lead_idx on public.lead_activities (organization_id, lead_id, created_at desc);
create index webhook_events_external_idx on public.webhook_events (provider, external_lead_id);

create or replace function public.is_org_member(target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members where organization_id = target_org and user_id = auth.uid() and is_active);
$$;

create or replace function public.has_org_role(target_org uuid, allowed public.app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members where organization_id = target_org and user_id = auth.uid() and is_active and role = any(allowed));
$$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.campaigns enable row level security;
alter table public.leads enable row level security;
alter table public.lead_activities enable row level security;
alter table public.follow_up_tasks enable row level security;
alter table public.meta_integrations enable row level security;
alter table public.meta_forms enable row level security;
alter table public.audit_logs enable row level security;
alter table public.meta_integration_secrets enable row level security;
alter table public.webhook_events enable row level security;

create policy org_member_read on public.organizations for select using (public.is_org_member(id));
create policy profile_self_or_org_read on public.profiles for select using (id = auth.uid() or exists (select 1 from public.organization_members m where m.user_id = profiles.id and public.is_org_member(m.organization_id)));
create policy membership_read on public.organization_members for select using (public.is_org_member(organization_id));
create policy campaigns_member_all on public.campaigns for all using (public.is_org_member(organization_id)) with check (public.has_org_role(organization_id, array['super_admin','organization_admin','manager']::public.app_role[]) or created_by = auth.uid());
create policy leads_member_read on public.leads for select using (public.is_org_member(organization_id) and (assigned_to = auth.uid() or public.has_org_role(organization_id, array['super_admin','organization_admin','manager','auditor']::public.app_role[])));
create policy leads_authorized_insert on public.leads for insert with check (public.is_org_member(organization_id) and public.has_org_role(organization_id, array['super_admin','organization_admin','manager','agent']::public.app_role[]));
create policy leads_authorized_update on public.leads for update using (public.is_org_member(organization_id) and (assigned_to = auth.uid() or public.has_org_role(organization_id, array['super_admin','organization_admin','manager']::public.app_role[]))) with check (public.is_org_member(organization_id));
create policy activities_member_read on public.lead_activities for select using (public.is_org_member(organization_id));
create policy activities_member_insert on public.lead_activities for insert with check (public.is_org_member(organization_id));
create policy tasks_member_all on public.follow_up_tasks for all using (public.is_org_member(organization_id) and (assigned_to = auth.uid() or public.has_org_role(organization_id, array['super_admin','organization_admin','manager']::public.app_role[]))) with check (public.is_org_member(organization_id));
create policy meta_admin_all on public.meta_integrations for all using (public.has_org_role(organization_id, array['super_admin','organization_admin']::public.app_role[])) with check (public.has_org_role(organization_id, array['super_admin','organization_admin']::public.app_role[]));
revoke all on public.meta_integration_secrets from anon, authenticated;
revoke all on public.webhook_events from anon, authenticated;
create policy forms_admin_read on public.meta_forms for select using (exists (select 1 from public.meta_integrations i where i.id = integration_id and public.has_org_role(i.organization_id, array['super_admin','organization_admin']::public.app_role[])));
create policy audit_admin_read on public.audit_logs for select using (public.has_org_role(organization_id, array['super_admin','organization_admin','auditor']::public.app_role[]));

create or replace function public.provision_first_admin(target_user uuid, organization_name text)
returns void language plpgsql security definer set search_path = public as $$
declare
  target_org uuid;
  organization_slug text;
begin
  if target_user <> auth.uid() then
    raise exception 'First admin must provision their own account';
  end if;
  if exists (select 1 from public.organization_members) then
    raise exception 'First admin has already been provisioned';
  end if;
  organization_slug := regexp_replace(lower(organization_name), '[^a-z0-9]+', '-', 'g') || '-' || substr(encode(gen_random_bytes(4), 'hex'), 1, 8);
  insert into public.organizations (name, slug) values (organization_name, organization_slug) returning id into target_org;
  insert into public.profiles (id) values (target_user) on conflict do nothing;
  insert into public.organization_members (organization_id, user_id, role) values (target_org, target_user, 'organization_admin');
end;
$$;
revoke execute on function public.provision_first_admin(uuid, text) from public;
grant execute on function public.provision_first_admin(uuid, text) to authenticated;
