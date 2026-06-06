import { useState } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import PageHeader from "../components/ui/PageHeader";
import { Section } from "../components/ui/Card";
import { BloodGroupChip } from "../components/ui/Badge";
import { Table, THead, TH, TR, TD, Empty } from "../components/ui/Table";
import Spinner from "../components/ui/Spinner";
import { useAsync } from "../hooks/useAsync";
import { endpoints } from "../lib/api";
import { formatDateTime, relativeTime } from "../lib/format";

export default function Protocols() {
  const protocols = useAsync(() => endpoints.listProtocols(), []);
  const updates = useAsync(() => endpoints.protocolUpdates(20), []);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function runAnalyzer() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await endpoints.runFailureAnalyzer();
      setMsg(
        `Analyzed ${r.groups_analyzed} groups · ${r.updates_applied.length} protocols updated`,
      );
      protocols.refresh();
      updates.refresh();
    } catch (e) {
      setMsg("Error: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Protocols"
        subtitle="Per-blood-group matching parameters · auto-tuned by the self-improvement engine"
        actions={
          <button onClick={runAnalyzer} className="btn-primary" disabled={busy}>
            {busy ? <Spinner /> : <Sparkles className="w-4 h-4" />}
            Run Failure Analyzer
          </button>
        }
      />

      {msg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-3 py-2 rounded-lg text-sm">
          {msg}
        </div>
      )}

      <Section title="Current Protocols">
        {protocols.loading ? <Empty message="Loading…" /> : (
          <Table>
            <THead>
              <tr>
                <TH>Blood Group</TH>
                <TH>City</TH>
                <TH>Batch Size</TH>
                <TH>Initial Radius</TH>
                <TH>Wait (h)</TH>
                <TH>Proactive Days</TH>
                <TH>Last Updated</TH>
                <TH>By</TH>
              </tr>
            </THead>
            <tbody>
              {protocols.data?.map((p) => (
                <TR key={p.id}>
                  <TD><BloodGroupChip bloodGroup={p.blood_group} /></TD>
                  <TD>{p.city}</TD>
                  <TD className="font-mono">{p.initial_batch_size}</TD>
                  <TD className="font-mono">{p.initial_radius_km} km</TD>
                  <TD className="font-mono">{p.escalation_wait_h}</TD>
                  <TD className="font-mono">{p.proactive_days_ahead}</TD>
                  <TD className="text-xs text-ink-500">{formatDateTime(p.last_updated_at)}</TD>
                  <TD className="text-xs">{p.last_updated_by}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      <Section
        title="Self-Improvement Audit Log"
        subtitle="Every protocol change made by the failure analyzer"
        action={
          <button
            onClick={updates.refresh}
            className="text-xs text-ink-500 hover:underline inline-flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        }
      >
        {updates.data?.length === 0 ? (
          <Empty message="No protocol updates yet — click Run Failure Analyzer above to see one." />
        ) : (
          <ol className="space-y-3">
            {updates.data?.map((u) => (
              <li
                key={u.id}
                className="border border-ink-200 rounded-lg p-3 text-sm bg-white"
              >
                <div className="flex items-center gap-2 mb-1">
                  <BloodGroupChip bloodGroup={u.blood_group} />
                  <span className="text-ink-500 text-xs">
                    {u.city} · {relativeTime(u.created_at)} · by {u.updated_by}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs font-mono">
                  <DiffPill
                    label="Batch"
                    prev={u.previous.initial_batch_size}
                    next={u.new.initial_batch_size}
                  />
                  <DiffPill
                    label="Radius (km)"
                    prev={u.previous.initial_radius_km}
                    next={u.new.initial_radius_km}
                  />
                  <DiffPill
                    label="Proactive days"
                    prev={u.previous.proactive_days_ahead}
                    next={u.new.proactive_days_ahead}
                  />
                </div>
                {u.rationale && (
                  <div className="text-xs text-ink-600 italic mt-2">
                    {u.rationale}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  );
}

function DiffPill({ label, prev, next }) {
  const changed = prev !== next;
  return (
    <div className="bg-ink-50 border border-ink-200 rounded px-2 py-1">
      <div className="text-[10px] uppercase text-ink-500">{label}</div>
      <div className={changed ? "text-blood-700" : "text-ink-700"}>
        {prev} → {next}
      </div>
    </div>
  );
}
