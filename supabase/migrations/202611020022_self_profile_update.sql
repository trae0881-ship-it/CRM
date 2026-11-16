-- Allow authenticated users to update only their own display name and avatar URL.
create or replace function public.update_own_profile(
  target_full_name text,
  target_avatar_url text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.profiles;
  normalized_name text := nullif(trim(target_full_name), '');
  normalized_avatar text := nullif(trim(target_avatar_url), '');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if normalized_name is null or length(normalized_name) > 100 then
    raise exception 'Full name must contain between 1 and 100 characters';
  end if;
  if normalized_avatar is not null and (
    length(normalized_avatar) > 2048
    or normalized_avatar !~* '^https://[^[:space:]]+$'
  ) then
    raise exception 'Profile photo must be a valid HTTPS URL';
  end if;

  insert into public.profiles (id, full_name, avatar_url, updated_at)
  values (auth.uid(), normalized_name, normalized_avatar, now())
  on conflict (id) do update
    set full_name = excluded.full_name,
        avatar_url = excluded.avatar_url,
        updated_at = now()
  returning * into result;
  return result;
end;
$$;

revoke all on function public.update_own_profile(text, text) from public, anon;
grant execute on function public.update_own_profile(text, text) to authenticated;
