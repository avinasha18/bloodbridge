import { useEffect, useState } from "react";
import { X, CheckCircle2 } from "lucide-react";
import { endpoints } from "../../lib/api";
import { BLOOD_GROUPS } from "../../lib/format";
import Spinner from "../../components/ui/Spinner";

export default function VolunteerModal({ need, onClose, onSuccess }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [bg, setBg] = useState(
    need.compatible_groups?.[0] || need.blood_group || "",
  );
  const [city, setCity] = useState(need.hospital_city || "Hyderabad");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [coords, setCoords] = useState(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setCoords({ lat: p.coords.latitude, lon: p.coords.longitude }),
        () => {},
        { timeout: 4000 },
      );
    }
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        request_id: need.request_id,
        name: name.trim(),
        phone: phone.trim(),
        blood_group: bg,
        city,
        latitude: coords?.lat,
        longitude: coords?.lon,
        consent_given: true,
        immediately_accept: true,
      };
      const result = await endpoints.volunteer(payload);
      setDone(result);
    } catch (err) {
      const msg = err?.response?.data?.detail || err.message || "Failed";
      setError(typeof msg === "string" ? msg : "Could not submit");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-ink-900/50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 border-b border-ink-100">
          <div>
            <div className="text-xs text-ink-500">You are donating to</div>
            <div className="font-semibold text-ink-900">
              {need.blood_group} · {need.hospital_name || "Hospital"}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 -m-1 text-ink-500 hover:text-ink-800"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {done ? (
          <div className="p-6 text-center">
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 mb-3" />
            <h3 className="font-semibold text-ink-900">
              {done.status === "assigned"
                ? "You are the confirmed donor"
                : "Thank you — saved"}
            </h3>
            <p className="text-sm text-ink-600 mt-2">{done.detail}</p>
            <button
              className="btn-primary w-full mt-5"
              onClick={() => onSuccess?.(done)}
            >
              Track this request
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="p-5 space-y-3">
            <Field label="Full name">
              <input
                className="input"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </Field>
            <Field label="Mobile number">
              <input
                className="input"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91…"
              />
            </Field>
            <Field label="Your blood group">
              <select
                className="input"
                value={bg}
                onChange={(e) => setBg(e.target.value)}
                required
              >
                {(need.compatible_groups?.length
                  ? need.compatible_groups
                  : BLOOD_GROUPS
                ).map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </Field>
            <Field label="City">
              <input
                className="input"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </Field>
            <p className="text-[11px] text-ink-500">
              By tapping confirm you consent to be contacted by the coordinator
              for this donation only.
            </p>
            {error && (
              <div className="text-sm text-blood-700 bg-blood-50 border border-blood-100 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full"
            >
              {submitting ? <Spinner /> : "Confirm — I'll donate"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
