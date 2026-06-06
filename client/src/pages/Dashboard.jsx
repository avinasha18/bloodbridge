import { Link } from "react-router-dom";
import {
  Users,
  Heart,
  Droplets,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Sparkles,
  Activity,
  TrendingUp,
  ArrowRight,
  Hospital,
  ChevronRight,
  MessageSquare,
  BarChart3,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  AreaChart,
  Area,
  CartesianGrid,
} from "recharts";

import { BloodGroupChip, Pill, StatusBadge, UrgencyBadge } from "../components/ui/Badge";
import { ChartCard, ChartTooltipContent, StatRing } from "../components/coordinator/ChartCard";
import Spinner from "../components/ui/Spinner";
import { usePoll, useAsync } from "../hooks/useAsync";
import { endpoints } from "../lib/api";
import { relativeTime, filterStandardShortages } from "../lib/format";
import {
  axisTick,
  buildSupplyChartData,
  palette,
} from "../lib/chartTheme";
import { useState } from "react";

export default function Dashboard() {
  const metrics = usePoll(endpoints.dashboard, 15_000);
  const activeReqs = usePoll(() => endpoints.listRequests({ limit: 8, offset: 0 }), 10_000);
  const upcoming = useAsync(() => endpoints.upcomingTransfusions(7), []);
  const responseTrend = useAsync(() => endpoints.responseTrend(14), []);

  const m = metrics.data;
  const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString());

  const [scheduling, setScheduling] = useState(false);
  const [schedulerMessage, setSchedulerMessage] = useState(null);

  async function runScheduler() {
    setScheduling(true);
    setSchedulerMessage(null);
    try {
      const r = await endpoints.runProactiveScheduler();
      setSchedulerMessage(
        `Created ${r.created_count} proactive blood needs · skipped ${r.skipped_count} already-open cycles`,
      );
      metrics.refresh();
      activeReqs.refresh();
      upcoming.refresh();
    } catch (e) {
      setSchedulerMessage("Scheduler failed: " + e.message);
    } finally {
      setScheduling(false);
    }
  }

  const items = activeReqs.data?.items || [];
  const criticalActive = items.filter(
    (r) => r.urgency !== "routine" && ["pending", "matching", "outreach_sent"].includes(r.status),
  );
  const recentActivity = items.slice(0, 5);

  const supplyData = m ? buildSupplyChartData(m.blood_supply, m.critical_shortages) : [];
  const criticalShortages = filterStandardShortages(m?.critical_shortages);

  const trendData = responseTrend.data || [];
  const trendTotals = trendData.reduce(
    (acc, d) => ({
      sent: acc.sent + (d.sent || 0),
      responded: acc.responded + (d.responded || 0),
      accepted: acc.accepted + (d.accepted || 0),
    }),
    { sent: 0, responded: 0, accepted: 0 },
  );

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Hero */}
      <section className="rounded-2xl relative overflow-hidden shadow-lg">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-700 via-violet-700 to-blood-700" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNCI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-60" />
        <div className="relative z-10 px-6 py-7 sm:px-8 sm:py-8 flex items-start justify-between gap-4 flex-wrap text-white">
          <div className="min-w-0">
            <div className="text-white/70 text-xs uppercase tracking-widest mb-1 font-medium">
              Command center
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold leading-tight">
              {greeting()}, here's your overview.
            </h1>
            <p className="text-white/80 text-sm mt-2 max-w-xl">{summarySentence(m, criticalActive.length)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={runScheduler}
              disabled={scheduling}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur text-sm font-medium transition border border-white/20"
            >
              {scheduling ? <Spinner /> : <Sparkles className="w-4 h-4" />}
              Check patients
            </button>
            <Link
              to="/requests/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-indigo-800 hover:bg-indigo-50 text-sm font-semibold shadow transition"
            >
              <Droplets className="w-4 h-4" />
              New need
            </Link>
          </div>
        </div>
      </section>

      {schedulerMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-xl text-sm flex items-center gap-2 animate-pop-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          {schedulerMessage}
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Active needs" value={fmt(m?.active_requests)} hint={`${fmt(m?.fulfilled_today)} done today`} icon={Activity} gradient="from-rose-500 to-blood-600" loading={!m} />
        <Kpi label="Donors" value={fmt(m?.total_donors)} hint={`${fmt(m?.eligible_donors)} eligible`} icon={Users} gradient="from-indigo-500 to-violet-600" loading={!m} />
        <Kpi label="Transfusions (7d)" value={fmt(m?.upcoming_transfusions_7d)} hint="upcoming cycles" icon={Calendar} gradient="from-emerald-500 to-teal-600" loading={!m} />
        <Kpi label="At-risk donors" value={fmt(m?.at_risk_donors)} hint="over-contacted" icon={AlertTriangle} gradient="from-amber-500 to-orange-500" loading={!m} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <ChartCard
          className="xl:col-span-2"
          title="Donor supply by blood type"
          subtitle="Eligible donors · red = critical shortage"
          icon={<TrendingUp className="w-4 h-4" />}
          actionTo="/analytics"
          height="h-[280px]"
        >
          {metrics.loading && !m ? (
            <ChartSkeleton />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={supplyData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
                <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltipContent />} />
                <Bar dataKey="eligible" name="Eligible" radius={[8, 8, 0, 0]} animationDuration={900}>
                  {supplyData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="SMS outreach (14d)"
          subtitle="Sent → replied → accepted"
          icon={<MessageSquare className="w-4 h-4" />}
          actionTo="/analytics"
          height="h-[280px]"
        >
          {responseTrend.loading ? (
            <ChartSkeleton />
          ) : trendData.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-sm text-ink-500 gap-3">
              <MessageSquare className="w-8 h-8 text-ink-300" />
              No outreach yet
            </div>
          ) : (
            <div className="h-full flex flex-col">
              <div className="flex justify-around py-2 border-b border-ink-100">
                <StatRing value={trendTotals.sent} max={trendTotals.sent || 1} label="Sent" color={palette.slateLight} />
                <StatRing value={trendTotals.responded} max={trendTotals.sent || 1} label="Replied" color={palette.indigo} />
                <StatRing value={trendTotals.accepted} max={trendTotals.sent || 1} label="Accepted" color={palette.emerald} />
              </div>
              <div className="flex-1 min-h-0 pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="acceptedGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={palette.emerald} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={palette.emerald} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
                    <XAxis dataKey="date" tick={{ ...axisTick, fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v) => v?.slice(5) || v} />
                    <YAxis tick={axisTick} axisLine={false} tickLine={false} width={28} />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Area type="monotone" dataKey="accepted" name="Accepted" stroke={palette.emerald} fill="url(#acceptedGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </ChartCard>
      </div>

      {/* Shortages + urgent */}
      {criticalShortages.length > 0 && (
        <div className="rounded-xl bg-gradient-to-r from-rose-50 to-blood-50 border border-rose-200 p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blood-100 text-blood-700 flex items-center justify-center animate-pulse-soft">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-blood-900 text-sm">Critical shortages</div>
              <div className="text-xs text-blood-700">Search radius auto-expanded</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {criticalShortages.map((bg) => (
              <BloodGroupChip key={bg} bloodGroup={bg} />
            ))}
          </div>
        </div>
      )}

      {criticalActive.length > 0 && (
        <section className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-blood-600" />
              <h2 className="text-sm font-semibold text-ink-900">Needs your attention</h2>
              <Pill tone="danger" dot>{criticalActive.length}</Pill>
            </div>
            <Link to="/requests" className="text-xs text-blood-700 hover:underline font-medium">
              View all <ArrowRight className="inline w-3 h-3" />
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {criticalActive.slice(0, 4).map((r) => (
              <Link
                key={r.id}
                to={`/requests/${r.id}`}
                className="group rounded-xl border border-rose-100 bg-gradient-to-br from-white to-rose-50/50 hover-lift p-4 flex items-start gap-3"
              >
                <BloodGroupChip bloodGroup={r.blood_group} size="lg" />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <UrgencyBadge urgency={r.urgency} compact />
                    <StatusBadge status={r.status} compact />
                  </div>
                  <div className="text-sm font-medium text-ink-900 truncate flex items-center gap-1">
                    <Hospital className="w-3.5 h-3.5 text-ink-400 shrink-0" />
                    {r.hospital_name || "Hospital"}
                  </div>
                  <div className="text-[11px] text-ink-500 mt-0.5">{relativeTime(r.created_at)}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-ink-300 group-hover:text-blood-600 shrink-0 mt-1" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Bottom row: patients + recent */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-600" />
              <h2 className="text-sm font-semibold">Upcoming transfusions</h2>
            </div>
            <Link to="/patients" className="text-xs text-emerald-700 hover:underline">All patients →</Link>
          </div>
          {upcoming.loading ? (
            <div className="text-sm text-ink-500 py-6 text-center">Loading…</div>
          ) : upcoming.data?.length === 0 ? (
            <div className="text-sm text-ink-500 py-6 text-center flex flex-col items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              Calm week — none due in 7 days
            </div>
          ) : (
            <ul className="space-y-1.5">
              {upcoming.data.slice(0, 6).map((t) => (
                <li key={t.patient_id} className="flex items-center gap-3 rounded-xl p-2.5 hover:bg-emerald-50/50 transition-colors">
                  <BloodGroupChip bloodGroup={t.blood_group} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{t.name}</div>
                    <div className="text-[11px] text-ink-500 truncate">{t.hospital_name}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-xs font-semibold ${t.days_until <= 1 ? "text-blood-700" : t.days_until <= 3 ? "text-amber-700" : "text-ink-600"}`}>
                      {t.days_until}d
                    </div>
                    {t.proactive_request_created ? (
                      <Pill tone="success" dot>Queued</Pill>
                    ) : (
                      <Pill tone="warn" dot>Pending</Pill>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-semibold">Recent blood needs</h2>
            </div>
            <Link to="/requests" className="text-xs text-indigo-700 hover:underline">All →</Link>
          </div>
          {activeReqs.loading ? (
            <div className="text-sm text-ink-500 py-6 text-center">Loading…</div>
          ) : recentActivity.length === 0 ? (
            <div className="text-sm text-ink-500 py-6 text-center">No requests yet</div>
          ) : (
            <div className="divide-y divide-ink-100">
              {recentActivity.map((r) => (
                <Link key={r.id} to={`/requests/${r.id}`} className="flex items-center gap-3 py-2.5 hover:bg-indigo-50/40 -mx-2 px-2 rounded-lg transition-colors group">
                  <BloodGroupChip bloodGroup={r.blood_group} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.hospital_name || "Hospital"}</div>
                    <div className="flex gap-1.5 mt-0.5">
                      <StatusBadge status={r.status} compact />
                    </div>
                  </div>
                  <span className="text-[11px] text-ink-400 shrink-0">{relativeTime(r.created_at)}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-ink-300 group-hover:text-indigo-600 shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { to: "/requests/new", label: "New need", icon: Droplets, color: "blood" },
          { to: "/donors", label: "Donors", icon: Users, color: "indigo" },
          { to: "/patients", label: "Patients", icon: Heart, color: "emerald" },
          { to: "/analytics", label: "Reports", icon: BarChart3, color: "violet" },
        ].map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className={`card p-4 flex items-center gap-3 hover-lift transition-all group border-l-4 ${
              a.color === "blood" ? "border-l-blood-500" :
              a.color === "indigo" ? "border-l-indigo-500" :
              a.color === "emerald" ? "border-l-emerald-500" : "border-l-violet-500"
            }`}
          >
            <a.icon className={`w-5 h-5 ${
              a.color === "blood" ? "text-blood-600" :
              a.color === "indigo" ? "text-indigo-600" :
              a.color === "emerald" ? "text-emerald-600" : "text-violet-600"
            }`} />
            <span className="text-sm font-semibold text-ink-800 group-hover:text-ink-900">{a.label}</span>
            <ChevronRight className="w-4 h-4 ml-auto text-ink-300 group-hover:text-ink-500" />
          </Link>
        ))}
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Late shift";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function summarySentence(m, criticalCount) {
  if (!m) return "Loading…";
  if (m.total_donors === 0) return "Database is empty — seed donors to begin.";
  const bits = [];
  if (criticalCount > 0) bits.push(`${criticalCount} urgent`);
  if (m.active_requests > 0) bits.push(`${m.active_requests} active needs`);
  if (m.fulfilled_today > 0) bits.push(`${m.fulfilled_today} fulfilled today`);
  return bits.length ? bits.join(" · ") : "All quiet — no open needs right now.";
}

function Kpi({ label, value, hint, icon: Icon, gradient, loading }) {
  return (
    <div className="card p-4 hover-lift overflow-hidden relative">
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${gradient}`} />
      <div className="flex items-start justify-between gap-2 pt-1">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">{label}</div>
          <div className="text-2xl font-bold text-ink-900 mt-1 tabular-nums">
            {loading ? <span className="shimmer inline-block h-7 w-14 rounded" /> : value}
          </div>
          {hint && <div className="text-[11px] text-ink-500 mt-0.5">{hint}</div>}
        </div>
        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} text-white flex items-center justify-center shadow-sm opacity-90`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="h-full flex items-end gap-2 px-4 pb-4">
      {[40, 65, 50, 80, 55, 70, 45, 60].map((h, i) => (
        <div key={i} className="flex-1 shimmer rounded-t-lg" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}
