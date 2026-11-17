import { useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Menu, Printer, Search, ShieldAlert, X } from "lucide-react";
import { documentation, type DocumentationArticle } from "../content/documentation";
import { canAccessDocumentation, type DocumentationCenterId } from "../lib/documentationAccess";
import type { Membership } from "../services/workspace";
import "./documentation.css";

const centerInfo: Record<DocumentationCenterId, { title: string; subtitle: string; route: string }> = {
  salesperson: { title: "Salesperson guide", subtitle: "Simple, step-by-step help for your daily customer work.", route: "/docs" },
  organization_admin: { title: "Organization admin guide", subtitle: "Manage your organization without changing platform-level access.", route: "/admin/docs" },
  saas_super_admin: { title: "Platform admin guide", subtitle: "Operate the Adometa platform with verified access and audited changes.", route: "/saas/admin/docs" },
};

const roleCenterLinks = (membership: Membership) => [
  { route: "/docs", title: "Salesperson guide", allowed: canAccessDocumentation("/docs", membership) },
  { route: "/admin/docs", title: "Organization admin guide", allowed: canAccessDocumentation("/admin/docs", membership) },
  { route: "/saas/admin/docs", title: "Platform admin guide", allowed: canAccessDocumentation("/saas/admin/docs", membership) },
].filter((link) => link.allowed);

function WorkflowIllustration({ article }: { article: DocumentationArticle }) {
  const steps = article.steps.slice(0, 3);
  const width = Math.max(steps.length * 220, 220);
  return <figure className="documentation-illustration">
    <figcaption>Illustration — workflow, not an application screenshot</figcaption>
    <svg role="img" aria-label={`Illustrated workflow for ${article.title}`} viewBox={`0 0 ${width} 108`} preserveAspectRatio="xMidYMid meet">
      {steps.map((step, index) => {
        const x = index * 220 + 8;
        const text = step.length > 34 ? `${step.slice(0, 31)}…` : step;
        return <g key={step}>
          <rect x={x} y="14" width="196" height="76" rx="12" className="doc-diagram-card" />
          <circle cx={x + 23} cy="38" r="13" className="doc-diagram-number" />
          <text x={x + 23} y="42" textAnchor="middle" className="doc-diagram-number-text">{index + 1}</text>
          <text x={x + 43} y="41" className="doc-diagram-step">STEP {index + 1}</text>
          <text x={x + 16} y="67" className="doc-diagram-copy">{text}</text>
          {index < steps.length - 1 && <path d={`M${x + 199} 52h15m-5-5 5 5-5 5`} className="doc-diagram-arrow" />}
        </g>;
      })}
    </svg>
  </figure>;
}

