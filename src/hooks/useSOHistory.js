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
const LS_CACHE_TTL = 1000 * 60 * 15; // 15 menit — SO history perlu lebih fresh dari GH ref

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
    if (Date.now() - parsed.savedAt < LS_CACHE_TTL) return parsed.summary;
    return null; // cache kedaluwarsa, jangan pakai
  } catch {
    return null;
  }
}

// Dari array rows, build summary: key = "GH::PERIODE", value = { minHST, checkpoints[] }
function buildSummary(rows) {
  const summary = {};
  for (const row of rows) {
    const key = `${row.gh}::${row.periode}`;
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
// Cek apakah GH sudah pernah submit SO pada atau sebelum checkpoint tertentu
// di periode yang sama. Kalau iya, berarti checkpoint sudah terpenuhi — tidak terlambat.
export function hasCompletedCheckpoint(soHistory, gh, periode, checkpoint) {
  const key = `${gh}::${periode}`;
  const entry = soHistory[key];
  if (!entry) return false;
  // Ada submit dengan HST <= checkpoint → checkpoint sudah terpenuhi tepat waktu
  return entry.checkpoints.some(hst => hst <= checkpoint);
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
      // Coba pakai cache kalau fetch gagal
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
