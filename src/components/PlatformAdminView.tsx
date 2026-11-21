import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Check, Plus, ShieldCheck, X } from "lucide-react";
import type { Membership } from "../services/workspace";
import { createPlatformCompany, getPlatformLeadAnalytics, getPlatformStats, listPlatformAudit, listPlatformCompanies, listPlatformPlans, listPlatformSubscriptions, updatePlatformCompany, type PlatformAudit, type PlatformCompany, type PlatformLeadAnalytics, type PlatformPlan, type PlatformStats, type PlatformSubscription } from "../services/platform";
import type { PlatformAdminSection } from "../lib/roleRoutes";
import { LeadAnalyticsPanel } from "./LeadAnalyticsPanel";

const SubscriptionManagementView = lazy(() => import("./SubscriptionManagementView").then((module) => ({ default: module.SubscriptionManagementView })));
const PlatformPlanManagementView = lazy(() => import("./PlatformPlanManagementView").then((module) => ({ default: module.PlatformPlanManagementView })));
const WorkspaceRequestsView = lazy(() => import("./WorkspaceRequestsView").then((module) => ({ default: module.WorkspaceRequestsView })));
const SubscriptionChangeRequestsView = lazy(() => import("./SubscriptionChangeRequestsView").then((module) => ({ default: module.SubscriptionChangeRequestsView })));

