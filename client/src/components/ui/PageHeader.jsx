import clsx from "clsx";

export default function PageHeader({ title, subtitle, actions, badge, className }) {
  return (
    <header className={clsx("mb-6 animate-fade-up", className)}>
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold text-ink-900 tracking-tight">
              {title}
            </h1>
            {badge}
          </div>
          {subtitle && (
            <p className="text-sm text-ink-500 mt-1.5 max-w-2xl leading-relaxed">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2.5 flex-wrap shrink-0">{actions}</div>
        )}
      </div>
    </header>
  );
}
