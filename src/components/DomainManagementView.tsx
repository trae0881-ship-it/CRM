import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpRight, Check, Copy, ExternalLink, Globe2, Plus, RefreshCw, ShieldAlert, ShieldCheck, Trash2, X } from "lucide-react";
import { resetPublicDomainConfigCache } from "../lib/appUrls";
import "./domain-management.css";
import {
  addPlatformDomain, assignPlatformDomain, checkLink, downloadSeoAsset, getLinkInventory, listDomainAudit, listDomainWorkspaces, listPlatformDomains, reactivatePlatformDomain, removePlatformDomain,
  setPrimaryPlatformDomain, suspendPlatformDomain, updatePlatformDomain, updatePlatformRedirects, verifyPlatformDomain,
} from "../services/domains";
import type { DomainAuditEvent, DomainWorkspace, PlatformDomain } from "../services/domains";

type Props = { onOpenLinks: () => void };
type Provider = PlatformDomain["provider"];

const providerLabels: Record<Provider, string> = {
  hostinger: "Hostinger",
  vercel: "Vercel",
  railway: "Railway",
  other: "Other hosting provider",
};

const statusLabels: Record<PlatformDomain["displayStatus"], string> = {
  pending_dns: "Pending DNS",
  dns_verified: "DNS Verified",
  ssl_pending: "SSL Pending",
  active: "Verified / Active",
  verification_failed: "Verification Failed",
  suspended: "Suspended",
  assignment_pending: "Workspace Assignment Pending",
};

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "The domain operation could not be completed.";
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

