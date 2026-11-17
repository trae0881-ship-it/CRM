import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const service = await readFile(new URL("../src/services/platform.ts", import.meta.url), "utf8");
const planView = await readFile(new URL("../src/components/PlatformPlanManagementView.tsx", import.meta.url), "utf8");
const adminView = await readFile(new URL("../src/components/PlatformAdminView.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20261116161000_subscription_workspace_lifecycle.sql", import.meta.url), "utf8");

test("platform plan save RPC arguments match the guarded database function", () => {
  const functionStart = migration.indexOf("create or replace function public.platform_upsert_subscription_plan(");
  const signatureStart = migration.indexOf("(", functionStart);
  const returnsIndex = migration.indexOf("returns public.subscription_plans", signatureStart);
  const signatureEnd = migration.lastIndexOf(")", returnsIndex);
  const sqlArguments = migration.slice(signatureStart + 1, signatureEnd).split(",").map((argument) => argument.trim().split(/\s+/)[0]);
  const rpcBody = service.slice(service.indexOf("export async function savePlatformPlan"), service.indexOf("export async function listPlatformWorkspaceRequests"));
  const rpcArguments = [...rpcBody.matchAll(/^\s{4}([a-z_]+): input\./gm)].map((match) => match[1]);

  assert.deepEqual(rpcArguments, sqlArguments);
  assert.match(migration, /if not public\.is_platform_admin\(\) then raise exception 'Platform administrator permission required'/);
});

test("plan pages load their own data and surface refresh failures instead of reporting false success", () => {
  assert.match(adminView, /section === "plans"[\s\S]*?loadPlans/);
  assert.match(adminView, /setPlansError\(message\)/);
  assert.match(planView, /Plans could not be loaded:[\s\S]*?Retry/);
  assert.match(planView, /Plan saved, but the list could not be refreshed/);
  assert.match(planView, /Subscription plan could not be saved:/);
});

test("paid plans require a valid currency before submission", () => {
  assert.match(planView, /const hasPaidPrice = form/);
  assert.match(planView, /hasPaidPrice && !\/\^\[A-Z\]\{3\}\$\/\.test/);
  assert.match(planView, /required=\{hasPaidPrice\}/);
});
