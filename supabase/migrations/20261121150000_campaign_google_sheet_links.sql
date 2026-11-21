alter table public.google_sheet_integrations
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;

create index if not exists google_sheet_integration_campaign_idx
  on public.google_sheet_integrations (organization_id, campaign_id)
  where campaign_id is not null;

create or replace function public.enforce_google_sheet_campaign_organization()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.campaign_id is not null and not exists (
    select 1 from public.campaigns
    where id = new.campaign_id and organization_id = new.organization_id
  ) then
    raise exception 'Google Sheet campaign must belong to the same organization';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_google_sheet_campaign_organization() from public, anon, authenticated;
drop trigger if exists google_sheet_campaign_organization_guard on public.google_sheet_integrations;
create trigger google_sheet_campaign_organization_guard
before insert or update of campaign_id, organization_id on public.google_sheet_integrations
for each row execute function public.enforce_google_sheet_campaign_organization();
