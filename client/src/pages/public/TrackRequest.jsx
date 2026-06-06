import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { usePoll } from "../../hooks/useAsync";
import { endpoints } from "../../lib/api";
import Spinner from "../../components/ui/Spinner";
import AiAssistant from "./AiAssistant";
import {
  CheckCircle2,
  Clock,
  Hospital,
  MapPin,
  MessageSquare,
  PhoneCall,
  Search,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import { formatDateTime, relativeTime } from "../../lib/format";
import { useState } from "react";

const STAGES = [
  { key: "pending", label: "Received", icon: Clock },
  { key: "matching", label: "Donors found", icon: Search },
  { key: "outreach_sent", label: "Contacting", icon: MessageSquare },
  { key: "reserved", label: "Donor confirmed", icon: UserCheck },
  { key: "fulfilled", label: "Done", icon: CheckCircle2 },
];

function stageIndex(status) {
  if (status === "confirmed") return 3;
  if (status === "failed") return -1;
  const idx = STAGES.findIndex((s) => s.key === status);
  return idx === -1 ? 0 : idx;
}

export default function TrackRequest() {
  const params = useParams();
  const requestId = params.id;
  if (!requestId) return <TrackByPhonePage />;
  return <TrackById requestId={requestId} />;
}

function TrackById({ requestId }) {
  const navigate = useNavigate();
  const { data, loading, error } = usePoll(
    () => endpoints.trackRequest(requestId),
    8_000,
    [requestId],
  );

  if (loading && !data) {
    return <div className="flex justify-center py-16"><Spinner /></div>;
  }
  if (error) {
    return (
      <div className="card p-8 text-center">
        <XCircle className="w-10 h-10 mx-auto text-blood-500 mb-3" />
        <h2 className="font-semibold">Request not found</h2>
        <p className="text-sm text-ink-500 mt-1">
          The link may be incorrect. Try looking up by your mobile number.
        </p>
        <button
          className="btn-secondary mt-4"
          onClick={() => navigate("/track")}
        >
          Find by phone
        </button>
      </div>
    );
  }
  const r = data;
  const active = stageIndex(r.status);
  const failed = r.status === "failed";

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-ink-500">
            Blood request
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-ink-900">
            {r.blood_group} · {r.units_needed} unit{r.units_needed > 1 ? "s" : ""}
          </h1>
          <p className="text-sm text-ink-600 mt-1 flex items-center gap-1.5">
            <Hospital className="w-3.5 h-3.5 text-ink-400" /> {r.hospital_name || "Hospital"}
            {r.hospital_city ? <span className="text-ink-400">· {r.hospital_city}</span> : null}
          </p>
        </div>
        <div className={`px-3 py-1.5 rounded-full text-sm font-medium animate-pop-in ${
          failed
            ? "bg-blood-100 text-blood-700"
            : r.status === "fulfilled"
            ? "bg-emerald-100 text-emerald-700"
            : "bg-indigo-100 text-indigo-700"
        }`}>
          {r.status_label}
        </div>
      </header>

      <section className="card p-5">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          {STAGES.map((s, i) => {
            const Icon = s.icon;
            const done = !failed && active > i && r.status !== "failed";
            const current = !failed && active === i;
            return (
              <div key={s.key} className="flex-1 min-w-[110px] flex items-center gap-2">
                <div
                  className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center border-2 transition-all duration-500 ${
                    done
                      ? "bg-emerald-500 border-emerald-500 text-white scale-100"
                      : current
                      ? "bg-blood-50 border-blood-500 text-blood-700 ring-4 ring-blood-100 animate-pulse-soft"
                      : "bg-ink-50 border-ink-200 text-ink-400"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className={`text-xs font-medium ${current ? "text-blood-700" : done ? "text-emerald-700" : "text-ink-500"}`}>
                  {s.label}
                </div>
              </div>
            );
          })}
        </div>
        {r.status_detail && !failed && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-sm text-indigo-900">
            {r.status_detail}
          </div>
        )}
        {r.donors_ranked > 0 && r.status === "matching" && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Stat label="Donors ranked" value={r.donors_ranked} tone="emerald" />
            <Stat label="Texted" value={r.donors_contacted} tone="indigo" />
            <Stat label="Accepted" value={r.donors_accepted} tone="blood" />
          </div>
        )}
        {failed && (
          <div className="bg-blood-50 border border-blood-100 rounded-lg p-3 text-sm text-blood-800">
            <strong>Couldn't arrange a donor.</strong> {r.failure_reason || "Please contact the hospital or call us for help."}
          </div>
        )}
      </section>

      <section className="card p-5">
        <h2 className="font-semibold text-ink-900 mb-3 flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-emerald-600" />
          Donor
        </h2>
        {r.assigned_donor ? (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="font-semibold text-ink-900 text-lg">
                  {r.assigned_donor.name || "A donor"}
                </div>
                <div className="text-sm text-ink-600">
                  {r.assigned_donor.blood_group}
                  {r.assigned_donor.distance_km != null && r.assigned_donor.distance_km >= 0
                    ? ` · ${r.assigned_donor.distance_km.toFixed(1)} km from hospital`
                    : ""}
                </div>
              </div>
              {r.assigned_donor.phone && (
                <a
                  href={`tel:${r.assigned_donor.phone}`}
                  className="btn-secondary"
                >
                  <PhoneCall className="w-4 h-4" /> {r.assigned_donor.phone}
                </a>
              )}
            </div>
            {r.assigned_donor.accepted_at && (
              <div className="text-xs text-ink-500">
                Accepted {relativeTime(r.assigned_donor.accepted_at)}
              </div>
            )}
            {r.standby_donors.length > 0 && (
              <div className="border-t border-ink-100 pt-3 mt-3">
                <div className="text-xs text-ink-500 mb-2 flex items-center gap-1.5">
                  <Users className="w-3 h-3" />
                  {r.standby_donors.length} backup donor{r.standby_donors.length > 1 ? "s" : ""} on standby
                </div>
                <div className="text-xs text-ink-600 flex flex-wrap gap-1.5">
                  {r.standby_donors.map((s, i) => (
                    <span key={i} className="bg-ink-50 rounded px-2 py-0.5">
                      {s.name || "Volunteer"} ({s.blood_group})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-ink-500">
            We are actively reaching out to donors. You will be notified by SMS when someone accepts.
          </div>
        )}
      </section>

      <section className="card p-5">
        <h2 className="font-semibold text-ink-900 mb-3 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-indigo-600" />
          Updates to you
        </h2>
        {r.sms_to_patient.length === 0 ? (
          <div className="text-sm text-ink-500">
            No SMS sent yet. Updates will appear here as soon as something happens.
          </div>
        ) : (
          <ul className="space-y-3">
            {r.sms_to_patient.map((n, i) => (
              <li key={i} className="border-l-2 border-blood-200 pl-3">
                <div className="text-sm font-medium text-ink-800">{n.title}</div>
                <div className="text-sm text-ink-600">{n.body}</div>
                <div className="text-[11px] text-ink-400 mt-0.5">
                  {formatDateTime(n.sent_at)}
                  {n.delivery_error ? ` · ${n.delivery_error}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <h2 className="font-semibold text-ink-900 mb-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-ink-500" />
          Outreach progress
        </h2>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <Stat label="Donors ranked" value={r.donors_ranked || 0} tone="emerald" />
          <Stat label="Texted" value={r.donors_contacted} tone="indigo" />
          <Stat label="Accepted" value={r.donors_accepted} tone="blood" />
        </div>
        {r.donors_ranked > 0 && r.donors_contacted === 0 && (
          <div className="text-xs text-ink-500 mt-3">
            We've identified compatible donors near your hospital — they will be
            texted any moment now.
          </div>
        )}
      </section>

      {r.hospital_name && (
        <section className="card p-5">
          <h2 className="font-semibold text-ink-900 mb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-ink-500" />
            Hospital
          </h2>
          <div className="text-sm text-ink-700">{r.hospital_name}</div>
        </section>
      )}

      <AiAssistant
        context="patient"
        requestId={requestId}
        title="Questions about this request?"
      />
    </div>
  );
}

function Stat({ label, value, tone = "ink" }) {
  const toneClass =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-800"
      : tone === "indigo"
      ? "bg-indigo-50 text-indigo-800"
      : tone === "blood"
      ? "bg-blood-50 text-blood-800"
      : "bg-ink-50 text-ink-900";
  return (
    <div className={`rounded-lg p-3 ${toneClass}`}>
      <div className="text-[11px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-2xl font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function TrackByPhonePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [phone, setPhone] = useState(searchParams.get("phone") || "");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await endpoints.trackByPhone(phone.trim());
      setResults(data);
      if (data.requests.length === 1) {
        navigate(`/track/${data.requests[0].request_id}`);
      }
    } catch (err) {
      setError(err?.response?.data?.detail || "No request found for that number");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-semibold text-ink-900">Track your request</h1>
      <p className="text-sm text-ink-500 mt-1">
        Enter the mobile number you registered with.
      </p>
      <form onSubmit={submit} className="card p-5 mt-5 space-y-3">
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
        {error && (
          <div className="text-sm text-blood-700 bg-blood-50 border border-blood-100 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? <Spinner /> : "Find my request"}
        </button>
      </form>
      {results?.requests?.length > 0 && (
        <div className="mt-6 space-y-2">
          <div className="text-xs text-ink-500">
            {results.requests.length} request{results.requests.length > 1 ? "s" : ""} for {results.patient_name || phone}
          </div>
          {results.requests.map((r) => (
            <button
              key={r.request_id}
              onClick={() => navigate(`/track/${r.request_id}`)}
              className="card p-3 w-full text-left hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">{r.blood_group}</span>
                <span className="text-xs text-ink-500">{r.status_label}</span>
              </div>
              <div className="text-xs text-ink-500 mt-0.5">{r.hospital_name || "Hospital"}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
