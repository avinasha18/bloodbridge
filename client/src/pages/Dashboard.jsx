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
  Clock,
  ArrowRight,
  Hospital,
  ChevronRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";

import { BloodGroupChip, Pill, StatusBadge, UrgencyBadge } from "../components/ui/Badge";
import Spinner from "../components/ui/Spinner";
import { usePoll, useAsync } from "../hooks/useAsync";
import { endpoints } from "../lib/api";
import { relativeTime } from "../lib/format";
import { useState } from "react";

export default function Dashboard() {
  const metrics = usePoll(endpoints.dashboard, 15_000);
  const activeReqs = usePoll(
    () => endpoints.listRequests({ limit: 8, offset: 0 }),
    10_000,
  );
  const upcoming = useAsync(() => endpoints.upcomingTransfusions(7), []);

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

  // Critical items from active requests
  const items = activeReqs.data?.items || [];
  const criticalActive = items.filter(
    (r) =>
      r.urgency !== "routine" &&
      ["pending", "matching", "outreach_sent"].includes(r.status),
  );
  const recentActivity = items.slice(0, 5);

  const supplyData = m
    ? Object.entries(m.blood_supply).map(([bg, count]) => ({
        name: bg.replace("Positive", "+").replace("Negative", "-"),
        eligible: count,
        critical: m.critical_shortages?.includes(bg),
        full: bg,
      }))
    : [];

  return (
    <div className="space-y-6 animate-fade-up">
      {/* HERO */}
      <section className="rounded-2xl bg-hero-emerald text-white px-6 py-7 sm:px-8 sm:py-8 shadow-card relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-56 h-56 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
        <div className="relative z-10 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-white/80 text-xs uppercase tracking-wide mb-1">
              Coordinator command center
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold leading-tight">
              {greeting()}, here's what needs you today.
            </h1>
            <p className="text-white/85 text-sm mt-1.5 max-w-2xl">
              {summarySentence(m, criticalActive.length)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={runScheduler}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white/15 hover:bg-white/25 backdrop-blur text-sm font-medium transition"
              disabled={scheduling}
            >
              {scheduling ? <Spinner /> : <Sparkles className="w-4 h-4" />}
              Check upcoming patients
            </button>
            <Link
              to="/requests/new"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white text-emerald-800 hover:bg-emerald-50 text-sm font-semibold shadow-sm transition"
            >
              <Droplets className="w-4 h-4" />
              New blood need
            </Link>
          </div>
        </div>
      </section>

      {schedulerMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-lg text-sm flex items-center gap-2 animate-pop-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          {schedulerMessage}
        </div>
      )}

      {metrics.error && (
        <div className="bg-blood-50 border border-blood-200 text-blood-800 px-4 py-3 rounded-lg text-sm">
          Dashboard API error: {metrics.error.message || String(metrics.error)}
        </div>
      )}

      {!metrics.loading && !metrics.error && m && m.total_donors === 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-lg text-sm">
          <strong>Database is empty.</strong> Run{" "}
          <code className="bg-amber-100 px-1 rounded">python -m app.seed.seed_data --reset</code>{" "}
          in the <code className="bg-amber-100 px-1 rounded">server/</code> folder to load the
          6,800+ donor dataset, then restart the API.
        </div>
      )}

      {/* KPI ROW */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Kpi
          label="Active blood needs"
          value={fmt(m?.active_requests)}
          hint={`${fmt(m?.fulfilled_today)} completed today`}
          icon={Activity}
          tone="blood"
          loading={!m}
        />
        <Kpi
          label="Donors in system"
          value={fmt(m?.total_donors)}
          hint={`${fmt(m?.eligible_donors)} can donate now`}
          icon={Users}
          tone="indigo"
          loading={!m}
        />
        <Kpi
          label="Transfusions next 7d"
          value={fmt(m?.upcoming_transfusions_7d)}
          hint="proactive scheduler will queue these"
          icon={Calendar}
          tone="emerald"
          loading={!m}
        />
        <Kpi
          label="Over-contacted donors"
          value={fmt(m?.at_risk_donors)}
          hint="auto-cooled by reliability layer"
          icon={AlertTriangle}
          tone="amber"
          loading={!m}
        />
      </div>

      {/* Critical shortages strip */}
      {m?.critical_shortages?.length > 0 && (
        <div className="rounded-xl bg-blood-50/80 border border-blood-200 p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blood-100 text-blood-700 flex items-center justify-center animate-pulse-soft">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-blood-900 text-sm">
                Critical blood-type shortages
              </div>
              <div className="text-xs text-blood-800">
                Search radius auto-expanded for these types.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {m.critical_shortages.map((bg) => (
              <BloodGroupChip key={bg} bloodGroup={bg} />
            ))}
          </div>
        </div>
      )}

      {/* Action zone: urgent needs that need attention */}
      {criticalActive.length > 0 && (
        <Card>
          <CardHeader
            icon={<AlertTriangle className="w-4 h-4 text-blood-600" />}
            title="Urgent — needs your attention"
            subtitle="These blood needs are critical / urgent and haven't been resolved yet."
            right={
              <Link to="/requests" className="text-xs text-blood-700 hover:underline">
                All needs <ArrowRight className="inline w-3 h-3" />
              </Link>
            }
          />
          <div className="grid sm:grid-cols-2 gap-3">
            {criticalActive.slice(0, 4).map((r) => (
              <Link
                key={r.id}
                to={`/requests/${r.id}`}
                className="group rounded-xl border border-blood-100 bg-white hover-lift p-4 flex items-start gap-3"
              >
                <div className="w-11 h-11 rounded-lg bg-blood-50 text-blood-700 flex items-center justify-center font-semibold shrink-0">
                  {r.blood_group?.replace("Positive", "+").replace("Negative", "-")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <UrgencyBadge urgency={r.urgency} />
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="text-sm font-medium text-ink-900 truncate flex items-center gap-1.5">
                    <Hospital className="w-3.5 h-3.5 text-ink-400 shrink-0" />
                    {r.hospital_name || "Hospital"}
                  </div>
                  <div className="text-[11px] text-ink-500 mt-0.5 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {relativeTime(r.created_at)}
                    {r.units_needed > 0 && <span>· {r.units_needed} unit{r.units_needed > 1 ? "s" : ""}</span>}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-ink-300 group-hover:text-blood-600 mt-2 shrink-0" />
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* TWO COLUMN: supply chart + upcoming patients */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader
            icon={<TrendingUp className="w-4 h-4 text-indigo-600" />}
            title="Available donors by blood type"
            subtitle="Eligible donors per blood group · highlighted bars are in shortage"
          />
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={supplyData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: "rgba(225,29,72,0.05)" }}
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                  }}
                />
                <Bar
                  dataKey="eligible"
                  radius={[6, 6, 0, 0]}
                  animationDuration={800}
                >
                  {supplyData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.critical ? "#e11d48" : "#6366f1"}
                      opacity={entry.critical ? 1 : 0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader
            icon={<Calendar className="w-4 h-4 text-emerald-600" />}
            title="Patients needing blood soon"
            subtitle="Next 7 days"
            right={
              <Link to="/patients" className="text-xs text-emerald-700 hover:underline">
                All patients <ArrowRight className="inline w-3 h-3" />
              </Link>
            }
          />
          {upcoming.loading && !upcoming.data ? (
            <EmptyState message="Loading…" />
          ) : upcoming.data?.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="w-6 h-6 text-emerald-500" />}
              message="No transfusions due in 7 days — calm week."
            />
          ) : (
            <ul className="space-y-2 max-h-72 overflow-auto pr-1">
              {upcoming.data?.slice(0, 8).map((t) => (
                <li
                  key={t.patient_id}
                  className="flex items-center gap-3 rounded-lg p-2 hover:bg-ink-50 transition-colors"
                >
                  <BloodGroupChip bloodGroup={t.blood_group} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink-900 truncate">
                      {t.name}
                    </div>
                    <div className="text-[11px] text-ink-500 truncate">
                      {t.hospital_name || "—"}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className={`text-xs font-medium ${
                        t.days_until <= 1
                          ? "text-blood-700"
                          : t.days_until <= 3
                            ? "text-amber-700"
                            : "text-ink-600"
                      }`}
                    >
                      in {t.days_until}d
                    </div>
                    {t.proactive_request_created ? (
                      <Pill tone="success">queued</Pill>
                    ) : (
                      <Pill tone="warn">awaiting</Pill>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* RECENT ACTIVITY */}
      <Card>
        <CardHeader
          icon={<Activity className="w-4 h-4 text-ink-600" />}
          title="Recent blood needs"
          subtitle="Newest first · click to open"
          right={
            <Link to="/requests" className="text-xs text-ink-600 hover:underline">
              All needs <ArrowRight className="inline w-3 h-3" />
            </Link>
          }
        />
        {activeReqs.loading && !activeReqs.data ? (
          <EmptyState message="Loading…" />
        ) : recentActivity.length === 0 ? (
          <EmptyState message="No blood needs yet — create one to start." />
        ) : (
          <div className="divide-y divide-ink-100">
            {recentActivity.map((r) => (
              <Link
                key={r.id}
                to={`/requests/${r.id}`}
                className="flex items-center gap-3 py-2.5 px-1 hover:bg-ink-50 rounded-md transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-blood-50 text-blood-700 flex items-center justify-center text-sm font-semibold shrink-0">
                  {r.blood_group?.replace("Positive", "+").replace("Negative", "-")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink-900 truncate flex items-center gap-1.5">
                    <Hospital className="w-3.5 h-3.5 text-ink-400 shrink-0" />
                    {r.hospital_name || "Hospital"}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <UrgencyBadge urgency={r.urgency} />
                    <StatusBadge status={r.status} />
                    {r.is_proactive && <Pill tone="info">from schedule</Pill>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[11px] text-ink-500">{relativeTime(r.created_at)}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-ink-300 shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* QUICK ACTIONS */}
      <Card>
        <CardHeader
          icon={<Sparkles className="w-4 h-4 text-amber-600" />}
          title="Quick actions"
        />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickAction
            to="/requests/new"
            title="Create blood need"
            sub="Manual entry"
            icon={<Droplets className="w-4 h-4" />}
            tone="blood"
          />
          <QuickAction
            to="/donors"
            title="Browse donors"
            sub="Reliability scoring"
            icon={<Users className="w-4 h-4" />}
            tone="indigo"
          />
          <QuickAction
            to="/patients"
            title="All patients"
            sub="Cycle schedules"
            icon={<Heart className="w-4 h-4" />}
            tone="emerald"
          />
          <QuickAction
            to="/ai"
            title="Ask the AI"
            sub="Natural-language reports"
            icon={<Bot className="w-4 h-4" />}
            tone="amber"
          />
        </div>
      </Card>
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
  if (!m) return "Loading the latest numbers…";
  if (m.total_donors === 0) {
    return "Database is empty — seed donors to begin.";
  }
  const bits = [];
  if (criticalCount > 0) {
    bits.push(
      `${criticalCount} urgent need${criticalCount > 1 ? "s" : ""} waiting`,
    );
  }
  if (m.active_requests > 0) {
    bits.push(`${m.active_requests} active`);
  }
  if (m.upcoming_transfusions_7d > 0) {
    bits.push(`${m.upcoming_transfusions_7d} scheduled this week`);
  }
  if (m.fulfilled_today > 0) {
    bits.push(`${m.fulfilled_today} done today`);
  }
  if (bits.length === 0) return "Quiet day — no open requests right now.";
  return bits.join(" · ");
}

// ─── UI primitives (local, theme-aware) ─────────────────────────────────

function Kpi({ label, value, hint, icon: Icon, tone, loading }) {
  const tones = {
    blood: { ring: "ring-blood-100", icon: "bg-blood-50 text-blood-700", text: "text-blood-700" },
    indigo: { ring: "ring-indigo-100", icon: "bg-indigo-50 text-indigo-700", text: "text-indigo-700" },
    emerald: { ring: "ring-emerald-100", icon: "bg-emerald-50 text-emerald-700", text: "text-emerald-700" },
    amber: { ring: "ring-amber-100", icon: "bg-amber-50 text-amber-700", text: "text-amber-700" },
  }[tone] || { ring: "ring-ink-100", icon: "bg-ink-50 text-ink-700", text: "text-ink-700" };
  return (
    <div className={`card p-4 sm:p-5 hover-lift ring-1 ${tones.ring}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-ink-500">{label}</div>
          <div className="text-2xl sm:text-3xl font-semibold text-ink-900 mt-1 tabular-nums">
            {loading ? <span className="shimmer inline-block h-7 w-12 rounded" /> : value}
          </div>
          {hint && (
            <div className="text-[11px] text-ink-500 mt-1 truncate">{hint}</div>
          )}
        </div>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${tones.icon}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}

function Card({ children, className = "" }) {
  return <section className={`card p-5 ${className}`}>{children}</section>;
}

function CardHeader({ icon, title, subtitle, right }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
      <div className="flex items-start gap-2 min-w-0">
        {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink-900">{title}</div>
          {subtitle && <div className="text-xs text-ink-500">{subtitle}</div>}
        </div>
      </div>
      {right}
    </div>
  );
}

function EmptyState({ icon, message }) {
  return (
    <div className="py-8 text-center text-sm text-ink-500 flex flex-col items-center gap-2">
      {icon}
      <span>{message}</span>
    </div>
  );
}

function QuickAction({ to, title, sub, icon, tone = "ink" }) {
  const tones = {
    blood: "bg-blood-50 text-blood-700 hover:bg-blood-100",
    indigo: "bg-indigo-50 text-indigo-700 hover:bg-indigo-100",
    emerald: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
    amber: "bg-amber-50 text-amber-700 hover:bg-amber-100",
    ink: "bg-ink-50 text-ink-700 hover:bg-ink-100",
  }[tone];
  return (
    <Link
      to={to}
      className={`flex items-center gap-3 rounded-xl px-4 py-3 transition ${tones} hover-lift`}
    >
      <div className="w-9 h-9 rounded-lg bg-white shadow-sm flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold truncate">{title}</div>
        <div className="text-[11px] opacity-80 truncate">{sub}</div>
      </div>
      <ChevronRight className="w-4 h-4 ml-auto opacity-60 shrink-0" />
    </Link>
  );
}

// Lazy import for Bot icon used inside QuickAction
function Bot(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2M20 14h2M15 13v2M9 13v2"/></svg>
  );
}
