import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(new URL("../src/components/WorkspaceRequestsView.tsx", import.meta.url), "utf8");
const service = await readFile(new URL("../src/services/platform.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20261116161000_subscription_workspace_lifecycle.sql", import.meta.url), "utf8");
const paidPlansMigration = await readFile(new URL("../supabase/migrations/20261117152500_paid_workspace_plans.sql", import.meta.url), "utf8");
const ambiguityFixMigration = await readFile(new URL("../supabase/migrations/20261117180000_fix_workspace_approval_parameter_ambiguity.sql", import.meta.url), "utf8");

test("workspace approval RPC parameters match its database function and platform guard", () => {
  const functionStart = migration.indexOf("create or replace function public.platform_decide_workspace_request(");
  const signatureStart = migration.indexOf("(", functionStart);
  const returnsIndex = migration.indexOf("returns public.workspace_requests", signatureStart);
  const signatureEnd = migration.lastIndexOf(")", returnsIndex);
  const sqlArguments = migration.slice(signatureStart + 1, signatureEnd).split(",").map((argument) => argument.trim().split(/\s+/)[0]);
  const serviceBody = service.slice(service.indexOf("export async function decidePlatformWorkspaceRequest"), service.indexOf("export async function listPlatformChangeRequests"));
  const rpcArguments = [...serviceBody.matchAll(/^\s{4}([a-z_]+):/gm)].map((match) => match[1]);

  assert.deepEqual(rpcArguments, sqlArguments);
  assert.match(migration.slice(functionStart), /if not public\.is_platform_admin\(\) then raise exception 'Platform administrator permission required'/);
  assert.ok(migration.indexOf("create table if not exists public.workspace_requests") < functionStart);
  assert.match(paidPlansMigration, /returns public\.workspace_requests/);
});

test("workspace approval RPC qualifies message parameters to avoid column ambiguity", () => {
  const functionStart = ambiguityFixMigration.indexOf("create or replace function public.platform_decide_workspace_request(");
  const functionBody = ambiguityFixMigration.slice(functionStart);

  assert.match(functionBody, /<<approval>>/);
  assert.match(functionBody, /admin_message = nullif\(trim\(approval\.admin_message\), ''\)/);
  assert.match(functionBody, /rejection_reason = trim\(approval\.rejection_reason\)/);
  assert.match(functionBody, /coalesce\(approval\.admin_message, approval\.rejection_reason\)/);
  assert.doesNotMatch(functionBody, /trim\(admin_message\)|trim\(rejection_reason\)/);
});

test("approval success is not reported as failure when subsequent refresh fails", () => {
  assert.match(component, /await decidePlatformWorkspaceRequest\([\s\S]*?catch \(error\)[\s\S]*?getErrorMessage\(error, "Approval failed without a server error message\."\)/);
  assert.match(component, /setRequests\(\(current\) => current\.map/);
  assert.match(component, /Promise\.allSettled\(\[load\(\), onChanged\(\)\]\)/);
  assert.match(component, /Refresh failed: \$\{getErrorMessage/);
});

test("workspace approval surfaces database error messages and error codes", () => {
  assert.match(component, /"message" in error && typeof error\.message === "string"/);
  assert.match(component, /"code" in error && typeof error\.code === "string"/);
  assert.match(component, /Confirm the lifecycle migration completed successfully in this Supabase project/);
  assert.match(component, /saveError && <p className="muted" role="alert">/);
});
