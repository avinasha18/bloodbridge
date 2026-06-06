import clsx from "clsx";
import {
  STATUS_COLORS,
  STATUS_DOT_COLORS,
  URGENCY_COLORS,
  URGENCY_DOT_COLORS,
  bloodChipColor,
  statusLabel,
  urgencyLabel,
} from "../../lib/format";

export function StatusBadge({ status, className, compact = false }) {
  const label = statusLabel(status);
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-lg font-medium border",
        compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        STATUS_COLORS[status] || "bg-ink-50 text-ink-700 border-ink-200",
        className,
      )}
    >
      <span
        className={clsx(
          "rounded-full shrink-0",
          compact ? "w-1.5 h-1.5" : "w-2 h-2",
          STATUS_DOT_COLORS[status] || "bg-ink-400",
          status === "matching" && "animate-pulse-soft",
        )}
      />
      {label}
    </span>
  );
}

export function UrgencyBadge({ urgency, className, compact = false }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-lg font-semibold border",
        compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        URGENCY_COLORS[urgency] || "bg-ink-50 text-ink-700 border-ink-200",
        className,
      )}
    >
      <span
        className={clsx(
          "rounded-full shrink-0",
          compact ? "w-1.5 h-1.5" : "w-2 h-2",
          URGENCY_DOT_COLORS[urgency] || "bg-ink-400",
          urgency === "critical" && "animate-pulse-soft",
        )}
      />
      {urgencyLabel(urgency)}
    </span>
  );
}

export function BloodGroupChip({ bloodGroup, className, size = "md" }) {
  const sizes = {
    sm: "px-2 py-0.5 text-[11px]",
    md: "px-2.5 py-1 text-xs",
    lg: "px-3 py-1.5 text-sm",
  };
  const short = (bloodGroup || "?")
    .replace("Positive", "+")
    .replace("Negative", "−");
  return (
    <span
      className={clsx(
        "inline-flex items-center font-semibold rounded-lg border tabular-nums tracking-tight",
        sizes[size],
        bloodChipColor(bloodGroup),
        className,
      )}
      title={bloodGroup}
    >
      {short}
    </span>
  );
}

export function Pill({ children, tone = "default", dot = false, className }) {
  const tones = {
    default: "bg-ink-50 text-ink-700 border-ink-200/80",
    success: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
    danger: "bg-blood-50 text-blood-700 border-blood-200/80",
    warn: "bg-amber-50 text-amber-700 border-amber-200/80",
    info: "bg-indigo-50 text-indigo-700 border-indigo-200/80",
    violet: "bg-violet-50 text-violet-700 border-violet-200/80",
  };
  const dotColors = {
    default: "bg-ink-400",
    success: "bg-emerald-500",
    danger: "bg-blood-500",
    warn: "bg-amber-500",
    info: "bg-indigo-500",
    violet: "bg-violet-500",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-md text-[11px] font-medium border px-2 py-0.5",
        tones[tone],
        className,
      )}
    >
      {dot && <span className={clsx("w-1.5 h-1.5 rounded-full", dotColors[tone])} />}
      {children}
    </span>
  );
}
