import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Activity, HandHeart, Heart, Sparkles } from "lucide-react";
import clsx from "clsx";
import { LanguageProvider, useLanguage, LANGUAGES } from "../../lib/i18n";

const NAV = [
  { to: "/donate", labelKey: "donate_panel", icon: HandHeart },
  { to: "/me", labelKey: "patient_panel", icon: Heart },
  { to: "/donor", labelKey: "donor_panel", icon: Sparkles },
];

export default function PublicLayout() {
  return (
    <LanguageProvider>
      <PublicLayoutInner />
    </LanguageProvider>
  );
}

function PublicLayoutInner() {
  const { t } = useLanguage();
  const location = useLocation();
  const showSegmented =
    location.pathname === "/" ||
    location.pathname === "/donate" ||
    location.pathname === "/me" ||
    location.pathname === "/donor" ||
    location.pathname === "/patient-register";

  return (
    <div className="min-h-full flex flex-col bg-[#f9fafb]">
      <header className="sticky top-0 z-30 bg-white border-b border-ink-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between gap-4 h-14 sm:h-[3.75rem]">
            <Link to="/donate" className="flex items-center gap-2.5 group min-w-0">
              <div className="w-8 h-8 rounded-lg bg-blood-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                B
              </div>
              <span className="font-semibold text-ink-900 text-sm hidden sm:block">
                Blood Warriors
              </span>
            </Link>

            <div className="flex items-center gap-2.5 shrink-0">
              <LanguageToggle />
              <Link
                to="/login"
                className="hidden sm:inline-flex items-center gap-1.5 text-xs text-ink-500 hover:text-ink-800 px-3 py-1.5 rounded-lg border border-ink-200 hover:border-ink-300 transition-colors font-medium"
              >
                <Activity className="w-3 h-3" />
                Coordinator
              </Link>
            </div>
          </div>

          {showSegmented && (
            <div className="pb-2.5">
              <SegmentedNav t={t} />
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 min-w-0">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <Outlet />
        </div>
      </main>

      <footer className="border-t border-ink-100 bg-white mt-auto">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-ink-400">
          <span>Blood Warriors Foundation · One donation saves up to 3 lives.</span>
          <Link to="/login" className="hover:text-ink-700 transition-colors shrink-0">
            Coordinator portal
          </Link>
        </div>
      </footer>
    </div>
  );
}

function SegmentedNav({ t }) {
  return (
    <nav
      className="flex gap-0.5 p-0.5 rounded-lg bg-ink-100/70"
      aria-label="Portal navigation"
    >
      {NAV.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className={({ isActive }) =>
              clsx(
                "flex-1 flex items-center justify-center gap-1.5 py-2 px-2 sm:px-3 rounded-md text-xs sm:text-[13px] font-medium transition-all duration-150 min-w-0",
                isActive
                  ? "bg-white text-ink-900 shadow-xs"
                  : "text-ink-500 hover:text-ink-700",
              )
            }
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{t(item.labelKey)}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

function LanguageToggle() {
  const { lang, setLang } = useLanguage();
  return (
    <div className="flex items-center bg-ink-100/70 rounded-md p-0.5">
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLang(l.code)}
          className={clsx(
            "px-2 py-1 rounded text-[11px] font-medium transition-all duration-150",
            lang === l.code
              ? "bg-white shadow-xs text-ink-900"
              : "text-ink-500 hover:text-ink-700",
          )}
        >
          {l.short}
        </button>
      ))}
    </div>
  );
}
