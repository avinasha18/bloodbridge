import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Droplets,
  Users,
  Heart,
  BarChart3,
  ExternalLink,
  LogOut,
  ChevronLeft,
  Menu,
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
  { to: "/donate", label: "Donate", tone: "blood" },
  { to: "/me", label: "Patient", tone: "emerald" },
  { to: "/donor", label: "History", tone: "indigo" },
];

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [health, setHealth] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const user = coordinatorUser();

  useEffect(() => {
    endpoints.health().then(setHealth).catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    signOutCoordinator();
    navigate("/login", { replace: true });
  };

  const sidebarWidth = collapsed ? "w-[4.5rem]" : "w-[15rem]";

  return (
    <div className="flex h-screen overflow-hidden bg-[#f7f8fb]">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink-900/20 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-white border-r border-ink-100
          transition-all duration-300 ease-out shadow-xs
          ${sidebarWidth}
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
      >
        {/* Logo */}
        <div className="shrink-0 px-4 py-5 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2.5 group min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blood-600 to-blood-700 text-white flex items-center justify-center font-bold text-sm shadow-sm shrink-0 group-hover:shadow-glow-blood transition-shadow duration-300">
              B
            </div>
            {!collapsed && (
              <div className="animate-fade-in">
                <div className="font-semibold text-ink-900 text-[13px] leading-tight">BloodBridge</div>
                <div className="text-[10px] text-ink-400 font-medium">Coordinator</div>
              </div>
            )}
          </Link>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex w-7 h-7 items-center justify-center rounded-lg text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition-colors"
          >
            <ChevronLeft className={`w-4 h-4 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 relative ${
                    isActive
                      ? "bg-blood-50/80 text-blood-700 shadow-xs"
                      : "text-ink-600 hover:bg-ink-50 hover:text-ink-900"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-blood-500" />
                    )}
                    <Icon className={`w-[18px] h-[18px] shrink-0 transition-colors ${isActive ? "text-blood-600" : "text-ink-400 group-hover:text-ink-600"}`} />
                    {!collapsed && <span>{item.label}</span>}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="shrink-0 border-t border-ink-100 mt-auto">
          {/* Public portal links */}
          {!collapsed && (
            <div className="px-4 pt-3 pb-2">
              <div className="text-[9px] uppercase tracking-widest text-ink-400 font-semibold mb-2">
                Public portals
              </div>
              <div className="flex gap-1.5">
                {PUBLIC_LINKS.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    target="_blank"
                    rel="noreferrer"
                    title={link.label}
                    className={`flex-1 text-center py-1.5 rounded-lg text-[10px] font-medium transition-all duration-200 ${
                      link.tone === "blood"
                        ? "bg-blood-50 text-blood-600 hover:bg-blood-100"
                        : link.tone === "emerald"
                          ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                          : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                    }`}
                  >
                    <ExternalLink className="w-3 h-3 mx-auto mb-0.5 opacity-50" />
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* User section */}
          <div className={`px-3 py-3 flex items-center gap-2.5 ${collapsed ? "justify-center" : ""}`}>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blood-100 to-indigo-100 text-blood-700 flex items-center justify-center text-xs font-bold shrink-0 ring-2 ring-white">
              {user?.[0]?.toUpperCase() || "C"}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-ink-800 truncate">{user || "Coordinator"}</div>
                <div className="flex items-center gap-1.5 text-[10px] text-ink-500">
                  <span className={`w-1.5 h-1.5 rounded-full ${health ? "bg-emerald-500" : "bg-amber-400"} ${health ? "animate-pulse-soft" : ""}`} />
                  {health ? "Online" : "Offline"}
                </div>
              </div>
            )}
            {!collapsed && (
              <button
                onClick={handleLogout}
                title="Sign out"
                className="p-2 rounded-lg text-ink-400 hover:text-blood-600 hover:bg-blood-50 transition-all duration-200 shrink-0"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <main className={`flex-1 h-screen overflow-y-auto overflow-x-hidden transition-all duration-300 ${collapsed ? "lg:ml-[4.5rem]" : "lg:ml-[15rem]"}`}>
        {/* Mobile top bar */}
        <div className="sticky top-0 z-30 lg:hidden bg-white/90 backdrop-blur-lg border-b border-ink-100 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg hover:bg-ink-100 text-ink-600 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blood-600 text-white flex items-center justify-center font-bold text-xs">
              B
            </div>
            <span className="font-semibold text-sm text-ink-900">BloodBridge</span>
          </div>
        </div>

        <div className="px-5 lg:px-8 py-6 max-w-[1440px] mx-auto" key={location.pathname}>
          <Outlet />
        </div>
        <FloatingAiChat />
      </main>
    </div>
  );
}
