create or replace function public.platform_lead_analytics()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  today_date date := current_date;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator permission required';
  end if;

  with active as (
    select l.*
    from public.leads l
    where l.deleted_at is null
  ),
  duplicate_keys as (
    select 'email:' || lower(btrim(email)) as key_value
    from active
    where nullif(btrim(email), '') is not null
    union all
    select 'phone:' || regexp_replace(phone, '[^0-9+]', '', 'g')
    from active
    where length(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')) >= 7
  ),
  duplicate_groups as (
    select key_value
    from duplicate_keys
    group by key_value
    having count(*) > 1
  ),
  status_counts as (
    select status, count(*)::integer as lead_count
    from active
    group by status
  ),
  source_counts as (
    select coalesce(nullif(btrim(source), ''), 'Unknown') as source_name,
           count(*)::integer as lead_count
    from active
    group by coalesce(nullif(btrim(source), ''), 'Unknown')
  ),
  daily as (
    select
      (created_at at time zone 'UTC')::date as activity_date,
      count(*)::integer as new_leads
    from active
    where created_at >= ((today_date - 29)::timestamp at time zone 'UTC')
      and created_at < ((today_date + 1)::timestamp at time zone 'UTC')
    group by (created_at at time zone 'UTC')::date
  ),
  calendar as (
    select generate_series(today_date - 29, today_date, interval '1 day')::date as activity_date
  )
  select jsonb_build_object(
    'total_leads', (select count(*)::integer from active),
    'site_visits', (select count(*)::integer from public.site_visits sv join active l on l.id = sv.lead_id),
    'won_leads', (select count(*)::integer from active where status = 'won'),
    'open_leads', (select count(*)::integer from active where status in ('new', 'contacted', 'qualified', 'follow_up')),
    'duplicate_leads', (select count(*)::integer from duplicate_groups),
    'status_counts', coalesce((select jsonb_object_agg(status, lead_count) from status_counts), '{}'::jsonb),
    'source_counts', coalesce((select jsonb_object_agg(source_name, lead_count) from source_counts), '{}'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'activity_date', calendar.activity_date,
        'new_leads', coalesce(daily.new_leads, 0),
        'cumulative_leads', (
          select count(*)::integer
          from active prior
          where prior.created_at < ((calendar.activity_date + 1)::timestamp at time zone 'UTC')
        )
      ) order by calendar.activity_date)
      from calendar
      left join daily on daily.activity_date = calendar.activity_date
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.platform_lead_analytics() from public, anon;
grant execute on function public.platform_lead_analytics() to authenticated;
notify pgrst, 'reload schema';
