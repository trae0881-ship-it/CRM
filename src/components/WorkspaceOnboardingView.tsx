import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Building2, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "../lib/supabase";
import {
  createWorkspaceRequest,
  getMyWorkspaceAccessStatus,
  listAvailableSubscriptionPlans,
  listMyWorkspaceRequests,
  resubmitWorkspaceRequest,
  type AvailableSubscriptionPlan,
  type WorkspaceRequest,
  type WorkspaceAccessStatus,
} from "../services/workspace";

type Props = {
  onRefreshMembership: () => void;
  onSignOut: () => void;
  onNotify: (message: string) => void;
};

const formatPlanPrice = (plan: AvailableSubscriptionPlan) => {
  const currency = plan.currency_code ? `${plan.currency_code} ` : "";
  return `${currency}${Number(plan.price_monthly).toFixed(2)} / month`;
};

function getLoadErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}

export function WorkspaceOnboardingView({ onRefreshMembership, onSignOut, onNotify }: Props) {
  const [plans, setPlans] = useState<AvailableSubscriptionPlan[]>([]);
  const [plansLoadFailed, setPlansLoadFailed] = useState(false);
  const [requests, setRequests] = useState<WorkspaceRequest[]>([]);
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceAccessStatus | null>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [phone, setPhone] = useState("");
  const [planId, setPlanId] = useState("");
  const [additionalInformation, setAdditionalInformation] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const load = async () => {
    setLoading(true);
    setErrorMessage("");
    const [plansResult, requestsResult, accessResult, userResult] = await Promise.allSettled([
      listAvailableSubscriptionPlans(),
      listMyWorkspaceRequests(),
      getMyWorkspaceAccessStatus(),
      Promise.resolve(supabase?.auth.getUser()),
    ]);
    const errors: string[] = [];

    if (plansResult.status === "fulfilled") {
      setPlans(plansResult.value);
      setPlansLoadFailed(false);
      if (plansResult.value.length && !planId) setPlanId(plansResult.value[0].id);
    } else {
      setPlans([]);
      setPlansLoadFailed(true);
      errors.push(`Subscription plans: ${getLoadErrorMessage(plansResult.reason, "could not be loaded")}`);
    }

    if (requestsResult.status === "fulfilled") setRequests(requestsResult.value);
    else errors.push(`Workspace requests: ${getLoadErrorMessage(requestsResult.reason, "could not be loaded")}`);

    if (accessResult.status === "fulfilled") setWorkspaceStatus(accessResult.value);
    else errors.push(`Workspace access: ${getLoadErrorMessage(accessResult.reason, "could not be checked")}`);

    if (userResult.status === "fulfilled" && userResult.value?.error) {
      errors.push(`Account details: ${getLoadErrorMessage(userResult.value.error, "could not be loaded")}`);
    } else if (userResult.status === "rejected") {
      errors.push(`Account details: ${getLoadErrorMessage(userResult.reason, "could not be loaded")}`);
    } else {
      const user = userResult.status === "fulfilled" ? userResult.value?.data.user : null;
      setEmail(user?.email || "");
      setFullName(String(user?.user_metadata?.full_name || ""));
      setPhone((current) => current || String(user?.user_metadata?.phone || ""));
    }

    setErrorMessage(errors.join(". "));
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const openRequest = useMemo(
    () => requests.find((request) => request.status === "pending" || request.status === "information_requested") || null,
    [requests],
  );
  const latestRequest = requests[0] ?? null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!planId) return onNotify("Choose an available subscription plan.");
    setBusy(true);
    try {
      await createWorkspaceRequest({ fullName, companyName, workspaceName, phone, planId, additionalInformation });
      setCompanyName("");
      setWorkspaceName("");
      setAdditionalInformation("");
      await load();
      onNotify("Workspace request submitted for review.");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Workspace request could not be submitted.");
    } finally {
      setBusy(false);
    }
  };

  const resubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!openRequest) return;
    setBusy(true);
    try {
      await resubmitWorkspaceRequest(openRequest.id, additionalInformation);
      setAdditionalInformation("");
      await load();
      onNotify("Additional information submitted.");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Additional information could not be submitted.");
    } finally {
      setBusy(false);
    }
  };

  return <main className="workspace-onboarding">
    <header className="onboarding-header">
      <a className="brand" href="/"><span className="brand-mark">A</span><span>adometa</span></a>
      <div className="onboarding-account"><span>{email}</span><button className="text-button" onClick={onSignOut}>Sign out</button></div>
    </header>
    <section className="workspace-onboarding-card">
      <div className="onboarding-icon"><Building2 size={22} /></div>
      <p className="eyebrow">WORKSPACE SETUP</p>
      <h1>Set up your Adometa workspace</h1>
      <p className="muted">Submit your company details and plan request. A platform administrator must approve access before CRM data is available.</p>
      {loading ? <div className="inline-loading">Loading available plans and request status...</div> : <>
        {errorMessage && <div className="form-error" role="alert"><span>{errorMessage}</span><button type="button" className="text-button" onClick={() => void load()}>Retry</button></div>}
          {workspaceStatus && <div className="request-state info-state">
            <strong>{workspaceStatus.organization_name}: {workspaceStatus.subscription_status || workspaceStatus.approval_status}</strong>
            <span>{workspaceStatus.organization_active
              ? `Workspace access is waiting for an active subscription or administrator action. Current plan: ${workspaceStatus.plan_name || "not assigned"}.`
              : `This workspace is inactive (${workspaceStatus.approval_status}). Contact your platform administrator to restore access.`}</span>
            {workspaceStatus.current_period_end && <span>Last configured period end: {new Date(workspaceStatus.current_period_end).toLocaleDateString()}.</span>}
            <button className="button secondary" onClick={onRefreshMembership}>Check access again</button>
          </div>}
        {latestRequest?.status === "approved" && !openRequest && <div className="request-state success-state">
          <strong>Workspace request approved</strong>
          <span>Your company access is approved. Refresh access to continue.</span>
          <button className="button primary" onClick={onRefreshMembership}><RefreshCw size={16} /> Check workspace access</button>
        </div>}
        {!workspaceStatus && openRequest?.status === "pending" && <div className="request-state">
          <strong>Request pending review</strong>
          <span>{openRequest.company_name} · {openRequest.workspace_name}</span>
          <span>Submitted {new Date(openRequest.created_at).toLocaleString()}. You can return here to check for updates.</span>
          <button className="button secondary" onClick={() => void load()}><RefreshCw size={16} /> Refresh status</button>
        </div>}
        {!workspaceStatus && openRequest?.status === "information_requested" && <form className="onboarding-form" onSubmit={resubmit}>
          <div className="request-state info-state"><strong>More information is needed</strong><span>{openRequest.admin_message}</span></div>
          <label>Additional information<textarea required maxLength={2000} value={additionalInformation} onChange={(event) => setAdditionalInformation(event.target.value)} /></label>
          <button className="button primary" disabled={busy}>{busy ? "Submitting..." : "Resubmit request"}</button>
        </form>}
        {!workspaceStatus && !openRequest && latestRequest?.status !== "approved" && <form className="onboarding-form" onSubmit={submit}>
          {latestRequest?.status === "rejected" && <div className="request-state rejection-state">
            <strong>Previous request was not approved</strong>
            <span>{latestRequest.rejection_reason || latestRequest.admin_message || "You may submit an updated request."}</span>
          </div>}
          <label>Full name<input required autoComplete="name" minLength={2} maxLength={100} value={fullName} onChange={(event) => setFullName(event.target.value)} /></label>
          <label>Email address<input readOnly value={email} aria-label="Signed-in email address" /></label>
          <label>Company name<input required minLength={2} maxLength={160} value={companyName} onChange={(event) => setCompanyName(event.target.value)} /></label>
          <label>Workspace name<input required minLength={2} maxLength={160} value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} /></label>
          <label>Contact mobile number<input required type="tel" autoComplete="tel" pattern="[+0-9 ()-]{7,32}" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
          <label>Requested plan<select required value={planId} onChange={(event) => setPlanId(event.target.value)}>
            <option value="" disabled>Select a plan</option>
            {plans.map((plan) => <option value={plan.id} key={plan.id}>{plan.name} — {formatPlanPrice(plan)}</option>)}
          </select></label>
          {!plansLoadFailed && plans.length === 0 && <p className="form-error">No active plans are available. Contact Adometa support.</p>}
          <label>Additional information (optional)<textarea maxLength={2000} value={additionalInformation} onChange={(event) => setAdditionalInformation(event.target.value)} /></label>
          <button className="button primary" disabled={busy || plans.length === 0 || plansLoadFailed}>{busy ? "Submitting..." : "Submit for approval"}</button>
        </form>}
        {requests.length > 1 && <div className="request-history">
          <h2>Request history</h2>
          {requests.slice(1).map((request) => <div className="request-history-row" key={request.id}>
            <span>{request.company_name} · {request.workspace_name}</span>
            <strong>{request.status.replace(/_/g, " ")}</strong>
            <time>{new Date(request.created_at).toLocaleDateString()}</time>
          </div>)}
        </div>}
      </>}
    </section>
    <footer className="onboarding-footer"><ShieldCheck size={15} /> Workspace access and billing changes are verified by Adometa.</footer>
  </main>;
}