function downloadText(name: string, value: string, contentType: string) {
  const url = URL.createObjectURL(new Blob([value], { type: contentType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function DomainManagementView({ onOpenLinks }: Props) {
  const [domains, setDomains] = useState<PlatformDomain[]>([]);
  const [workspaces, setWorkspaces] = useState<DomainWorkspace[]>([]);
  const [events, setEvents] = useState<DomainAuditEvent[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ hostname: "", provider: "other" as Provider, domainType: "custom_domain" as PlatformDomain["domainType"], description: "", organizationId: "" });
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "verified">("all");
  const [page, setPage] = useState(0);
  const [detailsId, setDetailsId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editingHostname, setEditingHostname] = useState("");
  const [editingProvider, setEditingProvider] = useState<Provider>("other");
  const [redirectHttps, setRedirectHttps] = useState(true);
  const [redirectMode, setRedirectMode] = useState<PlatformDomain["redirectMode"]>("none");
  const pageSize = 10;

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [currentDomains, audit, currentWorkspaces] = await Promise.all([listPlatformDomains(), listDomainAudit(), listDomainWorkspaces()]);
      setDomains(currentDomains);
      setEvents(audit);
      setWorkspaces(currentWorkspaces);
      const primary = currentDomains.find((domain) => domain.isPrimary);
      if (primary) {
        setRedirectHttps(primary.redirectHttps);
        setRedirectMode(primary.redirectMode);
      }
    } catch (loadError) {
      setError(messageFrom(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await action();
      resetPublicDomainConfigCache();
      await load();
    } catch (actionError) {
      const message = messageFrom(actionError);
      await load();
      setError(message);
    } finally {
      setBusy("");
    }
  };

  const submitDomain = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await run("add", async () => {
      const created = await addPlatformDomain({
        ...form,
        organizationId: form.organizationId || null,
      });
      setForm({ hostname: "", provider: "other", domainType: "custom_domain", description: "", organizationId: "" });
      setShowAdd(false);
      setNotice(form.organizationId
        ? `Added ${created.hostname}. Workspace assignment becomes effective only after DNS ownership and HTTPS checks pass.`
        : `Added ${created.hostname}. Add its TXT record, then verify DNS ownership and HTTPS.`);
    });
  };

  const startEdit = (domain: PlatformDomain) => {
    setEditingId(domain.id);
    setEditingHostname(domain.hostname);
    setEditingProvider(domain.provider);
  };

  const saveEdit = async (id: string) => {
    await run(`edit:${id}`, async () => {
      const updated = await updatePlatformDomain(id, { hostname: editingHostname, provider: editingProvider });
      setEditingId("");
      setNotice(updated.dnsChallenge !== domains.find((domain) => domain.id === id)?.dnsChallenge
        ? "Hostname changed. A new DNS challenge was issued; verify it again."
        : "Domain details saved.");
    });
  };

  const verify = async (domain: PlatformDomain) => {
    await run(`verify:${domain.id}`, async () => {
      const result = await verifyPlatformDomain(domain.id);
      setNotice(result.checks.dns && result.checks.https
        ? `${domain.hostname}: DNS ownership and HTTPS certificate verified.`
        : result.checks.dns
          ? `${domain.hostname}: DNS ownership verified; HTTPS is pending. The domain is not active.`
          : `${domain.hostname}: DNS ownership is not verified. The domain is not active.`);
    });
  };

  const primary = domains.find((domain) => domain.isPrimary && !domain.isSuspended);
  const filteredDomains = useMemo(() => domains.filter((domain) => {
    const workspaceName = workspaces.find((workspace) => workspace.id === domain.organizationId)?.name ?? "";
    const text = `${domain.hostname} ${domain.description} ${domain.provider} ${workspaceName}`.toLowerCase();
    const verified = domain.displayStatus === "active" && !domain.isSuspended;
    return text.includes(search.toLowerCase())
      && (statusFilter === "all" || (statusFilter === "verified" ? verified : !verified));
  }), [domains, search, statusFilter, workspaces]);
  const shownDomains = filteredDomains.slice(page * pageSize, (page + 1) * pageSize);
  const verifiedCount = domains.filter((domain) => domain.displayStatus === "active" && !domain.isSuspended).length;
  const pendingCount = domains.length - verifiedCount;

  return <main className="domain-admin-page">
    <header className="domain-page-header">
      <div>
        <p className="eyebrow">SAAS PLATFORM</p>
        <h1>Domains / Custom Domains</h1>
        <p>Register hostnames, verify DNS ownership and HTTPS, then optionally assign verified domains to approved workspaces.</p>
      </div>
      <div className="domain-header-actions">
        <button className="button primary" onClick={() => setShowAdd(true)}><Plus size={16} /> Add Domain</button>
        <button className="button secondary" onClick={onOpenLinks}><Globe2 size={16} /> Link inventory</button>
        <button className="button secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> Refresh</button>
      </div>
    </header>

    {error && <div className="domain-message error" role="alert"><ShieldAlert size={18} />{error}</div>}
    {notice && <div className="domain-message success" role="status"><Check size={18} />{notice}</div>}

    <section className="card domain-state-card">
      <div className="domain-state-icon">{primary?.status === "active" ? <ShieldCheck size={22} /> : <ShieldAlert size={22} />}</div>
      <div>
        <strong>{primary?.status === "active" ? `Canonical domain: ${primary.hostname}` : "No active canonical domain"}</strong>
        <p>{primary?.status === "active"
          ? "Public application URLs use this verified HTTPS hostname. Supabase Auth and hosting still require the manual settings shown below."
          : "The app continues to use the current browser origin until a domain passes DNS ownership and HTTPS checks."}</p>
      </div>
      <span className={`domain-status ${primary?.status === "active" ? "active" : "pending"}`}>
        {primary?.status === "active" ? "Active" : "Not Connected"}
      </span>
    </section>

    {primary && <section className="card domain-redirect-card">
      <div className="card-header"><div><h2>Canonical redirects</h2><p>Application links use the primary hostname. Browser redirects run only on a hostname that has passed DNS and HTTPS checks.</p></div></div>
      <div className="domain-redirect-controls">
        <label className="domain-checkbox"><input type="checkbox" checked={redirectHttps} onChange={(event) => setRedirectHttps(event.target.checked)} />Use HTTPS for application redirects</label>
        <label>www behavior<select value={redirectMode} onChange={(event) => setRedirectMode(event.target.value as PlatformDomain["redirectMode"])}>
          <option value="none">Keep verified aliases on their own host</option>
          <option value="www_to_root">Redirect www to the primary root hostname</option>
          <option value="root_to_www">Redirect root to the primary www hostname</option>
        </select></label>
        <button className="button secondary" disabled={Boolean(busy)} onClick={() => void run("redirects", async () => {
          await updatePlatformRedirects(redirectHttps, redirectMode);
          setNotice("Redirect preference saved. Server-level HTTP redirects still need to be enabled at the hosting provider.");
        })}>Save redirect preferences</button>
      </div>
      <p className="domain-provider-warning">A static app cannot redirect a request before its JavaScript loads. Enable HTTPS redirects in the hosting dashboard too; use the provider instructions for this deployment.</p>
    </section>}

    <section className="card table-card domain-records-card">
      <div className="card-header"><div><h2>Domain registry</h2><p>Only DNS- and HTTPS-verified, non-suspended domains are active. Verification is performed by the server.</p></div></div>
      <div className="domain-list-toolbar">
        <input aria-label="Search domains" placeholder="Search hostname, workspace or description" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} />
        <select aria-label="Filter domains" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as typeof statusFilter); setPage(0); }}>
          <option value="all">All domains ({domains.length})</option><option value="pending">Pending domains ({pendingCount})</option><option value="verified">Verified domains ({verifiedCount})</option>
        </select>
      </div>
      {loading ? <div className="domain-empty">Loading domain records...</div> : domains.length === 0 ? <div className="domain-empty"><Globe2 size={22} /><strong>No domains yet</strong><span>Use Add Domain to start the DNS and HTTPS verification workflow.</span></div> : shownDomains.length === 0 ? <div className="domain-empty">No domains match the current search or filter.</div> : <div className="domain-record-list">
        {shownDomains.map((domain) => {
          const txtHost = "_adometa-verification";
          const txtName = `${txtHost}.${domain.hostname}`;
          const assignedWorkspace = workspaces.find((workspace) => workspace.id === domain.organizationId);
          return <article className="domain-record" key={domain.id}>
            <div className="domain-record-heading">
              <div><strong>{domain.hostname}</strong><span>{domain.domainType === "subdomain" ? "Subdomain" : "Custom domain"} · {providerLabels[domain.provider]}{domain.isPrimary ? " · Platform canonical" : ""}</span></div>
              <span className={`domain-status ${domain.displayStatus === "active" ? "active" : domain.displayStatus === "verification_failed" || domain.isSuspended ? "failed" : "pending"}`}>{statusLabels[domain.displayStatus]}</span>
            </div>
            {domain.description && <p className="domain-description">{domain.description}</p>}
            <div className="domain-assignment-summary"><small>Company / workspace</small><strong>{assignedWorkspace ? `${assignedWorkspace.name}${assignedWorkspace.workspace_name ? ` · ${assignedWorkspace.workspace_name}` : ""}` : domain.requestedOrganizationId ? "Assignment requested; pending verification" : "Not assigned"}</strong></div>
            <div className="domain-check-grid">
              <div><small>DNS ownership</small><strong>{domain.dnsStatus === "verified" ? "Verified" : domain.dnsStatus === "failed" ? "Failed" : "Pending"}</strong></div>
              <div><small>HTTPS certificate</small><strong>{domain.sslStatus === "verified" ? "Valid" : domain.sslStatus === "failed" ? "Failed" : domain.dnsStatus === "verified" ? "HTTPS Pending" : "Pending"}</strong></div>
              <div><small>Last checked</small><strong>{domain.lastVerificationAt ? new Date(domain.lastVerificationAt).toLocaleString() : "Not checked"}</strong></div>
              <div><small>Safe error code</small><strong>{domain.lastErrorCode || "—"}</strong></div>
            </div>
            <div className="domain-dns-record">
              <div className="domain-dns-values"><span>Type <code>TXT</code></span><span>Host <code>{txtHost}</code></span><span>Value <code>{domain.dnsChallenge}</code></span><small>Fully qualified record name: {txtName}</small></div>
              <div className="domain-header-actions">
                <button className="button secondary" onClick={() => void copyText(txtHost).then(() => setNotice("TXT host copied.")).catch(() => setError("Clipboard access was denied; copy the host manually."))}><Copy size={15} /> Copy Host</button>
                <button className="button secondary" onClick={() => void copyText(domain.dnsChallenge).then(() => setNotice("TXT value copied.")).catch(() => setError("Clipboard access was denied; copy the value manually."))}><Copy size={15} /> Copy TXT Value</button>
              </div>
            </div>
            <div className="domain-record-actions">
              <button className="button primary" disabled={Boolean(busy) || domain.isSuspended} onClick={() => void verify(domain)}>{busy === `verify:${domain.id}` ? "Checking DNS and HTTPS..." : "Verify Domain"}</button>
              {!domain.organizationId && !domain.isSuspended && !domain.isPrimary && domain.displayStatus === "active" && <button className="button secondary" disabled={Boolean(busy)} onClick={() => void run(`primary:${domain.id}`, async () => {
                await setPrimaryPlatformDomain(domain.id, redirectHttps, redirectMode);
                setNotice(`${domain.hostname} is now the primary canonical domain.`);
              })}>Set platform canonical</button>}
              <button className="text-button" onClick={() => setDetailsId(detailsId === domain.id ? "" : domain.id)}>{detailsId === domain.id ? "Hide details" : "View details / Edit assignment"}</button>
              <button className="text-button" onClick={() => startEdit(domain)}>Edit domain</button>
              {!domain.isSuspended
                ? <button className="text-button danger-text" disabled={Boolean(busy)} onClick={() => {
                    if (window.confirm(`Suspend ${domain.hostname}? It will no longer be eligible for canonical or workspace links.`)) {
                      void run(`suspend:${domain.id}`, async () => { await suspendPlatformDomain(domain.id); setNotice(`${domain.hostname} suspended.`); });
                    }
                  }}>Suspend Domain</button>
                : <button className="text-button" disabled={Boolean(busy)} onClick={() => void run(`reactivate:${domain.id}`, async () => {
                    const result = await reactivatePlatformDomain(domain.id);
                    setNotice(result.checks?.dns && result.checks.https ? `${domain.hostname} revalidated and reactivated.` : `${domain.hostname} remains suspended.`);
                  })}>Reactivate</button>}
              <button className="text-button danger-text" disabled={Boolean(busy)} onClick={() => {
                if (window.confirm(`Remove ${domain.hostname}? Assigned and platform-canonical domains must first be unassigned.`)) {
                  void run(`delete:${domain.id}`, async () => { await removePlatformDomain(domain.id); setNotice("Domain removed. Hosting DNS records are not changed."); });
                }
              }}><Trash2 size={15} /> Remove</button>
            </div>
            {detailsId === domain.id && domain.status === "active" && !domain.isSuspended && <div className="domain-assignment-controls">
              <label>Assign to approved company / workspace<select value={domain.organizationId || ""} onChange={async (event) => {
                const organizationId = event.target.value || null;
                await run(`assign:${domain.id}`, async () => {
                  await assignPlatformDomain(domain.id, organizationId);
                  setNotice(organizationId ? "Verified domain assigned to the selected workspace." : "Workspace assignment removed.");
                });
              }} disabled={Boolean(busy)}>
                <option value="">Not assigned</option>{workspaces.map((workspace) => <option value={workspace.id} key={workspace.id}>{workspace.name}{workspace.workspace_name ? ` · ${workspace.workspace_name}` : ""}</option>)}
              </select></label>
            </div>}
            {editingId === domain.id && <form className="domain-edit-form" onSubmit={(event) => { event.preventDefault(); void saveEdit(domain.id); }}>
              <label>Hostname<input required value={editingHostname} onChange={(event) => setEditingHostname(event.target.value)} /></label>
              <label>Hosting provider<select value={editingProvider} onChange={(event) => setEditingProvider(event.target.value as Provider)}>
                {Object.entries(providerLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select></label>
              <button className="button secondary" disabled={Boolean(busy)} type="submit">Save changes</button>
              <button className="text-button" type="button" onClick={() => setEditingId("")}>Cancel</button>
            </form>}
          </article>;
        })}
      </div>}
      {!loading && filteredDomains.length > pageSize && <div className="table-pagination"><span>{page * pageSize + 1}-{Math.min((page + 1) * pageSize, filteredDomains.length)} of {filteredDomains.length} domains</span><div><button className="button secondary" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</button><button className="button secondary" disabled={(page + 1) * pageSize >= filteredDomains.length} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>}
    </section>

    <section className="domain-instruction-grid">
      <article className="card"><h2>Hosting setup</h2><p>Add the domain in your Hostinger, Vercel, Railway, or other hosting dashboard first. Copy the exact A/CNAME/AAAA values it provides, then add the generated TXT record for ownership verification.</p><a className="button secondary" href="/domain-guides/DNS_CONFIGURATION.html">Open DNS and hosting guide <ExternalLink size={15} /></a></article>
      <article className="card"><h2>Supabase Auth setup</h2><p>The app cannot change Supabase project URL allowlists without a privileged Supabase Management API token. Configure the canonical domain manually before sending authentication emails.</p><a className="button secondary" href="/domain-guides/DOMAIN_SETUP.html#supabase-auth">Open Supabase instructions <ExternalLink size={15} /></a></article>
    </section>

    <section className="card domain-audit-card">
      <div className="card-header"><div><h2>Domain change history</h2><p>Actor IDs, operation, hostname, and safe change metadata are stored in Supabase.</p></div></div>
      {events.length ? <div className="table-scroll"><table><thead><tr><th>TIME</th><th>HOSTNAME</th><th>ACTION</th><th>ACTOR</th><th>DETAIL</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{new Date(event.created_at).toLocaleString()}</td><td>{event.hostname}</td><td>{event.action}</td><td>{event.actor_user_id}</td><td>{JSON.stringify(event.changes)}</td></tr>)}</tbody></table></div> : <p className="muted">No domain changes are recorded.</p>}
    </section>
    {showAdd && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowAdd(false)}>
      <form className="modal domain-add-modal" role="dialog" aria-modal="true" aria-labelledby="add-domain-title" onSubmit={(event) => void submitDomain(event)}>
        <div className="modal-head"><div><p className="eyebrow">CUSTOM DOMAIN</p><h2 id="add-domain-title">Add Domain</h2></div><button type="button" className="icon-button" aria-label="Close dialog" onClick={() => setShowAdd(false)}><X size={18} /></button></div>
        <label>Domain name<input required value={form.hostname} onChange={(event) => setForm({ ...form, hostname: event.target.value })} placeholder="crm.example.com" autoComplete="off" /></label>
        <div className="contact-field-grid">
          <label>Domain type<select value={form.domainType} onChange={(event) => setForm({ ...form, domainType: event.target.value as PlatformDomain["domainType"] })}><option value="custom_domain">Custom Domain</option><option value="subdomain">Subdomain</option></select></label>
          <label>Hosting provider<select value={form.provider} onChange={(event) => setForm({ ...form, provider: event.target.value as Provider })}>{Object.entries(providerLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <label>Assign company / workspace (optional)<select value={form.organizationId} onChange={(event) => setForm({ ...form, organizationId: event.target.value })}>
          <option value="">Choose after verification</option>{workspaces.map((workspace) => <option value={workspace.id} key={workspace.id}>{workspace.name}{workspace.workspace_name ? ` · ${workspace.workspace_name}` : ""}</option>)}
        </select></label>
        <p className="muted">If selected, assignment is requested now but becomes effective only after DNS ownership and HTTPS verification both pass.</p>
        <label>Description (optional)<textarea maxLength={500} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
        <p className="domain-provider-warning">The domain remains pending and inactive until server-side TXT, expected public DNS destination and HTTPS/TLS checks pass. Configure PLATFORM_DOMAIN_EXPECTED_TARGETS from the hosting provider; Adometa does not invent A/CNAME targets.</p>
        <div className="modal-actions"><button type="button" className="button secondary" onClick={() => setShowAdd(false)}>Cancel</button><button className="button primary" disabled={busy === "add" || !form.hostname.trim()}><Plus size={16} />{busy === "add" ? "Adding..." : "Add Domain"}</button></div>
      </form>
    </div>}
  </main>;
}

