export const BLOOD_GROUPS = [
  "O Positive", "O Negative",
  "A Positive", "A Negative",
  "B Positive", "B Negative",
  "AB Positive", "AB Negative",
];

const BLOOD_GROUP_SET = new Set(BLOOD_GROUPS);

/** True for the 8 standard ABO/Rh groups used in forms and matching. */
export function isStandardBloodGroup(bg) {
  if (!bg) return false;
  return BLOOD_GROUP_SET.has(String(bg).trim());
}

/** Consistent chart ordering (universal donor first, then A/B/AB). */
export const BLOOD_GROUP_CHART_ORDER = BLOOD_GROUPS;

export function filterStandardShortages(shortages = []) {
  return (shortages || []).filter(isStandardBloodGroup);
}

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
  pending: "bg-slate-50 text-slate-700 border-slate-200",
  matching: "bg-amber-50 text-amber-800 border-amber-200",
  outreach_sent: "bg-sky-50 text-sky-800 border-sky-200",
  reserved: "bg-violet-50 text-violet-800 border-violet-200",
  confirmed: "bg-emerald-50 text-emerald-800 border-emerald-200",
  fulfilled: "bg-emerald-100 text-emerald-900 border-emerald-300",
  failed: "bg-rose-50 text-rose-800 border-rose-200",
};

export const STATUS_DOT_COLORS = {
  pending: "bg-slate-400",
  matching: "bg-amber-500",
  outreach_sent: "bg-sky-500",
  reserved: "bg-violet-500",
  confirmed: "bg-emerald-500",
  fulfilled: "bg-emerald-600",
  failed: "bg-rose-500",
};

export const URGENCY_COLORS = {
  critical: "bg-rose-600 text-white border-rose-700 shadow-sm",
  urgent: "bg-orange-500 text-white border-orange-600",
  routine: "bg-slate-100 text-slate-600 border-slate-200",
};

export const URGENCY_DOT_COLORS = {
  critical: "bg-white",
  urgent: "bg-white",
  routine: "bg-slate-400",
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
  if (!bg) return "bg-slate-50 text-slate-600 border-slate-200";
  if (bg.startsWith("O")) return "bg-rose-50 text-rose-800 border-rose-200";
  if (bg.startsWith("A")) return "bg-red-50 text-red-800 border-red-200";
  if (bg.startsWith("B")) return "bg-orange-50 text-orange-900 border-orange-200";
  if (bg.startsWith("AB")) return "bg-violet-50 text-violet-800 border-violet-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}
