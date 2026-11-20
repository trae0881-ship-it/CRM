import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Link2, Plus, RefreshCw, Unplug } from "lucide-react";
import type { Membership } from "../services/workspace";
import { isOrganizationId } from "../lib/organizationId";
import {
  addGoogleSheetIntegration,
  disconnectGoogleAccount,
  listGoogleSheetIntegrations,
  listGoogleSyncRuns,
  previewGoogleSheet,
  startGoogleOAuth,
  syncGoogleSheet,
  updateGoogleSheetSettings,
  type GoogleSheetIntegration,
  type GoogleSheetSyncResult,
} from "../services/googleSheets";
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
  const [newAgencyName, setNewAgencyName] = useState("");
  const [templateIntegrationId, setTemplateIntegrationId] = useState("");
  const [selectedAgency, setSelectedAgency] = useState("all");
  const [busy, setBusy] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const validOrganizationId = isOrganizationId(membership.organization_id);
  const canManage = ["company_owner", "organization_admin"].includes(membership.role);

  const load = async () => {
    if (!validOrganizationId) {
      onNotify("Your active organization could not be verified. Reload and sign in again before connecting Google Sheets.");
      return;
    }
    try {
      const [loadedIntegrations, loadedRuns] = await Promise.all([
        listGoogleSheetIntegrations(membership.organization_id),
        listGoogleSyncRuns(membership.organization_id),
      ]);
      setIntegrations(loadedIntegrations);
      setRuns(loadedRuns);
      setTemplateIntegrationId((current) => loadedIntegrations.some((item) => item.id === current && item.status !== "disconnected")
        ? current
        : loadedIntegrations.find((item) => item.status !== "disconnected")?.id ?? "");
      setSelectedAgency((current) => current === "all" || loadedIntegrations.some((item) => (item.agency_name?.trim() || "Unassigned").toLocaleLowerCase() === current) ? current : "all");
    } catch (error) {
      onNotify(googleSheetsErrorMessage(error, "Google Sheets data could not be loaded."));
    }
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
    if (!validOrganizationId) return onNotify("Your active organization could not be verified. Reload and sign in again before connecting Google Sheets.");
    if (!canManage) return onNotify("Only a company owner or organization admin can connect Google Sheets.");
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

  const addSheet = async (agencyName: string) => {
    if (!templateIntegrationId) return onNotify("Connect a Google account before adding a sheet.");
    setBusy(true);
    try {
      await addGoogleSheetIntegration(templateIntegrationId, agencyName);
      setNewAgencyName("");
      if (agencyName) setSelectedAgency(agencyName.trim().toLocaleLowerCase());
      await load();
      onNotify(agencyName ? `Sheet setup added for ${agencyName}.` : "Another tab setup added.");
    } catch (error) {
      onNotify(googleSheetsErrorMessage(error, "A new sheet could not be added."));
    } finally { setBusy(false); }
  };

  const disconnectAccount = async (integrationId: string) => {
    setBusy(true);
    try {
      await disconnectGoogleAccount(integrationId);
      await load();
      onNotify("Google account disconnected. Its linked agency sheets are now paused.");
    } catch (error) {
      onNotify(googleSheetsErrorMessage(error, "Google account disconnect failed."));
    } finally { setBusy(false); }
  };

  const getIntegrationLabel = (integrationId: unknown) => {
    const integration = integrations.find((item) => item.id === integrationId);
    return [integration?.agency_name, integration?.worksheet_name].filter(Boolean).join(" · ") || "Google Sheet";
  };
  const agencies = Array.from(integrations.reduce((items, integration) => {
    const name = integration.agency_name?.trim() || "Unassigned";
    const key = name.toLocaleLowerCase();
    const current = items.get(key);
    items.set(key, { name, count: (current?.count ?? 0) + 1 });
    return items;
  }, new Map<string, { name: string; count: number }>()).entries());
  const visibleIntegrations = selectedAgency === "all"
    ? integrations
    : integrations.filter((integration) => (integration.agency_name?.trim() || "Unassigned").toLocaleLowerCase() === selectedAgency);
  const accounts = Array.from(visibleIntegrations.reduce((items, integration) => {
    const email = integration.provider_account_email?.trim() || "";
    const key = email ? email.toLocaleLowerCase() : `integration:${integration.id}`;
    const current = items.get(key);
    items.set(key, { email, integrations: [...(current?.integrations ?? []), integration] });
    return items;
  }, new Map<string, { email: string; integrations: GoogleSheetIntegration[] }>()).values());

  return <section className="card google-sheets-card">
    <div className="card-header">
      <div>
        <p className="eyebrow">GOOGLE SHEETS</p>
        <h2>Agency lead sheets</h2>
        <p>Manage agency spreadsheets and their tabs from one place. Imported leads keep their agency attribution for reports.</p>
      </div>
      <button className="button primary" disabled={busy || !validOrganizationId || !canManage} onClick={() => void connect()}><Link2 size={16} /> {integrations.length ? "Connect another Google account" : "Connect Google account"}</button>
    </div>
    {!validOrganizationId && <p className="profile-error" role="alert">An active organization could not be verified. Reload or sign in again before connecting.</p>}

    <div className="agency-sheet-add">
      <div>
        <h3>Add an agency</h3>
        <p className="muted">Each agency gets its own spreadsheet source. You can add more tabs inside it.</p>
      </div>
      <div className="inline-form">
        <label>Google account<select value={templateIntegrationId} onChange={(event) => setTemplateIntegrationId(event.target.value)} disabled={!integrations.some((item) => item.status !== "disconnected")}>
          {integrations.filter((item) => item.status !== "disconnected").map((item) => <option key={item.id} value={item.id}>{item.provider_account_email || "Connected Google account"}</option>)}
        </select></label>
        <label>Agency name<input maxLength={120} value={newAgencyName} onChange={(event) => setNewAgencyName(event.target.value)} placeholder="e.g. North Star Realty" /></label>
        <button className="button secondary" disabled={busy || !newAgencyName.trim() || !templateIntegrationId} onClick={() => void addSheet(newAgencyName.trim())}><Plus size={16} /> Add agency spreadsheet</button>
      </div>
      {!integrations.some((item) => item.status !== "disconnected") && <small className="agency-sheet-help">Connect a Google account first to add its agency spreadsheet.</small>}
    </div>

    {!integrations.some((item) => item.status !== "disconnected") && <div className="empty-state"><CheckCircle2 size={18} /><p>No active Google account is connected.</p><p className="muted">Connect Google first. Then you can add multiple agency spreadsheets and tabs.</p></div>}

    {integrations.length > 0 && <>
      <nav className="agency-tabs" aria-label="Filter integrations by agency">
        <button type="button" className={`agency-tab${selectedAgency === "all" ? " active" : ""}`} aria-pressed={selectedAgency === "all"} onClick={() => setSelectedAgency("all")}>All agencies <span>{integrations.length}</span></button>
        {agencies.map(([key, agency]) => <button type="button" className={`agency-tab${selectedAgency === key ? " active" : ""}`} aria-pressed={selectedAgency === key} key={key} onClick={() => setSelectedAgency(key)}>{agency.name} <span>{agency.count}</span></button>)}
      </nav>
      <div className="agency-sheet-list">
        {accounts.map(({ email, integrations: accountIntegrations }) => <section className="agency-account-group" key={email ? email.toLocaleLowerCase() : accountIntegrations[0].id}>
          <div className="agency-account-heading">
            <div><p className="eyebrow">CONNECTED GOOGLE ACCOUNT</p><strong>{email || "Google account"}</strong><small>{accountIntegrations.length} agency sheet{accountIntegrations.length === 1 ? "" : "s"} in this view</small></div>
            <button className="button secondary" disabled={busy || !canManage || accountIntegrations.every((item) => item.status === "disconnected")} onClick={() => void disconnectAccount(accountIntegrations[0].id)}><Unplug size={16} /> Disconnect account</button>
          </div>
          <div className="agency-account-sheets">
            {accountIntegrations.map((integration) => <GoogleSheetSource
              key={integration.id}
              integration={integration}
              busy={busy}
              onNotify={onNotify}
              onReload={load}
              onAddTab={() => void addSheet(integration.agency_name ?? "")}
            />)}
          </div>
        </section>)}
      </div>
      {!visibleIntegrations.length && <div className="agency-tab-empty">No sheet sources are configured for this agency yet.</div>}
    </>}

    {runs.length > 0 && <div className="table-card agency-sync-history">
      <h3>Sync history</h3>
      <div className="table-scroll"><table><thead><tr><th>AGENCY / TAB</th><th>STARTED</th><th>STATUS</th><th>ROWS</th><th>FAILED</th><th>DETAILS</th></tr></thead><tbody>
        {runs.map((run) => <tr key={String(run.id)}><td>{getIntegrationLabel(run.integration_id)}</td><td>{String(run.started_at)}</td><td>{String(run.status)}</td><td>{String(run.total_rows)}</td><td>{String(run.failed_rows)}</td><td>{formatRunErrors(run.errors)}</td></tr>)}
      </tbody></table></div>
    </div>}
  </section>;
}

