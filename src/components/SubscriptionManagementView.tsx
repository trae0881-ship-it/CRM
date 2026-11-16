import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CreditCard, UsersRound, X } from "lucide-react";
import {
  configurePlatformSubscription,
  expirePlatformSubscriptions,
  listPlatformPayments,
  listPlatformSeatOverview,
  updatePlatformSalespersonLimit,
  type PlatformCompany,
  type PlatformPayment,
  type PlatformPlan,
  type PlatformSeatOverview,
  type PlatformSubscription,
} from "../services/platform";

type Props = {
  companies: PlatformCompany[];
  plans: PlatformPlan[];
  subscriptions: PlatformSubscription[];
  onChanged: () => Promise<void>;
  onNotify: (message: string) => void;
};

const periods = [
  ["monthly", "Monthly"],
  ["quarterly", "Quarterly"],
  ["half_yearly", "Half-yearly"],
  ["yearly", "Yearly"],
] as const;

const priceFor = (plan: PlatformPlan | undefined, period: string) => {
  if (!plan) return 0;
  if (period === "quarterly") return Number(plan.price_quarterly);
  if (period === "half_yearly") return Number(plan.price_half_yearly);
  if (period === "yearly") return Number(plan.price_yearly);
  return Number(plan.price_monthly);
};

