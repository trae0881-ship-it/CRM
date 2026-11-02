-- Corrective Phase 4 policies. Review and apply after migrations 001-010.

drop policy if exists calls_agent_insert on public.calls;
create policy calls_authorized_insert on public.calls for insert with check (
  public.is_org_member(organization_id)
  and agent_id = auth.uid()
  and public.has_org_role(organization_id, array['company_owner','organization_admin','manager','agent']::public.app_role[])
  and exists (
    select 1 from public.leads l
    where l.id = lead_id
      and l.organization_id = calls.organization_id
      and (
        l.assigned_to = auth.uid()
        or exists (
          select 1 from public.lead_shares s
          where s.lead_id = l.id and s.shared_with = auth.uid() and s.revoked_at is null
            and s.starts_at <= now() and (s.expires_at is null or s.expires_at > now())
        )
        or public.has_org_role(l.organization_id, array['company_owner','organization_admin','manager']::public.app_role[])
      )
  )
);

drop policy if exists visits_authorized_all on public.site_visits;
create policy visits_authorized_all on public.site_visits for all using (
  public.is_org_member(organization_id)
  and (
    assigned_to = auth.uid()
    or public.has_org_role(organization_id, array['company_owner','organization_admin','manager','auditor']::public.app_role[])
  )
) with check (
  public.is_org_member(organization_id)
  and exists (
    select 1 from public.leads l
    where l.id = lead_id and l.organization_id = site_visits.organization_id
      and (
        assigned_to = auth.uid()
        or l.assigned_to = auth.uid()
        or public.has_org_role(site_visits.organization_id, array['company_owner','organization_admin','manager']::public.app_role[])
      )
  )
);

drop policy if exists bookings_authorized_all on public.bookings;
create policy bookings_authorized_all on public.bookings for all using (
  public.is_org_member(organization_id)
  and (
    owner_id = auth.uid()
    or public.has_org_role(organization_id, array['company_owner','organization_admin','manager','auditor']::public.app_role[])
  )
) with check (
  public.is_org_member(organization_id)
  and exists (
    select 1 from public.leads l
    where l.id = lead_id and l.organization_id = bookings.organization_id
      and (
        owner_id = auth.uid()
        or l.assigned_to = auth.uid()
        or public.has_org_role(bookings.organization_id, array['company_owner','organization_admin','manager']::public.app_role[])
      )
  )
  and payment_amount >= 0
  and pending_amount >= 0
  and payment_amount <= coalesce(value, 0)
);

create or replace function public.record_booking_payment(
  target_booking uuid,
  payment numeric
) returns void language plpgsql security definer set search_path = public as $$
declare booking_row public.bookings%rowtype;
begin
  select * into booking_row from public.bookings where id = target_booking for update;
  if not found then raise exception 'Booking not found'; end if;
  if not public.has_org_role(booking_row.organization_id, array['company_owner','organization_admin','manager']::public.app_role[])
    and booking_row.owner_id is distinct from auth.uid() then
    raise exception 'You cannot update this booking';
  end if;
  if payment < 0 or payment > coalesce(booking_row.value, 0) then raise exception 'Payment exceeds booking amount'; end if;
  update public.bookings
    set payment_amount = payment,
        pending_amount = coalesce(value, 0) - payment,
        updated_at = now(),
        status = case when payment = coalesce(value, 0) then 'completed' else status end
    where id = target_booking;
end $$;
grant execute on function public.record_booking_payment(uuid,numeric) to authenticated;
