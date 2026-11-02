-- Payment idempotency, QR verification and state audit. Additive only.

alter table public.payment_transactions
  add column if not exists idempotency_key text,
  add column if not exists qr_expires_at timestamptz,
  add column if not exists qr_payload text;

create unique index if not exists payment_transactions_idempotency_idx
  on public.payment_transactions (organization_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists public.payment_state_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  payment_transaction_id uuid not null references public.payment_transactions(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  previous_status text,
  next_status text not null,
  source text not null check (source in ('gateway_webhook','manual_review','system')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.qr_payment_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  payment_transaction_id uuid not null references public.payment_transactions(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  receipt_path text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','expired')),
  review_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists payment_state_history_scope_idx
  on public.payment_state_history (organization_id, created_at desc);
create index if not exists qr_payment_reviews_scope_idx
  on public.qr_payment_reviews (organization_id, status, created_at desc);

alter table public.payment_state_history enable row level security;
alter table public.qr_payment_reviews enable row level security;

create policy payment_state_history_platform_read on public.payment_state_history
  for select using (public.is_platform_admin());
create policy payment_state_history_org_read on public.payment_state_history
  for select using (public.is_org_member(organization_id));
create policy qr_payment_reviews_org_read on public.qr_payment_reviews
  for select using (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[]));
create policy qr_payment_reviews_org_insert on public.qr_payment_reviews
  for insert with check (
    public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[])
    and submitted_by = auth.uid()
  );
create policy qr_payment_reviews_org_update on public.qr_payment_reviews
  for update using (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[]))
  with check (public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[]));

revoke insert, update, delete on public.payment_state_history from anon, authenticated;

create or replace function public.record_payment_state(
  target_payment uuid,
  target_status text,
  target_source text,
  target_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  payment public.payment_transactions;
begin
  select * into payment from public.payment_transactions where id = target_payment for update;
  if payment.id is null then raise exception 'Payment transaction was not found'; end if;
  if target_source = 'manual_review' and not public.has_org_role(payment.organization_id, array['company_owner','organization_admin']::public.app_role[]) then
    raise exception 'Payment administration permission required';
  end if;
  if target_status not in ('ACTIVE','OBSERVED_SUCCESS','RECONCILED','MANUAL_REVIEW','FAILED','EXPIRED','CANCELLED','SUCCESS') then
    raise exception 'Invalid payment status';
  end if;
  insert into public.payment_state_history (organization_id, payment_transaction_id, actor_id, previous_status, next_status, source, metadata)
  values (payment.organization_id, payment.id, auth.uid(), payment.payment_status, target_status, target_source, coalesce(target_metadata, '{}'::jsonb));
  update public.payment_transactions
    set payment_status = target_status, updated_at = now()
    where id = payment.id;
end;
$$;

revoke all on function public.record_payment_state(uuid, text, text, jsonb) from public, anon;
grant execute on function public.record_payment_state(uuid, text, text, jsonb) to authenticated;
