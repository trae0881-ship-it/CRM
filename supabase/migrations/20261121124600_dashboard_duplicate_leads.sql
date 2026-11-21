create or replace function public.get_organization_duplicate_leads(
  target_organization uuid,
  result_limit integer default 8
)
returns table (duplicate_lead_count bigint, duplicate_leads jsonb)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if not public.is_org_member(target_organization) then
    raise exception 'Active organization membership required';
  end if;

  return query
  with active_leads as (
    select l.id, l.external_id, l.full_name, l.phone, l.email, l.source, l.created_at
    from public.leads l
    where l.organization_id = target_organization
      and l.deleted_at is null
  ),
  matching_keys as (
    select l.id, 'email:' || lower(btrim(l.email)) as match_key
    from active_leads l
    where nullif(btrim(l.email), '') is not null
    union all
    select l.id, 'phone:' || regexp_replace(l.phone, '[^0-9+]', '', 'g') as match_key
    from active_leads l
    where length(regexp_replace(coalesce(l.phone, ''), '[^0-9]', '', 'g')) >= 7
  ),
  duplicate_ids as (
    select distinct matching_keys.id
    from matching_keys
    join (
      select match_key
      from matching_keys
      group by match_key
      having count(distinct id) > 1
    ) duplicated_keys using (match_key)
  ),
  duplicate_summary as (
    select count(*)::bigint as total from duplicate_ids
  ),
  duplicate_preview as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', preview.id,
          'external_id', preview.external_id,
          'full_name', preview.full_name,
          'phone', preview.phone,
          'email', preview.email,
          'source', preview.source
        )
        order by preview.created_at desc
      ),
      '[]'::jsonb
    ) as leads
    from (
      select l.id, l.external_id, l.full_name, l.phone, l.email, l.source, l.created_at
      from active_leads l
      join duplicate_ids d on d.id = l.id
      order by l.created_at desc
      limit greatest(1, least(coalesce(result_limit, 8), 20))
    ) preview
  )
  select duplicate_summary.total, duplicate_preview.leads
  from duplicate_summary
  cross join duplicate_preview;
end;
$$;

revoke all on function public.get_organization_duplicate_leads(uuid, integer) from public, anon;
grant execute on function public.get_organization_duplicate_leads(uuid, integer) to authenticated;
notify pgrst, 'reload schema';
