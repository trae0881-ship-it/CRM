import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hmacSha256, safeEqual } from "./crypto.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const allowedEvents = new Set(["OBSERVED_SUCCESS", "RECONCILED", "MANUAL_REVIEW", "SUCCESS", "FAILED", "EXPIRED", "CANCELLED"]);

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const secret = Deno.env.get("YOUPI_WEBHOOK_SECRET");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !url || !serviceRole) return json({ error: "Webhook is not configured" }, 503);
  const rawBody = await request.text();
  const header = request.headers.get("x-gateway-signature") || "";
  const expected = await hmacSha256(secret, rawBody);
  const supplied = header.startsWith("sha256=") ? header.slice(7) : header;
  const valid = safeEqual(supplied, expected);
  const admin = createClient(url, serviceRole, { auth: { persistSession: false } });
  let event: { deliveryId?: string; event?: string; orderId?: string; paymentId?: string; amount?: string; currency?: string; method?: string; settlementState?: string; transactionReference?: string };
  try { event = JSON.parse(rawBody); } catch { return json({ error: "Invalid JSON payload" }, 400); }
  const deliveryId = event.deliveryId || request.headers.get("x-gateway-delivery-id");
  if (!deliveryId) return json({ error: "Webhook delivery identifier is required" }, 400);
  const { error: deliveryError } = await admin.from("payment_webhook_deliveries").insert({ provider: "youpi_pg", delivery_id: deliveryId, merchant_order_id: event.orderId || null, event_type: event.event || null, signature_valid: valid });
  if (deliveryError?.code === "23505") return json({ received: true, duplicate: true });
  if (deliveryError) return json({ error: "Webhook delivery could not be recorded" }, 500);
  if (!valid) return json({ error: "Invalid signature" }, 401);
  if (!event.event || !allowedEvents.has(event.event) || !event.orderId) return json({ error: "Unsupported webhook event" }, 400);
  const { data: transaction } = await admin.from("payment_transactions").select("id,amount,currency,payment_status,organization_id,subscription_id").eq("merchant_order_id", event.orderId).single();
  if (!transaction) return json({ error: "Payment order not found" }, 404);
  if (transaction.payment_status === "RECONCILED" && event.event === "RECONCILED") return json({ received: true, duplicate: true });
  if (Number(event.amount) !== Number(transaction.amount) || event.currency !== transaction.currency) return json({ error: "Payment amount or currency mismatch" }, 400);
  const reconciled = event.event === "RECONCILED" && event.method === "UPI" && event.settlementState === "RECONCILED";
  const status = event.event === "SUCCESS" && event.method !== "UPI" ? "SUCCESS" : event.event;
  const settlementStatus = reconciled ? "RECONCILED" : event.event === "SUCCESS" ? "NOT_BANK_SETTLEMENT" : "NOT_RECONCILED";
  const updates = { gateway_payment_id: event.paymentId || null, payment_status: status, settlement_status: settlementStatus, gateway_event: event.event, transaction_reference: event.transactionReference || null, webhook_delivery_id: deliveryId, reconciled_at: reconciled ? new Date().toISOString() : null, updated_at: new Date().toISOString() };
  const { error } = await admin.from("payment_transactions").update(updates).eq("id", transaction.id);
  if (error) { await admin.from("payment_webhook_deliveries").update({ processing_status: "failed", error_message: "Payment ledger update failed" }).eq("delivery_id", deliveryId); return json({ error: "Payment processing failed" }, 500); }
  await admin.from("payment_state_history").insert({ organization_id: transaction.organization_id, payment_transaction_id: transaction.id, previous_status: transaction.payment_status, next_status: status, source: "gateway_webhook", metadata: { deliveryId, event: event.event } });
  if (reconciled) await admin.from("subscriptions").update({ status: "active", current_period_start: new Date().toISOString(), current_period_end: new Date(Date.now() + 30 * 86400000).toISOString() }).eq("id", transaction.subscription_id);
  await admin.from("payment_webhook_deliveries").update({ processing_status: "processed", processed_at: new Date().toISOString() }).eq("delivery_id", deliveryId);
  return json({ received: true });
});
