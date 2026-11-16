import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20261116160100_retire_payment_gateway_config.sql", import.meta.url), "utf8");
const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const platformAdmin = await readFile(new URL("../src/components/PlatformAdminView.tsx", import.meta.url), "utf8");
const platformService = await readFile(new URL("../src/services/platform.ts", import.meta.url), "utf8");
const entities = await readFile(new URL("../mysql/schemas/entities.mjs", import.meta.url), "utf8");
const routes = JSON.parse(await readFile(new URL("../shared/application-routes.json", import.meta.url), "utf8"));

test("payment provider removal preserves generic payment history and QR review data", () => {
  assert.match(migration, /drop function if exists public\.payment_gateway_overview/);
  assert.match(migration, /drop table if exists public\.payment_gateway_configs/);
  assert.match(migration, /alter table public\.payment_transactions/);
  assert.match(migration, /alter table public\.payment_webhook_deliveries/);
  assert.match(migration, /delete from public\.mysql_sync_outbox\s+where entity_type = 'payment_gateway_configs'/);
  assert.doesNotMatch(migration, /delete from public\.payment_transactions|drop table if exists public\.payment_transactions/i);
  assert.doesNotMatch(migration, /drop table if exists public\.payment_state_history|drop table if exists public\.qr_payment_reviews/i);
});

test("provider dashboard and obsolete configuration sync are removed", () => {
  assert.doesNotMatch(app, /PaymentGatewayView|Payment Gateway/);
  assert.doesNotMatch(platformAdmin, /getPaymentGatewayOverview|gateway\?\.|payment gateway/);
  assert.doesNotMatch(platformService, /PaymentGatewayOverview|getPaymentGatewayOverview|payment_gateway_overview/);
  assert.doesNotMatch(entities, /payment_gateway_configs/);
  assert.ok(!routes.some((route) => route.route.includes("payment")));
});
