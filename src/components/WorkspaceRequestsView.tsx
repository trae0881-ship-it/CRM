import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, ClipboardList, X } from "lucide-react";
import {
  decidePlatformWorkspaceRequest,
  listPlatformWorkspaceRequests,
  type PlatformPlan,
  type PlatformWorkspaceRequest,
} from "../services/platform";

type Props = { plans: PlatformPlan[]; onChanged: () => Promise<void>; onNotify: (message: string) => void };
type Decision = "approve" | "information_requested" | "reject";
type BillingPeriod = "monthly" | "quarterly" | "half_yearly" | "yearly";

const cyclePrices: Record<BillingPeriod, keyof Pick<PlatformPlan, "price_monthly" | "price_quarterly" | "price_half_yearly" | "price_yearly">> = {
  monthly: "price_monthly", quarterly: "price_quarterly", half_yearly: "price_half_yearly", yearly: "price_yearly",
};

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "string" && error.trim()) return error;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    const code = "code" in error && typeof error.code === "string" ? error.code : "";
    const details = "details" in error && typeof error.details === "string" ? ` ${error.details}` : "";
    const missingLifecycleObject = ["PGRST202", "42883", "42703", "42704"].includes(code)
      || (code === "42P01" && /relation .* does not exist/i.test(error.message));
    const migrationHint = missingLifecycleObject
      ? " Confirm the lifecycle migration completed successfully in this Supabase project."
      : "";
    return `${error.message}${code ? ` (${code})` : ""}${details}${migrationHint}`;
  }
  return error instanceof Error ? error.message : `${fallback} Confirm the lifecycle migration completed successfully in this Supabase project.`;
}

