/** Unified chart + portal color palette for the coordinator UI. */

import {
  BLOOD_GROUP_CHART_ORDER,
  filterStandardShortages,
} from "./format";

export const palette = {
  blood: "#e11d48",
  bloodDark: "#be123c",
  bloodLight: "#fda4af",
  indigo: "#6366f1",
  indigoDark: "#4f46e5",
  violet: "#8b5cf6",
  emerald: "#10b981",
  emeraldDark: "#059669",
  amber: "#f59e0b",
  orange: "#f97316",
  slate: "#64748b",
  slateLight: "#94a3b8",
  grid: "#e2e8f0",
  tooltipBg: "#0f172a",
};

/** Per blood-group bar colors (short label → hex). */
export const BLOOD_GROUP_BAR = {
  "O+": "#e11d48",
  "O−": "#9f1239",
  "A+": "#f97316",
  "A−": "#ea580c",
  "B+": "#8b5cf6",
  "B−": "#7c3aed",
  "AB+": "#6366f1",
  "AB−": "#4f46e5",
};

export function bloodGroupBarColor(shortLabel, isCritical = false) {
  if (isCritical) return palette.blood;
  return BLOOD_GROUP_BAR[shortLabel] || palette.indigo;
}

export function shortBloodGroup(bg) {
  if (!bg) return "?";
  return bg.replace("Positive", "+").replace("Negative", "−");
}

/** Supply bar chart rows — standard groups only, fixed order. */
export function buildSupplyChartData(supply = {}, criticalShortages = []) {
  const critical = new Set(filterStandardShortages(criticalShortages));
  return BLOOD_GROUP_CHART_ORDER.filter((bg) => (supply[bg] ?? 0) > 0).map((bg) => {
    const short = shortBloodGroup(bg);
    const isCritical = critical.has(bg);
    return {
      name: short,
      fullName: bg,
      eligible: supply[bg],
      critical: isCritical,
      fill: bloodGroupBarColor(short, isCritical),
    };
  });
}

export const RELIABILITY_PIE = ["#10b981", "#f59e0b", "#e11d48"];

export const LINE_SERIES = {
  sent: { stroke: palette.slateLight, name: "SMS sent" },
  responded: { stroke: palette.indigo, name: "Replied" },
  accepted: { stroke: palette.emerald, name: "Accepted" },
};

export const chartTooltipStyle = {
  contentStyle: {
    background: palette.tooltipBg,
    border: "none",
    borderRadius: 10,
    fontSize: 12,
    color: "#f8fafc",
    boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
  },
  itemStyle: { color: "#e2e8f0" },
  labelStyle: { color: "#94a3b8", marginBottom: 4 },
  cursor: { fill: "rgba(99, 102, 241, 0.06)" },
};

export const axisTick = { fontSize: 11, fill: palette.slate };

export function formatChartNumber(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString();
}
