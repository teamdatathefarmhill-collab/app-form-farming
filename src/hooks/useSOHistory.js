// ─── useSOHistory — fetch & summarize SO submission history ──────────────────
// Fetches: VITE_GAS_SO_URL?sheet=so
// Returns: { soHistory, loading, refetch }
//
// soHistory shape (keyed by "GH_NAME::PERIODE"):
//   {
//     "TOHUDAN 4::26.2": { minHST: 35, checkpoints: [35] },
//     "TOHUDAN 1::26.2": { minHST: 42, checkpoints: [42] },
//   }
//
// Helper: hasCompletedCheckpoint(soHistory, gh, periode, checkpoint)
//   → true jika pernah ada submit dengan HST <= checkpoint di periode tsb

import { useState, useEffect, useCallback } from "react";
import { gasFetch } from "../utils/idb";

const SO_URL       = import.meta.env.VITE_GAS_SO_URL;
const LS_CACHE_KEY = "farmhill_sohistory_cache";
const LS_CACHE_TTL = 1000 * 60 * 15; // 15 menit

// Normalize periode ke format "26.2"
// GAS kadang return periode sebagai Date object yang ke-serialize jadi string panjang
function normalizePeriode(val) {
  if (!val) return "";
  if (typeof val === "number") return val.toFixed(1);
  const s = String(val).trim();
  // Sudah format yang benar
  if (/^\d+\.\d+$/.test(s)) return s;
  // Coba parse sebagai number (misal "26.2")
  const n = parseFloat(s);
  if (!isNaN(n) && isFinite(n)) return n.toFixed(1);
  // Fallback — return apa adanya (tidak akan match, tapi tidak crash)
  return s;
}

// Cek apakah semua key di summary sudah format "GH::26.2"
function isCacheValid(summary) {
  const keys = Object.keys(summary);
  if (keys.length === 0) return true;
  return keys.every(k => /^.+::\d+\.\d+$/.test(k));
}

function saveCache(summary) {
  try {
    localStorage.setItem(LS_CACHE_KEY, JSON.stringify({ summary, savedAt: Date.now() }));
  } catch { /* kuota penuh, skip */ }
}

function loadCache() {
  try {
    const raw = localStorage.getItem(LS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.savedAt >= LS_CACHE_TTL) return null;
    // Cache lama dengan format key yang salah (Date string) — buang
    if (!isCacheValid(parsed.summary)) {
      localStorage.removeItem(LS_CACHE_KEY);
      return null;
    }
    return parsed.summary;
  } catch {
    return null;
  }
}

// Dari array rows, build summary: key = "GH::PERIODE", value = { minHST, checkpoints[] }
function buildSummary(rows) {
  const summary = {};
  for (const row of rows) {
    const periode = normalizePeriode(row.periode);
    const key = `${row.gh}::${periode}`;
    if (!summary[key]) {
      summary[key] = { minHST: row.hst, checkpoints: [] };
    } else {
      summary[key].minHST = Math.min(summary[key].minHST, row.hst);
    }
    if (!summary[key].checkpoints.includes(row.hst)) {
      summary[key].checkpoints.push(row.hst);
    }
  }
  return summary;
}

// ─── Exported helper ─────────────────────────────────────────────────────────
// Sebuah submission dianggap "menyelesaikan" sebuah checkpoint kalau HST-nya
// jatuh di window checkpoint tsb (>= lowerBound, < upperBound) — termasuk
// submission yang telat (mis. checkpoint 35 tapi baru submit di HST 36),
// bukan cuma yang tepat waktu (hst <= checkpoint).
export function hasCompletedCheckpoint(soHistory, gh, periode, lowerBound, upperBound = Infinity) {
  const key = `${gh}::${periode}`;
  const entry = soHistory[key];
  if (!entry) return false;
  return entry.checkpoints.some(hst => hst >= lowerBound && hst < upperBound);
}

// ─── Hook ────────────────────────────────────────────────────────────────────
export function useSOHistory() {
  const [soHistory, setSoHistory] = useState({});
  const [loading, setLoading]     = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (!SO_URL) throw new Error("VITE_GAS_SO_URL tidak dikonfigurasi");
      const json = await gasFetch(`${SO_URL}?sheet=so`);
      if (!json.data) throw new Error("Response tidak valid");

      const summary = buildSummary(json.data);
      saveCache(summary);
      setSoHistory(summary);
    } catch {
      const cached = loadCache();
      if (cached) setSoHistory(cached);
      else setSoHistory({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { soHistory, loading, refetch: fetchData };
}
