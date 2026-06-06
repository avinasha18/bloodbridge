import { Link } from "react-router-dom";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  TrendingUp,
  PieChart as PieIcon,
  MessageSquare,
  AlertCircle,
  Users,
  Droplets,
  Activity,
} from "lucide-react";
import PageHeader from "../components/ui/PageHeader";
import { Pill } from "../components/ui/Badge";
import { ChartCard, ChartTooltipContent, StatRing } from "../components/coordinator/ChartCard";
import { Table, THead, TH, TR, TD, Empty } from "../components/ui/Table";
import { useAsync } from "../hooks/useAsync";
import { endpoints } from "../lib/api";
import {
  axisTick,
  buildSupplyChartData,
  formatChartNumber,
  LINE_SERIES,
  palette,
  RELIABILITY_PIE,
} from "../lib/chartTheme";

export default function Analytics() {
  const dashboard = useAsync(() => endpoints.dashboard(), []);
  const reliability = useAsync(() => endpoints.reliability(), []);
  const responseTrend = useAsync(() => endpoints.responseTrend(14), []);
  const failures = useAsync(() => endpoints.failures(14), []);

  const m = dashboard.data;

  const supplyData = m ? buildSupplyChartData(m.blood_supply, m.critical_shortages) : [];

  const relData = (reliability.data || []).map((b, i) => ({
    ...b,
    fill: RELIABILITY_PIE[i % RELIABILITY_PIE.length],
  }));

  const trend = responseTrend.data || [];
  const trendTotals = trend.reduce(
    (acc, d) => ({
      sent: acc.sent + (d.sent || 0),
      responded: acc.responded + (d.responded || 0),
      accepted: acc.accepted + (d.accepted || 0),
    }),
    { sent: 0, responded: 0, accepted: 0 },
  );
  const acceptRate = trendTotals.sent > 0
    ? Math.round((trendTotals.accepted / trendTotals.sent) * 100)
    : 0;

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Reports & Analytics"
        subtitle="Operational metrics, donor supply, outreach performance, and failure trends."
        badge={<Pill tone="info" dot>Last 14 days</Pill>}
      />

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryKpi
          label="Total donors"
          value={formatChartNumber(m?.total_donors)}
          sub={`${formatChartNumber(m?.eligible_donors)} eligible`}
          icon={Users}
          color="indigo"
          loading={dashboard.loading}
        />
        <SummaryKpi
          label="Active needs"
          value={formatChartNumber(m?.active_requests)}
          sub={`${formatChartNumber(m?.fulfilled_today)} fulfilled today`}
          icon={Droplets}
          color="blood"
          loading={dashboard.loading}
        />
        <SummaryKpi
          label="Accept rate"
          value={trendTotals.sent ? `${acceptRate}%` : "—"}
          sub={`${trendTotals.accepted} of ${trendTotals.sent} SMS`}
          icon={MessageSquare}
          color="emerald"
          loading={responseTrend.loading}
        />
        <SummaryKpi
          label="At-risk donors"
          value={formatChartNumber(m?.at_risk_donors)}
          sub="over-contacted"
          icon={Activity}
          color="amber"
          loading={dashboard.loading}
        />
      </div>

      {/* Row 1: Supply + Reliability */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <ChartCard
          className="lg:col-span-3"
          title="Eligible donors by blood type"
          subtitle="Bar height = available donors · color = blood group"
          icon={<TrendingUp className="w-4 h-4" />}
          height="h-80"
        >
          {dashboard.loading ? (
            <ChartPlaceholder />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={supplyData} margin={{ top: 8, right: 12, bottom: 0, left: -8 }} barCategoryGap="18%">
                <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
                <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltipContent />} />
                <Bar dataKey="eligible" name="Eligible donors" radius={[8, 8, 0, 0]} animationDuration={900}>
                  {supplyData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          className="lg:col-span-2"
          title="Donor reliability"
          subtitle="ML trust score distribution"
          icon={<PieIcon className="w-4 h-4" />}
          height="h-80"
        >
          {reliability.loading ? (
            <ChartPlaceholder />
          ) : !relData.length ? (
            <div className="h-full flex items-center justify-center text-sm text-ink-500">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={relData}
                  dataKey="count"
                  nameKey="range"
                  cx="50%"
                  cy="45%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  animationDuration={800}
                >
                  {relData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} stroke="white" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltipContent />} />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Row 2: Outreach trend */}
      <ChartCard
        title="Outreach response funnel"
        subtitle="SMS sent → replied → accepted over 14 days"
        icon={<MessageSquare className="w-4 h-4" />}
        height="h-auto"
        noPadding
      >
        <div className="px-5 py-4 border-b border-ink-100 flex flex-wrap items-center justify-around gap-4 bg-ink-50/40">
          <StatRing value={trendTotals.sent} max={trendTotals.sent || 1} label="SMS sent" color={palette.slateLight} />
          <StatRing value={trendTotals.responded} max={trendTotals.sent || 1} label="Replied" color={palette.indigo} />
          <StatRing value={trendTotals.accepted} max={trendTotals.sent || 1} label="Accepted" color={palette.emerald} />
          <div className="text-center">
            <div className="text-3xl font-bold text-emerald-700 tabular-nums">{acceptRate}%</div>
            <div className="text-[10px] uppercase tracking-wide text-ink-500 mt-0.5">Accept rate</div>
          </div>
        </div>
        <div className="p-4 h-72">
          {responseTrend.loading ? (
            <ChartPlaceholder />
          ) : trend.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-ink-500">
              No outreach activity in the last 14 days
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                <defs>
                  {Object.entries(LINE_SERIES).map(([key, cfg]) => (
                    <linearGradient key={key} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={cfg.stroke} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={cfg.stroke} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
                <XAxis dataKey="date" tick={axisTick} axisLine={false} tickLine={false} tickFormatter={(v) => v?.slice(5) || v} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltipContent />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                {Object.entries(LINE_SERIES).map(([key, cfg]) => (
                  <Area
                    key={key}
                    type="monotone"
                    dataKey={key}
                    name={cfg.name}
                    stroke={cfg.stroke}
                    fill={`url(#grad-${key})`}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </ChartCard>

      {/* Failures table */}
      <section className="card overflow-hidden">
        <header className="px-5 py-4 border-b border-ink-100 flex items-center gap-2 bg-gradient-to-r from-white to-rose-50/40">
          <AlertCircle className="w-4 h-4 text-rose-600" />
          <div>
            <h2 className="text-sm font-semibold text-ink-900">Failure trends</h2>
            <p className="text-xs text-ink-500">Requests that could not be fulfilled · by blood group & city</p>
          </div>
        </header>
        {failures.loading ? (
          <Empty message="Loading failure data…" />
        ) : failures.data?.length === 0 ? (
          <div className="py-12 text-center">
            <CheckIcon />
            <p className="text-sm text-emerald-700 font-medium mt-2">No failures recorded</p>
            <p className="text-xs text-ink-500 mt-0.5">System performing well</p>
          </div>
        ) : (
          <Table className="border-0 rounded-none">
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Blood group</TH>
                <TH>City</TH>
                <TH align="right">Failures</TH>
              </tr>
            </THead>
            <tbody>
              {failures.data.map((f, i) => (
                <TR key={i} highlight={f.failure_count >= 3}>
                  <TD muted>{f.date}</TD>
                  <TD primary>{f.blood_group}</TD>
                  <TD>{f.city || "—"}</TD>
                  <TD align="right">
                    <span className={`font-mono font-semibold ${f.failure_count >= 3 ? "text-rose-700" : "text-ink-700"}`}>
                      {f.failure_count}
                    </span>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <div className="text-center pb-4">
        <Link to="/dashboard" className="text-xs text-indigo-600 hover:underline">
          ← Back to home dashboard
        </Link>
      </div>
    </div>
  );
}

function SummaryKpi({ label, value, sub, icon: Icon, color, loading }) {
  const colors = {
    blood: "from-rose-500 to-blood-600",
    indigo: "from-indigo-500 to-violet-600",
    emerald: "from-emerald-500 to-teal-600",
    amber: "from-amber-500 to-orange-500",
  };
  return (
    <div className="card p-4 hover-lift relative overflow-hidden">
      <div className={`absolute top-0 inset-x-0 h-1 bg-gradient-to-r ${colors[color]}`} />
      <div className="flex items-start justify-between pt-1">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">{label}</div>
          <div className="text-2xl font-bold text-ink-900 mt-1 tabular-nums">
            {loading ? <span className="shimmer inline-block h-7 w-12 rounded" /> : value}
          </div>
          {sub && <div className="text-[11px] text-ink-500 mt-0.5">{sub}</div>}
        </div>
        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${colors[color]} text-white flex items-center justify-center shadow-sm`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}

function ChartPlaceholder() {
  return (
    <div className="h-full flex items-end gap-2 px-6 pb-6">
      {[35, 60, 45, 75, 50, 65, 40, 55].map((h, i) => (
        <div key={i} className="flex-1 shimmer rounded-t-md" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

function CheckIcon() {
  return (
    <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </div>
  );
}
