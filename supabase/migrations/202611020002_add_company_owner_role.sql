-- Enum values must be committed before policies can cast to the new value.
alter type public.app_role add value if not exists 'company_owner';
