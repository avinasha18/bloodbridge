import clsx from "clsx";

export function Section({ title, subtitle, action, children, className }) {
  return (
    <section className={clsx("card", className)}>
      {(title || action) && (
        <header className="px-5 py-4 border-b border-ink-100 flex items-center justify-between gap-3">
          <div>
            {title && (
              <h2 className="text-sm font-semibold text-ink-800">{title}</h2>
            )}
            {subtitle && (
              <p className="text-xs text-ink-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}
