import clsx from "clsx";
import { Link } from "react-router-dom";

export function Table({ children, className, stickyHeader = true }) {
  return (
    <div className={clsx("overflow-x-auto", className)}>
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  );
}

export function THead({ children, sticky = true }) {
  return (
    <thead
      className={clsx(
        "bg-ink-50/80 text-ink-500 text-[11px] uppercase tracking-wider border-b border-ink-100",
        sticky && "sticky top-0 z-10",
      )}
    >
      {children}
    </thead>
  );
}

export function TH({ children, className, align = "left" }) {
  return (
    <th
      className={clsx(
        "px-4 py-3 font-semibold whitespace-nowrap",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function TR({ children, className, onClick, highlight = false }) {
  return (
    <tr
      onClick={onClick}
      className={clsx(
        "group border-b border-ink-100/80 last:border-b-0 transition-colors duration-150",
        "hover:bg-ink-50/60",
        onClick && "cursor-pointer",
        highlight && "bg-blood-50/30 hover:bg-blood-50/50",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function TD({ children, className, muted = false, primary = false, align = "left" }) {
  return (
    <td
      className={clsx(
        "px-4 py-3.5 align-middle",
        muted ? "text-ink-500 text-xs" : "text-ink-700",
        primary && "font-medium text-ink-900",
        align === "center" && "text-center",
        align === "right" && "text-right",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function Empty({ message = "No data", icon: Icon, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      {Icon && (
        <div className="w-14 h-14 rounded-2xl bg-ink-50 text-ink-300 flex items-center justify-center mb-4">
          <Icon className="w-6 h-6" />
        </div>
      )}
      <p className="text-sm text-ink-500 max-w-xs">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function TableLink({ to, children, className }) {
  return (
    <Link
      to={to}
      className={clsx(
        "font-medium text-ink-900 hover:text-blood-600 transition-colors duration-200 inline-flex items-center gap-1 group/link",
        className,
      )}
    >
      {children}
      <span className="opacity-0 group-hover/link:opacity-100 transition-opacity text-blood-500">→</span>
    </Link>
  );
}
