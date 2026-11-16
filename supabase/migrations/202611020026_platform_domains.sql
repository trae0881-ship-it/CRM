-- Global custom-domain settings. Apply only after the staging project and migration
-- history are confirmed; secrets and hosting-provider credentials are not stored here.

create table if not exists public.platform_domains (
  id uuid primary key default gen_random_uuid(),
  hostname text not null unique,
  provider text not null check (provider in ('hostinger', 'vercel', 'railway', 'other')),
  is_primary boolean not null default false,
  verification_status text not null default 'pending_dns'
    check (verification_status in ('pending_dns', 'dns_verified', 'ssl_pending', 'active', 'verification_failed')),
  dns_status text not null default 'pending'
    check (dns_status in ('pending', 'verified', 'failed')),
  ssl_status text not null default 'pending'
    check (ssl_status in ('pending', 'verified', 'failed')),
  dns_challenge text not null,
  redirect_https boolean not null default true,
  redirect_mode text not null default 'none'
    check (redirect_mode in ('none', 'www_to_root', 'root_to_www')),
  last_verification_at timestamptz,
  verified_at timestamptz,
  last_error_code text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (hostname = lower(hostname))
);

create unique index if not exists platform_domains_one_primary_idx
  on public.platform_domains (is_primary) where is_primary;
create index if not exists platform_domains_verification_idx
  on public.platform_domains (verification_status, updated_at desc);

