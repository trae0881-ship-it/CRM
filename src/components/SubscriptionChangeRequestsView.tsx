import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, MessageSquareText, X } from "lucide-react";
import {
  listPlatformChangeRequests,
  reviewPlatformChangeRequest,
  type PlatformChangeRequest,
} from "../services/platform";

type Props = { onChanged: () => Promise<void>; onNotify: (message: string) => void };
type Decision = "information_requested" | "approved" | "rejected";

export function SubscriptionChangeRequestsView({ onChanged, onNotify }: Props) {
  const [requests, setRequests] = useState<PlatformChangeRequest[]>([]);
  const [selected, setSelected] = useState<PlatformChangeRequest | null>(null);
  const [decision, setDecision] = useState<Decision>("information_requested");
  const [response, setResponse] = useState("");
  const [filter, setFilter] = useState("open");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const pageSize = 10;

  const load = async () => {
    try { setRequests(await listPlatformChangeRequests()); }
    catch (error) { onNotify(error instanceof Error ? error.message : "Subscription change requests could not be loaded."); }
  };
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => requests.filter((request) => {
    const text = `${request.organization_name} ${request.requester_name || ""} ${request.requester_email}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (
      filter === "all" ||
      (filter === "open" ? request.status === "pending" || request.status === "information_requested" : request.status === filter)
    );
  }), [requests, query, filter]);
  const pageItems = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const open = (request: PlatformChangeRequest) => {
    setSelected(request);
    setDecision("information_requested");
    setResponse("");
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    if (!response.trim()) return onNotify("Record a response before changing request status.");
    setBusy(true);
    try {
      const savedResponse = decision === "approved"
        ? `${response.trim()} Subscription changes are not applied by this request action; configure them in Subscription management after any required payment verification.`
        : response.trim();
      await reviewPlatformChangeRequest(selected.id, decision, savedResponse);
      setSelected(null);
      await Promise.all([load(), onChanged()]);
      onNotify(`Request marked ${decision.replace(/_/g, " ")}. No payment or plan change was assumed.`);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Subscription change request could not be updated.");
    } finally { setBusy(false); }
  };

  return <>
    <section className="card table-card">
      <div className="card-header"><div><h2>Plan and seat-change requests</h2><p>Responses are recorded for the organization. Approval does not apply billing or seat changes automatically.</p></div><MessageSquareText size={18} /></div>
      <div className="table-toolbar">
        <input aria-label="Search subscription change requests" placeholder="Search company or requester" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} />
        <select aria-label="Filter subscription change requests" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(0); }}>
          <option value="open">Open requests</option><option value="all">All requests</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
        </select>
      </div>
      <div className="table-scroll"><table><thead><tr><th>COMPANY</th><th>REQUESTED BY</th><th>REQUEST</th><th>STATUS</th><th>DATE</th><th>ACTION</th></tr></thead><tbody>
        {pageItems.map((request) => <tr key={request.id}>
          <td>{request.organization_name}</td><td>{request.requester_name || request.requester_email}<small className="table-secondary">{request.requester_email}</small></td>
          <td>{request.request_type === "plan_upgrade" ? `Plan upgrade to ${request.target_plan_name || "selected plan"}` : `Salesperson limit: ${request.requested_salespeople}`}</td>
          <td>{request.status.replace(/_/g, " ")}</td><td>{new Date(request.created_at).toLocaleDateString()}</td>
          <td>{request.status === "pending" || request.status === "information_requested" ? <button className="button secondary" onClick={() => open(request)}>Respond</button> : request.admin_message || "—"}</td>
        </tr>)}
        {pageItems.length === 0 && <tr><td colSpan={6}>No matching requests.</td></tr>}
      </tbody></table></div>
      <div className="table-pagination"><span>{filtered.length ? `${page * pageSize + 1}-${Math.min((page + 1) * pageSize, filtered.length)} of ${filtered.length}` : "0 requests"}</span><div><button className="button secondary" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</button><button className="button secondary" disabled={(page + 1) * pageSize >= filtered.length} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>
    </section>
    {selected && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}>
      <form className="modal" onSubmit={submit}>
        <div className="modal-head"><div><p className="eyebrow">SUBSCRIPTION REQUEST</p><h2>{selected.organization_name}</h2></div><button type="button" className="icon-button" aria-label="Close dialog" onClick={() => setSelected(null)}><X size={18} /></button></div>
        <p>{selected.request_type === "plan_upgrade" ? `Requested plan: ${selected.target_plan_name}` : `Requested total salesperson limit: ${selected.requested_salespeople}`}</p>
        {selected.message && <div className="request-state"><strong>Company message</strong><span>{selected.message}</span></div>}
        <label>Response status<select value={decision} onChange={(event) => setDecision(event.target.value as Decision)}><option value="information_requested">Request more information</option><option value="approved">Approve request</option><option value="rejected">Reject request</option></select></label>
        <label>Response<textarea required maxLength={2000} value={response} onChange={(event) => setResponse(event.target.value)} placeholder={decision === "approved" ? "Describe next steps. Subscription configuration and any payment confirmation are recorded separately." : "Enter a response for the company administrator."} /></label>
        {decision === "approved" && <p className="manual-payment-notice">Approval records the response only. Use Subscription management to apply plan or seat changes; paid activation requires manual payment confirmation.</p>}
        <div className="modal-actions"><button type="button" className="button secondary" onClick={() => setSelected(null)}>Cancel</button><button className="button primary" disabled={busy}><Check size={16} /> {busy ? "Saving..." : "Record response"}</button></div>
      </form>
    </div>}
  </>;
}
