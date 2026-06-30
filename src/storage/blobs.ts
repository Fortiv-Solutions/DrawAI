// Binary blob store backed by IndexedDB via idb-keyval.
// SSR-safe: operations no-op or reject cleanly when window is absent.

import { createStore, get, set, del, keys } from "idb-keyval";

let store: ReturnType<typeof createStore> | null = null;
function getStore() {
  if (typeof window === "undefined") return null;
  if (!store) store = createStore("drawai-blobs", "files");
  return store;
}

export async function putBlob(key: string, blob: Blob): Promise<void> {
  const s = getStore();
  if (!s) return;
  await set(key, blob, s);
}

export async function getBlob(key: string): Promise<Blob | null> {
  const s = getStore();
  if (!s) return null;
  const v = await get<Blob>(key, s);
  return v ?? null;
}

export async function deleteBlob(key: string): Promise<void> {
  const s = getStore();
  if (!s) return;
  await del(key, s);
}

export async function listBlobKeys(): Promise<string[]> {
  const s = getStore();
  if (!s) return [];
  return (await keys(s)).map(String);
}

export async function getStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
}
