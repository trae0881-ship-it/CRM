import { useMemo, useState, type FormEvent } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { savePlatformPlan, type PlatformPlan } from "../services/platform";

type Props = {
  plans: PlatformPlan[];
  isLoading: boolean;
  loadError: string;
  onChanged: () => Promise<void>;
  onNotify: (message: string) => void;
};
type PlanForm = {
  id: string | null; code: string; name: string; description: string; currency: string;
  monthly: string; quarterly: string; halfYearly: string; yearly: string;
  maxUsers: string; maxSalespeople: string; maxManagers: string; maxAdmins: string; maxLeads: string;
  trialDays: string; validityDays: string; renewal: "manual" | "contact_required";
  active: boolean; salesPipeline: boolean; automation: boolean;
};

const blankForm = (): PlanForm => ({
  id: null, code: "", name: "", description: "", currency: "",
  monthly: "0", quarterly: "0", halfYearly: "0", yearly: "0",
  maxUsers: "", maxSalespeople: "", maxManagers: "", maxAdmins: "", maxLeads: "",
  trialDays: "0", validityDays: "", renewal: "manual", active: true,
  salesPipeline: false, automation: false,
});
const nullableInteger = (value: string) => value.trim() ? Number(value) : null;

function formFromPlan(plan: PlatformPlan): PlanForm {
  return {
    id: plan.id, code: plan.code, name: plan.name, description: plan.description || "",
    currency: plan.currency_code || "", monthly: String(plan.price_monthly), quarterly: String(plan.price_quarterly),
    halfYearly: String(plan.price_half_yearly), yearly: String(plan.price_yearly),
    maxUsers: plan.max_users === null ? "" : String(plan.max_users),
    maxSalespeople: plan.max_salespeople === null ? "" : String(plan.max_salespeople),
    maxManagers: plan.max_managers === null ? "" : String(plan.max_managers),
    maxAdmins: plan.max_admins === null ? "" : String(plan.max_admins),
    maxLeads: plan.max_leads === null ? "" : String(plan.max_leads),
    trialDays: String(plan.trial_days), validityDays: plan.validity_days === null ? "" : String(plan.validity_days),
    renewal: plan.renewal_behavior, active: plan.is_active,
    salesPipeline: plan.features?.sales_pipeline === true, automation: plan.features?.automation === true,
  };
}

