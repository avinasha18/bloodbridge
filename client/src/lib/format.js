export const BLOOD_GROUPS = [
  "O Positive", "O Negative",
  "A Positive", "A Negative",
  "B Positive", "B Negative",
  "AB Positive", "AB Negative",
];

export const URGENCY_LEVELS = ["critical", "urgent", "routine"];

/** Plain-language labels for coordinators (not engineers). */
export const STATUS_LABELS = {
  pending: "Not started",
  matching: "Donors ranked — ready to text",
  outreach_sent: "SMS sent — waiting for reply",
  reserved: "Donor assigned (said YES)",
  confirmed: "Re-confirmed for donation",
  fulfilled: "Complete — blood received",
  failed: "Could not find a donor",
};

export const URGENCY_LABELS = {
  critical: "Emergency",
  urgent: "Urgent",
  routine: "Routine",
};

export const ASSIGNMENT_ROLE_LABELS = {
  assigned: "Main donor",
  donated: "Donated",
  standby: "Backup donor",
  declined: "Said NO",
  no_show: "Did not show up",
  released: "Released",
};

export function statusLabel(status) {
  return STATUS_LABELS[status] || (status || "—").replace(/_/g, " ");
}

export function urgencyLabel(urgency) {
  return URGENCY_LABELS[urgency] || urgency || "—";
}

export const STATUS_COLORS = {
  pending: "bg-ink-100 text-ink-700",
  matching: "bg-amber-100 text-amber-800",
  outreach_sent: "bg-indigo-100 text-indigo-800",
  reserved: "bg-violet-100 text-violet-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  fulfilled: "bg-emerald-200 text-emerald-900",
  failed: "bg-blood-100 text-blood-800",
};

export const URGENCY_COLORS = {
  critical: "bg-blood-600 text-white",
  urgent: "bg-orange-500 text-white",
  routine: "bg-ink-200 text-ink-700",
};

export function formatDateTime(value) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDate(value) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function relativeTime(value) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (Number.isNaN(diff)) return "—";
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86_400)}d ago`;
}

export function bloodChipColor(bg) {
  if (!bg) return "bg-ink-100 text-ink-700";
  if (bg.endsWith("Negative")) return "bg-blood-100 text-blood-800";
  return "bg-rose-50 text-rose-700";
}
