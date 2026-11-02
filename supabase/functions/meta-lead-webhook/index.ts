import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hmacSha256, safeEqual } from "./crypto.ts";

const META_API_VERSION = Deno.env.get("META_GRAPH_API_VERSION") || "v21.0";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function fetchMetaLead(leadId: string, token: string) {
  const fields = "id,created_time,field_data,ad_id,ad_name,form_id,campaign_id,campaign_name";
  const response = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${encodeURIComponent(leadId)}?fields=${fields}&access_token=${encodeURIComponent(token)}`);
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(payload.error?.message || "Meta lead lookup failed");
  return payload;
}

function fieldValue(fields: Array<{ name: string; values?: string[] }>, names: string[]) {
  const field = fields.find((item) => names.includes(item.name.toLowerCase()));
  return field?.values?.[0]?.trim() || null;
}

Deno.serve(async (request) => {
  const verifyToken = Deno.env.get("META_VERIFY_TOKEN");
  const appSecret = Deno.env.get("META_APP_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!verifyToken || !appSecret || !supabaseUrl || !serviceRole) return json({ error: "Webhook is not configured" }, 503);

  if (request.method === "GET") {
    const url = new URL(request.url);
    if (url.searchParams.get("hub.verify_token") !== verifyToken) return new Response("Forbidden", { status: 403 });
    return new Response(url.searchParams.get("hub.challenge") || "", { status: 200 });
  }
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256") || "";
  const expected = `sha256=${await hmacSha256(appSecret, rawBody)}`;
  if (!safeEqual(signature, expected)) return json({ error: "Invalid signature" }, 401);

  let event: { entry?: Array<{ id?: string; changes?: Array<{ field?: string; value?: { leadgen_id?: string; form_id?: string; ad_id?: string; page_id?: string } }> }> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON payload" }, 400);
  }
  const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  const events = (event.entry || []).flatMap((entry) => (entry.changes || []).filter((change) => change.field === "leadgen").map((change) => ({
    pageId: change.value?.page_id || entry.id || null, formId: change.value?.form_id || null, leadId: change.value?.leadgen_id || null, adId: change.value?.ad_id || null,
  }))).filter((item) => item.leadId && item.pageId);

  for (const item of events) {
    const eventKey = `meta:${item.leadId}`;
    const { data: inserted, error: eventError } = await admin.from("webhook_events").insert({ provider: "meta", event_key: eventKey, page_id: item.pageId, form_id: item.formId, external_lead_id: item.leadId, payload: event, status: "received" }).select("id").maybeSingle();
    let eventId: string | null = inserted?.id || null;
    if (eventError?.code === "23505") {
      const { data: existing } = await admin.from("webhook_events").select("id,status").eq("event_key", eventKey).single();
      if (!existing || existing.status !== "failed") continue;
      eventId = existing.id;
      await admin.from("webhook_events").update({ status: "received", error_message: null, payload: event }).eq("id", eventId);
    }
    if (eventError && eventError.code !== "23505") continue;
    if (!eventId) continue;
    try {
      const { data: integration } = await admin.from("meta_integrations").select("id,organization_id").eq("page_id", item.pageId).eq("status", "connected").maybeSingle();
      if (!integration) throw new Error("No connected organization integration for page");
      const { data: secret } = await admin.from("meta_integration_secrets").select("page_access_token").eq("integration_id", integration.id).single();
      if (!secret) throw new Error("Meta page token is not configured");
      const lead = await fetchMetaLead(item.leadId!, secret.page_access_token);
      const fields = (lead.field_data || []) as Array<{ name: string; values?: string[] }>;
      const fullName = fieldValue(fields, ["full_name", "name"]) || "Meta lead";
      const source = "Meta Lead Ads";
      const { data: savedLead, error: leadError } = await admin.from("leads").upsert({
        organization_id: integration.organization_id, full_name: fullName, phone: fieldValue(fields, ["phone_number", "phone"]), email: fieldValue(fields, ["email"]),
        city: fieldValue(fields, ["city"]), state: fieldValue(fields, ["state"]), source, meta_lead_id: item.leadId, meta_page_id: item.pageId, meta_form_id: item.formId, meta_ad_id: item.adId, meta_created_time: lead.created_time, custom_fields: Object.fromEntries(fields.map((field) => [field.name, field.values?.[0] || null])),
      }, { onConflict: "organization_id,meta_lead_id" }).select("id").single();
      if (leadError) throw leadError;
      await admin.from("lead_activities").insert({ organization_id: integration.organization_id, lead_id: savedLead.id, activity_type: "meta_lead_received", body: "Lead received from Meta Instant Form", metadata: { page_id: item.pageId, form_id: item.formId, meta_lead_id: item.leadId } });
      await admin.from("webhook_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", eventId);
      await admin.from("meta_integrations").update({ last_webhook_at: new Date().toISOString(), last_error: null }).eq("page_id", item.pageId);
    } catch (error) {
      await admin.from("webhook_events").update({ status: "failed", error_message: error instanceof Error ? error.message : "Unknown processing error" }).eq("id", eventId);
    }
  }
  return json({ received: events.length });
});
