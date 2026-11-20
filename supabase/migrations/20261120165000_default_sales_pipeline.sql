with ranked_defaults as (
  select id, row_number() over (partition by organization_id order by created_at, id) as rank
  from public.sales_pipelines
  where is_default
)
update public.sales_pipelines p
set is_default = false
from ranked_defaults r
where p.id = r.id and r.rank > 1;

create unique index if not exists sales_pipelines_one_default_per_org_idx
on public.sales_pipelines (organization_id)
where is_default;

create or replace function public.ensure_default_sales_pipeline(target_organization uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  default_pipeline_id uuid;
begin
  select id into default_pipeline_id
  from public.sales_pipelines
  where organization_id = target_organization and is_default
  order by created_at
  limit 1;

  if default_pipeline_id is null then
    insert into public.sales_pipelines (organization_id, name, is_default)
    values (target_organization, 'CRM Sales Pipeline', true)
    on conflict (organization_id, name) do update set is_default = true
    returning id into default_pipeline_id;
  end if;

  insert into public.pipeline_stages (pipeline_id, name, position, category, requires_reason)
  values
    (default_pipeline_id, 'New', 0, 'open', false),
    (default_pipeline_id, 'Contacted', 1, 'open', false),
    (default_pipeline_id, 'Qualified', 2, 'open', false),
    (default_pipeline_id, 'Follow-up', 3, 'open', false),
    (default_pipeline_id, 'Won', 4, 'won', false),
    (default_pipeline_id, 'Lost', 5, 'lost', true)
  on conflict (pipeline_id, position) do nothing;
end;
$$;

revoke all on function public.ensure_default_sales_pipeline(uuid) from public, anon, authenticated;

drop policy if exists sales_pipeline_member_read on public.sales_pipelines;
create policy sales_pipeline_member_read on public.sales_pipelines for select
using (public.is_org_member(organization_id) and public.has_subscription_feature(organization_id, 'sales_pipeline'));

do $$
declare
  organization record;
begin
  for organization in select id from public.organizations loop
    perform public.ensure_default_sales_pipeline(organization.id);
  end loop;
end;
$$;

create or replace function public.initialize_organization_sales_pipeline()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.ensure_default_sales_pipeline(new.id);
  return new;
end;
$$;

revoke all on function public.initialize_organization_sales_pipeline() from public, anon, authenticated;
drop trigger if exists organizations_initialize_sales_pipeline on public.organizations;
create trigger organizations_initialize_sales_pipeline
after insert on public.organizations
for each row execute function public.initialize_organization_sales_pipeline();

update public.leads l
set pipeline_stage_id = s.id
from public.sales_pipelines p
join public.pipeline_stages s on s.pipeline_id = p.id
where l.organization_id = p.organization_id
  and p.is_default
  and l.pipeline_stage_id is null
  and s.name = case l.status
    when 'contacted' then 'Contacted'
    when 'qualified' then 'Qualified'
    when 'follow_up' then 'Follow-up'
    when 'won' then 'Won'
    when 'lost' then 'Lost'
    else 'New'
  end;

create or replace function public.set_default_lead_pipeline_stage()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.pipeline_stage_id is null then
    select s.id into new.pipeline_stage_id
    from public.pipeline_stages s
    join public.sales_pipelines p on p.id = s.pipeline_id
    where p.organization_id = new.organization_id and p.is_default
    order by
      case
        when (new.status = 'won' and s.category = 'won') or (new.status = 'lost' and s.category = 'lost') then 0
        when s.name = case new.status
          when 'contacted' then 'Contacted'
          when 'qualified' then 'Qualified'
          when 'follow_up' then 'Follow-up'
          when 'won' then 'Won'
          when 'lost' then 'Lost'
          else 'New'
        end then 1
        when s.category = 'open' then 2
        else 3
      end,
      s.position
    limit 1;
  end if;
  return new;
end;
$$;

revoke all on function public.set_default_lead_pipeline_stage() from public, anon, authenticated;
drop trigger if exists leads_set_default_pipeline_stage on public.leads;
create trigger leads_set_default_pipeline_stage
before insert on public.leads
for each row execute function public.set_default_lead_pipeline_stage();
