import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("campaign access is admin-managed and grants campaign leads through RLS", async () => {
  const migration = await readFile(path.join(root, "supabase/migrations/20261121143000_campaign_access_and_lead_links.sql"), "utf8");
  assert.match(migration, /create table if not exists public\.campaign_members/);
  assert.match(migration, /create or replace function public\.has_campaign_access/);
  assert.match(migration, /m\.role in \('company_owner', 'organization_admin'\)/);
  assert.match(migration, /create or replace function public\.set_campaign_access/);
  assert.match(migration, /create or replace function public\.set_lead_campaign/);
  assert.match(migration, /'lead_campaign_changed'/);
  assert.match(migration, /'campaign_name', campaign_name_value/);
  assert.match(migration, /campaign_id is null or public\.has_campaign_access\(campaign_id\)/);
  assert.match(migration, /The recipient must be granted access to this campaign before the lead can be shared/);
  assert.match(migration, /Grant the recipient access to this campaign before transferring the lead/);
  assert.match(migration, /create policy lead_journey_read[\s\S]*?public\.has_campaign_access\(l\.campaign_id\)/);
  assert.match(migration, /revoke all on public\.campaign_members from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.create_organization_campaign/);
});

test("campaign page supports admin creation and member access management", async () => {
  const app = await readFile(path.join(root, "src/App.tsx"), "utf8");
  const component = await readFile(path.join(root, "src/components/CampaignManagementView.tsx"), "utf8");
  const service = await readFile(path.join(root, "src/services/campaigns.ts"), "utf8");
  assert.match(app, /CampaignManagementView membership=\{membership\}/);
  assert.match(app, /CAMPAIGN<\/th>/);
  assert.match(app, /canManageCampaigns=\{membership\?\.role === "company_owner" \|\| membership\?\.role === "organization_admin"\}/);
  assert.match(app, /name="campaign_id"/);
  assert.match(component, /Who can access this campaign's leads\?/);
  assert.match(component, /Only active members of this organization can be selected/);
  assert.match(service, /rpc\("create_organization_campaign"/);
  assert.match(service, /rpc\("set_campaign_access"/);
  assert.match(service, /rpc\("set_lead_campaign"/);
});

test("campaign page lists and adds existing leads and links campaign-scoped Google Sheets", async () => {
  const component = await readFile(path.join(root, "src/components/CampaignManagementView.tsx"), "utf8");
  const service = await readFile(path.join(root, "src/services/campaigns.ts"), "utf8");
  assert.match(component, /Add an existing lead/);
  assert.match(component, /Google Sheet/);
  assert.match(component, /GoogleSheetsView membership=\{membership\} campaignId=\{sheetsCampaign\.id\}/);
  assert.match(service, /listCampaignLeads/);
  assert.match(service, /searchCampaignLeadCandidates/);
  assert.match(service, /\.rpc\("set_lead_campaign"/);
  assert.match(service, /\.range\(\(page - 1\) \* pageSize, page \* pageSize - 1\)/);
  assert.match(service, /count: "exact"/);
  assert.match(component, /campaign-pagination/);
  assert.match(component, /Page \{page\} of \{totalPages\}/);
});
