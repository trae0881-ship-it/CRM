drop policy if exists lead_journey_read on public.lead_journey_events;
create policy lead_journey_read on public.lead_journey_events
for select
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
  if old.full_name is distinct from new.full_name then before_values := before_values || jsonb_build_object('full_name', old.full_name); after_values := after_values || jsonb_build_object('full_name', new.full_name); end if;
  if old.phone is distinct from new.phone then before_values := before_values || jsonb_build_object('phone', old.phone); after_values := after_values || jsonb_build_object('phone', new.phone); end if;
  if old.email is distinct from new.email then before_values := before_values || jsonb_build_object('email', old.email); after_values := after_values || jsonb_build_object('email', new.email); end if;
  if old.company is distinct from new.company then before_values := before_values || jsonb_build_object('company', old.company); after_values := after_values || jsonb_build_object('company', new.company); end if;
  if old.city is distinct from new.city then before_values := before_values || jsonb_build_object('city', old.city); after_values := after_values || jsonb_build_object('city', new.city); end if;
  if old.state is distinct from new.state then before_values := before_values || jsonb_build_object('state', old.state); after_values := after_values || jsonb_build_object('state', new.state); end if;
  if old.source is distinct from new.source then before_values := before_values || jsonb_build_object('source', old.source); after_values := after_values || jsonb_build_object('source', new.source); end if;
  if old.priority is distinct from new.priority then before_values := before_values || jsonb_build_object('priority', old.priority); after_values := after_values || jsonb_build_object('priority', new.priority); end if;
  if old.pipeline_stage_id is distinct from new.pipeline_stage_id then
    before_values := before_values || jsonb_build_object('pipeline_stage_id', old.pipeline_stage_id);
    after_values := after_values || jsonb_build_object('pipeline_stage_id', new.pipeline_stage_id);
  end if;
  if old.custom_fields is distinct from new.custom_fields then
    before_values := before_values || jsonb_build_object('custom_fields', old.custom_fields);
    after_values := after_values || jsonb_build_object('custom_fields', new.custom_fields);
  end if;

  if before_values = '{}'::jsonb then return new; end if;
  select full_name into actor_name_value from public.profiles where id = auth.uid();
  insert into public.lead_journey_events (
    organization_id, lead_id, event_type, previous_value, new_value,
    actor_id, actor_name, notes, idempotency_key
  ) values (
    new.organization_id, new.id, 'lead_details_updated',
    before_values, after_values, auth.uid(), coalesce(actor_name_value, 'System'),
    'Lead details updated', 'lead-details:' || new.id || ':' || extract(epoch from clock_timestamp())::text
  );
  return new;
end;
$$;

drop trigger if exists leads_capture_record_updates on public.leads;
create trigger leads_capture_record_updates
after update of full_name, phone, email, company, city, state, source, priority, pipeline_stage_id, custom_fields
on public.leads
for each row
execute function public.capture_lead_record_update();

notify pgrst, 'reload schema';
