-- Custom statuses, notifications, and provider webhook idempotency.

create table if not exists public.lead_statuses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  color text not null default '#5144e5',
  requires_follow_up boolean not null default false,
  category text not null default 'open' check (category in ('open', 'won', 'lost')),
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.telephony_provider_configs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  status text not null default 'pending' check (status in ('pending', 'connected', 'error', 'disconnected')),
  webhook_url text,
  last_error text,
  created_at timestamptz not null default now(),
  unique (organization_id, provider)
);

create table if not exists public.provider_webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  provider text not null,
  event_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received' check (status in ('received', 'processed', 'failed')),
  created_at timestamptz not null default now(),
  unique (provider, event_key)
);

create index if not exists notifications_user_idx on public.notifications (organization_id, user_id, created_at desc);
create index if not exists statuses_org_position_idx on public.lead_statuses (organization_id, position);

alter table public.lead_statuses enable row level security;
alter table public.notifications enable row level security;
alter table public.telephony_provider_configs enable row level security;
alter table public.provider_webhook_events enable row level security;

create policy lead_statuses_read on public.lead_statuses for select using (public.is_org_member(organization_id));
create policy lead_statuses_admin_write on public.lead_statuses for all using (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[])) with check (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[]));
create policy notifications_read on public.notifications for select using (user_id = auth.uid() and public.is_org_member(organization_id));
create policy notifications_update on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy provider_config_admin on public.telephony_provider_configs for all using (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[])) with check (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[]));
revoke all on public.provider_webhook_events from anon, authenticated;

create or replace function public.mark_notification_read(target_notification uuid)
returns void language sql security definer set search_path = public as $$
  update public.notifications set read_at = now() where id = target_notification and user_id = auth.uid();
$$;
grant execute on function public.mark_notification_read(uuid) to authenticated;
