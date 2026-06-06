import { useState } from "react";
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
        title="Transfusions in the Next 2 Weeks"
        subtitle={`${upcoming.data?.length ?? "—"} patients with upcoming appointments`}
      >
        {upcoming.loading ? (
          <Empty message="Loading…" />
        ) : upcoming.data?.length === 0 ? (
          <Empty message="No transfusions scheduled in the next 14 days" />
        ) : (
          <div className="max-h-96 overflow-auto">
            <Table>
              <THead>
                <tr>
                  <TH>Patient</TH>
                  <TH>Blood</TH>
                  <TH>Hospital</TH>
                  <TH>When</TH>
                  <TH>Blood need created?</TH>
                </tr>
              </THead>
              <tbody>
                {upcoming.data?.map((t) => (
                  <TR key={t.patient_id}>
                    <TD className="font-medium">{t.name}</TD>
                    <TD><BloodGroupChip bloodGroup={t.blood_group} /></TD>
                    <TD className="text-xs max-w-[200px] truncate">{t.hospital_name}</TD>
                    <TD className="text-xs">
                      {formatDate(t.expected_next_transfusion_date)} (in {t.days_until}d)
                    </TD>
                    <TD>
                      {t.proactive_request_created ? (
                        <Pill tone="success">yes — see Blood Needs</Pill>
                      ) : (
                        <Pill tone="warn">not yet</Pill>
                      )}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Section>

      <Section title="All Patients">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <label className="block">
            <span className="text-xs font-medium text-ink-600">Search</span>
            <input
              className="input mt-1"
              placeholder="name, hospital"
              value={filters.search}
              onChange={(e) => { setOffset(0); setFilters({ ...filters, search: e.target.value }); }}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-ink-600">Blood Group</span>
            <select
              className="input mt-1"
              value={filters.blood_group}
              onChange={(e) => { setOffset(0); setFilters({ ...filters, blood_group: e.target.value }); }}
            >
              <option value="">All</option>
              {BLOOD_GROUPS.map((b) => <option key={b}>{b}</option>)}
            </select>
          </label>
        </div>

        {list.loading ? (
          <Empty message="Loading…" />
        ) : list.data?.items?.length === 0 ? (
          <Empty message="No patients" />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Patient</TH>
                  <TH>Blood</TH>
                  <TH>Patient phone</TH>
                  <TH>Hospital</TH>
                  <TH>Coordinator</TH>
                  <TH>Source</TH>
                  <TH>Next Transfusion</TH>
                </tr>
              </THead>
              <tbody>
                {list.data?.items?.map((p) => (
                  <TR key={p.id}>
                    <TD className="font-medium">
                      {p.name}
                      {p.contact_name && p.contact_name !== p.name && (
                        <div className="text-xs text-ink-500">via {p.contact_name}{p.relation_to_patient ? ` (${p.relation_to_patient})` : ""}</div>
                      )}
                    </TD>
                    <TD><BloodGroupChip bloodGroup={p.blood_group} /></TD>
                    <TD className="text-xs font-mono">{p.phone || "—"}</TD>
                    <TD className="text-xs max-w-[200px] truncate">{p.hospital_name}</TD>
                    <TD className="text-xs text-ink-600">{p.coordinator_name || "—"}</TD>
                    <TD>
                      {p.self_registered ? (
                        <Pill tone="info">self-registered</Pill>
                      ) : (
                        <Pill>existing</Pill>
                      )}
                    </TD>
                    <TD className="text-xs">{formatDate(p.expected_next_transfusion_date)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <div className="flex justify-between items-center pt-4 text-sm">
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
