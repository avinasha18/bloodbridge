import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LogIn, Lock, User, AlertCircle, ArrowLeft } from "lucide-react";
import { isCoordinatorAuthed, signInCoordinator } from "../lib/auth";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isCoordinatorAuthed()) {
      navigate(location.state?.from || "/dashboard", { replace: true });
    }
  }, []);

  const onSubmit = (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setTimeout(() => {
      const res = signInCoordinator(username, password);
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      navigate(location.state?.from || "/dashboard", { replace: true });
    }, 200);
  };

  return (
    <div className="min-h-screen bg-[#f7f8fb] flex flex-col">
      <header className="px-5 py-4 bg-white border-b border-ink-100 shadow-xs">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link to="/donate" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blood-600 to-blood-700 text-white flex items-center justify-center font-bold text-sm shadow-sm group-hover:shadow-glow-blood transition-shadow duration-300">
              B
            </div>
            <div>
              <div className="font-semibold text-ink-900 leading-tight">
                Blood Warriors
              </div>
              <div className="text-[11px] text-ink-400 leading-tight">
                Coordinator portal
              </div>
            </div>
          </Link>
          <Link
            to="/donate"
            className="text-xs text-ink-500 hover:text-ink-800 inline-flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to public site
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[420px]">
          <div className="card p-8 shadow-elevated animate-fade-up">
            <div className="flex items-center gap-3.5 mb-6">
              <div className="w-11 h-11 rounded-xl bg-blood-50 text-blood-600 flex items-center justify-center">
                <LogIn className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-ink-900">Sign in</h1>
                <p className="text-xs text-ink-500 mt-0.5">
                  Internal access · manages live blood needs
                </p>
              </div>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <Field
                label="Username"
                icon={<User className="w-4 h-4" />}
                input={
                  <input
                    className="input pl-10"
                    autoComplete="username"
                    placeholder="wetwo"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    autoFocus
                  />
                }
              />
              <Field
                label="Password"
                icon={<Lock className="w-4 h-4" />}
                input={
                  <input
                    className="input pl-10"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                }
              />

              {error && (
                <div className="bg-blood-50 border border-blood-100 text-blood-700 text-sm rounded-xl px-3.5 py-2.5 flex items-center gap-2 animate-scale-in">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="btn-primary w-full !py-3"
                disabled={loading}
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>

            <div className="mt-6 text-[11px] text-ink-400 border-t border-ink-100 pt-4 leading-relaxed">
              Patients and donors don't need a password — use your mobile number on the public site.
            </div>
          </div>

          <div className="mt-5 text-center text-xs text-ink-500 flex items-center justify-center gap-2">
            <Link to="/donate" className="hover:text-ink-800 transition-colors">
              Open blood needs
            </Link>
            <span className="text-ink-300">·</span>
            <Link to="/me" className="hover:text-ink-800 transition-colors">
              I'm a patient
            </Link>
            <span className="text-ink-300">·</span>
            <Link to="/donor" className="hover:text-ink-800 transition-colors">
              I'm a donor
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function Field({ label, icon, input }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-ink-600 mb-1.5 block">{label}</span>
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400">
          {icon}
        </span>
        {input}
      </div>
    </label>
  );
}
