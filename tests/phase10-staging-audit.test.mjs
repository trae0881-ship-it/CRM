import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const migrationDir = new URL("../supabase/migrations/", import.meta.url);
const files = (await readdir(migrationDir)).filter((file) => file.endsWith(".sql")).sort();

test("phase ten and database replica migrations are complete and ordered", () => {
  assert.equal(files.length, 28);
  assert.deepEqual(files.map((file) => file.slice(0, 12)), [
    "202611020001", "202611020002", "202611020003", "202611020004",
    "202611020005", "202611020006", "202611020007", "202611020008",
    "202611020009", "202611020010", "202611020011", "202611020012",
    "202611020013", "202611020014", "202611020015", "202611020016",
    "202611020017", "202611020018", "202611020019", "202611020020", "202611020021",
    "202611020022", "202611020023", "202611020024", "202611020025", "202611020026", "202611020027",
    "202611161511",
  ]);
});

test("platform domain records require verified DNS and HTTPS and are service-managed", async () => {
  const domains = await readFile(new URL("../supabase/migrations/202611020026_platform_domains.sql", import.meta.url), "utf8");
  assert.match(domains, /alter table public\.platform_domains enable row level security/);
  assert.match(domains, /revoke all on public\.platform_domains from public, anon, authenticated/);
  assert.match(domains, /domain_row\.verification_status <> 'active' or domain_row\.dns_status <> 'verified'\s+or domain_row\.ssl_status <> 'verified'/);
  assert.match(domains, /when dns_verified and https_verified then 'active'/);
  assert.match(domains, /grant execute on function public\.manage_platform_domain[\s\S]*to service_role/);
});

test("company owner organization audit access remains tenant-scoped", async () => {
  const auditPolicy = await readFile(new URL("../supabase/migrations/202611020024_company_owner_audit_read.sql", import.meta.url), "utf8");
  assert.match(auditPolicy, /for select using/);
  assert.match(auditPolicy, /organization_id is not null/);
  assert.match(auditPolicy, /has_org_role\(organization_id, array\['company_owner'\]/);
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
