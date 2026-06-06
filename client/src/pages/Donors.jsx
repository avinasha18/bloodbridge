import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  AlertTriangle,
  Plus,
  Link as LinkIcon,
  Send,
  ShieldAlert,
  X,
} from "lucide-react";
import PageHeader from "../components/ui/PageHeader";
import { Section } from "../components/ui/Card";
import { BloodGroupChip, Pill } from "../components/ui/Badge";
import { Table, THead, TH, TR, TD, Empty } from "../components/ui/Table";
import Spinner from "../components/ui/Spinner";
import { useAsync } from "../hooks/useAsync";
import { endpoints } from "../lib/api";
import { BLOOD_GROUPS, formatDate } from "../lib/format";

export default function Donors() {
  const [filters, setFilters] = useState({
    blood_group: "",
    eligibility_status: "",
    active_status: "",
    search: "",
  });
  const [offset, setOffset] = useState(0);
  const limit = 25;
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const params = {
    limit,
    offset,
    ...(filters.blood_group && { blood_group: filters.blood_group }),
    ...(filters.eligibility_status && { eligibility_status: filters.eligibility_status }),
    ...(filters.active_status && { active_status: filters.active_status }),
    ...(filters.search && { search: filters.search }),
  };

  const { data, loading } = useAsync(
    () => endpoints.listDonors(params),
    [filters.blood_group, filters.eligibility_status, filters.active_status, filters.search, offset, refreshKey],
  );

  const incomplete = useAsync(() => endpoints.incompleteDonors(50), [refreshKey]);

  function flash(text, kind = "ok") {
    setToast({ text, kind });
    setTimeout(() => setToast(null), 6_000);
  }

  async function sendProfileLink(donorId) {
    try {
      const r = await endpoints.sendProfileLink(donorId);
      flash(`Profile-completion SMS sent to ${r.sent_to_phone}. Link: ${r.link}`);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      flash(e?.response?.data?.detail || e.message, "err");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Donor List"
        subtitle="All registered donors. When a blood need is created, the system picks the best ones from here and texts them."
        actions={
          <>
            <button className="btn-secondary" onClick={() => setModal("invite")}>
              <LinkIcon className="w-4 h-4" />
              New donor sign-up link
            </button>
            <button className="btn-primary" onClick={() => setModal("add")}>
              <Plus className="w-4 h-4" />
              Add donor manually
            </button>
          </>
        }
      />

      {toast && (
        <div
          className={`text-sm px-4 py-3 rounded-xl border animate-scale-in ${
            toast.kind === "ok"
              ? "bg-emerald-50 border-emerald-200/80 text-emerald-800"
              : "bg-blood-50 border-blood-200/80 text-blood-800"
          }`}
        >
          {toast.text}
        </div>
      )}

      {(incomplete.data?.length || 0) > 0 && (
        <Section
          title={`${incomplete.data.length} donors with incomplete profiles`}
          subtitle="Missing blood group or location. SMS them a one-tap link to fill it in."
        >
          <ul className="divide-y divide-ink-100/80">
            {incomplete.data.slice(0, 8).map((d) => (
              <li key={d.id} className="flex items-center justify-between py-3 text-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <Link to={`/donors/${d.id}`} className="font-medium hover:text-blood-600 transition-colors truncate">
                    {d.name || d.id.slice(0, 8)}
                  </Link>
                  <span className="text-xs text-ink-400 font-mono shrink-0">{d.phone}</span>
                  {d.blood_group ? (
                    <BloodGroupChip bloodGroup={d.blood_group} size="sm" />
                  ) : (
                    <Pill tone="warn">no blood group</Pill>
                  )}
                  {(!d.latitude || !d.longitude) && (
                    <Pill tone="warn">no location</Pill>
                  )}
                </div>
                <button
                  className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blood-600 text-white hover:bg-blood-700 transition-colors shrink-0 ml-3"
                  onClick={() => sendProfileLink(d.id)}
                >
                  <Send className="w-3 h-3" />
                  Send Link
                </button>
              </li>
            ))}
            {incomplete.data.length > 8 && (
              <li className="text-xs text-ink-400 py-3">
                + {incomplete.data.length - 8} more
              </li>
            )}
          </ul>
        </Section>
      )}

      <Section title="Filters" noPadding>
        <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3 bg-ink-50/40">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Search</label>
            <div className="relative mt-1.5">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                className="input pl-10"
                placeholder="name or phone"
                value={filters.search}
                onChange={(e) => {
                  setOffset(0);
                  setFilters({ ...filters, search: e.target.value });
                }}
              />
            </div>
          </div>
          <Select
            label="Blood Group"
            value={filters.blood_group}
            options={BLOOD_GROUPS}
            onChange={(v) => { setOffset(0); setFilters({ ...filters, blood_group: v }); }}
          />
          <Select
            label="Eligibility"
            value={filters.eligibility_status}
            options={["eligible", "not eligible"]}
            onChange={(v) => { setOffset(0); setFilters({ ...filters, eligibility_status: v }); }}
          />
          <Select
            label="Active Status"
            value={filters.active_status}
            options={["Active", "Inactive"]}
            onChange={(v) => { setOffset(0); setFilters({ ...filters, active_status: v }); }}
          />
        </div>
      </Section>

      <Section
        title={`${data?.total?.toLocaleString() ?? "—"} donors`}
        subtitle="Sorted by overall score — click a name for full profile"
        noPadding
      >
        {loading ? (
          <Empty message="Loading…" />
        ) : data?.items?.length === 0 ? (
          <Empty message="No donors match the current filters" />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Name</TH>
                  <TH>Blood type</TH>
                  <TH>Mobile</TH>
                  <TH>ML trust</TH>
                  <TH>Show-up</TH>
                  <TH>Overall</TH>
                  <TH>Times donated</TH>
                  <TH>Profile complete?</TH>
                  <TH>Active?</TH>
                </tr>
              </THead>
              <tbody>
                {data?.items?.map((d) => (
                  <TR key={d.id}>
                    <TD>
                      <Link to={`/donors/${d.id}`} className="hover:text-blood-600 font-medium transition-colors">
                        {d.name || d.id.slice(0, 8)}
                      </Link>
                      <div className="text-[11px] text-ink-400 font-normal mt-0.5">{d.city || "—"} · {d.role || d.donor_type || ""}</div>
                    </TD>
                    <TD>
                      {d.blood_group
                        ? <BloodGroupChip bloodGroup={d.blood_group} size="sm" />
                        : <Pill tone="warn" dot>Unknown</Pill>}
                    </TD>
                    <TD muted className="font-mono">{d.phone || "—"}</TD>
                    <TD><MiniBar value={Number(d.reliability_score) || 0} /></TD>
                    <TD><MiniBar value={Number(d.showup_rate) || 0} tone="emerald" /></TD>
                    <TD><MiniBar value={Number(d.overall_score) || 0} tone="amber" /></TD>
                    <TD>
                      <div className="flex flex-col">
                        <span className="tabular-nums">{d.donations_till_date}</span>
                        {d.calls_to_donations_ratio != null && d.calls_to_donations_ratio > 3 && (
                          <span className="text-[10px] text-blood-600 inline-flex items-center gap-1 mt-0.5">
                            <AlertTriangle className="w-3 h-3" />
                            over-contacted
                          </span>
                        )}
                      </div>
                    </TD>
                    <TD>
                      {d.profile_complete
                        ? <Pill tone="success" dot>Complete</Pill>
                        : (
                          <button
                            onClick={() => sendProfileLink(d.id)}
                            className="inline-flex items-center gap-1 text-[11px] text-blood-600 hover:text-blood-700 transition-colors"
                            title="Send profile-completion SMS link"
                          >
                            <ShieldAlert className="w-3 h-3" />
                            incomplete · send link
                          </button>
                        )}
                    </TD>
                    <TD>
                      {d.user_donation_active_status === "Active" ? (
                        <Pill tone="success">Active</Pill>
                      ) : (
                        <Pill tone="warn">Inactive</Pill>
                      )}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>

            <div className="flex justify-between items-center px-5 py-4 border-t border-ink-100/80 text-sm">
              <span className="text-ink-500">
                Showing {offset + 1}–{offset + (data?.items?.length || 0)} of {data?.total}
              </span>
              <div className="flex gap-2">
                <button
                  className="btn-secondary"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                >
                  Previous
                </button>
                <button
                  className="btn-secondary"
                  disabled={(data?.items?.length || 0) < limit}
                  onClick={() => setOffset(offset + limit)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </Section>

      {modal === "add" && (
        <AddDonorModal
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            setRefreshKey((k) => k + 1);
            flash("Donor added");
          }}
        />
      )}
      {modal === "invite" && (
        <SelfRegisterModal
          onClose={() => setModal(null)}
          onDone={(msg) => { setModal(null); flash(msg); }}
        />
      )}
    </div>
  );
}

function MiniBar({ value = 0, tone = "blood" }) {
  const color =
    tone === "emerald" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : "bg-blood-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-ink-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${value * 100}%` }} />
      </div>
      <span className="text-[11px] font-mono text-ink-600 tabular-nums">{value.toFixed(2)}</span>
    </div>
  );
}

function Select({ label, value, options, onChange }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">{label}</span>
      <select
        className="input mt-1.5"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-ink-900/30 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-panel max-w-md w-full p-6 animate-scale-in">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-ink-900">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AddDonorModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    blood_group: "O Positive",
    gender: "",
    city: "Hyderabad",
    latitude: "",
    longitude: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const payload = {
        name: form.name,
        phone: form.phone,
        blood_group: form.blood_group,
        gender: form.gender || null,
        city: form.city,
        latitude: form.latitude ? parseFloat(form.latitude) : null,
        longitude: form.longitude ? parseFloat(form.longitude) : null,
        consent_given: true,
        preferred_channel: "sms",
        language_preference: "en",
      };
      await endpoints.createDonor(payload);
      onSaved();
    } catch (e) {
      setErr(e?.response?.data?.detail || e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Add donor" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3.5 text-sm">
        <Field label="Full name" required value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <Field label="Mobile number" required value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="+91…" />
        <label className="block">
          <span className="text-xs font-medium text-ink-600">Blood Group</span>
          <select
            className="input mt-1.5"
            value={form.blood_group}
            onChange={(e) => setForm({ ...form, blood_group: e.target.value })}
          >
            {BLOOD_GROUPS.map((b) => <option key={b}>{b}</option>)}
          </select>
        </label>
        <Field label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Latitude" value={form.latitude} onChange={(v) => setForm({ ...form, latitude: v })} placeholder="17.4204" />
          <Field label="Longitude" value={form.longitude} onChange={(v) => setForm({ ...form, longitude: v })} placeholder="78.4490" />
        </div>
        <label className="block">
          <span className="text-xs font-medium text-ink-600">Gender</span>
          <select className="input mt-1.5" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
            <option value="">Prefer not to say</option>
            <option>Male</option>
            <option>Female</option>
            <option>Other</option>
          </select>
        </label>
        {err && <div className="text-xs text-blood-600 bg-blood-50 rounded-lg px-3 py-2">{err}</div>}
        <div className="flex justify-end gap-2.5 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? <Spinner /> : "Save donor"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SelfRegisterModal({ onClose, onDone }) {
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await endpoints.selfRegisterInvite(phone || null);
      setResult(r);
    } catch (e) {
      setErr(e?.response?.data?.detail || e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Generate self-register invite" onClose={onClose}>
      {!result ? (
        <form onSubmit={submit} className="space-y-3.5 text-sm">
          <p className="text-ink-500 text-xs leading-relaxed">
            Generates a tokenised registration link. If you provide a phone number we'll
            SMS the link immediately; otherwise you can copy/paste it.
          </p>
          <Field label="Phone (optional)" value={phone} onChange={setPhone} placeholder="+91…" />
          {err && <div className="text-xs text-blood-600 bg-blood-50 rounded-lg px-3 py-2">{err}</div>}
          <div className="flex justify-end gap-2.5 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? <Spinner /> : "Generate"}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-3.5 text-sm">
          <p className="text-emerald-700 font-medium">
            {result.sent_to_phone
              ? `Sent to ${result.sent_to_phone}.`
              : "Link generated. Copy and share it:"}
          </p>
          <div className="bg-ink-50 border border-ink-200/80 rounded-xl p-3 break-all font-mono text-xs">
            {result.link}
          </div>
          <button
            className="btn-secondary w-full"
            onClick={() => {
              navigator.clipboard.writeText(result.link);
              onDone("Registration link copied to clipboard");
            }}
          >
            Copy link & close
          </button>
        </div>
      )}
    </Modal>
  );
}

function Field({ label, value, onChange, required, placeholder }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink-600">{label}{required && " *"}</span>
      <input
        className="input mt-1.5"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
      />
    </label>
  );
}
