-- Public enquiries are written by the server-side API only. Do not grant
-- anonymous browser access to the contact records or their personal data.

create table if not exists public.contact_submissions (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 2 and 120),
  mobile text not null check (char_length(mobile) between 10 and 16),
  email text not null check (char_length(email) between 3 and 254),
  company text check (company is null or char_length(company) <= 160),
  subject text not null check (char_length(subject) between 2 and 160),
  message text not null check (char_length(message) between 10 and 4000),
  status text not null default 'new' check (status in ('new', 'in_progress', 'responded', 'resolved', 'spam')),
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contact_submissions_email_created_idx
  on public.contact_submissions (email, created_at desc);
create index if not exists contact_submissions_status_created_idx
  on public.contact_submissions (status, created_at desc);

alter table public.contact_submissions enable row level security;
revoke all on public.contact_submissions from public, anon, authenticated;
grant all on public.contact_submissions to service_role;

create or replace function public.update_contact_submission_timestamp()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.update_contact_submission_timestamp() from public, anon, authenticated;
drop trigger if exists contact_submissions_updated_at on public.contact_submissions;
create trigger contact_submissions_updated_at
before update on public.contact_submissions
for each row execute function public.update_contact_submission_timestamp();

drop trigger if exists enqueue_mysql_sync_change_trigger on public.contact_submissions;
create trigger enqueue_mysql_sync_change_trigger
after insert or update or delete on public.contact_submissions
for each row execute function public.enqueue_mysql_sync_change();
