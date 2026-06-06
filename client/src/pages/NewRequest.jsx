import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Droplets } from "lucide-react";
import PageHeader from "../components/ui/PageHeader";
import { Section } from "../components/ui/Card";
import Spinner from "../components/ui/Spinner";
import { endpoints } from "../lib/api";
import { BLOOD_GROUPS, URGENCY_LEVELS } from "../lib/format";

const HOSPITALS = [
  { name: "Apollo Hospitals, Hyderabad", lat: 17.4204, lon: 78.449 },
  { name: "KIMS Hospital, Secunderabad", lat: 17.44, lon: 78.498 },
  { name: "NIMS, Punjagutta", lat: 17.428, lon: 78.45 },
  { name: "Care Hospitals, Banjara Hills", lat: 17.415, lon: 78.44 },
  { name: "Yashoda Hospitals, Somajiguda", lat: 17.414, lon: 78.455 },
  { name: "Rainbow Children's, Banjara Hills", lat: 17.415, lon: 78.435 },
];

export default function NewRequest() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    blood_group: "O Negative",
    urgency: "critical",
    units_needed: 1,
    hospital: HOSPITALS[0].name,
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const h = HOSPITALS.find((x) => x.name === form.hospital);
    try {
      const r = await endpoints.createRequest({
        blood_group: form.blood_group,
        urgency: form.urgency,
        units_needed: Number(form.units_needed),
        hospital_name: h?.name,
        hospital_lat: h?.lat,
        hospital_lon: h?.lon,
        notes: form.notes || undefined,
      });
      navigate(`/requests/${r.id}`);
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="Create a Blood Need"
        subtitle="After you submit, the system automatically finds donors and sends them text messages"
      />
      <form onSubmit={submit}>
        <Section
          title="What blood is needed?"
          subtitle="Pick hospital and blood type. Top 5 nearby reliable donors will be texted automatically."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Blood Group">
              <select
                className="input"
                value={form.blood_group}
                onChange={(e) => setForm({ ...form, blood_group: e.target.value })}
              >
                {BLOOD_GROUPS.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </Field>
            <Field label="How urgent?">
              <select
                className="input"
                value={form.urgency}
                onChange={(e) => setForm({ ...form, urgency: e.target.value })}
              >
                {URGENCY_LEVELS.map((u) => (
                  <option key={u} value={u}>
                    {u === "critical" ? "Emergency" : u === "urgent" ? "Urgent" : "Routine"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Units Needed">
              <input
                type="number"
                min={1}
                max={10}
                className="input"
                value={form.units_needed}
                onChange={(e) => setForm({ ...form, units_needed: e.target.value })}
              />
            </Field>
            <Field label="Hospital">
              <select
                className="input"
                value={form.hospital}
                onChange={(e) => setForm({ ...form, hospital: e.target.value })}
              >
                {HOSPITALS.map((h) => (
                  <option key={h.name}>{h.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Notes" className="md:col-span-2">
              <textarea
                className="input"
                rows={3}
                placeholder="Optional context for the coordinator"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
          </div>

          {error && (
            <div className="mt-4 text-sm bg-blood-50 text-blood-700 border border-blood-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? <Spinner /> : <Droplets className="w-4 h-4" />}
              Create &amp; start SMS outreach
            </button>
          </div>
        </Section>
      </form>
    </div>
  );
}

function Field({ label, children, className }) {
  return (
    <label className={`block ${className || ""}`}>
      <span className="text-xs font-medium text-ink-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
