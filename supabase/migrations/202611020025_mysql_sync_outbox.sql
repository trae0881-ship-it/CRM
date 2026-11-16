-- Transactional outbox for the server-side MySQL replica. Additive; do not apply
-- until the target Supabase project and complete migration history are verified.

create table if not exists public.mysql_sync_outbox (
  event_id uuid primary key default gen_random_uuid(),
  event_sequence bigint generated always as identity unique,
  entity_type text not null,
  operation text not null check (operation in ('INSERT','UPDATE','DELETE')),
  record_id uuid,
  source_record_key text not null,
  organization_id uuid,
  row_data jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','failed','completed')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  claimed_by text,
  last_error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists mysql_sync_outbox_claim_idx
  on public.mysql_sync_outbox (status, next_attempt_at, event_sequence);
create index if not exists mysql_sync_outbox_scope_idx
  on public.mysql_sync_outbox (organization_id, status, created_at desc);
create index if not exists mysql_sync_outbox_record_order_idx
  on public.mysql_sync_outbox (entity_type, source_record_key, event_sequence);

alter table public.mysql_sync_outbox enable row level security;
revoke all on public.mysql_sync_outbox from public, anon, authenticated;

create or replace function public.mysql_sync_strip_secrets(source jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare result jsonb;
begin
  if jsonb_typeof(source) = 'object' then
    select coalesce(jsonb_object_agg(entry.key, public.mysql_sync_strip_secrets(entry.value)), '{}'::jsonb)
      into result
      from jsonb_each(source) entry
     where entry.key !~* '(password|token|secret|credential|authorization|private[_-]?key|api[_-]?key|cookie|jwt)';
    return result;
  elsif jsonb_typeof(source) = 'array' then
    select coalesce(jsonb_agg(public.mysql_sync_strip_secrets(entry.value)), '[]'::jsonb)
      into result
      from jsonb_array_elements(source) entry(value);
    return result;
  end if;
  return source;
end;
$$;
revoke all on function public.mysql_sync_strip_secrets(jsonb) from public, anon, authenticated;

create or replace function public.mysql_sync_encode_key(source text)
returns text
language sql
immutable
strict
set search_path = public, pg_temp
as $$
  select rtrim(translate(replace(encode(convert_to(source, 'UTF8'), 'base64'), E'\n', ''), '+/', '-_'), '=');
$$;
revoke all on function public.mysql_sync_encode_key(text) from public, anon, authenticated;

create or replace function public.enqueue_mysql_sync_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  source_row jsonb;
  source_id uuid;
  source_org uuid;
  source_key text;
  operation_name text;
begin
  if tg_op = 'DELETE' then
    source_row := to_jsonb(old);
    operation_name := 'DELETE';
  else
    source_row := to_jsonb(new);
    operation_name := tg_op;
  end if;

  source_id := nullif(source_row ->> 'id', '')::uuid;
  source_org := nullif(coalesce(source_row ->> 'organization_id', source_row ->> 'org_id'), '')::uuid;
  if source_org is null and tg_table_name = 'organizations' then
    source_org := source_id;
  elsif source_org is null and tg_table_name = 'pipeline_stages' then
    select organization_id into source_org from public.sales_pipelines where id = (source_row ->> 'pipeline_id')::uuid;
  elsif source_org is null and tg_table_name = 'meta_forms' then
    select organization_id into source_org from public.meta_integrations where id = (source_row ->> 'integration_id')::uuid;
  elsif source_org is null and tg_table_name = 'webhook_events' then
    select organization_id into source_org from public.meta_integrations where page_id = source_row ->> 'page_id' limit 1;
  end if;

  source_key := coalesce(
    source_row ->> 'id',
    case tg_table_name
      when 'organization_members' then public.mysql_sync_encode_key(source_row ->> 'organization_id') || '.' || public.mysql_sync_encode_key(source_row ->> 'user_id')
      when 'team_members' then public.mysql_sync_encode_key(source_row ->> 'team_id') || '.' || public.mysql_sync_encode_key(source_row ->> 'user_id')
      when 'lead_scoring_settings' then public.mysql_sync_encode_key(source_row ->> 'organization_id')
      when 'organization_settings' then public.mysql_sync_encode_key(source_row ->> 'organization_id')
      when 'growth_tool_access' then public.mysql_sync_encode_key(source_row ->> 'tool_id') || '.' || public.mysql_sync_encode_key(source_row ->> 'organization_id')
      when 'payment_gateway_configs' then public.mysql_sync_encode_key(source_row ->> 'provider')
      when 'google_sheet_source_rows' then public.mysql_sync_encode_key(source_row ->> 'integration_id') || '.' || public.mysql_sync_encode_key(source_row ->> 'source_row_key')
      else null
    end
  );
  if source_key is null then raise exception 'Cannot determine synchronized record key for %.%', tg_table_schema, tg_table_name; end if;

  insert into public.mysql_sync_outbox (
    entity_type, operation, record_id, source_record_key, organization_id, row_data
  ) values (
    tg_table_name, operation_name, source_id, source_key, source_org,
    public.mysql_sync_strip_secrets(source_row)
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.enqueue_mysql_sync_change() from public, anon, authenticated;

do $$
declare
  table_name text;
  source_tables text[] := array[
    'organizations','profiles','organization_members','teams','team_members','campaigns','leads',
    'lead_activities','follow_up_tasks','meta_integrations','meta_forms','webhook_events','audit_logs',
    'calls','site_visits','bookings','sales_targets','subscription_plans','subscriptions','invoices',
    'payments','lead_shares','lead_journey_events','lead_skips','whatsapp_messages','lead_statuses',
    'notifications','telephony_provider_configs','provider_webhook_events','payment_gateway_configs',
    'payment_transactions','payment_webhook_deliveries','payment_state_history','qr_payment_reviews',
    'growth_tool_access','growth_tool_jobs','assignment_rules','assignment_history','lead_scoring_settings',
    'lead_score_history','sales_pipelines','pipeline_stages','lead_stage_history','automation_workflows',
    'automation_executions','automation_tasks','customers','customer_merge_reviews','customer_notes',
    'campaign_costs','target_history','commission_rules','commission_ledger','support_tickets','import_jobs',
    'google_sheet_integrations','google_sheet_source_rows','google_sheet_sync_runs','organization_settings',
    'subscription_history'
  ];
begin
  foreach table_name in array source_tables loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('drop trigger if exists enqueue_mysql_sync_change_trigger on public.%I', table_name);
      execute format(
        'create trigger enqueue_mysql_sync_change_trigger after insert or update or delete on public.%I for each row execute function public.enqueue_mysql_sync_change()',
        table_name
      );
    end if;
  end loop;
end;
$$;

create or replace function public.claim_mysql_sync_outbox(batch_size integer, worker_id text)
returns table (
  event_id uuid,
  event_sequence bigint,
  entity_type text,
  operation text,
  record_id uuid,
  source_record_key text,
  organization_id uuid,
  row_data jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
  if batch_size < 1 or batch_size > 250 or worker_id is null or length(worker_id) > 128 then
    raise exception 'Invalid outbox claim parameters';
  end if;
  return query
    with candidates as (
      select current_event.event_id
        from public.mysql_sync_outbox current_event
       where (
         (current_event.status = 'pending' and current_event.next_attempt_at <= now())
         or (current_event.status = 'failed' and current_event.attempt_count < 12 and current_event.next_attempt_at <= now())
         or (current_event.status = 'processing' and current_event.lease_until < now())
       )
         and not exists (
           select 1
             from public.mysql_sync_outbox earlier
            where earlier.entity_type = current_event.entity_type
              and earlier.source_record_key = current_event.source_record_key
              and earlier.event_sequence < current_event.event_sequence
              and earlier.status <> 'completed'
         )
       order by current_event.event_sequence
       limit batch_size
       for update skip locked
    ), claimed as (
      update public.mysql_sync_outbox queued
         set status = 'processing', claimed_by = worker_id,
             lease_until = now() + interval '2 minutes',
             attempt_count = attempt_count + 1
        from candidates
       where queued.event_id = candidates.event_id
       returning queued.*
    )
    select claimed.event_id, claimed.event_sequence, claimed.entity_type, claimed.operation,
           claimed.record_id, claimed.source_record_key, claimed.organization_id,
           claimed.row_data, claimed.created_at
      from claimed
     order by claimed.event_sequence;
end;
$$;

create or replace function public.complete_mysql_sync_event(target_event uuid, worker_id text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare changed integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
  update public.mysql_sync_outbox
     set status = 'completed', completed_at = now(), lease_until = null,
         claimed_by = null, last_error_code = null
   where event_id = target_event and status = 'processing' and claimed_by = worker_id;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function public.fail_mysql_sync_event(target_event uuid, worker_id text, safe_error_code text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare changed integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
  update public.mysql_sync_outbox
     set status = 'failed',
         next_attempt_at = case
           when attempt_count >= 12 then 'infinity'::timestamptz
           else now() + make_interval(secs => least(3600, (power(2, least(attempt_count, 11)) * 5)::integer))
         end,
         lease_until = null, claimed_by = null,
         last_error_code = left(coalesce(nullif(safe_error_code, ''), 'sync_failed'), 96)
   where event_id = target_event and status = 'processing' and claimed_by = worker_id;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function public.replay_mysql_sync_failures(target_organization uuid default null, max_events integer default 1000)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare changed integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
  if max_events < 1 or max_events > 10000 then raise exception 'Invalid replay limit'; end if;
  with selected as (
    select event_id from public.mysql_sync_outbox
     where status = 'failed' and attempt_count >= 12
       and (target_organization is null or organization_id = target_organization)
     order by event_sequence limit max_events for update skip locked
  )
  update public.mysql_sync_outbox queued
     set status = 'pending', attempt_count = 0, next_attempt_at = now(),
         claimed_by = null, lease_until = null, last_error_code = null
    from selected where queued.event_id = selected.event_id;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

create or replace function public.mysql_sync_health()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
  return jsonb_build_object(
    'pending', (select count(*) from public.mysql_sync_outbox where status = 'pending'),
    'processing', (select count(*) from public.mysql_sync_outbox where status = 'processing'),
    'failed', (select count(*) from public.mysql_sync_outbox where status = 'failed'),
    'completed', (select count(*) from public.mysql_sync_outbox where status = 'completed'),
    'last_successful_sync_at', (select max(completed_at) from public.mysql_sync_outbox where status = 'completed'),
    'last_error_code', (select last_error_code from public.mysql_sync_outbox where status = 'failed' order by created_at desc limit 1),
    'organizations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'organization_id', organization_id,
        'pending', pending,
        'processing', processing,
        'failed', failed,
        'completed', completed,
        'last_successful_sync_at', last_successful_sync_at
      ))
      from (
        select organization_id,
          count(*) filter (where status = 'pending') as pending,
          count(*) filter (where status = 'processing') as processing,
          count(*) filter (where status = 'failed') as failed,
          count(*) filter (where status = 'completed') as completed,
          max(completed_at) filter (where status = 'completed') as last_successful_sync_at
        from public.mysql_sync_outbox where organization_id is not null group by organization_id
      ) organization_status
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.claim_mysql_sync_outbox(integer, text) from public, anon, authenticated;
revoke all on function public.complete_mysql_sync_event(uuid, text) from public, anon, authenticated;
revoke all on function public.fail_mysql_sync_event(uuid, text, text) from public, anon, authenticated;
revoke all on function public.replay_mysql_sync_failures(uuid, integer) from public, anon, authenticated;
revoke all on function public.mysql_sync_health() from public, anon, authenticated;
grant execute on function public.claim_mysql_sync_outbox(integer, text) to service_role;
grant execute on function public.complete_mysql_sync_event(uuid, text) to service_role;
grant execute on function public.fail_mysql_sync_event(uuid, text, text) to service_role;
grant execute on function public.replay_mysql_sync_failures(uuid, integer) to service_role;
grant execute on function public.mysql_sync_health() to service_role;
