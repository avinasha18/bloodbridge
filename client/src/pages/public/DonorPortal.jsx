import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Award,
  Calendar,
  Clock,
  Droplet,
  Heart,
  PhoneCall,
  Search,
  ShieldCheck,
  TrendingUp,
  Users,
  CheckCircle2,
  Hospital,
  BarChart2,
} from "lucide-react";
import {
  BarChart,
  Bar as RechartBar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { endpoints } from "../../lib/api";
import { usePoll } from "../../hooks/useAsync";
import Spinner from "../../components/ui/Spinner";
import {
  URGENCY_LABELS,
  formatDate,
  formatDateTime,
  relativeTime,
} from "../../lib/format";
import AiAssistant from "./AiAssistant";

const BADGE_STYLE = {
  Platinum: "bg-gradient-to-r from-slate-300 to-slate-100 text-slate-900",
  Gold: "bg-gradient-to-r from-amber-400 to-yellow-300 text-amber-900",
  Silver: "bg-gradient-to-r from-zinc-300 to-zinc-100 text-zinc-900",
  Bronze: "bg-gradient-to-r from-orange-400 to-amber-300 text-orange-900",
};

export default function DonorPortal() {
  const [searchParams, setSearchParams] = useSearchParams();
  const phoneParam = searchParams.get("phone") || "";
  const [phone, setPhone] = useState(phoneParam);

  if (!phoneParam) {
    return (
      <PhoneLookup
        initialPhone={phone}
        onLookup={(p) => setSearchParams({ phone: p })}
      />
    );
  }
  return <DonorDashboard phone={phoneParam} />;
}

function PhoneLookup({ initialPhone, onLookup }) {
  const [phone, setPhone] = useState(initialPhone);
  return (
    <div className="max-w-md mx-auto">
      <header className="mb-6 text-center">
        <div className="inline-flex w-14 h-14 rounded-full bg-blood-50 items-center justify-center mb-3 animate-pop-in">
          <Heart className="w-7 h-7 text-blood-600 animate-heartbeat" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold text-ink-900">
          My donations
        </h1>
        <p className="text-sm text-ink-500 mt-2">
          See your history, eligibility, and open needs near you.
        </p>
      </header>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (phone.trim()) onLookup(phone.trim());
        }}
        className="card p-5 space-y-3 animate-fade-up"
      >
        <label className="block">
          <span className="text-xs font-medium text-ink-600">Mobile number</span>
          <input
            className="input mt-1"
            placeholder="+91…"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </label>
        <button className="btn-primary w-full" type="submit">
          <Search className="w-4 h-4" /> Find my profile
        </button>
        <p className="text-[11px] text-ink-500 text-center">
          New here? Use the <strong>Donate Blood</strong> tab to pick a need —
          we'll register you in one step.
        </p>
      </form>
    </div>
  );
}