export function PlatformAdminView({ membership, section = "dashboard", onNotify }: { membership: Membership; section?: PlatformAdminSection; onNotify: (message: string) => void }) {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [leadAnalytics, setLeadAnalytics] = useState<PlatformLeadAnalytics | null>(null);
  const [companies, setCompanies] = useState<PlatformCompany[]>([]);
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [subscriptions, setSubscriptions] = useState<PlatformSubscription[]>([]);
  const [audit, setAudit] = useState<PlatformAudit[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "" });
  const [query, setQuery] = useState("");
  const [companyStatus, setCompanyStatus] = useState("all");
  const [companyPage, setCompanyPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState("");

  const loadPlans = useCallback(async () => {
    setPlansLoading(true);
    setPlansError("");
    try {
      setPlans(await listPlatformPlans());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Subscription plans could not be loaded.";
      setPlansError(message);
      throw error;
    } finally {
      setPlansLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    const needsDashboard = section === "dashboard";
    const needsCompanies = section === "companies" || section === "subscriptions";
    const needsPlans = section === "plans" || section === "workspaces" || section === "subscriptions";
    const requests: Promise<void>[] = [];
    if (needsDashboard) {
      requests.push(getPlatformStats().then(setStats));
      requests.push(getPlatformLeadAnalytics().then(setLeadAnalytics));
      requests.push(listPlatformAudit().then(setAudit));
    }
    if (needsCompanies) requests.push(listPlatformCompanies().then(setCompanies));
    if (needsPlans) requests.push(loadPlans());
    if (section === "subscriptions") requests.push(listPlatformSubscriptions().then(setSubscriptions));
    await Promise.all(requests);
  }, [loadPlans, section]);
  useEffect(() => {
    if (membership.role === "super_admin") {
      void load().catch((error: unknown) => onNotify(error instanceof Error ? error.message : "Platform data could not be loaded."));
    }
  }, [membership.role, load, onNotify]);
  const filteredCompanies = useMemo(() => companies.filter((company) => {
    const matchesText = `${company.name} ${company.workspace_name || ""} ${company.slug}`.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = companyStatus === "all" || (companyStatus === "active" ? company.is_active : !company.is_active);
    return matchesText && matchesStatus;
  }), [companies, query, companyStatus]);
  const shownCompanies = filteredCompanies.slice(companyPage * 10, companyPage * 10 + 10);
  const isDashboard = section === "dashboard";
  const showCompanies = section === "companies";
  const showWorkspaces = section === "workspaces";
  const showPlans = section === "plans";
  const showSubscriptions = section === "subscriptions";
  const sectionTitle = section === "dashboard" ? "Super Admin dashboard"
    : section === "companies" ? "Company management"
      : section === "plans" ? "Subscription plans"
        : section === "subscriptions" ? "Subscriptions"
          : "Workspace requests";
  const create = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true);
    try { await createPlatformCompany(form.name, form.slug); setForm({ name: "", slug: "" }); setShowForm(false); await load(); onNotify("Company created."); }
    catch (error) { onNotify(error instanceof Error ? error.message : "Company creation failed."); }
    finally { setBusy(false); }
  };
  if (membership.role !== "super_admin") return <section className="card pending-module"><ShieldCheck size={24} /><h2>Platform administration is restricted.</h2><p className="muted">A Super Admin membership is required.</p></section>;
  return <><PageHeader eyebrow="PLATFORM ADMINISTRATION" title={sectionTitle} description="Platform-level controls verified against your active Super Admin membership." action={(isDashboard || section === "companies") && <button className="button primary" onClick={() => setShowForm(true)}><Plus size={16} /> Create company</button>} />
    {isDashboard && <div className="stats-grid">{[["Companies", stats?.companies], ["Active", stats?.activeCompanies], ["Trial", stats?.trialCompanies], ["Suspended", stats?.suspendedCompanies], ["Users", stats?.users], ["Organization admins", stats?.organizationAdmins], ["Super Admins", stats?.superAdmins], ["Active subscriptions", stats?.activeSubscriptions], ["Expired subscriptions", stats?.expiredSubscriptions], ["Pending requests", stats?.pendingWorkspaceRequests], ["MRR", stats ? (Object.entries(stats.recurringRevenueByCurrency).map(([currency, amount]) => `${currency} ${amount.toFixed(2)}`).join(" · ") || "No active revenue") : "—"]].map(([label, value]) => <div className="stat-card" key={String(label)}><div className="stat-top"><span>{label}</span><Building2 size={17} /></div><strong>{value ?? "—"}</strong><small>Authorized platform data</small></div>)}</div>}
    {isDashboard && leadAnalytics && <LeadAnalyticsPanel platform={leadAnalytics} title="SaaS-wide lead analytics" />}
    {isDashboard && <nav className="platform-dashboard-sections" aria-label="Platform management sections">
      <a href="/saas/admin/companies"><strong>Companies</strong><small>Manage organizations and access</small></a>
      <a href="/saas/admin/workspaces"><strong>Workspace requests</strong><small>Review onboarding requests</small></a>
      <a href="/saas/admin/plans"><strong>Subscription plans</strong><small>Manage available plans</small></a>
      <a href="/saas/admin/subscriptions"><strong>Subscriptions</strong><small>Review billing and changes</small></a>
    </nav>}
    {showCompanies && <section className="card table-card"><div className="card-header"><div><h2>Companies</h2><p>Activation changes require an explicit action and subscription validation.</p></div></div><div className="table-toolbar"><input aria-label="Search companies" placeholder="Search companies" value={query} onChange={(event) => { setQuery(event.target.value); setCompanyPage(0); }} /><select aria-label="Filter companies by status" value={companyStatus} onChange={(event) => { setCompanyStatus(event.target.value); setCompanyPage(0); }}><option value="all">All companies</option><option value="active">Active</option><option value="suspended">Suspended</option></select></div><div className="table-scroll"><table><thead><tr><th>COMPANY / WORKSPACE</th><th>SLUG</th><th>STATUS</th><th>CREATED</th><th>ACTION</th></tr></thead><tbody>{shownCompanies.map((company) => <tr key={company.id}><td><strong>{company.name}</strong><small className="table-secondary">{company.workspace_name || "—"}</small></td><td>{company.slug}</td><td>{company.is_active ? "Active" : company.approval_status.replace(/_/g, " ")}</td><td>{new Date(company.created_at).toLocaleDateString()}</td><td><button className="button secondary" disabled={busy || (!company.is_active && company.approval_status === "rejected")} onClick={async () => { const reason = window.prompt(`Reason to ${company.is_active ? "suspend" : "activate"} ${company.name}`); if (!reason?.trim()) return onNotify("A reason is required."); setBusy(true); try { await updatePlatformCompany(company.id, { is_active: !company.is_active, reason }); await load(); onNotify("Company status updated."); } catch (error) { onNotify(error instanceof Error ? error.message : "Company status update failed."); } finally { setBusy(false); } }}>{company.is_active ? "Suspend" : "Activate"}</button></td></tr>)}</tbody></table></div><div className="table-pagination"><span>{filteredCompanies.length ? `${companyPage * 10 + 1}-${Math.min(companyPage * 10 + 10, filteredCompanies.length)} of ${filteredCompanies.length}` : "0 companies"}</span><div><button className="button secondary" disabled={companyPage === 0} onClick={() => setCompanyPage((value) => Math.max(0, value - 1))}>Previous</button><button className="button secondary" disabled={(companyPage + 1) * 10 >= filteredCompanies.length} onClick={() => setCompanyPage((value) => value + 1)}>Next</button></div></div></section>}
    {showWorkspaces && <Suspense fallback={<div className="route-loading" role="status">Loading workspace requests…</div>}><WorkspaceRequestsView plans={plans} onChanged={load} onNotify={onNotify} /></Suspense>}
    {showPlans && <Suspense fallback={<div className="route-loading" role="status">Loading subscription plans…</div>}><PlatformPlanManagementView plans={plans} isLoading={plansLoading} loadError={plansError} onChanged={loadPlans} onNotify={onNotify} /></Suspense>}
    {showSubscriptions && <Suspense fallback={<div className="route-loading" role="status">Loading subscriptions…</div>}><SubscriptionManagementView companies={companies} plans={plans} subscriptions={subscriptions} onChanged={load} onNotify={onNotify} /><SubscriptionChangeRequestsView onChanged={load} onNotify={onNotify} /></Suspense>}
    {isDashboard && <section className="card table-card"><div className="card-header"><div><h2>Platform audit</h2><p>Platform actions only; company lead data is excluded.</p></div><ShieldCheck size={18} /></div><table><thead><tr><th>ACTION</th><th>ENTITY</th><th>TIME</th></tr></thead><tbody>{audit.map((entry) => <tr key={entry.id}><td>{entry.action}</td><td>{entry.entity_type}</td><td>{new Date(entry.created_at).toLocaleString()}</td></tr>)}</tbody></table></section>}
    {showForm && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowForm(false)}><form className="modal" onSubmit={create}><div className="modal-head"><h2>Create company</h2><button type="button" className="icon-button" onClick={() => setShowForm(false)}><X size={18} /></button></div><label>Company name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>Slug<input required pattern="[a-z0-9-]+" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} /></label><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setShowForm(false)}>Cancel</button><button className="button primary" disabled={busy}><Check size={16} /> Create</button></div></form></div>}</>;
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{description}</p></div>{action}</div>;
}
