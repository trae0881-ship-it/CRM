-- Provider-neutral calling and WhatsApp records. No provider credentials are stored in the browser.

alter table public.leads
  add column if not exists do_not_contact boolean not null default false,
  add column if not exists whatsapp_opted_in boolean not null default false,
  add column if not exists whatsapp_opted_in_at timestamptz;

alter table public.calls
  add column if not exists provider text,
  add column if not exists provider_call_id text,
  add column if not exists call_status text not null default 'disconnected' check (call_status in ('queued','initiating','ringing','connected','disconnected','failed')),
  add column if not exists started_at timestamptz,
  add column if not exists connected_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists ringing_seconds integer check (ringing_seconds is null or ringing_seconds >= 0),
  add column if not exists talk_seconds integer check (talk_seconds is null or talk_seconds >= 0);

create table if not exists public.lead_skips (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  skipped_by uuid not null references public.profiles(id),
  reason text not null check (reason in ('wrong_number','not_interested','already_contacted','customer_busy','duplicate_lead','invalid_lead','other')),
  notes text,
  next_follow_up_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  sender_id uuid references public.profiles(id),
  provider text not null default 'personal_click_to_chat',
  provider_message_id text,
  direction text not null default 'outbound' check (direction in ('inbound','outbound')),
  body text not null,
  status text not null default 'opened' check (status in ('opened','submitted','queued','sent','delivered','read','failed')),
  error_message text,
  created_at timestamptz not null default now(),
  unique (provider, provider_message_id)
);

create index if not exists lead_skips_user_date_idx on public.lead_skips (organization_id, skipped_by, created_at desc);
create index if not exists whatsapp_messages_lead_date_idx on public.whatsapp_messages (organization_id, lead_id, created_at desc);

alter table public.lead_skips enable row level security;
alter table public.whatsapp_messages enable row level security;

create policy lead_skips_authorized on public.lead_skips for all using (
  public.is_org_member(organization_id) and (skipped_by = auth.uid() or public.has_org_role(organization_id, array['company_owner','organization_admin','manager','auditor']::public.app_role[]))
) with check (
  public.is_org_member(organization_id) and skipped_by = auth.uid()
);
create policy whatsapp_messages_authorized on public.whatsapp_messages for select using (
  public.is_org_member(organization_id) and (sender_id = auth.uid() or public.has_org_role(organization_id, array['company_owner','organization_admin','manager','auditor']::public.app_role[]))
);
create policy whatsapp_messages_insert on public.whatsapp_messages for insert with check (
  public.is_org_member(organization_id)
  and sender_id = auth.uid()
  and exists (
    select 1 from public.leads l
    where l.id = lead_id and l.organization_id = whatsapp_messages.organization_id
      and (
        l.assigned_to = auth.uid()
        or exists (select 1 from public.lead_shares s where s.lead_id = l.id and s.shared_with = auth.uid() and s.revoked_at is null and (s.expires_at is null or s.expires_at > now()))
        or public.has_org_role(l.organization_id, array['company_owner','organization_admin','manager']::public.app_role[])
      )
  )
);

create or replace function public.record_lead_skip(
  target_lead uuid,
  skip_reason text,
  skip_notes text,
  follow_up_at timestamptz
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  lead_row public.leads%rowtype;
  skip_id uuid;
begin
  select * into lead_row from public.leads where id = target_lead and deleted_at is null and assigned_to = auth.uid() for update;
  if not found then raise exception 'You cannot skip this lead'; end if;
  if skip_reason not in ('wrong_number','not_interested','already_contacted','customer_busy','duplicate_lead','invalid_lead','other') then raise exception 'Invalid skip reason'; end if;
  if skip_reason = 'other' and nullif(trim(skip_notes), '') is null then raise exception 'Notes are required for Other'; end if;
  if skip_reason not in ('not_interested','duplicate_lead','invalid_lead') and follow_up_at is null then raise exception 'A next follow-up is required'; end if;
  insert into public.lead_skips (organization_id, lead_id, skipped_by, reason, notes, next_follow_up_at)
    values (lead_row.organization_id, target_lead, auth.uid(), skip_reason, nullif(trim(skip_notes), ''), follow_up_at)
    returning id into skip_id;
  update public.leads set next_follow_up_at = follow_up_at, updated_by = auth.uid(), updated_at = now() where id = target_lead;
  insert into public.lead_journey_events (organization_id, lead_id, event_type, new_value, actor_id, notes, idempotency_key)
    values (lead_row.organization_id, target_lead, 'lead_skipped', jsonb_build_object('reason', skip_reason, 'next_follow_up_at', follow_up_at), auth.uid(), skip_notes, 'skip:' || skip_id);
  return skip_id;
end;
$$;

grant execute on function public.record_lead_skip(uuid, text, text, timestamptz) to authenticated;
