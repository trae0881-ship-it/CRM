import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/services/growthTools.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/202611020013_growth_tools.sql", import.meta.url), "utf8");

test("growth tool register contains five pinned services with truthful deployment statuses", () => {
  assert.equal((source.match(/name: "/g) || []).length, 5);
  assert.equal((source.match(/commit: "[a-f0-9]{40}"/g) || []).length, 5);
  assert.equal((source.match(/deploymentStatus: "NOT DEPLOYED"/g) || []).length, 5);
  assert.equal((source.match(/healthStatus: "NOT DEPLOYED"/g) || []).length, 5);
  assert.equal((source.match(/securityReviewStatus: "BLOCKED"/g) || []).length, 5);
  assert.match(source, /No SPDX license declared/);
  assert.match(source, /AGPL-3\.0/);
  assert.match(source, /licenseStatus: "BLOCKED"/);
  assert.match(source, /DNS rebinding/);
  assert.match(source, /fetch-robots-txt/);
  assert.match(source, /local remediation patch/);
  assert.match(source, /temporary clone/);
  assert.match(source, /version: "v0\.3\.0"/);
  assert.match(source, /version: "v2\.3\.2"/);
});

test("growth tool migration isolates access and job records by organization", () => {
  assert.match(migration, /growth_tool_access/);
  assert.match(migration, /growth_tool_jobs/);
  assert.match(migration, /public\.is_org_member\(organization_id\)/);
  assert.match(migration, /revoke insert, update, delete on public\.growth_tool_jobs/);
});
