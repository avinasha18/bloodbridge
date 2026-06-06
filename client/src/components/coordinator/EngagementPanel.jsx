import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Sparkles,
  Send,
  MessageCircle,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Clock,
  XCircle,
} from "lucide-react";
import { endpoints } from "../../lib/api";

const SEGMENT_STYLE = {
  new: {
    label: "New donor",
    chip: "bg-indigo-50 text-indigo-700 border-indigo-200",
    bar: "bg-indigo-500",
  },
  active: {
    label: "Active donor",
    chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
    bar: "bg-emerald-500",
  },
  at_risk: {
    label: "At-risk donor",
    chip: "bg-amber-50 text-amber-800 border-amber-200",
    bar: "bg-amber-500",
  },
  dormant: {
    label: "Dormant donor",
    chip: "bg-blood-50 text-blood-700 border-blood-200",
    bar: "bg-blood-500",
  },
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

export default function EngagementPanel({ donorId, donorName }) {
  const [plan, setPlan] = useState(null);
  const [editedMessage, setEditedMessage] = useState("");
  const [editedBody, setEditedBody] = useState("");
  const [history, setHistory] = useState([]);
  const [planBusy, setPlanBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [force, setForce] = useState(false);
  const [toast, setToast] = useState(null);

  async function loadHistory() {
    try {
      const rows = await endpoints.engagementHistory(donorId, 2);
      setHistory(rows);
    } catch {
      setHistory([]);
    }
  }

  useEffect(() => {
    loadHistory();
  }, [donorId]);

  async function generatePlan() {
    setPlanBusy(true);
    setToast(null);
    try {
      const p = await endpoints.engagementPlan(donorId);
      setPlan(p);
      setEditedMessage(p.message || "");
      setEditedBody(p.message_body || p.message || "");
    } catch (err) {
      setToast({
        kind: "error",
        text: err?.response?.data?.detail || "Could not generate plan.",
      });
    } finally {
      setPlanBusy(false);
    }
  }

  async function sendNow() {
    if (!plan) return;
    setSendBusy(true);
    setToast(null);
    try {
      const r = await endpoints.engagementSend(donorId, {
        force,
        channel: "whatsapp",
        custom_message:
          editedMessage !== plan.message ? editedMessage : undefined,
      });
      if (r.status === "skipped") {
        setToast({
          kind: "warn",
          text: r.reason || "Skipped by cadence guard.",
        });
      } else if (r.status === "failed") {
        setToast({
          kind: "error",
          text: r.delivery_error || "Send failed.",
        });
      } else {
        const to = r.delivery_phone || r.phone;
        const extra =
          r.redirected && r.intended_phone && r.intended_phone !== to
            ? ` (donor profile ${r.intended_phone})`
            : "";
        setToast({
          kind: "success",
          text: `WhatsApp sent to ${to}${extra} — ${r.status}. ID: ${r.message_id || "n/a"}`,
        });
      }
      await loadHistory();
    } catch (err) {
      setToast({
        kind: "error",
        text: err?.response?.data?.detail || "Could not send.",
      });
    } finally {
      setSendBusy(false);
    }
  }

  const segStyle = plan ? SEGMENT_STYLE[plan.segment] || SEGMENT_STYLE.dormant : null;
  const charCount = editedMessage.length;
  const overLimit = charCount > 480;

  function onBodyChange(body) {
    setEditedBody(body);
    if (plan?.native_headline) {
      setEditedMessage(`${plan.native_headline}\n\n${body}`);
    } else {
      setEditedMessage(body);
    }
  }

  return (
    <section className="rounded-xl bg-white border border-ink-200 overflow-hidden">
      <header className="px-5 py-4 border-b border-ink-100 bg-gradient-to-r from-indigo-50/60 to-white flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-ink-900 text-sm flex items-center gap-2">
              Donor Engagement Agent
              <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-600 text-white px-1.5 py-0.5 rounded">
                AI
              </span>
            </h3>
            <p className="text-xs text-ink-500 mt-0.5">
              Classifies {donorName || "this donor"}, generates a personalized WhatsApp
              message with Bedrock, and respects a per-segment cadence.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={generatePlan}
          disabled={planBusy}
          className="btn-primary"
        >
          {planBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {plan ? "Regenerate plan" : "Generate engagement plan"}
        </button>
      </header>

      {!plan && (
        <div className="px-5 py-8 text-center text-sm text-ink-500">
          Click <span className="font-medium text-ink-700">Generate engagement plan</span> to
          classify this donor and draft a WhatsApp message.
        </div>
      )}

      {plan && segStyle && (
        <div className="p-5 space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <div className={`rounded-lg border px-3 py-2 ${segStyle.chip}`}>
              <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">
                Segment
              </div>
              <div className="font-semibold text-sm mt-0.5">{segStyle.label}</div>
              <div className="text-[11px] mt-1 opacity-80 leading-snug">{plan.reason}</div>
            </div>
            <Stat
              label="Last donation"
              value={
                plan.days_since_last_donation == null
                  ? "—"
                  : `${plan.days_since_last_donation}d ago`
              }
              sub={plan.eligible_now ? "Eligible now" : "Not eligible yet"}
              icon={Clock}
            />
            <Stat
              label="Cadence"
              value={
                plan.cadence_ok
                  ? "Clear to send"
                  : `Wait ${plan.min_gap_days}d`
              }
              sub={
                plan.last_engagement_at
                  ? `Last sent ${formatDt(plan.last_engagement_at)}`
                  : "No prior engagement"
              }
              icon={Shield}
              tone={plan.cadence_ok ? "emerald" : "amber"}
            />
          </div>

          <div className="rounded-lg bg-emerald-50/40 border border-emerald-100 px-3 py-2 text-xs text-emerald-900">
            <div className="font-semibold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Why this message
            </div>
            <p className="mt-1 leading-relaxed">{plan.rationale || "Personalized for this segment."}</p>
          </div>

          {plan.native_headline && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-600 text-white px-1.5 py-0.5 rounded">
                  {plan.native_lang_label || "Local"}
                </span>
                {plan.region_name && (
                  <span className="text-[10px] text-indigo-600 font-medium">
                    {plan.region_name}
                  </span>
                )}
              </div>
              <p className="text-sm font-medium text-indigo-950 leading-snug">
                {plan.native_headline}
              </p>
              <p className="text-[11px] text-indigo-600/80 mt-1">
                Native headline from city / GPS — English body below.
              </p>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-ink-600 uppercase tracking-wide">
                English body
              </label>
              <span
                className={`text-[11px] tabular-nums ${
                  overLimit ? "text-blood-700 font-semibold" : "text-ink-400"
                }`}
              >
                {charCount}/480
              </span>
            </div>
            <textarea
              value={editedBody}
              onChange={(e) => onBodyChange(e.target.value)}
              rows={4}
              className="w-full text-sm rounded-lg border border-ink-200 px-3 py-2 leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
            />
            <details className="mt-2">
              <summary className="text-[11px] text-ink-500 cursor-pointer hover:text-ink-700">
                Preview full WhatsApp message
              </summary>
              <pre className="mt-1.5 text-xs text-ink-700 bg-ink-50 border border-ink-200 rounded-lg p-3 whitespace-pre-wrap font-sans">
                {editedMessage}
              </pre>
            </details>
            <p className="text-[11px] text-ink-400 mt-1">
              You can tweak the draft before sending. It will go to{" "}
              <span className="font-medium text-ink-700">{plan.phone || "no phone"}</span> via WhatsApp.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-ink-600">
              <input
                type="checkbox"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
                className="rounded"
              />
              Override cadence (send anyway)
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={generatePlan}
                disabled={planBusy}
                className="btn-secondary"
              >
                <RefreshCw className="w-4 h-4" /> Regenerate
              </button>
              <button
                type="button"
                onClick={sendNow}
                disabled={sendBusy || !plan.phone || overLimit}
                className="btn-primary"
              >
                {sendBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send on WhatsApp
              </button>
            </div>
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
                <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
              )}
              <span className="leading-relaxed">{toast.text}</span>
            </div>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="border-t border-ink-100 px-5 py-4 bg-ink-50/40">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-ink-600 uppercase tracking-wide flex items-center gap-1.5">
              <MessageCircle className="w-3.5 h-3.5" /> Recent messages
            </h4>
            <Link
              to={`/engagement/messages?donor=${donorId}`}
              className="text-[11px] text-indigo-600 hover:underline font-medium"
            >
              View all
            </Link>
          </div>
          <ol className="space-y-2">
            {history.slice(0, 2).map((h) => {
              const inbound = h.channel === "whatsapp_inbound";
              return (
                <li
                  key={h.id}
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    inbound
                      ? "bg-indigo-50/50 border-indigo-100"
                      : h.status === "failed"
                        ? "bg-rose-50/40 border-rose-100"
                        : "bg-white border-ink-100"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                        inbound
                          ? "bg-indigo-100 text-indigo-700"
                          : SEGMENT_STYLE[h.segment]?.chip || "bg-ink-100 text-ink-700"
                      }`}
                    >
                      {inbound ? `Reply · ${h.status}` : (SEGMENT_STYLE[h.segment]?.label || h.segment)}
                    </span>
                    <span className="text-ink-400 tabular-nums">{formatDt(h.sent_at)}</span>
                  </div>
                  <p className="text-ink-700 leading-relaxed whitespace-pre-wrap">{h.message}</p>
                  {h.delivery_error && (
                    <p className="text-rose-700 text-[11px] mt-1">Error: {h.delivery_error}</p>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, sub, icon: Icon, tone = "indigo" }) {
  const tones = {
    indigo: "bg-indigo-50 text-indigo-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-800",
  };
  return (
    <div className="rounded-lg border border-ink-200 px-3 py-2 bg-white">
      <div className="flex items-center justify-between mb-0.5">
        <div className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
          {label}
        </div>
        {Icon && (
          <div className={`w-5 h-5 rounded flex items-center justify-center ${tones[tone]}`}>
            <Icon className="w-3 h-3" />
          </div>
        )}
      </div>
      <div className="font-semibold text-sm text-ink-900">{value}</div>
      {sub && <div className="text-[11px] text-ink-500 mt-0.5 leading-snug">{sub}</div>}
    </div>
  );
}
