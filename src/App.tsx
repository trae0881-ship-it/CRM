import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight, BarChart3, Bell, CalendarDays, Check, ChevronDown, CircleHelp,
  ClipboardList, Clock3, Filter, LayoutDashboard, Menu, MoreHorizontal, Phone,
  Plus, Search, Settings, Target, TrendingUp, Users, X, Zap, Headphones,
  UsersRound, PieChart, Plug, ShieldCheck,
  Building2, UserPlus, CreditCard, Wrench, Bot,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { createLead, getLeadByExternalId, listLeadTimeline, listOrganizationSalespeople, listLeads, shareLead, transferLead, updateLeadStatus } from "./services/leads";
import { saveCall, skipLead } from "./services/calling";
import { personalWhatsAppUrl, recordWhatsAppOpened, renderWhatsAppTemplate } from "./services/whatsapp";
import { requestPasswordReset, signIn, signOut, signUp, updatePassword } from "./services/auth";
import type { LeadEvent, LeadRecord, LeadStatus } from "./types/database";
import type { Session } from "@supabase/supabase-js";
import { createTeam, getCurrentMembership, getPersonalPerformance, getWorkspaceSummary, inviteMember, listTeams } from "./services/workspace";
import type { Membership, PersonalPerformance, Team, WorkspaceSummary } from "./services/workspace";
import { DashboardLayout } from "./components/DashboardLayout";
import { PublicLayout } from "./components/PublicLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { PublicRoute } from "./components/PublicRoute";
import { BookingsView, FollowUpsView, NotificationsView, ReportsView, SiteVisitsView, StatusSettingsView } from "./components/OperationsViews";
import { PlatformAdminView } from "./components/PlatformAdminView";
import { CompanyAdminView } from "./components/CompanyAdminView";
import { PaymentGatewayView } from "./components/PaymentGatewayView";
import { GrowthToolsView, LicenseRegisterView } from "./components/GrowthToolsView";
import { AutomationView } from "./components/AutomationView";
import { Customer360View, SalesPipelineView } from "./components/SalesOperationsView";
import { listNotifications } from "./services/operations";

type View = "Overview" | "Leads" | "Campaigns" | "Follow-ups" | "Calling" | "Teams" | "Reports" | "Integrations" | "Company" | "Site Visits" | "Bookings" | "Notifications" | "Statuses" | "Platform" | "Payment Gateway" | "Growth Tools" | "License Register" | "Automation" | "Sales Pipeline" | "Customer 360";
type Status = "New" | "Contacted" | "Qualified" | "Follow-up" | "Won";
type Lead = { id: string; dbId?: string; phone?: string | null; name: string; company: string; source: string; status: Status; score: number; owner: string; date: string; color: string };

const initialLeads: Lead[] = [
  { id: "AD-1048", name: "Rohan Mehta", company: "Mehta Developers", source: "Website", status: "Qualified", score: 92, owner: "AS", date: "Today, 10:42 AM", color: "#e1f4ec" },
  { id: "AD-1047", name: "Priya Sharma", company: "Aster Living", source: "Meta Ads", status: "Contacted", score: 78, owner: "RK", date: "Today, 09:18 AM", color: "#fff1dd" },
  { id: "AD-1046", name: "Arjun Kapoor", company: "Kapoor & Sons", source: "Referral", status: "New", score: 61, owner: "—", date: "Yesterday, 04:32 PM", color: "#e8e4ff" },
  { id: "AD-1045", name: "Sneha Iyer", company: "Iyer Enterprises", source: "Google Search", status: "Follow-up", score: 84, owner: "AS", date: "Yesterday, 02:06 PM", color: "#fde2e3" },
  { id: "AD-1044", name: "Vikram Singh", company: "Northstar Homes", source: "Website", status: "Won", score: 97, owner: "RK", date: "Oct 28, 2024", color: "#dceefd" },
];

const navItems: { label: View; icon: typeof LayoutDashboard }[] = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Leads", icon: Users },
  { label: "Campaigns", icon: Target },
  { label: "Follow-ups", icon: ClipboardList },
  { label: "Calling", icon: Headphones },
  { label: "Site Visits", icon: CalendarDays },
  { label: "Bookings", icon: Target },
  { label: "Teams", icon: UsersRound },
];

