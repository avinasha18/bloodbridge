import { Link, NavLink, Outlet } from "react-router-dom";
import {
  Activity,
  HandHeart,
  Heart,
  Search,
  Sparkles,
  User,
  Languages,
} from "lucide-react";
import { LanguageProvider, useLanguage, LANGUAGES } from "../../lib/i18n";

const NAV = [
  { to: "/donate", labelKey: "donate_panel", icon: HandHeart },
  { to: "/me", labelKey: "patient_panel", icon: Heart },
  { to: "/donor", labelKey: "donor_panel", icon: Sparkles },
  { to: "/track", labelKey: "track_panel", icon: Search },
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
  return (
    <div className="min-h-full flex flex-col bg-ink-50">
      <header className="bg-white border-b border-ink-200 sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <Link to="/donate" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-lg bg-blood-600 text-white flex items-center justify-center font-bold shadow-sm group-hover:shadow-md transition-shadow">
              B
            </div>
            <div>
              <div className="font-semibold text-ink-900 leading-tight">
                Blood Warriors
              </div>
              <div className="text-[11px] text-ink-500 leading-tight">
                Real-time donor network
              </div>
            </div>
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            {NAV.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                      isActive
                        ? "bg-blood-50 text-blood-700 font-medium shadow-sm"
                        : "text-ink-700 hover:bg-ink-100"
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  {t(item.labelKey)}
                </NavLink>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <Link
              to="/dashboard"
              className="hidden md:flex items-center gap-2 text-xs text-ink-500 hover:text-ink-800"
            >
              <Activity className="w-3.5 h-3.5" />
              Coordinator
            </Link>
          </div>
        </div>
        <nav className="sm:hidden border-t border-ink-100 px-4 py-2 flex items-center gap-1 overflow-x-auto">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap ${
                    isActive
                      ? "bg-blood-50 text-blood-700 font-medium"
                      : "text-ink-700 hover:bg-ink-100"
                  }`
                }
              >
                <Icon className="w-3.5 h-3.5" />
                {t(item.labelKey)}
              </NavLink>
            );
          })}
        </nav>
      </header>

      <main className="flex-1 min-w-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
          <Outlet />
        </div>
      </main>

      <footer className="border-t border-ink-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between text-xs text-ink-500">
          <span>Blood Warriors Foundation · One donation saves up to 3 lives.</span>
          <Link to="/dashboard" className="hover:text-ink-800">
            Coordinator portal
          </Link>
        </div>
      </footer>
    </div>
  );
}

function LanguageToggle() {
  const { lang, setLang } = useLanguage();
  return (
    <div className="hidden md:flex items-center gap-1 bg-ink-100 rounded-full p-0.5">
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          onClick={() => setLang(l.code)}
          className={`px-2 py-1 rounded-full text-[11px] font-medium transition-colors ${
            lang === l.code
              ? "bg-white shadow-sm text-ink-900"
              : "text-ink-600 hover:text-ink-900"
          }`}
        >
          {l.short}
        </button>
      ))}
    </div>
  );
}
