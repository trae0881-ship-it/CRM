import { useEffect, useState } from "react";
import { Activity, BookOpen, Save, Settings, ShieldAlert } from "lucide-react";
import {
  getOrganizationSettings,
  listOrganizationAudit,
  saveOrganizationSettings,
  type OrganizationAuditEntry,
  type OrganizationSettings,
} from "../services/workspace";

type Props = { organizationId: string; onNotify: (message: string) => void };
type SettingsDraft = Pick<OrganizationSettings, "contact_email" | "contact_phone" | "address" | "time_zone">;
const emptySettings: SettingsDraft = { contact_email: "", contact_phone: "", address: "", time_zone: "UTC" };

export function OrganizationAdminControls({ organizationId, onNotify }: Props) {
  const [settings, setSettings] = useState<SettingsDraft>(emptySettings);
  const [audit, setAudit] = useState<OrganizationAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrorMessage("");
    void Promise.all([
      getOrganizationSettings(organizationId),
      listOrganizationAudit(organizationId),
    ]).then(([savedSettings, entries]) => {
      if (!active) return;
      if (savedSettings) {
        setSettings({
          contact_email: savedSettings.contact_email ?? "",
          contact_phone: savedSettings.contact_phone ?? "",
          address: savedSettings.address ?? "",
          time_zone: savedSettings.time_zone,
        });
      } else {
        setSettings(emptySettings);
      }
      setAudit(entries);
    }).catch((error: unknown) => {
      if (active) setErrorMessage(error instanceof Error ? error.message : "Organization controls could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [organizationId]);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage("");
    try {
      await saveOrganizationSettings(organizationId, settings);
      onNotify("Organization settings saved.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Organization settings could not be saved.";
      setErrorMessage(message);
      onNotify(message);
    } finally {
      setSaving(false);
    }
  };

  return <>
    <section className="card operations-form">
      <div className="card-header"><div><h2><Settings size={17} /> Organization settings</h2><p>Contact details and the organization time zone. Changes are authorized by Supabase RLS.</p></div></div>
      {loading ? <p className="muted" role="status">Loading organization settings…</p> : <form className="organization-settings-form" onSubmit={(event) => void save(event)}>
        <label>Contact email<input type="email" maxLength={254} value={settings.contact_email ?? ""} onChange={(event) => setSettings((current) => ({ ...current, contact_email: event.target.value }))} /></label>
        <label>Contact phone<input type="tel" maxLength={32} value={settings.contact_phone ?? ""} onChange={(event) => setSettings((current) => ({ ...current, contact_phone: event.target.value }))} /></label>
        <label>Address<textarea maxLength={500} value={settings.address ?? ""} onChange={(event) => setSettings((current) => ({ ...current, address: event.target.value }))} /></label>
        <label>IANA time zone<input required maxLength={64} value={settings.time_zone} onChange={(event) => setSettings((current) => ({ ...current, time_zone: event.target.value }))} placeholder="Asia/Kolkata" /></label>
        {errorMessage && <p className="profile-error" role="alert">{errorMessage}</p>}
        <button className="button primary" disabled={saving}>{saving ? "Saving…" : <><Save size={16} /> Save settings</>}</button>
      </form>}
    </section>
    <section className="card whatsapp-setup-required" aria-labelledby="whatsapp-setup-title">
      <div className="card-header">
        <div><h2 id="whatsapp-setup-title">WhatsApp Business integration</h2><p>Business API connection for this organization</p></div>
        <span className="status pending">Not connected</span>
      </div>
      <div className="whatsapp-setup-message">
        <ShieldAlert size={20} />
        <div><strong>Setup required</strong><p>Adometa currently supports personal click-to-chat only. No WhatsApp Business provider, secure credential storage, or server-side verification endpoint is configured.</p></div>
      </div>
      <p className="muted">No access tokens or webhook secrets are collected or stored on this screen. Connection status can change only after a supported provider is implemented and verified.</p>
      <a className="button secondary" href="/admin/docs#whatsapp-business-setup"><BookOpen size={16} /> Read the WhatsApp setup guide</a>
    </section>
    <section className="card table-card">
      <div className="card-header"><div><h2><Activity size={17} /> Organization activity</h2><p>Latest 50 organization audit events visible to administrators and auditors.</p></div></div>
      {loading ? <p className="muted" role="status">Loading activity…</p> : errorMessage ? <p className="profile-error" role="alert">{errorMessage}</p> : audit.length ? <div className="table-scroll"><table><thead><tr><th>ACTION</th><th>RECORD TYPE</th><th>TIME</th></tr></thead><tbody>{audit.map((entry) => <tr key={entry.id}><td>{entry.action.replace(/_/g, " ")}</td><td>{entry.entity_type}</td><td>{new Date(entry.created_at).toLocaleString()}</td></tr>)}</tbody></table></div> : <p className="muted">No organization activity has been recorded yet.</p>}
    </section>
  </>;
}
