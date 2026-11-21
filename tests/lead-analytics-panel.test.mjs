import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("organization sales reports include the image-style lead analytics panel", async () => {
  const operations = await readFile(path.join(root, "src/components/OperationsViews.tsx"), "utf8");
  assert.match(operations, /LeadAnalyticsPanel rows=\{filtered\}/);
  assert.match(operations, /Organization and sales-team lead analytics/);
});

test("SaaS dashboard loads platform-wide lead analytics through an authorized RPC", async () => {
  const platformView = await readFile(path.join(root, "src/components/PlatformAdminView.tsx"), "utf8");
  const platformService = await readFile(path.join(root, "src/services/platform.ts"), "utf8");
  const migration = await readFile(path.join(root, "supabase/migrations/20261121133000_platform_lead_analytics.sql"), "utf8");
  assert.match(platformView, /getPlatformLeadAnalytics/);
  assert.match(platformView, /LeadAnalyticsPanel platform=\{leadAnalytics\}/);
  assert.match(platformService, /rpc\("platform_lead_analytics"\)/);
  assert.match(migration, /if not public\.is_platform_admin\(\)/i);
  assert.match(migration, /grant execute on function public\.platform_lead_analytics\(\) to authenticated/i);
});

test("analytics panel has funnel channel movement and speed charts", async () => {
  const panel = await readFile(path.join(root, "src/components/LeadAnalyticsPanel.tsx"), "utf8");
  assert.match(panel, /Conversion funnel/);
  assert.match(panel, /Channel efficiency/);
  assert.match(panel, /Daily lead movement/);
  assert.match(panel, /Speed to lead/);
});

test("organization Leads page exposes every-lead track records for administrators", async () => {
  const app = await readFile(path.join(root, "src/App.tsx"), "utf8");
  const service = await readFile(path.join(root, "src/services/leads.ts"), "utf8");
  const migration = await readFile(path.join(root, "supabase/migrations/20261121135000_complete_organization_lead_tracking.sql"), "utf8");
  assert.match(app, /Every lead track record/);
  assert.match(app, /organizationLeadActivity/);
  assert.match(app, /canTrack/);
  assert.match(service, /listOrganizationLeadActivity/);
  assert.match(migration, /create policy lead_journey_read on public\.lead_journey_events/);
  assert.match(migration, /pipeline_stage_id/);
  assert.match(migration, /custom_fields/);
});
