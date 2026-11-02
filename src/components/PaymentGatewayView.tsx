import { useEffect, useState } from "react";
import { CreditCard, ShieldCheck } from "lucide-react";
import type { Membership } from "../services/workspace";
import { getPaymentGatewayOverview, type PaymentGatewayOverview } from "../services/platform";

function PageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{description}</p></div></div>;
}

export function PaymentGatewayView({ membership, onNotify }: { membership: Membership; onNotify: (message: string) => void }) {
  const [overview, setOverview] = useState<PaymentGatewayOverview | null>(null);
  useEffect(() => {
    if (membership.role !== "super_admin") return;
    void getPaymentGatewayOverview().then(setOverview).catch((error: unknown) => onNotify(error instanceof Error ? error.message : "Payment gateway data could not be loaded."));
  }, [membership.role, onNotify]);
  if (membership.role !== "super_admin") return <section className="card pending-module"><ShieldCheck size={24} /><h2>Payment gateway administration is restricted.</h2><p className="muted">A Super Admin membership is required.</p></section>;
  const metrics = [
    ["Total payment attempts", overview?.total_attempts],
    ["Reconciled payments", overview?.reconciled_payments],
    ["Awaiting reconciliation", overview?.awaiting_reconciliation],
    ["Manual review payments", overview?.manual_review_payments],
    ["Failed payments", overview?.failed_payments],
    ["Expired payments", overview?.expired_payments],
    ["Reconciled amount", overview ? `INR ${overview.reconciled_amount.toFixed(2)}` : "—"],
  ];
  return <><PageHeader eyebrow="PAYMENT OPERATIONS" title="Payment Gateway" description="YouPI-PG operational status. Secrets remain server-side and UPI payments activate only after reconciliation." /><section className="card"><div className="card-header"><div><h2><CreditCard size={18} /> Gateway overview</h2><p>Configuration is supplied through protected server environment variables.</p></div><span className={`status-pill ${overview?.enabled ? "success" : "neutral"}`}>{overview?.enabled ? "Enabled" : "Not enabled"}</span></div><div className="stats-grid">{metrics.map(([label, value]) => <div className="stat-card" key={String(label)}><div className="stat-top"><span>{label}</span><CreditCard size={17} /></div><strong>{value ?? "—"}</strong><small>Authoritative ledger data</small></div>)}</div><dl className="detail-list"><div><dt>Provider</dt><dd>{overview?.provider || "youpi_pg"}</dd></div><div><dt>Connection status</dt><dd>{overview?.connection_status || "not_configured"}</dd></div><div><dt>Mode</dt><dd>{overview?.test_mode ? "Test mode" : "Live mode"}</dd></div><div><dt>Merchant identification suffix</dt><dd>{overview?.merchant_id ? `••••${overview.merchant_id}` : "Not configured"}</dd></div><div><dt>Last successful webhook</dt><dd>{overview?.last_successful_webhook ? new Date(overview.last_successful_webhook).toLocaleString() : "None recorded"}</dd></div><div><dt>Last webhook error</dt><dd>{overview?.last_webhook_error || "None recorded"}</dd></div></dl></section></>;
}
