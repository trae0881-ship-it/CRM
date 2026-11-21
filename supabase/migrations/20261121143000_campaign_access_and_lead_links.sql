create table if not exists public.campaign_members (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

create index if not exists campaign_members_user_idx
  on public.campaign_members (user_id, campaign_id);

alter table public.campaign_members enable row level security;

create or replace function public.has_campaign_access(target_campaign uuid, target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.campaigns c
    join public.organization_members m
      on m.organization_id = c.organization_id
     and m.user_id = target_user
     and m.is_active
    where c.id = target_campaign
      and (
        m.role in ('company_owner', 'organization_admin')
        or exists (
          select 1 from public.campaign_members cm
          where cm.campaign_id = c.id and cm.user_id = target_user
        )
      )
  );
$$;

create or replace function public.is_campaign_admin(target_campaign uuid, target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.campaigns c
    join public.organization_members m
      on m.organization_id = c.organization_id
     and m.user_id = target_user
     and m.is_active
    where c.id = target_campaign
      and m.role in ('company_owner', 'organization_admin')
  );
$$;

revoke all on function public.has_campaign_access(uuid, uuid) from public, anon;
revoke all on function public.is_campaign_admin(uuid, uuid) from public, anon;
grant execute on function public.has_campaign_access(uuid, uuid) to authenticated;
grant execute on function public.is_campaign_admin(uuid, uuid) to authenticated;

drop policy if exists campaigns_member_all on public.campaigns;
drop policy if exists campaigns_access_read on public.campaigns;
create policy campaigns_access_read on public.campaigns
for select using (
  public.has_org_role(organization_id, array['company_owner', 'organization_admin']::public.app_role[])
  or public.has_campaign_access(id)
);

drop policy if exists campaign_members_access_read on public.campaign_members;
create policy campaign_members_access_read on public.campaign_members
for select using (
  user_id = auth.uid()
  or public.is_campaign_admin(campaign_id)
);

revoke all on public.campaign_members from public, anon, authenticated;
grant select on public.campaign_members to authenticated;
revoke insert, update, delete on public.campaigns from public, anon, authenticated;
grant select on public.campaigns to authenticated;

create or replace function public.create_organization_campaign(
  target_organization uuid,
  target_name text,
  target_description text,
  target_member_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  campaign_id_value uuid;
  requested_members uuid[] := coalesce(target_member_ids, '{}'::uuid[]);
begin
  if auth.uid() is null or not public.has_org_role(
    target_organization,
    array['company_owner', 'organization_admin']::public.app_role[]
  ) then
    raise exception 'Only organization admins can create campaigns';
  end if;
  if nullif(btrim(target_name), '') is null or length(btrim(target_name)) > 120 then
    raise exception 'Campaign name is required and must be 120 characters or fewer';
  end if;
  if length(coalesce(target_description, '')) > 2000 then
    raise exception 'Campaign description must be 2000 characters or fewer';
  end if;
  if exists (
    select 1
    from unnest(requested_members) requested(user_id)
    where requested.user_id is null
      or not exists (
        select 1 from public.organization_members m
        where m.organization_id = target_organization
          and m.user_id = requested.user_id
          and m.is_active
      )
  ) then
    raise exception 'Campaign access can only be given to active members of this organization';
  end if;

  insert into public.campaigns (organization_id, name, description, created_by)
  values (target_organization, btrim(target_name), nullif(btrim(target_description), ''), auth.uid())
  returning id into campaign_id_value;

  insert into public.campaign_members (campaign_id, user_id, added_by)
  select campaign_id_value, members.user_id, auth.uid()
  from (select distinct unnest(requested_members) as user_id) members;
  return campaign_id_value;
end;
$$;

create or replace function public.set_campaign_access(
  target_campaign uuid,
  target_member_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  campaign_organization uuid;
  requested_members uuid[] := coalesce(target_member_ids, '{}'::uuid[]);
begin
  select organization_id into campaign_organization
  from public.campaigns where id = target_campaign;
  if campaign_organization is null then raise exception 'Campaign not found'; end if;
  if auth.uid() is null or not public.has_org_role(
    campaign_organization,
    array['company_owner', 'organization_admin']::public.app_role[]
  ) then
    raise exception 'Only organization admins can manage campaign access';
  end if;
  if exists (
    select 1
    from unnest(requested_members) requested(user_id)
    where requested.user_id is null
      or not exists (
        select 1 from public.organization_members m
        where m.organization_id = campaign_organization
          and m.user_id = requested.user_id
          and m.is_active
      )
  ) then
    raise exception 'Campaign access can only be given to active members of this organization';
  end if;

  delete from public.campaign_members where campaign_id = target_campaign;
  insert into public.campaign_members (campaign_id, user_id, added_by)
  select target_campaign, members.user_id, auth.uid()
  from (select distinct unnest(requested_members) as user_id) members;
end;
$$;

create or replace function public.set_lead_campaign(
  target_external_id text,
  target_campaign_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  lead_row public.leads%rowtype;
  previous_campaign uuid;
  campaign_name_value text;
  actor_name_value text;
begin
  select * into lead_row
  from public.leads
  where external_id = btrim(target_external_id) and deleted_at is null
  for update;
  if not found then raise exception 'Lead not found'; end if;
  if auth.uid() is null or not public.has_org_role(
    lead_row.organization_id,
    array['company_owner', 'organization_admin']::public.app_role[]
  ) then
    raise exception 'Only organization admins can change a lead campaign';
  end if;
  if target_campaign_id is not null then
    select name into campaign_name_value
    from public.campaigns
    where id = target_campaign_id and organization_id = lead_row.organization_id;
    if not found then raise exception 'Select a campaign from this organization'; end if;
  end if;
  previous_campaign := lead_row.campaign_id;
  if previous_campaign is not distinct from target_campaign_id then return; end if;

  update public.leads
  set campaign_id = target_campaign_id, updated_by = auth.uid(), updated_at = now()
  where id = lead_row.id;
  select full_name into actor_name_value from public.profiles where id = auth.uid();
  insert into public.lead_journey_events (
    organization_id, lead_id, event_type, previous_value, new_value, actor_id, actor_name, notes, idempotency_key
  ) values (
    lead_row.organization_id, lead_row.id, 'lead_campaign_changed',
    jsonb_build_object('campaign_id', previous_campaign),
    jsonb_build_object('campaign_id', target_campaign_id, 'campaign_name', campaign_name_value),
    auth.uid(), actor_name_value, 'Lead campaign updated',
    'campaign:' || lead_row.id || ':' || extract(epoch from clock_timestamp())::text
  );
end;
$$;

revoke all on function public.create_organization_campaign(uuid, text, text, uuid[]) from public, anon;
revoke all on function public.set_campaign_access(uuid, uuid[]) from public, anon;
revoke all on function public.set_lead_campaign(text, uuid) from public, anon;
grant execute on function public.create_organization_campaign(uuid, text, text, uuid[]) to authenticated;
grant execute on function public.set_campaign_access(uuid, uuid[]) to authenticated;
grant execute on function public.set_lead_campaign(text, uuid) to authenticated;

drop policy if exists leads_member_read on public.leads;
create policy leads_member_read on public.leads
for select using (
  public.is_org_member(organization_id)
  and (
    assigned_to = auth.uid()
    or public.has_org_role(organization_id, array['super_admin', 'company_owner', 'organization_admin', 'auditor']::public.app_role[])
    or (campaign_id is not null and public.has_campaign_access(campaign_id))
    or exists (
      select 1 from public.lead_shares s
      where s.lead_id = leads.id
        and s.shared_with = auth.uid()
        and s.starts_at <= now()
        and (s.expires_at is null or s.expires_at > now())
        and s.revoked_at is null
    )
    or (
      public.has_org_role(organization_id, array['manager']::public.app_role[])
      and team_id is not null
      and public.is_team_manager(team_id)
    )
  )
);

drop policy if exists leads_authorized_insert on public.leads;
create policy leads_authorized_insert on public.leads
for insert with check (
  public.is_org_member(organization_id)
  and public.has_org_role(organization_id, array['super_admin', 'company_owner', 'organization_admin', 'manager', 'agent']::public.app_role[])
  and (
    campaign_id is null
    or exists (
      select 1 from public.campaigns c
      where c.id = campaign_id
        and c.organization_id = leads.organization_id
        and public.has_campaign_access(c.id)
    )
  )
);

drop policy if exists leads_authorized_update on public.leads;
create policy leads_authorized_update on public.leads
for update using (
  public.is_org_member(organization_id)
  and (
    assigned_to = auth.uid()
    or public.has_org_role(organization_id, array['super_admin', 'company_owner', 'organization_admin', 'manager']::public.app_role[])
  )
)
with check (
  public.is_org_member(organization_id)
  and (
    campaign_id is null
    or exists (
      select 1 from public.campaigns c
      where c.id = campaign_id
        and c.organization_id = leads.organization_id
        and public.has_campaign_access(c.id)
    )
  )
);

notify pgrst, 'reload schema';
