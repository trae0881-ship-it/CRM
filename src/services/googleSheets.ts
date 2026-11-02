import { supabase } from "../lib/supabase";
import type { GoogleLeadMapping } from "../lib/googleSheetsSync";

const client = () => {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};

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

export async function startGoogleOAuth(organizationId: string) {
  const { data, error } = await client().functions.invoke("google-sheets-oauth", { body: { action: "start", organizationId } });
  if (error) throw error;
  return data as { authorizationUrl: string };
}

export async function listGoogleSheetIntegrations(organizationId: string) {
  const { data, error } = await client().from("google_sheet_integrations").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as GoogleSheetIntegration[];
}

export async function updateGoogleSheetSettings(id: string, patch: { spreadsheet_id?: string; worksheet_id?: string; worksheet_name?: string; column_mapping?: GoogleLeadMapping; auto_sync?: boolean; sync_frequency_minutes?: number; row_limit?: number }) {
  const { data, error } = await client().from("google_sheet_integrations").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return data as GoogleSheetIntegration;
}

export async function syncGoogleSheet(id: string, confirmInitialImport = false) {
  const { data, error } = await client().functions.invoke("google-sheets-sync", { body: { integrationId: id, confirmInitialImport } });
  if (error) throw error;
  return data as { runId: string; status: string; totalRows: number; newLeads: number; updatedLeads: number; duplicateRows: number; failedRows: number };
}

export async function listGoogleSyncRuns(organizationId: string) {
  const { data, error } = await client().from("google_sheet_sync_runs").select("*").eq("organization_id", organizationId).order("started_at", { ascending: false }).limit(25);
  if (error) throw error;
  return data ?? [];
}

export async function disconnectGoogleSheet(id: string) {
  const { data, error } = await client().functions.invoke("google-sheets-oauth", { body: { action: "disconnect", integrationId: id } });
  if (error) throw error;
  return data;
}
