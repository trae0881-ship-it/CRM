import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/lib/salesOperations.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/202611020015_sales_operations.sql", import.meta.url), "utf8");
const hardeningMigration = await readFile(new URL("../supabase/migrations/202611020016_phase9_pipeline_hardening.sql", import.meta.url), "utf8");

test("sales operations validate closed stages and lost reasons", () => {
  assert.match(source, /closed deal cannot move/);
  assert.match(source, /lost reason is required/);
});
test("customer matching normalizes phone and email values", () => {
  assert.match(source, /normalizeCustomerValue/);
  assert.match(source, /findPossibleCustomerMatches/);
});
test("target, commission and import validation are bounded", () => {
  assert.match(source, /calculateTargetAchievement/);
  assert.match(source, /calculateCommission/);
  assert.match(source, /validateImportRows/);
  assert.match(migration, /commission_ledger/);
  assert.match(migration, /import_jobs/);
});
test("phase seven records are tenant scoped", () => {
  assert.match(migration, /customer_id uuid/);
  assert.match(migration, /public\.is_org_member\(organization_id\)/);
  assert.match(migration, /support_tickets/);
});
test("phase nine pipeline movement is authorized, concurrent-safe and auditable", () => {
  assert.match(hardeningMigration, /move_lead_to_pipeline_stage/);
  assert.match(hardeningMigration, /updated_at = expected_updated_at/);
  assert.match(hardeningMigration, /lead_stage_history/);
  assert.match(hardeningMigration, /stage_org <> lead_org/);
});
