import { StatusBadge } from "./ui/Badge";
import { statusLabel } from "../lib/format";

const FLOW = [
  { key: "create", label: "Need created", statuses: ["pending"] },
  { key: "rank", label: "Donors ranked", statuses: ["matching"] },
  { key: "sms", label: "SMS sent", statuses: ["outreach_sent"] },
  { key: "assigned", label: "Donor assigned", statuses: ["reserved"] },
  { key: "confirmed", label: "Re-confirmed", statuses: ["confirmed"] },
  { key: "done", label: "Complete", statuses: ["fulfilled"] },
];

function stepIndex(status) {
  if (status === "failed") return -1;
  for (let i = 0; i < FLOW.length; i++) {
    if (FLOW[i].statuses.includes(status)) return i;
  }
  if (status === "fulfilled") return FLOW.length - 1;
  return 0;
}

export default function RequestFlowSteps({ status }) {
  const current = stepIndex(status);
  const failed = status === "failed";

  return (
    <div className="bg-white border border-ink-200 rounded-xl p-4">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="text-sm font-semibold text-ink-900">Where is this request now?</div>
        <StatusBadge status={status} />
      </div>

      {failed ? (
        <p className="text-sm text-blood-800 bg-blood-50 border border-blood-200 rounded-lg px-3 py-2">
          This need could not be filled in time. You can retry from the button above, or create a
          new request.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1 items-center">
            {FLOW.map((step, i) => {
              const done = i < current;
              const active = i === current;
              return (
                <div key={step.key} className="flex items-center gap-1">
                  <div
                    className={`text-xs px-2 py-1 rounded-full border ${
                      active
                        ? "bg-blood-600 text-white border-blood-600 font-medium"
                        : done
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                          : "bg-ink-50 text-ink-400 border-ink-200"
                    }`}
                  >
                    {step.label}
                  </div>
                  {i < FLOW.length - 1 && (
                    <span className="text-ink-300 text-xs mx-0.5">→</span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-ink-500 mt-2">
            Current step: <strong>{statusLabel(status)}</strong>
            {status === "matching" && " — send SMS to donors when you are ready."}
            {status === "outreach_sent" && " — scroll down to see texts sent and donor replies."}
            {(status === "reserved" || status === "confirmed") &&
              " — use the action buttons below to send location and mark the outcome."}
          </p>
        </>
      )}
    </div>
  );
}
