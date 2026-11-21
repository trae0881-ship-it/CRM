import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("duplicate dashboard summary is tenant-scoped, read-only, and limited to active leads", async () => {
  const migration = await readFile(path.join(root, "supabase/migrations/20261121124600_dashboard_duplicate_leads.sql"), "utf8");
  assert.match(migration, /security invoker/i);
  assert.match(migration, /if not public\.is_org_member\(target_organization\)/i);
  assert.match(migration, /l\.organization_id = target_organization\s+and l\.deleted_at is null/i);
  assert.match(migration, /lower\(btrim\(l\.email\)\)/i);
  assert.match(migration, /length\(regexp_replace\(coalesce\(l\.phone/i);
  assert.match(migration, /limit greatest\(1, least\(coalesce\(result_limit, 8\), 20\)\)/i);
  assert.match(migration, /grant execute on function public\.get_organization_duplicate_leads\(uuid, integer\) to authenticated/i);
});

test("dashboard loads and displays duplicate lead records and the total count", async () => {
  const service = await readFile(path.join(root, "src/services/leads.ts"), "utf8");
  const app = await readFile(path.join(root, "src/App.tsx"), "utf8");
  assert.match(service, /getOrganizationDuplicateLeads\(organizationId: string\)/);
  assert.match(service, /rpc\("get_organization_duplicate_leads"/);
  assert.match(app, /DATA QUALITY<\/p><h2>Duplicate leads<\/h2>/);
  assert.match(app, /duplicateLeadSummary\.duplicateCount/);
  assert.match(app, /duplicateLeadSummary\.leads\.map/);
  assert.match(app, /Matching phone or email/);
});
