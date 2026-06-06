import clsx from "clsx";
import {
  STATUS_COLORS,
  URGENCY_COLORS,
  bloodChipColor,
  statusLabel,
  urgencyLabel,
} from "../../lib/format";

export function StatusBadge({ status, className }) {
  return (
    <span
      className={clsx("badge", STATUS_COLORS[status] || "bg-ink-100 text-ink-700", className)}
    >
      {statusLabel(status)}
    </span>
  );
}

export function UrgencyBadge({ urgency, className }) {
  return (
    <span className={clsx("badge", URGENCY_COLORS[urgency] || "bg-ink-200 text-ink-700", className)}>
      {urgencyLabel(urgency)}
    </span>
  );
}

export function BloodGroupChip({ bloodGroup, className }) {
  return (
    <span
      className={clsx(
        "badge font-mono",
        bloodChipColor(bloodGroup),
        className,
      )}
    >
      {bloodGroup || "?"}
    </span>
  );
}

export function Pill({ children, tone = "default" }) {
  const tones = {
    default: "bg-ink-100 text-ink-700",
    success: "bg-emerald-100 text-emerald-700",
    danger: "bg-blood-100 text-blood-700",
    warn: "bg-amber-100 text-amber-700",
    info: "bg-indigo-100 text-indigo-700",
  };
  return <span className={`badge ${tones[tone]}`}>{children}</span>;
}
