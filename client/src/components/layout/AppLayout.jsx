import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Droplets,
  Users,
  Heart,
  BarChart3,
  ExternalLink,
  LogOut,
} from "lucide-react";
import { useEffect, useState } from "react";
import { endpoints } from "../../lib/api";
import { coordinatorUser, signOutCoordinator } from "../../lib/auth";
import FloatingAiChat from "../coordinator/FloatingAiChat";

const NAV = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/requests", label: "Blood Needs", icon: Droplets },
  { to: "/donors", label: "Donors", icon: Users },
  { to: "/patients", label: "Patients", icon: Heart },
  { to: "/analytics", label: "Reports", icon: BarChart3 },
];

const PUBLIC_LINKS = [
  { to: "/donate", label: "Donors", tone: "blood" },
  { to: "/me", label: "Patients", tone: "emerald" },
  { to: "/donor", label: "History", tone: "indigo" },
];

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [health, setHealth] = useState(null);
  const user = coordinatorUser();

  useEffect(() => {
    endpoints.health().then(setHealth).catch(() => setHealth(null));
  }, []);

  const handleLogout = () => {
    signOutCoordinator();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#f4f6fb]">
      {/* Fixed sidebar — never scrolls with page content */}
      <aside className="fixed inset-y-0 left-0 z-40 w-[15.5rem] flex flex-col bg-white border-r border-ink-200/80 shadow-sm">
        {/* Logo */}
        <div className="shrink-0 px-4 py-4 border-b border-ink-100">
          <Link to="/dashboard" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blood-600 to-rose-700 text-white flex items-center justify-center font-bold text-sm shadow-md">
              B
            </div>
            <div>
              <div className="font-semibold text-ink-900 text-sm leading-tight">BloodBridge</div>
              <div className="text-[10px] text-ink-400 uppercase tracking-wider">Coordinator</div>
            </div>
          </Link>
        </div>

        {/* Nav — compact, no scroll needed on normal screens */}
        <nav className="shrink-0 p-2 space-y-0.5">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all duration-200 ${
                    isActive
                      ? "bg-gradient-to-r from-blood-50 to-indigo-50 text-blood-800 font-semibold shadow-sm border border-blood-100/80"
                      : "text-ink-600 hover:bg-ink-50 hover:text-ink-900"
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom block — always pinned */}
        <div className="mt-auto shrink-0 border-t border-ink-100">
          <div className="px-3 py-2.5">
            <div className="text-[9px] uppercase tracking-wider text-ink-400 px-1 mb-1.5 font-semibold">
              Public portals
            </div>
            <div className="flex gap-1">
              {PUBLIC_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  target="_blank"
                  rel="noreferrer"
                  title={link.label}
                  className={`flex-1 text-center py-1.5 rounded-lg text-[10px] font-medium transition-colors ${
                    link.tone === "blood"
                      ? "bg-blood-50 text-blood-700 hover:bg-blood-100"
                      : link.tone === "emerald"
                        ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                  }`}
                >
                  <ExternalLink className="w-3 h-3 mx-auto mb-0.5 opacity-60" />
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="px-3 py-3 bg-ink-50/80 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-200 to-blood-200 text-blood-800 flex items-center justify-center text-[10px] font-bold shrink-0">
                {user?.[0]?.toUpperCase() || "C"}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-ink-900 truncate">{user || "Coordinator"}</div>
                <div className="flex items-center gap-1 text-[10px] text-ink-500">
                  <span className={`w-1.5 h-1.5 rounded-full ${health ? "bg-emerald-500" : "bg-amber-400"}`} />
                  {health ? "Connected" : "Offline"}
                </div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="p-1.5 rounded-lg text-ink-400 hover:text-blood-700 hover:bg-blood-50 transition-colors shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main — only this area scrolls */}
      <main className="flex-1 ml-[15.5rem] h-screen overflow-y-auto overflow-x-hidden">
        <div className="px-5 lg:px-8 py-6 max-w-[1440px] mx-auto coord-page" key={location.pathname}>
          <Outlet />
        </div>
        <FloatingAiChat />
      </main>
    </div>
  );
}