export function PlatformPlanManagementView({ plans, isLoading, loadError, onChanged, onNotify }: Props) {
  const [form, setForm] = useState<PlanForm | null>(null);
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const shownPlans = useMemo(() => plans.filter((plan) => {
    const matchesText = `${plan.name} ${plan.code}`.toLowerCase().includes(query.toLowerCase());
    const matchesActive = activeFilter === "all" || (activeFilter === "active" ? plan.is_active : !plan.is_active);
    return matchesText && matchesActive;
  }), [plans, query, activeFilter]);
  const hasPaidPrice = form
    ? [form.monthly, form.quarterly, form.halfYearly, form.yearly].some((price) => Number(price) > 0)
    : false;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    if (hasPaidPrice && !/^[A-Z]{3}$/.test(form.currency.trim().toUpperCase())) {
      onNotify("Enter a three-letter currency code for a paid plan.");
      return;
    }
    setBusy(true);
    let saved = false;
    try {
      await savePlatformPlan({
        id: form.id, code: form.code.trim().toLowerCase(), name: form.name.trim(),
        description: form.description.trim(), currency_code: form.currency.trim().toUpperCase() || null,
        price_monthly: Number(form.monthly), price_quarterly: Number(form.quarterly),
        price_half_yearly: Number(form.halfYearly), price_yearly: Number(form.yearly),
        max_users: nullableInteger(form.maxUsers), max_salespeople: nullableInteger(form.maxSalespeople),
        max_managers: nullableInteger(form.maxManagers), max_admins: nullableInteger(form.maxAdmins),
        max_leads: nullableInteger(form.maxLeads), trial_days: Number(form.trialDays),
        validity_days: nullableInteger(form.validityDays), renewal_behavior: form.renewal,
        expiry_behavior: "suspend",
        is_active: form.active,
        features: {
          ...(plans.find((plan) => plan.id === form.id)?.features || {}),
          sales_pipeline: form.salesPipeline,
          automation: form.automation,
        },
      });
      saved = true;
      setForm(null);
      await onChanged();
      onNotify(form.id ? "Subscription plan updated." : "Subscription plan created.");
    } catch (error) {
      const details = error instanceof Error ? error.message : "Unknown error.";
      onNotify(saved
        ? `Plan saved, but the list could not be refreshed: ${details}`
        : `Subscription plan could not be saved: ${details}`);
    } finally {
      setBusy(false);
    }
  };

  return <>
    <section className="card table-card">
      <div className="card-header">
        <div><h2>Subscription plans</h2><p>Active plans with at least one nonzero price are offered for new workspace requests.</p></div>
        <button className="button primary" onClick={() => setForm(blankForm())}><Plus size={16} /> Add plan</button>
      </div>
      <div className="table-toolbar">
        <input aria-label="Search subscription plans" placeholder="Search plans" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select aria-label="Filter plans by status" value={activeFilter} onChange={(event) => setActiveFilter(event.target.value)}>
          <option value="all">All plans</option><option value="active">Active</option><option value="inactive">Inactive</option>
        </select>
      </div>
      {loadError && <p className="muted" role="alert">Plans could not be loaded: {loadError} <button className="button secondary" onClick={() => void onChanged().catch((error: unknown) => onNotify(error instanceof Error ? error.message : "Subscription plans could not be loaded."))}>Retry</button></p>}
      <div className="table-scroll"><table><thead><tr><th>PLAN</th><th>PRICE / MONTH</th><th>USER LIMITS</th><th>TRIAL</th><th>FEATURE ACCESS</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>
        {shownPlans.map((plan) => <tr key={plan.id}>
          <td><strong>{plan.name}</strong><small className="table-secondary">{plan.code}</small></td>
          <td>{plan.currency_code || "Currency n/a"} {Number(plan.price_monthly).toFixed(2)}</td>
          <td>{plan.max_users ?? "Unlimited"} total · {plan.max_salespeople ?? "Unlimited"} salespeople</td>
          <td>{plan.trial_days} days</td>
          <td>{plan.features?.sales_pipeline === true ? "Pipeline" : "No pipeline"} · {plan.features?.automation === true ? "Automation" : "No automation"}</td>
          <td>{plan.is_active ? "Active" : "Inactive"}</td>
          <td><button className="button secondary" onClick={() => setForm(formFromPlan(plan))}><Pencil size={14} /> Edit</button></td>
        </tr>)}
        {shownPlans.length === 0 && <tr><td colSpan={7}>{isLoading ? "Loading plans…" : loadError ? "Plans are unavailable until loading succeeds." : "No matching plans."}</td></tr>}
      </tbody></table></div>
    </section>

    {form && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setForm(null)}>
      <form className="modal plan-editor-modal" onSubmit={save}>
        <div className="modal-head"><div><p className="eyebrow">PLAN CONFIGURATION</p><h2>{form.id ? "Edit plan" : "Create plan"}</h2></div><button type="button" className="icon-button" aria-label="Close dialog" onClick={() => setForm(null)}><X size={18} /></button></div>
        <div className="contact-field-grid">
          <label>Plan code<input required minLength={2} maxLength={64} pattern="[a-z0-9_-]+" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} /></label>
          <label>Plan name<input required minLength={2} maxLength={100} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        </div>
        <label>Description<textarea maxLength={1000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
        <div className="contact-field-grid">
          <label>Currency code<input required={hasPaidPrice} maxLength={3} pattern="[A-Za-z]{3}" placeholder="Required for paid plans" value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} /></label>
          <label>Renewal behavior<select value={form.renewal} onChange={(event) => setForm({ ...form, renewal: event.target.value as PlanForm["renewal"] })}><option value="manual">Manual renewal</option><option value="contact_required">Contact Adometa</option></select></label>
        </div>
        <div className="contact-field-grid plan-price-grid">
          <label>Monthly price<input required type="number" min="0" step="0.01" value={form.monthly} onChange={(event) => setForm({ ...form, monthly: event.target.value })} /></label>
          <label>Quarterly price<input required type="number" min="0" step="0.01" value={form.quarterly} onChange={(event) => setForm({ ...form, quarterly: event.target.value })} /></label>
          <label>Half-yearly price<input required type="number" min="0" step="0.01" value={form.halfYearly} onChange={(event) => setForm({ ...form, halfYearly: event.target.value })} /></label>
          <label>Yearly price<input required type="number" min="0" step="0.01" value={form.yearly} onChange={(event) => setForm({ ...form, yearly: event.target.value })} /></label>
        </div>
        <div className="contact-field-grid plan-limits-grid">
          <label>Total user limit<input type="number" min="1" placeholder="Unlimited" value={form.maxUsers} onChange={(event) => setForm({ ...form, maxUsers: event.target.value })} /></label>
          <label>Salesperson limit<input type="number" min="0" placeholder="Unlimited" value={form.maxSalespeople} onChange={(event) => setForm({ ...form, maxSalespeople: event.target.value })} /></label>
          <label>Manager limit<input type="number" min="0" placeholder="Unlimited" value={form.maxManagers} onChange={(event) => setForm({ ...form, maxManagers: event.target.value })} /></label>
          <label>Owner/admin limit<input type="number" min="1" placeholder="Unlimited" value={form.maxAdmins} onChange={(event) => setForm({ ...form, maxAdmins: event.target.value })} /></label>
          <label>Lead limit<input type="number" min="0" placeholder="Unlimited" value={form.maxLeads} onChange={(event) => setForm({ ...form, maxLeads: event.target.value })} /></label>
          <label>Trial days<input type="number" min="0" value={form.trialDays} onChange={(event) => setForm({ ...form, trialDays: event.target.value })} /></label>
          <label>Validity days (optional)<input type="number" min="1" value={form.validityDays} onChange={(event) => setForm({ ...form, validityDays: event.target.value })} /></label>
        </div>
        <fieldset className="plan-feature-fieldset">
          <legend>Enforced optional feature access</legend>
          <label className="checkbox-field"><input type="checkbox" checked={form.salesPipeline} onChange={(event) => setForm({ ...form, salesPipeline: event.target.checked })} /> Sales pipeline</label>
          <label className="checkbox-field"><input type="checkbox" checked={form.automation} onChange={(event) => setForm({ ...form, automation: event.target.checked })} /> CRM automation</label>
          <p>Core lead, team and report modules are not controlled by these optional switches. Expired subscriptions suspend workspace access.</p>
        </fieldset>
        <label className="checkbox-field"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Plan is available for new workspace approvals</label>
        <div className="modal-actions"><button type="button" className="button secondary" onClick={() => setForm(null)}>Cancel</button><button className="button primary" disabled={busy}><Check size={16} /> {busy ? "Saving..." : "Save plan"}</button></div>
      </form>
    </div>}
  </>;
}
