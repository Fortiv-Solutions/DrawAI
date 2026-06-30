// Lightweight mock auth. Replace with real JWT flow against FastAPI later.
const KEY = "drawai.auth";

export function isAuthed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY) === "1";
}

export function signIn() {
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, "1");
}

export function signOut() {
  if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
}
