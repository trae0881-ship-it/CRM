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

create or replace function public.has_campaign_access(target_campaign uuid)
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
      and m.user_id = auth.uid()
     and m.is_active
    where c.id = target_campaign
      and (
        m.role in ('company_owner', 'organization_admin')
        or exists (
          select 1 from public.campaign_members cm
          where cm.campaign_id = c.id and cm.user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.is_campaign_admin(target_campaign uuid)
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
      and m.user_id = auth.uid()
     and m.is_active
    where c.id = target_campaign
      and m.role in ('company_owner', 'organization_admin')
  );
$$;

revoke all on function public.has_campaign_access(uuid) from public, anon;
revoke all on function public.is_campaign_admin(uuid) from public, anon;
grant execute on function public.has_campaign_access(uuid) to authenticated;
grant execute on function public.is_campaign_admin(uuid) to authenticated;

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
  previous_campaign_name text;
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
  if previous_campaign is not null then
    select name into previous_campaign_name from public.campaigns
    where id = previous_campaign and organization_id = lead_row.organization_id;
  end if;

  update public.leads
  set campaign_id = target_campaign_id, updated_by = auth.uid(), updated_at = now()
  where id = lead_row.id;
  select full_name into actor_name_value from public.profiles where id = auth.uid();
  insert into public.lead_journey_events (
    organization_id, lead_id, event_type, previous_value, new_value, actor_id, actor_name, notes, idempotency_key
  ) values (
    lead_row.organization_id, lead_row.id, 'lead_campaign_changed',
    jsonb_build_object('campaign_id', previous_campaign, 'campaign_name', previous_campaign_name),
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

create or replace function public.enforce_campaign_lead_assignee_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assignee_role public.app_role;
begin
  if new.campaign_id is null or new.assigned_to is null then return new; end if;
  select role into assignee_role
  from public.organization_members
  where organization_id = new.organization_id
    and user_id = new.assigned_to
    and is_active;
  if assignee_role is null then
    raise exception 'Lead assignee must be an active member of this organization';
  end if;
  if assignee_role in ('company_owner', 'organization_admin') then return new; end if;
  if not exists (
    select 1 from public.campaign_members
    where campaign_id = new.campaign_id and user_id = new.assigned_to
  ) then
    raise exception 'Grant the assignee access to this campaign before assigning the lead';
  end if;
  if not exists (
    select 1 from public.campaigns
    where id = new.campaign_id and organization_id = new.organization_id
  ) then
    raise exception 'Lead campaign must belong to the same organization';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_campaign_lead_assignee_access() from public, anon, authenticated;
drop trigger if exists leads_enforce_campaign_assignee on public.leads;
create trigger leads_enforce_campaign_assignee
before insert or update of campaign_id, assigned_to on public.leads
for each row execute function public.enforce_campaign_lead_assignee_access();

create or replace function public.share_lead(
  target_lead uuid,
  target_user uuid,
  share_expires_at timestamptz,
  share_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  lead_row public.leads%rowtype;
  caller_role public.app_role;
  share_id uuid;
  caller_name text;
begin
  select * into lead_row from public.leads where id = target_lead and deleted_at is null for update;
  if not found then raise exception 'Lead not found'; end if;
  select role into caller_role from public.organization_members
  where organization_id = lead_row.organization_id and user_id = auth.uid() and is_active;
  if caller_role is null or (lead_row.assigned_to is distinct from auth.uid() and caller_role not in ('super_admin','company_owner','organization_admin','manager')) then
    raise exception 'You cannot share this lead';
  end if;
  select full_name into caller_name from public.profiles where id = auth.uid();
  if not exists (
    select 1 from public.organization_members
    where organization_id = lead_row.organization_id and user_id = target_user and is_active
      and role in ('agent','manager','organization_admin','company_owner')
  ) then
    raise exception 'The recipient is not an active salesperson in this organization';
  end if;
  if lead_row.campaign_id is not null and not exists (
    select 1
    from public.campaigns c
    join public.organization_members m on m.organization_id = c.organization_id and m.user_id = target_user and m.is_active
    where c.id = lead_row.campaign_id
      and (
        m.role in ('company_owner','organization_admin')
        or exists (select 1 from public.campaign_members cm where cm.campaign_id = c.id and cm.user_id = target_user)
      )
  ) then
    raise exception 'The recipient must be granted access to this campaign before the lead can be shared';
  end if;
  if exists (select 1 from public.lead_shares where lead_id = target_lead and shared_with = target_user and revoked_at is null) then
    raise exception 'An active share already exists';
  end if;
  insert into public.lead_shares (organization_id, lead_id, shared_with, shared_by, expires_at)
  values (lead_row.organization_id, target_lead, target_user, auth.uid(), share_expires_at)
  returning id into share_id;
  insert into public.lead_journey_events (organization_id, lead_id, event_type, new_value, actor_id, actor_name, notes, idempotency_key)
  values (lead_row.organization_id, target_lead, 'lead_shared', jsonb_build_object('shared_with', target_user, 'expires_at', share_expires_at), auth.uid(), caller_name, nullif(trim(share_reason), ''), 'share:' || share_id);
  return share_id;
end;
$$;

create or replace function public.transfer_lead(
  target_lead uuid,
  target_user uuid,
  transfer_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  lead_row public.leads%rowtype;
  caller_role public.app_role;
  old_owner uuid;
  caller_name text;
begin
  if nullif(trim(transfer_reason), '') is null then raise exception 'A transfer reason is required'; end if;
  select * into lead_row from public.leads where id = target_lead and deleted_at is null for update;
  if not found then raise exception 'Lead not found'; end if;
  old_owner := lead_row.assigned_to;
  select role into caller_role from public.organization_members
  where organization_id = lead_row.organization_id and user_id = auth.uid() and is_active;
  if caller_role is null or (old_owner is distinct from auth.uid() and caller_role not in ('super_admin','company_owner','organization_admin','manager')) then
    raise exception 'You cannot transfer this lead';
  end if;
  select full_name into caller_name from public.profiles where id = auth.uid();
  if not exists (
    select 1 from public.organization_members
    where organization_id = lead_row.organization_id and user_id = target_user and is_active
      and role in ('agent','manager','organization_admin','company_owner')
  ) then
    raise exception 'The recipient is not an active salesperson in this organization';
  end if;
  if lead_row.campaign_id is not null and not exists (
    select 1
    from public.campaigns c
    join public.organization_members m on m.organization_id = c.organization_id and m.user_id = target_user and m.is_active
    where c.id = lead_row.campaign_id
      and (
        m.role in ('company_owner','organization_admin')
        or exists (select 1 from public.campaign_members cm where cm.campaign_id = c.id and cm.user_id = target_user)
      )
  ) then
    raise exception 'Grant the recipient access to this campaign before transferring the lead';
  end if;
  update public.leads set assigned_to = target_user, original_assigned_to = coalesce(original_assigned_to, old_owner), updated_by = auth.uid(), updated_at = now() where id = target_lead;
  insert into public.lead_journey_events (organization_id, lead_id, event_type, previous_value, new_value, actor_id, actor_name, notes, previous_owner, new_owner, idempotency_key)
  values (lead_row.organization_id, target_lead, 'ownership_transferred', jsonb_build_object('assigned_to', old_owner), jsonb_build_object('assigned_to', target_user), auth.uid(), caller_name, trim(transfer_reason), old_owner, target_user, 'transfer:' || target_lead || ':' || extract(epoch from clock_timestamp())::bigint);
end;
$$;

create or replace function public.capture_lead_journey()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_name_value text;
  campaign_name_value text;
begin
  select full_name into actor_name_value from public.profiles where id = auth.uid();
  if tg_op = 'INSERT' then
    if new.campaign_id is not null then
      select name into campaign_name_value from public.campaigns where id = new.campaign_id;
    end if;
    insert into public.lead_journey_events (organization_id, lead_id, event_type, new_value, actor_id, actor_name, idempotency_key)
    values (
      new.organization_id, new.id, 'lead_created',
      jsonb_build_object('source', new.source, 'assigned_to', new.assigned_to, 'campaign_id', new.campaign_id, 'campaign_name', campaign_name_value),
      auth.uid(), actor_name_value, 'lead-created:' || new.id
    );
  elsif old.status is distinct from new.status then
    insert into public.lead_journey_events (organization_id, lead_id, event_type, previous_value, new_value, actor_id, actor_name, idempotency_key)
    values (
      new.organization_id, new.id, 'status_changed',
      jsonb_build_object('status', old.status), jsonb_build_object('status', new.status),
      auth.uid(), actor_name_value, 'status:' || new.id || ':' || extract(epoch from clock_timestamp())::text
    );
  elsif old.next_follow_up_at is distinct from new.next_follow_up_at then
    insert into public.lead_journey_events (organization_id, lead_id, event_type, previous_value, new_value, actor_id, actor_name, idempotency_key)
    values (
      new.organization_id, new.id, 'follow_up_scheduled',
      jsonb_build_object('next_follow_up_at', old.next_follow_up_at),
      jsonb_build_object('next_follow_up_at', new.next_follow_up_at),
      auth.uid(), actor_name_value, 'follow-up:' || new.id || ':' || extract(epoch from clock_timestamp())::text
    );
  end if;
  return new;
end;
$$;

drop policy if exists leads_member_read on public.leads;
create policy leads_member_read on public.leads
for select using (
  public.is_org_member(organization_id)
  and (campaign_id is null or public.has_campaign_access(campaign_id))
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
  and (campaign_id is null or public.has_campaign_access(campaign_id))
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

drop policy if exists lead_journey_read on public.lead_journey_events;
create policy lead_journey_read on public.lead_journey_events
for select using (
  public.is_org_member(organization_id)
  and exists (
    select 1 from public.leads l
    where l.id = lead_journey_events.lead_id
      and l.organization_id = lead_journey_events.organization_id
      and (l.campaign_id is null or public.has_campaign_access(l.campaign_id))
  )
);

notify pgrst, 'reload schema';
