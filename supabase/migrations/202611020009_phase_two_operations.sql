-- Additive Phase 2 CRM operations. No production connection or data changes are performed by this file.

alter table public.site_visits
  add column if not exists location text,
  add column if not exists outcome text,
  add column if not exists cancellation_reason text,
  add column if not exists next_follow_up_at timestamptz;

alter table public.bookings
  add column if not exists project_name text,
  add column if not exists booking_reference text,
  add column if not exists payment_amount numeric(14,2) not null default 0,
  add column if not exists pending_amount numeric(14,2) not null default 0,
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.follow_up_tasks
  add column if not exists notes text,
  add column if not exists outcome text,
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_reason text,
  add column if not exists next_follow_up_id uuid references public.follow_up_tasks(id);

alter table public.lead_statuses
  add column if not exists requires_reason boolean not null default false,
  add column if not exists is_default boolean not null default false;

do $$
declare constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.site_visits'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%status%';
  if constraint_name is not null then
    execute format('alter table public.site_visits drop constraint %I', constraint_name);
  end if;
  alter table public.site_visits add constraint site_visits_status_check
    check (status in ('scheduled','confirmed','rescheduled','completed','cancelled','no_show'));
exception when duplicate_object then null;
end $$;

do $$
declare constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.bookings'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%status%';
  if constraint_name is not null then
    execute format('alter table public.bookings drop constraint %I', constraint_name);
  end if;
  alter table public.bookings add constraint bookings_status_check
    check (status in ('pending','confirmed','payment_pending','partially_paid','completed','cancelled','refunded','booked'));
exception when duplicate_object then null;
end $$;

create index if not exists site_visits_status_date_idx on public.site_visits (organization_id, status, scheduled_at);
create index if not exists bookings_status_date_idx on public.bookings (organization_id, status, booked_at desc);
create index if not exists follow_up_tasks_status_due_idx on public.follow_up_tasks (organization_id, status, due_at);

create or replace function public.update_follow_up_task(
  target_task uuid,
  next_status text,
  task_notes text,
  task_outcome text,
  cancellation_reason text
) returns void language plpgsql security definer set search_path = public as $$
declare task_row public.follow_up_tasks%rowtype;
begin
  select * into task_row from public.follow_up_tasks
    where id = target_task and assigned_to = auth.uid() for update;
  if not found then raise exception 'You cannot update this follow-up'; end if;
  if next_status not in ('open','completed','cancelled') then raise exception 'Invalid follow-up status'; end if;
  update public.follow_up_tasks
    set status = next_status,
        notes = nullif(trim(task_notes), ''),
        outcome = nullif(trim(task_outcome), ''),
        cancelled_reason = nullif(trim(cancellation_reason), ''),
        completed_at = case when next_status = 'completed' then now() else null end,
        updated_at = now()
    where id = target_task;
  insert into public.lead_journey_events (organization_id, lead_id, event_type, new_value, actor_id, notes, idempotency_key)
    values (task_row.organization_id, task_row.lead_id, 'follow_up_' || next_status,
      jsonb_build_object('task_id', target_task, 'status', next_status), auth.uid(),
      coalesce(task_notes, task_outcome, cancellation_reason), 'follow-up:' || target_task || ':' || next_status || ':' || extract(epoch from now())::bigint);
end $$;

grant execute on function public.update_follow_up_task(uuid,text,text,text,text) to authenticated;
