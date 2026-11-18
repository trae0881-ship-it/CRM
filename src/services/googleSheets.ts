import { supabase } from "../lib/supabase";
import { isOrganizationId } from "../lib/organizationId";
import { googleSheetsErrorMessage, type GoogleLeadMapping } from "../lib/googleSheetsSync";

const client = () => {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};

async function invokeGoogleFunction<T>(name: string, body: Record<string, unknown>) {
  const { data, error } = await client().functions.invoke(name, { body });
  if (error) {
    let message = error.message;
    if (typeof error === "object" && error !== null && "context" in error && error.context instanceof Response) {
      const response = error.context;
      const payload = await response.clone().json().catch(() => null) as { error?: unknown } | null;
      if (typeof payload?.error === "string") message = payload.error;
      else message = `${message} (HTTP ${response.status})`;
    } else if (error.name === "FunctionsFetchError") {
      message = `Could not reach the ${name} Edge Function. Confirm it is deployed to the same Supabase project as VITE_SUPABASE_URL, redeploy the latest function source with CORS support, and check the function logs. Enabling Google under Supabase Auth providers does not deploy this function.`;
    }
    throw new Error(message);
  }
  return data as T;
}

export type GoogleSheetIntegration = {
  id: string;
  organization_id: string;
  provider_account_email: string | null;
  spreadsheet_id: string;
  spreadsheet_name: string | null;
  worksheet_id: string | null;
  worksheet_name: string | null;
  status: string;
  auto_sync: boolean;
  sync_frequency_minutes: number;
  row_limit: number;
  column_mapping: GoogleLeadMapping;
  last_successful_sync_at: string | null;
  next_scheduled_sync_at: string | null;
  total_rows_processed: number;
  new_leads_imported: number;
  existing_leads_updated: number;
  duplicate_rows_skipped: number;
  failed_rows: number;
  last_error: string | null;
};

export type GoogleSheetSyncResult = {
  runId: string;
  status: string;
  totalRows: number;
  newLeads: number;
  updatedLeads: number;
  duplicateRows: number;
  failedRows: number;
  errors?: Array<{ row: number; error: string }>;
};

export async function startGoogleOAuth(organizationId: string) {
  if (!isOrganizationId(organizationId)) {
    throw new Error("A valid active organization is required before connecting Google Sheets.");
  }
  return invokeGoogleFunction<{ authorizationUrl: string }>("google-sheets-oauth", { action: "start", organizationId });
}

export async function listGoogleSheetIntegrations(organizationId: string) {
  const { data, error } = await client().from("google_sheet_integrations").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false });
  if (error) throw new Error(googleSheetsErrorMessage(error, "Google Sheets integrations could not be loaded."));
  return (data ?? []) as GoogleSheetIntegration[];
}

export async function updateGoogleSheetSettings(id: string, patch: { spreadsheet_id?: string; worksheet_id?: string | null; worksheet_name?: string; column_mapping?: GoogleLeadMapping; auto_sync?: boolean; sync_frequency_minutes?: number; row_limit?: number }) {
  const { data, error } = await client().from("google_sheet_integrations").update(patch).eq("id", id).select("*").single();
  if (error) throw new Error(googleSheetsErrorMessage(error, "Google Sheets settings could not be saved."));
  return data as GoogleSheetIntegration;
}

export async function syncGoogleSheet(id: string, confirmInitialImport = false) {
  return invokeGoogleFunction<GoogleSheetSyncResult>("google-sheets-sync", { integrationId: id, confirmInitialImport });
}

export async function previewGoogleSheet(id: string) {
  return invokeGoogleFunction<{ status: "previewed"; worksheetId: string; worksheetName: string; headers: string[] }>("google-sheets-sync", { integrationId: id, action: "preview" });
}

export async function listGoogleSyncRuns(organizationId: string) {
  const { data, error } = await client().from("google_sheet_sync_runs").select("*").eq("organization_id", organizationId).order("started_at", { ascending: false }).limit(25);
  if (error) throw new Error(googleSheetsErrorMessage(error, "Google Sheets sync history could not be loaded."));
  return data ?? [];
}

export async function disconnectGoogleSheet(id: string) {
  return invokeGoogleFunction<unknown>("google-sheets-oauth", { action: "disconnect", integrationId: id });
}