create table if not exists public.platform_domain_audit (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid not null,
  actor_user_id uuid not null,
  action text not null check (action in ('created', 'updated', 'primary_changed', 'deleted', 'verified')),
  hostname text not null,
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists platform_domain_audit_created_idx
  on public.platform_domain_audit (created_at desc);
create index if not exists platform_domain_audit_domain_idx
  on public.platform_domain_audit (domain_id, created_at desc);

alter table public.platform_domains enable row level security;
alter table public.platform_domain_audit enable row level security;
revoke all on public.platform_domains from public, anon, authenticated;
revoke all on public.platform_domain_audit from public, anon, authenticated;
grant all on public.platform_domains to service_role;
grant all on public.platform_domain_audit to service_role;

create or replace function public.manage_platform_domain(
  action_name text,
  target_domain uuid,
  target_hostname text,
  target_provider text,
  target_challenge text,
  target_redirect_https boolean,
  target_redirect_mode text,
  actor_user uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  domain_row public.platform_domains%rowtype;
  old_hostname text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
  if actor_user is null then raise exception 'Actor is required'; end if;

  if action_name = 'create' then
    if target_hostname is null or target_provider not in ('hostinger', 'vercel', 'railway', 'other')
      or target_challenge is null then raise exception 'Invalid domain settings'; end if;
    insert into public.platform_domains (hostname, provider, dns_challenge, created_by)
      values (target_hostname, target_provider, target_challenge, actor_user)
      returning * into domain_row;
    insert into public.platform_domain_audit (domain_id, actor_user_id, action, hostname, changes)
      values (domain_row.id, actor_user, 'created', domain_row.hostname,
        jsonb_build_object('provider', domain_row.provider));
    return to_jsonb(domain_row);
  elsif action_name = 'update' then
    select * into domain_row from public.platform_domains where id = target_domain for update;
    if not found then raise exception 'Domain not found'; end if;
    old_hostname := domain_row.hostname;
    if target_hostname is not null and target_hostname <> domain_row.hostname then
      if target_challenge is null then raise exception 'A fresh DNS challenge is required'; end if;
      domain_row.hostname := target_hostname;
      domain_row.dns_challenge := target_challenge;
      domain_row.dns_status := 'pending';
      domain_row.ssl_status := 'pending';
      domain_row.verification_status := 'pending_dns';
      domain_row.last_verification_at := null;
      domain_row.verified_at := null;
      domain_row.last_error_code := null;
    end if;
    if target_provider is not null then
      if target_provider not in ('hostinger', 'vercel', 'railway', 'other') then raise exception 'Invalid provider'; end if;
      domain_row.provider := target_provider;
    end if;
    update public.platform_domains
       set hostname = domain_row.hostname, dns_challenge = domain_row.dns_challenge,
           dns_status = domain_row.dns_status, ssl_status = domain_row.ssl_status,
           verification_status = domain_row.verification_status,
           last_verification_at = domain_row.last_verification_at, verified_at = domain_row.verified_at,
           last_error_code = domain_row.last_error_code, provider = domain_row.provider,
           updated_at = now()
     where id = target_domain returning * into domain_row;
    insert into public.platform_domain_audit (domain_id, actor_user_id, action, hostname, changes)
      values (domain_row.id, actor_user, 'updated', domain_row.hostname,
        jsonb_build_object('previous_hostname', old_hostname, 'provider', domain_row.provider));
    return to_jsonb(domain_row);
  elsif action_name = 'set_primary' then
    select * into domain_row from public.platform_domains where id = target_domain for update;
    if not found then raise exception 'Domain not found'; end if;
    if domain_row.verification_status <> 'active' or domain_row.dns_status <> 'verified'
      or domain_row.ssl_status <> 'verified' then raise exception 'Domain must pass DNS and HTTPS verification before becoming primary'; end if;
    update public.platform_domains set is_primary = false, updated_at = now() where is_primary;
    update public.platform_domains
       set is_primary = true, redirect_https = coalesce(target_redirect_https, true),
           redirect_mode = coalesce(target_redirect_mode, 'none'), updated_at = now()
     where id = target_domain returning * into domain_row;
    if domain_row.redirect_mode not in ('none', 'www_to_root', 'root_to_www') then raise exception 'Invalid redirect mode'; end if;
    insert into public.platform_domain_audit (domain_id, actor_user_id, action, hostname, changes)
      values (domain_row.id, actor_user, 'primary_changed', domain_row.hostname,
        jsonb_build_object('redirect_https', domain_row.redirect_https, 'redirect_mode', domain_row.redirect_mode));
    return to_jsonb(domain_row);
  elsif action_name = 'update_redirects' then
    select * into domain_row from public.platform_domains where is_primary for update;
    if not found then raise exception 'An active primary domain is required'; end if;
    if target_redirect_mode not in ('none', 'www_to_root', 'root_to_www') then raise exception 'Invalid redirect mode'; end if;
    update public.platform_domains
       set redirect_https = coalesce(target_redirect_https, redirect_https),
           redirect_mode = target_redirect_mode, updated_at = now()
     where id = domain_row.id returning * into domain_row;
    insert into public.platform_domain_audit (domain_id, actor_user_id, action, hostname, changes)
      values (domain_row.id, actor_user, 'updated', domain_row.hostname,
        jsonb_build_object('redirect_https', domain_row.redirect_https, 'redirect_mode', domain_row.redirect_mode));
    return to_jsonb(domain_row);
  elsif action_name = 'delete' then
    select * into domain_row from public.platform_domains where id = target_domain for update;
    if not found then raise exception 'Domain not found'; end if;
    insert into public.platform_domain_audit (domain_id, actor_user_id, action, hostname, changes)
      values (domain_row.id, actor_user, 'deleted', domain_row.hostname,
        jsonb_build_object('was_primary', domain_row.is_primary, 'verification_status', domain_row.verification_status));
    delete from public.platform_domains where id = target_domain;
    return to_jsonb(domain_row);
  else
    raise exception 'Unsupported domain action';
  end if;
end;
$$;

create or replace function public.record_platform_domain_verification(
  target_domain uuid,
  dns_verified boolean,
  https_verified boolean,
  verification_failed boolean,
  error_code text,
  response_status integer,
  actor_user uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  domain_row public.platform_domains%rowtype;
  next_status text;
  next_dns text;
  next_ssl text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
  if actor_user is null then raise exception 'Actor is required'; end if;
  select * into domain_row from public.platform_domains where id = target_domain for update;
  if not found then raise exception 'Domain not found'; end if;
  next_dns := case when dns_verified then 'verified' when verification_failed then 'failed' else 'pending' end;
  next_ssl := case when https_verified then 'verified' when verification_failed and dns_verified then 'failed' else 'pending' end;
  next_status := case
    when verification_failed then 'verification_failed'
    when dns_verified and https_verified then 'active'
    when dns_verified then 'ssl_pending'
    else 'pending_dns'
  end;
  update public.platform_domains
     set dns_status = next_dns, ssl_status = next_ssl, verification_status = next_status,
         last_verification_at = now(), verified_at = case when next_status = 'active' then now() else null end,
         last_error_code = left(nullif(error_code, ''), 96), updated_at = now()
   where id = target_domain returning * into domain_row;
  insert into public.platform_domain_audit (domain_id, actor_user_id, action, hostname, changes)
    values (domain_row.id, actor_user, 'verified', domain_row.hostname,
      jsonb_build_object('dns_status', domain_row.dns_status, 'ssl_status', domain_row.ssl_status,
                         'verification_status', domain_row.verification_status, 'http_status', response_status,
                         'error_code', domain_row.last_error_code));
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
      ), '[]'::jsonb),
      'redirectHttps', primary_domain.redirect_https,
      'redirectMode', primary_domain.redirect_mode
    )
    from public.platform_domains primary_domain
    where primary_domain.is_primary and primary_domain.verification_status = 'active'
    limit 1
  ), '{}'::jsonb);
$$;

revoke all on function public.manage_platform_domain(text, uuid, text, text, text, boolean, text, uuid) from public, anon, authenticated;
revoke all on function public.record_platform_domain_verification(uuid, boolean, boolean, boolean, text, integer, uuid) from public, anon, authenticated;
revoke all on function public.get_public_platform_domain_config() from public;
grant execute on function public.manage_platform_domain(text, uuid, text, text, text, boolean, text, uuid) to service_role;
grant execute on function public.record_platform_domain_verification(uuid, boolean, boolean, boolean, text, integer, uuid) to service_role;
grant execute on function public.get_public_platform_domain_config() to anon, authenticated, service_role;

drop trigger if exists enqueue_mysql_sync_change_trigger on public.platform_domains;
create trigger enqueue_mysql_sync_change_trigger
  after insert or update or delete on public.platform_domains
  for each row execute function public.enqueue_mysql_sync_change();

drop trigger if exists enqueue_mysql_sync_change_trigger on public.platform_domain_audit;
create trigger enqueue_mysql_sync_change_trigger
  after insert or update or delete on public.platform_domain_audit
  for each row execute function public.enqueue_mysql_sync_change();
