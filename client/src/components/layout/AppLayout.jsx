import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Droplets,
  Users,
  Heart,
  BarChart3,
  Bot,
  Sliders,
  Activity,
  ExternalLink,
  LogOut,
} from "lucide-react";
import { useEffect, useState } from "react";
import { endpoints } from "../../lib/api";
import { coordinatorUser, signOutCoordinator } from "../../lib/auth";

const NAV = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/requests", label: "Blood Needs", icon: Droplets },
  { to: "/donors", label: "Donor List", icon: Users },
  { to: "/patients", label: "Patients", icon: Heart },
  { to: "/analytics", label: "Reports", icon: BarChart3 },
  { to: "/ai", label: "Ask AI", icon: Bot },
  // { to: "/protocols", label: "Outreach Settings", icon: Sliders },
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
    <div className="min-h-full flex bg-ink-50">
      <aside className="w-64 bg-white border-r border-ink-200 flex flex-col">
        <div className="px-5 py-5 border-b border-ink-200 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blood-600 text-white flex items-center justify-center font-bold">
            B
          </div>
          <div>
            <div className="font-semibold text-ink-900 leading-tight">
              BloodBridge
            </div>
            <div className="text-[11px] text-ink-500 leading-tight">
              Coordinator Portal
            </div>
          </div>
        </div>

        <nav className="p-3 space-y-1 flex-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? "bg-blood-50 text-blood-700 font-medium"
                      : "text-ink-600 hover:bg-ink-100"
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="px-3 pb-2">
          <div className="text-[10px] uppercase tracking-wide text-ink-400 px-2 mb-1">
            Public portals
          </div>
          <div className="space-y-1.5">
            <Link
              to="/donate"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs bg-blood-50 text-blood-700 hover:bg-blood-100"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Donor landing
            </Link>
            <Link
              to="/me"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Patient dashboard
            </Link>
            <Link
              to="/donor"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Donor dashboard
            </Link>
            <Link
              to="/patient-register"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs bg-ink-100 text-ink-700 hover:bg-ink-200"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Patient registration
            </Link>
          </div>
        </div>

        <div className="border-t border-ink-200 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-blood-50 text-blood-700 flex items-center justify-center text-xs font-semibold">
                {user?.[0]?.toUpperCase() || "C"}
              </div>
              <div className="text-xs leading-tight min-w-0">
                <div className="font-medium text-ink-900 truncate">
                  {user || "Coordinator"}
                </div>
                <div className="text-ink-500 truncate">signed in</div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="text-ink-400 hover:text-blood-700 p-1 rounded hover:bg-blood-50"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
          <div className="border-t border-ink-100 pt-2 text-[11px] text-ink-500 space-y-0.5">
            <div className="flex items-center gap-2">
              <Activity className="w-3 h-3 text-emerald-500" />
              <span>
                {health ? "Connected" : "Not connected"}
                {health?.sns_using_mocks ? " · test SMS" : health ? " · real SMS" : ""}
              </span>
            </div>
            <div>v{health?.version || "—"} · {health?.environment || "—"}</div>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <div className="px-8 py-6 max-w-[1400px] mx-auto" key={location.pathname}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
