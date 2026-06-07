import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  Droplet,
  Heart,
  Hospital,
  PhoneCall,
  PlusCircle,
  Search,
  TimerReset,
  AlertCircle,
} from "lucide-react";
import { endpoints } from "../../lib/api";
import { usePoll } from "../../hooks/useAsync";
import Spinner from "../../components/ui/Spinner";
import { formatDate, formatDateTime, relativeTime } from "../../lib/format";
import AiAssistant from "./AiAssistant";

export default function PatientPortal() {
  const [searchParams, setSearchParams] = useSearchParams();
  const phoneParam = searchParams.get("phone") || "";
  if (!phoneParam) {
    return (
      <PhoneLookup
        onLookup={(p) => setSearchParams({ phone: p })}
      />
    );
  }
  return <PatientDashboard phone={phoneParam} />;
}

function PhoneLookup({ onLookup }) {
  const [phone, setPhone] = useState("");
  const navigate = useNavigate();
  return (
    <div className="max-w-md mx-auto">
      <header className="mb-6 text-center">
        <div className="inline-flex w-14 h-14 rounded-full bg-blood-50 items-center justify-center mb-3 animate-pop-in">
          <Heart className="w-7 h-7 text-blood-600 animate-heartbeat" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold text-ink-900">
          Patient dashboard
        </h1>
        <p className="text-sm text-ink-500 mt-2">
          See your active request, transfusion cycle, and full history.
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
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91…"
          />
        </label>
        <button className="btn-primary w-full" type="submit">
          <Search className="w-4 h-4" /> View my dashboard
        </button>
        <button
          type="button"
          className="btn-secondary w-full"
          onClick={() => navigate("/patient-register")}
        >
          <PlusCircle className="w-4 h-4" /> Register a new request
        </button>
      </form>
    </div>
  );
}

function PatientDashboard({ phone }) {
  const navigate = useNavigate();
  const { data, loading, error } = usePoll(
    () => endpoints.patientDashboardByPhone(phone),
    10_000,
    [phone],
  );

  if (loading && !data) {
    return <div className="flex justify-center py-16"><Spinner /></div>;
  }
  if (error || !data) {
    return (
      <div className="card p-8 text-center max-w-md mx-auto">
        <h2 className="font-semibold">Patient not found</h2>
        <p className="text-sm text-ink-500 mt-1">
          We don't have a patient with that mobile number yet.
        </p>
        <button
          className="btn-primary mt-4"
          onClick={() => navigate("/patient-register")}
        >
          Register a blood need
        </button>
      </div>
    );
  }

  const p = data;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-hero-blood text-white p-6 sm:p-8 shadow-card animate-fade-up overflow-hidden relative">
        <div className="relative z-10 grid sm:grid-cols-[1fr_auto] gap-4 items-end">
          <div>
            <div className="text-white/80 text-xs uppercase tracking-wide">
              Patient dashboard
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold mt-1">
              {p.patient_name || "Patient"}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="bg-white/20 px-2.5 py-1 rounded-full">{p.blood_group || "—"}</span>
              <span className="bg-white/15 px-2.5 py-1 rounded-full">{p.hospital_city || p.hospital_name || "—"}</span>
              {p.relation_to_patient && p.contact_name && (
                <span className="bg-white/15 px-2.5 py-1 rounded-full">
                  via {p.contact_name} ({p.relation_to_patient})
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-5xl sm:text-6xl font-bold tabular-nums">{p.fulfilled_count}</div>
            <div className="text-white/80 text-xs uppercase tracking-wide">
              {p.fulfilled_count === 1 ? "transfusion received" : "transfusions received"}
            </div>
          </div>
        </div>
      </section>

      {p.suggested_action && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-900 flex items-start gap-2 animate-fade-up">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {p.suggested_action}
        </div>
      )}

      {p.active_request ? (
        <ActiveRequestCard r={p.active_request} />
      ) : (
        <NoActiveCard onCreate={() => navigate("/patient-register")} />
      )}

      <TransfusionCycleCard p={p} />

      <section className="card p-5 animate-fade-up" style={{ animationDelay: "180ms" }}>
        <h2 className="font-semibold text-ink-900 mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-indigo-600" />
          Past blood needs
          <span className="text-xs text-ink-500 font-normal">
            · {p.history.length} total
          </span>
        </h2>
        {p.history.length === 0 ? (
          <div className="text-sm text-ink-500 italic">No past blood needs yet.</div>
        ) : (
          <ol className="relative border-l border-ink-200 pl-4 ml-2 space-y-4">
            {p.history.map((h, i) => (
              <HistoryItem
                key={h.request_id}
                entry={h}
                isLatest={i === 0}
              />
            ))}
          </ol>
        )}
      </section>

      <AiAssistant
        context="patient"
        requestId={p.active_request?.request_id}
        title="Ask about your blood request"
      />
    </div>
  );
}

