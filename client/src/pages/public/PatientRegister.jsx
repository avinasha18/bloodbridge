import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, CheckCircle2 } from "lucide-react";
import { endpoints } from "../../lib/api";
import { BLOOD_GROUPS, URGENCY_LEVELS, URGENCY_LABELS } from "../../lib/format";
import Spinner from "../../components/ui/Spinner";

const RELATIONS = [
  { value: "self", label: "I am the patient" },
  { value: "parent", label: "Parent" },
  { value: "spouse", label: "Spouse / partner" },
  { value: "sibling", label: "Sibling" },
  { value: "friend", label: "Friend / attendant" },
  { value: "other", label: "Other" },
];

export default function PatientRegister() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    patient_name: "",
    blood_group: "",
    phone: "",
    contact_name: "",
    relation_to_patient: "self",
    units_needed: 1,
    urgency: "urgent",
    hospital_name: "",
    hospital_lat: null,
    hospital_lon: null,
    city: "Hyderabad",
    required_by: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) =>
          setForm((f) => ({
            ...f,
            hospital_lat: f.hospital_lat ?? p.coords.latitude,
            hospital_lon: f.hospital_lon ?? p.coords.longitude,
          })),
        () => {},
        { timeout: 4000 },
      );
    }
  }, []);

  const onChange = (field) => (e) => {
    const value = e.target?.value ?? e;
    setForm((f) => ({ ...f, [field]: value }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        units_needed: Number(form.units_needed) || 1,
        hospital_lat: form.hospital_lat ? Number(form.hospital_lat) : null,
        hospital_lon: form.hospital_lon ? Number(form.hospital_lon) : null,
        required_by: form.required_by ? new Date(form.required_by).toISOString() : null,
      };
      const r = await endpoints.patientRegister(payload);
      setResult(r);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="max-w-md mx-auto card p-8 text-center">
        <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500 mb-4" />
        <h2 className="text-xl font-semibold text-ink-900">
          Request received
        </h2>
        <p className="text-sm text-ink-600 mt-2">
          We are now finding donors. You will get SMS updates as things move.
        </p>
        <div className="mt-6 space-y-2">
          <button
            className="btn-primary w-full"
            onClick={() => navigate(`/track/${result.request_id}`)}
          >
            Track this request
          </button>
          <a
            href={result.track_url}
            className="btn-secondary w-full"
            target="_blank"
            rel="noreferrer"
          >
            Open tracking link
          </a>
        </div>
        <div className="text-[11px] text-ink-500 mt-4 break-all">
          {result.track_url}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <header className="mb-6">
        <div className="inline-flex items-center gap-2 bg-blood-50 text-blood-700 px-3 py-1 rounded-full text-xs font-medium mb-2">
          <Heart className="w-3.5 h-3.5" /> Patient / family registration
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold text-ink-900">
          Tell us what you need
        </h1>
        <p className="text-sm text-ink-500 mt-2 max-w-prose">
          You will receive SMS updates at every step — when a donor accepts,
          who they are, when they confirm, and when the donation is done.
        </p>
      </header>

      <form onSubmit={submit} className="card p-6 space-y-5">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-ink-800">Patient details</h3>
          <Field label="Patient name" required>
            <input
              className="input"
              required
              value={form.patient_name}
              onChange={onChange("patient_name")}
              placeholder="e.g. Ramesh K"
            />
          </Field>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Blood group needed" required>
              <select
                className="input"
                required
                value={form.blood_group}
                onChange={onChange("blood_group")}
              >
                <option value="">Select…</option>
                {BLOOD_GROUPS.map((bg) => (
                  <option key={bg} value={bg}>{bg}</option>
                ))}
              </select>
            </Field>
            <Field label="Units needed">
              <input
                className="input"
                type="number"
                min={1}
                max={10}
                value={form.units_needed}
                onChange={onChange("units_needed")}
              />
            </Field>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-ink-800">
            Your contact (for SMS updates)
          </h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Mobile number" required>
              <input
                className="input"
                required
                value={form.phone}
                onChange={onChange("phone")}
                placeholder="+91…"
              />
            </Field>
            <Field label="Your name">
              <input
                className="input"
                value={form.contact_name}
                onChange={onChange("contact_name")}
                placeholder="Your full name"
              />
            </Field>
          </div>
          <Field label="Relation to patient">
            <select
              className="input"
              value={form.relation_to_patient}
              onChange={onChange("relation_to_patient")}
            >
              {RELATIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </Field>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-ink-800">Hospital</h3>
          <Field label="Hospital name" required>
            <input
              className="input"
              required
              value={form.hospital_name}
              onChange={onChange("hospital_name")}
              placeholder="e.g. Apollo Hospitals, Jubilee Hills"
            />
          </Field>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="City">
              <input
                className="input"
                value={form.city}
                onChange={onChange("city")}
              />
            </Field>
            <Field label="When is it needed by?">
              <input
                className="input"
                type="datetime-local"
                value={form.required_by}
                onChange={onChange("required_by")}
              />
            </Field>
          </div>
          <Field label="Urgency">
            <div className="flex flex-wrap gap-2">
              {URGENCY_LEVELS.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, urgency: u }))}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                    form.urgency === u
                      ? u === "critical"
                        ? "bg-blood-600 text-white border-blood-600"
                        : u === "urgent"
                        ? "bg-orange-500 text-white border-orange-500"
                        : "bg-ink-700 text-white border-ink-700"
                      : "bg-white text-ink-700 border-ink-200 hover:border-ink-300"
                  }`}
                >
                  {URGENCY_LABELS[u] || u}
                </button>
              ))}
            </div>
          </Field>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-ink-800">
            Anything else? (optional)
          </h3>
          <Field label="Notes for the coordinator">
            <textarea
              className="input min-h-[80px]"
              value={form.notes}
              onChange={onChange("notes")}
              placeholder="e.g. Patient is in ICU, blood needed before 8 AM"
            />
          </Field>
        </section>

        {error && (
          <div className="text-sm text-blood-700 bg-blood-50 border border-blood-100 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? <Spinner /> : "Register and start finding donors"}
        </button>
        <p className="text-[11px] text-ink-500 text-center">
          By registering you agree to receive SMS updates about this request.
        </p>
      </form>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink-600">
        {label}{required ? " *" : ""}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
