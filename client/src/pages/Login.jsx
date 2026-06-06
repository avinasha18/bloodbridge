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
    <div className="min-h-screen bg-ink-50 flex flex-col">
      <header className="px-5 py-4 border-b border-ink-200 bg-white">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link to="/donate" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blood-600 text-white flex items-center justify-center font-bold">
              B
            </div>
            <div>
              <div className="font-semibold text-ink-900 leading-tight">
                Blood Warriors
              </div>
              <div className="text-[11px] text-ink-500 leading-tight">
                Coordinator portal sign-in
              </div>
            </div>
          </Link>
          <Link
            to="/donate"
            className="text-xs text-ink-500 hover:text-ink-800 inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to public site
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="card p-7 animate-fade-up">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-blood-50 text-blood-700 flex items-center justify-center">
                <LogIn className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-ink-900">Coordinator sign-in</h1>
                <p className="text-xs text-ink-500">
                  Internal access only · this portal manages live blood needs
                </p>
              </div>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <Field
                label="Username"
                icon={<User className="w-4 h-4" />}
                input={
                  <input
                    className="input pl-9"
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
                    className="input pl-9"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                }
              />

              {error && (
                <div className="bg-blood-50 border border-blood-100 text-blood-800 text-sm rounded-lg px-3 py-2 flex items-center gap-2 animate-pop-in">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="btn-primary w-full"
                disabled={loading}
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>

            <div className="mt-5 text-[11px] text-ink-500 border-t border-ink-100 pt-3">
              Patients and donors don't need a password — sign in to your dashboard with your mobile number from the public site.
            </div>
          </div>

          <div className="mt-4 text-center text-xs text-ink-500">
            <Link to="/donate" className="hover:text-ink-800">
              Browse open blood needs
            </Link>{" "}
            ·{" "}
            <Link to="/me" className="hover:text-ink-800">
              I'm a patient
            </Link>{" "}
            ·{" "}
            <Link to="/donor" className="hover:text-ink-800">
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
      <span className="text-xs font-medium text-ink-600">{label}</span>
      <div className="relative mt-1">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400">
          {icon}
        </span>
        {input}
      </div>
    </label>
  );
}
