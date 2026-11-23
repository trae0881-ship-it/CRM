create table if not exists public.platform_data_export_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id),
  status text not null default 'started' check (status in ('started', 'completed', 'failed')),
  row_counts jsonb not null default '{}'::jsonb,
  error_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists platform_data_export_audit_actor_idx
  on public.platform_data_export_audit (actor_user_id, started_at desc);

alter table public.platform_data_export_audit enable row level security;
revoke all on public.platform_data_export_audit from public, anon, authenticated;
grant select, insert, update on public.platform_data_export_audit to service_role;

create or replace function public.platform_database_usage(target_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  usage_result jsonb;
begin
  if not exists (
    select 1
    from public.organization_members
    where user_id = target_actor
      and is_active
      and role = 'super_admin'
  ) then
    raise exception 'Platform administrator permission required';
  end if;

  select jsonb_build_object(
    'databaseBytes', pg_database_size(current_database()),
    'tables', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'tableName', table_name,
          'tableBytes', table_bytes,
          'indexBytes', index_bytes,
          'totalBytes', total_bytes
        )
        order by total_bytes desc, table_name
      )
      from (
        select
          table_class.relname as table_name,
          pg_relation_size(table_class.oid) as table_bytes,
          pg_indexes_size(table_class.oid) as index_bytes,
          pg_total_relation_size(table_class.oid) as total_bytes
        from pg_class table_class
        join pg_namespace table_namespace on table_namespace.oid = table_class.relnamespace
        where table_namespace.nspname = 'public'
          and table_class.relkind in ('r', 'p')
      ) table_usage
    ), '[]'::jsonb)
  ) into usage_result;

  return usage_result;
end;
$$;

revoke all on function public.platform_database_usage(uuid) from public, anon, authenticated;
grant execute on function public.platform_database_usage(uuid) to service_role;

notify pgrst, 'reload schema';
