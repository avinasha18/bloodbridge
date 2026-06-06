import clsx from "clsx";

export function Section({ title, subtitle, action, children, className, noPadding = false }) {
  return (
    <section
      className={clsx(
        "card overflow-hidden transition-shadow hover:shadow-md duration-300 animate-fade-up",
        className,
      )}
    >
      {(title || action) && (
        <header className="px-5 py-4 border-b border-ink-100 flex items-center justify-between gap-3 bg-gradient-to-r from-white to-ink-50/50">
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
    info: "bg-indigo-50 border-indigo-200 text-indigo-900",
    success: "bg-emerald-50 border-emerald-200 text-emerald-900",
    warn: "bg-amber-50 border-amber-200 text-amber-900",
    danger: "bg-rose-50 border-rose-200 text-rose-900",
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
