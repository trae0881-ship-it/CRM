import { useEffect, useState, type FormEvent } from "react";
import { CreditCard, UsersRound } from "lucide-react";
import {
  getOrganizationSalespersonUsage,
  listAvailableSubscriptionPlans,
  listOrganizationChangeRequests,
  resubmitSubscriptionChangeRequest,
  requestSubscriptionChange,
  type AvailableSubscriptionPlan,
  type OrganizationChangeRequest,
  type OrganizationSubscription,
} from "../services/workspace";

type Props = { organizationId: string; onNotify: (message: string) => void };

export function CompanySubscriptionPanel({ organizationId, onNotify }: Props) {
  const [subscription, setSubscription] = useState<OrganizationSubscription | null>(null);
  const [activeSalespeople, setActiveSalespeople] = useState(0);
  const [plans, setPlans] = useState<AvailableSubscriptionPlan[]>([]);
  const [requests, setRequests] = useState<OrganizationChangeRequest[]>([]);
  const [requestType, setRequestType] = useState<"additional_salespeople" | "plan_upgrade">("additional_salespeople");
  const [targetPlan, setTargetPlan] = useState("");
  const [requestedLimit, setRequestedLimit] = useState("");
  const [message, setMessage] = useState("");
  const [requestReply, setRequestReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const load = async () => {
    try {
      const [usage, availablePlans, changeRequests] = await Promise.all([
        getOrganizationSalespersonUsage(organizationId),
        listAvailableSubscriptionPlans(),
        listOrganizationChangeRequests(organizationId),
      ]);
      setSubscription(usage.subscription);
      setActiveSalespeople(usage.activeSalespeople);
      setPlans(availablePlans);
      setRequests(changeRequests);
      if (!targetPlan && usage.subscription) setTargetPlan(usage.subscription.plan_id);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Subscription details could not be loaded.");
    }
  };
  useEffect(() => { void load(); }, [organizationId]);

  const openRequest = requests.find((request) => request.status === "pending" || request.status === "information_requested");
  const plan = subscription?.subscription_plans;
  const effectiveLimit = subscription?.has_custom_salesperson_limit
    ? subscription.salesperson_limit_override
    : plan?.max_salespeople ?? null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await requestSubscriptionChange({
        type: requestType,
        planId: requestType === "plan_upgrade" ? targetPlan : undefined,
        salespersonLimit: requestType === "additional_salespeople" ? Number(requestedLimit) : undefined,
        message,
      });
      setRequestedLimit("");
      setMessage("");
      await load();
      onNotify("Subscription change request submitted for platform review.");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Subscription change request failed.");
    } finally {
      setBusy(false);
    }
  };
  const resubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!openRequest) return;
    setBusy(true);
    try {
      await resubmitSubscriptionChangeRequest(openRequest.id, requestReply);
      setRequestReply("");
      await load();
      onNotify("Additional information submitted for review.");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "The request response could not be submitted.");
    } finally { setBusy(false); }
  };

  return <section className="card company-subscription">
    <div className="card-header"><div><h2>Subscription &amp; salesperson seats</h2><p>Review your configured plan, current active seats and request a change.</p></div><CreditCard size={18} /></div>
    {errorMessage && <p className="form-error" role="alert">{errorMessage}</p>}
    <div className="subscription-summary">
      <div><small>Current plan</small><strong>{plan?.name || "Not assigned"}</strong></div>
      <div><small>Subscription status</small><strong>{subscription?.status || "—"}</strong></div>
      <div><small>Billing period</small><strong>{subscription?.billing_period?.replaceAll("_", " ") || "—"}</strong></div>
      <div className="seat-summary"><UsersRound size={18} /><div><small>Salespeople</small><strong>{activeSalespeople} / {effectiveLimit ?? "unlimited"}</strong></div></div>
      <div><small>Period end</small><strong>{subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : "—"}</strong></div>
    </div>
    {!subscription && <p className="muted">Your workspace does not have a subscription record. Contact the platform team.</p>}
    {subscription && <>
    {openRequest?.status === "information_requested" && <form className="subscription-request-form info-state" onSubmit={resubmit}>
      <h3>More information requested</h3>
      <p>{openRequest.admin_message}</p>
      <label>Your response<textarea required minLength={1} maxLength={2000} value={requestReply} onChange={(event) => setRequestReply(event.target.value)} /></label>
      <button className="button primary" disabled={busy}>{busy ? "Submitting..." : "Resubmit request"}</button>
    </form>}
      <form className="subscription-request-form" onSubmit={submit}>
        <h3>Request a plan or seat change</h3>
        <div className="contact-field-grid">
          <label>Request type<select value={requestType} onChange={(event) => setRequestType(event.target.value as typeof requestType)}>
            <option value="additional_salespeople">Additional salesperson seats</option>
            <option value="plan_upgrade">Plan upgrade</option>
          </select></label>
          {requestType === "plan_upgrade"
            ? <label>Requested plan<select required value={targetPlan} onChange={(event) => setTargetPlan(event.target.value)}>
              <option value="">Select a plan</option>
              {plans.filter((availablePlan) => availablePlan.id !== subscription.plan_id).map((availablePlan) => <option key={availablePlan.id} value={availablePlan.id}>{availablePlan.name}</option>)}
            </select></label>
            : <label>Requested total salesperson limit<input type="number" min={Math.max(activeSalespeople, 0)} required value={requestedLimit} onChange={(event) => setRequestedLimit(event.target.value)} /></label>}
        </div>
        <label>Notes (optional)<textarea maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} /></label>
        <button className="button primary" disabled={busy || Boolean(openRequest) || (requestType === "plan_upgrade" && !plans.some((availablePlan) => availablePlan.id !== subscription.plan_id))}>
          {busy ? "Submitting..." : openRequest ? "Request under review" : "Submit request"}
        </button>
        {openRequest && <p className="muted">One request is already {openRequest.status.replaceAll("_", " ")}. Wait for a response before submitting another.</p>}
      </form>
      <div className="subscription-request-history">
        <h3>Request history</h3>
        {requests.length === 0 ? <p className="muted">No subscription changes requested.</p> : requests.map((request) => (
          <div className="subscription-request-row" key={request.id}>
            <strong>{request.request_type === "plan_upgrade" ? "Plan upgrade" : `Salesperson limit: ${request.requested_salespeople}`}</strong>
            <span>{request.status.replaceAll("_", " ")}</span>
            <time>{new Date(request.created_at).toLocaleDateString()}</time>
            {request.admin_message && <p>{request.admin_message}</p>}
            {request.requester_followup && <p>Your response: {request.requester_followup}</p>}
          </div>
        ))}
      </div>
    </>}
  </section>;
}
