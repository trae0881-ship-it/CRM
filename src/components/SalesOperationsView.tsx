import { useEffect, useState } from "react";
import { Search, ShieldCheck } from "lucide-react";
import type { Membership } from "../services/workspace";
import { listCustomerLeads, listPipelineStages, moveLeadToPipelineStage, type PipelineStageRecord } from "../services/salesOperations";
import type { LeadRecord } from "../types/database";

export function SalesPipelineView({ membership, onNotify }: { membership: Membership; onNotify: (message: string) => void }) {
  const [stages, setStages] = useState<PipelineStageRecord[]>([]);
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [draggedLead, setDraggedLead] = useState<LeadRecord | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([
      listPipelineStages(membership.organization_id),
      listCustomerLeads(membership.organization_id, query),
    ]).then(([nextStages, nextLeads]) => {
      if (!active) return;
      setStages(nextStages);
      setLeads(nextLeads);
    }).catch((error) => {
      if (active) onNotify(error instanceof Error ? error.message : "Pipeline data could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [membership.organization_id, query]);
  const grouped = stages.map((stage) => ({ stage, leads: leads.filter((lead) => lead.pipeline_stage_id === stage.id) }));
  const unassignedLeads = leads.filter((lead) => !stages.some((stage) => stage.id === lead.pipeline_stage_id));
  if (!["company_owner", "organization_admin", "manager", "agent"].includes(membership.role)) return <section className="card pending-module"><ShieldCheck size={24} /><h2>Pipeline access is restricted.</h2><p>Your current role does not have pipeline access. Contact your organization administrator if access is required.</p></section>;
  const move = async (lead: LeadRecord, stage: PipelineStageRecord) => {
    const lostReason = stage.category === "lost" ? window.prompt("Enter the lost reason") : undefined;
    if (stage.category === "lost" && !lostReason?.trim()) return onNotify("A lost reason is required.");
    setBusy(true);
    try {
      const updated = await moveLeadToPipelineStage({ leadId: lead.id, stageId: stage.id, expectedUpdatedAt: lead.updated_at, lostReason: lostReason || undefined });
      setLeads((current) => current.map((item) => item.id === lead.id
        ? { ...item, pipeline_stage_id: updated.pipeline_stage_id, updated_at: updated.updated_at }
        : item));
      onNotify("Lead stage updated.");
    } catch (error) { onNotify(error instanceof Error ? error.message : "Lead stage could not be updated."); } finally { setBusy(false); }
  };
  return <>
    <div className="page-header"><div><p className="eyebrow">SALES OPERATIONS</p><h1>Sales pipeline</h1><p className="muted">Track each lead through the organization’s default sales stages. Move cards by dragging or using the stage menu.</p></div></div>
    <section className="card pipeline-search-card"><label htmlFor="pipeline-customer-search">Search customers</label><div className="pipeline-search"><Search size={16} /><input id="pipeline-customer-search" aria-label="Search customers by name, email or phone number" placeholder="Search by name, email or phone" value={query} onChange={(event) => setQuery(event.target.value)} /></div></section>
    {loading && !leads.length ? <div className="card route-loading" role="status">Loading sales pipeline…</div>
      : !stages.length ? <section className="card empty-state"><p>No pipeline stages are configured. Ask your administrator to check the workspace setup.</p></section>
        : !leads.length ? <section className="card pipeline-empty"><Search size={20} /><strong>No leads match this search</strong><span>Try another name, email or phone number.</span></section>
          : <div className="pipeline-board">
            {grouped.map(({ stage, leads: stageLeads }) => <section className={`pipeline-column pipeline-${stage.category}`} key={stage.id} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggedLead) { void move(draggedLead, stage); setDraggedLead(null); } }}>
              <header className="pipeline-column-heading"><div><h2>{stage.name}</h2><small>{stage.category === "open" ? "In progress" : stage.category}</small></div><span>{stageLeads.length}</span></header>
              <div className="pipeline-column-cards">{stageLeads.map((lead) => <article className="pipeline-card" key={lead.id} draggable={!busy} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; setDraggedLead(lead); }}>
                <strong>{lead.full_name}</strong><span>{lead.company || "No company recorded"}</span><small>{lead.email || lead.phone || "No contact details"}</small>
                <select aria-label={`Move ${lead.full_name} to another stage`} disabled={busy} value={stage.id} onChange={(event) => { const next = stages.find((item) => item.id === event.target.value); if (next) void move(lead, next); }}>
                  <option value={stage.id}>{stage.name}</option>{stages.filter((item) => item.id !== stage.id).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
                </select>
              </article>)}</div>
              {!stageLeads.length && <p className="pipeline-column-empty">No leads in this stage</p>}
            </section>)}
            {unassignedLeads.length > 0 && <section className="pipeline-column pipeline-unassigned">
              <header className="pipeline-column-heading"><div><h2>Needs a stage</h2><small>Not in the default pipeline</small></div><span>{unassignedLeads.length}</span></header>
              <div className="pipeline-column-cards">{unassignedLeads.map((lead) => <article className="pipeline-card" key={lead.id}>
                <strong>{lead.full_name}</strong><span>{lead.company || "No company recorded"}</span>
                <select aria-label={`Assign ${lead.full_name} to a pipeline stage`} disabled={busy} value="" onChange={(event) => { const next = stages.find((item) => item.id === event.target.value); if (next) void move(lead, next); }}>
                  <option value="">Choose stage</option>{stages.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
                </select>
              </article>)}</div>
            </section>}
          </div>}
  </>;
}

export function Customer360View({ membership, onNotify }: { membership: Membership; onNotify: (message: string) => void }) {
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [query, setQuery] = useState("");
  useEffect(() => { void listCustomerLeads(membership.organization_id, query).then(setLeads).catch((error) => onNotify(error instanceof Error ? error.message : "Customer records could not be loaded.")); }, [membership.organization_id, query]);
  return <><div className="page-header"><div><p className="eyebrow">CUSTOMER 360</p><h1>Customer profiles</h1><p className="muted">Authorized lead records are the current customer profile source. Related activities remain tenant-scoped.</p></div></div><section className="card"><label>Customer search<input placeholder="Search by full name, email address or phone number" value={query} onChange={(event) => setQuery(event.target.value)} /></label></section><section className="card table-card"><table><thead><tr><th>FULL NAME</th><th>COMPANY</th><th>PHONE</th><th>EMAIL ADDRESS</th><th>LEAD SOURCE</th></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id}><td>{lead.full_name}</td><td>{lead.company || "—"}</td><td>{lead.phone || "—"}</td><td>{lead.email || "—"}</td><td>{lead.source}</td></tr>)}</tbody></table></section></>;
}