function App() {
  const [session, setSession] = useState<Session | null | undefined>(isSupabaseConfigured ? undefined : null);
  const [view, setView] = useState<View>("Overview");
  const [leads, setLeads] = useState(initialLeads);
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [toast, setToast] = useState("");
  const [membership, setMembership] = useState<Membership | null>(null);
  const [workspaceSummary, setWorkspaceSummary] = useState<WorkspaceSummary | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadRecord | null>(null);
  const [timeline, setTimeline] = useState<LeadEvent[]>([]);
  const [salespeople, setSalespeople] = useState<Array<{ user_id: string; role: string; profiles: { full_name: string } | null }>>([]);
  const [performance, setPerformance] = useState<PersonalPerformance | null>(null);
  const [operationLeads, setOperationLeads] = useState<LeadRecord[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => { if (active) setSession(data.session); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!supabase || !session) return;
    void getCurrentMembership().then((current) => {
      setMembership(current);
      if (!current) return;
      if (current.role === "super_admin") setView("Platform");
      if (current.role === "agent") void getPersonalPerformance(current.organization_id, current.user_id).then(setPerformance).catch((error: Error) => notify(error.message));
      return Promise.all([getWorkspaceSummary(current.organization_id), listTeams(current.organization_id)]).then(([summary, currentTeams]) => {
        setWorkspaceSummary(summary);
        setTeams(currentTeams);
        return listOrganizationSalespeople(current.organization_id).then(setSalespeople);
      });
    }).catch((error: Error) => notify(error.message));
  }, [session]);

  useEffect(() => {
    if (!supabase || !session) return;
    void listNotifications().then((items) => setUnreadNotifications(items.filter((item) => !item.read_at).length)).catch(() => undefined);
  }, [session, view]);

  useEffect(() => {
    if (!supabase) return;
    void listLeads(query).then((records) => { setOperationLeads(records); setLeads(records.map(toUiLead)); }).catch((error: Error) => notify(error.message));
  }, [query]);

  const filteredLeads = useMemo(() => leads.filter((lead) =>
    `${lead.name} ${lead.company} ${lead.id} ${lead.source}`.toLowerCase().includes(query.toLowerCase()),
  ), [leads, query]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const addLead = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    if (!name) return;
    if (supabase) {
      try {
        const saved = await createLead({ full_name: name, company: String(form.get("company") || "New account"), phone: String(form.get("phone") || "") || null });
        setLeads((current) => [toUiLead(saved), ...current]);
      } catch (error) {
        notify(error instanceof Error ? error.message : "Could not create lead");
        return;
      }
    } else setLeads((current) => [{
      id: `AD-${1049 + current.length}`, name, company: String(form.get("company") || "New account"),
      source: "Manual", status: "New", score: 50, owner: "—", date: "Just now", color: "#e8e4ff",
    }, ...current]);
    setShowLeadForm(false);
    notify("Lead created successfully");
  };

  if (window.location.pathname === "/reset-password") return <PublicLayout><ResetPasswordScreen /></PublicLayout>;
  if (isSupabaseConfigured && session === undefined) return <div className="public-loading"><div className="muted">Loading secure workspace...</div></div>;
  if (!session) return <PublicRoute session={session}><PublicLayout><PublicPage path={window.location.pathname} /></PublicLayout></PublicRoute>;
  return <ProtectedRoute session={session ?? null} allowAnonymous={!isSupabaseConfigured}><DashboardLayout>{(
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand"><div className="brand-mark">A</div><span>adometa</span><button className="close-menu" onClick={() => setSidebarOpen(false)}><X size={18} /></button></div>
        <div className="workspace-switcher"><div className="workspace-avatar">AS</div><div><strong>Acme Sales</strong><small>Workspace</small></div><ChevronDown size={16} /></div>
        <p className="nav-heading">WORKSPACE</p>
        {membership?.role === "super_admin" && <nav><button className={`nav-item ${view === "Platform" ? "active" : ""}`} onClick={() => setView("Platform")}><ShieldCheck size={18} /><span>Platform administration</span></button><button className={`nav-item ${view === "Payment Gateway" ? "active" : ""}`} onClick={() => setView("Payment Gateway")}><CreditCard size={18} /><span>Payment Gateway</span></button><button className={`nav-item ${view === "Growth Tools" ? "active" : ""}`} onClick={() => setView("Growth Tools")}><Wrench size={18} /><span>Growth Tools</span></button><button className={`nav-item ${view === "License Register" ? "active" : ""}`} onClick={() => setView("License Register")}><ShieldCheck size={18} /><span>License register</span></button></nav>}
        <nav>{navItems.filter(({ label }) => membership?.role !== "super_admin" && (label !== "Teams" || membership?.role === "company_owner" || membership?.role === "organization_admin" || membership?.role === "manager")).map(({ label, icon: Icon }) => <button key={label} className={view === label ? "nav-item active" : "nav-item"} onClick={() => { setView(label); setSidebarOpen(false); }}><Icon size={18} /><span>{label}</span>{label === "Leads" && <em>{isSupabaseConfigured ? leads.length : "Demo"}</em>}</button>)}</nav>
        <p className="nav-heading">MANAGE</p>
        <nav>
          <button className={`nav-item ${view === "Notifications" ? "active" : ""}`} onClick={() => setView("Notifications")}><Bell size={18} /><span>Notifications</span></button>
          {(membership?.role === "company_owner" || membership?.role === "organization_admin") && <button className={`nav-item ${view === "Company" ? "active" : ""}`} onClick={() => setView("Company")}><Building2 size={18} /><span>Company</span></button>}
          {(membership?.role === "company_owner" || membership?.role === "organization_admin" || membership?.role === "manager" || membership?.role === "auditor" || membership?.role === "agent" || !isSupabaseConfigured) && <button className={`nav-item ${view === "Reports" ? "active" : ""}`} onClick={() => setView("Reports")}><PieChart size={18} /><span>Reports</span></button>}
          {(membership?.role === "company_owner" || membership?.role === "organization_admin" || !isSupabaseConfigured) && <button className={`nav-item ${view === "Integrations" ? "active" : ""}`} onClick={() => setView("Integrations")}><Plug size={18} /><span>Integrations</span></button>}
          {(membership?.role === "company_owner" || membership?.role === "organization_admin") && <button className={`nav-item ${view === "Statuses" ? "active" : ""}`} onClick={() => setView("Statuses")}><Settings size={18} /><span>Lead statuses</span></button>}
          {(membership?.role === "company_owner" || membership?.role === "organization_admin" || membership?.role === "manager") && <button className={`nav-item ${view === "Automation" ? "active" : ""}`} onClick={() => setView("Automation")}><Bot size={18} /><span>Automation</span></button>}
          {membership && <><button className={`nav-item ${view === "Sales Pipeline" ? "active" : ""}`} onClick={() => setView("Sales Pipeline")}><Target size={18} /><span>Sales pipeline</span></button><button className={`nav-item ${view === "Customer 360" ? "active" : ""}`} onClick={() => setView("Customer 360")}><Users size={18} /><span>Customer 360</span></button></>}
          <button className="nav-item" onClick={() => notify("Organization settings are pending configuration")}><Settings size={18} /><span>Settings</span></button>
        </nav>
        <div className="sidebar-bottom"><div className="upgrade-card"><Zap size={17} /><strong>Make more happen</strong><p>Unlock advanced analytics and automation.</p><button onClick={() => notify("Upgrade request noted")}>Explore plans <ArrowUpRight size={14} /></button></div><div className="profile"><div className="profile-avatar">AS</div><div><strong>{isSupabaseConfigured ? "Signed-in user" : "Arjun Shah"}</strong><small>{isSupabaseConfigured ? "Workspace member" : "Admin"}</small></div><button className="icon-button" onClick={() => { if (supabase) void signOut(); }} aria-label="Sign out"><MoreHorizontal size={18} /></button></div></div>
      </aside>
      <main className="main-content">
        <header className="topbar"><button className="mobile-menu" onClick={() => setSidebarOpen(true)}><Menu size={21} /></button><div className="breadcrumbs"><span>Workspace</span><span>/</span><strong>{view}</strong></div><div className="topbar-actions"><div className="global-search"><Search size={17} /><input placeholder="Search anything..." value={query} onChange={(e) => setQuery(e.target.value)} /><kbd>⌘ K</kbd></div><button className="icon-button" aria-label="Help"><CircleHelp size={19} /></button><button className="icon-button notification" aria-label={`Notifications${unreadNotifications ? ` (${unreadNotifications} unread)` : ""}`} onClick={() => setView("Notifications")}><Bell size={19} />{unreadNotifications > 0 && <span className="notification-count">{unreadNotifications}</span>}</button></div></header>
        <div className="page-content">
          {view === "Platform" && membership && <PlatformAdminView membership={membership} onNotify={notify} />}
          {view === "Payment Gateway" && membership && <PaymentGatewayView membership={membership} onNotify={notify} />}
          {view === "Growth Tools" && membership && <GrowthToolsView membership={membership} />}
          {view === "License Register" && membership && <LicenseRegisterView membership={membership} />}
          {view === "Automation" && membership && <AutomationView membership={membership} onNotify={notify} />}
          {view === "Sales Pipeline" && membership && <SalesPipelineView membership={membership} onNotify={notify} />}
          {view === "Customer 360" && membership && <Customer360View membership={membership} onNotify={notify} />}
          {view === "Overview" && <Overview leads={leads} performance={performance} onAdd={() => setShowLeadForm(true)} onViewLeads={() => setView("Leads")} />}
          {view === "Leads" && <LeadsView leads={filteredLeads} query={query} onAdd={() => setShowLeadForm(true)} onOpen={async (externalId) => { if (!supabase) return; try { const record = await getLeadByExternalId(externalId); setSelectedLead(record); setTimeline(await listLeadTimeline(record.id)); } catch (error) { notify(error instanceof Error ? error.message : "Could not open lead"); } }} onStatusChange={async (id, status) => { try { if (supabase) await updateLeadStatus(id, status.toLowerCase().replace("-", "_") as LeadStatus); setLeads((all) => all.map((lead) => lead.id === id ? { ...lead, status } : lead)); notify("Lead status updated"); } catch (error) { notify(error instanceof Error ? error.message : "Could not update lead"); } }} />}
          {view === "Campaigns" && (isSupabaseConfigured ? <ModulePending eyebrow="CAMPAIGN MANAGEMENT" title="Campaigns" description="Campaign records will appear here after the campaign repository is connected." icon={<Target size={24} />} /> : <Campaigns onNotify={notify} />)}
          {view === "Follow-ups" && (membership ? <FollowUpsView membership={membership} leads={operationLeads} onNotify={notify} /> : <ModulePending eyebrow="FOLLOW-UP QUEUE" title="Follow-ups" description="An authenticated organization membership is required." icon={<ClipboardList size={24} />} />)}
          {view === "Calling" && <CallingWorkspace leads={filteredLeads} membership={membership} onNotify={notify} />}
          {view === "Site Visits" && (membership ? <SiteVisitsView membership={membership} leads={operationLeads} onNotify={notify} /> : <ModulePending eyebrow="FIELD WORK" title="Site visits" description="An authenticated organization membership is required." icon={<CalendarDays size={24} />} />)}
          {view === "Bookings" && (membership ? <BookingsView membership={membership} leads={operationLeads} onNotify={notify} /> : <ModulePending eyebrow="REVENUE" title="Bookings" description="An authenticated organization membership is required." icon={<Target size={24} />} />)}
          {view === "Teams" && (membership?.role === "company_owner" || membership?.role === "organization_admin" || membership?.role === "manager" ? <TeamsView membership={membership} teams={teams} onCreated={(team) => setTeams((current) => [team, ...current])} onNotify={notify} /> : <ModulePending eyebrow="TEAM MANAGEMENT" title="Teams & roles" description="Your current role does not have access to team management." icon={<UsersRound size={24} />} />)}
          {view === "Company" && membership && <CompanyAdminView membership={membership} onNotify={notify} />}
          {view === "Reports" && (membership ? <ReportsView membership={membership} onNotify={notify} /> : <ModulePending eyebrow="ANALYTICS" title="Reports & analytics" description="An authenticated organization membership is required." icon={<PieChart size={24} />} />)}
          {view === "Notifications" && (membership ? <NotificationsView membership={membership} onNotify={notify} /> : <ModulePending eyebrow="ACTIVITY CENTER" title="Notifications" description="An authenticated organization membership is required." icon={<Bell size={24} />} />)}
          {view === "Statuses" && (membership?.role === "company_owner" || membership?.role === "organization_admin" ? <StatusSettingsView membership={membership} onNotify={notify} /> : <ModulePending eyebrow="WORKSPACE SETTINGS" title="Lead statuses" description="Only company owners and organization admins can manage statuses." icon={<Settings size={24} />} />)}
          {view === "Integrations" && <Integrations onNotify={notify} />}
        </div>
      </main>
      {showLeadForm && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setShowLeadForm(false)}><form className="modal" onSubmit={addLead}><div className="modal-head"><div><p className="eyebrow">NEW RECORD</p><h2>Create a lead</h2></div><button type="button" className="icon-button" onClick={() => setShowLeadForm(false)}><X size={19} /></button></div><label>Full name<input name="name" required placeholder="e.g. Rohan Mehta" autoFocus /></label><label>Company<input name="company" placeholder="e.g. Acme Pvt. Ltd." /></label><label>Phone number<input name="phone" type="tel" placeholder="+91 98765 43210" /></label><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setShowLeadForm(false)}>Cancel</button><button className="button primary" type="submit">Create lead</button></div></form></div>}
      {selectedLead && <LeadDetails lead={selectedLead} events={timeline} salespeople={salespeople} onClose={() => setSelectedLead(null)} onNotify={notify} onRefresh={async () => setTimeline(await listLeadTimeline(selectedLead.id))} />}
      {toast && <div className="toast"><Check size={17} />{toast}</div>}
    </div>
  )}</DashboardLayout></ProtectedRoute>;
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{description}</p></div>{action}</div>;
}

