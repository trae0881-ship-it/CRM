import { useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpRight, Check, Copy, ExternalLink, Globe2, RefreshCw, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { resetPublicDomainConfigCache } from "../lib/appUrls";
import "./domain-management.css";
import {
  addPlatformDomain, checkLink, downloadSeoAsset, getLinkInventory, listDomainAudit, listPlatformDomains, removePlatformDomain,
  setPrimaryPlatformDomain, updatePlatformDomain, updatePlatformRedirects, verifyPlatformDomain,
} from "../services/domains";
import type { DomainAuditEvent, PlatformDomain } from "../services/domains";

type Props = { onOpenLinks: () => void };
type Provider = PlatformDomain["provider"];

const providerLabels: Record<Provider, string> = {
  hostinger: "Hostinger",
  vercel: "Vercel",
  railway: "Railway",
  other: "Other hosting provider",
};

const statusLabels: Record<PlatformDomain["status"], string> = {
  pending_dns: "Pending DNS",
  dns_verified: "DNS Verified",
  ssl_pending: "SSL Pending",
  active: "Active",
  verification_failed: "Verification Failed",
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
  const [events, setEvents] = useState<DomainAuditEvent[]>([]);
  const [hostname, setHostname] = useState("");
  const [provider, setProvider] = useState<Provider>("other");
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editingHostname, setEditingHostname] = useState("");
  const [editingProvider, setEditingProvider] = useState<Provider>("other");
  const [redirectHttps, setRedirectHttps] = useState(true);
  const [redirectMode, setRedirectMode] = useState<PlatformDomain["redirectMode"]>("none");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [currentDomains, audit] = await Promise.all([listPlatformDomains(), listDomainAudit()]);
      setDomains(currentDomains);
      setEvents(audit);
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
      setError(messageFrom(actionError));
    } finally {
      setBusy("");
    }
  };

  const submitDomain = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await run("add", async () => {
      const created = await addPlatformDomain(hostname, provider);
      setHostname("");
      setNotice(`Added ${created.hostname}. Copy its TXT challenge below, then add the A/CNAME values from your hosting provider.`);
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
        ? `${domain.hostname}: DNS ownership and HTTPS certificate verified (HTTP ${result.checks.httpStatus ?? "response"}).`
        : `${domain.hostname}: verification is not complete. Review the current DNS/SSL status and safe error code.`);
    });
  };

  const primary = domains.find((domain) => domain.isPrimary);

  return <main className="domain-admin-page">
    <header className="domain-page-header">
      <div>
        <p className="eyebrow">SAAS PLATFORM</p>
        <h1>Custom domains</h1>
        <p>Connect hostnames, verify real DNS ownership and TLS, then select the canonical application domain.</p>
      </div>
      <div className="domain-header-actions">
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

    <section className="card domain-add-card">
      <div className="card-header">
        <div><h2>Add a domain</h2><p>Add the root hostname and the www hostname as separate records if both should work.</p></div>
      </div>
      <form className="domain-add-form" onSubmit={(event) => void submitDomain(event)}>
        <label>Hostname<input required value={hostname} onChange={(event) => setHostname(event.target.value)} placeholder="www.example.com" autoComplete="url" /></label>
        <label>Hosting provider<select value={provider} onChange={(event) => setProvider(event.target.value as Provider)}>
          {Object.entries(providerLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <button className="button primary" disabled={busy === "add" || !hostname.trim()}>{busy === "add" ? "Adding..." : "Add domain"}</button>
      </form>
      <p className="domain-provider-warning">Adometa generates only the domain-ownership TXT challenge. A, AAAA, CNAME, nameserver, and hosting targets must be copied from the provider’s own domain dashboard; this app does not invent provider values.</p>
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
      <div className="card-header"><div><h2>Domain records</h2><p>“Active” is shown only after the backend resolves the public DNS record, matches the TXT challenge, and completes a certificate-validated HTTPS request.</p></div></div>
      {loading ? <div className="domain-empty">Loading domain records...</div> : domains.length === 0 ? <div className="domain-empty"><Globe2 size={22} /><strong>Not Connected</strong><span>Add a domain to begin. No DNS or SSL status is assumed.</span></div> : <div className="domain-record-list">
        {domains.map((domain) => {
          const txtName = `_adometa-verification.${domain.hostname}`;
          return <article className="domain-record" key={domain.id}>
            <div className="domain-record-heading">
              <div><strong>{domain.hostname}</strong><span>{providerLabels[domain.provider]}{domain.isPrimary ? " · Primary" : ""}</span></div>
              <span className={`domain-status ${domain.status === "active" ? "active" : domain.status === "verification_failed" ? "failed" : "pending"}`}>{statusLabels[domain.status]}</span>
            </div>
            <div className="domain-check-grid">
              <span><small>DNS</small><strong>{domain.dnsStatus === "verified" ? "Verified" : domain.dnsStatus === "failed" ? "Failed" : "Pending"}</strong></span>
              <span><small>HTTPS / SSL</small><strong>{domain.sslStatus === "verified" ? "Verified" : domain.sslStatus === "failed" ? "Failed" : "Pending"}</strong></span>
              <span><small>Last checked</small><strong>{domain.lastVerificationAt ? new Date(domain.lastVerificationAt).toLocaleString() : "Not checked"}</strong></span>
              <span><small>Safe error code</small><strong>{domain.lastErrorCode || "—"}</strong></span>
            </div>
            {!domain.isPrimary && <div className="domain-dns-record">
              <div><small>Add this TXT record at your DNS provider</small><code>TXT&nbsp; {txtName}&nbsp; {domain.dnsChallenge}</code></div>
              <button className="button secondary" onClick={() => void copyText(`TXT ${txtName} ${domain.dnsChallenge}`).then(() => setNotice("TXT verification record copied.")).catch(() => setError("Clipboard access was denied; copy the record text manually."))}><Copy size={15} /> Copy DNS record</button>
            </div>}
            {domain.isPrimary && <div className="domain-dns-record">
              <div><small>TXT verification record</small><code>TXT&nbsp; {txtName}&nbsp; {domain.dnsChallenge}</code></div>
              <button className="button secondary" onClick={() => void copyText(`TXT ${txtName} ${domain.dnsChallenge}`).then(() => setNotice("TXT verification record copied.")).catch(() => setError("Clipboard access was denied; copy the record text manually."))}><Copy size={15} /> Copy DNS record</button>
            </div>}
            <div className="domain-record-actions">
              <button className="button primary" disabled={Boolean(busy)} onClick={() => void verify(domain)}>{busy === `verify:${domain.id}` ? "Checking DNS and HTTPS..." : "Verify DNS and SSL"}</button>
              {!domain.isPrimary && domain.status === "active" && <button className="button secondary" disabled={Boolean(busy)} onClick={() => void run(`primary:${domain.id}`, async () => {
                await setPrimaryPlatformDomain(domain.id, redirectHttps, redirectMode);
                setNotice(`${domain.hostname} is now the primary canonical domain.`);
              })}>Set primary</button>}
              <button className="text-button" onClick={() => startEdit(domain)}>Edit</button>
              <button className="text-button danger-text" disabled={Boolean(busy)} onClick={() => {
                if (window.confirm(`Remove ${domain.hostname}? This clears its primary status if selected.`)) {
                  void run(`delete:${domain.id}`, async () => { await removePlatformDomain(domain.id); setNotice("Domain removed. Hosting DNS records are not changed."); });
                }
              }}><Trash2 size={15} /> Remove</button>
            </div>
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
    </section>

    <section className="domain-instruction-grid">
      <article className="card"><h2>Hosting setup</h2><p>Add the domain in your Hostinger, Vercel, Railway, or other hosting dashboard first. Copy the exact A/CNAME/AAAA values it provides, then add the generated TXT record for ownership verification.</p><a className="button secondary" href="/domain-guides/DNS_CONFIGURATION.html">Open DNS and hosting guide <ExternalLink size={15} /></a></article>
      <article className="card"><h2>Supabase Auth setup</h2><p>The app cannot change Supabase project URL allowlists without a privileged Supabase Management API token. Configure the canonical domain manually before sending authentication emails.</p><a className="button secondary" href="/domain-guides/DOMAIN_SETUP.html#supabase-auth">Open Supabase instructions <ExternalLink size={15} /></a></article>
    </section>

    <section className="card domain-audit-card">
      <div className="card-header"><div><h2>Domain change history</h2><p>Actor IDs, operation, hostname, and safe change metadata are stored in Supabase.</p></div></div>
      {events.length ? <div className="table-scroll"><table><thead><tr><th>TIME</th><th>HOSTNAME</th><th>ACTION</th><th>ACTOR</th><th>DETAIL</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{new Date(event.created_at).toLocaleString()}</td><td>{event.hostname}</td><td>{event.action}</td><td>{event.actor_user_id}</td><td>{JSON.stringify(event.changes)}</td></tr>)}</tbody></table></div> : <p className="muted">No domain changes are recorded.</p>}
    </section>
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