export function SubscriptionManagementView({ companies, plans, subscriptions, onChanged, onNotify }: Props) {
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [planId, setPlanId] = useState("");
  const [status, setStatus] = useState<"active" | "trialing">("trialing");
  const [billingPeriod, setBillingPeriod] = useState<(typeof periods)[number][0]>("monthly");
  const [useCustomLimit, setUseCustomLimit] = useState(false);
  const [seatLimit, setSeatLimit] = useState("");
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentCurrency, setPaymentCurrency] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [seatOverview, setSeatOverview] = useState<PlatformSeatOverview[]>([]);
  const [payments, setPayments] = useState<PlatformPayment[]>([]);
  const [busy, setBusy] = useState(false);

  const subscriptionByCompany = useMemo(
    () => new Map(subscriptions.map((subscription) => [subscription.organization_id, subscription])),
    [subscriptions],
  );
  const selectedPlan = plans.find((plan) => plan.id === planId);
  const selectedPrice = priceFor(selectedPlan, billingPeriod);
  const expectedPayment = status === "active" && selectedPrice > 0;

  const loadExtra = async () => {
    try {
      const [nextSeats, nextPayments] = await Promise.all([listPlatformSeatOverview(), listPlatformPayments()]);
      setSeatOverview(nextSeats);
      setPayments(nextPayments);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Seat and payment data could not be loaded.");
    }
  };
  useEffect(() => { void loadExtra(); }, []);

  const openConfigure = (company: PlatformCompany, current?: PlatformSubscription) => {
    const defaultPlanId = current?.plan_id || plans.find((plan) => plan.is_active)?.id || "";
    setSelectedCompany(company.id);
    setPlanId(defaultPlanId);
    setStatus(current?.status === "trialing" ? "trialing" : "active");
    setBillingPeriod((periods.find(([value]) => value === current?.billing_period)?.[0] || "monthly") as (typeof periods)[number][0]);
    setUseCustomLimit(current?.has_custom_salesperson_limit ?? false);
    setSeatLimit(current?.salesperson_limit_override === null || current?.salesperson_limit_override === undefined ? "" : String(current.salesperson_limit_override));
    setPaymentConfirmed(false);
    setPaymentAmount("");
    setPaymentCurrency(plans.find((plan) => plan.id === defaultPlanId)?.currency_code || "");
    setPaymentReference("");
  };

  const selectedCompanyData = companies.find((company) => company.id === selectedCompany);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedCompany || !planId) return onNotify("Select a company and active plan.");
    setBusy(true);
    try {
      await configurePlatformSubscription({
        organizationId: selectedCompany,
        planId,
        status,
        billingPeriod,
        useCustomSalespersonLimit: useCustomLimit,
        salespersonLimit: useCustomLimit ? Number(seatLimit) : null,
        manualPaymentConfirmed: paymentConfirmed,
        manualPaymentAmount: paymentAmount ? Number(paymentAmount) : null,
        manualPaymentCurrency: paymentCurrency.trim().toUpperCase() || null,
        manualPaymentReference: paymentReference.trim() || null,
      });
      setSelectedCompany(null);
      await Promise.all([onChanged(), loadExtra()]);
      onNotify(expectedPayment ? "Subscription activated with a verified manual payment record." : "Subscription updated.");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Subscription update failed.");
    } finally {
      setBusy(false);
    }
  };

  const updateSeatLimit = async (seat: PlatformSeatOverview) => {
    const next = window.prompt(`New total active salesperson limit for ${seat.organization_name}`, String(seat.salesperson_limit ?? ""));
    if (next === null) return;
    if (!/^\d+$/.test(next.trim())) return onNotify("Enter a non-negative whole number.");
    const reason = window.prompt("Reason for this seat-limit change");
    if (!reason?.trim()) return onNotify("A reason is required.");
    setBusy(true);
    try {
      await updatePlatformSalespersonLimit(seat.organization_id, Number(next), reason);
      await loadExtra();
      onNotify("Salesperson limit updated and audited.");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Salesperson limit update failed.");
    } finally {
      setBusy(false);
    }
  };

  const expire = async () => {
    if (!window.confirm("Expire overdue trials and subscriptions now? Workspace access will be suspended.")) return;
    setBusy(true);
    try {
      const count = await expirePlatformSubscriptions();
      await Promise.all([onChanged(), loadExtra()]);
      onNotify(`${count} overdue subscription${count === 1 ? "" : "s"} expired.`);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Expiration check failed.");
    } finally {
      setBusy(false);
    }
  };

  return <>
    <section className="card table-card">
      <div className="card-header"><div><h2>Subscriptions</h2><p>Paid activation requires explicit manual payment verification. No payment is assumed.</p></div><div className="section-actions"><button className="button secondary" disabled={busy} onClick={() => void expire()}>Expire overdue</button><CreditCard size={18} /></div></div>
      <div className="table-scroll"><table><thead><tr><th>COMPANY</th><th>PLAN</th><th>STATUS</th><th>BILLING</th><th>PERIOD END</th><th>ACTION</th></tr></thead><tbody>
        {companies.map((company) => {
          const subscription = subscriptionByCompany.get(company.id);
          const plan = subscription?.subscription_plans;
          return <tr key={company.id}><td>{company.name}</td><td>{plan?.name || "Not assigned"}</td><td>{subscription?.status || "Not assigned"}</td><td>{subscription?.billing_period?.replaceAll("_", " ") || "—"}</td><td>{subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : "—"}</td><td><button className="button secondary" disabled={busy || plans.filter((item) => item.is_active).length === 0} onClick={() => openConfigure(company, subscription)}>{subscription ? "Configure" : "Assign plan"}</button></td></tr>;
        })}
      </tbody></table></div>
    </section>

    <section className="card table-card">
      <div className="card-header"><div><h2>Salesperson seats</h2><p>Seat limits are checked in the database on user activation and invitation.</p></div><UsersRound size={18} /></div>
      <div className="table-scroll"><table><thead><tr><th>COMPANY</th><th>PLAN</th><th>ACTIVE SALESPEOPLE</th><th>LIMIT</th><th>ACTION</th></tr></thead><tbody>
        {seatOverview.map((seat) => <tr key={seat.organization_id}><td>{seat.organization_name}</td><td>{seat.plan_name}</td><td>{seat.active_salespeople}</td><td>{seat.salesperson_limit ?? "Unlimited"}{seat.has_custom_limit ? " (custom)" : ""}</td><td><button className="button secondary" disabled={busy} onClick={() => void updateSeatLimit(seat)}>Change limit</button></td></tr>)}
      </tbody></table></div>
    </section>

    <section className="card table-card">
      <div className="card-header"><div><h2>Payment records</h2><p>Historical payment records are preserved; manual verification is explicitly labeled.</p></div><CreditCard size={18} /></div>
      <div className="table-scroll"><table><thead><tr><th>COMPANY</th><th>AMOUNT</th><th>STATUS</th><th>VERIFICATION</th><th>REFERENCE</th><th>RECORDED</th></tr></thead><tbody>
        {payments.map((payment) => <tr key={payment.id}><td>{payment.organizations?.name || payment.organization_id}</td><td>{payment.currency_code || "Currency n/a"} {Number(payment.amount).toFixed(2)}</td><td>{payment.status}</td><td>{payment.verification_method === "manual" ? `Manually verified${payment.verified_at ? ` · ${new Date(payment.verified_at).toLocaleDateString()}` : ""}` : payment.verification_method || "Legacy / provider"}</td><td>{payment.external_reference || "—"}</td><td>{new Date(payment.created_at).toLocaleDateString()}</td></tr>)}
        {payments.length === 0 && <tr><td colSpan={6}>No payment records.</td></tr>}
      </tbody></table></div>
    </section>

    {selectedCompany && selectedCompanyData && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelectedCompany(null)}>
      <form className="modal subscription-config-modal" onSubmit={save}>
        <div className="modal-head"><div><p className="eyebrow">BILLING &amp; ACCESS</p><h2>Configure {selectedCompanyData.name}</h2></div><button type="button" className="icon-button" aria-label="Close dialog" onClick={() => setSelectedCompany(null)}><X size={18} /></button></div>
        <div className="contact-field-grid">
          <label>Plan<select required value={planId} onChange={(event) => { setPlanId(event.target.value); setPaymentCurrency(plans.find((plan) => plan.id === event.target.value)?.currency_code || ""); setPaymentConfirmed(false); setPaymentAmount(""); setPaymentReference(""); }}>
            <option value="">Select a plan</option>{plans.filter((plan) => plan.is_active).map((plan) => <option value={plan.id} key={plan.id}>{plan.name}</option>)}
          </select></label>
          <label>Subscription status<select value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setPaymentConfirmed(false); setPaymentAmount(""); setPaymentReference(""); }}>
            <option value="trialing">Trial</option><option value="active">Active</option>
          </select></label>
          <label>Billing period<select value={billingPeriod} onChange={(event) => { setBillingPeriod(event.target.value as typeof billingPeriod); setPaymentConfirmed(false); setPaymentAmount(""); setPaymentReference(""); }}>
            {periods.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select></label>
        </div>
        {status === "trialing" ? <p className="muted">Trial duration is configured on the selected plan: {selectedPlan?.trial_days ?? 0} days.</p> : <p className="manual-payment-notice">Configured price: {selectedPlan?.currency_code || "Currency not configured"} {selectedPrice.toFixed(2)} for this period. Offline payment must be independently verified before confirmation.</p>}
        <label className="checkbox-field"><input type="checkbox" checked={useCustomLimit} onChange={(event) => setUseCustomLimit(event.target.checked)} /> Set a custom salesperson limit for this company</label>
        {useCustomLimit && <label>Salesperson limit<input type="number" min="0" required value={seatLimit} onChange={(event) => setSeatLimit(event.target.value)} /></label>}
        {expectedPayment && <fieldset className="manual-payment-fieldset">
          <legend>Manual payment confirmation</legend>
          <label className="checkbox-field"><input required type="checkbox" checked={paymentConfirmed} onChange={(event) => setPaymentConfirmed(event.target.checked)} /> I verified receipt of the full configured amount outside this application.</label>
          <div className="contact-field-grid">
            <label>Received amount<input required type="number" min="0" step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /></label>
            <label>Currency<input required maxLength={3} value={paymentCurrency} onChange={(event) => setPaymentCurrency(event.target.value.toUpperCase())} /></label>
          </div>
          <label>Payment reference<input required maxLength={160} value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} /></label>
        </fieldset>}
        <div className="modal-actions"><button type="button" className="button secondary" onClick={() => setSelectedCompany(null)}>Cancel</button><button className="button primary" disabled={busy}>{busy ? "Saving..." : "Save subscription"}</button></div>
      </form>
    </div>}
  </>;
}
