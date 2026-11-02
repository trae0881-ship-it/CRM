-- Phase 7 sales operations and Customer 360 foundation. Additive only.

alter table public.leads add column if not exists expected_deal_value numeric(14,2) check (expected_deal_value is null or expected_deal_value >= 0);
alter table public.leads add column if not exists expected_close_date date;
alter table public.leads add column if not exists lost_reason text;
alter table public.campaigns add column if not exists budget numeric(14,2) check (budget is null or budget >= 0);
alter table public.campaigns add column if not exists utm_source text;
alter table public.campaigns add column if not exists utm_medium text;
alter table public.campaigns add column if not exists utm_campaign text;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null, phone text, email text, company text, address text, opt_in_status text not null default 'unknown' check (opt_in_status in ('unknown','opted_in','opted_out')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists customers_org_email_idx on public.customers (organization_id, lower(email)) where email is not null;
create index if not exists customers_org_phone_idx on public.customers (organization_id, phone) where phone is not null;
create table if not exists public.customer_merge_reviews (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  primary_customer_id uuid not null references public.customers(id), duplicate_customer_id uuid not null references public.customers(id),
  status text not null default 'pending' check (status in ('pending','approved','rejected')), reviewed_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.customer_notes (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade, author_id uuid references public.profiles(id), body text not null, created_at timestamptz not null default now()
);
create table if not exists public.campaign_costs (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade, amount numeric(14,2) not null check (amount >= 0), recorded_by uuid references public.profiles(id), recorded_at timestamptz not null default now()
);
create table if not exists public.target_history (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  target_id uuid not null references public.sales_targets(id) on delete cascade, changed_by uuid references public.profiles(id), snapshot jsonb not null, created_at timestamptz not null default now()
);
create table if not exists public.commission_rules (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, rate_percent numeric(7,3) not null check (rate_percent >= 0), basis text not null check (basis in ('booking','collection')), is_active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.commission_ledger (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  rule_id uuid references public.commission_rules(id), employee_id uuid not null references public.profiles(id), booking_id uuid references public.bookings(id),
  base_amount numeric(14,2) not null check (base_amount >= 0), commission_amount numeric(14,2) not null check (commission_amount >= 0),
  status text not null default 'pending' check (status in ('pending','approved','paid','reversed')), reversal_reason text, created_at timestamptz not null default now()
);
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid references public.customers(id), lead_id uuid references public.leads(id), assigned_to uuid references public.profiles(id),
  category text not null, priority text not null default 'normal' check (priority in ('low','normal','high','urgent')), status text not null default 'open' check (status in ('open','pending','resolved','closed')),
  subject text not null, description text not null, sla_due_at timestamptz, created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references public.profiles(id), file_name text not null, status text not null default 'preview' check (status in ('preview','running','completed','failed','rolled_back')),
  total_rows integer not null default 0, valid_rows integer not null default 0, invalid_rows integer not null default 0, error_report jsonb not null default '[]'::jsonb, created_at timestamptz not null default now(), completed_at timestamptz
);

alter table public.customers enable row level security; alter table public.customer_merge_reviews enable row level security; alter table public.customer_notes enable row level security;
alter table public.campaign_costs enable row level security; alter table public.target_history enable row level security; alter table public.commission_rules enable row level security; alter table public.commission_ledger enable row level security; alter table public.support_tickets enable row level security; alter table public.import_jobs enable row level security;
create policy customer_member_scope on public.customers for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy customer_merge_admin_scope on public.customer_merge_reviews for all using (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[])) with check (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[]));
create policy customer_notes_member_scope on public.customer_notes for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy campaign_cost_admin_scope on public.campaign_costs for all using (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[])) with check (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[]));
create policy target_history_member_read on public.target_history for select using (public.is_org_member(organization_id));
create policy commission_admin_scope on public.commission_rules for all using (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[])) with check (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[]));
create policy commission_member_read on public.commission_ledger for select using (employee_id = auth.uid() or public.has_org_role(organization_id, array['company_owner','organization_admin','manager']::public.app_role[]));
create policy support_member_scope on public.support_tickets for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy import_admin_scope on public.import_jobs for all using (created_by = auth.uid() or public.has_org_role(organization_id, array['company_owner','organization_admin','manager']::public.app_role[])) with check (public.is_org_member(organization_id));

alter table public.leads add column if not exists pipeline_stage_id uuid references public.pipeline_stages(id) on delete set null;