function toUiLead(record: LeadRecord): Lead {
  const statusMap: Record<LeadStatus, Status> = { new: "New", contacted: "Contacted", qualified: "Qualified", follow_up: "Follow-up", won: "Won", lost: "Follow-up" };
  return { id: record.external_id, dbId: record.id, phone: record.phone, name: record.full_name, company: record.company || "New account", source: record.source, status: statusMap[record.status], score: record.score, owner: record.assigned_to ? record.assigned_to.slice(0, 2).toUpperCase() : "—", date: new Date(record.created_at).toLocaleString(), color: "#e1f4ec" };
}

function ModulePending({ eyebrow, title, description, icon }: { eyebrow: string; title: string; description: string; icon: React.ReactNode }) {
  return <><PageHeader eyebrow={eyebrow} title={title} description={description} /><section className="card pending-module"><div className="pending-icon">{icon}</div><h2>Ready for configuration</h2><p>This workspace is intentionally not showing demo data. Connect the required backend workflow to enable this module.</p><span className="pending-pill"><ShieldCheck size={14} /> Secure by default</span></section></>;
}

function Integrations({ onNotify }: { onNotify: (message: string) => void }) {
  return <><PageHeader eyebrow="CONNECTED SYSTEMS" title="Integrations" description="Bring every lead source into one secure workspace." /><div className="integration-hero"><div><span className="integration-badge"><span /> PENDING CONFIGURATION</span><h2>Meta Lead Ads</h2><p>Receive Facebook and Instagram Instant Form leads in real time through the secure webhook.</p><div className="integration-actions"><button className="button primary" onClick={() => onNotify("Meta OAuth connection is not configured yet")}><Plug size={16} /> Connect Meta account</button><button className="button secondary" onClick={() => onNotify("No Meta connection is available to test")}>Test connection</button></div></div><div className="meta-mark">f</div></div><div className="integration-grid"><div className="card integration-card"><div className="integration-card-head"><div className="integration-small-icon"><Users size={18} /></div><div><h3>Facebook Pages</h3><p>No pages connected</p></div></div><strong>—</strong><small>Pages become available after authorization.</small></div><div className="card integration-card"><div className="integration-card-head"><div className="integration-small-icon"><ClipboardList size={18} /></div><div><h3>Instant Forms</h3><p>No forms connected</p></div></div><strong>—</strong><small>Forms are loaded from authorized Pages.</small></div><div className="card integration-card"><div className="integration-card-head"><div className="integration-small-icon"><TrendingUp size={18} /></div><div><h3>Leads received</h3><p>Live database metric</p></div></div><strong>—</strong><small>Available after the first webhook event.</small></div></div><section className="card integration-log"><div className="card-header"><div><h2>Webhook health</h2><p>Delivery and import events from Meta</p></div><span className="status pending">Not connected</span></div><div className="empty-state"><Plug size={24} /><strong>Nothing to report yet</strong><p>Connect a real Meta Page to begin receiving events.</p></div></section></>;
}

