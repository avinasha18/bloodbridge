import { useState } from "react";
import { Heart, Calendar } from "lucide-react";
import PageHeader from "../components/ui/PageHeader";
import { Section } from "../components/ui/Card";
import { BloodGroupChip, Pill } from "../components/ui/Badge";
import { Table, THead, TH, TR, TD, Empty } from "../components/ui/Table";
import { useAsync } from "../hooks/useAsync";
import { endpoints } from "../lib/api";
import { BLOOD_GROUPS, formatDate } from "../lib/format";

export default function Patients() {
  const [filters, setFilters] = useState({ blood_group: "", search: "" });
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const list = useAsync(
    () =>
      endpoints.listPatients({
        limit,
        offset,
        ...(filters.blood_group && { blood_group: filters.blood_group }),
        ...(filters.search && { search: filters.search }),
      }),
    [filters.blood_group, filters.search, offset],
  );

  const upcoming = useAsync(() => endpoints.upcomingTransfusions(14), []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Patients"
        subtitle="People who need regular blood transfusions. The system can auto-create blood needs before their next appointment."
      />

      <Section
        title="Transfusions in the next 2 weeks"
        subtitle={`${upcoming.data?.length ?? "—"} patients with upcoming appointments`}
        noPadding
      >
        {upcoming.loading ? (
          <Empty message="Loading schedule…" icon={Calendar} />
        ) : upcoming.data?.length === 0 ? (
          <Empty message="No transfusions scheduled in the next 14 days" icon={Calendar} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Patient</TH>
                <TH>Blood</TH>
                <TH>Hospital</TH>
                <TH>When</TH>
                <TH>Blood need</TH>
              </tr>
            </THead>
            <tbody>
              {upcoming.data?.map((t) => (
                <TR key={t.patient_id}>
                  <TD primary>{t.name}</TD>
                  <TD><BloodGroupChip bloodGroup={t.blood_group} size="sm" /></TD>
                  <TD muted className="max-w-[200px] truncate">{t.hospital_name}</TD>
                  <TD muted>
                    {formatDate(t.expected_next_transfusion_date)}
                    <span className="ml-1 text-amber-700 font-medium">({t.days_until}d)</span>
                  </TD>
                  <TD>
                    {t.proactive_request_created ? (
                      <Pill tone="success" dot>Queued</Pill>
                    ) : (
                      <Pill tone="warn" dot>Pending</Pill>
                    )}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      <Section title="All patients" noPadding>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3 border-b border-ink-100 bg-ink-50/30">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Search</span>
            <input
              className="input mt-1.5"
              placeholder="Name or hospital"
              value={filters.search}
              onChange={(e) => { setOffset(0); setFilters({ ...filters, search: e.target.value }); }}
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Blood group</span>
            <select
              className="input mt-1.5"
              value={filters.blood_group}
              onChange={(e) => { setOffset(0); setFilters({ ...filters, blood_group: e.target.value }); }}
            >
              <option value="">All</option>
              {BLOOD_GROUPS.map((b) => <option key={b}>{b}</option>)}
            </select>
          </label>
        </div>

        {list.loading ? (
          <Empty message="Loading patients…" icon={Heart} />
        ) : list.data?.items?.length === 0 ? (
          <Empty message="No patients found" icon={Heart} />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Patient</TH>
                  <TH>Blood</TH>
                  <TH>Phone</TH>
                  <TH>Hospital</TH>
                  <TH>Coordinator</TH>
                  <TH>Source</TH>
                  <TH>Next transfusion</TH>
                </tr>
              </THead>
              <tbody>
                {list.data?.items?.map((p) => (
                  <TR key={p.id}>
                    <TD primary>
                      {p.name}
                      {p.contact_name && p.contact_name !== p.name && (
                        <div className="text-[11px] text-ink-500 font-normal mt-0.5">
                          via {p.contact_name}
                          {p.relation_to_patient ? ` · ${p.relation_to_patient}` : ""}
                        </div>
                      )}
                    </TD>
                    <TD><BloodGroupChip bloodGroup={p.blood_group} size="sm" /></TD>
                    <TD muted className="font-mono">{p.phone || "—"}</TD>
                    <TD muted className="max-w-[180px] truncate">{p.hospital_name}</TD>
                    <TD muted>{p.coordinator_name || "—"}</TD>
                    <TD>
                      {p.self_registered ? (
                        <Pill tone="info" dot>Self-reg</Pill>
                      ) : (
                        <Pill dot>Manual</Pill>
                      )}
                    </TD>
                    <TD muted>{formatDate(p.expected_next_transfusion_date)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <div className="flex justify-between items-center px-4 py-3 border-t border-ink-100 text-sm bg-ink-50/30">
              <span className="text-ink-500">
                Showing {offset + 1}–{offset + (list.data?.items?.length || 0)} of {list.data?.total}
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
                  disabled={(list.data?.items?.length || 0) < limit}
                  onClick={() => setOffset(offset + limit)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </Section>
    </div>
  );
}
