import { useEffect, useMemo, useState } from "react";
import { Building2, Check, Plus, ShieldCheck, Users, X } from "lucide-react";
import { PlatformUserManagementView } from "./PlatformUserManagementView";
import { SubscriptionManagementView } from "./SubscriptionManagementView";
import type { Membership } from "../services/workspace";
import { createPlatformCompany, getPaymentGatewayOverview, getPlatformStats, listPlatformAudit, listPlatformCompanies, listPlatformPlans, listPlatformSubscriptions, updatePlatformCompany, type PaymentGatewayOverview, type PlatformAudit, type PlatformCompany, type PlatformPlan, type PlatformStats, type PlatformSubscription } from "../services/platform";

export function PlatformAdminView({ membership, onNotify }: { membership: Membership; onNotify: (message: string) => void }) {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [companies, setCompanies] = useState<PlatformCompany[]>([]);
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [subscriptions, setSubscriptions] = useState<PlatformSubscription[]>([]);
  const [audit, setAudit] = useState<PlatformAudit[]>([]);
  const [gateway, setGateway] = useState<PaymentGatewayOverview | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "" });
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [nextStats, nextCompanies, nextPlans, nextSubscriptions, nextAudit, nextGateway] = await Promise.all([
        getPlatformStats(), listPlatformCompanies(), listPlatformPlans(), listPlatformSubscriptions(), listPlatformAudit(), getPaymentGatewayOverview(),
      ]);
      setStats(nextStats); setCompanies(nextCompanies); setPlans(nextPlans); setSubscriptions(nextSubscriptions); setAudit(nextAudit); setGateway(nextGateway);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Platform data could not be loaded.");
    }
  };
  useEffect(() => { if (membership.role === "super_admin") void load(); }, [membership.role]);
  const filteredCompanies = useMemo(() => companies.filter((company) => `${company.name} ${company.slug}`.toLowerCase().includes(query.toLowerCase())), [companies, query]);
  const create = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true);
    try { await createPlatformCompany(form.name, form.slug); setForm({ name: "", slug: "" }); setShowForm(false); await load(); onNotify("Company created."); }
    catch (error) { onNotify(error instanceof Error ? error.message : "Company creation failed."); }
    finally { setBusy(false); }
  };
  if (membership.role !== "super_admin") return <section className="card pending-module"><ShieldCheck size={24} /><h2>Platform administration is restricted.</h2><p className="muted">A Super Admin membership is required.</p></section>;
  return <><PageHeader eyebrow="PLATFORM ADMINISTRATION" title="Super Admin dashboard" description="Platform-level metrics and company administration without automatic private lead access." action={<button className="button primary" onClick={() => setShowForm(true)}><Plus size={16} /> Create company</button>} />
    <div className="stats-grid">{[["Companies", stats?.companies], ["Active", stats?.activeCompanies], ["Trial", stats?.trialCompanies], ["Suspended", stats?.suspendedCompanies], ["Users", stats?.users], ["Active subscriptions", stats?.activeSubscriptions], ["Expired subscriptions", stats?.expiredSubscriptions], ["MRR", stats ? stats.recurringRevenue.toFixed(2) : "—"]].map(([label, value]) => <div className="stat-card" key={String(label)}><div className="stat-top"><span>{label}</span><Building2 size={17} /></div><strong>{value ?? "—"}</strong><small>Authorized platform data</small></div>)}</div>
    <div className="dashboard-grid"><section className="card table-card"><div className="card-header"><div><h2>Companies</h2><p>Activation changes require an explicit action.</p></div><input placeholder="Search companies" value={query} onChange={(event) => setQuery(event.target.value)} /></div><table><thead><tr><th>COMPANY</th><th>SLUG</th><th>STATUS</th><th>CREATED</th><th>ACTION</th></tr></thead><tbody>{filteredCompanies.map((company) => <tr key={company.id}><td>{company.name}</td><td>{company.slug}</td><td>{company.is_active ? "Active" : "Suspended"}</td><td>{new Date(company.created_at).toLocaleDateString()}</td><td><button className="button secondary" disabled={busy} onClick={async () => { const reason = window.prompt(`Reason to ${company.is_active ? "suspend" : "activate"} ${company.name}`); if (!reason?.trim()) return onNotify("A reason is required."); setBusy(true); try { await updatePlatformCompany(company.id, { is_active: !company.is_active, reason }); await load(); onNotify("Company status updated."); } catch (error) { onNotify(error instanceof Error ? error.message : "Company status update failed."); } finally { setBusy(false); } }}>{company.is_active ? "Suspend" : "Activate"}</button></td></tr>)}</tbody></table></section>
      <section className="card table-card"><div className="card-header"><div><h2>Subscription plans</h2><p>Plans and limits from configured records.</p></div><Users size={18} /></div><table><thead><tr><th>PLAN</th><th>MONTHLY</th><th>USERS</th><th>LEADS</th></tr></thead><tbody>{plans.map((plan) => <tr key={plan.id}><td>{plan.name}</td><td>{Number(plan.price_monthly).toFixed(2)}</td><td>{plan.max_users ?? "Unlimited"}</td><td>{plan.max_leads ?? "Unlimited"}</td></tr>)}</tbody></table></section></div>
    <SubscriptionManagementView companies={companies} plans={plans} subscriptions={subscriptions} onChanged={load} onNotify={onNotify} />
    <section className="card"><div className="card-header"><div><h2>YouPI payment gateway</h2><p>{gateway?.enabled ? "Configured gateway status" : "Disabled until verified credentials and sandbox checks are available."}</p></div><ShieldCheck size={18} /></div><p className="muted">Status: {gateway?.connection_status || "not_configured"} · Test mode: {gateway?.test_mode ? "Yes" : "No"}</p></section>
    <section className="card table-card"><div className="card-header"><div><h2>Platform audit</h2><p>Platform actions only; company lead data is excluded.</p></div><ShieldCheck size={18} /></div><table><thead><tr><th>ACTION</th><th>ENTITY</th><th>TIME</th></tr></thead><tbody>{audit.map((entry) => <tr key={entry.id}><td>{entry.action}</td><td>{entry.entity_type}</td><td>{new Date(entry.created_at).toLocaleString()}</td></tr>)}</tbody></table></section>
    <PlatformUserManagementView onNotify={onNotify} />
    {showForm && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowForm(false)}><form className="modal" onSubmit={create}><div className="modal-head"><h2>Create company</h2><button type="button" className="icon-button" onClick={() => setShowForm(false)}><X size={18} /></button></div><label>Company name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>Slug<input required pattern="[a-z0-9-]+" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} /></label><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setShowForm(false)}>Cancel</button><button className="button primary" disabled={busy}><Check size={16} /> Create</button></div></form></div>}</>;
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{description}</p></div>{action}</div>;
}
