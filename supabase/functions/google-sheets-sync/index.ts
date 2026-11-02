import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
};
const sha256 = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
const admin = () => createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

async function decryptToken(value: string) {
  const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  const keyBytes = Uint8Array.from(atob(env("GOOGLE_SHEETS_TOKEN_ENCRYPTION_KEY")), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, key, bytes.slice(12))));
}

async function validUser(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await admin().auth.getUser(token);
  return data.user ?? null;
}
function hasSchedulerSecret(request: Request) {
  const expected = Deno.env.get("GOOGLE_SHEETS_SYNC_CRON_SECRET");
  return Boolean(expected && request.headers.get("x-google-sync-cron-secret") === expected);
}

function normalizePhone(value: unknown) { const result = String(value ?? "").replace(/[^\d+]/g, ""); return result.length >= 7 ? result : null; }
function normalizeEmail(value: unknown) { const result = String(value ?? "").trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result) ? result : null; }

Deno.serve(async (request) => {
  try {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const user = await validUser(request);
    const scheduled = hasSchedulerSecret(request);
    if (!user && !scheduled) return json({ error: "Authentication required" }, 401);
    const body = await request.json().catch(() => null) as { integrationId?: string; confirmInitialImport?: boolean } | null;
    if (!body?.integrationId) return json({ error: "Integration is required" }, 400);
    const db = admin();
    const { data: integration, error: integrationError } = await db.from("google_sheet_integrations").select("*").eq("id", body.integrationId).single();
    if (integrationError || !integration) return json({ error: "Integration not found" }, 404);
    if (!scheduled) {
      const { data: membership } = await db.from("organization_members").select("role").eq("organization_id", integration.organization_id).eq("user_id", user?.id).eq("is_active", true).single();
      if (!membership || !["company_owner", "organization_admin"].includes(membership.role)) return json({ error: "Google Sheets sync permission required" }, 403);
    }
    if (!integration.token_ciphertext || integration.status === "disconnected") return json({ error: "Google account is disconnected" }, 409);
    if (integration.spreadsheet_id === "pending-selection") return json({ error: "Select a spreadsheet before syncing" }, 409);
    if (!integration.column_mapping?.full_name) return json({ error: "Full Name column mapping is required" }, 400);
    const token = await decryptToken(integration.token_ciphertext);
    let accessToken = token.access_token;
    if (!integration.token_expires_at || new Date(integration.token_expires_at).getTime() <= Date.now() + 60000) {
      const refreshed = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"), refresh_token: token.refresh_token, grant_type: "refresh_token" }) });
      if (!refreshed.ok) throw new Error("Google OAuth token expired or revoked");
      const next = await refreshed.json(); accessToken = next.access_token;
      await db.from("google_sheet_integrations").update({ token_ciphertext: await (async () => {
        const keyBytes = Uint8Array.from(atob(env("GOOGLE_SHEETS_TOKEN_ENCRYPTION_KEY")), (char) => char.charCodeAt(0));
        const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]); const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify({ ...token, access_token: accessToken })))); const output = new Uint8Array(iv.length + encrypted.length); output.set(iv); output.set(encrypted, iv.length); return btoa(String.fromCharCode(...output));
      })(), token_expires_at: new Date(Date.now() + Number(next.expires_in ?? 3600) * 1000).toISOString() }).eq("id", integration.id);
    }
    const startedAt = new Date().toISOString();
    const range = `${integration.worksheet_name || "Sheet1"}!A1:ZZ${integration.row_limit + 1}`;
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(integration.spreadsheet_id)}/values/${encodeURIComponent(range)}?majorDimension=ROWS`, { headers: { authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error("Google spreadsheet access was denied or the worksheet does not exist");
    const values = (await response.json()).values as string[][] | undefined;
    if (!values?.length) return json({ status: "completed", totalRows: 0, newLeads: 0, updatedLeads: 0, duplicateRows: 0, failedRows: 0 });
    const headers = values[0].map((header) => String(header).trim());
    const mapping = integration.column_mapping as Record<string, string>;
    const required = mapping.full_name;
    if (!headers.includes(required)) throw new Error("Mapped Full Name column was not found");
    const actorId = user?.id ?? null;
    const run = await db.from("google_sheet_sync_runs").insert({ integration_id: integration.id, organization_id: integration.organization_id, status: "running", created_by: actorId }).select("id").single();
    if (run.error) throw run.error;
    let newLeads = 0, updatedLeads = 0, duplicateRows = 0, failedRows = 0;
    const errors: Array<{ row: number; error: string }> = [];
    for (let index = 1; index < values.length && index <= integration.row_limit; index += 1) {
      const record = Object.fromEntries(headers.map((header, column) => [header, values[index][column] ?? ""]));
      try {
        const fullName = String(record[required] ?? "").trim(); if (!fullName) throw new Error("Full Name is required");
        const phone = mapping.phone ? normalizePhone(record[mapping.phone]) : null;
        const email = mapping.email ? normalizeEmail(record[mapping.email]) : null;
        if (mapping.phone && record[mapping.phone] && !phone) throw new Error("Invalid phone number");
        if (mapping.email && record[mapping.email] && !email) throw new Error("Invalid email address");
        const rowKey = `${integration.spreadsheet_id}:${integration.worksheet_id || integration.worksheet_name}:${mapping.source_id ? String(record[mapping.source_id] || index) : `${email || ""}:${phone || ""}:${fullName.toLowerCase()}`}`;
        const rowHash = await sha256(JSON.stringify(record));
        const existingSource = await db.from("google_sheet_source_rows").select("id,lead_id,row_hash").eq("integration_id", integration.id).eq("source_row_key", rowKey).maybeSingle();
        if (existingSource.data?.row_hash === rowHash) { duplicateRows += 1; continue; }
        let lead = existingSource.data?.lead_id ? (await db.from("leads").select("id").eq("id", existingSource.data.lead_id).eq("organization_id", integration.organization_id).single()).data : null;
        if (!lead && (email || phone)) {
          let query = db.from("leads").select("id").eq("organization_id", integration.organization_id).is("deleted_at", null);
          if (email) query = query.eq("email", email); else if (phone) query = query.eq("phone", phone);
          lead = (await query.maybeSingle()).data;
        }
        const patch = { full_name: fullName, phone, email, city: mapping.city ? String(record[mapping.city] || "").trim() || null : null, state: mapping.state ? String(record[mapping.state] || "").trim() || null : null, source: mapping.source ? String(record[mapping.source] || "").trim() || "google_sheets" : "google_sheets", custom_fields: { campaign: mapping.campaign ? String(record[mapping.campaign] || "").trim() : "", requirement: mapping.requirement ? String(record[mapping.requirement] || "").trim() : "", notes: mapping.notes ? String(record[mapping.notes] || "").trim() : "" } };
        const managed = new Set((integration.crm_managed_fields ?? []) as string[]);
        if (lead) {
          const updatePatch = Object.fromEntries(Object.entries(patch).filter(([field]) => !managed.has(field)));
          if (Object.keys(updatePatch).length) await db.from("leads").update(updatePatch).eq("id", lead.id).eq("organization_id", integration.organization_id);
          updatedLeads += 1;
        }
        else { const inserted = await db.from("leads").insert({ ...patch, organization_id: integration.organization_id, created_by: actorId, updated_by: actorId }).select("id").single(); if (inserted.error) throw inserted.error; lead = inserted.data; newLeads += 1; }
        await db.from("google_sheet_source_rows").upsert({ integration_id: integration.id, organization_id: integration.organization_id, source_row_key: rowKey, source_row_number: index + 1, row_hash: rowHash, lead_id: lead.id, source_status: "active", last_seen_at: new Date().toISOString(), last_error: null }, { onConflict: "integration_id,source_row_key" });
      } catch (error) { failedRows += 1; errors.push({ row: index + 1, error: error instanceof Error ? error.message : "Row import failed" }); }
    }
    await db.from("google_sheet_source_rows").update({ source_status: "missing", updated_at: new Date().toISOString() }).eq("integration_id", integration.id).eq("source_status", "active").lt("last_seen_at", startedAt);
    await db.from("google_sheet_sync_runs").update({ status: failedRows ? "failed" : "completed", completed_at: new Date().toISOString(), total_rows: values.length - 1, new_leads: newLeads, updated_leads: updatedLeads, duplicate_rows: duplicateRows, failed_rows: failedRows, errors }).eq("id", run.data.id);
    await db.from("google_sheet_integrations").update({ last_successful_sync_at: failedRows ? integration.last_successful_sync_at : new Date().toISOString(), total_rows_processed: values.length - 1, new_leads_imported: newLeads, existing_leads_updated: updatedLeads, duplicate_rows_skipped: duplicateRows, failed_rows: failedRows, last_error: errors.length ? JSON.stringify(errors.slice(0, 10)) : null, updated_at: new Date().toISOString() }).eq("id", integration.id);
    return json({ runId: run.data.id, status: failedRows ? "failed" : "completed", totalRows: values.length - 1, newLeads, updatedLeads, duplicateRows, failedRows });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Google Sheets sync failed" }, 500); }
});
