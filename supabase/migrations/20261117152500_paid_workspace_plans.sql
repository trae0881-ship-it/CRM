-- New workspace requests may only select an active, priced subscription plan.
create or replace function public.create_workspace_request(
  target_full_name text,
  target_company_name text,
  target_workspace_name text,
  target_phone text,
  target_plan_id uuid,
  target_additional_information text default ''
)
returns public.workspace_requests
language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare requester uuid := auth.uid(); request_row public.workspace_requests;
begin
  if requester is null then raise exception 'Sign in before requesting a workspace'; end if;
  if not exists (select 1 from auth.users u where u.id = requester and u.email_confirmed_at is not null) then
    raise exception 'Confirm your email address before requesting a workspace';
  end if;
  if char_length(trim(target_full_name)) not between 2 and 100
    or char_length(trim(target_company_name)) not between 2 and 160
    or char_length(trim(target_workspace_name)) not between 2 and 160
    or char_length(trim(target_phone)) not between 7 and 32
    or char_length(coalesce(target_additional_information, '')) > 2000 then
    raise exception 'Enter valid company, workspace, phone, and additional information';
  end if;
  if not exists (
    select 1 from public.subscription_plans p
    where p.id = target_plan_id and p.is_active
      and (p.price_monthly > 0 or p.price_quarterly > 0 or p.price_half_yearly > 0 or p.price_yearly > 0)
  ) then
    raise exception 'Select an active paid subscription plan';
  end if;
  if exists (select 1 from public.organization_members m where m.user_id = requester and m.is_active) then
    raise exception 'This account already has an active organization membership';
  end if;
  insert into public.profiles (id, full_name, phone)
  values (requester, trim(target_full_name), trim(target_phone))
  on conflict (id) do update set phone = excluded.phone, full_name = excluded.full_name;
  insert into public.workspace_requests (
    requested_by, company_name, workspace_name, contact_phone, requested_plan_id, additional_information
  ) values (
    requester, trim(target_company_name), trim(target_workspace_name), trim(target_phone),
    target_plan_id, coalesce(trim(target_additional_information), '')
  ) returning * into request_row;
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
    values (null, requester, 'workspace_request_submitted', 'workspace_request', request_row.id,
      jsonb_build_object('company_name', request_row.company_name, 'requested_plan_id', target_plan_id));
  return request_row;
end $$;

revoke all on function public.create_workspace_request(text,text,text,text,uuid,text) from public, anon;
grant execute on function public.create_workspace_request(text,text,text,text,uuid,text) to authenticated;
