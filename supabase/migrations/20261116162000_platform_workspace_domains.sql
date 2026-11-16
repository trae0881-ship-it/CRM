-- Extend the existing platform domain registry for verified workspace domains.
-- Existing global domains remain the fallback canonical host.

alter table public.platform_domains
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists requested_organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists domain_type text not null default 'custom_domain',
  add column if not exists description text not null default '',
  add column if not exists is_suspended boolean not null default false,
  add column if not exists suspended_at timestamptz;

alter table public.platform_domains
  drop constraint if exists platform_domains_domain_type_check,
  drop constraint if exists platform_domains_description_check;
alter table public.platform_domains
  add constraint platform_domains_domain_type_check
  check (domain_type in ('custom_domain', 'subdomain')),
  add constraint platform_domains_description_check
  check (char_length(description) <= 500);

create unique index if not exists platform_domains_one_workspace_idx
  on public.platform_domains (organization_id) where organization_id is not null;
create unique index if not exists platform_domains_one_requested_workspace_idx
  on public.platform_domains (requested_organization_id) where requested_organization_id is not null;

create or replace function public.create_platform_domain(
  target_hostname text,
  target_provider text,
  target_challenge text,
  target_domain_type text,
  target_description text,
  target_organization uuid,
  actor_user uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_domain jsonb;
  domain_row public.platform_domains%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
  if target_domain_type not in ('custom_domain', 'subdomain')
    or char_length(coalesce(target_description, '')) > 500 then
    raise exception 'Invalid domain details';
  end if;
  if target_organization is not null and not exists (
    select 1 from public.organizations
    where id = target_organization and is_active and approval_status = 'approved'
  ) then raise exception 'Workspace must be approved and active'; end if;

  created_domain := public.manage_platform_domain(
    'create', null, target_hostname, target_provider, target_challenge, null, null, actor_user
  );
  select * into domain_row
    from public.platform_domains
    where id = (created_domain ->> 'id')::uuid
    for update;
  update public.platform_domains
     set domain_type = target_domain_type,
         description = coalesce(target_description, ''),
         requested_organization_id = target_organization,
         updated_at = now()
   where id = domain_row.id
   returning * into domain_row;

  if target_domain_type <> 'custom_domain' or coalesce(target_description, '') <> ''
    or target_organization is not null then
    insert into public.platform_domain_audit (domain_id, actor_user_id, action, hostname, changes)
      values (domain_row.id, actor_user, 'updated', domain_row.hostname,
        jsonb_build_object(
          'domain_type', domain_row.domain_type,
          'description', domain_row.description,
          'requested_organization_id', domain_row.requested_organization_id
        ));
  end if;
  return to_jsonb(domain_row);
end;
$$;

create or replace function public.manage_platform_domain_workspace(
  action_name text,
  target_domain uuid,
  target_organization uuid,
  actor_user uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  domain_row public.platform_domains%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
  if actor_user is null then raise exception 'Actor is required'; end if;

  select * into domain_row
    from public.platform_domains
    where id = target_domain
    for update;
  if not found then raise exception 'Domain not found'; end if;

  if action_name = 'assign' then
    if domain_row.is_suspended or domain_row.verification_status <> 'active'
      or domain_row.dns_status <> 'verified' or domain_row.ssl_status <> 'verified' then
      raise exception 'Domain must pass DNS and HTTPS verification before assignment';
    end if;
    if target_organization is not null and not exists (
      select 1 from public.organizations
      where id = target_organization and is_active and approval_status = 'approved'
    ) then raise exception 'Workspace must be approved and active'; end if;
    update public.platform_domains
       set organization_id = target_organization,
           requested_organization_id = null,
           updated_at = now()
     where id = target_domain
     returning * into domain_row;
  elsif action_name = 'suspend' then
    update public.platform_domains
       set is_suspended = true,
           suspended_at = now(),
           is_primary = false,
           updated_at = now()
     where id = target_domain
     returning * into domain_row;
  elsif action_name = 'reactivate' then
    if domain_row.verification_status <> 'active' or domain_row.dns_status <> 'verified'
      or domain_row.ssl_status <> 'verified' then
      raise exception 'Domain must pass fresh DNS and HTTPS verification before reactivation';
    end if;
    update public.platform_domains
       set is_suspended = false, suspended_at = null, updated_at = now()
     where id = target_domain
     returning * into domain_row;
  else
    raise exception 'Unsupported workspace domain action';
  end if;

  insert into public.platform_domain_audit (domain_id, actor_user_id, action, hostname, changes)
    values (domain_row.id, actor_user, 'updated', domain_row.hostname,
      jsonb_build_object(
        'operation', action_name,
        'organization_id', domain_row.organization_id,
        'requested_organization_id', domain_row.requested_organization_id,
        'is_suspended', domain_row.is_suspended
      ));
  return to_jsonb(domain_row);
end;
$$;

create or replace function public.get_public_platform_domain_config()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select jsonb_build_object(
      'canonicalHostname', primary_domain.hostname,
      'activeHostnames', coalesce((
        select jsonb_agg(active_domain.hostname order by active_domain.hostname)
        from public.platform_domains active_domain
        where active_domain.verification_status = 'active'
          and active_domain.dns_status = 'verified'
          and active_domain.ssl_status = 'verified'
          and not active_domain.is_suspended
          and (active_domain.requested_organization_id is null or active_domain.organization_id is not null)
          and (active_domain.organization_id is null or exists (
            select 1 from public.organizations active_workspace
            where active_workspace.id = active_domain.organization_id
              and active_workspace.is_active and active_workspace.approval_status = 'approved'
          ))
      ), '[]'::jsonb),
      'organizationHostnames', coalesce((
        select jsonb_object_agg(workspace_domain.organization_id::text, workspace_domain.hostname)
        from public.platform_domains workspace_domain
        join public.organizations workspace on workspace.id = workspace_domain.organization_id
        where workspace_domain.verification_status = 'active'
          and workspace_domain.dns_status = 'verified'
          and workspace_domain.ssl_status = 'verified'
          and not workspace_domain.is_suspended
          and workspace.is_active
          and workspace.approval_status = 'approved'
      ), '{}'::jsonb),
      'redirectHttps', primary_domain.redirect_https,
      'redirectMode', primary_domain.redirect_mode
    )
    from public.platform_domains primary_domain
    where primary_domain.is_primary
      and primary_domain.organization_id is null
      and primary_domain.requested_organization_id is null
      and primary_domain.verification_status = 'active'
      and primary_domain.dns_status = 'verified'
      and primary_domain.ssl_status = 'verified'
      and not primary_domain.is_suspended
    limit 1
  ), jsonb_build_object(
    'canonicalHostname', null,
    'activeHostnames', coalesce((
      select jsonb_agg(active_domain.hostname order by active_domain.hostname)
      from public.platform_domains active_domain
      where active_domain.verification_status = 'active'
        and active_domain.dns_status = 'verified'
        and active_domain.ssl_status = 'verified'
        and not active_domain.is_suspended
        and (active_domain.requested_organization_id is null or active_domain.organization_id is not null)
        and (active_domain.organization_id is null or exists (
          select 1 from public.organizations active_workspace
          where active_workspace.id = active_domain.organization_id
            and active_workspace.is_active and active_workspace.approval_status = 'approved'
        ))
    ), '[]'::jsonb),
    'organizationHostnames', coalesce((
      select jsonb_object_agg(workspace_domain.organization_id::text, workspace_domain.hostname)
      from public.platform_domains workspace_domain
      join public.organizations workspace on workspace.id = workspace_domain.organization_id
      where workspace_domain.verification_status = 'active'
        and workspace_domain.dns_status = 'verified'
        and workspace_domain.ssl_status = 'verified'
        and not workspace_domain.is_suspended
        and workspace.is_active
        and workspace.approval_status = 'approved'
    ), '{}'::jsonb)
  ));
$$;

revoke all on function public.create_platform_domain(text, text, text, text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.manage_platform_domain_workspace(text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_platform_domain(text, text, text, text, text, uuid, uuid) to service_role;
grant execute on function public.manage_platform_domain_workspace(text, uuid, uuid, uuid) to service_role;
revoke all on function public.get_public_platform_domain_config() from public;
grant execute on function public.get_public_platform_domain_config() to anon, authenticated, service_role;