export function DocumentationCenter({ centerId, membership }: { centerId: DocumentationCenterId; membership: Membership }) {
  const articles = [...documentation[centerId]].sort((first, second) => first.order - second.order).filter((item) => item.roles.includes(membership.role));
  const center = centerInfo[centerId];
  const [selectedId, setSelectedId] = useState(() => {
    const requestedId = window.location.hash.slice(1);
    return articles.some((item) => item.id === requestedId) ? requestedId : articles[0]?.id ?? "";
  });
  const [search, setSearch] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? articles.filter((item) => `${item.title} ${item.category} ${item.keywords.join(" ")}`.toLowerCase().includes(query)) : articles;
  }, [articles, search]);
  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0];
  const selectedIndex = selected ? filtered.findIndex((item) => item.id === selected.id) : -1;
  const links = roleCenterLinks(membership);
  const dashboardPath = membership.role === "super_admin" ? "/saas/admin/dashboard" : "/org/dashboard";

  useEffect(() => {
    if (!mobileNavOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileNavOpen]);

  if (!articles.length) return <main className="documentation-empty"><h1>Documentation unavailable</h1><p>No articles are available for this role.</p></main>;
  if (!filtered.length) return <main className="documentation-page"><header className="documentation-topbar"><a className="documentation-brand" href={dashboardPath}><span className="documentation-brand-mark">A</span> adometa <span>Help Center</span></a><div className="documentation-center-links">{links.map((link) => <a key={link.route} className={link.route === center.route ? "current" : ""} href={link.route}>{link.title}</a>)}</div></header><section className="documentation-empty"><label className="documentation-search"><Search size={17} /><input type="search" placeholder="Search chapters..." value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search documentation" /></label><h1>No matching articles</h1><p>Try a different search word or clear the search field.</p></section></main>;
  if (!selected) return <main className="documentation-empty"><h1>Documentation unavailable</h1><p>No article is available.</p></main>;

  const changeArticle = (id: string | undefined) => {
    if (!id) return;
    setSelectedId(id);
    setMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const renderNavigation = () => <nav className="documentation-chapters" aria-label="Documentation chapters">
    {filtered.map((item, index) => <button key={item.id} className={selected.id === item.id ? "documentation-chapter active" : "documentation-chapter"} onClick={() => changeArticle(item.id)} aria-current={selected.id === item.id ? "page" : undefined}>
      <span>{String(index + 1).padStart(2, "0")}</span>{item.title}
    </button>)}
    {!filtered.length && <p className="documentation-no-results">No matching articles. Try another word.</p>}
  </nav>;

  return <main className="documentation-page">
    <header className="documentation-topbar">
      <a className="documentation-brand" href={dashboardPath}><span className="documentation-brand-mark">A</span> adometa <span>Help Center</span></a>
      <div className="documentation-center-links" aria-label="Available help centers">
        {links.map((link) => <a key={link.route} className={link.route === center.route ? "current" : ""} href={link.route}>{link.title}</a>)}
      </div>
    </header>
    <div className="documentation-layout">
      <aside id="documentation-sidebar" className={`documentation-sidebar ${mobileNavOpen ? "open" : ""}`}>
        <div className="documentation-sidebar-head"><div><p className="documentation-eyebrow">HELP CENTER</p><h1>{center.title}</h1></div><button className="documentation-icon-button" aria-label="Close chapters" onClick={() => setMobileNavOpen(false)}><X size={19} /></button></div>
        <label className="documentation-search"><Search size={17} /><input type="search" placeholder="Search chapters..." value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search documentation" /></label>
        {renderNavigation()}
      </aside>
      {mobileNavOpen && <button className="documentation-backdrop" aria-label="Close chapters" onClick={() => setMobileNavOpen(false)} />}
      <article className="documentation-article">
        <div className="documentation-article-tools"><button className="documentation-mobile-nav" aria-controls="documentation-sidebar" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(true)}><Menu size={17} /> Chapters</button><button className="documentation-print" onClick={() => window.print()}><Printer size={16} /> Print</button></div>
        <nav className="documentation-breadcrumb" aria-label="Breadcrumb"><a href={dashboardPath}>Workspace</a><span>/</span><a href={center.route}>{center.title}</a><span>/</span><span>{selected.category}</span></nav>
        <div className="documentation-article-heading"><span className="documentation-category"><BookOpen size={14} /> {selected.category}</span><h2>{selected.title}</h2><p>{selected.introduction}</p></div>
        <WorkflowIllustration article={selected} />
        <section className="documentation-steps" aria-label="Steps">
          <h3>Step by step</h3>
          <ol>{selected.steps.map((step) => <li key={step}>{step}</li>)}</ol>
        </section>
        {selected.tip && <aside className="documentation-callout tip"><strong>Helpful tip</strong><p>{selected.tip}</p></aside>}
        {selected.warning && <aside className="documentation-callout warning"><ShieldAlert size={18} /><div><strong>Important</strong><p>{selected.warning}</p></div></aside>}
        <p className="documentation-updated">Updated {new Date(`${selected.updatedAt}T00:00:00`).toLocaleDateString()}</p>
        <div className="documentation-related"><strong>Related articles</strong><div>{filtered.filter((item) => item.id !== selected.id && item.category === selected.category).slice(0, 3).map((item) => <button key={item.id} onClick={() => changeArticle(item.id)}>{item.title}</button>)}{filtered.filter((item) => item.id !== selected.id).slice(0, 2).map((item) => <button key={`related-${item.id}`} onClick={() => changeArticle(item.id)}>{item.title}</button>)}</div></div>
        <nav className="documentation-pagination" aria-label="Article navigation">
          <button disabled={selectedIndex <= 0} onClick={() => changeArticle(filtered[selectedIndex - 1]?.id)}><ChevronLeft size={17} /><span><small>PREVIOUS</small>{filtered[selectedIndex - 1]?.title ?? "First article"}</span></button>
          <button disabled={selectedIndex < 0 || selectedIndex >= filtered.length - 1} onClick={() => changeArticle(filtered[selectedIndex + 1]?.id)}><span><small>NEXT</small>{filtered[selectedIndex + 1]?.title ?? "Last article"}</span><ChevronRight size={17} /></button>
        </nav>
      </article>
    </div>
  </main>;
}
