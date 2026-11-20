import { useEffect, useState } from "react";
import { Bot, Check, Play, Plus, ShieldCheck, Sparkles } from "lucide-react";
import type { Membership } from "../services/workspace";
import { listAssignmentRules, listAutomationWorkflows, saveAssignmentRule, saveAutomationWorkflow, type AutomationRule, type AutomationWorkflow } from "../services/automation";
import { calculateLeadScore, canExecuteWorkflow, chooseAssignment } from "../lib/automation";

type DemoResult = { title: string; steps: string[]; outcome: string };

function PageHeader({ title, description }: { title: string; description: string }) {
  return <div className="page-header"><div><p className="eyebrow">ADVANCED AUTOMATION</p><h1>{title}</h1><p className="muted">{description}</p></div></div>;
}

export function AutomationView({ membership, onNotify }: { membership: Membership; onNotify: (message: string) => void }) {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [workflows, setWorkflows] = useState<AutomationWorkflow[]>([]);
  const [ruleName, setRuleName] = useState("");
  const [workflowName, setWorkflowName] = useState("");
  const [busy, setBusy] = useState(false);
  const [demoResult, setDemoResult] = useState<DemoResult | null>(null);
  const load = async () => { try { const [nextRules, nextWorkflows] = await Promise.all([listAssignmentRules(membership.organization_id), listAutomationWorkflows(membership.organization_id)]); setRules(nextRules); setWorkflows(nextWorkflows); } catch (error) { onNotify(error instanceof Error ? error.message : "Automation data could not be loaded."); } };
  useEffect(() => { if (["company_owner", "organization_admin", "manager"].includes(membership.role)) void load(); }, [membership.organization_id, membership.role]);
  if (!["company_owner", "organization_admin", "manager"].includes(membership.role)) return <section className="card pending-module"><ShieldCheck size={24} /><h2>Automation administration is restricted.</h2><p className="muted">An authorized organization role is required.</p></section>;
  const canConfigure = membership.role === "company_owner" || membership.role === "organization_admin";
  const runDemo = (demo: "assignment" | "scoring" | "workflow") => {
    if (demo === "assignment") {
      const candidates = [
        { userId: "Asha", active: true, currentLoad: 7, lastAssignedAt: "2026-11-18T10:00:00Z", teamIds: ["sales"] },
        { userId: "Ravi", active: true, currentLoad: 3, lastAssignedAt: "2026-11-19T10:00:00Z", teamIds: ["sales"] },
        { userId: "Meera", active: true, currentLoad: 5, lastAssignedAt: "2026-11-17T10:00:00Z", teamIds: ["sales"] },
      ];
      const selected = chooseAssignment(candidates, { mode: "workload" });
      setDemoResult({ title: "Workload-based assignment", steps: ["New demo lead: Priya Sharma", "Eligible team: 3 active salespeople", "Open lead counts: Asha 7 · Ravi 3 · Meera 5"], outcome: `Assigned to ${selected ?? "no eligible salesperson"} (lowest current workload).` });
      return;
    }
    if (demo === "scoring") {
      const result = calculateLeadScore({ sourceWeight: 20, budgetWeight: 10, interestWeight: 15, responseWeight: 10, callWeight: 10, followUpWeight: 10, visitWeight: 10, engagementWeight: 10, recencyWeight: 5 }, { source: 1, budget: 0.8, interest: 1, response: 0.7, call: 0.8, followUp: 1, visit: 0.5, engagement: 0.8, recency: 1 });
      setDemoResult({ title: "Lead scoring", steps: result.breakdown.slice(0, 4).map((item) => `${item.explanation}: +${item.points} points`), outcome: `Demo score ${result.score}/100 · ${result.category.toUpperCase()} priority.` });
      return;
    }
    const eventKey = "demo:lead-created:LEAD-1001";
    const firstRunAllowed = canExecuteWorkflow(null, eventKey, new Set());
    const duplicateRunAllowed = canExecuteWorkflow(new Date().toISOString(), eventKey, new Set([eventKey]));
    setDemoResult({ title: "New-lead workflow", steps: ["Trigger: lead_created", `First event accepted: ${firstRunAllowed ? "yes" : "no"}`, `Duplicate event accepted: ${duplicateRunAllowed ? "yes" : "no"}`], outcome: "Duplicate protection prevents the same event from running twice." });
  };
  const createRule = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); try { await saveAssignmentRule({ organization_id: membership.organization_id, name: ruleName.trim(), mode: "round_robin", priority: 100, conditions: {} }); setRuleName(""); await load(); onNotify("Assignment rule created."); } catch (error) { onNotify(error instanceof Error ? error.message : "Assignment rule could not be created."); } finally { setBusy(false); } };
  const createWorkflow = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); try { await saveAutomationWorkflow({ organization_id: membership.organization_id, name: workflowName.trim(), trigger_type: "lead_created", conditions: {}, actions: [] }); setWorkflowName(""); await load(); onNotify("Workflow saved as inactive."); } catch (error) { onNotify(error instanceof Error ? error.message : "Workflow could not be created."); } finally { setBusy(false); } };
  return <>
    <PageHeader title="Automation control center" description="Preview assignment, scoring and workflow behavior with safe sample data before configuring production rules." />
    <section className="card automation-demo" aria-labelledby="automation-demo-heading">
      <div className="card-header"><div><p className="eyebrow">INTERACTIVE PREVIEW</p><h2 id="automation-demo-heading"><Sparkles size={18} /> Try an automation demo</h2><p>Demo scenarios run locally with sample data only; they do not update leads or trigger live workflows.</p></div></div>
      <div className="automation-demo-grid">
        <article><span className="automation-demo-icon"><Bot size={18} /></span><h3>Lead assignment</h3><p>Route a sample lead to the salesperson with the lightest workload.</p><button className="button secondary" onClick={() => runDemo("assignment")}><Play size={15} /> Run demo</button></article>
        <article><span className="automation-demo-icon"><Sparkles size={18} /></span><h3>Lead scoring</h3><p>Calculate a sample priority score from interest, response and engagement.</p><button className="button secondary" onClick={() => runDemo("scoring")}><Play size={15} /> Run demo</button></article>
        <article><span className="automation-demo-icon"><Check size={18} /></span><h3>Workflow replay guard</h3><p>See how duplicate events are prevented from executing twice.</p><button className="button secondary" onClick={() => runDemo("workflow")}><Play size={15} /> Run demo</button></article>
      </div>
      {demoResult && <div className="automation-demo-result" role="status"><div><strong>{demoResult.title}</strong><button className="text-button" onClick={() => setDemoResult(null)}>Clear</button></div><ol>{demoResult.steps.map((step) => <li key={step}>{step}</li>)}</ol><p>{demoResult.outcome}</p></div>}
    </section>
    <div className="dashboard-grid">
      <section className="card"><div className="card-header"><div><h2><Bot size={18} /> Lead assignment rules</h2><p>Saved rules are organization-scoped. Demo previews above do not change real assignments.</p></div></div>{canConfigure && <form className="invite-form" onSubmit={createRule}><label>Assignment rule name<input required minLength={3} placeholder="For example, Website leads rotation" value={ruleName} onChange={(event) => setRuleName(event.target.value)} /></label><button className="button primary" disabled={busy}><Plus size={16} /> Create assignment rule</button></form>}{rules.map((rule) => <div className="list-row" key={rule.id}><span>{rule.name}</span><small>{rule.mode} · Priority {rule.priority} · {rule.is_active ? "Active" : "Inactive"}</small></div>)}{!rules.length && <p className="muted">No assignment rules configured.</p>}</section>
      <section className="card"><div className="card-header"><div><h2><Bot size={18} /> Workflow drafts</h2><p>Saved workflows remain inactive; live event execution is not enabled in this workspace.</p></div></div>{canConfigure && <form className="invite-form" onSubmit={createWorkflow}><label>Workflow name<input required minLength={3} placeholder="For example, Notify owner about overdue follow-up" value={workflowName} onChange={(event) => setWorkflowName(event.target.value)} /></label><button className="button primary" disabled={busy}><Check size={16} /> Save inactive workflow</button></form>}{workflows.map((workflow) => <div className="list-row" key={workflow.id}><span>{workflow.name}</span><small>{workflow.trigger_type} · {workflow.is_active ? "Active" : "Inactive"}</small></div>)}{!workflows.length && <p className="muted">No workflows configured.</p>}</section>
    </div>
  </>;
}
