import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Sparkles,
  PlayCircle,
  Send,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Shield,
  ChevronRight,
} from "lucide-react";
import PageHeader from "../components/ui/PageHeader";
import { Section } from "../components/ui/Card";
import { endpoints } from "../lib/api";

const SEGMENTS = [
  { key: "new", label: "New", color: "indigo" },
  { key: "active", label: "Active", color: "emerald" },
  { key: "at_risk", label: "At-risk", color: "amber" },
  { key: "dormant", label: "Dormant", color: "blood" },
];

const COLOR_CLASS = {
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  blood: "bg-blood-50 text-blood-700 border-blood-200",
};

function formatDt(dt) {
  if (!dt) return "—";
  try {
    return new Date(dt).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return dt;
  }
}

function formatDeliveredList(items = []) {
  if (!items?.length) return "";
  return items
    .map((d) => {
      const name = d.donor_name || "Donor";
      const to = d.delivery_phone || d.donor_phone || "?";
      if (d.redirected && d.donor_phone && d.donor_phone !== to) {
        return `${name} → ${to} (profile ${d.donor_phone})`;
      }
      return `${name} → ${to}`;
    })
    .join(" · ");
}

export default function EngagementAgent() {
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [sampleProfiles, setSampleProfiles] = useState([]);
  const [recentSends, setRecentSends] = useState([]);
  const [selectedSegments, setSelectedSegments] = useState(["at_risk", "dormant"]);
  const [limit, setLimit] = useState(10);
  const [batch, setBatch] = useState(null);
  const [busyKind, setBusyKind] = useState(null);
  const [toast, setToast] = useState(null);

  async function loadSummary() {
    setSummaryLoading(true);
    try {
      const [r, samples, recent] = await Promise.all([
        endpoints.engagementSummary(),
        endpoints.engagementSampleProfiles().catch(() => ({ profiles: [] })),
        endpoints.engagementRecent(2).catch(() => ({ items: [] })),
      ]);
      setSummary(r);
      setSampleProfiles(samples.profiles || []);
      setRecentSends(recent.items || []);
    } catch (err) {
      setToast({ kind: "error", text: err?.response?.data?.detail || "Could not load summary" });
    } finally {
      setSummaryLoading(false);
    }
  }

  useEffect(() => {
    loadSummary();
  }, []);

  function toggleSegment(seg) {
    setSelectedSegments((prev) =>
      prev.includes(seg) ? prev.filter((s) => s !== seg) : [...prev, seg],
    );
  }

  async function runBatch(dryRun) {
    setBusyKind(dryRun ? "dry" : "live");
    setToast(null);
    try {
      const r = await endpoints.engagementRun({
        limit,
        segments: selectedSegments.length ? selectedSegments : null,
        dry_run: dryRun,
      });
      setBatch(r);
      const previewN = r.preview_count ?? r.sent?.filter((s) => s.status === "preview").length ?? 0;
      const sentN = r.sent_count ?? 0;
      const skipN = r.skipped_count ?? 0;
      setToast({
        kind: sentN || previewN ? "success" : "warn",
        text: dryRun
          ? previewN
            ? `Previewed ${previewN} plan(s) from ${r.candidates_scanned} donors scanned.`
            : r.hint || `No plans matched your selected segments (${r.candidates_scanned} scanned).`
          : sentN
            ? `Sent ${sentN} WhatsApp message(s) to ${formatDeliveredList(r.delivered_to) || "recipients"}.${skipN ? ` Skipped ${skipN} (cadence).` : ""}`
            : r.hint || `Nothing sent — ${skipN ? `${skipN} blocked by cadence` : "no donors matched selected segments"}.`,
      });
      loadSummary();
    } catch (err) {
      setToast({
        kind: "error",
        text: err?.response?.data?.detail || "Batch failed.",
      });
    } finally {
      setBusyKind(null);
    }
  }

  async function prepareSamples() {
    setBusyKind("prepare");
    setToast(null);
    try {
      const r = await endpoints.engagementPrepareSamples();
      setSummary({
        total_scanned: Object.values(r.segment_counts).reduce((a, b) => a + b, 0),
        segments: r.segment_counts,
      });
      setToast({
        kind: "success",
        text: `Sample profiles synced. Open any card below to generate and send outreach.`,
      });
      const samples = await endpoints.engagementSampleProfiles();
      setSampleProfiles(samples.profiles || []);
    } catch (err) {
      setToast({
        kind: "error",
        text: err?.response?.data?.detail || "Could not prepare sample profiles.",
      });
    } finally {
      setBusyKind(null);
    }
  }

  const segCounts = summary?.segments || {};

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Sparkles className="w-6 h-6 text-indigo-600" /> Donor Engagement Agent
          </span>
        }
        subtitle="AWS Bedrock classifies every donor and writes a personalized WhatsApp message — sent via Twilio with built-in spam-prevention cadence."
        actions={
          <button
            type="button"
            onClick={prepareSamples}
            disabled={busyKind === "prepare"}
            className="btn-secondary"
          >
            {busyKind === "prepare" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            Sync sample profiles
          </button>
        }
      />

      {summaryLoading && (
        <div className="flex items-center gap-2 text-sm text-ink-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading donor segments…
        </div>
      )}

      {/* Segment KPIs + sent today */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 px-4 py-3 col-span-2 md:col-span-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600/80">
            Sent today
          </div>
          <div className="text-3xl font-semibold mt-1 tabular-nums text-indigo-900">
            {summaryLoading ? "…" : (summary?.sent_today ?? 0).toLocaleString()}
          </div>
          <div className="text-[11px] mt-1 text-indigo-700/70">WhatsApp delivered</div>
        </div>
        {SEGMENTS.map((s) => (
          <div
            key={s.key}
            className={`rounded-xl border px-4 py-3 ${COLOR_CLASS[s.color]}`}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">
              {s.label}
            </div>
            <div className="text-3xl font-semibold mt-1 tabular-nums">
              {summaryLoading ? "…" : (segCounts[s.key] ?? 0).toLocaleString()}
            </div>
            <div className="text-[11px] mt-1 opacity-80">donors</div>
          </div>
        ))}
      </div>

      {summary?.twilio_webhook_url && (
        <p className="text-xs text-ink-500 bg-ink-50 border border-ink-200 rounded-lg px-3 py-2 font-mono break-all">
          WhatsApp replies (YES/NO): set Twilio sandbox inbound URL to{" "}
          <span className="text-indigo-700">{summary.twilio_webhook_url}</span>
        </p>
      )}

      {summary?.whatsapp_override && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          All WhatsApp is redirected to <strong>{summary.whatsapp_override}</strong> via{" "}
          <code className="text-[11px]">SMS_OVERRIDE_PHONE</code> — donor profile numbers are
          not the delivery target.
        </p>
      )}

      {recentSends.length > 0 && (
        <Section
          title="Recent outreach"
          subtitle="Latest WhatsApp sends — updates after each batch or single send."
          action={
            <Link to="/engagement/messages" className="text-sm text-indigo-600 hover:underline">
              View all messages
            </Link>
          }
        >
          <ol className="space-y-2">
            {recentSends.slice(0, 2).map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-100 bg-white px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span
                    className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                      COLOR_CLASS[SEGMENTS.find((s) => s.key === row.segment)?.color || "indigo"]
                    }`}
                  >
                    {row.segment}
                  </span>
                  {row.donor_id && row.donor_id !== "unknown" ? (
                    <Link
                      to={`/donors/${row.donor_id}`}
                      className="font-medium text-ink-900 hover:underline truncate"
                    >
                      {row.donor_name || row.donor_id.slice(0, 8)}
                    </Link>
                  ) : (
                    <span className="font-medium text-ink-900">{row.donor_name || "Unknown"}</span>
                  )}
                  {row.donor_phone && (
                    <span className="text-xs text-ink-500 font-mono">{row.donor_phone}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs shrink-0">
                  <span
                    className={`px-2 py-0.5 rounded-full font-medium ${
                      row.status === "failed"
                        ? "bg-rose-50 text-rose-700"
                        : row.status === "queued"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-ink-100 text-ink-600"
                    }`}
                  >
                    {row.status}
                  </span>
                  <span className="text-ink-400 tabular-nums">{formatDt(row.sent_at)}</span>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {sampleProfiles.length > 0 && (
        <Section
          title="Sample outreach profiles"
          subtitle="One donor per segment — tap to open profile, generate a plan, and send on WhatsApp."
        >
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {sampleProfiles.map((d) => (
              <Link
                key={d.donor_id}
                to={`/donors/${d.donor_id}`}
                className="rounded-xl border border-ink-200 bg-white px-3 py-3 hover:border-indigo-300 hover:shadow-sm transition-all"
              >
                <div
                  className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded inline-block mb-2 ${
                    COLOR_CLASS[SEGMENTS.find((s) => s.key === d.segment)?.color || "indigo"]
                  }`}
                >
                  {d.segment}
                </div>
                <div className="font-medium text-sm text-ink-900">{d.name}</div>
                <div className="text-xs text-ink-500 mt-0.5">{d.phone} · {d.city}</div>
                {d.native_headline && (
                  <p className="text-xs text-indigo-800 mt-2 leading-snug border-t border-ink-100 pt-2">
                    {d.native_headline}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </Section>
      )}

      {/* Controls */}
      <Section
        title="Run the agent"
        subtitle="Choose segments + size. Dry-run only previews plans; live sends WhatsApp."
      >
        <div className="space-y-4">
          <div>
            <div className="text-xs font-semibold text-ink-600 uppercase tracking-wide mb-2">
              Target segments
            </div>
            <div className="flex flex-wrap gap-2">
              {SEGMENTS.map((s) => {
                const active = selectedSegments.includes(s.key);
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => toggleSegment(s.key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      active
                        ? COLOR_CLASS[s.color]
                        : "bg-white text-ink-500 border-ink-200 hover:border-ink-300"
                    }`}
                  >
                    {s.label} · {segCounts[s.key] ?? 0}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-end gap-4 flex-wrap">
            <label className="text-xs">
              <div className="font-semibold text-ink-600 uppercase tracking-wide mb-1">
                Batch size
              </div>
              <input
                type="number"
                min={1}
                max={100}
                value={limit}
                onChange={(e) => setLimit(Math.max(1, Number(e.target.value) || 1))}
                className="w-24 rounded-lg border border-ink-200 px-3 py-1.5 text-sm"
              />
            </label>

            <button
              type="button"
              disabled={busyKind === "dry"}
              onClick={() => runBatch(true)}
              className="btn-secondary"
            >
              {busyKind === "dry" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Dry-run (preview)
            </button>
            <button
              type="button"
              disabled={busyKind === "live"}
              onClick={() => runBatch(false)}
              className="btn-primary"
            >
              {busyKind === "live" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <PlayCircle className="w-4 h-4" />
              )}
              Send batch on WhatsApp
            </button>

            {summary?.last_sent_at && (
              <div className="text-[11px] text-ink-400 ml-auto">
                Last engagement: {formatDt(summary.last_sent_at)}
              </div>
            )}
          </div>

          {toast && (
            <div
              className={`rounded-lg border px-3 py-2 text-sm flex items-start gap-2 ${
                toast.kind === "success"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : toast.kind === "warn"
                    ? "bg-amber-50 border-amber-200 text-amber-900"
                    : "bg-rose-50 border-rose-200 text-rose-800"
              }`}
            >
              {toast.kind === "success" ? (
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              ) : toast.kind === "warn" ? (
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              )}
              <span className="leading-relaxed">{toast.text}</span>
            </div>
          )}
        </div>
      </Section>

      {batch && (
        <Section
          title={batch.sent_count > 0 ? "Last send — recipients" : "Last dry-run plans"}
          subtitle={`${batch.candidates_scanned} scanned · ${batch.sent_count} sent · ${batch.preview_count} previewed · ${batch.skipped_count} skipped`}
        >
          {batch.delivered_to?.length > 0 && (
            <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-900">
              <div className="font-semibold mb-1">Delivered to</div>
              <ul className="space-y-1">
                {batch.delivered_to.map((d, i) => (
                  <li key={i} className="font-mono text-xs sm:text-sm">
                    {d.donor_name || "Donor"}{" "}
                    <span className="text-emerald-700">→ {d.delivery_phone}</span>
                    {d.redirected && d.donor_phone && (
                      <span className="text-emerald-600/80"> (profile {d.donor_phone})</span>
                    )}
                    {d.message_id && (
                      <span className="text-emerald-600/60 ml-1">· {d.status}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {batch.sent.length === 0 ? (
            <div className="text-sm text-ink-500 px-1 py-4">
              No donors matched. All eligible donors have been contacted within the cadence window.
            </div>
          ) : (
            <ol className="space-y-3">
              {batch.sent.map((row, i) => (
                <li
                  key={(row.donor_id || "") + i}
                  className="rounded-xl border border-ink-200 bg-white px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                          COLOR_CLASS[
                            SEGMENTS.find((s) => s.key === row.segment)?.color || "indigo"
                          ]
                        }`}
                      >
                        {row.segment}
                      </span>
                      <Link
                        to={`/donors/${row.donor_id}`}
                        className="font-medium text-sm text-ink-900 hover:underline inline-flex items-center gap-1"
                      >
                        {row.donor_name || row.donor_id?.slice(0, 8)}
                        <ChevronRight className="w-3 h-3 opacity-50" />
                      </Link>
                      <span className="text-xs text-ink-400">{row.phone || "no phone"}</span>
                      {row.delivery_phone && row.delivery_phone !== row.phone && (
                        <span className="text-xs text-emerald-700 font-mono">
                          → {row.delivery_phone}
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        row.status === "skipped"
                          ? "bg-amber-50 text-amber-800"
                          : row.status === "failed"
                            ? "bg-rose-50 text-rose-700"
                            : row.status === "preview"
                              ? "bg-indigo-50 text-indigo-700"
                              : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {row.status}
                    </span>
                  </div>
                  <p className="text-sm text-ink-700 mt-2 leading-relaxed whitespace-pre-wrap">
                    {row.message}
                  </p>
                  {row.rationale && (
                    <p className="text-xs text-indigo-700 mt-1.5 italic">
                      <Sparkles className="w-3 h-3 inline mr-1" /> {row.rationale}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Section>
      )}

      {/* How it works */}
      <Section
        title="How this agent works"
        subtitle="Built end-to-end on AWS Bedrock + Twilio WhatsApp."
      >
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Step
            n={1}
            icon={Shield}
            title="Classify"
            text="Every donor is bucketed into New / Active / At-risk / Dormant from donations, recent accepts and call ratio."
          />
          <Step
            n={2}
            icon={Sparkles}
            title="Personalize"
            text="Bedrock (Claude Haiku) writes a warm, on-brand WhatsApp message tailored to the donor's segment, blood group and impact."
          />
          <Step
            n={3}
            icon={Send}
            title="Deliver"
            text="Twilio WhatsApp delivers within seconds. Replies (YES / NO / STOP) feed back into the system."
          />
          <Step
            n={4}
            icon={MessageCircle}
            title="Respect cadence"
            text="Per-segment minimum gaps (7–30 days) prevent spam. STOP unsubscribes instantly."
          />
        </div>
      </Section>
    </div>
  );
}

function Step({ n, icon: Icon, title, text }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white px-4 py-3">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
          Step {n}
        </span>
      </div>
      <div className="font-semibold text-sm text-ink-900">{title}</div>
      <p className="text-xs text-ink-500 mt-1 leading-relaxed">{text}</p>
    </div>
  );
}
