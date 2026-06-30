// Per-browser activity log of recently opened / edited drawings.
// SSR-safe — operations no-op on the server.

import { kvGet, kvSet } from "@/storage/kv";

export type RecentKind = "opened" | "edited";

export interface RecentEntry {
  drawingId: string;
  projectId: string;
  title: string;
  kind: RecentKind;
  at: string; // ISO timestamp
}

const KEY = "recents";
const MAX = 25;

function readAll(): RecentEntry[] {
  return kvGet<RecentEntry[]>(KEY) ?? [];
}

export function recordRecent(entry: Omit<RecentEntry, "at">): void {
  if (typeof window === "undefined") return;
  const all = readAll().filter(
    (e) => !(e.drawingId === entry.drawingId && e.kind === entry.kind),
  );
  all.unshift({ ...entry, at: new Date().toISOString() });
  kvSet(KEY, all.slice(0, MAX));
}

export function listRecents(kind?: RecentKind, limit = 6): RecentEntry[] {
  const all = readAll();
  const filtered = kind ? all.filter((e) => e.kind === kind) : all;
  return filtered.slice(0, limit);
}
