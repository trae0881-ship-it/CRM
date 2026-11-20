alter table public.google_sheet_integrations
  add column if not exists agency_name text;

drop index if exists public.google_sheet_org_spreadsheet_idx;
create unique index google_sheet_org_spreadsheet_idx
  on public.google_sheet_integrations (organization_id, spreadsheet_id, worksheet_id)
  where worksheet_id is not null;
