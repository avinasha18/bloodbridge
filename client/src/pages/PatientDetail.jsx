import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Calendar, CheckCircle2, Loader2, Bell } from "lucide-react";
import PageHeader from "../components/ui/PageHeader";
import { Section } from "../components/ui/Card";
import { BloodGroupChip, Pill } from "../components/ui/Badge";
import { useAsync } from "../hooks/useAsync";
import { endpoints } from "../lib/api";
import { formatDate } from "../lib/format";

function toInputDate(d) {
  if (!d) return "";
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "";
    return dt.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

export default function PatientDetail() {
  const { id } = useParams();
  const patient = useAsync(() => endpoints.getPatient(id), [id]);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [saved, setSaved] = useState(false);

  const p = patient.data;
  const f = form ?? (p && {
    last_transfusion_date: toInputDate(p.last_transfusion_date),
    expected_next_transfusion_date: toInputDate(p.expected_next_transfusion_date),
    frequency_in_days: p.frequency_in_days ?? 21,
    notifications_enabled: p.notifications_enabled !== false,
  });

  async function saveCycle(e) {
    e.preventDefault();
    if (!f) return;
    setBusy(true);
    setToast(null);
    try {
      await endpoints.updatePatient(id, {
        last_transfusion_date: f.last_transfusion_date || null,
        expected_next_transfusion_date: f.expected_next_transfusion_date || null,
        frequency_in_days: Number(f.frequency_in_days) || null,
        notifications_enabled: f.notifications_enabled,
      });
      setToast({ kind: "ok", text: "Transfusion cycle saved. Patient portal and alerts will update." });
      setSaved(true);
      setForm(null);
      patient.refresh?.();
    } catch (err) {
      setToast({
        kind: "err",
        text: err?.response?.data?.detail || "Could not save.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (patient.loading || !p) {
    return <div className="text-sm text-ink-500">Loading patient…</div>;
  }

  const cycleSet = saved || !!(p.frequency_in_days && p.expected_next_transfusion_date);

  return (
    <div className="space-y-6">
      <Link to="/patients" className="inline-flex items-center text-sm text-ink-500 hover:underline">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to patients
      </Link>

      <PageHeader
        title={
          <span className="flex items-center gap-3 flex-wrap">
            {p.name || "Patient"}
            <BloodGroupChip bloodGroup={p.blood_group} />
            {p.self_registered ? <Pill tone="info">Self-registered</Pill> : <Pill>Manual</Pill>}
          </span>
        }
        subtitle={`${p.phone || "—"} · ${p.hospital_name || "—"} · ${p.city || "—"}`}
      />

      <Section
        title="Transfusion cycle"
        subtitle="Required for automatic reminders and proactive blood needs 5–7 days before each transfusion."
      >
        {!cycleSet && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
            This patient has no schedule yet — that's why their portal shows
            &quot;Ask the coordinator to enable automatic reminders.&quot;
          </div>
        )}

        <form onSubmit={saveCycle} className="grid sm:grid-cols-2 gap-4 max-w-2xl">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              Last transfusion date
            </span>
            <input
              type="date"
              className="input mt-1"
              value={f?.last_transfusion_date || ""}
              onChange={(e) => setForm({ ...f, last_transfusion_date: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              Next transfusion date
            </span>
            <input
              type="date"
              className="input mt-1"
              value={f?.expected_next_transfusion_date || ""}
              onChange={(e) =>
                setForm({ ...f, expected_next_transfusion_date: e.target.value })
              }
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              Cycle frequency (days)
            </span>
            <input
              type="number"
              min={1}
              max={90}
              className="input mt-1"
              value={f?.frequency_in_days ?? 21}
              onChange={(e) => setForm({ ...f, frequency_in_days: e.target.value })}
            />
            <span className="text-[11px] text-ink-500 mt-1 block">
              Thalassemia patients often need blood every 21–30 days.
            </span>
          </label>
          <label className="flex items-center gap-2 self-end pb-2">
            <input
              type="checkbox"
              checked={f?.notifications_enabled !== false}
              onChange={(e) =>
                setForm({ ...f, notifications_enabled: e.target.checked })
              }
              className="rounded"
            />
            <span className="text-sm text-ink-700">SMS reminders enabled</span>
          </label>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
              Save transfusion cycle
            </button>
            {cycleSet && (
              <span className="text-xs text-emerald-700 inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Active · next {formatDate(p.expected_next_transfusion_date)}
              </span>
            )}
          </div>
        </form>

        {toast && (
          <p
            className={`mt-3 text-sm ${toast.kind === "ok" ? "text-emerald-700" : "text-rose-700"}`}
          >
            {toast.text}
          </p>
        )}
      </Section>

      <Section title="What happens automatically">
        <ul className="text-sm text-ink-600 space-y-2 list-disc pl-5">
          <li>
            <strong>Patient portal</strong> shows transfusion countdown and progress bar.
          </li>
          <li>
            <strong>5–7 days before</strong> next date: proactive scheduler creates a blood
            need (run from Home → &quot;Run proactive scheduler&quot; or daily cron on AWS).
          </li>
          <li>
            <strong>1–3 days before</strong>: patient gets SMS reminder — &quot;Your next
            transfusion is in X days. We&apos;ll start arranging donors.&quot;
          </li>
          <li>
            Patient appears under <strong>Patients → Transfusions in the next 2 weeks</strong>.
          </li>
        </ul>
        <p className="mt-3 text-xs text-ink-500 inline-flex items-center gap-1.5">
          <Bell className="w-3.5 h-3.5" />
          After saving, open the patient portal at /me?phone={p.phone || "…"} to verify.
        </p>
      </Section>
    </div>
  );
}
