import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { Plus, Droplets, Filter, ChevronRight } from "lucide-react";
import PageHeader from "../components/ui/PageHeader";
import { Section, InfoBanner } from "../components/ui/Card";
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
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ status: "", blood_group: "", urgency: "" });

  const params = {
    limit: 50,
    ...(filters.status && { status: filters.status }),
    ...(filters.blood_group && { blood_group: filters.blood_group }),
    ...(filters.urgency && { urgency: filters.urgency }),
  };

  const activeFilterCount = [filters.status, filters.blood_group, filters.urgency].filter(Boolean).length;

  const { data, loading } = usePoll(
    () => endpoints.listRequests(params),
    10_000,
    [filters.status, filters.blood_group, filters.urgency],
  );

  const items = data?.items || [];
  const urgentCount = items.filter((r) => r.urgency !== "routine" && !["fulfilled", "failed"].includes(r.status)).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Blood Needs"
        subtitle="Every row is one hospital request. Click a row to rank donors, send SMS, and track progress."
        badge={
          data?.total != null ? (
            <Pill tone="info" dot>{data.total} total</Pill>
          ) : null
        }
        actions={
          <Link to="/requests/new" className="btn-primary">
            <Plus className="w-4 h-4" />
            New blood need
          </Link>
        }
      />

      {urgentCount > 0 && (
        <InfoBanner tone="warn">
          <strong>{urgentCount} urgent need{urgentCount > 1 ? "s" : ""}</strong> need attention —
          open them to send SMS to top-ranked donors.
        </InfoBanner>
      )}

      <Section
        title={
          <span className="inline-flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-ink-400" />
            Filters
            {activeFilterCount > 0 && (
              <Pill tone="violet">{activeFilterCount} active</Pill>
            )}
          </span>
        }
        action={
          activeFilterCount > 0 ? (
            <button
              className="text-xs text-blood-600 hover:underline font-medium"
              onClick={() => setFilters({ status: "", blood_group: "", urgency: "" })}
            >
              Clear all
            </button>
          ) : null
        }
        noPadding
      >
        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FilterSelect
            label="Status"
            value={filters.status}
            onChange={(v) => setFilters({ ...filters, status: v })}
            options={STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] || s }))}
          />
          <FilterSelect
            label="Blood group"
            value={filters.blood_group}
            onChange={(v) => setFilters({ ...filters, blood_group: v })}
            options={BLOOD_GROUPS.map((b) => ({ value: b, label: b }))}
          />
          <FilterSelect
            label="Urgency"
            value={filters.urgency}
            onChange={(v) => setFilters({ ...filters, urgency: v })}
            options={URGENCY_LEVELS.map((u) => ({ value: u, label: urgencyLabel(u) }))}
          />
        </div>
      </Section>

      <Section
        title={`${data?.total ?? "—"} blood needs`}
        subtitle="Click any row for donor ranking, SMS timeline, and actions"
        noPadding
      >
        {loading ? (
          <Empty message="Loading blood needs…" icon={Droplets} />
        ) : items.length === 0 ? (
          <Empty
            message="No blood needs match your filters"
            icon={Droplets}
            action={
              <Link to="/requests/new" className="btn-primary text-sm">
                Create first blood need
              </Link>
            }
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Blood</TH>
                <TH>Hospital</TH>
                <TH>Urgency</TH>
                <TH align="center">Units</TH>
                <TH>Status</TH>
                <TH>Source</TH>
                <TH>Radius</TH>
                <TH>Created</TH>
                <TH className="w-8" />
              </tr>
            </THead>
            <tbody>
              {items.map((r) => (
                <TR
                  key={r.id}
                  highlight={r.urgency === "critical" && r.status !== "fulfilled"}
                  onClick={() => navigate(`/requests/${r.id}`)}
                >
                  <TD>
                    <BloodGroupChip bloodGroup={r.blood_group} size="sm" />
                  </TD>
                  <TD primary className="max-w-[220px]">
                    <span className="truncate block">{r.hospital_name || "—"}</span>
                  </TD>
                  <TD>
                    <UrgencyBadge urgency={r.urgency} compact />
                  </TD>
                  <TD align="center" muted>
                    {r.units_needed}
                  </TD>
                  <TD>
                    <StatusBadge status={r.status} compact />
                  </TD>
                  <TD>
                    {r.is_proactive ? (
                      <Pill tone="info" dot>Scheduled</Pill>
                    ) : (
                      <Pill dot>Manual</Pill>
                    )}
                  </TD>
                  <TD muted>{r.search_radius_km} km</TD>
                  <TD muted>{relativeTime(r.created_at)}</TD>
                  <TD>
                    <ChevronRight className="w-4 h-4 text-ink-300 group-hover:text-blood-500 transition-colors" />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input mt-1.5 cursor-pointer"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
