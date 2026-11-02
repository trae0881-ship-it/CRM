-- YouPI-PG payment ledger and platform gateway metadata.
-- Apply only after migrations 001-011. Secrets remain in Edge Function secrets.

create table if not exists public.payment_gateway_configs (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique check (provider in ('youpi_pg')),
  api_url text not null,
  merchant_id text not null,
  enabled boolean not null default false,
  test_mode boolean not null default true,
  public_key text,
  last_connection_status text not null default 'not_configured',
  last_connection_checked_at timestamptz,
  last_error text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  customer_id uuid references public.profiles(id) on delete set null,
  provider text not null check (provider in ('youpi_pg')),
  merchant_order_id text not null unique,
  gateway_payment_id text,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null check (currency = 'INR'),
  payment_method text,
  payment_status text not null default 'ACTIVE' check (payment_status in ('ACTIVE','OBSERVED_SUCCESS','RECONCILED','MANUAL_REVIEW','FAILED','EXPIRED','CANCELLED','SUCCESS')),
  settlement_status text not null default 'NOT_RECONCILED' check (settlement_status in ('NOT_RECONCILED','RECONCILED','NOT_BANK_SETTLEMENT')),
  transaction_reference text,
  gateway_event text,
  failure_reason text,
  webhook_delivery_id text,
  checkout_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reconciled_at timestamptz
);

create table if not exists public.payment_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('youpi_pg')),
  delivery_id text not null unique,
  merchant_order_id text,
  event_type text,
  signature_valid boolean not null,
  processing_status text not null default 'received' check (processing_status in ('received','processed','ignored','failed')),
  retry_count integer not null default 0 check (retry_count >= 0),
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists payment_transactions_org_date_idx on public.payment_transactions (organization_id, created_at desc);
create index if not exists payment_transactions_status_idx on public.payment_transactions (payment_status, settlement_status, created_at desc);
create index if not exists payment_webhook_delivery_date_idx on public.payment_webhook_deliveries (received_at desc);

alter table public.payment_gateway_configs enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.payment_webhook_deliveries enable row level security;

create policy platform_gateway_config_read on public.payment_gateway_configs
  for select using (public.is_platform_admin());
create policy platform_gateway_config_update on public.payment_gateway_configs
  for update using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy platform_transactions_read on public.payment_transactions
  for select using (public.is_platform_admin());
create policy organization_transactions_read on public.payment_transactions
  for select using (public.is_org_member(organization_id));
create policy platform_webhook_delivery_read on public.payment_webhook_deliveries
  for select using (public.is_platform_admin());

revoke insert, update, delete on public.payment_gateway_configs from anon, authenticated;
revoke insert, update, delete on public.payment_transactions from anon, authenticated;
revoke insert, update, delete on public.payment_webhook_deliveries from anon, authenticated;

create or replace function public.payment_gateway_overview()
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator permission required'; end if;
  select jsonb_build_object(
    'provider', coalesce((select provider from public.payment_gateway_configs where provider = 'youpi_pg'), 'youpi_pg'),
    'enabled', coalesce((select enabled from public.payment_gateway_configs where provider = 'youpi_pg'), false),
    'test_mode', coalesce((select test_mode from public.payment_gateway_configs where provider = 'youpi_pg'), true),
    'merchant_id', (select right(merchant_id, 4) from public.payment_gateway_configs where provider = 'youpi_pg'),
    'connection_status', coalesce((select last_connection_status from public.payment_gateway_configs where provider = 'youpi_pg'), 'not_configured'),
    'total_attempts', (select count(*) from public.payment_transactions),
    'reconciled_payments', (select count(*) from public.payment_transactions where payment_status = 'RECONCILED'),
    'awaiting_reconciliation', (select count(*) from public.payment_transactions where payment_status = 'OBSERVED_SUCCESS'),
    'manual_review_payments', (select count(*) from public.payment_transactions where payment_status = 'MANUAL_REVIEW'),
    'failed_payments', (select count(*) from public.payment_transactions where payment_status = 'FAILED'),
    'expired_payments', (select count(*) from public.payment_transactions where payment_status = 'EXPIRED'),
    'reconciled_amount', coalesce((select sum(amount) from public.payment_transactions where payment_status = 'RECONCILED'), 0),
    'last_successful_webhook', (select max(processed_at) from public.payment_webhook_deliveries where processing_status = 'processed'),
    'last_webhook_error', (select error_message from public.payment_webhook_deliveries where processing_status = 'failed' order by received_at desc limit 1)
  ) into result;
  return result;
end $$;
grant execute on function public.payment_gateway_overview() to authenticated;
