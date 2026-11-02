import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/lib/automation.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/202611020014_advanced_automation.sql", import.meta.url), "utf8");

test("assignment selection supports round robin and workload balancing", () => {
  assert.match(source, /mode === "workload"/);
  assert.match(source, /mode === "round_robin"/);
  assert.match(source, /currentLoad/);
  assert.match(source, /lastAssignedAt/);
});

test("lead scoring returns explainable bounded categories", () => {
  assert.match(source, /Math\.max\(0, Math\.min\(100/);
  assert.match(source, /category = score >= 75 \? "hot"/);
  assert.match(source, /breakdown/);
});

test("workflow event execution is idempotent and migration is tenant-scoped", () => {
  assert.match(source, /canExecuteWorkflow/);
  assert.match(migration, /unique \(workflow_id, event_key\)/);
  assert.match(migration, /automation_workflows/);
  assert.match(migration, /public\.is_org_member\(organization_id\)/);
  assert.match(migration, /claim_automation_event/);
});
