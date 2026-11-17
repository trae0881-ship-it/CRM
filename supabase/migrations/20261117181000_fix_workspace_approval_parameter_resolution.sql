create or replace function public.platform_decide_workspace_request(
  target_request uuid,
  decision_name text,
  target_plan uuid default null,
  target_billing_period text default 'monthly',
  target_subscription_status text default 'trialing',
  target_salesperson_limit integer default null,
  target_period_start timestamptz default null,
  target_period_end timestamptz default null,
  manual_payment_confirmed boolean default false,
  manual_payment_amount numeric default null,
  manual_payment_currency text default null,
  manual_payment_reference text default null,
  admin_message text default null,
  rejection_reason text default null
)
returns public.workspace_requests
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  request_row public.workspace_requests; plan_row public.subscription_plans;
  new_org public.organizations; new_sub public.subscriptions;
  period_start timestamptz := coalesce(target_period_start, now());
  period_end timestamptz; expected_amount numeric; requester_name text;
  slug_base text; generated_slug text;
  request_admin_message text := admin_message;
  request_rejection_reason text := rejection_reason;
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator permission required'; end if;
  select * into request_row from public.workspace_requests where id = target_request for update;
  if request_row.id is null or request_row.status not in ('pending', 'information_requested') then
    raise exception 'Workspace request is not open';
  end if;
  if decision_name = 'information_requested' then
    if nullif(trim(request_admin_message), '') is null then raise exception 'A message is required when requesting more information'; end if;
    update public.workspace_requests set status = 'information_requested', admin_message = trim(request_admin_message),
      decision_by = auth.uid(), decision_at = now(), updated_at = now()
      where id = target_request returning * into request_row;
  elsif decision_name = 'reject' then
    if nullif(trim(request_rejection_reason), '') is null then raise exception 'A rejection reason is required'; end if;
    update public.workspace_requests set status = 'rejected', rejection_reason = trim(request_rejection_reason),
      admin_message = nullif(trim(request_admin_message), ''), decision_by = auth.uid(), decision_at = now(), updated_at = now()
      where id = target_request returning * into request_row;
  elsif decision_name = 'approve' then
    if target_billing_period not in ('monthly', 'quarterly', 'half_yearly', 'yearly')
      or target_subscription_status not in ('active', 'trialing') then
      raise exception 'Invalid billing period or subscription status';
    end if;
    if target_salesperson_limit is not null and target_salesperson_limit < 0 then raise exception 'Salesperson limit must not be negative'; end if;
    select * into plan_row from public.subscription_plans where id = coalesce(target_plan, request_row.requested_plan_id) and is_active;
    if plan_row.id is null then raise exception 'Select an active subscription plan'; end if;
    if target_subscription_status = 'trialing' then
      if plan_row.trial_days < 1 then raise exception 'This plan has no configured trial period'; end if;
      period_end := period_start + make_interval(days => plan_row.trial_days);
    else
      period_end := coalesce(target_period_end, period_start + case target_billing_period
        when 'monthly' then interval '1 month'
        when 'quarterly' then interval '3 months'
        when 'half_yearly' then interval '6 months'
        when 'yearly' then interval '1 year'
      end);
      if period_end <= period_start then raise exception 'Subscription end must be after its start'; end if;
      expected_amount := case target_billing_period
        when 'monthly' then plan_row.price_monthly
        when 'quarterly' then plan_row.price_quarterly
        when 'half_yearly' then plan_row.price_half_yearly
        when 'yearly' then plan_row.price_yearly
      end;
      if expected_amount > 0 then
        if not manual_payment_confirmed then raise exception 'Paid activation requires explicit manual payment confirmation'; end if;
        if plan_row.currency_code is null or manual_payment_currency is distinct from plan_row.currency_code then
          raise exception 'Manual payment currency must match the configured plan currency';
        end if;
        if manual_payment_amount is distinct from expected_amount then raise exception 'Manual payment amount must match the configured billing price'; end if;
        if nullif(trim(manual_payment_reference), '') is null or char_length(trim(manual_payment_reference)) > 160 then
          raise exception 'A valid payment reference is required';
        end if;
      elsif manual_payment_confirmed then
        raise exception 'Manual payment confirmation is not applicable to a free plan';
      end if;
    end if;
    select p.full_name into requester_name from public.profiles p where p.id = request_row.requested_by;
    slug_base := lower(regexp_replace(trim(request_row.workspace_name), '[^a-zA-Z0-9]+', '-', 'g'));
    slug_base := trim(both '-' from slug_base);
    if slug_base = '' then slug_base := 'workspace'; end if;
    generated_slug := left(slug_base, 48) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
    insert into public.organizations (name, slug, workspace_name, is_active, approval_status)
      values (request_row.company_name, generated_slug, request_row.workspace_name, true, 'approved')
      returning * into new_org;
    insert into public.organization_members (organization_id, user_id, role, is_active)
      values (new_org.id, request_row.requested_by, 'company_owner', true)
      on conflict (organization_id, user_id) do update set role = 'company_owner', is_active = true;
    insert into public.subscriptions (
      organization_id, plan_id, status, trial_ends_at, current_period_start, current_period_end,
      billing_period, has_custom_salesperson_limit, salesperson_limit_override
    ) values (
      new_org.id, plan_row.id, target_subscription_status,
      case when target_subscription_status = 'trialing' then period_end else null end,
      period_start, period_end, target_billing_period,
      target_salesperson_limit is not null, target_salesperson_limit
    ) returning * into new_sub;
    if target_salesperson_limit is not null then
      insert into public.subscription_salesperson_limit_history (
        organization_id, subscription_id, actor_id, previous_limit, next_limit, reason
      ) values (new_org.id, new_sub.id, auth.uid(), plan_row.max_salespeople, target_salesperson_limit, 'Workspace approval');
    end if;
    if target_subscription_status = 'active' and expected_amount > 0 then
      insert into public.invoices (organization_id, subscription_id, amount, status, due_at, paid_at, currency_code, billing_period)
        values (new_org.id, new_sub.id, expected_amount, 'paid', period_end, now(), plan_row.currency_code, target_billing_period);
      insert into public.payments (
        organization_id, invoice_id, amount, status, currency_code, verification_method,
        external_reference, verified_by, verified_at
      ) values (
        new_org.id, (select i.id from public.invoices i where i.organization_id = new_org.id order by i.created_at desc limit 1),
        expected_amount, 'succeeded', plan_row.currency_code, 'manual', trim(manual_payment_reference), auth.uid(), now()
      );
    end if;
    update public.workspace_requests set status = 'approved', organization_id = new_org.id,
      approved_plan_id = plan_row.id, admin_message = nullif(trim(request_admin_message), ''),
      decision_by = auth.uid(), decision_at = now(), updated_at = now()
      where id = target_request returning * into request_row;
    insert into public.subscription_history (
      organization_id, subscription_id, actor_id, action, next_plan_id, next_status, metadata
    ) values (new_org.id, new_sub.id, auth.uid(), 'workspace_approved', plan_row.id, target_subscription_status,
      jsonb_build_object('billing_period', target_billing_period, 'manual_payment_confirmed', manual_payment_confirmed,
        'salesperson_limit_override', target_salesperson_limit, 'request_id', target_request,
        'owner_name', requester_name));
    insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
      values (new_org.id, auth.uid(), 'workspace_approved', 'organization', new_org.id,
        jsonb_build_object('request_id', target_request, 'plan_id', plan_row.id, 'status', target_subscription_status));
  else
    raise exception 'Invalid workspace request decision';
  end if;
  if decision_name <> 'approve' then
    insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
      values (null, auth.uid(), 'workspace_request_' || decision_name, 'workspace_request', target_request,
        jsonb_build_object('message', coalesce(request_admin_message, request_rejection_reason)));
  end if;
  return request_row;
end;
$$;
