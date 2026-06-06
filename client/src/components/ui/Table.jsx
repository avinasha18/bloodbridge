import clsx from "clsx";

export function Table({ children, className }) {
  return (
    <div className={clsx("card overflow-hidden", className)}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }) {
  return (
    <thead className="bg-ink-50 text-ink-600 text-xs uppercase tracking-wide">
      {children}
    </thead>
  );
}

export function TH({ children, className }) {
  return <th className={clsx("text-left px-4 py-3 font-medium", className)}>{children}</th>;
}

export function TR({ children, className, onClick }) {
  return (
    <tr
      onClick={onClick}
      className={clsx(
        "border-t border-ink-100 hover:bg-ink-50/60",
        onClick && "cursor-pointer",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function TD({ children, className }) {
  return <td className={clsx("px-4 py-3 text-ink-700 align-middle", className)}>{children}</td>;
}

export function Empty({ message = "No data" }) {
  return (
    <div className="text-center text-sm text-ink-500 py-10">
      {message}
    </div>
  );
}
