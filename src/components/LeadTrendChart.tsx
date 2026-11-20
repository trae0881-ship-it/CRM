import type { LeadTrendPoint } from "../services/leads";

const chartWidth = 760;
const chartHeight = 250;
const margins = { top: 18, right: 18, bottom: 36, left: 48 };

export function LeadTrendChart({ points, loading }: { points: LeadTrendPoint[]; loading: boolean }) {
  const width = chartWidth - margins.left - margins.right;
  const height = chartHeight - margins.top - margins.bottom;
  const values = points.map((point) => point.cumulative_leads);
  const minValue = values.length ? Math.min(...values) : 0;
  const maxValue = values.length ? Math.max(...values) : 0;
  const spread = Math.max(maxValue - minValue, Math.max(maxValue * 0.08, 1));
  const x = (index: number) => margins.left + (points.length <= 1 ? width / 2 : (index / (points.length - 1)) * width);
  const y = (value: number) => margins.top + height - ((value - minValue) / spread) * height;
  const line = points.map((point, index) => `${index ? "L" : "M"} ${x(index)} ${y(point.cumulative_leads)}`).join(" ");
  const area = points.length ? `${line} L ${x(points.length - 1)} ${margins.top + height} L ${x(0)} ${margins.top + height} Z` : "";
  const labelIndexes = points.length <= 7
    ? points.map((_, index) => index)
    : [...new Set([0, ...Array.from({ length: 5 }, (_, index) => Math.round((index + 1) * (points.length - 1) / 6)), points.length - 1])];
  const gridValues = Array.from({ length: 5 }, (_, index) => minValue + (spread * index) / 4);

  return <section className="card lead-trend-card" aria-labelledby="lead-trend-title">
    <div className="card-header">
      <div><p className="eyebrow">LEAD GROWTH</p><h2 id="lead-trend-title">Total leads over time</h2><p>Organization-wide lead total · last 30 days</p></div>
      <span className="trend-total">{points.length ? points[points.length - 1].cumulative_leads : 0}<small>current total</small></span>
    </div>
    {loading ? <p className="muted" role="status">Loading lead trend…</p> : points.length ? <>
      <div className="lead-trend-plot">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label={`Total leads grew from ${points[0].cumulative_leads} to ${points[points.length - 1].cumulative_leads} over ${points.length} days`}>
          <defs><linearGradient id="lead-trend-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#5c4fea" stopOpacity=".22" /><stop offset="100%" stopColor="#5c4fea" stopOpacity=".01" /></linearGradient></defs>
          {gridValues.map((value, index) => {
            const gridY = margins.top + height - (index / 4) * height;
            return <g key={index}><line x1={margins.left} x2={chartWidth - margins.right} y1={gridY} y2={gridY} className="lead-trend-grid" /><text x={margins.left - 10} y={gridY + 4} textAnchor="end" className="lead-trend-axis">{Math.round(value).toLocaleString()}</text></g>;
          })}
          <path d={area} fill="url(#lead-trend-fill)" />
          <path d={line} className="lead-trend-line" />
          {points.map((point, index) => <circle key={point.activity_date} cx={x(index)} cy={y(point.cumulative_leads)} r={points.length > 20 && index % 3 !== 0 ? 2 : 3.5} className="lead-trend-point"><title>{`${point.activity_date}: ${point.cumulative_leads} total, ${point.new_leads} new`}</title></circle>)}
          {labelIndexes.map((index) => <text key={points[index].activity_date} x={x(index)} y={chartHeight - 8} textAnchor="middle" className="lead-trend-axis">{new Date(`${points[index].activity_date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</text>)}
        </svg>
      </div>
      <div className="lead-trend-legend"><span><i /> Total leads</span><small>Hover/tap a point for daily new lead details</small></div>
    </> : <div className="lead-trend-empty"><strong>No lead history yet</strong><span>As leads are added, their growth will appear here.</span></div>}
  </section>;
}
