import { useState } from "react";
import { CreditCard } from "lucide-react";
import { assignPlatformSubscription, type PlatformCompany, type PlatformPlan, type PlatformSubscription } from "../services/platform";

export function SubscriptionManagementView({ companies, plans, subscriptions, onChanged, onNotify }: {
  companies: PlatformCompany[];
  plans: PlatformPlan[];
  subscriptions: PlatformSubscription[];
  onChanged: () => Promise<void>;
  onNotify: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const subscriptionByCompany = new Map(subscriptions.map((subscription) => [subscription.organization_id, subscription]));
  const assign = async (organizationId: string, planId: string, current?: PlatformSubscription, status = current?.status || "trialing") => {
    if (!planId) return;
    setBusy(true);
    try {
      await assignPlatformSubscription(organizationId, planId, status);
      await onChanged();
      onNotify(current ? "Subscription updated." : "Subscription assigned without creating a payment record.");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Subscription assignment failed.");
    } finally {
      setBusy(false);
    }
  };
  return <section className="card table-card"><div className="card-header"><div><h2>Subscription management</h2><p>Configured plans only. Assignment does not invent or confirm a payment.</p></div><CreditCard size={18} /></div><table><thead><tr><th>COMPANY</th><th>PLAN</th><th>STATUS</th><th>PERIOD END</th><th>ACTION</th></tr></thead><tbody>{companies.map((company) => { const subscription = subscriptionByCompany.get(company.id); return <tr key={company.id}><td>{company.name}</td><td><select disabled={busy || !plans.length} value={subscription?.plan_id || ""} onChange={(event) => void assign(company.id, event.target.value, subscription)}><option value="">Select plan</option>{plans.filter((plan) => plan.is_active).map((plan) => <option value={plan.id} key={plan.id}>{plan.name} ({Number(plan.price_monthly).toFixed(2)}/month)</option>)}</select></td><td>{subscription?.status || "Not assigned"}</td><td>{subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : "—"}</td><td>{subscription && <select disabled={busy} value={subscription.status} onChange={(event) => void assign(company.id, subscription.plan_id, subscription, event.target.value)}><option value="trialing">Trialing</option><option value="active">Active</option><option value="past_due">Past due</option><option value="expired">Expired</option><option value="cancelled">Cancelled</option></select>}</td></tr>; })}</tbody></table></section>;
}