function PublicPage({ path }: { path: string }) {
  if (path === "/login") return <LoginScreen />;
  if (path === "/super-admin/login") return <SuperAdminLoginScreen />;
  if (path === "/signup") return <SignupScreen />;
  if (path === "/reset-password") return <ResetPasswordScreen />;
  const pages: Record<string, { eyebrow: string; title: string; description: string }> = {
    "/features": { eyebrow: "PRODUCT", title: "Everything your team needs to close with confidence.", description: "Capture leads, organize follow-ups, and keep every sales conversation moving in one focused workspace." },
    "/pricing": { eyebrow: "PRICING", title: "Plans that grow with your sales team.", description: "Start with the essentials and add advanced workflows when your organization is ready." },
    "/about": { eyebrow: "ABOUT ADOMETA", title: "A calmer way to run a modern sales operation.", description: "Adometa brings your people, pipeline, and customer context together without unnecessary complexity." },
    "/contact": { eyebrow: "CONTACT", title: "Let’s make your sales workflow clearer.", description: "Tell us what your team is building. Contact details will be configured here when your public business information is ready." },
    "/privacy": { eyebrow: "LEGAL", title: "Privacy Policy", description: "Privacy policy content will be published here before production launch." },
    "/terms": { eyebrow: "LEGAL", title: "Terms and Conditions", description: "Terms and conditions content will be published here before production launch." },
    "/cookies": { eyebrow: "LEGAL", title: "Cookie Policy", description: "Cookie policy content will be published here before production launch." },
  };
  const page = pages[path] || { eyebrow: "SALES WORKSPACE", title: "Turn every lead into a better next step.", description: "Adometa CRM helps growing teams capture demand, collaborate clearly, and build a more predictable sales process." };
  return <section className="public-hero"><div className="public-hero-copy"><p className="eyebrow">{page.eyebrow}</p><h1>{page.title}</h1><p>{page.description}</p><div className="public-hero-actions"><a className="button primary" href="/signup">Start free</a><a className="button secondary" href="/features">Explore features</a></div></div><div className="public-hero-card"><div className="public-preview-top"><span className="brand-mark">A</span><strong>adometa</strong><span className="preview-dot" /></div><div className="preview-line wide" /><div className="preview-line" /><div className="preview-stats"><span /><span /><span /></div><div className="preview-table"><i /><i /><i /><i /></div></div></section>;
}

function SuperAdminLoginScreen() {
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "reset") {
        await requestPasswordReset(email);
        setMessage("If the account exists, a reset email has been sent.");
      } else {
        const { user } = await signIn(email, password);
        if (!user) throw new Error("Authentication did not return a user.");
        const current = await getCurrentMembership();
        if (!current || current.role !== "super_admin") {
          await signOut();
          throw new Error("This account is not authorized for Super Admin access.");
        }
        window.location.assign("/super-admin/dashboard");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Super Admin authentication failed");
    } finally { setBusy(false); }
  };
  return <div className="auth-page"><form className="modal auth-card" onSubmit={submit}><div className="brand auth-brand"><div className="brand-mark">A</div><span>adometa</span></div><p className="eyebrow">PLATFORM SECURITY</p><h1>{mode === "login" ? "Super Admin sign in" : "Reset Super Admin password"}</h1><p className="muted">{mode === "login" ? "Use your verified SaaS platform administrator account." : "We’ll send a secure reset link if the account exists."}</p><label>Email address<input required type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} /></label>{mode === "login" && <label>Password<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>}{message && <p className="auth-message">{message}</p>}<button className="button primary auth-submit" disabled={busy}>{busy ? "Please wait..." : mode === "login" ? "Sign in securely" : "Send reset link"}</button><button type="button" className="text-button auth-toggle" onClick={() => { setMode(mode === "login" ? "reset" : "login"); setMessage(""); }}>{mode === "login" ? "Forgot password?" : "Back to sign in"}</button><a className="text-button auth-toggle" href="/login">Workspace sign in</a></form></div>;
}

