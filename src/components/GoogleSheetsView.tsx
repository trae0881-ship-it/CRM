import { useEffect, useState } from "react";
import { CheckCircle2, Link2, RefreshCw, Unplug } from "lucide-react";
import type { Membership } from "../services/workspace";
import { disconnectGoogleSheet, listGoogleSheetIntegrations, listGoogleSyncRuns, startGoogleOAuth, syncGoogleSheet, updateGoogleSheetSettings, type GoogleSheetIntegration } from "../services/googleSheets";
import type { GoogleLeadMapping } from "../lib/googleSheetsSync";

export function GoogleSheetsView({ membership, onNotify }: { membership: Membership; onNotify: (message: string) => void }) {
  const [integrations, setIntegrations] = useState<GoogleSheetIntegration[]>([]);
  const [runs, setRuns] = useState<Array<Record<string, unknown>>>([]);
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [worksheetName, setWorksheetName] = useState("Sheet1");
  const [mapping, setMapping] = useState<GoogleLeadMapping>({ full_name: "Full Name", phone: "Phone", email: "Email", city: "City", state: "State", source: "Source" });
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try { setIntegrations(await listGoogleSheetIntegrations(membership.organization_id)); setRuns(await listGoogleSyncRuns(membership.organization_id)); }
    catch (error) { onNotify(error instanceof Error ? error.message : "Google Sheets data could not be loaded."); }
  };
  useEffect(() => { void load(); }, [membership.organization_id]);
  const connect = async () => {
    setBusy(true);
    try {
      const { authorizationUrl } = await startGoogleOAuth(membership.organization_id);
      window.open(authorizationUrl, "_blank", "noopener,noreferrer");
      onNotify("Complete Google authorization in the new window, then refresh this section.");
    } catch (error) { onNotify(error instanceof Error ? error.message : "Google authorization could not start."); } finally { setBusy(false); }
  };
  const save = async (integration: GoogleSheetIntegration, autoSync = integration.auto_sync) => {
    if (!spreadsheetId.trim()) return onNotify("Enter the Google Spreadsheet ID before saving.");
    setBusy(true);
    try { await updateGoogleSheetSettings(integration.id, { spreadsheet_id: spreadsheetId.trim(), worksheet_name: worksheetName.trim(), column_mapping: mapping, auto_sync: autoSync }); await load(); onNotify("Google Sheets mapping saved."); }
    catch (error) { onNotify(error instanceof Error ? error.message : "Google Sheets settings could not be saved."); } finally { setBusy(false); }
  };
  const sync = async (integration: GoogleSheetIntegration) => {
    setBusy(true);
    try { const result = await syncGoogleSheet(integration.id, true); await load(); onNotify(`${result.newLeads} new leads imported; ${result.updatedLeads} updated.`); }
    catch (error) { onNotify(error instanceof Error ? error.message : "Google Sheets sync failed."); } finally { setBusy(false); }
  };
  return <section className="card"><div className="card-header"><div><p className="eyebrow">GOOGLE SHEETS</p><h2>Live lead sync</h2><p>OAuth tokens stay server-side. Meta Lead Ads remains Coming Soon — Not Connected.</p></div><button className="button primary" disabled={busy || !["company_owner", "organization_admin"].includes(membership.role)} onClick={connect}><Link2 size={16} /> Connect Google Account</button></div>{integrations.map((integration) => <div className="operations-form" key={integration.id}><div className="card-header"><strong>{integration.provider_account_email || "Google account"}</strong><span className="pending-pill">{integration.status}</span></div>{integration.spreadsheet_id === "pending-selection" && <p className="muted">Choose a spreadsheet ID and worksheet before syncing.</p>}<div className="inline-form"><label>Spreadsheet ID<input value={integration.spreadsheet_id === "pending-selection" ? spreadsheetId : integration.spreadsheet_id} onChange={(event) => setSpreadsheetId(event.target.value)} placeholder="Google Spreadsheet ID" /></label><label>Worksheet / tab<input value={integration.worksheet_name || worksheetName} onChange={(event) => setWorksheetName(event.target.value)} /></label><label>Automatic sync<select value={integration.auto_sync ? "on" : "off"} onChange={(event) => void save(integration, event.target.value === "on")}><option value="off">Off</option><option value="on">On</option></select></label><button className="button secondary" disabled={busy} onClick={() => void save(integration)}>Save mapping</button></div><div className="inline-form"><label>Full Name column<input value={mapping.full_name} onChange={(event) => setMapping({ ...mapping, full_name: event.target.value })} /></label><label>Phone column<input value={mapping.phone || ""} onChange={(event) => setMapping({ ...mapping, phone: event.target.value })} /></label><label>Email column<input value={mapping.email || ""} onChange={(event) => setMapping({ ...mapping, email: event.target.value })} /></label><button className="button primary" disabled={busy || integration.spreadsheet_id === "pending-selection"} onClick={() => void sync(integration)}><RefreshCw size={16} /> Sync Now</button><button className="button secondary" disabled={busy} onClick={async () => { try { await disconnectGoogleSheet(integration.id); await load(); onNotify("Google account disconnected."); } catch (error) { onNotify(error instanceof Error ? error.message : "Disconnect failed."); } }}><Unplug size={16} /> Disconnect</button></div><p className="muted">Rows: {integration.total_rows_processed} · New: {integration.new_leads_imported} · Updated: {integration.existing_leads_updated} · Failed: {integration.failed_rows}</p></div>)}{!integrations.length && <div className="empty-state"><CheckCircle2 size={18} /><p>No Google account is connected.</p></div>}{runs.length > 0 && <div className="table-card"><h3>Sync history</h3><table><thead><tr><th>STARTED</th><th>STATUS</th><th>ROWS</th><th>FAILED</th></tr></thead><tbody>{runs.map((run) => <tr key={String(run.id)}><td>{String(run.started_at)}</td><td>{String(run.status)}</td><td>{String(run.total_rows)}</td><td>{String(run.failed_rows)}</td></tr>)}</tbody></table></div>}</section>;
}
