-- Additive SaaS hierarchy migration. It does not alter or delete existing tenant data.

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  manager_id uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role public.app_role not null,
  invited_by uuid not null references public.profiles(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  agent_id uuid not null references public.profiles(id),
  outcome text not null,
  notes text,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  next_follow_up_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.site_visits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  assigned_to uuid references public.profiles(id),
  scheduled_at timestamptz not null,
  completed_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  owner_id uuid references public.profiles(id),
  booked_at timestamptz not null default now(),
  value numeric(14,2),
  status text not null default 'booked' check (status in ('booked', 'cancelled', 'completed')),
  notes text
);

create table if not exists public.sales_targets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  lead_target integer not null default 0 check (lead_target >= 0),
  call_target integer not null default 0 check (call_target >= 0),
  booking_target integer not null default 0 check (booking_target >= 0),
  created_at timestamptz not null default now(),
  check (period_end >= period_start),
  check (user_id is not null or team_id is not null)
);

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  price_monthly numeric(14,2) not null default 0 check (price_monthly >= 0),
  max_users integer,
  max_leads integer,
  features jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  status text not null default 'trialing' check (status in ('trialing', 'active', 'past_due', 'cancelled', 'expired')),
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id)
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  provider_invoice_id text,
  amount numeric(14,2) not null default 0,
  status text not null default 'open' check (status in ('open', 'paid', 'void', 'uncollectible')),
  due_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  provider_payment_id text,
  amount numeric(14,2) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  created_at timestamptz not null default now()
);

create index if not exists teams_org_idx on public.teams (organization_id);
create index if not exists team_members_user_idx on public.team_members (organization_id, user_id);
create index if not exists calls_agent_date_idx on public.calls (organization_id, agent_id, created_at desc);
create index if not exists site_visits_date_idx on public.site_visits (organization_id, scheduled_at);
create index if not exists targets_period_idx on public.sales_targets (organization_id, period_start, period_end);
create index if not exists invoices_org_date_idx on public.invoices (organization_id, created_at desc);

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.invitations enable row level security;
alter table public.calls enable row level security;
alter table public.site_visits enable row level security;
alter table public.bookings enable row level security;
alter table public.sales_targets enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;

create policy teams_member_read on public.teams for select using (public.is_org_member(organization_id));
create policy teams_admin_write on public.teams for all using (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[])) with check (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[]));
create policy team_members_member_read on public.team_members for select using (public.is_org_member(organization_id));
create policy team_members_admin_write on public.team_members for all using (public.has_org_role(organization_id, array['company_owner','organization_admin','manager']::public.app_role[])) with check (public.has_org_role(organization_id, array['company_owner','organization_admin','manager']::public.app_role[]));
create policy invitations_admin_all on public.invitations for all using (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[])) with check (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[]));
create policy calls_authorized_read on public.calls for select using (public.is_org_member(organization_id) and (agent_id = auth.uid() or public.has_org_role(organization_id, array['company_owner','organization_admin','manager','auditor']::public.app_role[])));
create policy calls_agent_insert on public.calls for insert with check (public.is_org_member(organization_id) and agent_id = auth.uid());
create policy visits_authorized_all on public.site_visits for all using (public.is_org_member(organization_id) and (assigned_to = auth.uid() or public.has_org_role(organization_id, array['company_owner','organization_admin','manager','auditor']::public.app_role[]))) with check (public.is_org_member(organization_id));
create policy bookings_authorized_all on public.bookings for all using (public.is_org_member(organization_id) and (owner_id = auth.uid() or public.has_org_role(organization_id, array['company_owner','organization_admin','manager','auditor']::public.app_role[]))) with check (public.is_org_member(organization_id));
create policy targets_authorized_read on public.sales_targets for select using (public.is_org_member(organization_id) and (user_id = auth.uid() or public.has_org_role(organization_id, array['company_owner','organization_admin','manager','auditor']::public.app_role[])));
create policy targets_admin_write on public.sales_targets for all using (public.has_org_role(organization_id, array['company_owner','organization_admin','manager']::public.app_role[])) with check (public.has_org_role(organization_id, array['company_owner','organization_admin','manager']::public.app_role[]));
create policy plans_authenticated_read on public.subscription_plans for select to authenticated using (is_active);
create policy subscriptions_owner_read on public.subscriptions for select using (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[]));
create policy invoices_owner_read on public.invoices for select using (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[]));
create policy payments_owner_read on public.payments for select using (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[]));

insert into public.subscription_plans (code, name, price_monthly, max_users, max_leads, features)
values
  ('free', 'Free', 0, 3, 500, '{"reports":"basic"}'),
  ('starter', 'Starter', 0, 10, 5000, '{"reports":"basic","lead_management":true}'),
  ('growth', 'Growth', 0, 25, 25000, '{"reports":"advanced","teams":true,"campaigns":true,"meta":true}'),
  ('enterprise', 'Enterprise', 0, null, null, '{"reports":"advanced","permissions":"custom","integrations":"advanced"}')
on conflict (code) do nothing;