function LoginScreen() {
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "reset") { await requestPasswordReset(email); setMessage("If the account exists, a reset email has been sent."); }
      else { await signIn(email, password); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Authentication failed"); }
    finally { setBusy(false); }
  };
  return <div className="auth-page"><form className="modal auth-card" onSubmit={submit}><div className="brand auth-brand"><div className="brand-mark">A</div><span>adometa</span></div><p className="eyebrow">SECURE WORKSPACE</p><h1>{mode === "login" ? "Welcome back" : "Reset your password"}</h1><p className="muted">{mode === "login" ? "Sign in to access your organization." : "We’ll send a secure reset link if the account exists."}</p><label>Email address<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>{mode === "login" && <label>Password<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>}{message && <p className="auth-message">{message}</p>}<button className="button primary auth-submit" disabled={busy}>{busy ? "Please wait..." : mode === "login" ? "Sign in" : "Send reset link"}</button><button type="button" className="text-button auth-toggle" onClick={() => { setMode(mode === "login" ? "reset" : "login"); setMessage(""); }}>{mode === "login" ? "Forgot password?" : "Back to sign in"}</button></form></div>;
}

function SignupScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try { await signUp(email, password); setMessage("Check your email to confirm your account."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not create account"); }
    finally { setBusy(false); }
  };
  return <form className="modal auth-card" onSubmit={submit}><div className="brand auth-brand"><div className="brand-mark">A</div><span>adometa</span></div><p className="eyebrow">GET STARTED</p><h1>Create your workspace</h1><p className="muted">Start organizing your sales pipeline securely.</p><label>Email address<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>{message && <p className="auth-message">{message}</p>}<button className="button primary auth-submit" disabled={busy}>{busy ? "Creating..." : "Create account"}</button><a className="text-button auth-toggle" href="/login">Already have an account? Sign in</a></form>;
}

function ResetPasswordScreen() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try { await updatePassword(password); setMessage("Password updated. You can now sign in."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not update password"); }
    finally { setBusy(false); }
  };
  return <form className="modal auth-card" onSubmit={submit}><div className="brand auth-brand"><div className="brand-mark">A</div><span>adometa</span></div><p className="eyebrow">PASSWORD RESET</p><h1>Choose a new password</h1><p className="muted">Use a strong password for your secure workspace.</p><label>New password<input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>{message && <p className="auth-message">{message}</p>}<button className="button primary auth-submit" disabled={busy}>{busy ? "Saving..." : "Update password"}</button><a className="text-button auth-toggle" href="/login">Back to sign in</a></form>;
}

function Overview({ leads, performance, onAdd, onViewLeads }: { leads: Lead[]; performance: PersonalPerformance | null; onAdd: () => void; onViewLeads: () => void }) {
  const count = (status: Status) => leads.filter((lead) => lead.status === status).length;
  const conversionRate = leads.length ? `${Math.round((count("Won") / leads.length) * 100)}%` : "0%";
  const pipeline = [["New", count("New"), "purple"], ["Contacted", count("Contacted"), "blue"], ["Qualified", count("Qualified"), "green"], ["Follow-up", count("Follow-up"), "orange"], ["Won", count("Won"), "dark"]] as const;
  const stats: Array<{ label: string; value: string | number; change: string; Icon: LucideIcon; note: string }> = [
    { label: "Total leads", value: leads.length, change: "Current", Icon: Users, note: "authorized records" },
    { label: "Qualified leads", value: count("Qualified"), change: "Current", Icon: TrendingUp, note: "authorized records" },
    { label: "Follow-ups due", value: count("Follow-up"), change: "Current", Icon: ClipboardList, note: "requires attention" },
    { label: "Conversion rate", value: conversionRate, change: "Current", Icon: Target, note: "won / total" },
  ];
  const exportCsv = () => { const rows = [["Lead ID", "Name", "Company", "Source", "Status", "Score"], ...leads.map((lead) => [lead.id, lead.name, lead.company, lead.source, lead.status, String(lead.score)])]; const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n"); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = "adometa-authorized-leads.csv"; link.click(); URL.revokeObjectURL(link.href); };
  return <><PageHeader eyebrow="LIVE WORKSPACE" title="Good morning, Arjun" description="Here’s what’s happening with your sales pipeline today." action={<div className="page-actions"><button className="button secondary" onClick={exportCsv}>Export CSV</button><button className="button primary" onClick={onAdd}><Plus size={17} /> Add lead</button></div>} />{performance && <section className="card personal-performance"><div className="card-header"><div><h2>My performance</h2><p>Authorized records for your salesperson account</p></div><span className="pending-pill">Live data</span></div><div className="performance-grid">{[["Assigned leads", performance.assignedLeads], ["Calls made", performance.calls], ["Follow-ups due", performance.followUpsDue], ["Visits completed", performance.visitsCompleted], ["Bookings", performance.bookings], ["Lost leads", performance.lostLeads]].map(([label, value]) => <div key={String(label)}><strong>{value}</strong><span>{label}</span></div>)}</div></section>}<div className="stats-grid">{stats.map(({ label, value, change, Icon, note }) => <div className="stat-card" key={label}><div className="stat-top"><span>{label}</span><div className="stat-icon"><Icon size={17} /></div></div><strong>{value}</strong><div className="stat-foot"><span className="neutral">{change}</span><small>{note}</small></div></div>)}</div><div className="dashboard-grid"><section className="card pipeline-card"><div className="card-header"><div><h2>Pipeline overview</h2><p>Lead progression across your sales stages</p></div><button className="text-button" onClick={onViewLeads}>View all <ArrowUpRight size={15} /></button></div><div className="funnel">{pipeline.map(([stage, stageCount, color]) => { const percent = leads.length ? Math.round((stageCount / leads.length) * 100) : 0; return <div className="funnel-row" key={stage}><span className="funnel-label">{stage}</span><div className="funnel-track"><div className={`funnel-bar ${color}`} style={{ width: `${percent}%` }} /></div><strong>{stageCount}</strong><small>{percent}%</small></div>; })}</div></section><section className="card activity-card"><div className="card-header"><div><h2>Recent leads</h2><p>Latest authorized records</p></div><button className="text-button" onClick={onViewLeads}>View all <ArrowUpRight size={15} /></button></div><div className="activity-list">{leads.slice(0, 4).map((lead) => <div className="activity-item" key={lead.id}><div className="activity-avatar green">{lead.name.split(" ").map((part) => part[0]).join("")}</div><div><p><strong>{lead.name}</strong> entered as {lead.status}</p><small>{lead.date}</small></div></div>)}</div></section></div><section className="card table-card"><div className="card-header"><div><h2>Recent leads</h2><p>Leads that need your attention</p></div><button className="text-button" onClick={onViewLeads}>View all <ArrowUpRight size={15} /></button></div><LeadTable leads={leads.slice(0, 4)} compact /></section></>;
}

function LeadsView({ leads, query, onAdd, onOpen, onStatusChange }: { leads: Lead[]; query: string; onAdd: () => void; onOpen: (id: string) => void; onStatusChange: (id: string, status: Status) => void }) {
  return <><PageHeader eyebrow="LEAD MANAGEMENT" title="Leads" description={`${leads.length} leads matching your current view.`} action={<button className="button primary" onClick={onAdd}><Plus size={17} /> Add lead</button>} /><div className="toolbar"><div className="filter-search"><Search size={17} /><input placeholder="Search leads..." value={query} readOnly /></div><button className="button secondary"><Filter size={16} /> Filters <span className="filter-count">2</span></button><button className="button secondary"><CalendarDays size={16} /> Date added <ChevronDown size={15} /></button></div><section className="card table-card"><LeadTable leads={leads} onOpen={onOpen} onStatusChange={onStatusChange} /></section></>;
}

function LeadTable({ leads, compact = false, onOpen, onStatusChange }: { leads: Lead[]; compact?: boolean; onOpen?: (id: string) => void; onStatusChange?: (id: string, status: Status) => void }) {
  return <div className="table-scroll"><table><thead><tr><th>LEAD</th><th>SOURCE</th><th>STATUS</th><th>LEAD SCORE</th><th>OWNER</th><th>ADDED</th><th /></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id}><td><button className="lead-cell lead-link" onClick={() => onOpen?.(lead.id)}><div className="lead-avatar" style={{ background: lead.color }}>{lead.name.split(" ").map((n) => n[0]).join("")}</div><div><strong>{lead.name}</strong><small>{lead.company} · {lead.id}</small></div></button></td><td>{lead.source}</td><td>{onStatusChange ? <select className={`status-select ${lead.status.toLowerCase().replace("-", "")}`} value={lead.status} onChange={(e) => onStatusChange(lead.id, e.target.value as Status)}>{(["New", "Contacted", "Qualified", "Follow-up", "Won"] as Status[]).map((status) => <option key={status}>{status}</option>)}</select> : <span className={`status ${lead.status.toLowerCase().replace("-", "")}`}>{lead.status}</span>}</td><td><div className="score"><span className="score-bar"><i style={{ width: `${lead.score}%` }} /></span><strong>{lead.score}</strong></div></td><td><span className="owner">{lead.owner}</span></td><td className="date-cell">{lead.date}</td><td><button className="icon-button" onClick={() => onOpen?.(lead.id)}><MoreHorizontal size={17} /></button></td></tr>)}</tbody></table>{!leads.length && <div className="empty-state"><Search size={24} /><strong>No leads found</strong><p>Try a different search term.</p></div>}{compact && <div className="table-foot">Showing {leads.length} lead{leads.length === 1 ? "" : "s"}</div>}</div>;
}

