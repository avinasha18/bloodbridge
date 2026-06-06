const STORAGE_KEY = "bw_coord_auth";

const CREDENTIALS = {
  wetwo: "wetwo",
};

export function isCoordinatorAuthed() {
  if (typeof window === "undefined") return false;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (!v) return false;
    const parsed = JSON.parse(v);
    return Boolean(parsed?.user);
  } catch {
    return false;
  }
}

export function coordinatorUser() {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null")?.user || null;
  } catch {
    return null;
  }
}

export function signInCoordinator(username, password) {
  const u = (username || "").trim().toLowerCase();
  const p = (password || "").trim();
  if (CREDENTIALS[u] && CREDENTIALS[u] === p) {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ user: u, signedInAt: new Date().toISOString() }),
    );
    return { ok: true, user: u };
  }
  return { ok: false, error: "Wrong username or password" };
}

export function signOutCoordinator() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