function ActiveRequestCard({ r }) {
  return (
    <section
      className="card p-5 border-l-4 border-blood-500 animate-fade-up"
      style={{ animationDelay: "60ms" }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-wide text-blood-600">
            Current blood need
          </div>
          <h2 className="text-xl font-semibold mt-1 text-ink-900 flex items-center gap-2">
            <Droplet className="w-5 h-5 text-blood-600" />
            {r.blood_group} · {r.units_needed} unit{r.units_needed > 1 ? "s" : ""}
          </h2>
          <p className="text-sm text-ink-600 mt-1 flex items-center gap-1.5">
            <Hospital className="w-3.5 h-3.5 text-ink-400" /> {r.hospital_name || "Hospital"}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-ink-500">Status</div>
          <div className="px-3 py-1.5 mt-1 rounded-full text-sm font-medium bg-indigo-100 text-indigo-700">
            {r.status_label}
          </div>
        </div>
      </div>
      {r.donor_name ? (
        <div className="mt-3 bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-sm">
          <div className="text-emerald-800 font-medium flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" /> {r.donor_name} has agreed to help you
          </div>
          <p className="text-emerald-700/80 text-xs mt-1">
            A matched donor for this request — the coordinator will share hospital visit details.
          </p>
          {r.donor_phone && (
            <a
              href={`tel:${r.donor_phone}`}
              className="text-emerald-700 text-xs inline-flex items-center gap-1 mt-1 hover:underline"
            >
              <PhoneCall className="w-3 h-3" /> {r.donor_phone}
            </a>
          )}
        </div>
      ) : (
        <div className="mt-3 bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-sm text-indigo-800">
          Searching for a compatible donor — we'll text you when someone agrees to help.
        </div>
      )}
    </section>
  );
}

function NoActiveCard({ onCreate }) {
  return (
    <section className="card p-5 text-center animate-fade-up" style={{ animationDelay: "60ms" }}>
      <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
      <h3 className="font-semibold text-ink-900">No current blood need</h3>
      <p className="text-sm text-ink-500 mt-1">
        When you need blood again, register a new request here.
      </p>
      <button className="btn-primary mt-3" onClick={onCreate}>
        <PlusCircle className="w-4 h-4" /> Register a blood need
      </button>
    </section>
  );
}

function TransfusionCycleCard({ p }) {
  const has = !!(p.frequency_in_days && p.expected_next_transfusion_date);
  if (!has) {
    return (
      <section className="card p-5 animate-fade-up" style={{ animationDelay: "120ms" }}>
        <div className="text-xs uppercase tracking-wide text-ink-500">
          Transfusion cycle
        </div>
        <p className="text-sm text-ink-600 mt-1">
          Your transfusion schedule isn't set yet. Ask the coordinator to enable
          automatic reminders.
        </p>
      </section>
    );
  }
  const pct = Math.round(p.cycle_progress_pct ?? 0);
  const days = p.days_until_next;
  const overdue = days != null && days < 0;
  const soon = days != null && days >= 0 && days <= 3;
  const ringColor = overdue
    ? "bg-blood-500"
    : soon
      ? "bg-amber-500"
      : "bg-emerald-500";
  return (
    <section
      className="card p-5 animate-fade-up"
      style={{ animationDelay: "120ms" }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="font-semibold text-ink-900 flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-emerald-600" />
            Transfusion cycle
          </h2>
          <p className="text-xs text-ink-500 mt-0.5">
            Every {p.frequency_in_days} days · last transfusion{" "}
            {formatDate(p.last_transfusion_date)}
          </p>
        </div>
        <div className="text-right">
          <div
            className={`text-2xl font-semibold ${
              overdue
                ? "text-blood-700"
                : soon
                  ? "text-amber-700"
                  : "text-emerald-700"
            }`}
          >
            {overdue
              ? `${Math.abs(days)} day(s) overdue`
              : days === 0
                ? "Today"
                : `in ${days} day${days === 1 ? "" : "s"}`}
          </div>
          <div className="text-[11px] text-ink-500">
            Expected: {formatDate(p.expected_next_transfusion_date)}
          </div>
        </div>
      </div>
      <div className="w-full h-2.5 bg-ink-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${ringColor} transition-all duration-700`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <div className="text-[11px] text-ink-500 mt-1 flex items-center gap-1">
        <TimerReset className="w-3 h-3" /> Cycle {pct}% through
      </div>
    </section>
  );
}

function HistoryItem({ entry, isLatest }) {
  const completed = entry.status === "fulfilled";
  const failed = entry.status === "failed";
  const tone = completed
    ? "border-emerald-500"
    : failed
      ? "border-blood-500"
      : "border-indigo-500";
  return (
    <li className="relative">
      <span
        className={`absolute -left-[26px] top-1 w-4 h-4 rounded-full bg-white border-2 ${tone} ${isLatest ? "ring-4 ring-blood-100" : ""}`}
      />
      <div className="block w-full text-left bg-white rounded-lg p-3 -m-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <div className="font-medium text-ink-900 flex items-center gap-1.5">
              <Droplet className="w-3.5 h-3.5 text-blood-600" />
              {entry.blood_group} · {entry.units_needed} unit{entry.units_needed > 1 ? "s" : ""}
            </div>
            <div className="text-xs text-ink-600 mt-0.5">{entry.hospital_name}</div>
            {entry.donor_name && (
              <div className="text-xs text-emerald-700 mt-0.5">
                Matched donor: {entry.donor_name}
              </div>
            )}
          </div>
          <div className="text-right">
            <div
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                completed
                  ? "bg-emerald-100 text-emerald-800"
                  : failed
                    ? "bg-blood-100 text-blood-800"
                    : "bg-indigo-100 text-indigo-700"
              }`}
            >
              {entry.status_label}
            </div>
            <div className="text-[11px] text-ink-500 mt-1">
              {relativeTime(entry.created_at)}
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}
