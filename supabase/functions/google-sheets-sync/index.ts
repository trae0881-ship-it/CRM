import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "content-type": "application/json" } });
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
function normalizedHeader(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9]/g, ""); }
function findHeader(headers: string[], configured: unknown, aliases: string[]) {
  const candidates = [configured, ...aliases].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  return headers.find((header) => candidates.some((candidate) => normalizedHeader(header) === normalizedHeader(candidate))) ?? null;
}
function normalizeSheetHeaders(values: unknown[] = []) {
  const usedHeaders = new Map<string, number>();
  return values.map((value, index) => {
    const base = String(value ?? "").trim() || `Column ${index + 1}`;
    const count = (usedHeaders.get(base) ?? 0) + 1;
    usedHeaders.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}
function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 1000);
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    const details = ["message", "details", "hint"]
      .map((key) => {
        const value = record[key];
        return typeof value === "string" ? value.trim() : "";
      })
      .filter(Boolean);
    if (details.length) return [...new Set(details)].join(" — ").slice(0, 1000);
  }
  return fallback;
}
function scoreLeadWorksheet(headers: string[]) {
  let score = 0;
  if (findHeader(headers, "Full Name", ["Name", "Lead Name", "Customer Name", "Contact Name"])) score += 100;
  if (findHeader(headers, "Phone", ["Phone Number", "Mobile", "Mobile Number", "Contact Number"])) score += 40;
  if (findHeader(headers, "Email", ["Email Address", "E-mail"])) score += 20;
  const leadSignals = ["createdtime", "adid", "adname", "adsetid", "adsetname", "campaignid", "campaignname", "formid", "formname", "leadstatus", "isorganic", "platform", "response"];
  return score + headers.reduce((total, header) => total + (leadSignals.includes(normalizedHeader(header)) ? 5 : 0), 0);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const user = await validUser(request);
    const scheduled = hasSchedulerSecret(request);
    if (!user && !scheduled) return json({ error: "Authentication required" }, 401);
    const body = await request.json().catch(() => null) as { integrationId?: string; confirmInitialImport?: boolean; action?: string; worksheetId?: string; worksheetName?: string } | null;
    if (!body?.integrationId) return json({ error: "Integration is required" }, 400);
    const action = body.action ?? "sync";
    if (action !== "sync" && action !== "preview") return json({ error: "Unsupported action" }, 400);
    if (action === "preview" && !user) return json({ error: "Authentication required" }, 401);
    const db = admin();
    const { data: integration, error: integrationError } = await db.from("google_sheet_integrations").select("*").eq("id", body.integrationId).single();
    if (integrationError || !integration) return json({ error: "Integration not found" }, 404);
    if (!scheduled) {
      const { data: membership } = await db.from("organization_members").select("role").eq("organization_id", integration.organization_id).eq("user_id", user?.id).eq("is_active", true).single();
      if (!membership || !["company_owner", "organization_admin"].includes(membership.role)) return json({ error: "Google Sheets sync permission required" }, 403);
    }
    if (!integration.token_ciphertext || integration.status === "disconnected") return json({ error: "Google account is disconnected" }, 409);
    if (integration.spreadsheet_id.startsWith("pending-selection")) return json({ error: "Select a spreadsheet before syncing" }, 409);
    if (action === "sync" && !integration.column_mapping?.full_name) return json({ error: "Full Name column mapping is required" }, 400);
    const token = await decryptToken(integration.token_ciphertext);
    let accessToken = token.access_token;
    if (!integration.token_expires_at || new Date(integration.token_expires_at).getTime() <= Date.now() + 60000) {
      const refreshed = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"), refresh_token: token.refresh_token, grant_type: "refresh_token" }) });
      if (!refreshed.ok) throw new Error("Google OAuth token expired or revoked");
      const next = await refreshed.json(); accessToken = next.access_token;
      const tokenUpdate = await db.from("google_sheet_integrations").update({ token_ciphertext: await (async () => {
        const keyBytes = Uint8Array.from(atob(env("GOOGLE_SHEETS_TOKEN_ENCRYPTION_KEY")), (char) => char.charCodeAt(0));
        const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]); const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify({ ...token, access_token: accessToken })))); const output = new Uint8Array(iv.length + encrypted.length); output.set(iv); output.set(encrypted, iv.length); return btoa(String.fromCharCode(...output));
      })(), token_expires_at: new Date(Date.now() + Number(next.expires_in ?? 3600) * 1000).toISOString() }).eq("id", integration.id);
      if (tokenUpdate.error) throw tokenUpdate.error;
    }
    const startedAt = new Date().toISOString();
    const metadataUrl = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(integration.spreadsheet_id)}`);
    metadataUrl.searchParams.set("fields", "sheets.properties(sheetId,title)");
    const metadataResponse = await fetch(metadataUrl, { headers: { authorization: `Bearer ${accessToken}` } });
    if (!metadataResponse.ok) {
      const payload = await metadataResponse.json().catch(() => null) as { error?: { message?: unknown } } | null;
      const detail = typeof payload?.error?.message === "string" ? payload.error.message : "spreadsheet metadata could not be read";
      throw new Error(`Google Sheets metadata read failed (${metadataResponse.status}): ${detail}`);
    }
    const metadata = await metadataResponse.json() as { sheets?: Array<{ properties?: { sheetId?: number; title?: string } }> };
    const requestedWorksheetId = String(body.worksheetId || integration.worksheet_id || "").trim();
    const requestedWorksheetName = String(body.worksheetName || integration.worksheet_name || "Sheet1").trim();
    let selectedSheet = requestedWorksheetId
      ? metadata.sheets?.find((sheet) => String(sheet.properties?.sheetId) === requestedWorksheetId)
      : requestedWorksheetName === "Sheet1"
        ? undefined
        : metadata.sheets?.find((sheet) => sheet.properties?.title === requestedWorksheetName);
    if (!requestedWorksheetId && requestedWorksheetName === "Sheet1") {
      let bestScore = 0;
      for (const sheet of metadata.sheets ?? []) {
        const title = sheet.properties?.title;
        if (!title) continue;
        const tabRange = `'${title.replace(/'/g, "''")}'!A1:ZZ1`;
        const tabResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(integration.spreadsheet_id)}/values/${encodeURIComponent(tabRange)}?majorDimension=ROWS`, { headers: { authorization: `Bearer ${accessToken}` } });
        if (!tabResponse.ok) {
          const payload = await tabResponse.json().catch(() => null) as { error?: { message?: unknown } } | null;
          const detail = typeof payload?.error?.message === "string" ? payload.error.message : "worksheet headers could not be read";
          throw new Error(`Google Sheets header read failed (${tabResponse.status}): ${detail}`);
        }
        const tabValues = (await tabResponse.json()).values as unknown[][] | undefined;
        const tabHeaders = normalizeSheetHeaders(tabValues?.[0] ?? []);
        const score = scoreLeadWorksheet(tabHeaders) + (normalizedHeader(title).includes("lead") ? 10 : 0);
        if (score > bestScore) {
          bestScore = score;
          selectedSheet = sheet;
        }
      }
      if (!selectedSheet) selectedSheet = metadata.sheets?.find((sheet) => sheet.properties?.title === "Sheet1") ?? metadata.sheets?.[0];
    }
    if (!selectedSheet?.properties?.title || selectedSheet.properties.sheetId === undefined) {
      throw new Error("The worksheet tab from the link was not found. Choose an existing worksheet name.");
    }
    const worksheetName = selectedSheet.properties.title;
    if (integration.worksheet_name !== worksheetName || String(integration.worksheet_id ?? "") !== String(selectedSheet.properties.sheetId)) {
      const { error } = await db.from("google_sheet_integrations").update({ worksheet_name: worksheetName, worksheet_id: String(selectedSheet.properties.sheetId) }).eq("id", integration.id);
      if (error) throw error;
    }
    const quotedWorksheetName = worksheetName.replace(/'/g, "''");
    const range = action === "preview" ? `'${quotedWorksheetName}'!A1:ZZ1` : `'${quotedWorksheetName}'!A1:ZZ${integration.row_limit + 1}`;
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(integration.spreadsheet_id)}/values/${encodeURIComponent(range)}?majorDimension=ROWS`, { headers: { authorization: `Bearer ${accessToken}` } });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: { message?: unknown } } | null;
      const detail = typeof payload?.error?.message === "string" ? payload.error.message : "access was denied or the worksheet does not exist";
      throw new Error(`Google Sheets read failed (${response.status}): ${detail}`);
    }
    const values = (await response.json()).values as string[][] | undefined;
    const headers = normalizeSheetHeaders(values?.[0] ?? []);
    if (action === "preview") return json({
      status: "previewed",
      worksheetId: String(selectedSheet.properties.sheetId),
      worksheetName,
      headers: [...new Set(headers)],
      worksheets: (metadata.sheets ?? []).flatMap((sheet) => {
        const title = sheet.properties?.title;
        const sheetId = sheet.properties?.sheetId;
        return title && sheetId !== undefined ? [{ worksheetId: String(sheetId), worksheetName: title }] : [];
      }),
    });
    if (!values?.length) return json({ status: "completed", totalRows: 0, newLeads: 0, updatedLeads: 0, duplicateRows: 0, failedRows: 0 });
    const mapping = integration.column_mapping as Record<string, unknown>;
    const nameHeader = findHeader(headers, mapping.full_name, ["Full Name", "Name", "Lead Name", "Customer Name", "Contact Name", "Client Name"]);
    if (!nameHeader) throw new Error(`Could not find a lead name column. Available columns: ${headers.join(", ")}`);
    const phoneHeader = findHeader(headers, mapping.phone, ["Phone", "Phone Number", "Mobile", "Mobile Number", "Contact Number", "WhatsApp Number"]);
    const emailHeader = findHeader(headers, mapping.email, ["Email", "Email Address", "E-mail"]);
    const companyHeader = findHeader(headers, mapping.company, ["Company", "Company Name", "Business", "Business Name", "Organization", "Organisation"]);
    const cityHeader = findHeader(headers, mapping.city, ["City", "Town"]);
    const stateHeader = findHeader(headers, mapping.state, ["State", "Province"]);
    const sourceHeader = findHeader(headers, mapping.source, ["Source", "Lead Source", "Enquiry Source"]);
    const campaignHeader = findHeader(headers, mapping.campaign, ["Campaign", "Campaign Name"]);
    const requirementHeader = findHeader(headers, mapping.requirement, ["Requirement", "Product", "Interested In"]);
    const notesHeader = findHeader(headers, mapping.notes, ["Notes", "Remarks", "Comment"]);
    const sourceIdHeader = findHeader(headers, mapping.source_id, ["Source ID", "Lead ID", "Record ID", "Customer ID"]);
    const configuredVisibleColumns = Array.isArray(mapping.visible_columns) ? mapping.visible_columns.filter((column): column is string => typeof column === "string") : headers;
    const visibleColumns = headers.filter((header) => configuredVisibleColumns.includes(header));
    const actorId = user?.id ?? null;
    const run = await db.from("google_sheet_sync_runs").insert({ integration_id: integration.id, organization_id: integration.organization_id, status: "running", created_by: actorId }).select("id").single();
    if (run.error) throw run.error;
    let newLeads = 0, updatedLeads = 0, duplicateRows = 0, failedRows = 0;
    const errors: Array<{ row: number; error: string }> = [];
    for (let index = 1; index < values.length && index <= integration.row_limit; index += 1) {
      const record = Object.fromEntries(headers.map((header, column) => [header, values[index][column] ?? ""]));
      if (Object.values(record).every((value) => !String(value ?? "").trim())) continue;
      try {
        const fullName = String(record[nameHeader] ?? "").trim(); if (!fullName) throw new Error("Lead name is required");
        const phone = phoneHeader ? normalizePhone(record[phoneHeader]) : null;
        const email = emailHeader ? normalizeEmail(record[emailHeader]) : null;
        const rowKey = `${integration.spreadsheet_id}:${integration.worksheet_id || integration.worksheet_name}:${sourceIdHeader ? String(record[sourceIdHeader] || index) : `${email || ""}:${phone || ""}:${fullName.toLowerCase()}`}`;
        const rowHash = await sha256(JSON.stringify({ record, visibleColumns, agencyName: integration.agency_name ?? "" }));
        const existingSource = await db.from("google_sheet_source_rows").select("id,lead_id,row_hash").eq("integration_id", integration.id).eq("source_row_key", rowKey).maybeSingle();
        if (existingSource.data?.row_hash === rowHash) { duplicateRows += 1; continue; }
        let lead = existingSource.data?.lead_id ? (await db.from("leads").select("id,custom_fields").eq("id", existingSource.data.lead_id).eq("organization_id", integration.organization_id).single()).data : null;
        if (!lead && (email || phone)) {
          let query = db.from("leads").select("id,custom_fields").eq("organization_id", integration.organization_id).is("deleted_at", null);
          if (email) query = query.eq("email", email);
          else if (phone) query = query.eq("phone", phone);
          lead = (await query.maybeSingle()).data;
        }
        const sheetFields = Object.fromEntries(headers.map((header) => [header, String(record[header] ?? "").trim()]));
        const existingCustomFields = lead?.custom_fields && typeof lead.custom_fields === "object" && !Array.isArray(lead.custom_fields) ? lead.custom_fields as Record<string, unknown> : {};
        const importedCustomFields = {
          ...sheetFields,
          _google_sheets_columns: headers,
          _google_sheets_visible_columns: visibleColumns,
          ...(integration.agency_name ? {
            _google_sheet_agencies: {
              ...(existingCustomFields._google_sheet_agencies && typeof existingCustomFields._google_sheet_agencies === "object" && !Array.isArray(existingCustomFields._google_sheet_agencies)
                ? existingCustomFields._google_sheet_agencies as Record<string, string>
                : {}),
              [integration.id]: integration.agency_name,
            },
          } : {}),
          _google_sheet_sources: {
            ...(existingCustomFields._google_sheet_sources && typeof existingCustomFields._google_sheet_sources === "object" && !Array.isArray(existingCustomFields._google_sheet_sources)
              ? existingCustomFields._google_sheet_sources as Record<string, Record<string, unknown>>
              : {}),
            [integration.id]: {
              agency: integration.agency_name || "Unassigned",
              spreadsheetName: integration.spreadsheet_name || "Google Sheet",
              worksheetName,
            },
          },
          ...(campaignHeader && visibleColumns.includes(campaignHeader) ? { campaign: String(record[campaignHeader] || "").trim() } : {}),
          ...(requirementHeader && visibleColumns.includes(requirementHeader) ? { requirement: String(record[requirementHeader] || "").trim() } : {}),
          ...(notesHeader && visibleColumns.includes(notesHeader) ? { notes: String(record[notesHeader] || "").trim() } : {}),
        };
        const patch: Record<string, unknown> = {
          full_name: fullName,
          custom_fields: { ...existingCustomFields, ...importedCustomFields },
        };
        if (phoneHeader) patch.phone = phone;
        if (emailHeader) patch.email = email;
        if (companyHeader) patch.company = String(record[companyHeader] || "").trim() || null;
        if (cityHeader) patch.city = String(record[cityHeader] || "").trim() || null;
        if (stateHeader) patch.state = String(record[stateHeader] || "").trim() || null;
        if (sourceHeader) patch.source = String(record[sourceHeader] || "").trim() || "google_sheets";
        else if (!lead) patch.source = "google_sheets";
        const managed = new Set((integration.crm_managed_fields ?? []) as string[]);
        if (lead) {
          const updatePatch = Object.fromEntries(Object.entries(patch).filter(([field]) => !managed.has(field)));
          if (Object.keys(updatePatch).length) {
            const updated = await db.from("leads").update(updatePatch).eq("id", lead.id).eq("organization_id", integration.organization_id);
            if (updated.error) throw updated.error;
          }
          updatedLeads += 1;
        }
        else { const inserted = await db.from("leads").insert({ ...patch, organization_id: integration.organization_id, created_by: actorId, updated_by: actorId }).select("id").single(); if (inserted.error) throw inserted.error; lead = inserted.data; newLeads += 1; }
        const sourceRow = await db.from("google_sheet_source_rows").upsert({ integration_id: integration.id, organization_id: integration.organization_id, source_row_key: rowKey, source_row_number: index + 1, row_hash: rowHash, lead_id: lead.id, source_status: "active", last_seen_at: new Date().toISOString(), last_error: null }, { onConflict: "integration_id,source_row_key" });
        if (sourceRow.error) throw sourceRow.error;
      } catch (error) {
        failedRows += 1;
        const message = error instanceof Error ? error.message : "Row import failed";
        errors.push({ row: index + 1, error: message.slice(0, 240) });
      }
    }
    const markedMissing = await db.from("google_sheet_source_rows").update({ source_status: "missing", updated_at: new Date().toISOString() }).eq("integration_id", integration.id).eq("source_status", "active").lt("last_seen_at", startedAt);
    if (markedMissing.error) throw markedMissing.error;
    const finishedRun = await db.from("google_sheet_sync_runs").update({ status: failedRows ? "failed" : "completed", completed_at: new Date().toISOString(), total_rows: values.length - 1, new_leads: newLeads, updated_leads: updatedLeads, duplicate_rows: duplicateRows, failed_rows: failedRows, errors }).eq("id", run.data.id);
    if (finishedRun.error) throw finishedRun.error;
    const finishedIntegration = await db.from("google_sheet_integrations").update({ last_successful_sync_at: failedRows ? integration.last_successful_sync_at : new Date().toISOString(), total_rows_processed: values.length - 1, new_leads_imported: newLeads, existing_leads_updated: updatedLeads, duplicate_rows_skipped: duplicateRows, failed_rows: failedRows, last_error: errors.length ? JSON.stringify(errors.slice(0, 10)) : null, updated_at: new Date().toISOString() }).eq("id", integration.id);
    if (finishedIntegration.error) throw finishedIntegration.error;
    return json({ runId: run.data.id, status: failedRows ? "failed" : "completed", totalRows: values.length - 1, newLeads, updatedLeads, duplicateRows, failedRows, errors: errors.slice(0, 10) });
  } catch (error) {
    const message = errorMessage(error, "Google Sheets sync failed");
    console.error("Google Sheets sync failed", { message, error });
    return json({ error: message }, 500);
  }
});
