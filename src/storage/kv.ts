// Typed localStorage adapter. SSR-safe (returns null on server).
// Keep this file the ONLY direct consumer of localStorage for app data.

const PREFIX = "drawai.v1.";

function safeWindow(): Window | null {
  return typeof window !== "undefined" ? window : null;
}

export function kvGet<T>(key: string): T | null {
  const w = safeWindow();
  if (!w) return null;
  const raw = w.localStorage.getItem(PREFIX + key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function kvSet<T>(key: string, value: T): void {
  const w = safeWindow();
  if (!w) return;
  w.localStorage.setItem(PREFIX + key, JSON.stringify(value));
}

export function kvDel(key: string): void {
  const w = safeWindow();
  if (!w) return;
  w.localStorage.removeItem(PREFIX + key);
}
