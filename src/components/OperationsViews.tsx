import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Check, Download, Plus, Settings, Target } from "lucide-react";
import type { LeadRecord } from "../types/database";
import type { Membership } from "../services/workspace";
import { bookingPendingAmount, filterDateRange, validateVisitTransition, type BookingStatus, type FollowUpStatus, type VisitStatus } from "../lib/operations";
import { archiveLeadStatus, countUnreadNotifications, createBooking, createFollowUp, createSiteVisit, listBookings, listFollowUps, listLeadStatuses, listNotifications, listSiteVisits, markAllNotificationsRead, markNotificationRead, saveLeadStatus, updateBooking, updateFollowUp, updateSiteVisit, type Booking, type FollowUpTask, type LeadStatusConfig, type Notification, type SiteVisit } from "../services/operations";
import { fetchAuthorizedFollowUpReport, fetchAuthorizedLeadReport, reportFile, type FollowUpReportRow } from "../services/reports";
import { listOrganizationCampaigns } from "../services/campaigns";
import type { OrganizationCampaign } from "../services/campaigns";
import { listLeadsPage } from "../services/leads";
import { LeadAnalyticsPanel } from "./LeadAnalyticsPanel";

type Props = { membership: Membership; leads: LeadRecord[]; onNotify: (message: string) => void };
const unavailable = (error: unknown) => error instanceof Error ? error.message : "The operation could not be completed.";

export function SiteVisitsView({ membership, leads, onNotify }: Props) {
  const [visits, setVisits] = useState<SiteVisit[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ lead_id: "", scheduled_at: "", location: "", notes: "" });
  const load = () => listSiteVisits(membership.organization_id).then(setVisits).catch((error) => onNotify(unavailable(error)));
  useEffect(() => { void load(); }, [membership.organization_id]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.lead_id || !form.scheduled_at) return onNotify("Select a lead and visit date.");
    setBusy(true);
    try { await createSiteVisit({ organization_id: membership.organization_id, ...form, assigned_to: membership.user_id }); setForm({ lead_id: "", scheduled_at: "", location: "", notes: "" }); await load(); onNotify("Site visit scheduled."); } catch (error) { onNotify(unavailable(error)); } finally { setBusy(false); }
  };
  const change = async (visit: SiteVisit, status: VisitStatus) => {
    setBusy(true);
    try { validateVisitTransition(visit.status, status); await updateSiteVisit(visit.id, { status }); await load(); onNotify("Site visit updated."); } catch (error) { onNotify(unavailable(error)); } finally { setBusy(false); }
  };
  return <><PageHeader eyebrow="FIELD WORK" title="Site visits" description="Schedule and update visits from authorized organization records." /><section className="card operations-form"><h2>Schedule a site visit</h2><form className="inline-form" onSubmit={save}><LeadPicker leads={leads} value={form.lead_id} onChange={(lead_id) => setForm({ ...form, lead_id })} onNotify={onNotify} /><input required type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} /><input placeholder="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /><input placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /><button className="button primary" disabled={busy}><Plus size={16} /> Schedule</button></form></section><section className="card table-card"><table><thead><tr><th>DATE</th><th>LEAD</th><th>LOCATION</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{visits.map((visit) => <tr key={visit.id}><td>{new Date(visit.scheduled_at).toLocaleString()}</td><td>{leads.find((lead) => lead.dbId === visit.lead_id)?.full_name || visit.lead_id.slice(0, 8)}</td><td>{visit.location || "—"}</td><td>{visit.status}</td><td><select disabled={busy} value={visit.status} onChange={(e) => void change(visit, e.target.value as VisitStatus)}><option value="scheduled">Scheduled</option><option value="confirmed">Confirmed</option><option value="rescheduled">Rescheduled</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="no_show">Customer no-show</option></select></td></tr>)}</tbody></table>{!visits.length && <Empty text="No site visits found in the authorized workspace." />}</section></>;
}

