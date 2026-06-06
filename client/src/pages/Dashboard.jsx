import { Link } from "react-router-dom";
import {
  Users,
  Heart,
  Droplets,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Sparkles,
  Activity,
  TrendingUp,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

import PageHeader from "../components/ui/PageHeader";
import StatCard from "../components/ui/StatCard";
import { Section } from "../components/ui/Card";
import {
  StatusBadge,
  UrgencyBadge,
  BloodGroupChip,
  Pill,
} from "../components/ui/Badge";
import { Table, THead, TH, TR, TD, Empty } from "../components/ui/Table";
import Spinner from "../components/ui/Spinner";
import { usePoll, useAsync } from "../hooks/useAsync";
import { endpoints } from "../lib/api";
import { formatDateTime, relativeTime } from "../lib/format";
import { useState } from "react";
import WorkflowGuide from "../components/WorkflowGuide";

export default function Dashboard() {
  const metrics = usePoll(endpoints.dashboard, 15_000);
  const activeReqs = usePoll(
    () => endpoints.listRequests({ limit: 8, offset: 0 }),
    10_000,
  );
  const upcoming = useAsync(() => endpoints.upcomingTransfusions(7), []);

  const m = metrics.data;
  const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString());
  const supplyData = m
    ? Object.entries(m.blood_supply).map(([bg, count]) => ({
        name: bg.replace("Positive", "+").replace("Negative", "-"),
        eligible: count,
        critical: m.critical_shortages.includes(bg),
      }))
    : [];

  const [scheduling, setScheduling] = useState(false);
  const [schedulerMessage, setSchedulerMessage] = useState(null);

  async function runScheduler() {
    setScheduling(true);
    setSchedulerMessage(null);
    try {
      const r = await endpoints.runProactiveScheduler();
      setSchedulerMessage(
        `Created ${r.created_count} proactive requests · skipped ${r.skipped_count} already-open cycles`,
      );
      metrics.refresh();
      activeReqs.refresh();
      upcoming.refresh();
    } catch (e) {
      setSchedulerMessage("Scheduler failed: " + e.message);
    } finally {
      setScheduling(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Home"
        subtitle="Overview of donors, open blood needs, and upcoming patient transfusions"
        actions={
          <>
            <button
              onClick={runScheduler}
              className="btn-secondary"
              disabled={scheduling}
            >
              {scheduling ? <Spinner /> : <Sparkles className="w-4 h-4" />}
              Check Upcoming Patient Needs
            </button>
            <Link to="/requests/new" className="btn-primary">
              <Droplets className="w-4 h-4" />
              New Blood Need
            </Link>
          </>
        }
      />

      <WorkflowGuide />

      {schedulerMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          {schedulerMessage}
        </div>
      )}

      {metrics.error && (
        <div className="bg-blood-50 border border-blood-200 text-blood-800 px-4 py-3 rounded-lg text-sm">
          Dashboard API error: {metrics.error.message || String(metrics.error)}
        </div>
      )}

      {!metrics.loading && !metrics.error && m && m.total_donors === 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-lg text-sm">
          <strong>Database is empty.</strong> Run{" "}
          <code className="bg-amber-100 px-1 rounded">python -m app.seed.seed_data --reset</code>{" "}
          in the <code className="bg-amber-100 px-1 rounded">server/</code> folder to load the
          6,800+ donor dataset, then restart the API.
        </div>
      )}

      {/* Top KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Donors in System"
          value={fmt(m?.total_donors)}
          hint={`${fmt(m?.eligible_donors)} can donate now`}
          icon={Users}
          loading={metrics.loading && !m}
        />
        <StatCard
          label="Patient Transfusions (7 days)"
          value={fmt(m?.upcoming_transfusions_7d)}
          hint="scheduled in the next week"
          icon={Calendar}
          tone="info"
          loading={metrics.loading && !m}
        />
        <StatCard
          label="Open Blood Needs"
          value={fmt(m?.active_requests)}
          hint={`${fmt(m?.fulfilled_today)} completed today`}
          icon={Activity}
          tone="warn"
          loading={metrics.loading && !m}
        />
        <StatCard
          label="Over-Contacted Donors"
          value={fmt(m?.at_risk_donors)}
          hint="called too often — may say no"
          icon={AlertTriangle}
          tone="danger"
          loading={metrics.loading && !m}
        />
      </div>

      {/* Critical shortages banner */}
      {m?.critical_shortages?.length > 0 && (
        <div className="bg-blood-50 border border-blood-200 rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-blood-700" />
            <div>
              <div className="font-semibold text-blood-900">
                Critical blood-type shortages
              </div>
              <div className="text-sm text-blood-800">
                System has expanded outreach radius for these types automatically.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {m.critical_shortages.map((bg) => (
              <BloodGroupChip key={bg} bloodGroup={bg} />
            ))}
          </div>
        </div>
      )}

      <Section
          title="Open Blood Needs"
          subtitle="Click any row to see donor ranking, SMS messages, and your action buttons"
          action={
            <Link to="/requests" className="text-xs text-blood-600 hover:underline">
              View all blood needs →
            </Link>
          }
        >
          {activeReqs.loading && !activeReqs.data ? (
            <Empty message="Loading…" />
          ) : activeReqs.data?.items?.length === 0 ? (
            <Empty message="No blood needs yet — create one to start SMS outreach." />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Blood</TH>
                  <TH>Hospital</TH>
                  <TH>How urgent</TH>
                  <TH>Status</TH>
                  <TH>When</TH>
                  <TH>Source</TH>
                </tr>
              </THead>
              <tbody>
                {activeReqs.data?.items?.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <Link to={`/requests/${r.id}`}>
                        <BloodGroupChip bloodGroup={r.blood_group} />
                      </Link>
                    </TD>
                    <TD className="max-w-[240px] truncate">
                      <Link to={`/requests/${r.id}`} className="hover:underline">
                        {r.hospital_name || "—"}
                      </Link>
                    </TD>
                    <TD><UrgencyBadge urgency={r.urgency} /></TD>
                    <TD><StatusBadge status={r.status} /></TD>
                    <TD className="text-ink-500 text-xs">{relativeTime(r.created_at)}</TD>
                    <TD>
                      {r.is_proactive ? (
                        <Pill tone="info">from patient schedule</Pill>
                      ) : (
                        <Pill>you created</Pill>
                      )}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Section>

      {/* Supply chart + Upcoming */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section
          title="Available Donors by Blood Type"
          subtitle="How many eligible donors we have for each blood group"
        >
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={supplyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Bar
                  dataKey="eligible"
                  radius={[4, 4, 0, 0]}
                  fill="#94a3b8"
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section
          title="Patients Needing Blood Soon"
          subtitle="Next 7 days — system can auto-create blood needs from this list"
          action={
            <Link to="/patients" className="text-xs text-blood-600 hover:underline">
              All patients →
            </Link>
          }
        >
          {upcoming.loading && !upcoming.data ? (
            <Empty message="Loading…" />
          ) : upcoming.data?.length === 0 ? (
            <Empty message="No transfusions in the next 7 days" />
          ) : (
            <div className="max-h-72 overflow-auto">
              <Table>
                <THead>
                  <tr>
                    <TH>Patient</TH>
                    <TH>Blood</TH>
                    <TH>Hospital</TH>
                    <TH>When</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <tbody>
                  {upcoming.data?.slice(0, 12).map((t) => (
                    <TR key={t.patient_id}>
                      <TD className="font-medium">{t.name}</TD>
                      <TD>
                        <BloodGroupChip bloodGroup={t.blood_group} />
                      </TD>
                      <TD className="max-w-[160px] truncate text-xs">
                        {t.hospital_name}
                      </TD>
                      <TD className="text-xs">
                        in {t.days_until}d
                      </TD>
                      <TD>
                        {t.proactive_request_created ? (
                          <Pill tone="success">scheduled</Pill>
                        ) : (
                          <Pill tone="warn">awaiting</Pill>
                        )}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
