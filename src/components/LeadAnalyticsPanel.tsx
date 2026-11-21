import type { PlatformLeadAnalytics } from "../services/platform";
import type { ReportRow } from "../lib/reports";

type Props = {
  rows?: ReportRow[];
  platform?: PlatformLeadAnalytics;
  title?: string;
};

const statusOrder = ["new", "contacted", "qualified", "site_visit", "site visit", "won", "lost", "follow_up", "nurture"];

export function LeadAnalyticsPanel({ rows = [], platform, title = "Lead analytics" }: Props) {
  const statusCounts = platform?.statusCounts ?? Object.fromEntries([
    ...statusOrder.map((status) => [status, 0] as [string, number]),
    ...rows.map((row) => [String(row.status || "new").toLowerCase().replace(/[\s-]+/g, "_"), 0] as [string, number]),
  ]);
  if (!platform) {
    for (const row of rows) {
      const status = String(row.status || "new").toLowerCase().replace(/[\s-]+/g, "_");
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }
  }

  const sourceCounts = platform?.sourceCounts ?? rows.reduce<Record<string, number>>((counts, row) => {
    const source = String(row.source || "Unknown");
    counts[source] = (counts[source] || 0) + 1;
    return counts;
  }, {});
  const total = platform?.totalLeads ?? rows.length;
  const won = platform?.wonLeads ?? statusCounts.won ?? 0;
  const open = platform?.openLeads ?? rows.filter((row) => !["won", "lost"].includes(String(row.status).toLowerCase())).length;
  const siteVisits = platform?.siteVisits ?? rows.filter((row) => /site.?visit/i.test(String(row.status))).length;
  const duplicateCount = platform?.duplicateLeads ?? 0;
  const sourceEntries = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const sourceMax = Math.max(1, ...sourceEntries.map(([, count]) => count));
  const funnelStatuses = [
    ["Assigned", statusCounts.new + statusCounts.contacted + statusCounts.qualified + statusCounts.follow_up + won + (statusCounts.lost || 0) + (statusCounts.nurture || 0)],
    ["Contacted", statusCounts.contacted + statusCounts.qualified + won + (statusCounts.lost || 0)],
    ["Qualified", statusCounts.qualified + won],
    ["Site Visit", statusCounts.site_visit || statusCounts["site visit"] || siteVisits],
    ["Won", won],
    ["Lost", statusCounts.lost || 0],
  ] as const;
  const funnelMax = Math.max(1, ...funnelStatuses.map(([, count]) => count));

  const daily = platform?.daily ?? (() => {
    const now = new Date();
    return Array.from({ length: 30 }, (_, index) => {
      const date = new Date(now);
      date.setDate(now.getDate() - (29 - index));
      const key = date.toISOString().slice(0, 10);
      const dayRows = rows.filter((row) => String(row.created_at || "").slice(0, 10) === key);
      return { activity_date: key, new_leads: dayRows.length, cumulative_leads: rows.filter((row) => String(row.created_at || "").slice(0, 10) <= key).length };
    });
  })();
  const responseMax = Math.max(1, ...daily.map((point) => point.new_leads));
  const speedPoints = daily.slice(-14).map((point, index, list) => {
    const x = list.length <= 1 ? 40 : 40 + (index / (list.length - 1)) * 420;
    const y = 190 - (point.new_leads / responseMax) * 150;
    return { x, y, point };
  });
  const speedLine = speedPoints.map((entry, index) => `${index ? "L" : "M"} ${entry.x} ${entry.y}`).join(" ");

  return <section className="lead-analytics" aria-label={title}>
    <div className="lead-analytics-metrics">
      <article><span>Leads total</span><strong>{total.toLocaleString()}</strong><small>Active organization leads</small></article>
      <article><span>Site visits</span><strong>{siteVisits.toLocaleString()}</strong><small>Scheduled or completed</small></article>
      <article><span>Won / MTD</span><strong>{won.toLocaleString()}</strong><small>{total ? `${Math.round(won / total * 100)}% conversion overall` : "0% conversion overall"}</small></article>
      <article><span>Pipeline value</span><strong>{open.toLocaleString()}</strong><small>Open leads in pipeline</small></article>
      <article><span>Duplicates</span><strong>{duplicateCount.toLocaleString()}</strong><small>Matching phone or email</small></article>
    </div>
    <div className="lead-analytics-grid">
      <article className="card lead-analytics-card">
        <div className="card-header"><div><p className="eyebrow">CONVERSION</p><h2>Conversion funnel</h2><p>Whole portfolio movement</p></div></div>
        <div className="lead-funnel">{funnelStatuses.map(([label, count]) => {
          const percent = funnelMax ? Math.round(count / funnelMax * 100) : 0;
          return <div className="lead-funnel-row" key={label}><div><span>{label}</span><strong>{count.toLocaleString()}</strong></div><div className="lead-funnel-track"><i style={{ width: `${percent}%` }} /></div><small>{total ? `${Math.round(count / total * 100)}%` : "0%"}</small></div>;
        })}</div>
      </article>
      <article className="card lead-analytics-card">
        <div className="card-header"><div><p className="eyebrow">CHANNELS</p><h2>Channel efficiency</h2><p>Lead volume by source</p></div></div>
        <div className="lead-source-bars"><div className="lead-source-axis"><span>{sourceMax}</span><span>{Math.round(sourceMax * .75)}</span><span>{Math.round(sourceMax * .5)}</span><span>{Math.round(sourceMax * .25)}</span><span>0</span></div><div className="lead-source-plot">{sourceEntries.map(([source, count]) => <div key={source}><i style={{ height: `${count / sourceMax * 100}%` }} title={`${source}: ${count}`} /><span>{source}</span></div>)}</div></div>
      </article>
      <article className="card lead-analytics-card">
        <div className="card-header"><div><p className="eyebrow">MOVEMENT</p><h2>Daily lead movement</h2><p>Recent new and total leads</p></div></div>
        <div className="lead-daily-bars">{daily.slice(-14).map((point) => <div key={point.activity_date}><i className="new" style={{ height: `${point.new_leads / responseMax * 100}%` }} title={`${point.activity_date}: ${point.new_leads} new`} /><i className="total" style={{ height: `${point.cumulative_leads / Math.max(1, ...daily.map((item) => item.cumulative_leads)) * 100}%` }} /><span>{new Date(`${point.activity_date}T00:00:00`).getDate()}</span></div>)}</div>
      </article>
      <article className="card lead-analytics-card">
        <div className="card-header"><div><p className="eyebrow">SPEED</p><h2>Speed to lead</h2><p>Daily lead activity trend</p></div></div>
        <svg className="lead-speed-chart" viewBox="0 0 500 210" role="img" aria-label="Daily lead activity trend">
          {[40, 78, 115, 153, 190].map((y) => <line key={y} x1="40" x2="460" y1={y} y2={y} className="lead-speed-grid" />)}
          {speedPoints.length > 1 && <path d={speedLine} className="lead-speed-line" />}
          {speedPoints.map(({ x, y, point }) => <circle key={point.activity_date} cx={x} cy={y} r="4" className="lead-speed-point"><title>{point.activity_date}: {point.new_leads} new leads</title></circle>)}
          {speedPoints.map(({ x, point }, index) => index % 2 === 0 ? <text key={point.activity_date} x={x} y="205" textAnchor="middle" className="lead-speed-label">{new Date(`${point.activity_date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</text> : null)}
        </svg>
      </article>
    </div>
  </section>;
}
