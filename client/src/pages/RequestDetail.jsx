import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Sparkles,
  RotateCcw,
  MessageSquare,
  Send,
  MapPin,
  Clock,
  CheckCircle2,
  XCircle,
  UserCheck,
  Users,
  Bell,
  Heart,
} from "lucide-react";
import { useState } from "react";
import PageHeader from "../components/ui/PageHeader";
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
import RequestFlowSteps from "../components/RequestFlowSteps";
import SmsTestPanel from "../components/SmsTestPanel";
import { formatDateTime } from "../lib/format";

function timelineStats(r) {
  const timeline = r.sms_timeline || [];
  const outreach = timeline.filter(
    (e) => (e.message_kind || "outreach_request") === "outreach_request",
  );
  const followUps = timeline.filter(
    (e) => (e.message_kind || "outreach_request") !== "outreach_request",
  );
  const awaiting = outreach.filter((e) =>
    (e.response_label || "").includes("Waiting"),
  ).length;
  return {
    donorCount: outreach.length,
    followUpCount: followUps.length,
    awaiting,
    total: timeline.length,
  };
}

export default function RequestDetail() {
  const { id } = useParams();
  const req = usePoll(() => endpoints.getRequest(id), 3_500, [id]);
  const matches = useAsync(() => endpoints.previewMatches(id, { batch_size: 8 }), [id]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [actionBusy, setActionBusy] = useState(null);
  const [toast, setToast] = useState(null);

  async function explain() {
    setAiBusy(true);
    try {
      const r = await endpoints.matchExplain(id, 5);
      setAiResult(r);
    } finally {
      setAiBusy(false);
    }
  }

  async function retry() {
    await endpoints.retryRequest(id);
    req.refresh();
  }

  async function runAction(key, fn, successMsg) {
    setActionBusy(key);
    try {
      const result = await fn();
      const text = result?.detail || successMsg || "Done";
      setToast({ kind: "ok", text, data: result });
      req.refresh();
    } catch (err) {
      const detail = err?.response?.data?.detail || err.message;
      setToast({ kind: "err", text: detail });
    } finally {
      setActionBusy(null);
      setTimeout(() => setToast(null), 8_000);
    }
  }

  const r = req.data;
  const smsStats = r ? timelineStats(r) : null;

  return (
    <div className="space-y-6">
      <Link to="/requests" className="inline-flex items-center text-sm text-ink-500 hover:underline">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to blood needs
      </Link>

      {req.loading || !r ? (
        <Empty message="Loading…" />
      ) : (
        <>
          <PageHeader
            title={
              <span className="flex items-center gap-3 flex-wrap">
                Blood need at {r.hospital_name?.split(",")[0] || "hospital"}
                <BloodGroupChip bloodGroup={r.blood_group} />
                <UrgencyBadge urgency={r.urgency} />
                <StatusBadge status={r.status} />
                {r.is_proactive && <Pill tone="info">from patient schedule</Pill>}
              </span>
            }
            subtitle={`${r.units_needed} unit(s) needed · created ${formatDateTime(r.created_at)} · full hospital: ${r.hospital_name || "—"}`}
            actions={
              <>
                <button className="btn-secondary" onClick={explain} disabled={aiBusy}>
                  {aiBusy ? <Spinner /> : <Sparkles className="w-4 h-4" />}
                  Explain donor picks (AI)
                </button>
                {r.status === "failed" && (
                  <button className="btn-primary" onClick={retry}>
                    <RotateCcw className="w-4 h-4" />
                    Try again
                  </button>
                )}
              </>
            }
          />

          <RequestFlowSteps status={r.status} />

          <PatientPanel requestId={id} request={r} />

          <SmsTestPanel requestId={id} onAction={() => req.refresh()} />

          {r.status !== "fulfilled" && (
            <ResendSmsBanner
              r={r}
              busy={actionBusy === "resendSms"}
              onResend={(retryNoReply) =>
                runAction(
                  "resendSms",
                  () =>
                    endpoints.resendSms(id, {
                      batch_size: 2,
                      retry_no_reply: retryNoReply,
                    }),
                  retryNoReply
                    ? "Reminder SMS sent to donors who have not replied"
                    : "SMS sent to donors",
                )
              }
            />
          )}

          {toast && (
            <div
              className={`text-sm px-3 py-2 rounded-lg border ${
                toast.kind === "ok"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-blood-50 border-blood-200 text-blood-800"
              }`}
            >
              {toast.text}
              {toast.data?.data?.message_id && (
                <div className="text-xs text-emerald-700 mt-1">
                  SMS id: {toast.data.data.message_id}
                  {toast.data.data.phone ? ` · ${toast.data.data.phone}` : ""}
                </div>
              )}
              {toast.data?.data?.sent?.length > 0 && (
                <div className="text-xs text-emerald-700 mt-1">
                  Texted: {toast.data.data.sent.map((s) => s.name || s.phone).join(", ")}
                </div>
              )}
            </div>
          )}

          {/* Coordinator action bar — visible once outreach has started */}
          {(r.status === "reserved" ||
            r.status === "confirmed" ||
            (r.status === "outreach_sent" && r.assigned_donor_id)) && (
            <CoordinatorActions
              r={r}
              busy={actionBusy}
              onSendLocation={() =>
                runAction(
                  "location",
                  () => endpoints.sendLocation(id),
                  "Hospital location SMS sent to assigned donor",
                )
              }
              onPreConfirm={() =>
                runAction(
                  "preConfirm",
                  () => endpoints.sendPreConfirm(id),
                  "Day-before re-confirmation SMS sent",
                )
              }
              onDonated={() =>
                runAction(
                  "donated",
                  () => endpoints.markDonated(id),
                  "Request closed as fulfilled. Donor show-up rate updated.",
                )
              }
              onNoShow={() =>
                runAction(
                  "noshow",
                  () => endpoints.markNoShow(id),
                  "Marked as no-show.",
                )
              }
              onPromote={() =>
                runAction(
                  "promote",
                  () => endpoints.promoteStandby(id),
                  "Next donor contacted.",
                )
              }
            />
          )}

          {/* SMS timeline */}
          <Section
            title="Texts for this blood need"
            subtitle={
              smsStats
                ? `${smsStats.donorCount} donor(s) contacted${
                    smsStats.followUpCount
                      ? ` · ${smsStats.followUpCount} follow-up message(s)`
                      : ""
                  } for this need · newest first`
                : "Newest first"
            }
            action={
              r.status !== "fulfilled" && smsStats && smsStats.donorCount > 0 ? (
                <button
                  type="button"
                  className="text-xs text-blood-600 hover:underline"
                  disabled={actionBusy === "resendSms"}
                  onClick={() =>
                    runAction(
                      "resendSms",
                      () => endpoints.resendSms(id, { retry_no_reply: true }),
                      "Reminder SMS sent to donors with no reply yet",
                    )
                  }
                >
                  Remind donors who have not replied
                </button>
              ) : null
            }
          >
            {(r.sms_timeline || []).length === 0 ? (
              <Empty message="No texts sent yet for this blood need — use the button above to send SMS to top donors." />
            ) : (
              <ol className="space-y-3">
                {(r.sms_timeline || []).map((entry) => (
                  <SmsTimelineRow key={entry.id} entry={entry} hospitalName={r.hospital_name} />
                ))}
              </ol>
            )}
          </Section>

          {/* Matched donors */}
          <Section
            title="Best Donors for This Need"
            subtitle="Sorted by match score — 60% overall quality (ML + show-up) plus distance and urgency"
          >
            {matches.loading ? (
              <Empty message="Calculating best donors…" />
            ) : matches.data?.length === 0 ? (
              <Empty message="No eligible donors found nearby for this blood type" />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Rank</TH>
                    <TH>Donor name</TH>
                    <TH>Mobile</TH>
                    <TH>Blood</TH>
                    <TH>Distance</TH>
                    <TH>ML trust</TH>
                    <TH>Show-up</TH>
                    <TH>Overall</TH>
                    <TH>Match score</TH>
                  </tr>
                </THead>
                <tbody>
                  {matches.data?.map((m, i) => (
                    <TR key={m.donor_id}>
                      <TD className="font-mono">#{i + 1}</TD>
                      <TD>
                        <Link to={`/donors/${m.donor_id}`} className="hover:underline">
                          {m.name || m.donor_id.slice(0, 8)}
                        </Link>
                        <div className="text-xs text-ink-500">{m.city || ""}</div>
                      </TD>
                      <TD className="text-xs text-ink-600 font-mono">{m.phone || "—"}</TD>
                      <TD><BloodGroupChip bloodGroup={m.blood_group} /></TD>
                      <TD>{m.distance_km < 0 ? "—" : `${m.distance_km} km`}</TD>
                      <TD>
                        <Bar value={m.reliability_score} />
                      </TD>
                      <TD>
                        <Bar value={m.showup_rate} tone="emerald" />
                      </TD>
                      <TD>
                        <Bar value={m.overall_score} tone="amber" />
                      </TD>
                      <TD className="font-mono text-ink-900 font-semibold">
                        {m.final_rank_score.toFixed(3)}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </Section>

          {aiResult && (
            <Section
              title="Why these donors were picked"
              subtitle="Plain-language explanation from AI"
              action={
                <button
                  className="text-xs text-ink-500 hover:underline"
                  onClick={() => setAiResult(null)}
                >
                  Close
                </button>
              }
            >
              <div className="text-sm text-ink-700 mb-3">{aiResult.summary}</div>
              <ul className="space-y-2">
                {aiResult.donors.map((d) => (
                  <li
                    key={d.donor_id}
                    className="bg-indigo-50/60 border border-indigo-200 rounded-lg p-3 text-sm flex gap-3"
                  >
                    <span className="bg-indigo-600 text-white font-bold w-6 h-6 rounded-full flex items-center justify-center text-xs">
                      {d.rank}
                    </span>
                    <span className="text-ink-700">{d.explanation}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {r.escalations?.length > 0 && (
            <Section title="Search was widened">
              <ol className="space-y-2 text-sm">
                {r.escalations.map((e) => (
                  <li
                    key={e.id}
                    className="border border-amber-200 bg-amber-50 px-3 py-2 rounded-lg"
                  >
                    <div className="font-medium text-amber-900">
                      Attempt {e.escalation_level} — not enough donors replied
                    </div>
                    <div className="text-xs text-amber-700">
                      {e.donors_tried} donors contacted · search area increased to{" "}
                      {e.expanded_radius_km} km · {formatDateTime(e.triggered_at)}
                    </div>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {r.failure_reason && (
            <Section title="Why this need failed">
              <div className="text-sm bg-blood-50 border border-blood-200 text-blood-800 px-3 py-2 rounded-lg">
                {r.failure_reason}
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function ResendSmsBanner({ r, busy, onResend }) {
  const stats = timelineStats(r);
  const { donorCount, awaiting } = stats;
  const needsFirstSend = donorCount === 0;
  const canSendMore =
    r.status === "matching" ||
    r.status === "pending" ||
    r.status === "outreach_sent" ||
    r.status === "failed";

  if (r.status === "fulfilled" || !canSendMore) {
    return null;
  }

  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        needsFirstSend ? "bg-amber-50 border-amber-200" : "bg-white border-ink-200"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-ink-900">
            {needsFirstSend
              ? "Ready to contact donors"
              : awaiting > 0
                ? `${awaiting} donor(s) have not replied`
                : "Contact more donors"}
          </div>
          <p className="text-xs text-ink-600 mt-1 max-w-xl">
            {needsFirstSend
              ? "Review the ranked list below, then send a text when you are ready."
              : "Contact the next best donors, or send a reminder to those still waiting."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-1.5 text-sm"
            disabled={busy}
            onClick={() => onResend(false)}
          >
            {busy ? <Spinner /> : <Send className="w-4 h-4" />}
            {needsFirstSend ? "Send SMS to donors" : "Contact next donors"}
          </button>
          {!needsFirstSend && awaiting > 0 && (
            <button
              type="button"
              className="btn-secondary inline-flex items-center gap-1.5 text-sm"
              disabled={busy}
              onClick={() => onResend(true)}
            >
              Remind no-reply donors
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CoordinatorActions({ r, busy, onSendLocation, onPreConfirm, onDonated, onNoShow, onPromote }) {
  const isReserved = r.status === "reserved";
  const isConfirmed = r.status === "confirmed";
  return (
    <Section
      title="What You Need To Do"
      subtitle={
        r.assigned_donor_id
          ? "A donor said YES. Complete these steps until blood is received."
          : "Waiting for a donor to reply YES to the text message…"
      }
    >
      <div className="flex flex-wrap gap-2">
        <ActionBtn
          icon={<MapPin className="w-4 h-4" />}
          label={r.location_sent_at ? "Resend hospital address (SMS)" : "Send hospital address (SMS)"}
          tone="primary"
          disabled={!r.assigned_donor_id || busy === "location"}
          loading={busy === "location"}
          onClick={onSendLocation}
        />
        <ActionBtn
          icon={<Clock className="w-4 h-4" />}
          label="Send day-before reminder (SMS)"
          disabled={!isReserved || busy === "preConfirm"}
          loading={busy === "preConfirm"}
          onClick={onPreConfirm}
        />
        <ActionBtn
          icon={<CheckCircle2 className="w-4 h-4" />}
          label="Mark as donated — complete"
          tone="success"
          disabled={!r.assigned_donor_id || busy === "donated"}
          loading={busy === "donated"}
          onClick={onDonated}
        />
        <ActionBtn
          icon={<XCircle className="w-4 h-4" />}
          label="Donor did not show — use backup"
          tone="danger"
          disabled={!r.assigned_donor_id || busy === "noshow"}
          loading={busy === "noshow"}
          onClick={onNoShow}
        />
        <ActionBtn
          icon={<Users className="w-4 h-4" />}
          label="Contact next backup donors (SMS)"
          disabled={busy === "promote"}
          loading={busy === "promote"}
          onClick={onPromote}
        />
      </div>
      <div className="text-xs text-ink-500 mt-3 grid grid-cols-2 gap-x-4 gap-y-1">
        {r.reserved_at && <div>Reserved at {formatDateTime(r.reserved_at)}</div>}
        {r.location_sent_at && <div>Location sent at {formatDateTime(r.location_sent_at)}</div>}
        {r.pre_confirm_sent_at && <div>Re-confirm sent at {formatDateTime(r.pre_confirm_sent_at)}</div>}
        {r.confirmed_at && <div>Confirmed at {formatDateTime(r.confirmed_at)}</div>}
      </div>
    </Section>
  );
}

function ActionBtn({ icon, label, onClick, tone, disabled, loading }) {
  const toneClass =
    tone === "primary"
      ? "btn-primary"
      : tone === "success"
        ? "bg-emerald-600 text-white hover:bg-emerald-700"
        : tone === "danger"
          ? "bg-blood-600 text-white hover:bg-blood-700"
          : "btn-secondary";
  return (
    <button
      className={`${toneClass} inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed`}
      disabled={disabled}
      onClick={onClick}
    >
      {loading ? <Spinner /> : icon}
      {label}
    </button>
  );
}

function SmsTimelineRow({ entry, hospitalName }) {
  const kind = entry.message_kind || "outreach_request";
  const Icon =
    kind === "location"
      ? MapPin
      : kind === "pre_confirmation"
        ? Bell
        : kind === "assigned_confirmation"
          ? Heart
          : MessageSquare;

  const tone =
    entry.response_label?.includes("YES") || entry.response_label?.includes("confirmed")
      ? "border-emerald-200 bg-emerald-50/60"
      : entry.response_label?.includes("NO") || entry.response_label?.includes("cancelled")
        ? "border-blood-200 bg-blood-50/40"
        : kind === "location"
          ? "border-indigo-200 bg-indigo-50/50"
          : "border-ink-200 bg-white";

  const statusTone =
    entry.response_label?.includes("Waiting")
      ? "warn"
      : entry.response_label?.includes("YES") ||
          entry.response_label?.includes("Delivered") ||
          entry.response_label?.includes("confirmed")
        ? "success"
        : entry.response_label?.includes("NO") || entry.response_label?.includes("cancelled")
          ? "danger"
          : "default";

  return (
    <li className={`rounded-xl border p-4 ${tone}`}>
      <div className="flex gap-3">
        <div className="w-9 h-9 rounded-lg bg-white border border-ink-200 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-ink-900 text-sm">{entry.title}</div>
          <div className="text-sm text-ink-700 mt-1">
            To: <span className="font-medium">{entry.donor_name || "Donor"}</span>
            {entry.donor_phone && (
              <span className="font-mono text-ink-600"> · {entry.donor_phone}</span>
            )}
          </div>
          {kind === "location" && hospitalName && (
            <div className="text-xs text-indigo-800 mt-1">Hospital: {hospitalName}</div>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {entry.response_label && <Pill tone={statusTone}>{entry.response_label}</Pill>}
            {entry.distance_km != null && entry.distance_km >= 0 && kind === "outreach_request" && (
              <span className="text-xs text-ink-500">{entry.distance_km} km from hospital</span>
            )}
          </div>
          <div className="text-xs text-ink-500 mt-2">
            Sent {formatDateTime(entry.sent_at)}
            {entry.responded_at && ` · reply ${formatDateTime(entry.responded_at)}`}
          </div>
        </div>
      </div>
    </li>
  );
}

function Bar({ value = 0, tone = "blood" }) {
  const color =
    tone === "emerald" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : "bg-blood-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-ink-200 rounded overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${(value || 0) * 100}%` }} />
      </div>
      <span className="text-xs font-mono">{(value || 0).toFixed(2)}</span>
    </div>
  );
}

function PatientPanel({ requestId, request }) {
  const patient = usePoll(
    () =>
      request.patient_id
        ? endpoints.getPatient(request.patient_id)
        : Promise.resolve(null),
    20_000,
    [request.patient_id],
  );
  const notes = usePoll(
    () => endpoints.requestPatientNotifications(requestId),
    8_000,
    [requestId],
  );

  const p = patient.data;
  const noteList = notes.data || [];
  const trackUrl = `${window.location.origin}/track/${requestId}`;
  const successfulSms = noteList.filter((n) => !n.delivery_error);

  return (
    <Section
      title="Patient & automatic updates"
      subtitle={
        p
          ? p.self_registered
            ? "Self-registered patient — they receive automatic SMS updates."
            : "Patient receives automatic SMS updates as the status changes."
          : "No patient profile linked to this request yet."
      }
      action={
        <a
          href={trackUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-indigo-600 hover:underline"
        >
          Open patient tracking page
        </a>
      }
    >
      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-1 space-y-2 text-sm">
          {p ? (
            <>
              <div>
                <div className="text-xs text-ink-500">Patient</div>
                <div className="font-medium text-ink-900">
                  {p.name || "—"} <span className="text-ink-400">({p.blood_group})</span>
                </div>
              </div>
              <div>
                <div className="text-xs text-ink-500">Contact</div>
                <div className="font-medium text-ink-900">
                  {p.contact_name || p.name || "—"}
                  {p.relation_to_patient ? (
                    <span className="text-xs text-ink-500"> · {p.relation_to_patient}</span>
                  ) : null}
                </div>
                <div className="font-mono text-xs text-ink-700">
                  {p.phone || "no phone on file"}
                </div>
              </div>
              <div>
                <div className="text-xs text-ink-500">Hospital</div>
                <div className="text-sm text-ink-800">{p.hospital_name || "—"}</div>
              </div>
              <div className="text-[11px] text-ink-500 break-all pt-2 border-t border-ink-100">
                Tracking link: <a className="text-indigo-600 hover:underline" href={trackUrl} target="_blank" rel="noreferrer">{trackUrl}</a>
              </div>
            </>
          ) : (
            <div className="text-sm text-ink-500">
              No patient record. Patient SMS updates are only sent when a phone is on file.
            </div>
          )}
        </div>

        <div className="md:col-span-2">
          <div className="text-xs text-ink-500 mb-2">
            {successfulSms.length} update{successfulSms.length === 1 ? "" : "s"} sent to patient
            {noteList.length > successfulSms.length && (
              <span className="text-blood-700"> · {noteList.length - successfulSms.length} could not be delivered</span>
            )}
          </div>
          {noteList.length === 0 ? (
            <div className="text-sm text-ink-500 italic">
              No patient SMS sent yet. They will be sent automatically as the request moves through stages.
            </div>
          ) : (
            <ol className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {noteList.map((n) => (
                <li
                  key={n.id}
                  className={`border rounded-lg p-3 text-sm ${
                    n.delivery_error
                      ? "border-blood-200 bg-blood-50/50"
                      : "border-emerald-200 bg-emerald-50/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-medium text-ink-900">{n.title}</span>
                    <span className="text-[11px] text-ink-500">
                      {formatDateTime(n.sent_at)}
                    </span>
                  </div>
                  <div className="text-ink-700 mt-1">{n.body}</div>
                  <div className="text-[11px] text-ink-500 mt-1 flex flex-wrap gap-2">
                    <span>To: {n.phone || "—"}</span>
                    {n.message_id && (
                      <span className="font-mono">msg: {n.message_id.slice(0, 16)}</span>
                    )}
                    {n.delivery_error && (
                      <span className="text-blood-700">⚠ {n.delivery_error}</span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </Section>
  );
}