function LeadDetails({ lead, events, salespeople, onClose, onNotify, onRefresh }: { lead: LeadRecord; events: LeadEvent[]; salespeople: Array<{ user_id: string; role: string; profiles: { full_name: string } | null }>; onClose: () => void; onNotify: (message: string) => void; onRefresh: () => Promise<void> }) {
  const [mode, setMode] = useState<"share" | "transfer">("share");
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(false);
  const [whatsappText, setWhatsappText] = useState(() => renderWhatsAppTemplate("Hi {{name}}, following up on your enquiry.", { name: lead.full_name }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!userId || !reason.trim()) return onNotify("Select a salesperson and enter a reason");
    setBusy(true);
    try {
      if (mode === "share") await shareLead(lead.id, userId, expiry ? new Date(expiry).toISOString() : null, reason);
      else await transferLead(lead.id, userId, reason);
      await onRefresh();
      onNotify(mode === "share" ? "Lead access shared" : "Lead ownership transferred");
      setReason("");
    } catch (error) { onNotify(error instanceof Error ? error.message : "Lead action failed"); }
    finally { setBusy(false); }
  };
  const openWhatsApp = async () => {
    if (!lead.phone) return onNotify("This lead has no phone number.");
    const url = personalWhatsAppUrl(lead.phone, whatsappText);
    window.open(url, "_blank", "noopener,noreferrer");
    if (supabase) {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        if (!data.user) throw new Error("Your authenticated user could not be resolved.");
        await recordWhatsAppOpened({ organizationId: lead.organization_id, leadId: lead.id, senderId: data.user.id, body: whatsappText });
      } catch (error) { onNotify(error instanceof Error ? error.message : "Could not record WhatsApp activity"); }
    }
    onNotify("WhatsApp opened. Delivery is not confirmed by click-to-chat.");
  };
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal lead-details"><div className="modal-head"><div><p className="eyebrow">LEAD JOURNEY</p><h2>{lead.full_name}</h2><p className="muted">{lead.external_id} · {lead.source}</p></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div><div className="lead-detail-grid"><div><h3>Permanent timeline</h3><div className="timeline">{events.length ? events.map((event) => <div className="timeline-event" key={event.id}><span /><div><strong>{event.event_type.replace(/_/g, " ")}</strong><small>{new Date(event.created_at).toLocaleString()} {event.actor_name ? `· ${event.actor_name}` : ""}</small>{event.notes && <p>{event.notes}</p>}</div></div>) : <p className="muted">No journey events are available yet.</p>}</div><div className="whatsapp-box"><h3>Personal WhatsApp</h3><textarea value={whatsappText} onChange={(event) => setWhatsappText(event.target.value)} /><button className="button secondary" type="button" onClick={openWhatsApp}>Open WhatsApp</button><small>Opened only; delivery is not confirmed.</small></div></div><form className="share-panel" onSubmit={submit}><div className="share-tabs"><button type="button" className={mode === "share" ? "active" : ""} onClick={() => setMode("share")}>Share access</button><button type="button" className={mode === "transfer" ? "active" : ""} onClick={() => setMode("transfer")}>Transfer owner</button></div><label>Salesperson<select required value={userId} onChange={(event) => setUserId(event.target.value)}><option value="">Select teammate</option>{salespeople.filter((person) => person.user_id !== lead.assigned_to).map((person) => <option key={person.user_id} value={person.user_id}>{person.profiles?.full_name || person.user_id.slice(0, 8)}</option>)}</select></label>{mode === "share" && <label>Access expiry<input type="datetime-local" value={expiry} onChange={(event) => setExpiry(event.target.value)} /></label>}<label>{mode === "share" ? "Reason" : "Transfer reason"}<textarea required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain this lead action" /></label><button className="button primary" disabled={busy}>{busy ? "Saving..." : mode === "share" ? "Share lead access" : "Transfer ownership"}</button></form></div></section></div>;
}

