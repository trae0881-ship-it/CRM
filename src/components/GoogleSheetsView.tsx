import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Link2, RefreshCw, Unplug } from "lucide-react";
import type { Membership } from "../services/workspace";
import { isOrganizationId } from "../lib/organizationId";
import { disconnectGoogleSheet, listGoogleSheetIntegrations, listGoogleSyncRuns, startGoogleOAuth, syncGoogleSheet, updateGoogleSheetSettings, type GoogleSheetIntegration } from "../services/googleSheets";
import { parseGoogleSpreadsheetReference, type GoogleLeadMapping } from "../lib/googleSheetsSync";

const defaultMapping: GoogleLeadMapping = { full_name: "Full Name", phone: "Phone", email: "Email", city: "City", state: "State", source: "Source" };

export function GoogleSheetsView({ membership, onNotify }: { membership: Membership; onNotify: (message: string) => void }) {
  const [integrations, setIntegrations] = useState<GoogleSheetIntegration[]>([]);
  const [runs, setRuns] = useState<Array<Record<string, unknown>>>([]);
  const [spreadsheetInput, setSpreadsheetInput] = useState("");
  const [worksheetName, setWorksheetName] = useState("Sheet1");
  const [mapping, setMapping] = useState<GoogleLeadMapping>(defaultMapping);
  const [busy, setBusy] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const validOrganizationId = isOrganizationId(membership.organization_id);
  const load = async () => {
    if (!validOrganizationId) {
      onNotify("Your active organization could not be verified. Reload and sign in again before connecting Google Sheets.");
      return;
    }
    try {
      const loadedIntegrations = await listGoogleSheetIntegrations(membership.organization_id);
      setIntegrations(loadedIntegrations);
      const firstIntegration = loadedIntegrations[0];
      setSpreadsheetInput(firstIntegration?.spreadsheet_id === "pending-selection" ? "" : firstIntegration?.spreadsheet_id ?? "");
      setWorksheetName(firstIntegration?.worksheet_name ?? "Sheet1");
      setMapping(firstIntegration?.column_mapping ?? defaultMapping);
      setRuns(await listGoogleSyncRuns(membership.organization_id));
    }
    catch (error) { onNotify(error instanceof Error ? error.message : "Google Sheets data could not be loaded."); }
  };
  useEffect(() => {
    void load();
    const configuredSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseOrigin = configuredSupabaseUrl ? new URL(configuredSupabaseUrl).origin : "";
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== supabaseOrigin || event.source !== popupRef.current
        || typeof event.data !== "object" || event.data === null
        || !("type" in event.data)
        || !["adometa-google-sheets-connected", "adometa-google-sheets-error"].includes(String(event.data.type))) return;
      const connected = event.data.type === "adometa-google-sheets-connected";
      popupRef.current = null;
      if (connected) void load();
      else onNotify("Google authorization did not finish. Check the Google OAuth setup and retry.");
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
      popupRef.current = null;
    };
  }, [membership.organization_id]);
  const connect = async () => {
    if (!validOrganizationId) {
      onNotify("Your active organization could not be verified. Reload and sign in again before connecting Google Sheets.");
      return;
    }
    if (!["company_owner", "organization_admin"].includes(membership.role)) {
      onNotify("Only a company owner or organization admin can connect Google Sheets.");
      return;
    }
    const popup = window.open("about:blank", "_blank");
    if (!popup) return onNotify("Your browser blocked the Google sign-in popup. Allow pop-ups for this site and try again.");
    popupRef.current = popup;
    setBusy(true);
    try {
      const { authorizationUrl } = await startGoogleOAuth(membership.organization_id);
      if (popup.closed) throw new Error("The Google sign-in window was closed before authorization started.");
      popup.location.replace(authorizationUrl);
      onNotify("Complete Google authorization in the new window. This section will refresh when it finishes.");
    } catch (error) {
      popup.close();
      popupRef.current = null;
      onNotify(error instanceof Error ? error.message : "Google authorization could not start.");
    } finally { setBusy(false); }
  };
  const saveSettings = async (integration: GoogleSheetIntegration, autoSync = integration.auto_sync, input = spreadsheetInput) => {
    const reference = parseGoogleSpreadsheetReference(input);
    await updateGoogleSheetSettings(integration.id, { spreadsheet_id: reference.spreadsheetId, worksheet_id: reference.worksheetId, worksheet_name: worksheetName.trim() || "Sheet1", column_mapping: mapping, auto_sync: autoSync });
    setSpreadsheetInput(reference.spreadsheetId);
  };
  const save = async (integration: GoogleSheetIntegration, autoSync = integration.auto_sync) => {
    setBusy(true);
    try { await saveSettings(integration, autoSync); await load(); onNotify("Google Sheets mapping saved."); }
    catch (error) { onNotify(error instanceof Error ? error.message : "Google Sheets settings could not be saved."); } finally { setBusy(false); }
  };
  const saveAndImport = async (integration: GoogleSheetIntegration, input = spreadsheetInput) => {
    setBusy(true);
    try {
      await saveSettings(integration, integration.auto_sync, input);
      const result = await syncGoogleSheet(integration.id, true);
      await load();
      onNotify(`${result.newLeads} new leads imported; ${result.updatedLeads} updated; ${result.failedRows} failed.`);
    } catch (error) {
      await load();
      onNotify(error instanceof Error ? error.message : "Google Sheets import failed.");
    } finally { setBusy(false); }
  };
  const sync = async (integration: GoogleSheetIntegration) => {
    setBusy(true);
    try { const result = await syncGoogleSheet(integration.id, true); await load(); onNotify(`${result.newLeads} new leads imported; ${result.updatedLeads} updated.`); }
    catch (error) { onNotify(error instanceof Error ? error.message : "Google Sheets sync failed."); } finally { setBusy(false); }
  };
  return <section className="card">
    <div className="card-header">
      <div>
        <p className="eyebrow">GOOGLE SHEETS</p>
        <h2>Live lead sync</h2>
        <p>Connect an account, paste a Google Sheets link, and import leads. OAuth tokens stay server-side.</p>
      </div>
      <button className="button primary" disabled={busy || !validOrganizationId || !["company_owner", "organization_admin"].includes(membership.role)} onClick={() => void connect()}><Link2 size={16} /> Connect Google Account</button>
    </div>
    {!validOrganizationId && <p className="profile-error" role="alert">An active organization could not be verified. Reload or sign in again before connecting.</p>}
    {integrations.map((integration) => <div className="operations-form" key={integration.id}>
      <div className="card-header"><strong>{integration.provider_account_email || "Google account"}</strong><span className="pending-pill">{integration.status}</span></div>
      {integration.spreadsheet_id === "pending-selection" && <p className="muted">Paste a Google Sheets link or spreadsheet ID to choose the sheet.</p>}
      <div className="inline-form">
        <label>Google Sheets link or ID<input value={spreadsheetInput} onChange={(event) => setSpreadsheetInput(event.target.value)} onPaste={(event) => { const pasted = event.clipboardData.getData("text").trim(); if (pasted) { event.preventDefault(); setSpreadsheetInput(pasted); void saveAndImport(integration, pasted); } }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveAndImport(integration); } }} placeholder="https://docs.google.com/spreadsheets/d/..." /></label>
        <label>Worksheet / tab<input value={worksheetName} onChange={(event) => setWorksheetName(event.target.value)} placeholder="Sheet1" /></label>
        <label>Automatic sync<select value={integration.auto_sync ? "on" : "off"} onChange={(event) => void save(integration, event.target.value === "on")}><option value="off">Off</option><option value="on">On</option></select></label>
        <button className="button secondary" disabled={busy} onClick={() => void save(integration)}>Save mapping</button>
        <button className="button primary" disabled={busy} onClick={() => void saveAndImport(integration)}><RefreshCw size={16} /> {busy ? "Importing..." : "Save & Import Leads"}</button>
      </div>
      <div className="inline-form">
        <label>Full Name column<input value={mapping.full_name} onChange={(event) => setMapping({ ...mapping, full_name: event.target.value })} /></label>
        <label>Phone column<input value={mapping.phone || ""} onChange={(event) => setMapping({ ...mapping, phone: event.target.value })} /></label>
        <label>Email column<input value={mapping.email || ""} onChange={(event) => setMapping({ ...mapping, email: event.target.value })} /></label>
        <button className="button primary" disabled={busy || integration.spreadsheet_id === "pending-selection"} onClick={() => void sync(integration)}><RefreshCw size={16} /> Sync Now</button>
        <button className="button secondary" disabled={busy} onClick={async () => { try { await disconnectGoogleSheet(integration.id); await load(); onNotify("Google account disconnected."); } catch (error) { onNotify(error instanceof Error ? error.message : "Disconnect failed."); } }}><Unplug size={16} /> Disconnect</button>
      </div>
      <p className="muted">Rows: {integration.total_rows_processed} · New: {integration.new_leads_imported} · Updated: {integration.existing_leads_updated} · Failed: {integration.failed_rows}</p>
    </div>)}
    {!integrations.length && <div className="empty-state"><CheckCircle2 size={18} /><p>No Google account is connected.</p><p className="muted">First-time setup requires deployed Supabase Edge Functions and Google OAuth secrets configured server-side.</p></div>}
    {runs.length > 0 && <div className="table-card"><h3>Sync history</h3><table><thead><tr><th>STARTED</th><th>STATUS</th><th>ROWS</th><th>FAILED</th></tr></thead><tbody>{runs.map((run) => <tr key={String(run.id)}><td>{String(run.started_at)}</td><td>{String(run.status)}</td><td>{String(run.total_rows)}</td><td>{String(run.failed_rows)}</td></tr>)}</tbody></table></div>}
  </section>;
}