export function DomainLinksView() {
  const [links, setLinks] = useState<Array<{ name: string; route: string; group: string; type: string; visibility: string; status: string; description: string; url: string; openable: boolean }>>([]);
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("All groups");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState("");
  const [checks, setChecks] = useState<Record<string, string>>({});

  useEffect(() => {
    void getLinkInventory().then(setLinks).catch((loadError: unknown) => setError(messageFrom(loadError)));
  }, []);

  const groups = ["All groups", ...new Set(links.map((link) => link.group))];
  const filtered = links.filter((link) => {
    const text = `${link.name} ${link.route} ${link.url} ${link.group} ${link.visibility}`.toLowerCase();
    return (group === "All groups" || link.group === group) && text.includes(search.toLowerCase());
  });
  const publicLinks = links.filter((link) => link.visibility === "Everyone" && !link.url.includes("Service URL not configured"));
  const setClipboard = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setMessage("Link copied.");
    setError("");
  };
  const saveCsv = (items: typeof links, name: string) => {
    const escape = (value: string) => {
      const neutralized = /^[=+\-@]/.test(value) ? `'${value}` : value;
      return `"${neutralized.replace(/"/g, '""')}"`;
    };
    const content = [
      ["Page Name", "Route", "Full URL", "Page Type", "Visibility", "Status", "Group", "Description"].map(escape).join(","),
      ...items.map((link) => [link.name, link.route, link.url, link.type, link.visibility, link.status, link.group, link.description].map(escape).join(",")),
    ].join("\r\n");
    downloadText(name, content, "text/csv;charset=utf-8");
  };

  return <main className="domain-admin-page">
    <header className="domain-page-header">
      <div><p className="eyebrow">SAAS PLATFORM</p><h1>Application links</h1><p>Routes come from the inspected application router. Dashboard tabs are shown as the shared dashboard URL, not invented paths.</p></div>
      <a className="button secondary" href="/saas/admin/domains"><Globe2 size={16} /> Domain settings</a>
    </header>
    {error && <div className="domain-message error" role="alert"><ShieldAlert size={18} />{error}</div>}
    {message && <div className="domain-message success" role="status"><Check size={18} />{message}</div>}
    <section className="card link-inventory-tools">
      <label>Search links<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search pages, paths, roles, or URLs" /></label>
      <label>Group<select value={group} onChange={(event) => setGroup(event.target.value)}>{groups.map((item) => <option key={item}>{item}</option>)}</select></label>
      <div className="link-inventory-buttons">
        <button className="button secondary" disabled={!publicLinks.length} onClick={() => void setClipboard(publicLinks.map((link) => `${link.name}\t${link.url}`).join("\n")).catch(() => setError("Clipboard access was denied."))}><Copy size={15} /> Copy all public links</button>
        <button className="button secondary" disabled={!links.length} onClick={() => saveCsv(links, "adometa-link-inventory.csv")}><ArrowDownToLine size={15} /> Export CSV</button>
        <button className="button secondary" disabled={!links.length} onClick={() => downloadText("adometa-link-inventory.json", JSON.stringify(links, null, 2), "application/json")}><ArrowDownToLine size={15} /> Download inventory</button>
        <button className="button secondary" onClick={() => void Promise.all([
          downloadSeoAsset("/seo/sitemap.xml").then((blob) => downloadBlob("sitemap.xml", blob)),
          downloadSeoAsset("/seo/robots.txt").then((blob) => downloadBlob("robots.txt", blob)),
        ]).then(() => setMessage("Downloaded the current public sitemap and robots policy.")).catch((downloadError: unknown) => setError(messageFrom(downloadError)))}><ArrowDownToLine size={15} /> Download SEO files</button>
      </div>
      <p className="domain-provider-warning">API and callback addresses are visible only in this Super Admin-only screen. Protected endpoints require server-verified authorization; listed URLs are not proof of live availability.</p>
    </section>
    <section className="card table-card link-inventory-table">
      <div className="card-header"><div><h2>Routes and endpoints</h2><p>{filtered.length} of {links.length} entries · status is not a live check unless explicitly checked below.</p></div></div>
      {links.length === 0 ? <div className="domain-empty">Loading actual route registry...</div> : <div className="table-scroll"><table><thead><tr><th>PAGE NAME</th><th>ROUTE</th><th>FULL URL</th><th>PAGE TYPE</th><th>VISIBILITY</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>{filtered.map((link) => <tr key={`${link.group}:${link.route}:${link.name}`}>
        <td><strong>{link.name}</strong><small>{link.group}</small></td>
        <td><code>{link.route}</code></td>
        <td className="link-full-url">{link.url}</td>
        <td>{link.type}</td>
        <td>{link.visibility}</td>
        <td>{checks[link.route] || link.status}</td>
        <td><div className="domain-actions">
          <button className="icon-button" disabled={!link.url || link.url.includes("Service URL not configured")} aria-label={`Copy ${link.name}`} onClick={() => void setClipboard(link.url).catch(() => setError("Clipboard access was denied."))}><Copy size={15} /></button>
          {link.openable && <button className="icon-button" aria-label={`Open ${link.name}`} onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")}><ArrowUpRight size={15} /></button>}
          {link.openable && <button className="text-button" disabled={checking === link.route} onClick={() => {
            setChecking(link.route);
          void checkLink(link.url)
              .then((result) => setChecks((current) => ({ ...current, [link.route]: `HTTP ${result.status} · checked ${new Date().toLocaleString()}` })))
              .catch(() => setChecks((current) => ({ ...current, [link.route]: "Check failed · not verified" })))
              .finally(() => setChecking(""));
          }}>{checking === link.route ? "Checking..." : "Check"}</button>}
        </div></td>
      </tr>)}</tbody></table></div>}
    </section>
  </main>;
}

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
