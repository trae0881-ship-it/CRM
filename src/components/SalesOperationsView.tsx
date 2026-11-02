import { useEffect, useMemo, useState } from "react";
import { Search, ShieldCheck } from "lucide-react";
import type { Membership } from "../services/workspace";
import { listCustomerLeads, listPipelineStages, moveLeadToPipelineStage, type PipelineStageRecord } from "../services/salesOperations";
import type { LeadRecord } from "../types/database";

export function SalesPipelineView({ membership, onNotify }: { membership: Membership; onNotify: (message: string) => void }) {
  const [stages, setStages] = useState<PipelineStageRecord[]>([]);
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [draggedLead, setDraggedLead] = useState<LeadRecord | null>(null);
  const load = async () => { try { const [nextStages, nextLeads] = await Promise.all([listPipelineStages(membership.organization_id), listCustomerLeads(membership.organization_id, query)]); setStages(nextStages); setLeads(nextLeads); } catch (error) { onNotify(error instanceof Error ? error.message : "Pipeline data could not be loaded."); } };
  useEffect(() => { void load(); }, [membership.organization_id, query]);
  const grouped = useMemo(() => stages.map((stage) => ({ stage, leads: leads.filter((lead) => lead.pipeline_stage_id === stage.id) })), [leads, stages]);
  if (!["company_owner", "organization_admin", "manager", "agent"].includes(membership.role)) return <section className="card pending-module"><ShieldCheck size={24} /><h2>Pipeline access is restricted.</h2></section>;
  const move = async (lead: LeadRecord, stage: PipelineStageRecord) => {
    const lostReason = stage.category === "lost" ? window.prompt("Enter the lost reason") : undefined;
    if (stage.category === "lost" && !lostReason?.trim()) return onNotify("A lost reason is required.");
    setBusy(true);
    try {
      await moveLeadToPipelineStage({ leadId: lead.id, stageId: stage.id, expectedUpdatedAt: lead.updated_at, lostReason: lostReason || undefined });
      await load();
      onNotify("Lead stage updated.");
    } catch (error) { onNotify(error instanceof Error ? error.message : "Lead stage could not be updated."); } finally { setBusy(false); }
  };
  return <><div className="page-header"><div><p className="eyebrow">SALES OPERATIONS</p><h1>Sales pipeline</h1><p className="muted">Move authorized leads between persisted pipeline stages.</p></div></div><section className="card"><label>Search customers<input aria-label="Search customers by name, email or phone number" placeholder="Search customers by full name, email address or phone number" value={query} onChange={(event) => setQuery(event.target.value)} /><Search size={16} /></label></section><div className="pipeline-board">{grouped.map(({ stage, leads: stageLeads }) => <section className="card pipeline-column" key={stage.id} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggedLead) { void move(draggedLead, stage); setDraggedLead(null); } }}><h2>{stage.name}</h2><small>{stageLeads.length} authorized leads</small>{stageLeads.map((lead) => <article className="pipeline-card" key={lead.id} draggable={!busy} onDragStart={() => setDraggedLead(lead)}><strong>{lead.full_name}</strong><span>{lead.company || "No company recorded"}</span><select disabled={busy} value={stage.id} onChange={(event) => { const next = stages.find((item) => item.id === event.target.value); if (next) void move(lead, next); }}><option value={stage.id}>{stage.name}</option>{stages.filter((item) => item.id !== stage.id).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></article>)}</section>)}</div>{!stages.length && <section className="card empty-state"><p>No pipeline stages are configured for this organization.</p></section>}</>;
}

export function Customer360View({ membership, onNotify }: { membership: Membership; onNotify: (message: string) => void }) {
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [query, setQuery] = useState("");
  useEffect(() => { void listCustomerLeads(membership.organization_id, query).then(setLeads).catch((error) => onNotify(error instanceof Error ? error.message : "Customer records could not be loaded.")); }, [membership.organization_id, query]);
  return <><div className="page-header"><div><p className="eyebrow">CUSTOMER 360</p><h1>Customer profiles</h1><p className="muted">Authorized lead records are the current customer profile source. Related activities remain tenant-scoped.</p></div></div><section className="card"><label>Customer search<input placeholder="Search by full name, email address or phone number" value={query} onChange={(event) => setQuery(event.target.value)} /></label></section><section className="card table-card"><table><thead><tr><th>FULL NAME</th><th>COMPANY</th><th>PHONE</th><th>EMAIL ADDRESS</th><th>LEAD SOURCE</th></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id}><td>{lead.full_name}</td><td>{lead.company || "—"}</td><td>{lead.phone || "—"}</td><td>{lead.email || "—"}</td><td>{lead.source}</td></tr>)}</tbody></table></section></>;
}
