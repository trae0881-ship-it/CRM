create or replace function public.get_organization_lead_trend(
  target_organization uuid,
  lookback_days integer default 30
) returns table (
  activity_date date,
  new_leads bigint,
  cumulative_leads bigint,
  status_counts jsonb
)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if not public.is_org_member(target_organization) then
    raise exception 'Active organization membership required';
  end if;

  return query
  with bounds as (
    select
      current_date - (greatest(1, least(coalesce(lookback_days, 30), 90)) - 1) as first_day,
      current_date as last_day
  ),
  calendar as (
    select generate_series(bounds.first_day::timestamp, bounds.last_day::timestamp, interval '1 day')::date as report_day
    from bounds
  ),
  daily as (
    select (l.created_at at time zone 'UTC')::date as report_day, count(*)::bigint as lead_count
    from public.leads l
    cross join bounds
    where l.organization_id = target_organization
      and l.deleted_at is null
      and l.created_at >= (bounds.first_day::timestamp at time zone 'UTC')
      and l.created_at < ((bounds.last_day + 1)::timestamp at time zone 'UTC')
    group by (l.created_at at time zone 'UTC')::date
  ),
  baseline as (
    select count(*)::bigint as lead_count
    from public.leads l
    cross join bounds
    where l.organization_id = target_organization
      and l.deleted_at is null
      and l.created_at < (bounds.first_day::timestamp at time zone 'UTC')
  ),
  statuses as (
    select coalesce(jsonb_object_agg(status_counts.status, status_counts.lead_count), '{}'::jsonb) as counts
    from (
      select l.status, count(*)::bigint as lead_count
      from public.leads l
      where l.organization_id = target_organization and l.deleted_at is null
      group by l.status
    ) status_counts
  )
  select
    calendar.report_day,
    coalesce(daily.lead_count, 0)::bigint,
    (baseline.lead_count + sum(coalesce(daily.lead_count, 0)) over (order by calendar.report_day))::bigint,
    statuses.counts
  from calendar
  cross join baseline
  cross join statuses
  left join daily on daily.report_day = calendar.report_day
  order by calendar.report_day;
end;
$$;

revoke all on function public.get_organization_lead_trend(uuid, integer) from public, anon;
grant execute on function public.get_organization_lead_trend(uuid, integer) to authenticated;

drop policy if exists lead_journey_read on public.lead_journey_events;
create policy lead_journey_read on public.lead_journey_events for select
using (public.is_org_member(organization_id));

create or replace function public.capture_lead_record_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  before_values jsonb := '{}'::jsonb;
  after_values jsonb := '{}'::jsonb;
  actor_name_value text;
begin
  if old.full_name is distinct from new.full_name then
    before_values := before_values || jsonb_build_object('full_name', old.full_name);
    after_values := after_values || jsonb_build_object('full_name', new.full_name);
  end if;
  if old.phone is distinct from new.phone then
    before_values := before_values || jsonb_build_object('phone', old.phone);
    after_values := after_values || jsonb_build_object('phone', new.phone);
  end if;
  if old.email is distinct from new.email then
    before_values := before_values || jsonb_build_object('email', old.email);
    after_values := after_values || jsonb_build_object('email', new.email);
  end if;
  if old.company is distinct from new.company then
    before_values := before_values || jsonb_build_object('company', old.company);
    after_values := after_values || jsonb_build_object('company', new.company);
  end if;
  if old.city is distinct from new.city then
    before_values := before_values || jsonb_build_object('city', old.city);
    after_values := after_values || jsonb_build_object('city', new.city);
  end if;
  if old.state is distinct from new.state then
    before_values := before_values || jsonb_build_object('state', old.state);
    after_values := after_values || jsonb_build_object('state', new.state);
  end if;
  if old.source is distinct from new.source then
    before_values := before_values || jsonb_build_object('source', old.source);
    after_values := after_values || jsonb_build_object('source', new.source);
  end if;
  if old.priority is distinct from new.priority then
    before_values := before_values || jsonb_build_object('priority', old.priority);
    after_values := after_values || jsonb_build_object('priority', new.priority);
  end if;

  if before_values = '{}'::jsonb then return new; end if;
  select full_name into actor_name_value from public.profiles where id = auth.uid();
  insert into public.lead_journey_events (
    organization_id, lead_id, event_type, previous_value, new_value, actor_id, actor_name, notes, idempotency_key
  ) values (
    new.organization_id,
    new.id,
    'lead_details_updated',
    before_values,
    after_values,
    auth.uid(),
    coalesce(actor_name_value, case when auth.uid() is null then 'System' end),
    'Lead details updated',
    'lead-details:' || new.id || ':' || extract(epoch from clock_timestamp())::text
  );
  return new;
end;
$$;

drop trigger if exists leads_capture_record_updates on public.leads;
create trigger leads_capture_record_updates
after update of full_name, phone, email, company, city, state, source, priority on public.leads
for each row execute function public.capture_lead_record_update();