export function BookingsView({ membership, leads, onNotify }: Props) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [form, setForm] = useState({ lead_id: "", project_name: "", booking_reference: "", value: "", payment_amount: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const load = () => listBookings(membership.organization_id).then(setBookings).catch((error) => onNotify(unavailable(error)));
  useEffect(() => { void load(); }, [membership.organization_id]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(form.value), payment = Number(form.payment_amount || 0);
    try { const pending = bookingPendingAmount(value, payment); setBusy(true); await createBooking({ organization_id: membership.organization_id, lead_id: form.lead_id, owner_id: membership.user_id, project_name: form.project_name, booking_reference: form.booking_reference, value, payment_amount: payment, notes: form.notes }); setForm({ lead_id: "", project_name: "", booking_reference: "", value: "", payment_amount: "", notes: "" }); await load(); onNotify(`Booking created. Pending amount: ${pending.toFixed(2)}`); } catch (error) { onNotify(unavailable(error)); } finally { setBusy(false); }
  };
  const totals = useMemo(() => bookings.reduce((result, booking) => ({ value: result.value + Number(booking.value || 0), payment: result.payment + Number(booking.payment_amount || 0), pending: result.pending + Number(booking.pending_amount || 0) }), { value: 0, payment: 0, pending: 0 }), [bookings]);
  return <><PageHeader eyebrow="REVENUE" title="Bookings" description="Track booking and collection amounts from authorized records." /><div className="stats-grid"><Stat label="Total bookings" value={bookings.length} /><Stat label="Booking amount" value={totals.value.toFixed(2)} /><Stat label="Collected" value={totals.payment.toFixed(2)} /><Stat label="Pending" value={totals.pending.toFixed(2)} /></div><section className="card operations-form"><h2>Create booking</h2><form className="inline-form" onSubmit={save}><LeadPicker leads={leads} value={form.lead_id} onChange={(lead_id) => setForm({ ...form, lead_id })} onNotify={onNotify} /><input required placeholder="Project/property" value={form.project_name} onChange={(e) => setForm({ ...form, project_name: e.target.value })} /><input placeholder="Reference" value={form.booking_reference} onChange={(e) => setForm({ ...form, booking_reference: e.target.value })} /><input required type="number" min="0" step="0.01" placeholder="Amount" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /><input type="number" min="0" step="0.01" placeholder="Payment" value={form.payment_amount} onChange={(e) => setForm({ ...form, payment_amount: e.target.value })} /><button className="button primary" disabled={busy}><Plus size={16} /> Create</button></form></section><section className="card table-card"><table><thead><tr><th>REFERENCE</th><th>PROJECT</th><th>AMOUNT</th><th>PAYMENT</th><th>PENDING</th><th>STATUS</th></tr></thead><tbody>{bookings.map((booking) => <tr key={booking.id}><td>{booking.booking_reference || booking.id.slice(0, 8)}</td><td>{booking.project_name || "—"}</td><td>{Number(booking.value || 0).toFixed(2)}</td><td>{Number(booking.payment_amount || 0).toFixed(2)}</td><td>{Number(booking.pending_amount || 0).toFixed(2)}</td><td><select value={booking.status} onChange={async (e) => { try { await updateBooking(booking.id, { status: e.target.value as BookingStatus }); await load(); onNotify("Booking status updated."); } catch (error) { onNotify(unavailable(error)); } }}><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="payment_pending">Payment pending</option><option value="partially_paid">Partially paid</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="refunded">Refunded</option></select></td></tr>)}</tbody></table>{!bookings.length && <Empty text="No bookings found in the authorized workspace." />}</section></>;
}

export function FollowUpsView({ membership, leads, onNotify }: Props) {
  const [tasks, setTasks] = useState<FollowUpTask[]>([]);
  const [form, setForm] = useState({ lead_id: "", title: "", due_at: "", priority: "medium" as "low" | "medium" | "high" });
  const load = () => listFollowUps(membership.organization_id).then(setTasks).catch((error) => onNotify(unavailable(error)));
  useEffect(() => { void load(); }, [membership.organization_id]);
  const save = async (event: React.FormEvent) => { event.preventDefault(); try { await createFollowUp({ organization_id: membership.organization_id, ...form, assigned_to: membership.user_id }); setForm({ lead_id: "", title: "", due_at: "", priority: "medium" }); await load(); onNotify("Follow-up created."); } catch (error) { onNotify(unavailable(error)); } };
  const grouped = (status: FollowUpStatus) => tasks.filter((task) => task.status === status);
  return <><PageHeader eyebrow="YOUR WORK QUEUE" title="Follow-ups" description="Create, complete, reschedule and cancel real follow-up tasks." /><section className="card operations-form"><h2>Create follow-up</h2><form className="inline-form" onSubmit={save}><LeadPicker leads={leads} value={form.lead_id} onChange={(lead_id) => setForm({ ...form, lead_id })} onNotify={onNotify} /><input required placeholder="Task title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /><input required type="datetime-local" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} /><select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as typeof form.priority })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select><button className="button primary"><Plus size={16} /> Add</button></form></section>{(["open", "completed", "cancelled"] as FollowUpStatus[]).map((status) => <section className="card table-card" key={status}><div className="card-header"><h2>{status === "open" ? "Open and overdue" : status}</h2><span>{grouped(status).length}</span></div><table><thead><tr><th>TASK</th><th>DUE</th><th>PRIORITY</th><th>ACTION</th></tr></thead><tbody>{grouped(status).map((task) => <tr key={task.id}><td>{task.title}</td><td>{new Date(task.due_at).toLocaleString()}</td><td>{task.priority}</td><td>{status === "open" && <div className="page-actions"><button className="button secondary" onClick={async () => { try { const notes = window.prompt("Completion notes") || ""; const outcome = window.prompt("Outcome") || ""; await updateFollowUp(task.id, "completed", notes, outcome); await load(); onNotify("Follow-up completed."); } catch (error) { onNotify(unavailable(error)); } }}><Check size={15} /> Complete</button><button className="button secondary" onClick={async () => { const reason = window.prompt("Cancellation reason"); if (!reason?.trim()) return onNotify("Cancellation reason is required."); try { await updateFollowUp(task.id, "cancelled", "", "", reason); await load(); onNotify("Follow-up cancelled."); } catch (error) { onNotify(unavailable(error)); } }}>Cancel</button><button className="button secondary" onClick={() => onNotify("Create a new follow-up with the revised due date to preserve the original history.")}>Reschedule</button></div>}</td></tr>)}</tbody></table></section>)}</>;
}

export function NotificationsView({ membership, onNotify, onUnreadCount }: { membership: Membership; onNotify: (message: string) => void; onUnreadCount: (count: number) => void }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const load = async () => {
    try {
      const [items, unreadCount] = await Promise.all([
        listNotifications(membership.organization_id, membership.user_id),
        countUnreadNotifications(membership.organization_id, membership.user_id),
      ]);
      setNotifications(items);
      onUnreadCount(unreadCount);
    } catch (error) { onNotify(unavailable(error)); }
  };
  useEffect(() => { void load(); }, [membership.organization_id]);
  return <><PageHeader eyebrow="ACTIVITY CENTER" title="Notifications" description="Notification history for your authenticated user." action={<button className="button secondary" onClick={async () => { try { await markAllNotificationsRead(); await load(); onNotify("Notifications marked as read."); } catch (error) { onNotify(unavailable(error)); } }}>Mark all read</button>} /><section className="card notification-list">{notifications.map((item) => <button className={`notification-row ${item.read_at ? "read" : ""}`} key={item.id} onClick={async () => { try { await markNotificationRead(item.id); await load(); } catch (error) { onNotify(unavailable(error)); } }}><Bell size={17} /><div><strong>{item.title}</strong><p>{item.body}</p><small>{new Date(item.created_at).toLocaleString()}</small></div>{!item.read_at && <i />}</button>)}{!notifications.length && <Empty text="No notifications are available." />}</section></>;
}

export function StatusSettingsView({ membership, onNotify }: { membership: Membership; onNotify: (message: string) => void }) {
  const [statuses, setStatuses] = useState<LeadStatusConfig[]>([]);
  const [form, setForm] = useState({ name: "", color: "#5144e5", category: "open" as "open" | "won" | "lost", requires_follow_up: false, requires_reason: false });
  const load = () => listLeadStatuses(membership.organization_id).then(setStatuses).catch((error) => onNotify(unavailable(error)));
  useEffect(() => { void load(); }, [membership.organization_id]);
  const save = async (event: React.FormEvent) => { event.preventDefault(); try { await saveLeadStatus({ organization_id: membership.organization_id, ...form, position: statuses.length, is_active: true, is_default: statuses.length === 0 }); setForm({ name: "", color: "#5144e5", category: "open", requires_follow_up: false, requires_reason: false }); await load(); onNotify("Lead status saved."); } catch (error) { onNotify(unavailable(error)); } };
  return <><PageHeader eyebrow="WORKSPACE SETTINGS" title="Lead statuses" description="Manage organization statuses without deleting historical records." /><section className="card operations-form"><form className="inline-form" onSubmit={save}><input required placeholder="Status name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as typeof form.category })}><option value="open">Open</option><option value="won">Won</option><option value="lost">Lost</option></select><label><input type="checkbox" checked={form.requires_follow_up} onChange={(e) => setForm({ ...form, requires_follow_up: e.target.checked })} /> Follow-up required</label><label><input type="checkbox" checked={form.requires_reason} onChange={(e) => setForm({ ...form, requires_reason: e.target.checked })} /> Reason required</label><button className="button primary"><Settings size={16} /> Save status</button></form></section><section className="card table-card"><table><thead><tr><th>STATUS</th><th>CATEGORY</th><th>RULES</th><th>ACTION</th></tr></thead><tbody>{statuses.map((status) => <tr key={status.id}><td><span style={{ color: status.color }}>●</span> {status.name}</td><td>{status.category}</td><td>{[status.requires_follow_up && "follow-up", status.requires_reason && "reason"].filter(Boolean).join(", ") || "none"}</td><td>{status.is_active && <button className="button secondary" onClick={async () => { try { await archiveLeadStatus(status.id); await load(); onNotify("Status archived."); } catch (error) { onNotify(unavailable(error)); } }}>Archive</button>}</td></tr>)}</tbody></table>{!statuses.length && <Empty text="No custom statuses have been configured." />}</section></>;
}

export function ReportsView({ membership, onNotify }: { membership: Membership; onNotify: (message: string) => void }) {
  const [rows, setRows] = useState<Record<string, string | number | null | undefined>[]>([]);
  const [scope, setScope] = useState<"personal" | "company">(membership.role === "company_owner" || membership.role === "organization_admin" || membership.role === "manager" ? "company" : "personal");
  const [range, setRange] = useState<"all" | "today" | "yesterday" | "last_7_days" | "last_30_days" | "this_month" | "previous_month">("all");
  const [agency, setAgency] = useState("all");
  const [campaigns, setCampaigns] = useState<OrganizationCampaign[]>([]);
  const [campaignId, setCampaignId] = useState("all");
  const [followUps, setFollowUps] = useState<FollowUpReportRow[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [loadingFollowUps, setLoadingFollowUps] = useState(true);
  const [followUpPage, setFollowUpPage] = useState(1);
  const followUpPageSize = 10;

  useEffect(() => {
    setFollowUpPage(1);
  }, [agency, campaignId, range, scope]);

  useEffect(() => {
    let active = true;
    setLoadingReports(true);
    void Promise.all([
      fetchAuthorizedLeadReport(membership.organization_id, scope === "company" ? undefined : membership.user_id),
      listOrganizationCampaigns(membership.organization_id),
    ]).then(([leadRows, campaignRows]) => {
      if (!active) return;
      setRows(leadRows);
      setCampaigns(campaignRows);
      setCampaignId((current) => current === "all" || campaignRows.some((campaign) => campaign.id === current) ? current : "all");
    }).catch((error) => {
      if (active) {
        setRows([]);
        setCampaigns([]);
        onNotify(unavailable(error));
      }
    }).finally(() => {
      if (active) setLoadingReports(false);
    });
    return () => { active = false; };
  }, [membership.organization_id, membership.user_id, onNotify, scope]);

  useEffect(() => {
    let active = true;
    setLoadingFollowUps(true);
    void fetchAuthorizedFollowUpReport(membership.organization_id).then((result) => {
      if (active) setFollowUps(result);
    }).catch((error) => {
      if (active) {
        setFollowUps([]);
        onNotify(unavailable(error));
      }
    }).finally(() => {
      if (active) setLoadingFollowUps(false);
    });
    return () => { active = false; };
  }, [membership.organization_id, onNotify]);

  const rowAgencies = (row: Record<string, string | number | null | undefined>) => {
    try {
      const values: unknown = JSON.parse(String(row.agency_names || "[]"));
      if (Array.isArray(values)) return values.filter((value): value is string => typeof value === "string");
    } catch { /* Older report rows may not include the agency list. */ }
    return String(row.agency || "").split(" · ").filter(Boolean);
  };
  const agencies = [...new Set(rows.flatMap(rowAgencies))].sort((a, b) => a.localeCompare(b));
  const campaignNames = new Map(campaigns.map((campaign) => [campaign.id, campaign.name]));
  const filtered = rows.filter((row) => (campaignId === "all" || String(row.campaign_id || "") === campaignId)
    && filterDateRange(String(row.created_at || ""), range)
    && (agency === "all" || rowAgencies(row).includes(agency)));
  const campaignLabel = campaignId === "all" ? "All campaigns" : campaignNames.get(campaignId) || "Campaign";
  const safeCampaignLabel = campaignLabel.trim().replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const leadReportRows: Array<Record<string, string | number | null | undefined>> = filtered.map((row) => ({
    ...row,
    campaign: campaignNames.get(String(row.campaign_id || "")) || "Unassigned",
  }));
  const filteredLeadIds = new Set(filtered.map((row) => String(row.id || "")).filter(Boolean));
  const leadById = new Map(filtered.map((row) => [String(row.id || ""), row]));
  const followUpReportRows = followUps
    .filter((task) => task.lead_id && filteredLeadIds.has(task.lead_id))
    .map((task) => {
      const lead = leadById.get(task.lead_id || "");
      return {
        external_id: lead?.external_id,
        full_name: lead?.full_name,
        campaign: campaignNames.get(String(lead?.campaign_id || "")) || "Unassigned",
        follow_up_title: task.title,
        follow_up_due_at: task.due_at,
        follow_up_priority: task.priority,
        follow_up_status: task.status,
        follow_up_assigned_to: task.assigned_to,
        follow_up_notes: task.notes,
        follow_up_outcome: task.outcome,
      };
    });
  const openFollowUps = followUpReportRows.filter((task) => task.follow_up_status === "open");
  const overdueFollowUps = openFollowUps.filter((task) => new Date(String(task.follow_up_due_at)).getTime() < Date.now());
  const followUpColumns = ["external_id", "full_name", "campaign", "follow_up_title", "follow_up_due_at", "follow_up_priority", "follow_up_status", "follow_up_assigned_to", "follow_up_notes", "follow_up_outcome"];
  const download = (format: "csv" | "xlsx" | "pdf") => {
    const result = reportFile(leadReportRows, format, `${campaignLabel} Lead Report`);
    const blob = new Blob([result.body as BlobPart], { type: result.type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `adometa-${scope}-${safeCampaignLabel}-leads.${result.extension}`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const downloadFollowUps = (format: "csv" | "xlsx" | "pdf") => {
    const result = reportFile(followUpReportRows, format, `${campaignLabel} Follow-up Report`, followUpColumns);
    const blob = new Blob([result.body as BlobPart], { type: result.type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `adometa-${scope}-${safeCampaignLabel}-follow-ups.${result.extension}`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const totalFollowUpPages = Math.max(1, Math.ceil(followUpReportRows.length / followUpPageSize));
  const shownFollowUps = followUpReportRows.slice((followUpPage - 1) * followUpPageSize, followUpPage * followUpPageSize);

  return <>
    <PageHeader eyebrow="ANALYTICS" title="Reports" description="Filter leads, analytics, and follow-ups by campaign, agency, and date." />
    <section className="card report-toolbar">
      <select aria-label="Report scope" value={scope} onChange={(event) => setScope(event.target.value as typeof scope)} disabled={membership.role === "agent"}>
        <option value="personal">Personal report</option><option value="company">Company report</option>
      </select>
      <select aria-label="Filter reports by campaign" value={campaignId} onChange={(event) => { setCampaignId(event.target.value); setFollowUpPage(1); }}>
        <option value="all">All campaigns</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
      </select>
      <select aria-label="Filter reports by agency" value={agency} onChange={(event) => setAgency(event.target.value)}>
        <option value="all">All agencies</option>{agencies.map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
      <select aria-label="Filter reports by date" value={range} onChange={(event) => { setRange(event.target.value as typeof range); setFollowUpPage(1); }}>
        <option value="all">All time</option><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="last_7_days">Last 7 days</option><option value="last_30_days">Last 30 days</option><option value="this_month">This month</option><option value="previous_month">Previous month</option>
      </select>
      <span>{filtered.length} authorized leads</span>
      <button className="button secondary" disabled={loadingReports || !filtered.length} onClick={() => download("csv")}><Download size={15} /> Leads CSV</button>
      <button className="button secondary" disabled={loadingReports || !filtered.length} onClick={() => download("xlsx")}><Download size={15} /> Leads XLSX</button>
      <button className="button secondary" disabled={loadingReports || !filtered.length} onClick={() => download("pdf")}><Download size={15} /> Leads PDF</button>
    </section>
    {loadingReports ? <section className="card route-loading" role="status">Loading campaign reports…</section> : <>
      <LeadAnalyticsPanel rows={leadReportRows} title={campaignId === "all" ? "Organization and sales-team lead analytics" : `${campaignLabel} lead analytics`} />
      <section className="card table-card">
        <div className="table-scroll"><table><thead><tr><th>CAMPAIGN</th><th>AGENCY</th><th>LEAD</th><th>NAME</th><th>SOURCE</th><th>STATUS</th><th>CREATED</th><th>NEXT FOLLOW-UP</th></tr></thead><tbody>
          {leadReportRows.map((row, index) => <tr key={String(row.external_id || index)}><td>{String(row.campaign || "Unassigned")}</td><td>{String(row.agency || "—")}</td><td>{String(row.external_id || "")}</td><td>{String(row.full_name || "")}</td><td>{String(row.source || "")}</td><td>{String(row.status || "")}</td><td>{String(row.created_at || "")}</td><td>{String(row.next_follow_up_at || "—")}</td></tr>)}
        </tbody></table>{!leadReportRows.length && <Empty text="No leads match this campaign, agency, and date range." />}</div>
      </section>
      <section className="card table-card campaign-followup-report">
        <div className="card-header"><div><p className="eyebrow">FOLLOW-UP REPORT</p><h2>{campaignId === "all" ? "Campaign follow-ups" : `${campaignLabel} follow-ups`}</h2><p>Follow-up tasks linked to leads in the current report filters.</p></div>
          <div className="page-actions">
            <button className="button secondary" disabled={loadingFollowUps || !followUpReportRows.length} onClick={() => downloadFollowUps("csv")}><Download size={15} /> CSV</button>
            <button className="button secondary" disabled={loadingFollowUps || !followUpReportRows.length} onClick={() => downloadFollowUps("xlsx")}><Download size={15} /> XLSX</button>
            <button className="button secondary" disabled={loadingFollowUps || !followUpReportRows.length} onClick={() => downloadFollowUps("pdf")}><Download size={15} /> PDF</button>
          </div>
        </div>
        <div className="stats-grid"><Stat label="Follow-ups" value={followUpReportRows.length} /><Stat label="Open" value={openFollowUps.length} /><Stat label="Overdue" value={overdueFollowUps.length} /><Stat label="Completed" value={followUpReportRows.filter((task) => task.follow_up_status === "completed").length} /></div>
        {loadingFollowUps ? <p className="muted" role="status">Loading follow-up report…</p> : <div className="table-scroll"><table><thead><tr><th>LEAD</th><th>NAME</th><th>FOLLOW-UP</th><th>DUE</th><th>PRIORITY</th><th>STATUS</th><th>ASSIGNED TO</th><th>OUTCOME</th><th>NOTES</th></tr></thead><tbody>
          {shownFollowUps.map((task, index) => <tr key={`${String(task.external_id)}-${String(task.follow_up_title)}-${index}`}><td>{String(task.external_id || "")}</td><td>{String(task.full_name || "")}</td><td>{String(task.follow_up_title || "")}</td><td>{String(task.follow_up_due_at || "")}</td><td>{String(task.follow_up_priority || "")}</td><td>{String(task.follow_up_status || "")}</td><td>{String(task.follow_up_assigned_to || "—")}</td><td>{String(task.follow_up_outcome || "—")}</td><td>{String(task.follow_up_notes || "—")}</td></tr>)}
        </tbody></table>{!followUpReportRows.length && <Empty text="No follow-up tasks match the selected campaign and report filters." />}</div>}
        {!loadingFollowUps && followUpReportRows.length > followUpPageSize && <div className="table-pagination"><span>{(followUpPage - 1) * followUpPageSize + 1}-{Math.min(followUpPage * followUpPageSize, followUpReportRows.length)} of {followUpReportRows.length} follow-ups</span><div><button className="button secondary" disabled={followUpPage <= 1} onClick={() => setFollowUpPage((page) => page - 1)}>Previous</button><span>Page {followUpPage} of {totalFollowUpPages}</span><button className="button secondary" disabled={followUpPage >= totalFollowUpPages} onClick={() => setFollowUpPage((page) => page + 1)}>Next</button></div></div>}
      </section>
    </>}
  </>;
}

function LeadPicker({ leads, value, onChange, onNotify }: { leads: LeadRecord[]; value: string; onChange: (value: string) => void; onNotify: (message: string) => void }) {
  const [search, setSearch] = useState("");
  const [matches, setMatches] = useState(leads);
  const [selectedLead, setSelectedLead] = useState<LeadRecord | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const notifyRef = useRef(onNotify);

  useEffect(() => { notifyRef.current = onNotify; }, [onNotify]);
  useEffect(() => {
    if (!search.trim()) {
      setMatches(leads);
      setIsSearching(false);
      return;
    }
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setIsSearching(true);
      void listLeadsPage(search, { limit: 50, includeTotal: false, signal: controller.signal })
        .then((page) => { if (active) setMatches(page.records); })
        .catch((error) => { if (active && !controller.signal.aborted) notifyRef.current(unavailable(error)); })
        .finally(() => { if (active) setIsSearching(false); });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [search, leads]);

  const options = search.trim() ? matches : leads;
  const current = options.find((lead) => lead.id === value) ?? (selectedLead?.id === value ? selectedLead : null);
  const visibleOptions = current && !options.some((lead) => lead.id === current.id) ? [current, ...options] : options;
  return <div className="lead-picker">
    <input type="search" aria-label="Search leads by name or company" placeholder="Search leads…" value={search} onChange={(event) => setSearch(event.target.value)} />
    <select required aria-label="Select lead" value={value} onChange={(event) => {
      const selected = visibleOptions.find((lead) => lead.id === event.target.value) ?? null;
      setSelectedLead(selected);
      onChange(event.target.value);
    }}>
      <option value="">{isSearching ? "Searching leads…" : "Select a lead"}</option>
      {visibleOptions.map((lead) => <option key={lead.id} value={lead.id}>{lead.full_name}{lead.company ? ` — ${lead.company}` : ""}</option>)}
    </select>
  </div>;
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) { return <div className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{description}</p></div>{action}</div>; }
function Empty({ text }: { text: string }) { return <p className="empty-state muted">{text}</p>; }
function Stat({ label, value }: { label: string; value: string | number }) { return <div className="stat-card"><div className="stat-top"><span>{label}</span><Target size={17} /></div><strong>{value}</strong></div>; }
