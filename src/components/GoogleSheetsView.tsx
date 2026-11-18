import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Link2, RefreshCw, Unplug } from "lucide-react";
import type { Membership } from "../services/workspace";
import { isOrganizationId } from "../lib/organizationId";
import { disconnectGoogleSheet, listGoogleSheetIntegrations, listGoogleSyncRuns, previewGoogleSheet, startGoogleOAuth, syncGoogleSheet, updateGoogleSheetSettings, type GoogleSheetIntegration, type GoogleSheetSyncResult } from "../services/googleSheets";
import { googleSheetsErrorMessage, parseGoogleSpreadsheetReference, type GoogleLeadMapping } from "../lib/googleSheetsSync";

const defaultMapping: GoogleLeadMapping = { full_name: "Full Name", phone: "Phone", email: "Email", city: "City", state: "State", source: "Source" };

function formatSyncResult(result: GoogleSheetSyncResult) {
  const summary = `${result.newLeads} new leads imported; ${result.updatedLeads} updated; ${result.failedRows} failed.`;
  const details = (result.errors ?? []).slice(0, 3).map(({ row, error }) => `Row ${row}: ${error}`).join(" · ");
  return details ? `${summary} First errors: ${details}` : summary;
}

function formatRunErrors(value: unknown) {
  if (!Array.isArray(value)) return "—";
  return value.slice(0, 3).map((item) => {
    if (typeof item !== "object" || item === null) return "";
    const row = "row" in item && typeof item.row === "number" ? `Row ${item.row}: ` : "";
    const message = "error" in item && typeof item.error === "string" ? item.error : "";
    return `${row}${message}`;
  }).filter(Boolean).join(" · ") || "—";
}

