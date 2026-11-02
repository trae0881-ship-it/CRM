import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apiUrl = Deno.env.get("YOUPI_API_URL");
  const createPaymentPath = Deno.env.get("YOUPI_CREATE_PAYMENT_PATH");
  const merchantId = Deno.env.get("YOUPI_MERCHANT_ID");
  const returnUrl = Deno.env.get("YOUPI_RETURN_URL");
  if (!supabaseUrl || !serviceRole || !apiUrl || !createPaymentPath || !merchantId || !returnUrl || Deno.env.get("YOUPI_API_CONTRACT_CONFIRMED") !== "true" || Deno.env.get("YOUPI_ENABLED") !== "true") return json({ error: "Payment gateway is not configured" }, 503);
  const authorization = request.headers.get("authorization");
  if (!authorization) return json({ error: "Authentication required" }, 401);
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") || "", { global: { headers: { authorization } } });
  const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Authentication required" }, 401);
  let body: { planId?: string; organizationId?: string };
  try { body = await request.json(); } catch { return json({ error: "Invalid request body" }, 400); }
  if (!body.planId || !body.organizationId) return json({ error: "Subscription plan and organization are required" }, 400);
  const { data: membership } = await admin.from("organization_members").select("role,is_active").eq("organization_id", body.organizationId).eq("user_id", userData.user.id).eq("is_active", true).maybeSingle();
  if (!membership || !["company_owner", "organization_admin"].includes(membership.role)) return json({ error: "Organization administrator permission required" }, 403);
  const { data: plan } = await admin.from("subscription_plans").select("id,price_monthly,is_active").eq("id", body.planId).eq("is_active", true).single();
  if (!plan || Number(plan.price_monthly) <= 0) return json({ error: "The selected subscription plan is unavailable" }, 400);
  const orderId = `ADM-${crypto.randomUUID()}`;
  const amount = Number(plan.price_monthly).toFixed(2);
  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/${createPaymentPath.replace(/^\//, "")}`, { method: "POST", headers: { "content-type": "application/json", "x-merchant-id": merchantId }, body: JSON.stringify({ orderId, amount, currency: "INR", returnUrl, metadata: { subscriptionPlanId: plan.id, organizationId: body.organizationId } }) });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.paymentId || !payload?.checkoutUrl) return json({ error: "Payment gateway could not create checkout" }, 502);
  const { data: subscription } = await admin.from("subscriptions").select("id").eq("organization_id", body.organizationId).single();
  const { error } = await admin.from("payment_transactions").insert({ organization_id: body.organizationId, subscription_id: subscription?.id || null, customer_id: userData.user.id, provider: "youpi_pg", merchant_order_id: orderId, gateway_payment_id: payload.paymentId, amount, currency: "INR", payment_status: "ACTIVE", checkout_url: payload.checkoutUrl });
  if (error) return json({ error: "Payment record could not be created" }, 500);
  return json({ checkoutUrl: payload.checkoutUrl, orderId });
});