function DonorDashboard({ phone }) {
  const { data, loading, error } = usePoll(
    () => endpoints.donorDashboardByPhone(phone),
    15_000,
    [phone],
  );
  const navigate = useNavigate();

  if (loading && !data) {
    return <div className="flex justify-center py-16"><Spinner /></div>;
  }
  if (error || !data) {
    return (
      <div className="card p-8 text-center max-w-md mx-auto animate-fade-up">
        <h2 className="font-semibold">Donor not found</h2>
        <p className="text-sm text-ink-500 mt-1">
          We could not find a donor with that number. Try a different one or
          register through <strong>Donate Blood</strong>.
        </p>
        <button className="btn-secondary mt-4" onClick={() => navigate("/donor?")}>
          Try another number
        </button>
      </div>
    );
  }

  const d = data;
  const acceptRate = d.total_accepts > 0
    ? Math.round((d.total_shows / d.total_accepts) * 100)
    : null;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-hero-blood text-white p-6 sm:p-8 shadow-card animate-fade-up overflow-hidden relative">
        <div className="relative z-10 grid sm:grid-cols-[1fr_auto] gap-4 items-end">
          <div>
            <div className="text-white/80 text-xs uppercase tracking-wide">Welcome back</div>
            <h1 className="text-2xl sm:text-3xl font-semibold mt-1">
              {d.name || "Blood Warrior"}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="bg-white/20 px-2.5 py-1 rounded-full">{d.blood_group || "—"}</span>
              <span className="bg-white/15 px-2.5 py-1 rounded-full">{d.city || "—"}</span>
              {d.badge && (
                <span className={`px-3 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1 ${BADGE_STYLE[d.badge]}`}>
                  <Award className="w-3.5 h-3.5" /> {d.badge} donor
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-5xl sm:text-6xl font-bold tabular-nums">
              {d.donations_till_date}
            </div>
            <div className="text-white/80 text-xs uppercase tracking-wide">
              total donations
            </div>
          </div>
        </div>
      </section>

      <div className="grid sm:grid-cols-3 gap-3 animate-fade-up" style={{animationDelay:"60ms"}}>
        <EligibilityCard d={d} />
        <MetricCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Reliability"
          value={`${Math.round(d.reliability_score * 100)}%`}
          progress={d.reliability_score}
          tone="indigo"
        />
        <MetricCard
          icon={<ShieldCheck className="w-4 h-4" />}
          label="Show-up rate"
          value={acceptRate != null ? `${acceptRate}%` : `${Math.round(d.showup_rate * 100)}%`}
          progress={d.showup_rate}
          tone="emerald"
          sub={d.total_accepts > 0
            ? `${d.total_shows}/${d.total_accepts} commitments kept`
            : "No history yet"}
        />
      </div>

      {d.open_compatible_needs.length > 0 && (
        <section className="card p-5 animate-fade-up" style={{animationDelay:"120ms"}}>
          <h2 className="font-semibold text-ink-900 mb-3 flex items-center gap-2">
            <Heart className="w-4 h-4 text-blood-600 animate-heartbeat" />
            People who need your blood right now
            <span className="text-xs text-ink-500 font-normal">
              · {d.open_compatible_needs.length} open
            </span>
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {d.open_compatible_needs.map((n) => (
              <div
                key={n.request_id}
                className="border border-ink-200 rounded-xl p-4 hover-lift cursor-pointer bg-white"
                onClick={() => navigate(`/donate#${n.request_id}`)}
              >
                <div className="flex items-start justify-between">
                  <div className="text-lg font-semibold text-blood-700">{n.blood_group}</div>
                  <span className="badge bg-orange-50 text-orange-700">
                    {URGENCY_LABELS[n.urgency] || n.urgency}
                  </span>
                </div>
                <div className="text-xs text-ink-500 mt-1 truncate">{n.hospital_name}</div>
                <div className="text-[11px] text-ink-400 mt-1">{relativeTime(n.created_at)}</div>
              </div>
            ))}
          </div>
          <button
            className="btn-secondary mt-3"
            onClick={() => navigate("/donate")}
          >
            Browse all open needs
          </button>
        </section>
      )}

      {d.donation_history.length > 0 && (
        <DonationByYear history={d.donation_history} />
      )}

      <section className="card p-5 animate-fade-up" style={{animationDelay:"180ms"}}>
        <h2 className="font-semibold text-ink-900 mb-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-indigo-600" />
          Your donation history
        </h2>
        {d.donation_history.length === 0 ? (
          <div className="text-sm text-ink-500 italic">
            No donations yet. When you accept a request, it will show up here.
          </div>
        ) : (
          <ol className="relative border-l border-ink-200 pl-4 ml-2 space-y-4">
            {d.donation_history.map((h, i) => (
              <DonationItem key={h.request_id + i} entry={h} />
            ))}
          </ol>
        )}
      </section>

      <AiAssistant context="donor" donorId={d.donor_id} title="Ask anything about donating" />
    </div>
  );
}

function MetricCard({ icon, label, value, progress = 0, tone = "indigo", sub }) {
  const color =
    tone === "emerald" ? "bg-emerald-500" :
    tone === "indigo" ? "bg-indigo-500" :
    "bg-blood-500";
  return (
    <div className="card p-4">
      <div className="flex items-center gap-1.5 text-xs text-ink-500">
        {icon} {label}
      </div>
      <div className="text-2xl font-semibold mt-1 text-ink-900">{value}</div>
      <div className="mt-2 w-full h-1.5 bg-ink-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-700`}
          style={{ width: `${Math.min(100, progress * 100)}%` }}
        />
      </div>
      {sub && <div className="text-[11px] text-ink-500 mt-1">{sub}</div>}
    </div>
  );
}

function EligibilityCard({ d }) {
  if (d.eligible_now) {
    return (
      <div className="card p-4 bg-emerald-50/60 border-emerald-200">
        <div className="flex items-center gap-1.5 text-xs text-emerald-700">
          <CheckCircle2 className="w-4 h-4" /> You can donate
        </div>
        <div className="text-2xl font-semibold mt-1 text-emerald-900">Eligible now</div>
        <div className="text-[11px] text-emerald-700 mt-1">
          {d.last_donation_date
            ? `Last donated ${formatDate(d.last_donation_date)}`
            : "Ready when you are"}
        </div>
      </div>
    );
  }
  const days = d.days_until_eligible;
  return (
    <div className="card p-4">
      <div className="flex items-center gap-1.5 text-xs text-ink-500">
        <Clock className="w-4 h-4" /> Eligibility
      </div>
      <div className="text-2xl font-semibold mt-1 text-ink-900">
        {days != null && days > 0 ? `In ${days} day${days > 1 ? "s" : ""}` : "—"}
      </div>
      <div className="text-[11px] text-ink-500 mt-1">
        Next eligible: {formatDate(d.next_eligible_date)}
      </div>
    </div>
  );
}

function DonationByYear({ history }) {
  const buckets = new Map();
  for (const h of history) {
    const dt = h.donated_at || h.reserved_at;
    if (!dt) continue;
    const m = new Date(dt);
    if (Number.isNaN(m.getTime())) continue;
    const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, (buckets.get(key) || 0) + (h.status === "fulfilled" ? 1 : 0.5));
  }
  const data = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, count]) => ({ month: month.slice(2), count }));
  if (data.length === 0) return null;
  return (
    <section className="card p-5 animate-fade-up" style={{ animationDelay: "150ms" }}>
      <h2 className="font-semibold text-ink-900 mb-2 flex items-center gap-2">
        <BarChart2 className="w-4 h-4 text-blood-600" />
        Activity over the last 12 months
      </h2>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -25 }}>
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <Tooltip
              cursor={{ fill: "rgba(225,29,72,0.05)" }}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <RechartBar
              dataKey="count"
              fill="#e11d48"
              radius={[6, 6, 0, 0]}
              animationDuration={900}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function DonationItem({ entry }) {
  const completed = entry.status === "fulfilled" || entry.assignment_role === "donated";
  const Icon = completed ? CheckCircle2 : Clock;
  const tone = completed ? "emerald" : "indigo";
  return (
    <li className="relative">
      <span
        className={`absolute -left-[26px] top-1 w-4 h-4 rounded-full bg-white border-2 ${
          tone === "emerald" ? "border-emerald-500" : "border-indigo-500"
        }`}
      />
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="font-medium text-ink-900 inline-flex items-center gap-1.5">
            <Icon className={`w-3.5 h-3.5 ${tone === "emerald" ? "text-emerald-600" : "text-indigo-600"}`} />
            {completed ? "Donated" : "Accepted"} · {entry.blood_group}
          </div>
          <div className="text-xs text-ink-600 mt-0.5 flex items-center gap-1.5">
            <Hospital className="w-3 h-3" /> {entry.hospital_name || "—"}
          </div>
          {entry.patient_initial && (
            <div className="text-xs text-ink-500 mt-0.5">For: {entry.patient_initial}</div>
          )}
        </div>
        <div className="text-xs text-ink-500 text-right">
          {entry.donated_at
            ? formatDate(entry.donated_at)
            : entry.reserved_at
              ? `Reserved ${relativeTime(entry.reserved_at)}`
              : "—"}
        </div>
      </div>
    </li>
  );
}
