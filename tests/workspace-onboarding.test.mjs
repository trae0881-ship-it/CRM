import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("workspace onboarding keeps successful data when another setup request fails", async () => {
  const component = await readFile(path.join(root, "src/components/WorkspaceOnboardingView.tsx"), "utf8");
  assert.match(component, /Promise\.allSettled\(\[/);
  assert.match(component, /plansResult\.status === "fulfilled"/);
  assert.match(component, /requestsResult\.status === "fulfilled"/);
  assert.match(component, /accessResult\.status === "fulfilled"/);
  assert.match(component, /Account details:/);
});

test("workspace onboarding distinguishes plan loading errors from an empty active plan list", async () => {
  const component = await readFile(path.join(root, "src/components/WorkspaceOnboardingView.tsx"), "utf8");
  assert.match(component, /plansLoadFailed/);
  assert.match(component, /!plansLoadFailed && plans\.length === 0/);
  assert.match(component, /onClick=\{\(\) => void load\(\)\}>Retry/);
});

test("new workspace requests show only active paid plans and enforce the same rule server-side", async () => {
  const workspaceService = await readFile(path.join(root, "src/services/workspace.ts"), "utf8");
  const component = await readFile(path.join(root, "src/components/WorkspaceOnboardingView.tsx"), "utf8");
  const migration = await readFile(path.join(root, "supabase/migrations/20261117152500_paid_workspace_plans.sql"), "utf8");
  assert.match(workspaceService, /price_monthly\.gt\.0,price_quarterly\.gt\.0,price_half_yearly\.gt\.0,price_yearly\.gt\.0/);
  assert.match(component, /listAvailableSubscriptionPlans\(\{ paidOnly: true \}\)/);
  assert.match(migration, /p\.is_active\s+and \(p\.price_monthly > 0 or p\.price_quarterly > 0 or p\.price_half_yearly > 0 or p\.price_yearly > 0\)/i);
  assert.match(migration, /Select an active paid subscription plan/);
});
