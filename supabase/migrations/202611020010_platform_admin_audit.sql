-- Additive Phase 3 administration and audit safeguards.

create table if not exists public.platform_support_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  granted_to uuid not null references public.profiles(id) on delete cascade,
  granted_by uuid not null references public.profiles(id),
  reason text not null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > starts_at)
);

alter table public.notifications add column if not exists dedupe_key text;
create unique index if not exists notifications_dedupe_idx
  on public.notifications (organization_id, user_id, dedupe_key)
  where dedupe_key is not null;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members
    where user_id = auth.uid() and is_active and role = 'super_admin'
  );
$$;
grant execute on function public.is_platform_admin() to authenticated;

create policy platform_admin_organizations_read on public.organizations
  for select using (public.is_platform_admin());
create policy platform_admin_organizations_insert on public.organizations
  for insert with check (public.is_platform_admin());
create policy platform_admin_organizations_update on public.organizations
  for update using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy platform_admin_profiles_read on public.profiles
  for select using (public.is_platform_admin());
create policy platform_admin_members_read on public.organization_members
  for select using (public.is_platform_admin());
create policy platform_admin_plans_read on public.subscription_plans
  for select using (public.is_platform_admin());
create policy platform_admin_subscriptions_all on public.subscriptions
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy platform_admin_invoices_read on public.invoices
  for select using (public.is_platform_admin());
create policy platform_admin_payments_read on public.payments
  for select using (public.is_platform_admin());
create policy platform_admin_audit_read on public.audit_logs
  for select using (public.is_platform_admin());
create policy organization_admin_profile_update on public.organizations
  for update using (public.has_org_role(id, array['company_owner','organization_admin']::public.app_role[]))
  with check (public.has_org_role(id, array['company_owner','organization_admin']::public.app_role[]));
create policy organization_admin_members_update on public.organization_members
  for update using (
    public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[])
    and role <> 'super_admin'
  ) with check (
    public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[])
    and role <> 'super_admin'
  );

create unique index if not exists active_support_grant_idx
  on public.platform_support_grants (organization_id, granted_to)
  where revoked_at is null;

alter table public.platform_support_grants enable row level security;
create policy platform_support_grants_admin_read on public.platform_support_grants
  for select using (
    granted_to = auth.uid()
    or public.has_org_role(organization_id, array['company_owner','organization_admin']::public.app_role[])
  );
revoke insert, update, delete on public.platform_support_grants from anon, authenticated;

create or replace function public.mark_all_notifications_read()
returns integer language plpgsql security definer set search_path = public as $$
declare changed integer;
begin
  update public.notifications set read_at = coalesce(read_at, now())
  where user_id = auth.uid() and read_at is null;
  get diagnostics changed = row_count;
  return changed;
end $$;
grant execute on function public.mark_all_notifications_read() to authenticated;

create or replace function public.write_lead_timeline_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare event_name text;
  target_org uuid;
  target_lead uuid;
  target_id uuid;
begin
  if tg_table_name = 'leads' then
    target_org := new.organization_id;
    target_lead := new.id;
    target_id := new.id;
  else
    target_org := new.organization_id;
    target_lead := new.lead_id;
    target_id := new.id;
  end if;
  event_name := case
    when tg_table_name = 'leads' and tg_op = 'INSERT' then 'lead_created'
    when tg_table_name = 'leads' and old.assigned_to is distinct from new.assigned_to then 'lead_reassigned'
    when tg_table_name = 'leads' and old.status is distinct from new.status then 'lead_status_changed'
    when tg_table_name = 'calls' then 'call_recorded'
    when tg_table_name = 'follow_up_tasks' then 'follow_up_' || coalesce(new.status, 'changed')
    when tg_table_name = 'site_visits' then 'site_visit_' || coalesce(new.status, 'updated')
    when tg_table_name = 'bookings' then 'booking_' || coalesce(new.status, 'updated')
    else lower(tg_table_name) || '_updated'
  end;
  insert into public.lead_journey_events (organization_id, lead_id, event_type, previous_value, new_value, actor_id, idempotency_key)
  values (
    target_org,
    target_lead,
    event_name,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    to_jsonb(new),
    auth.uid(),
    tg_table_name || ':' || target_id::text || ':' || event_name || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS')
  );
  return coalesce(new, old);
exception when others then
  raise;
end $$;

drop trigger if exists leads_timeline_event on public.leads;
drop trigger if exists leads_assignment_event on public.leads;
create trigger leads_assignment_event after update of assigned_to on public.leads
  for each row execute function public.write_lead_timeline_event();
