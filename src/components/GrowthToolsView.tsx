import { ExternalLink, LockKeyhole, ShieldCheck, Wrench } from "lucide-react";
import type { Membership } from "../services/workspace";
import { growthTools } from "../services/growthTools";

function PageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{description}</p></div></div>;
}

function AccessDenied({ title }: { title: string }) {
  return <section className="card pending-module"><ShieldCheck size={24} /><h2>{title}</h2><p className="muted">A Super Admin membership is required.</p></section>;
}

export function GrowthToolsView({ membership }: { membership: Membership }) {
  if (membership.role !== "super_admin") return <AccessDenied title="Growth Tools administration is restricted." />;
  return <>
    <PageHeader eyebrow="PLATFORM OPERATIONS" title="Growth Tools" description="Isolated service integrations for authorized growth workflows. Services remain disabled unless deployment, license and security requirements are verified." />
    <section className="card">
      <div className="card-header"><div><h2>Integration safety</h2><p>No repository source is copied into the CRM frontend. No service is marked healthy from configuration alone.</p></div><LockKeyhole size={18} /></div>
      <p className="muted">All five services are currently not deployed. Health checks, job history and usage metrics require authenticated backend adapters after deployment. Company access remains disabled by default.</p>
    </section>
    <div className="dashboard-grid growth-tools-grid">
      {growthTools.map((tool) => <article className="card" key={tool.id}>
        <div className="card-header"><div><h2>{tool.name}</h2><p>{tool.version}</p></div><Wrench size={18} /></div>
        <dl className="detail-list">
          <div><dt>License</dt><dd>{tool.license} — {tool.licenseStatus}</dd></div>
          <div><dt>License notice</dt><dd>{tool.licenseNotice}</dd></div>
          <div><dt>Pinned commit</dt><dd><code style={{ overflowWrap: "anywhere" }}>{tool.commit}</code></dd></div>
          <div><dt>Release date</dt><dd>{tool.releaseDate || "No tagged release"}</dd></div>
          <div><dt>Deployment status</dt><dd>{tool.deploymentStatus}</dd></div>
          <div><dt>Security review</dt><dd>{tool.securityReviewStatus}</dd></div>
          <div><dt>Health</dt><dd>{tool.healthStatus}</dd></div>
          <div><dt>Last verified</dt><dd>{tool.lastVerifiedDate}</dd></div>
        </dl>
        <p className="muted">{tool.securityNotes}</p>
        <p className="muted">{tool.notes}</p>
        <div className="integration-actions">
          <a className="button secondary" href={tool.repository} target="_blank" rel="noreferrer">Open project <ExternalLink size={15} /></a>
          <a className="button secondary" href={tool.licenseUrl} target="_blank" rel="noreferrer">License <ExternalLink size={15} /></a>
        </div>
      </article>)}
    </div>
  </>;
}

export function LicenseRegisterView({ membership }: { membership: Membership }) {
  if (membership.role !== "super_admin") return <AccessDenied title="License register access is restricted." />;
  return <>
    <PageHeader eyebrow="COMPLIANCE" title="Open Source License and Security Register" description="Pinned repository snapshots and verified license metadata. Deployment, security and health states reflect checks actually completed." />
    <section className="card table-card">
      <div className="table-scroll"><table>
        <thead><tr><th>PROJECT</th><th>LICENSE / NOTICE</th><th>PINNED VERSION</th><th>RELEASE DATE</th><th>PINNED COMMIT</th><th>DEPLOYMENT</th><th>SECURITY REVIEW</th><th>HEALTH</th><th>LAST VERIFIED</th><th>LINKS</th></tr></thead>
        <tbody>{growthTools.map((tool) => <tr key={tool.id}>
          <td>{tool.name}</td>
          <td>{tool.license} — {tool.licenseStatus}<small>{tool.licenseNotice}</small></td>
          <td>{tool.version}</td>
          <td>{tool.releaseDate || "No release"}</td>
          <td><code>{tool.commit}</code></td>
          <td>{tool.deploymentStatus}</td>
          <td>{tool.securityReviewStatus}</td>
          <td>{tool.healthStatus}</td>
          <td>{tool.lastVerifiedDate}</td>
          <td><a href={tool.repository} target="_blank" rel="noreferrer">Project</a> · <a href={tool.licenseUrl} target="_blank" rel="noreferrer">License</a></td>
        </tr>)}</tbody>
      </table></div>
    </section>
  </>;
}
