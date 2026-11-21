create or replace function public.delete_organization_lead(target_external_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  lead_row public.leads%rowtype;
  actor_name_value text;
begin
  if nullif(btrim(target_external_id), '') is null then
    raise exception 'Lead identifier is required';
  end if;

  select l.*
  into lead_row
  from public.leads l
  where l.external_id = btrim(target_external_id)
    and l.deleted_at is null
  for update;

  if not found then
    raise exception 'Lead not found';
  end if;

  if not public.has_org_role(
    lead_row.organization_id,
    array['company_owner','organization_admin']::public.app_role[]
  ) then
    raise exception 'Only organization administrators can delete leads';
  end if;

  select p.full_name
  into actor_name_value
  from public.profiles p
  where p.id = auth.uid();

  update public.leads
  set deleted_at = now(),
      updated_by = auth.uid(),
      updated_at = now()
  where id = lead_row.id;

  update public.google_sheet_source_rows
  set source_status = 'missing',
      updated_at = now()
  where lead_id = lead_row.id
    and source_status = 'active';

  insert into public.lead_journey_events (
    organization_id, lead_id, event_type, previous_value, new_value,
    actor_id, actor_name, notes, idempotency_key
  ) values (
    lead_row.organization_id,
    lead_row.id,
    'lead_deleted',
    jsonb_build_object(
      'external_id', lead_row.external_id,
      'full_name', lead_row.full_name,
      'status', lead_row.status
    ),
    jsonb_build_object('deleted_at', now()),
    auth.uid(),
    coalesce(actor_name_value, 'System'),
    'Lead removed from active organization records',
    'lead-deleted:' || lead_row.id || ':' || extract(epoch from clock_timestamp())::text
  );
end;
$$;

revoke all on function public.delete_organization_lead(text) from public, anon;
grant execute on function public.delete_organization_lead(text) to authenticated;

notify pgrst, 'reload schema';
