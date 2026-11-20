import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath = new URL("../supabase/migrations/202611020006_lead_journey_sharing.sql", import.meta.url);

test("lead journey migration is additive and defines immutable timeline storage", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create table if not exists public\.lead_journey_events/i);
  assert.match(sql, /revoke insert, update, delete on public\.lead_journey_events/i);
  assert.match(sql, /create policy lead_journey_read/i);
  assert.doesNotMatch(sql, /\bdrop table\b/i);
  assert.doesNotMatch(sql, /\btruncate\b/i);
});

test("lead sharing migration protects tenant scope and duplicate active shares", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create unique index if not exists lead_shares_active_unique/i);
  assert.match(sql, /recipient is not an active salesperson in this organization/i);
  assert.match(sql, /create or replace function public\.transfer_lead/i);
  assert.match(sql, /A transfer reason is required/i);
});

test("lead dashboard trend is tenant-scoped and all lead detail edits are recorded", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261120164400_lead_growth_and_complete_timeline.sql", import.meta.url), "utf8");
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const chart = await readFile(new URL("../src/components/LeadTrendChart.tsx", import.meta.url), "utf8");
  assert.match(sql, /function public\.get_organization_lead_trend/i);
  assert.match(sql, /public\.is_org_member\(target_organization\)/i);
  assert.match(sql, /deleted_at is null/i);
  assert.match(sql, /grant execute on function public\.get_organization_lead_trend/i);
  assert.match(sql, /lead_details_updated/i);
  assert.match(sql, /create trigger leads_capture_record_updates/i);
  assert.match(sql, /using \(public\.is_org_member\(organization_id\)\)/i);
  assert.match(app, /<LeadTrendChart points=\{trend\} loading=\{isLoadingTrend\}/);
  assert.match(app, /Lead track record/);
  assert.match(app, /\[\.\.\.events\]\.reverse\(\)/);
  assert.match(chart, /Total leads over time/);
  assert.match(chart, /role="img" aria-label=/);
});
