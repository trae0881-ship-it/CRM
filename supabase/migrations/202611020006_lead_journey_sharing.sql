-- Additive lead journey, sharing, and ownership-transfer foundation.
-- No existing rows are deleted or rewritten.

alter table public.leads
  add column if not exists original_assigned_to uuid references public.profiles(id),
  add column if not exists priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  add column if not exists next_follow_up_at timestamptz,
  add column if not exists converted_at timestamptz,
  add column if not exists closed_reason text;

create table if not exists public.lead_shares (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  shared_with uuid not null references public.profiles(id) on delete cascade,
  shared_by uuid not null references public.profiles(id),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  permissions jsonb not null default '{"view":true,"call":true,"follow_up":true}'::jsonb,
  created_at timestamptz not null default now(),
  check (expires_at is null or expires_at > starts_at),
  check (revoked_at is null or revoked_at >= starts_at)
);

create unique index if not exists lead_shares_active_unique
  on public.lead_shares (lead_id, shared_with)
  where revoked_at is null;
create index if not exists lead_shares_user_idx
  on public.lead_shares (organization_id, shared_with, starts_at desc);

create table if not exists public.lead_journey_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  event_type text not null,
  previous_value jsonb,
  new_value jsonb,
  actor_id uuid references public.profiles(id),
  actor_name text,
  notes text,
  previous_owner uuid references public.profiles(id),
  new_owner uuid references public.profiles(id),
  idempotency_key text unique,
  created_at timestamptz not null default now()
);

create index if not exists lead_journey_events_timeline_idx
  on public.lead_journey_events (organization_id, lead_id, created_at desc);

alter table public.lead_shares enable row level security;
alter table public.lead_journey_events enable row level security;

create policy lead_shares_read on public.lead_shares for select using (
  public.is_org_member(organization_id)
  and (
    shared_with = auth.uid()
    or shared_by = auth.uid()
    or public.has_org_role(organization_id, array['super_admin','company_owner','organization_admin','manager']::public.app_role[])
  )
);

create policy lead_journey_read on public.lead_journey_events for select using (
  public.is_org_member(organization_id)
  and (
    public.has_org_role(organization_id, array['super_admin','company_owner','organization_admin','auditor']::public.app_role[])
    or exists (
      select 1 from public.leads l
      where l.id = lead_id
        and (
          l.assigned_to = auth.uid()
          or exists (select 1 from public.lead_shares s where s.lead_id = l.id and s.shared_with = auth.uid() and s.starts_at <= now() and (s.expires_at is null or s.expires_at > now()) and s.revoked_at is null)
          or (public.has_org_role(l.organization_id, array['manager']::public.app_role[]) and l.team_id is not null and public.is_team_manager(l.team_id))
        )
    )
  )
);

revoke all on public.lead_journey_events from anon, authenticated;
grant select on public.lead_journey_events to authenticated;
revoke insert, update, delete on public.lead_journey_events from anon, authenticated;
grant select on public.lead_shares to authenticated;

drop policy if exists leads_member_read on public.leads;
create policy leads_member_read on public.leads for select using (
  public.is_org_member(organization_id)
  and (
    assigned_to = auth.uid()
    or public.has_org_role(organization_id, array['super_admin','company_owner','organization_admin','auditor']::public.app_role[])
    or exists (
      select 1 from public.lead_shares s
      where s.lead_id = leads.id
        and s.shared_with = auth.uid()
        and s.starts_at <= now()
        and (s.expires_at is null or s.expires_at > now())
        and s.revoked_at is null
    )
    or (
      public.has_org_role(organization_id, array['manager']::public.app_role[])
      and team_id is not null
      and public.is_team_manager(team_id)
    )
  )
);

