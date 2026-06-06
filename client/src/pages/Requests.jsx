import { Link } from "react-router-dom";
import { useState } from "react";
import { Plus, Filter } from "lucide-react";
import PageHeader from "../components/ui/PageHeader";
import { Section } from "../components/ui/Card";
import {
  StatusBadge,
  UrgencyBadge,
  BloodGroupChip,
  Pill,
} from "../components/ui/Badge";
import { Table, THead, TH, TR, TD, Empty } from "../components/ui/Table";
import { usePoll } from "../hooks/useAsync";
import { endpoints } from "../lib/api";
import { BLOOD_GROUPS, URGENCY_LEVELS, relativeTime, STATUS_LABELS, urgencyLabel } from "../lib/format";

const STATUSES = Object.keys(STATUS_LABELS);

export default function Requests() {
  const [filters, setFilters] = useState({ status: "", blood_group: "", urgency: "" });

  const params = {
    limit: 50,
    ...(filters.status && { status: filters.status }),
    ...(filters.blood_group && { blood_group: filters.blood_group }),
    ...(filters.urgency && { urgency: filters.urgency }),
  };

  const { data, loading } = usePoll(
    () => endpoints.listRequests(params),
    10_000,
    [filters.status, filters.blood_group, filters.urgency],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Blood Needs"
        subtitle="Every row is one hospital blood request. Click it to see donor ranking, SMS messages, and your action buttons."
        actions={
          <Link to="/requests/new" className="btn-primary">
            <Plus className="w-4 h-4" />
            New Blood Need
          </Link>
        }
      />

      <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 text-sm text-indigo-900">
        <strong>Where is SMS & ranking?</strong> Click any blood need below. On that page you will
        see: (1) text messages sent, (2) best donors ranked, (3) buttons to send hospital address
        and mark donated.
      </div>

      <Section
        title="Filters"
        action={
          <button
            className="text-xs text-ink-500 hover:underline"
            onClick={() => setFilters({ status: "", blood_group: "", urgency: "" })}
          >
            Clear
          </button>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Select
            label="Status"
            value={filters.status}
            onChange={(v) => setFilters({ ...filters, status: v })}
            options={STATUSES}
          />
          <Select
            label="Blood Group"
            value={filters.blood_group}
            onChange={(v) => setFilters({ ...filters, blood_group: v })}
            options={BLOOD_GROUPS}
          />
          <Select
            label="Urgency"
            value={filters.urgency}
            onChange={(v) => setFilters({ ...filters, urgency: v })}
            options={URGENCY_LEVELS}
          />
        </div>
      </Section>

      <Section title={`${data?.total ?? "—"} blood needs`}>
        {loading ? (
          <Empty message="Loading…" />
        ) : data?.items?.length === 0 ? (
          <Empty message="No requests match the current filters" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Blood</TH>
                <TH>Hospital</TH>
                <TH>How urgent</TH>
                <TH>Units</TH>
                <TH>Status</TH>
                <TH>Source</TH>
                <TH>Search area</TH>
                <TH>When</TH>
              </tr>
            </THead>
            <tbody>
              {data?.items?.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Link to={`/requests/${r.id}`}>
                      <BloodGroupChip bloodGroup={r.blood_group} />
                    </Link>
                  </TD>
                  <TD>
                    <Link to={`/requests/${r.id}`} className="hover:underline">
                      {r.hospital_name || "—"}
                    </Link>
                  </TD>
                  <TD><UrgencyBadge urgency={r.urgency} /></TD>
                  <TD className="text-ink-600">{r.units_needed}</TD>
                  <TD><StatusBadge status={r.status} /></TD>
                  <TD>
                    {r.is_proactive ? (
                      <Pill tone="info">patient schedule</Pill>
                    ) : (
                      <Pill>you created</Pill>
                    )}
                  </TD>
                  <TD className="text-ink-500 text-xs">
                    {r.search_radius_km} km radius
                  </TD>
                  <TD className="text-ink-500 text-xs">{relativeTime(r.created_at)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink-600">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input mt-1"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {label === "Status" ? STATUS_LABELS[o] || o : label === "Urgency" ? urgencyLabel(o) : o}
          </option>
        ))}
      </select>
    </label>
  );
}