function CallingWorkspace({ leads, membership, onNotify }: { leads: Lead[]; membership: Membership | null; onNotify: (message: string) => void }) {
  const [index, setIndex] = useState(0);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [outcome, setOutcome] = useState("");
  const [notes, setNotes] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [skipReason, setSkipReason] = useState("");
  const [skipNotes, setSkipNotes] = useState("");
  const lead = leads[index];
  useEffect(() => {
    if (!startedAt) return;
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  const next = () => { setIndex((current) => (current + 1) % Math.max(leads.length, 1)); setStartedAt(null); setSeconds(0); setOutcome(""); setNotes(""); setFollowUpAt(""); };
  const completeCall = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!lead?.dbId || !membership || !startedAt) return onNotify("Start a manual call before saving its outcome.");
    try {
      await saveCall({ organizationId: membership.organization_id, leadId: lead.dbId, agentId: membership.user_id, outcome, notes, followUpAt: followUpAt ? new Date(followUpAt).toISOString() : null, startedAt, connectedAt: startedAt, endedAt: new Date().toISOString(), callStatus: "disconnected" });
      onNotify("Call outcome saved");
      next();
    } catch (error) { onNotify(error instanceof Error ? error.message : "Could not save call"); }
  };
  const handleSkip = async () => {
    if (!lead?.dbId || !skipReason) return onNotify("Select a skip reason.");
    try { await skipLead(lead.dbId, skipReason, skipNotes, followUpAt ? new Date(followUpAt).toISOString() : null); onNotify("Lead skipped and recorded"); next(); }
    catch (error) { onNotify(error instanceof Error ? error.message : "Could not skip lead"); }
  };
  return <><PageHeader eyebrow="SMART CALLING QUEUE" title="Calling workspace" description="Manual confirmation mode is active until a supported telephony provider is configured." /><div className="calling-banner"><ShieldCheck size={17} /> No call is placed automatically. Use your device dialer, then record the outcome here.</div>{lead ? <div className="calling-grid"><section className="card current-lead-card"><div className="card-header"><div><p className="eyebrow">NEXT ELIGIBLE LEAD</p><h2>{lead.name}</h2><p>{lead.company} · {lead.source}</p></div><span className="status pending">{lead.status}</span></div><div className="calling-meta"><strong>{lead.phone || "Phone unavailable"}</strong><span>Priority is calculated from follow-up and lead state.</span><a className="button primary" href={lead.phone ? `tel:${lead.phone}` : undefined} onClick={() => { if (!lead.phone) onNotify("This lead has no phone number"); else if (!startedAt) { setStartedAt(new Date().toISOString()); setSeconds(0); } }}>{startedAt ? `Manual call active · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : "Start manual call"}</a></div><button className="button secondary" onClick={next}>Next lead</button></section><form className="card call-outcome" onSubmit={completeCall}><h2>Call disposition</h2><label>Outcome<select required value={outcome} onChange={(event) => setOutcome(event.target.value)}><option value="">Select outcome</option><option value="connected">Connected</option><option value="callback">Call back required</option><option value="not_reachable">Not reachable</option><option value="not_interested">Not interested</option><option value="wrong_number">Wrong number</option></select></label><label>Next follow-up<input type="datetime-local" value={followUpAt} onChange={(event) => setFollowUpAt(event.target.value)} /></label><label>Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label><button className="button primary" disabled={!startedAt}>Save call outcome</button><div className="skip-row"><select value={skipReason} onChange={(event) => setSkipReason(event.target.value)}><option value="">Skip reason</option><option value="wrong_number">Wrong number</option><option value="not_interested">Not interested</option><option value="already_contacted">Already contacted</option><option value="customer_busy">Customer busy</option><option value="duplicate_lead">Duplicate lead</option><option value="invalid_lead">Invalid lead</option><option value="other">Other</option></select><input placeholder="Skip notes" value={skipNotes} onChange={(event) => setSkipNotes(event.target.value)} /><button type="button" className="button secondary" onClick={handleSkip}>Skip lead</button></div></form></div> : <section className="card empty-state"><Headphones size={24} /><strong>No eligible leads</strong><p>Authorized leads with valid contact data will appear here.</p></section>}</>;
}

function Campaigns({ onNotify }: { onNotify: (message: string) => void }) {
  const campaigns = [["Diwali Home Fest", "Meta Ads · Oct 01 – Nov 15", "Active", "426", "31.4%", "18.6%", "purple"], ["Website Enquiries", "Website · Ongoing", "Active", "318", "44.1%", "24.2%", "blue"], ["Referral Program", "Referral · Sep 01 – Dec 31", "Paused", "182", "52.7%", "29.8%", "green"]];
  return <><PageHeader eyebrow="GROWTH" title="Campaigns" description="Track acquisition, engagement, and conversion by campaign." action={<button className="button primary" onClick={() => onNotify("Campaign creation is ready for setup")}><Plus size={17} /> New campaign</button>} /><div className="campaign-grid">{campaigns.map(([name, detail, status, leads, contact, conversion, color]) => <div className="card campaign-card" key={name}><div className="campaign-title"><div className={`campaign-icon ${color}`}><Target size={19} /></div><div><h2>{name}</h2><p>{detail}</p></div><button className="icon-button"><MoreHorizontal size={18} /></button></div><div className="campaign-status"><span className={`dot ${status === "Active" ? "dot-green" : "dot-orange"}`} />{status}<span className="campaign-leads">{leads} leads</span></div><div className="campaign-metrics"><div><small>Contact rate</small><strong>{contact}</strong></div><div><small>Conversion</small><strong>{conversion}</strong></div></div><div className="progress"><i style={{ width: conversion }} /></div><button className="text-button campaign-link" onClick={() => onNotify(`${name} details opened`)}>View campaign <ArrowUpRight size={15} /></button></div>)}</div></>;
}

function FollowUps({ onNotify }: { onNotify: (message: string) => void }) {
  const tasks = [["Call Rohan Mehta", "Qualified lead · Mehta Developers", "Today, 11:30 AM", "High", "RM"], ["Send proposal to Vikram Singh", "Won lead · Northstar Homes", "Today, 02:00 PM", "Medium", "VS"], ["Schedule site visit with Sneha Iyer", "Follow-up · Iyer Enterprises", "Tomorrow, 10:00 AM", "High", "SI"], ["Check in with Priya Sharma", "Contacted · Aster Living", "Oct 30, 09:30 AM", "Low", "PS"]];
  return <><PageHeader eyebrow="YOUR WORK QUEUE" title="Follow-ups" description="Stay on top of conversations that move deals forward." action={<button className="button primary" onClick={() => onNotify("Follow-up form opened")}><Plus size={17} /> Add follow-up</button>} /><div className="followup-layout"><section className="card task-card"><div className="card-header"><div><h2>Upcoming follow-ups</h2><p>Tasks assigned to you</p></div><button className="button secondary">All tasks <ChevronDown size={15} /></button></div><div className="task-list">{tasks.map(([title, detail, date, priority, initials]) => <div className="task-item" key={title}><button className="check-task" onClick={() => onNotify("Task marked complete")}><Check size={14} /></button><div className="task-body"><strong>{title}</strong><small>{detail}</small></div><span className={`priority ${priority.toLowerCase()}`}>{priority}</span><div className="task-date"><Clock3 size={14} />{date}</div><button className="icon-button"><MoreHorizontal size={17} /></button></div>)}</div></section><section className="card completion-card"><div className="card-header"><div><h2>Completion</h2><p>This week</p></div><TrendingUp className="green-icon" size={18} /></div><div className="completion-number">84<span>%</span></div><p className="positive">+12.4% <span className="muted">vs. last week</span></p><div className="mini-bars">{[42, 58, 46, 72, 84, 64, 86].map((height, i) => <i key={i} style={{ height: `${height}%` }} className={i === 6 ? "today" : ""} />)}</div><div className="week-labels"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div></section></div></>;
}

function CompanyView({ membership, summary, onNotify }: { membership: Membership | null; summary: WorkspaceSummary | null; onNotify: (message: string) => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"organization_admin" | "manager" | "agent">("organization_admin");
  const [busy, setBusy] = useState(false);
  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!membership || !email.trim()) return;
    setBusy(true);
    try { await inviteMember(membership.organization_id, email, role); setEmail(""); onNotify("Invitation sent securely"); }
    catch (error) { onNotify(error instanceof Error ? error.message : "Invitation failed"); }
    finally { setBusy(false); }
  };
  const stats: Array<{ label: string; value: string | number; Icon: LucideIcon }> = [
    { label: "Employees", value: summary?.employees ?? "—", Icon: UsersRound },
    { label: "Sales teams", value: summary?.teams ?? "—", Icon: Users },
    { label: "Total leads", value: summary?.leads ?? "—", Icon: Target },
    { label: "Bookings", value: summary?.bookings ?? "—", Icon: TrendingUp },
  ];
  return <><PageHeader eyebrow="COMPANY OWNER PANEL" title={summary?.organizationName || "Company overview"} description="Organization performance and access management from authorized records." /><div className="stats-grid">{stats.map(({ label, value, Icon }) => <div className="stat-card" key={label}><div className="stat-top"><span>{label}</span><div className="stat-icon"><Icon size={17} /></div></div><strong>{value}</strong><div className="stat-foot"><span className="neutral">Live</span><small>Supabase authorized data</small></div></div>)}</div><div className="owner-grid"><section className="card"><div className="card-header"><div><h2>Organization settings</h2><p>Branding and workspace controls</p></div><button className="button secondary" onClick={() => onNotify("Organization profile editing is not configured yet")}>Edit profile</button></div><div className="settings-row"><div className="workspace-avatar"><Building2 size={16} /></div><div><strong>{summary?.organizationName || "Workspace"}</strong><small>Organization ID is protected by Supabase RLS</small></div></div><div className="settings-row"><div className="workspace-avatar"><ShieldCheck size={16} /></div><div><strong>Secure tenant isolation</strong><small>Owner access is limited to this organization.</small></div></div></section><section className="card"><div className="card-header"><div><h2>Invite organization admin</h2><p>Invitation is processed server-side</p></div><UserPlus size={19} className="green-icon" /></div><form className="invite-form" onSubmit={invite}><label>Email address<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@company.com" /></label><label>Role<select value={role} onChange={(event) => setRole(event.target.value as typeof role)}><option value="organization_admin">Organization Admin</option><option value="manager">Sales Manager</option><option value="agent">Sales Team Member</option></select></label><button className="button primary" disabled={busy}>{busy ? "Sending..." : "Send secure invitation"}</button></form></section></div></>;
}

function TeamsView({ membership, teams, onCreated, onNotify }: { membership: Membership; teams: Team[]; onCreated: (team: Team) => void; onNotify: (message: string) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try { const team = await createTeam(membership.organization_id, name); onCreated(team); setName(""); onNotify("Team created"); }
    catch (error) { onNotify(error instanceof Error ? error.message : "Could not create team"); }
    finally { setBusy(false); }
  };
  return <><PageHeader eyebrow="TEAM MANAGEMENT" title="Sales teams" description="Create teams inside your organization and assign managers through authorized operations." /><div className="owner-grid"><section className="card"><div className="card-header"><div><h2>Create a sales team</h2><p>Teams are organization-scoped.</p></div><UsersRound className="green-icon" size={19} /></div><form className="invite-form" onSubmit={submit}><label>Team name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="North region sales" /></label><button className="button primary" disabled={busy}>{busy ? "Creating..." : "Create team"}</button></form></section><section className="card"><div className="card-header"><div><h2>Your teams</h2><p>{teams.length} active teams</p></div></div><div className="team-list">{teams.length ? teams.map((team) => <div className="settings-row" key={team.id}><div className="workspace-avatar"><UsersRound size={15} /></div><div><strong>{team.name}</strong><small>{team.manager_id ? "Manager assigned" : "Manager not assigned"}</small></div><span className="status pending">{team.is_active ? "Active" : "Inactive"}</span></div>) : <div className="empty-state"><UsersRound size={23} /><strong>No teams yet</strong><p>Create the first organization team.</p></div>}</div></section></div></>;
}

export default App;