create or replace function public.share_lead(
  target_lead uuid,
  target_user uuid,
  share_expires_at timestamptz,
  share_reason text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  lead_row public.leads%rowtype;
  caller_role public.app_role;
  share_id uuid;
  caller_name text;
begin
  select * into lead_row from public.leads where id = target_lead and deleted_at is null for update;
  if not found then raise exception 'Lead not found'; end if;
  select role into caller_role from public.organization_members
    where organization_id = lead_row.organization_id and user_id = auth.uid() and is_active;
  if caller_role is null or (lead_row.assigned_to is distinct from auth.uid() and caller_role not in ('super_admin','company_owner','organization_admin','manager')) then
    raise exception 'You cannot share this lead';
  end if;
  select full_name into caller_name from public.profiles where id = auth.uid();
  if not exists (select 1 from public.organization_members where organization_id = lead_row.organization_id and user_id = target_user and is_active and role in ('agent','manager','organization_admin','company_owner')) then
    raise exception 'The recipient is not an active salesperson in this organization';
  end if;
  if exists (select 1 from public.lead_shares where lead_id = target_lead and shared_with = target_user and revoked_at is null) then
    raise exception 'An active share already exists';
  end if;
  insert into public.lead_shares (organization_id, lead_id, shared_with, shared_by, expires_at)
    values (lead_row.organization_id, target_lead, target_user, auth.uid(), share_expires_at)
    returning id into share_id;
  insert into public.lead_journey_events (organization_id, lead_id, event_type, new_value, actor_id, actor_name, notes, idempotency_key)
    values (lead_row.organization_id, target_lead, 'lead_shared', jsonb_build_object('shared_with', target_user, 'expires_at', share_expires_at), auth.uid(), caller_name, nullif(trim(share_reason), ''), 'share:' || share_id);
  return share_id;
end;
$$;

create or replace function public.transfer_lead(
  target_lead uuid,
  target_user uuid,
  transfer_reason text
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  lead_row public.leads%rowtype;
  caller_role public.app_role;
  old_owner uuid;
  caller_name text;
begin
  if nullif(trim(transfer_reason), '') is null then raise exception 'A transfer reason is required'; end if;
  select * into lead_row from public.leads where id = target_lead and deleted_at is null for update;
  if not found then raise exception 'Lead not found'; end if;
  old_owner := lead_row.assigned_to;
  select role into caller_role from public.organization_members where organization_id = lead_row.organization_id and user_id = auth.uid() and is_active;
  if caller_role is null or (old_owner is distinct from auth.uid() and caller_role not in ('super_admin','company_owner','organization_admin','manager')) then
    raise exception 'You cannot transfer this lead';
  end if;
  select full_name into caller_name from public.profiles where id = auth.uid();
  if not exists (select 1 from public.organization_members where organization_id = lead_row.organization_id and user_id = target_user and is_active and role in ('agent','manager','organization_admin','company_owner')) then
    raise exception 'The recipient is not an active salesperson in this organization';
  end if;
  update public.leads set assigned_to = target_user, original_assigned_to = coalesce(original_assigned_to, old_owner), updated_by = auth.uid(), updated_at = now() where id = target_lead;
  insert into public.lead_journey_events (organization_id, lead_id, event_type, previous_value, new_value, actor_id, actor_name, notes, previous_owner, new_owner, idempotency_key)
    values (lead_row.organization_id, target_lead, 'ownership_transferred', jsonb_build_object('assigned_to', old_owner), jsonb_build_object('assigned_to', target_user), auth.uid(), caller_name, trim(transfer_reason), old_owner, target_user, 'transfer:' || target_lead || ':' || extract(epoch from clock_timestamp())::bigint);
end;
$$;

grant execute on function public.share_lead(uuid, uuid, timestamptz, text) to authenticated;
grant execute on function public.transfer_lead(uuid, uuid, text) to authenticated;

create or replace function public.capture_lead_journey()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  actor_name_value text;
begin
  select full_name into actor_name_value from public.profiles where id = auth.uid();
  if tg_op = 'INSERT' then
    insert into public.lead_journey_events (organization_id, lead_id, event_type, new_value, actor_id, actor_name, idempotency_key)
      values (new.organization_id, new.id, 'lead_created', jsonb_build_object('source', new.source, 'assigned_to', new.assigned_to), auth.uid(), actor_name_value, 'lead-created:' || new.id);
  elsif old.status is distinct from new.status then
    insert into public.lead_journey_events (organization_id, lead_id, event_type, previous_value, new_value, actor_id, actor_name, idempotency_key)
      values (new.organization_id, new.id, 'status_changed', jsonb_build_object('status', old.status), jsonb_build_object('status', new.status), auth.uid(), actor_name_value, 'status:' || new.id || ':' || extract(epoch from clock_timestamp())::text);
  elsif old.next_follow_up_at is distinct from new.next_follow_up_at then
    insert into public.lead_journey_events (organization_id, lead_id, event_type, previous_value, new_value, actor_id, actor_name, idempotency_key)
      values (new.organization_id, new.id, 'follow_up_scheduled', jsonb_build_object('next_follow_up_at', old.next_follow_up_at), jsonb_build_object('next_follow_up_at', new.next_follow_up_at), auth.uid(), actor_name_value, 'follow-up:' || new.id || ':' || extract(epoch from clock_timestamp())::text);
  end if;
  return new;
end;
$$;

drop trigger if exists leads_capture_journey on public.leads;
create trigger leads_capture_journey
after insert or update of status, next_follow_up_at on public.leads
for each row execute function public.capture_lead_journey();
