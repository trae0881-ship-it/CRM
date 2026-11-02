import { ExternalLink, LockKeyhole, ShieldCheck, Wrench } from "lucide-react";
import type { Membership } from "../services/workspace";
import { growthTools } from "../services/growthTools";

function PageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{description}</p></div></div>;
}

export function GrowthToolsView({ membership }: { membership: Membership }) {
  if (membership.role !== "super_admin") return <section className="card pending-module"><ShieldCheck size={24} /><h2>Growth Tools administration is restricted.</h2><p className="muted">A Super Admin membership is required.</p></section>;
  return <><PageHeader eyebrow="PLATFORM OPERATIONS" title="Growth Tools" description="Isolated service integrations for authorized growth workflows. All tools remain disabled until deployed, reviewed and explicitly enabled." /><section className="card"><div className="card-header"><div><h2>Integration safety</h2><p>No repository source is copied into the CRM frontend. No service is marked healthy from configuration alone.</p></div><LockKeyhole size={18} /></div><p className="muted">Health checks, job history and usage metrics will come from authenticated backend adapters after each service is deployed. Company access remains disabled by default.</p></section><div className="dashboard-grid growth-tools-grid">{growthTools.map((tool) => <article className="card" key={tool.id}><div className="card-header"><div><h2>{tool.name}</h2><p>{tool.description}</p></div><Wrench size={18} /></div><dl className="detail-list"><div><dt>License</dt><dd>{tool.license}</dd></div><div><dt>Installation status</dt><dd>Not installed</dd></div><div><dt>Service health</dt><dd>Not configured</dd></div><div><dt>Access</dt><dd>Disabled by default</dd></div><div><dt>Deployment</dt><dd>Isolated service</dd></div></dl><p className="muted">{tool.securityNotes}</p><a className="button secondary" href={tool.repository} target="_blank" rel="noreferrer">Source repository <ExternalLink size={15} /></a></article>)}</div></>;
}

export function LicenseRegisterView({ membership }: { membership: Membership }) {
  if (membership.role !== "super_admin") return <section className="card pending-module"><ShieldCheck size={24} /><h2>License register access is restricted.</h2></section>;
  return <><PageHeader eyebrow="COMPLIANCE" title="Open Source License and Security Register" description="Repository metadata is recorded for review; no project is treated as integrated until its deployment and security review are complete." /><section className="card table-card"><table><thead><tr><th>PROJECT</th><th>LICENSE</th><th>PINNED VERSION</th><th>PINNED COMMIT</th><th>DEPLOYMENT</th><th>SECURITY REVIEW</th><th>REPOSITORY</th></tr></thead><tbody>{growthTools.map((tool) => <tr key={tool.id}><td>{tool.name}</td><td>{tool.license}</td><td>{tool.pinnedVersion || "Not pinned"}</td><td>{tool.pinnedCommit || "Not pinned"}</td><td>Not deployed</td><td>Pending isolated review</td><td><a href={tool.repository} target="_blank" rel="noreferrer">Open repository <ExternalLink size={14} /></a></td></tr>)}</tbody></table></section></>;
}
