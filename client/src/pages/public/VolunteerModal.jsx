import { useEffect, useState } from "react";
import { X, CheckCircle2, Heart } from "lucide-react";
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
      className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-panel animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blood-50 text-blood-600 flex items-center justify-center">
              <Heart className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] text-ink-400 font-medium uppercase tracking-wider">Donating</div>
              <div className="font-semibold text-ink-900 text-sm">
                {need.blood_group} · {need.hospital_name?.split(",")[0] || "Hospital"}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {done ? (
          <div className="p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-semibold text-ink-900">
              {done.status === "assigned"
                ? "You are the confirmed donor"
                : "Thank you — saved"}
            </h3>
            <p className="text-sm text-ink-500 mt-2 leading-relaxed">{done.detail}</p>
            <button
              className="w-full mt-6 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blood-600 text-white text-sm font-medium hover:bg-blood-700 transition-colors"
              onClick={() => onSuccess?.(done)}
            >
              View my donations
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="p-5 space-y-4">
            <Field label="Full name">
              <input
                className="input"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                autoFocus
              />
            </Field>
            <Field label="Mobile number">
              <input
                className="input"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91…"
                type="tel"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
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
            </div>

            <p className="text-[11px] text-ink-400 leading-relaxed">
              By confirming you consent to be contacted by the coordinator for this donation.
            </p>

            {error && (
              <div className="text-sm text-blood-700 bg-blood-50 border border-blood-100 rounded-xl px-3.5 py-2.5 animate-scale-in">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blood-600 text-white text-sm font-semibold hover:bg-blood-700 active:scale-[0.98] transition-all duration-150 disabled:opacity-50"
            >
              {submitting ? <Spinner /> : <Heart className="w-4 h-4" />}
              {submitting ? "Submitting…" : "Confirm — I'll donate"}
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
      <span className="text-xs font-medium text-ink-600 mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}
