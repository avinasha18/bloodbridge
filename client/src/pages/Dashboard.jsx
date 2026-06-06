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
    <div className="space-y-6">
      {/* Hero banner */}
      <section className="rounded-2xl relative overflow-hidden shadow-elevated animate-fade-up">
        <div className="absolute inset-0 bg-gradient-to-br from-ink-900 via-ink-800 to-blood-900" />
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "24px 24px" }} />
        <div className="absolute top-0 right-0 w-96 h-96 bg-blood-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />

        <div className="relative z-10 px-6 py-8 sm:px-8 sm:py-10 flex items-start justify-between gap-4 flex-wrap text-white">
          <div className="min-w-0">
            <div className="text-white/50 text-[11px] uppercase tracking-[0.15em] mb-2 font-medium">
              Command center
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold leading-tight tracking-tight">
              {greeting()}, here's your overview.
            </h1>
            <p className="text-white/60 text-sm mt-2 max-w-xl leading-relaxed">{summarySentence(m, criticalActive.length)}</p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={runScheduler}
              disabled={scheduling}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/[0.15] backdrop-blur text-sm font-medium transition-all duration-200 border border-white/10 hover:border-white/20"
            >
              {scheduling ? <Spinner /> : <Sparkles className="w-4 h-4" />}
              Check patients
            </button>
            <Link
              to="/requests/new"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-ink-900 hover:bg-ink-50 text-sm font-semibold shadow-sm transition-all duration-200"
            >
              <Droplets className="w-4 h-4 text-blood-600" />
              New need
            </Link>
          </div>
        </div>
      </section>

      {schedulerMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-sm flex items-center gap-2.5 animate-scale-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          {schedulerMessage}
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        <Kpi label="Active needs" value={fmt(m?.active_requests)} hint={`${fmt(m?.fulfilled_today)} done today`} icon={Activity} color="blood" loading={!m} />
        <Kpi label="Donors" value={fmt(m?.total_donors)} hint={`${fmt(m?.eligible_donors)} eligible`} icon={Users} color="indigo" loading={!m} />
        <Kpi label="Transfusions (7d)" value={fmt(m?.upcoming_transfusions_7d)} hint="upcoming cycles" icon={Calendar} color="emerald" loading={!m} />
        <Kpi label="At-risk donors" value={fmt(m?.at_risk_donors)} hint="over-contacted" icon={AlertTriangle} color="amber" loading={!m} />
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
                <Bar dataKey="eligible" name="Eligible" radius={[6, 6, 0, 0]} animationDuration={900}>
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
              <div className="flex justify-around py-3 border-b border-ink-100/80">
                <StatRing value={trendTotals.sent} max={trendTotals.sent || 1} label="Sent" color={palette.slateLight} />
                <StatRing value={trendTotals.responded} max={trendTotals.sent || 1} label="Replied" color={palette.indigo} />
                <StatRing value={trendTotals.accepted} max={trendTotals.sent || 1} label="Accepted" color={palette.emerald} />
              </div>
              <div className="flex-1 min-h-0 pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="acceptedGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={palette.emerald} stopOpacity={0.3} />
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

      {/* Shortages alert */}
      {criticalShortages.length > 0 && (
        <div className="rounded-2xl bg-gradient-to-r from-blood-50 to-rose-50 border border-blood-100 p-5 flex items-center justify-between flex-wrap gap-4 animate-scale-in">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-blood-100 text-blood-600 flex items-center justify-center animate-pulse-soft">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-blood-900 text-sm">Critical shortages detected</div>
              <div className="text-xs text-blood-700/80 mt-0.5">Search radius auto-expanded for these types</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {criticalShortages.map((bg) => (
              <BloodGroupChip key={bg} bloodGroup={bg} />
            ))}
          </div>
        </div>
      )}

      {/* Urgent attention cards */}
      {criticalActive.length > 0 && (
        <section className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blood-50 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-blood-600" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-ink-900">Needs your attention</h2>
                <p className="text-[11px] text-ink-500 mt-0.5">{criticalActive.length} urgent requests awaiting action</p>
              </div>
            </div>
            <Link to="/requests" className="text-xs text-blood-600 hover:text-blood-700 font-medium flex items-center gap-1 transition-colors">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 stagger-children">
            {criticalActive.slice(0, 4).map((r) => (
              <Link
                key={r.id}
                to={`/requests/${r.id}`}
                className="group rounded-xl border border-ink-100 bg-white hover:border-blood-200 hover:shadow-card-hover p-4 flex items-start gap-3 transition-all duration-200"
              >
                <BloodGroupChip bloodGroup={r.blood_group} size="lg" />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                    <UrgencyBadge urgency={r.urgency} compact />
                    <StatusBadge status={r.status} compact />
                  </div>
                  <div className="text-sm font-medium text-ink-900 truncate flex items-center gap-1.5">
                    <Hospital className="w-3.5 h-3.5 text-ink-400 shrink-0" />
                    {r.hospital_name || "Hospital"}
                  </div>
                  <div className="text-[11px] text-ink-400 mt-1">{relativeTime(r.created_at)}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-ink-300 group-hover:text-blood-500 group-hover:translate-x-0.5 shrink-0 mt-1 transition-all duration-200" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Bottom row: patients + recent */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                <Calendar className="w-4 h-4 text-emerald-600" />
              </div>
              <h2 className="text-sm font-semibold text-ink-900">Upcoming transfusions</h2>
            </div>
            <Link to="/patients" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium transition-colors">All patients →</Link>
          </div>
          {upcoming.loading ? (
            <div className="text-sm text-ink-500 py-8 text-center">Loading…</div>
          ) : upcoming.data?.length === 0 ? (
            <div className="text-sm text-ink-500 py-8 text-center flex flex-col items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              <span>Calm week — none due in 7 days</span>
            </div>
          ) : (
            <ul className="space-y-1">
              {upcoming.data.slice(0, 6).map((t) => (
                <li key={t.patient_id} className="flex items-center gap-3 rounded-xl p-2.5 hover:bg-ink-50/80 transition-colors duration-150">
                  <BloodGroupChip bloodGroup={t.blood_group} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink-800 truncate">{t.name}</div>
                    <div className="text-[11px] text-ink-400 truncate">{t.hospital_name}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-xs font-semibold tabular-nums ${t.days_until <= 1 ? "text-blood-600" : t.days_until <= 3 ? "text-amber-600" : "text-ink-600"}`}>
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
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                <Activity className="w-4 h-4 text-indigo-600" />
              </div>
              <h2 className="text-sm font-semibold text-ink-900">Recent blood needs</h2>
            </div>
            <Link to="/requests" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium transition-colors">All →</Link>
          </div>
          {activeReqs.loading ? (
            <div className="text-sm text-ink-500 py-8 text-center">Loading…</div>
          ) : recentActivity.length === 0 ? (
            <div className="text-sm text-ink-500 py-8 text-center">No requests yet</div>
          ) : (
            <div className="space-y-0.5">
              {recentActivity.map((r) => (
                <Link key={r.id} to={`/requests/${r.id}`} className="flex items-center gap-3 py-2.5 px-2.5 rounded-xl hover:bg-ink-50/80 transition-colors duration-150 group">
                  <BloodGroupChip bloodGroup={r.blood_group} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink-800 truncate">{r.hospital_name || "Hospital"}</div>
                    <div className="flex gap-1.5 mt-0.5">
                      <StatusBadge status={r.status} compact />
                    </div>
                  </div>
                  <span className="text-[11px] text-ink-400 shrink-0">{relativeTime(r.created_at)}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-ink-300 group-hover:text-indigo-500 group-hover:translate-x-0.5 shrink-0 transition-all duration-200" />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger-children">
        {[
          { to: "/requests/new", label: "New need", icon: Droplets, color: "blood" },
          { to: "/donors", label: "Donors", icon: Users, color: "indigo" },
          { to: "/patients", label: "Patients", icon: Heart, color: "emerald" },
          { to: "/analytics", label: "Reports", icon: BarChart3, color: "violet" },
        ].map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className="card-interactive p-4 flex items-center gap-3 group"
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              a.color === "blood" ? "bg-blood-50 text-blood-600" :
              a.color === "indigo" ? "bg-indigo-50 text-indigo-600" :
              a.color === "emerald" ? "bg-emerald-50 text-emerald-600" : "bg-violet-50 text-violet-600"
            }`}>
              <a.icon className="w-4 h-4" />
            </div>
            <span className="text-sm font-medium text-ink-700 group-hover:text-ink-900 transition-colors">{a.label}</span>
            <ChevronRight className="w-4 h-4 ml-auto text-ink-300 group-hover:text-ink-500 group-hover:translate-x-0.5 transition-all duration-200" />
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
  if (!m) return "Loading your dashboard…";
  if (m.total_donors === 0) return "Database is empty — seed donors to begin.";
  const bits = [];
  if (criticalCount > 0) bits.push(`${criticalCount} urgent`);
  if (m.active_requests > 0) bits.push(`${m.active_requests} active needs`);
  if (m.fulfilled_today > 0) bits.push(`${m.fulfilled_today} fulfilled today`);
  return bits.length ? bits.join(" · ") : "All quiet — no open needs right now.";
}

function Kpi({ label, value, hint, icon: Icon, color, loading }) {
  const colorMap = {
    blood: { bg: "bg-blood-50", text: "text-blood-600", accent: "bg-blood-500" },
    indigo: { bg: "bg-indigo-50", text: "text-indigo-600", accent: "bg-indigo-500" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-600", accent: "bg-emerald-500" },
    amber: { bg: "bg-amber-50", text: "text-amber-600", accent: "bg-amber-500" },
  };
  const c = colorMap[color];

  return (
    <div className="card p-4 relative overflow-hidden group hover:shadow-card-hover transition-all duration-300">
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${c.accent}`} />
      <div className="flex items-start justify-between gap-2 pt-1">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">{label}</div>
          <div className="text-2xl font-bold text-ink-900 mt-1.5 tabular-nums tracking-tight">
            {loading ? <span className="shimmer inline-block h-7 w-14 rounded" /> : value}
          </div>
          {hint && <div className="text-[11px] text-ink-400 mt-1">{hint}</div>}
        </div>
        <div className={`w-10 h-10 rounded-xl ${c.bg} ${c.text} flex items-center justify-center transition-transform duration-300 group-hover:scale-110`}>
          <Icon className="w-[18px] h-[18px]" />
        </div>
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="h-full flex items-end gap-3 px-4 pb-4">
      {[40, 65, 50, 80, 55, 70, 45, 60].map((h, i) => (
        <div key={i} className="flex-1 shimmer rounded-t-lg" style={{ height: `${h}%`, animationDelay: `${i * 100}ms` }} />
      ))}
    </div>
  );
}
