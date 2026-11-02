import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const webhook = await readFile(new URL("../supabase/functions/youpi-webhook/index.ts", import.meta.url), "utf8");
const createPayment = await readFile(new URL("../supabase/functions/youpi-create-payment/index.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/202611020012_youpi_gateway.sql", import.meta.url), "utf8");

test("YouPI payment creation is server-authoritative", () => {
  assert.match(createPayment, /from\("subscription_plans"\)/);
  assert.match(createPayment, /POST|method: "POST"/);
  assert.match(createPayment, /currency: "INR"/);
  assert.match(createPayment, /YOUPI_WEBHOOK_SECRET|YOUPI_ENABLED/);
});

test("YouPI webhook verifies signatures and deduplicates deliveries", () => {
  assert.match(webhook, /request\.text\(\)/);
  assert.match(webhook, /x-gateway-signature/);
  assert.match(webhook, /delivery_id/);
  assert.match(webhook, /duplicate: true/);
});

test("YouPI settlement rules require reconciled UPI status", () => {
  assert.match(webhook, /event\.event === "RECONCILED" && event\.method === "UPI"/);
  assert.match(webhook, /event\.event === "SUCCESS" && event\.method !== "UPI"/);
  assert.match(migration, /payment_status.*OBSERVED_SUCCESS.*RECONCILED.*MANUAL_REVIEW/s);
  assert.match(migration, /settlement_status.*NOT_RECONCILED.*RECONCILED/s);
});
test("YouPI Edge Function requires an explicitly reviewed API contract", async () => {
  const source = await readFile(new URL("../supabase/functions/youpi-create-payment/index.ts", import.meta.url), "utf8");
  assert.match(source, /YOUPI_API_CONTRACT_CONFIRMED/);
  assert.match(source, /YOUPI_CREATE_PAYMENT_PATH/);
});
