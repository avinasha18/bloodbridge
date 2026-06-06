import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Activity, HandHeart, Heart, Sparkles } from "lucide-react";
import { LanguageProvider, useLanguage, LANGUAGES } from "../../lib/i18n";

const NAV = [
  {
    to: "/donate",
    labelKey: "donate_panel",
    icon: HandHeart,
    sub: "Open needs near you",
    accent: "blood",
  },
  {
    to: "/me",
    labelKey: "patient_panel",
    icon: Heart,
    sub: "I need blood",
    accent: "emerald",
  },
  {
    to: "/donor",
    labelKey: "donor_panel",
    icon: Sparkles,
    sub: "My donation history",
    accent: "indigo",
  },
];

export default function PublicLayout() {
  return (
    <LanguageProvider>
      <PublicLayoutInner />
    </LanguageProvider>
  );
}

const ACCENT = {
  blood: {
    bg: "bg-blood-50",
    text: "text-blood-700",
    iconBg: "bg-blood-100 text-blood-700",
    activeRing: "ring-1 ring-blood-200",
    sub: "text-blood-700/70",
  },
  emerald: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    iconBg: "bg-emerald-100 text-emerald-700",
    activeRing: "ring-1 ring-emerald-200",
    sub: "text-emerald-700/70",
  },
  indigo: {
    bg: "bg-indigo-50",
    text: "text-indigo-700",
    iconBg: "bg-indigo-100 text-indigo-700",
    activeRing: "ring-1 ring-indigo-200",
    sub: "text-indigo-700/70",
  },
};

function PublicLayoutInner() {
  const { t } = useLanguage();
  const location = useLocation();
  // Show the rich segmented nav on top-level public routes only (not on /track/:id)
  const showSegmented =
    location.pathname === "/" ||
    location.pathname === "/donate" ||
    location.pathname === "/me" ||
    location.pathname === "/donor" ||
    location.pathname === "/patient-register";

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
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <Link
              to="/login"
              className="hidden md:flex items-center gap-2 text-xs text-ink-500 hover:text-ink-800 border border-ink-200 px-3 py-1.5 rounded-full"
            >
              <Activity className="w-3.5 h-3.5" />
              Coordinator
            </Link>
          </div>
        </div>

        {showSegmented && (
          <div className="border-t border-ink-100">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
              <SegmentedNav t={t} />
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 min-w-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
          <Outlet />
        </div>
      </main>

      <footer className="border-t border-ink-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between text-xs text-ink-500">
          <span>Blood Warriors Foundation · One donation saves up to 3 lives.</span>
          <Link to="/login" className="hover:text-ink-800">
            Coordinator portal
          </Link>
        </div>
      </footer>
    </div>
  );
}

function SegmentedNav({ t }) {
  return (
    <nav className="grid grid-cols-3 gap-2 sm:gap-3">
      {NAV.map((item) => {
        const Icon = item.icon;
        const accent = ACCENT[item.accent];
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className={({ isActive }) =>
              `group flex items-center gap-2.5 sm:gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                isActive
                  ? `${accent.bg} ${accent.activeRing} border-transparent shadow-sm`
                  : "bg-white border-ink-200 hover:border-ink-300 hover:shadow-sm"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div
                  className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0 ${accent.iconBg}`}
                >
                  <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-w-0">
                  <div
                    className={`text-sm font-semibold leading-tight truncate ${
                      isActive ? accent.text : "text-ink-900"
                    }`}
                  >
                    {t(item.labelKey)}
                  </div>
                  <div className={`text-[11px] truncate ${isActive ? accent.sub : "text-ink-500"}`}>
                    {item.sub}
                  </div>
                </div>
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
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
