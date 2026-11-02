-- Phase 9 pipeline hardening. Additive only; movement is authorized and auditable.

create index if not exists leads_pipeline_stage_scope_idx
  on public.leads (organization_id, pipeline_stage_id, updated_at desc)
  where deleted_at is null;

create or replace function public.move_lead_to_pipeline_stage(
  target_lead uuid,
  target_stage uuid,
  expected_updated_at timestamptz,
  target_lost_reason text default null,
  target_expected_deal_value numeric default null,
  target_expected_close_date date default null
)
returns table (lead_id uuid, pipeline_stage_id uuid, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  lead_org uuid;
  current_stage uuid;
  current_updated_at timestamptz;
  stage_org uuid;
  stage_category text;
  stage_requires_reason boolean;
begin
  select l.organization_id, l.pipeline_stage_id, l.updated_at
    into lead_org, current_stage, current_updated_at
    from public.leads l
    where l.id = target_lead and l.deleted_at is null
    for update;

  if lead_org is null or not public.is_org_member(lead_org) then
    raise exception 'Lead access denied';
  end if;

  select p.organization_id, s.category, s.requires_reason
    into stage_org, stage_category, stage_requires_reason
    from public.pipeline_stages s
    join public.sales_pipelines p on p.id = s.pipeline_id
    where s.id = target_stage;

  if stage_org is null or stage_org <> lead_org then
    raise exception 'Pipeline stage access denied';
  end if;

  if stage_category = 'lost' and stage_requires_reason
     and nullif(trim(coalesce(target_lost_reason, '')), '') is null then
    raise exception 'Lost reason is required';
  end if;

  if current_stage = target_stage then
    return query
      select target_lead, current_stage, current_updated_at;
    return;
  end if;

  update public.leads
    set pipeline_stage_id = target_stage,
        lost_reason = case when stage_category = 'lost' then nullif(trim(target_lost_reason), '') else null end,
        expected_deal_value = target_expected_deal_value,
        expected_close_date = target_expected_close_date,
        updated_at = now()
    where id = target_lead and updated_at = expected_updated_at;

  if not found then
    raise exception 'Lead was changed by another user; reload and retry';
  end if;

  insert into public.lead_stage_history (
    organization_id, lead_id, from_stage_id, to_stage_id, actor_id,
    lost_reason, expected_value, expected_close_date
  )
  values (
    lead_org, target_lead, current_stage, target_stage, auth.uid(),
    case when stage_category = 'lost' then nullif(trim(target_lost_reason), '') else null end,
    target_expected_deal_value, target_expected_close_date
  );

  return query
    select l.id, l.pipeline_stage_id, l.updated_at
      from public.leads l
      where l.id = target_lead;
end;
$$;

revoke all on function public.move_lead_to_pipeline_stage(uuid, uuid, timestamptz, text, numeric, date) from public, anon;
grant execute on function public.move_lead_to_pipeline_stage(uuid, uuid, timestamptz, text, numeric, date) to authenticated;
