import clsx from "clsx";

export default function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  loading = false,
}) {
  const toneClasses = {
    default: "bg-white text-ink-900",
    danger: "bg-blood-50/50 text-blood-900 border-blood-200/80",
    success: "bg-emerald-50/50 text-emerald-900 border-emerald-200/80",
    warn: "bg-amber-50/50 text-amber-900 border-amber-200/80",
    info: "bg-indigo-50/50 text-indigo-900 border-indigo-200/80",
  };
  return (
    <div className={clsx("card p-4 border", toneClasses[tone])}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-ink-500 font-medium">
            {label}
          </div>
          <div className="text-2xl font-semibold mt-1.5 tabular-nums tracking-tight">
            {loading ? "—" : value != null && value !== "" ? value : "—"}
          </div>
          {hint && <div className="text-xs text-ink-500 mt-1">{hint}</div>}
        </div>
        {Icon && <Icon className="w-5 h-5 text-ink-400" />}
      </div>
    </div>
  );
}