drop trigger if exists calls_timeline_event on public.calls;
create trigger calls_timeline_event after insert or update on public.calls
  for each row execute function public.write_lead_timeline_event();
drop trigger if exists followups_timeline_event on public.follow_up_tasks;
create trigger followups_timeline_event after insert on public.follow_up_tasks
  for each row execute function public.write_lead_timeline_event();
drop trigger if exists visits_timeline_event on public.site_visits;
create trigger visits_timeline_event after insert or update on public.site_visits
  for each row execute function public.write_lead_timeline_event();
drop trigger if exists bookings_timeline_event on public.bookings;
create trigger bookings_timeline_event after insert or update on public.bookings
  for each row execute function public.write_lead_timeline_event();

create or replace function public.audit_platform_action(
  target_org uuid,
  action_name text,
  target_entity text,
  target_id uuid,
  action_metadata jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare audit_id uuid;
begin
  if not exists (
    select 1 from public.organization_members
    where user_id = auth.uid() and is_active and role = 'super_admin'
  ) then raise exception 'Platform administrator permission required'; end if;
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (target_org, auth.uid(), action_name, target_entity, target_id, coalesce(action_metadata, '{}'::jsonb))
  returning id into audit_id;
  return audit_id;
end $$;
grant execute on function public.audit_platform_action(uuid,text,text,uuid,jsonb) to authenticated;

create or replace function public.notify_crm_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_user uuid;
  event_type text;
  event_title text;
  event_body text;
  key text;
  target_org uuid;
  target_lead uuid;
begin
  if tg_table_name = 'leads' then
    target_user := new.assigned_to;
    target_org := new.organization_id;
    target_lead := new.id;
    event_type := 'lead_assigned';
    event_title := 'Lead assigned';
    event_body := 'A lead was assigned to you.';
    key := 'lead-assigned:' || new.id || ':' || coalesce(new.assigned_to::text, 'unassigned');
  elsif tg_table_name = 'lead_shares' then
    target_user := new.shared_with;
    target_org := new.organization_id;
    target_lead := new.lead_id;
    event_type := 'lead_shared';
    event_title := 'Lead shared with you';
    event_body := 'A lead was shared with your account.';
    key := 'lead-shared:' || new.id;
  elsif tg_table_name = 'follow_up_tasks' then
    target_user := new.assigned_to;
    target_org := new.organization_id;
    target_lead := new.lead_id;
    event_type := 'follow_up_due';
    event_title := 'Follow-up assigned';
    event_body := new.title;
    key := 'follow-up:' || new.id;
  elsif tg_table_name = 'site_visits' then
    target_user := new.assigned_to;
    target_org := new.organization_id;
    target_lead := new.lead_id;
    event_type := 'site_visit_updated';
    event_title := 'Site visit updated';
    event_body := 'Site visit status: ' || new.status;
    key := 'site-visit:' || new.id || ':' || new.status;
  elsif tg_table_name = 'bookings' then
    target_user := new.owner_id;
    target_org := new.organization_id;
    target_lead := new.lead_id;
    event_type := 'booking_updated';
    event_title := 'Booking updated';
    event_body := 'Booking status: ' || new.status;
    key := 'booking:' || new.id || ':' || new.status;
  end if;
  if target_user is not null then
    insert into public.notifications (organization_id, user_id, type, title, body, entity_type, entity_id, dedupe_key)
    values (target_org, target_user, event_type, event_title, event_body, 'lead', target_lead, key)
    on conflict (organization_id, user_id, dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return new;
end $$;

drop trigger if exists leads_notification_event on public.leads;
create trigger leads_notification_event after insert or update of assigned_to on public.leads
  for each row execute function public.notify_crm_event();
drop trigger if exists shares_notification_event on public.lead_shares;
create trigger shares_notification_event after insert on public.lead_shares
  for each row execute function public.notify_crm_event();
drop trigger if exists followups_notification_event on public.follow_up_tasks;
create trigger followups_notification_event after insert on public.follow_up_tasks
  for each row execute function public.notify_crm_event();
drop trigger if exists visits_notification_event on public.site_visits;
create trigger visits_notification_event after insert or update of status on public.site_visits
  for each row execute function public.notify_crm_event();
drop trigger if exists bookings_notification_event on public.bookings;
create trigger bookings_notification_event after insert or update of status on public.bookings
  for each row execute function public.notify_crm_event();
