-- Organization members can view all active leads in their own workspace.
-- Owners/admins retain broader edit and transfer permissions through existing policies/functions.

drop policy if exists leads_member_read on public.leads;
create policy leads_member_read on public.leads for select
using (
  public.is_org_member(organization_id)
);
