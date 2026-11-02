import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("platform billing management is server-authorized and payment-neutral", async () => {
  const migration = await readFile(new URL("../supabase/migrations/202611020020_platform_billing_management.sql", import.meta.url), "utf8");
  assert.match(migration, /platform_dashboard_stats/);
  assert.match(migration, /platform_upsert_subscription/);
  assert.match(migration, /subscription_history/);
  assert.match(migration, /payment_record_created.*false/);
  assert.match(migration, /status_reason/);
  assert.match(migration, /is_platform_admin/);
});

test("license register exposes version and commit pinning fields", async () => {
  const source = await readFile(new URL("../src/services/growthTools.ts", import.meta.url), "utf8");
  const view = await readFile(new URL("../src/components/GrowthToolsView.tsx", import.meta.url), "utf8");
  assert.match(source, /pinnedVersion/);
  assert.match(source, /pinnedCommit/);
  assert.match(view, /PINNED VERSION/);
  assert.match(view, /PINNED COMMIT/);
});
