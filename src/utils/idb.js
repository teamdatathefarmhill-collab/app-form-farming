// ─── Shared IndexedDB helpers ─────────────────────────────────────────────────
// Setiap app punya DB sendiri agar datanya tidak bentrok
// dbName: "SanitasiOfflineDB" | "HPTOfflineDB" | "GramasiOfflineDB"

const STORE = "pending";

export function openDB(dbName) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

export async function idbAdd(dbName, record) {
  const db = await openDB(dbName);
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).add(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

export async function idbGetAll(dbName) {
  const db = await openDB(dbName);
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

export async function idbDelete(dbName, id) {
  const db = await openDB(dbName);
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  });
}

export async function idbCount(dbName) {
  const db = await openDB(dbName);
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

// ─── Token endpoint GAS (dicek server-side, lihat gas/*.js checkAppToken) ────
export const APP_TOKEN = import.meta.env.VITE_APP_TOKEN;

function withToken(url) {
  if (!APP_TOKEN) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}token=${encodeURIComponent(APP_TOKEN)}`;
}

// ─── Fetch helper shared (GET) ────────────────────────────────────────────────
export async function gasFetch(url, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(withToken(url), { signal: controller.signal, redirect: "follow" });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ─── Fetch helper shared (POST) — selipkan token ke body ─────────────────────
export async function gasPost(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ ...payload, token: APP_TOKEN }),
    redirect: "follow",
  });
  return await res.json();
}
