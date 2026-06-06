import clsx from "clsx";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export function ChartCard({
  title,
  subtitle,
  icon,
  children,
  className,
  action,
  actionTo,
  actionLabel = "View all",
  height = "h-72",
  noPadding = false,
}) {
  return (
    <section
      className={clsx(
        "card overflow-hidden transition-shadow hover:shadow-md duration-300",
        className,
      )}
    >
      <header className="px-5 py-4 border-b border-ink-100 flex items-start justify-between gap-3 bg-gradient-to-r from-white via-white to-indigo-50/30">
        <div className="flex items-start gap-2.5 min-w-0">
          {icon && (
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
            {subtitle && <p className="text-xs text-ink-500 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {action}
        {actionTo && (
          <Link
            to={actionTo}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center gap-0.5 shrink-0"
          >
            {actionLabel} <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </header>
      <div className={clsx(noPadding ? "" : "p-4", height, "min-h-0")}>{children}</div>
    </section>
  );
}

export function ChartTooltipContent({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-ink-900 text-white px-3 py-2 text-xs shadow-xl border border-ink-700">
      {label && <div className="text-ink-400 mb-1">{label}</div>}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: p.color || p.fill }}
          />
          <span className="text-ink-200">{p.name}:</span>
          <span className="font-semibold tabular-nums">{p.value?.toLocaleString?.() ?? p.value}</span>
        </div>
      ))}
    </div>
  );
}

export function StatRing({ value, max, label, color = "#6366f1" }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const r = 36;
  const circ = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-20 h-20">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
          <circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * circ} ${circ}`}
            className="transition-all duration-700"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-ink-900 tabular-nums">
          {value}
        </span>
      </div>
      <span className="text-[10px] uppercase tracking-wide text-ink-500 text-center">{label}</span>
    </div>
  );
}
