import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import { getLeadDateBounds } from "../src/lib/leadDateFilter.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("new and old lead filters split records at the same rolling seven-day cutoff", () => {
  const now = new Date("2025-05-10T12:00:00.000Z");
  const cutoff = "2025-05-03T12:00:00.000Z";
  assert.deepEqual(getLeadDateBounds("new", "", "", now), { createdAfter: cutoff });
  assert.deepEqual(getLeadDateBounds("old", "", "", now), { createdBefore: cutoff });
});

test("custom lead dates include both selected calendar days", () => {
  const bounds = getLeadDateBounds("custom", "2025-05-01", "2025-05-03");
  assert.equal(bounds.createdAfter, new Date("2025-05-01T00:00:00").toISOString());
  const dayAfterEnd = new Date("2025-05-03T00:00:00");
  dayAfterEnd.setDate(dayAfterEnd.getDate() + 1);
  assert.equal(bounds.createdBefore, dayAfterEnd.toISOString());
});

test("custom lead date filters reject empty, invalid, and reversed ranges", () => {
  assert.throws(() => getLeadDateBounds("custom"), /Choose at least one date/);
  assert.throws(() => getLeadDateBounds("custom", "2025-02-30"), /valid date/);
  assert.throws(() => getLeadDateBounds("custom", "2025-05-04", "2025-05-03"), /start date/);
});

test("lead date bounds are applied to server-side paginated queries and exposed in the lead menu", async () => {
  const service = await readFile(path.join(root, "src/services/leads.ts"), "utf8");
  const app = await readFile(path.join(root, "src/App.tsx"), "utf8");
  assert.match(service, /options\.createdAfter[\s\S]*?\.gte\("created_at", options\.createdAfter\)/);
  assert.match(service, /options\.createdBefore[\s\S]*?\.lt\("created_at", options\.createdBefore\)/);
  assert.match(app, /\.\.\.dateBounds, offset: 0/);
  assert.match(app, /\.\.\.dateBounds,\s*offset: operationLeads\.length/);
  assert.match(app, /New leads · last 7 days/);
  assert.match(app, /Old leads · over 7 days/);
  assert.match(app, /type="date"/);
});

test("dashboard lead graph exposes date ranges and date-wise lead totals", async () => {
  const chart = await readFile(path.join(root, "src/components/LeadTrendChart.tsx"), "utf8");
  const app = await readFile(path.join(root, "src/App.tsx"), "utf8");
  const service = await readFile(path.join(root, "src/services/leads.ts"), "utf8");
  assert.match(chart, /Last 7 days/);
  assert.match(chart, /Last 30 days/);
  assert.match(chart, /Last 90 days/);
  assert.match(chart, /Date-wise new leads/);
  assert.match(chart, /point\.new_leads/);
  assert.match(app, /leadTrendDays/);
  assert.match(app, /getOrganizationLeadTrend\(membership\.organization_id, leadTrendDays\)/);
  assert.match(service, /getOrganizationLeadTrend\(organizationId: string, days = 30\)/);
});
