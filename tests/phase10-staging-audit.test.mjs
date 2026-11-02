import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const migrationDir = new URL("../supabase/migrations/", import.meta.url);
const files = (await readdir(migrationDir)).filter((file) => file.endsWith(".sql")).sort();

test("phase ten migration set is complete and ordered", () => {
  assert.equal(files.length, 18);
  assert.deepEqual(files.map((file) => file.slice(0, 12)), [
    "202611020001", "202611020002", "202611020003", "202611020004",
    "202611020005", "202611020006", "202611020007", "202611020008",
    "202611020009", "202611020010", "202611020011", "202611020012",
    "202611020013", "202611020014", "202611020015", "202611020016",
    "202611020017", "202611020018",
  ]);
});

test("pipeline foreign key is declared after pipeline tables exist", async () => {
  const automation = await readFile(new URL("../supabase/migrations/202611020014_advanced_automation.sql", import.meta.url), "utf8");
  const sales = await readFile(new URL("../supabase/migrations/202611020015_sales_operations.sql", import.meta.url), "utf8");
  assert.ok(automation.indexOf("create table if not exists public.pipeline_stages") >= 0);
  assert.ok(sales.indexOf("alter table public.leads add column if not exists pipeline_stage_id") > sales.indexOf("create table if not exists public.import_jobs"));
});

test("tenant-owned Phase 9 objects have RLS and pipeline RPC grants", async () => {
  const automation = await readFile(new URL("../supabase/migrations/202611020014_advanced_automation.sql", import.meta.url), "utf8");
  const hardening = await readFile(new URL("../supabase/migrations/202611020016_phase9_pipeline_hardening.sql", import.meta.url), "utf8");
  assert.match(automation, /alter table public\.sales_pipelines enable row level security/);
  assert.match(automation, /alter table public\.automation_executions enable row level security/);
  assert.match(hardening, /grant execute on function public\.move_lead_to_pipeline_stage/);
  assert.match(hardening, /revoke all on function public\.move_lead_to_pipeline_stage/);
});
