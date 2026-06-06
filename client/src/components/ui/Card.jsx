import clsx from "clsx";

export function Section({ title, subtitle, action, children, className, noPadding = false }) {
  return (
    <section
      className={clsx(
        "card overflow-hidden animate-fade-up",
        className,
      )}
    >
      {(title || action) && (
        <header className="px-5 py-4 border-b border-ink-100/80 flex items-center justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
            )}
            {subtitle && (
              <p className="text-xs text-ink-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          {action}
        </header>
      )}
      <div className={clsx(noPadding ? "" : "p-5")}>{children}</div>
    </section>
  );
}

export function InfoBanner({ children, tone = "info", className }) {
  const tones = {
    info: "bg-indigo-50 border-indigo-200/80 text-indigo-800",
    success: "bg-emerald-50 border-emerald-200/80 text-emerald-800",
    warn: "bg-amber-50 border-amber-200/80 text-amber-800",
    danger: "bg-rose-50 border-rose-200/80 text-rose-800",
  };
  return (
    <div
      className={clsx(
        "rounded-xl border px-4 py-3 text-sm leading-relaxed animate-fade-up",
        tones[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}