export function GoogleSheetsView({ membership, onNotify }: { membership: Membership; onNotify: (message: string) => void }) {
  const [integrations, setIntegrations] = useState<GoogleSheetIntegration[]>([]);
  const [runs, setRuns] = useState<Array<Record<string, unknown>>>([]);
  const [spreadsheetInput, setSpreadsheetInput] = useState("");
  const [worksheetName, setWorksheetName] = useState("Sheet1");
  const [mapping, setMapping] = useState<GoogleLeadMapping>(defaultMapping);
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [previewedSpreadsheetId, setPreviewedSpreadsheetId] = useState("");
  const [previewedWorksheetId, setPreviewedWorksheetId] = useState("");
  const [previewedWorksheetName, setPreviewedWorksheetName] = useState("");
  const [busy, setBusy] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const validOrganizationId = isOrganizationId(membership.organization_id);
  const load = async (preservePreview = false) => {
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
      const loadedMapping = firstIntegration?.column_mapping ?? defaultMapping;
      setMapping(loadedMapping);
      setSelectedColumns(Array.isArray(loadedMapping.visible_columns) ? loadedMapping.visible_columns : []);
      if (!preservePreview && (firstIntegration?.spreadsheet_id !== previewedSpreadsheetId
        || (Boolean(previewedWorksheetId) && firstIntegration?.worksheet_id !== previewedWorksheetId))) {
        setAvailableColumns([]);
        setPreviewedSpreadsheetId("");
        setPreviewedWorksheetId("");
        setPreviewedWorksheetName("");
      }
      setRuns(await listGoogleSyncRuns(membership.organization_id));
    }
    catch (error) { onNotify(googleSheetsErrorMessage(error, "Google Sheets data could not be loaded.")); }
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
      onNotify(googleSheetsErrorMessage(error, "Google authorization could not start."));
    } finally { setBusy(false); }
  };
  const saveSettings = async (integration: GoogleSheetIntegration, autoSync = integration.auto_sync, input = spreadsheetInput, mappingToSave = mapping, worksheetNameToSave = worksheetName) => {
    const reference = parseGoogleSpreadsheetReference(input);
    await updateGoogleSheetSettings(integration.id, { spreadsheet_id: reference.spreadsheetId, worksheet_id: reference.worksheetId, worksheet_name: worksheetNameToSave.trim() || "Sheet1", column_mapping: mappingToSave, auto_sync: autoSync });
    setSpreadsheetInput(reference.spreadsheetId);
    return reference;
  };
  const updateSelectedColumns = (columns: string[]) => {
    setSelectedColumns(columns);
    setMapping((current) => ({ ...current, visible_columns: columns }));
  };
  const save = async (integration: GoogleSheetIntegration, autoSync = integration.auto_sync) => {
    setBusy(true);
    try { await saveSettings(integration, autoSync); await load(); onNotify("Google Sheets mapping saved."); }
    catch (error) { onNotify(googleSheetsErrorMessage(error, "Google Sheets settings could not be saved.")); } finally { setBusy(false); }
  };
  const preview = async (integration: GoogleSheetIntegration, input = spreadsheetInput, autoImport = false) => {
    setBusy(true);
    try {
      const currentReference = parseGoogleSpreadsheetReference(input);
      const isDifferentSheet = currentReference.spreadsheetId !== integration.spreadsheet_id
        || Boolean(currentReference.worksheetId && currentReference.worksheetId !== integration.worksheet_id);
      const requestedWorksheetName = isDifferentSheet && !currentReference.worksheetId ? "Sheet1" : worksheetName;
      if (requestedWorksheetName !== worksheetName) setWorksheetName(requestedWorksheetName);
      if (isDifferentSheet) {
        setAvailableColumns([]);
        setSelectedColumns([]);
        setPreviewedSpreadsheetId("");
        setPreviewedWorksheetId("");
        setPreviewedWorksheetName("");
      }
      await saveSettings(integration, integration.auto_sync, input, mapping, requestedWorksheetName);
      const result = await previewGoogleSheet(integration.id);
      const configuredColumns = isDifferentSheet ? undefined : mapping.visible_columns;
      const nextSelectedColumns = configuredColumns === undefined
        ? result.headers
        : result.headers.filter((column) => configuredColumns.includes(column));
      const mappingToSave = { ...mapping, visible_columns: nextSelectedColumns };
      await updateGoogleSheetSettings(integration.id, {
        spreadsheet_id: currentReference.spreadsheetId,
        worksheet_id: result.worksheetId,
        worksheet_name: result.worksheetName,
        column_mapping: mappingToSave,
        auto_sync: integration.auto_sync,
      });
      setSpreadsheetInput(currentReference.spreadsheetId);
      setAvailableColumns(result.headers);
      setPreviewedSpreadsheetId(currentReference.spreadsheetId);
      setPreviewedWorksheetId(result.worksheetId);
      setPreviewedWorksheetName(result.worksheetName);
      setWorksheetName(result.worksheetName);
      updateSelectedColumns(nextSelectedColumns);
      if (autoImport && result.headers.length && nextSelectedColumns.length) {
        onNotify(`${nextSelectedColumns.length} sheet columns selected automatically. Syncing leads...`);
        const syncResult = await syncGoogleSheet(integration.id, true);
        await load(true);
        onNotify(formatSyncResult(syncResult));
      } else {
        onNotify(result.headers.length
          ? `Found ${result.headers.length} columns. Choose which fields to show on leads, then import.`
          : "No column headers were found in the selected worksheet.");
      }
    } catch (error) {
      if (autoImport) await load(true);
      onNotify(googleSheetsErrorMessage(error, "Sheet columns could not be loaded."));
    } finally { setBusy(false); }
  };
  const saveAndImport = async (integration: GoogleSheetIntegration, input = spreadsheetInput) => {
    setBusy(true);
    try {
      if (!availableColumns.length || !previewedSpreadsheetId) throw new Error("Load the sheet columns before importing.");
      const currentReference = parseGoogleSpreadsheetReference(input);
      if (currentReference.spreadsheetId !== previewedSpreadsheetId
        || (currentReference.worksheetId && currentReference.worksheetId !== previewedWorksheetId)
        || (!currentReference.worksheetId && worksheetName.trim() && worksheetName.trim() !== previewedWorksheetName)) {
        throw new Error("The spreadsheet or worksheet changed. Load its columns again before importing.");
      }
      if (!selectedColumns.length) throw new Error("Select at least one column to show on leads.");
      const mappingToSave = { ...mapping, visible_columns: selectedColumns };
      await saveSettings(integration, integration.auto_sync, input, mappingToSave);
      const result = await syncGoogleSheet(integration.id, true);
      await load();
      onNotify(formatSyncResult(result));
    } catch (error) {
      await load();
      onNotify(googleSheetsErrorMessage(error, "Google Sheets import failed."));
    } finally { setBusy(false); }
  };
  const sync = async (integration: GoogleSheetIntegration) => {
    await saveAndImport(integration);
  };
  return <section className="card">
    <div className="card-header">
      <div>
        <p className="eyebrow">GOOGLE SHEETS</p>
        <h2>Live lead sync</h2>
        <p>Connect Google, paste a sheet link, choose columns, then sync them into leads. OAuth tokens stay server-side.</p>
      </div>
      <button className="button primary" disabled={busy || !validOrganizationId || !["company_owner", "organization_admin"].includes(membership.role)} onClick={() => void connect()}><Link2 size={16} /> Connect Google Account</button>
    </div>
    {!validOrganizationId && <p className="profile-error" role="alert">An active organization could not be verified. Reload or sign in again before connecting.</p>}
    {integrations.map((integration) => <div className="operations-form" key={integration.id}>
      <div className="card-header"><strong>{integration.provider_account_email || "Google account"}</strong><span className="pending-pill">{integration.status}</span></div>
      {integration.spreadsheet_id === "pending-selection" && <p className="muted">After Google authorization, paste a Google Sheets link to load its available columns.</p>}
      <div className="inline-form">
        <label>Google Sheets link or ID<input value={spreadsheetInput} onChange={(event) => setSpreadsheetInput(event.target.value)} onPaste={(event) => { const pasted = event.clipboardData.getData("text").trim(); if (pasted) { event.preventDefault(); setSpreadsheetInput(pasted); void preview(integration, pasted, true); } }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void preview(integration, spreadsheetInput, true); } }} placeholder="https://docs.google.com/spreadsheets/d/..." /></label>
        <label>Worksheet / tab<input value={worksheetName} onChange={(event) => setWorksheetName(event.target.value)} placeholder="Sheet1" /></label>
        <label>Automatic sync<select value={integration.auto_sync ? "on" : "off"} onChange={(event) => void save(integration, event.target.value === "on")}><option value="off">Off</option><option value="on">On</option></select></label>
        <button className="button secondary" disabled={busy} onClick={() => void save(integration)}>Save mapping</button>
        <button className="button secondary" disabled={busy} onClick={() => void preview(integration)}><RefreshCw size={16} /> {busy ? "Loading..." : "Load sheet columns"}</button>
        <button className="button primary" disabled={busy || !availableColumns.length || !selectedColumns.length} onClick={() => void saveAndImport(integration)}><RefreshCw size={16} /> {busy ? "Importing..." : "Save & Import Leads"}</button>
      </div>
      {availableColumns.length > 0 && <fieldset className="sheet-column-picker">
        <legend>Choose fields to show on leads ({selectedColumns.length} of {availableColumns.length})</legend>
        <div className="sheet-column-options">{availableColumns.map((column) => <label key={column}><input type="checkbox" checked={selectedColumns.includes(column)} onChange={(event) => updateSelectedColumns(event.target.checked ? [...selectedColumns, column] : selectedColumns.filter((selected) => selected !== column))} /><span>{column}</span></label>)}</div>
        <p className="muted">Columns come directly from the first row of the selected worksheet. Chosen fields will appear in each imported lead’s details.</p>
      </fieldset>}
      <div className="inline-form">
        <label>Full Name column<input value={mapping.full_name} onChange={(event) => setMapping({ ...mapping, full_name: event.target.value })} /></label>
        <label>Phone column<input value={mapping.phone || ""} onChange={(event) => setMapping({ ...mapping, phone: event.target.value })} /></label>
        <label>Email column<input value={mapping.email || ""} onChange={(event) => setMapping({ ...mapping, email: event.target.value })} /></label>
        <button className="button primary" disabled={busy || integration.spreadsheet_id === "pending-selection" || !availableColumns.length || !selectedColumns.length} onClick={() => void sync(integration)}><RefreshCw size={16} /> Sync Now</button>
        <button className="button secondary" disabled={busy} onClick={async () => { try { await disconnectGoogleSheet(integration.id); await load(); onNotify("Google account disconnected."); } catch (error) { onNotify(googleSheetsErrorMessage(error, "Disconnect failed.")); } }}><Unplug size={16} /> Disconnect</button>
      </div>
      <p className="muted">Rows: {integration.total_rows_processed} · New: {integration.new_leads_imported} · Updated: {integration.existing_leads_updated} · Failed: {integration.failed_rows}</p>
    </div>)}
    {!integrations.length && <div className="empty-state"><CheckCircle2 size={18} /><p>No Google account is connected.</p><p className="muted">First-time setup requires deployed Supabase Edge Functions and Google OAuth secrets configured server-side.</p></div>}
    {runs.length > 0 && <div className="table-card"><h3>Sync history</h3><table><thead><tr><th>STARTED</th><th>STATUS</th><th>ROWS</th><th>FAILED</th><th>DETAILS</th></tr></thead><tbody>{runs.map((run) => <tr key={String(run.id)}><td>{String(run.started_at)}</td><td>{String(run.status)}</td><td>{String(run.total_rows)}</td><td>{String(run.failed_rows)}</td><td>{formatRunErrors(run.errors)}</td></tr>)}</tbody></table></div>}
  </section>;
}