function GoogleSheetSource({ integration, busy, onNotify, onReload, onAddTab }: {
  integration: GoogleSheetIntegration;
  busy: boolean;
  onNotify: (message: string) => void;
  onReload: () => Promise<void>;
  onAddTab: () => void;
}) {
  const isPending = integration.spreadsheet_id.startsWith("pending-selection");
  const [spreadsheetInput, setSpreadsheetInput] = useState(isPending ? "" : integration.spreadsheet_id);
  const [worksheetName, setWorksheetName] = useState(integration.worksheet_name ?? "Sheet1");
  const [agencyName, setAgencyName] = useState(integration.agency_name ?? "");
  const [mapping, setMapping] = useState<GoogleLeadMapping>(integration.column_mapping ?? defaultMapping);
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>(Array.isArray(integration.column_mapping?.visible_columns) ? integration.column_mapping.visible_columns : []);
  const [previewedSpreadsheetId, setPreviewedSpreadsheetId] = useState("");
  const [previewedWorksheetId, setPreviewedWorksheetId] = useState("");
  const [previewedWorksheetName, setPreviewedWorksheetName] = useState("");
  const [localBusy, setLocalBusy] = useState(false);

  const saveSettings = async (input = spreadsheetInput, mappingToSave = mapping, worksheetNameToSave = worksheetName) => {
    const reference = parseGoogleSpreadsheetReference(input);
    const sameSpreadsheet = reference.spreadsheetId === integration.spreadsheet_id;
    const sameWorksheet = worksheetNameToSave.trim() === integration.worksheet_name;
    await updateGoogleSheetSettings(integration.id, {
      agency_name: agencyName.trim() || null,
      spreadsheet_id: reference.spreadsheetId,
      worksheet_id: reference.worksheetId ?? (sameSpreadsheet && sameWorksheet ? integration.worksheet_id : null),
      worksheet_name: worksheetNameToSave.trim() || "Sheet1",
      column_mapping: mappingToSave,
      auto_sync: integration.auto_sync,
    });
    return reference;
  };

  const save = async () => {
    setLocalBusy(true);
    try {
      await saveSettings();
      await onReload();
      onNotify("Agency sheet settings saved.");
    } catch (error) {
      onNotify(googleSheetsErrorMessage(error, "Google Sheets settings could not be saved."));
    } finally { setLocalBusy(false); }
  };

  const preview = async () => {
    setLocalBusy(true);
    try {
      const reference = await saveSettings();
      setAvailableColumns([]);
      setSelectedColumns([]);
      const result = await previewGoogleSheet(integration.id);
      const initialSelection = result.headers;
      const mappingToSave = { ...mapping, visible_columns: initialSelection };
      await updateGoogleSheetSettings(integration.id, {
        agency_name: agencyName.trim() || null,
        worksheet_id: result.worksheetId,
        worksheet_name: result.worksheetName,
        column_mapping: mappingToSave,
      });
      setSpreadsheetInput(reference.spreadsheetId);
      setWorksheetName(result.worksheetName);
      setAvailableColumns(result.headers);
      setSelectedColumns(initialSelection);
      setMapping(mappingToSave);
      setPreviewedSpreadsheetId(reference.spreadsheetId);
      setPreviewedWorksheetId(result.worksheetId);
      setPreviewedWorksheetName(result.worksheetName);
      onNotify(result.headers.length ? `Found ${result.headers.length} columns. Review the fields, then import.` : "No column headers were found in this tab.");
    } catch (error) {
      onNotify(googleSheetsErrorMessage(error, "Sheet columns could not be loaded."));
    } finally { setLocalBusy(false); }
  };

  const importRows = async () => {
    setLocalBusy(true);
    try {
      if (!agencyName.trim()) throw new Error("Enter an agency name before importing.");
      if (!availableColumns.length || !previewedSpreadsheetId) throw new Error("Load the sheet columns before importing.");
      const currentReference = parseGoogleSpreadsheetReference(spreadsheetInput);
      if (currentReference.spreadsheetId !== previewedSpreadsheetId
        || (currentReference.worksheetId && currentReference.worksheetId !== previewedWorksheetId)
        || worksheetName.trim() !== previewedWorksheetName) {
        throw new Error("The spreadsheet or tab changed. Load its columns again before importing.");
      }
      if (!selectedColumns.length) throw new Error("Select at least one column to show on leads.");
      const mappingToSave = { ...mapping, visible_columns: selectedColumns };
      await saveSettings(spreadsheetInput, mappingToSave, worksheetName);
      const result = await syncGoogleSheet(integration.id, true);
      await onReload();
      onNotify(formatSyncResult(result));
    } catch (error) {
      onNotify(googleSheetsErrorMessage(error, "Google Sheets import failed."));
    } finally { setLocalBusy(false); }
  };

  const disabled = busy || localBusy;
  const disconnected = integration.status === "disconnected";
  return <article className="agency-sheet-card">
    <div className="agency-sheet-heading">
      <div><p className="eyebrow">AGENCY SOURCE</p><h3>{agencyName || "Name this agency"}</h3><span>{integration.provider_account_email || "Google account"} · {integration.status}</span></div>
      {!isPending && <span className="agency-tab-badge">{worksheetName}</span>}
    </div>
    {isPending && <p className="muted">Paste a spreadsheet link and enter the worksheet tab name for this agency.</p>}
    <div className="agency-sheet-fields">
      <label>Agency name<input required maxLength={120} value={agencyName} onChange={(event) => setAgencyName(event.target.value)} placeholder="e.g. North Star Realty" /></label>
      <label>Spreadsheet link<input value={spreadsheetInput} onChange={(event) => setSpreadsheetInput(event.target.value)} placeholder="Paste Google Sheets link" /></label>
      <label>Tab name<input value={worksheetName} onChange={(event) => setWorksheetName(event.target.value)} placeholder="e.g. Leads - November" /></label>
      <label>Automatic sync<select disabled={disconnected} value={integration.auto_sync ? "on" : "off"} onChange={(event) => void updateGoogleSheetSettings(integration.id, { auto_sync: event.target.value === "on" }).then(onReload).catch((error) => onNotify(googleSheetsErrorMessage(error, "Automatic sync setting could not be saved.")))}><option value="off">Off</option><option value="on">On</option></select></label>
    </div>
    <div className="agency-sheet-actions">
      <button className="button secondary" disabled={disabled} onClick={() => void save()}>Save setup</button>
      <button className="button secondary" disabled={disabled || disconnected || !spreadsheetInput.trim()} onClick={() => void preview()}><RefreshCw size={16} /> Preview tab</button>
      <button className="button primary" disabled={disabled || disconnected || !availableColumns.length || !selectedColumns.length} onClick={() => void importRows()}><RefreshCw size={16} /> Import leads</button>
      <button className="button secondary" disabled={disabled || disconnected} onClick={onAddTab}><Plus size={16} /> Add another tab</button>
    </div>
    {availableColumns.length > 0 && <fieldset className="sheet-column-picker">
      <legend>Choose lead detail columns ({selectedColumns.length} selected)</legend>
      <div className="sheet-column-options">{availableColumns.map((column) => <label key={column}><input type="checkbox" checked={selectedColumns.includes(column)} onChange={(event) => {
        const next = event.target.checked ? [...selectedColumns, column] : selectedColumns.filter((selected) => selected !== column);
        setSelectedColumns(next);
        setMapping((current) => ({ ...current, visible_columns: next }));
      }} /><span>{column}</span></label>)}</div>
      <p className="muted">Selected columns appear on imported lead records. Agency reports use the agency name above.</p>
    </fieldset>}
    <div className="agency-field-mapping">
      <label>Full name column<input value={mapping.full_name} onChange={(event) => setMapping({ ...mapping, full_name: event.target.value })} /></label>
      <label>Phone column<input value={mapping.phone || ""} onChange={(event) => setMapping({ ...mapping, phone: event.target.value })} /></label>
      <label>Email column<input value={mapping.email || ""} onChange={(event) => setMapping({ ...mapping, email: event.target.value })} /></label>
    </div>
    <p className="muted">Rows: {integration.total_rows_processed} · New: {integration.new_leads_imported} · Updated: {integration.existing_leads_updated} · Failed: {integration.failed_rows}</p>
  </article>;
}
