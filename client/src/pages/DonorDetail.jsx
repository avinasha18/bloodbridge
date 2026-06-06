import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import PageHeader from "../components/ui/PageHeader";
import { Section } from "../components/ui/Card";
import { BloodGroupChip, Pill } from "../components/ui/Badge";
import EngagementPanel from "../components/coordinator/EngagementPanel";
import { useAsync } from "../hooks/useAsync";
import { endpoints } from "../lib/api";
import { formatDate } from "../lib/format";

export default function DonorDetail() {
  const { id } = useParams();
  const donor = useAsync(() => endpoints.getDonor(id), [id]);

  const d = donor.data;

  if (donor.loading || !d) {
    return <div className="text-sm text-ink-500">Loading donor…</div>;
  }

  return (
    <div className="space-y-6">
      <Link to="/donors" className="inline-flex items-center text-sm text-ink-500 hover:underline">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to donors
      </Link>

      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {d.name || "Unnamed Donor"}
            <BloodGroupChip bloodGroup={d.blood_group} />
            {d.user_donation_active_status === "Active" ? (
              <Pill tone="success">Active</Pill>
            ) : (
              <Pill tone="warn">Inactive</Pill>
            )}
          </span>
        }
        subtitle={`${d.email || "—"} · ${d.phone || "—"} · ${d.city || ""}`}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <Section title="Overall score">
          <div className="text-3xl font-semibold">
            {Number(d.overall_score ?? d.reliability_score).toFixed(2)}
          </div>
          <div className="text-xs text-ink-500 mt-1">
            Combined ML trust + show-up history (used to rank donors)
          </div>
          <div className="mt-3 h-2 bg-ink-200 rounded overflow-hidden">
            <div
              className="h-full bg-amber-500"
              style={{ width: `${Number(d.overall_score ?? d.reliability_score) * 100}%` }}
            />
          </div>
        </Section>

        <Section title="ML trust score">
          <div className="text-3xl font-semibold">
            {Number(d.reliability_score).toFixed(2)}
          </div>
          <div className="text-xs text-ink-500 mt-1">RandomForest P(Active) · 0 – 1</div>
          <div className="mt-3 h-2 bg-ink-200 rounded overflow-hidden">
            <div
              className="h-full bg-blood-500"
              style={{ width: `${Number(d.reliability_score) * 100}%` }}
            />
          </div>
        </Section>

        <Section title="Show-up rate">
          <div className="text-3xl font-semibold">
            {Number(d.showup_rate).toFixed(2)}
          </div>
          <div className="text-xs text-ink-500 mt-1">
            {d.total_shows ?? 0} showed / {d.total_accepts ?? 0} accepted
            {d.total_no_shows ? ` · ${d.total_no_shows} no-shows` : ""}
          </div>
          <div className="mt-3 h-2 bg-ink-200 rounded overflow-hidden">
            <div
              className="h-full bg-emerald-500"
              style={{ width: `${Number(d.showup_rate) * 100}%` }}
            />
          </div>
        </Section>

        <Section title="Calls : Donations">
          <div className="text-3xl font-semibold font-mono">
            {d.calls_to_donations_ratio == null
              ? "—"
              : Number(d.calls_to_donations_ratio).toFixed(2)}
          </div>
          <div className="text-xs text-ink-500 mt-1">
            {d.total_calls} calls / {d.donations_till_date} donations
          </div>
          {d.calls_to_donations_ratio > 3 && (
            <div className="mt-3 text-xs text-blood-700">
              Being over-contacted (ratio &gt; 3.0)
            </div>
          )}
        </Section>
      </div>

      <Section title="Eligibility">
          <div className="text-lg font-medium">
            {d.eligibility_status || "—"}
          </div>
          <div className="text-xs text-ink-500 mt-1">
            Last donation: {formatDate(d.last_donation_date)}
          </div>
          <div className="text-xs text-ink-500">
            Next eligible: {formatDate(d.next_eligible_date)}
          </div>
        </Section>

      <Section title="Profile">
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <Field k="External ID" v={d.id} />
          <Field k="Type" v={d.donor_type} />
          <Field k="Role" v={d.role} />
          <Field k="Gender" v={d.gender} />
          <Field k="City" v={d.city} />
          <Field k="Lat / Lon" v={`${d.latitude ?? "—"}, ${d.longitude ?? "—"}`} />
          <Field k="Channel" v={d.preferred_channel} />
          <Field k="Language" v={d.language_preference} />
          <Field k="Consent" v={d.consent_given ? "Granted" : "Withheld"} />
        </dl>
        {d.inactive_trigger_comment && (
          <div className="mt-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <span className="font-medium">Inactive trigger: </span>
            {d.inactive_trigger_comment}
          </div>
        )}
      </Section>

      <EngagementPanel donorId={d.id} donorName={d.name} />
    </div>
  );
}

function Field({ k, v }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-500">{k}</dt>
      <dd className="text-ink-800 font-medium truncate">{v ?? "—"}</dd>
    </div>
  );
}