export function WorkspaceRequestsView({ plans, onChanged, onNotify }: Props) {
  const [requests, setRequests] = useState<PlatformWorkspaceRequest[]>([]);
  const [selected, setSelected] = useState<PlatformWorkspaceRequest | null>(null);
  const [decision, setDecision] = useState<Decision>("approve");
  const [planId, setPlanId] = useState("");
  const [status, setStatus] = useState<"active" | "trialing">("trialing");
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const [customLimit, setCustomLimit] = useState(false);
  const [salespersonLimit, setSalespersonLimit] = useState("");
  const [manualPaymentConfirmed, setManualPaymentConfirmed] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentCurrency, setPaymentCurrency] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [adminMessage, setAdminMessage] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const pageSize = 10;

  const load = async () => setRequests(await listPlatformWorkspaceRequests());
  useEffect(() => {
    void load().catch((error: unknown) => onNotify(getErrorMessage(error, "Workspace requests could not be loaded.")));
  }, []);

  const filtered = useMemo(() => requests.filter((request) => {
    const text = `${request.company_name} ${request.workspace_name} ${request.requester_name || ""} ${request.requester_email}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (
      statusFilter === "all" ||
      (statusFilter === "open" ? request.status === "pending" || request.status === "information_requested" : request.status === statusFilter)
    );
  }), [requests, query, statusFilter]);
  const shown = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const chosenPlan = plans.find((plan) => plan.id === planId);
  const chosenPrice = chosenPlan ? Number(chosenPlan[cyclePrices[period]]) : 0;
  const requiresPayment = decision === "approve" && status === "active" && chosenPrice > 0;

  const openReview = (request: PlatformWorkspaceRequest) => {
    setSelected(request);
    setSaveError("");
    setDecision("approve");
    const initialPlan = plans.find((plan) => plan.id === request.requested_plan_id && plan.is_active) || plans.find((plan) => plan.is_active);
    setPlanId(initialPlan?.id || "");
    setStatus(initialPlan?.trial_days ? "trialing" : "active");
    setPeriod("monthly");
    setCustomLimit(false);
    setSalespersonLimit("");
    setManualPaymentConfirmed(false);
    setPaymentAmount("");
    setPaymentCurrency(initialPlan?.currency_code || "");
    setPaymentReference("");
    setAdminMessage("");
    setRejectionReason("");
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setSaveError("");
    const reviewedRequest = selected;
    const submittedDecision = decision;
    try {
      await decidePlatformWorkspaceRequest({
        id: reviewedRequest.id, decision: submittedDecision,
        planId: submittedDecision === "approve" ? planId : undefined,
        billingPeriod: period,
        subscriptionStatus: status,
        salespersonLimit: submittedDecision === "approve" && customLimit ? Number(salespersonLimit) : null,
        manualPaymentConfirmed,
        manualPaymentAmount: paymentAmount ? Number(paymentAmount) : null,
        manualPaymentCurrency: paymentCurrency.trim().toUpperCase() || null,
        manualPaymentReference: paymentReference.trim() || null,
        adminMessage: adminMessage.trim(),
        rejectionReason: rejectionReason.trim(),
      });
    } catch (error) {
      const message = getErrorMessage(error, "Approval failed without a server error message.");
      setSaveError(message);
      onNotify(message);
      setBusy(false);
      return;
    }

    const nextStatus = submittedDecision === "approve" ? "approved"
      : submittedDecision === "reject" ? "rejected" : "information_requested";
    setRequests((current) => current.map((request) => request.id === reviewedRequest.id ? {
      ...request,
      status: nextStatus,
      admin_message: adminMessage.trim() || null,
      rejection_reason: submittedDecision === "reject" ? rejectionReason.trim() : request.rejection_reason,
    } : request));
    setSelected(null);

    const successMessage = submittedDecision === "approve"
      ? "Workspace approved. The owner membership and configured subscription were created."
      : submittedDecision === "reject" ? "Workspace request rejected with a recorded reason." : "Request for more information recorded.";
    const refreshResults = await Promise.allSettled([load(), onChanged()]);
    const refreshFailure = refreshResults.find((result) => result.status === "rejected");
    if (refreshFailure?.status === "rejected") {
      const message = `${successMessage} Refresh failed: ${getErrorMessage(refreshFailure.reason, "Could not reload workspace data.")}`;
      setSaveError(message);
      onNotify(message);
    } else {
      onNotify(successMessage);
    }
    setBusy(false);
  };

  return <>
    <section className="card table-card">
      <div className="card-header"><div><h2>Workspace approval requests</h2><p>Unapproved workspaces have no CRM membership. Paid plans require manual payment confirmation.</p></div><ClipboardList size={18} /></div>
      {saveError && <p className="muted" role="alert">{saveError}</p>}
      <div className="table-toolbar">
        <input aria-label="Search workspace requests" placeholder="Search company, workspace or requester" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} />
        <select aria-label="Filter workspace requests" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(0); }}>
          <option value="open">Open requests</option><option value="all">All requests</option>
          <option value="approved">Approved</option><option value="rejected">Rejected</option>
        </select>
      </div>
      <div className="table-scroll"><table><thead><tr><th>COMPANY / WORKSPACE</th><th>OWNER</th><th>PLAN</th><th>REQUESTED</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>
        {shown.map((request) => <tr key={request.id}>
          <td><strong>{request.company_name}</strong><small className="table-secondary">{request.workspace_name}</small></td>
          <td>{request.requester_name || "Name not provided"}<small className="table-secondary">{request.requester_email} · {request.contact_phone}</small></td>
          <td>{request.plan_name}</td><td>{new Date(request.created_at).toLocaleDateString()}</td><td>{request.status.replace(/_/g, " ")}</td>
          <td>{request.status === "pending" || request.status === "information_requested"
            ? <button className="button secondary" onClick={() => openReview(request)}>Review</button>
            : <span>{request.rejection_reason || request.admin_message || "—"}</span>}</td>
        </tr>)}
        {shown.length === 0 && <tr><td colSpan={6}>No matching workspace requests.</td></tr>}
      </tbody></table></div>
      <div className="table-pagination"><span>{filtered.length ? `${page * pageSize + 1}-${Math.min((page + 1) * pageSize, filtered.length)} of ${filtered.length}` : "0 requests"}</span><div><button className="button secondary" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</button><button className="button secondary" disabled={(page + 1) * pageSize >= filtered.length} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>
    </section>

    {selected && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}>
      <form className="modal workspace-review-modal" onSubmit={save}>
        <div className="modal-head"><div><p className="eyebrow">WORKSPACE REQUEST</p><h2>{selected.company_name}</h2><p className="muted">{selected.workspace_name} · {selected.requester_email}</p></div><button type="button" className="icon-button" aria-label="Close dialog" onClick={() => setSelected(null)}><X size={18} /></button></div>
        {selected.additional_information && <div className="request-state"><strong>Applicant information</strong><span>{selected.additional_information}</span></div>}
        <label>Decision<select value={decision} onChange={(event) => setDecision(event.target.value as Decision)}><option value="approve">Approve workspace</option><option value="information_requested">Request more information</option><option value="reject">Reject request</option></select></label>
        {decision === "approve" && <>
          <div className="contact-field-grid">
            <label>Plan<select required value={planId} onChange={(event) => { const next = plans.find((plan) => plan.id === event.target.value); setPlanId(event.target.value); setPaymentCurrency(next?.currency_code || ""); setStatus(next?.trial_days ? "trialing" : "active"); setManualPaymentConfirmed(false); setPaymentAmount(""); setPaymentReference(""); }}>
              <option value="">Select an active plan</option>{plans.filter((plan) => plan.is_active).map((plan) => <option value={plan.id} key={plan.id}>{plan.name}</option>)}
            </select></label>
            <label>Subscription status<select value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setManualPaymentConfirmed(false); setPaymentAmount(""); setPaymentReference(""); }}>
              <option value="trialing" disabled={!chosenPlan?.trial_days}>Trial ({chosenPlan?.trial_days || 0} days)</option><option value="active">Active now</option>
            </select></label>
            <label>Billing period<select value={period} onChange={(event) => { setPeriod(event.target.value as BillingPeriod); setManualPaymentConfirmed(false); setPaymentAmount(""); setPaymentReference(""); }}>
              <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="half_yearly">Half-yearly</option><option value="yearly">Yearly</option>
            </select></label>
          </div>
          {status === "active" && <p className="manual-payment-notice">Configured price: {chosenPlan?.currency_code || "Currency not configured"} {chosenPrice.toFixed(2)} for the selected period.</p>}
          <label className="checkbox-field"><input type="checkbox" checked={customLimit} onChange={(event) => setCustomLimit(event.target.checked)} /> Set a custom salesperson limit</label>
          {customLimit && <label>Salesperson limit<input required type="number" min="0" value={salespersonLimit} onChange={(event) => setSalespersonLimit(event.target.value)} /></label>}
          {requiresPayment && <fieldset className="manual-payment-fieldset"><legend>Manual payment verification</legend>
            <label className="checkbox-field"><input required type="checkbox" checked={manualPaymentConfirmed} onChange={(event) => setManualPaymentConfirmed(event.target.checked)} /> I verified receipt of the full configured amount outside this application.</label>
            <div className="contact-field-grid"><label>Received amount<input required type="number" step="0.01" min="0" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /></label><label>Currency<input required maxLength={3} value={paymentCurrency} onChange={(event) => setPaymentCurrency(event.target.value.toUpperCase())} /></label></div>
            <label>Payment reference<input required maxLength={160} value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} /></label>
          </fieldset>}
          <p className="muted">Approval creates the company, owner membership and subscription. Paid activation also creates an audited invoice and manual payment record.</p>
        </>}
        {decision === "information_requested" && <label>Message to applicant<input required maxLength={2000} value={adminMessage} onChange={(event) => setAdminMessage(event.target.value)} /></label>}
        {decision === "reject" && <><label>Rejection reason<input required maxLength={2000} value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} /></label><label>Additional message (optional)<input maxLength={2000} value={adminMessage} onChange={(event) => setAdminMessage(event.target.value)} /></label></>}
        {decision === "approve" && <label>Note to applicant (optional)<input maxLength={2000} value={adminMessage} onChange={(event) => setAdminMessage(event.target.value)} /></label>}
        <div className="modal-actions"><button type="button" className="button secondary" onClick={() => setSelected(null)}>Cancel</button><button className="button primary" disabled={busy || (decision === "approve" && !planId)}><Check size={16} /> {busy ? "Saving..." : "Record decision"}</button></div>
      </form>
    </div>}
  </>;
}
