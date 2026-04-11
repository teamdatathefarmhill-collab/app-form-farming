// ─── useGHData — shared hook untuk data GH dari REF sheet ────────────────────
// Fetches: VITE_GAS_GHREF_URL?action=getGH
// Returns: { ghData, produksiData, semaiData, loading, isDemoMode, refetch }
//
// Format tiap entry GH:
//   { periode: "26.1", tanam: "2026-02-15", baris: [{baris, varian}], varian: [] }
//
// produksiData = semua GH yang BUKAN SEMAI*/NURSERY*
// semaiData    = GH yang namanya diawali SEMAI atau NURSERY

import { useState, useEffect, useCallback } from "react";
import { gasFetch } from "../utils/idb";

const GHREF_URL = import.meta.env.VITE_GAS_GHREF_URL;

// ─── Demo / fallback data ────────────────────────────────────────────────────
const buatBaris = (jumlah) => {
  const abjad = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return Array.from({ length: jumlah }, (_, i) => ({
    baris: i < 26 ? abjad[i] : abjad[Math.floor(i / 26) - 1] + abjad[i % 26],
    varian: "–",
  }));
};

const MOCK_DATA = {
  "BERGAS 1":         { periode: "26.1", tanam: "2026-02-15", baris: buatBaris(18), varian: ["Servo F1"] },
  "BERGAS 2":         { periode: "26.1", tanam: "2026-02-10", baris: buatBaris(18), varian: ["Servo F1"] },
  "TOHUDAN 1":        { periode: "26.1", tanam: "2026-02-09", baris: buatBaris(21), varian: ["Greeniegal", "Sarasuka"] },
  "TOHUDAN 2":        { periode: "26.1", tanam: "2026-02-09", baris: buatBaris(21), varian: ["Aruni", "Greeniegal"] },
  "COLOMADU 1":       { periode: "26.1", tanam: "2026-02-09", baris: buatBaris(18), varian: ["Servo F1", "Tombatu F1"] },
  "SAWAHAN 1":        { periode: "26.1", tanam: "2026-01-20", baris: buatBaris(42), varian: ["Midori"] },
  "NURSERY 1":        { periode: "26.1", tanam: "2026-03-01", baris: buatBaris(6),  varian: ["Aruni"] },
  "SEMAI SAWAHAN 1":  { periode: "26.1", tanam: "2026-03-05", baris: buatBaris(4),  varian: [] },
};

// ─── Helper: pisah produksi vs semai ────────────────────────────────────────
function splitProduksiSemai(data) {
  const produksi = {};
  const semai    = {};
  Object.keys(data).forEach(gh => {
    const upper = gh.toUpperCase();
    if (upper.startsWith("SEMAI") || upper.startsWith("NURSERY")) {
      semai[gh] = data[gh];
    } else {
      produksi[gh] = data[gh];
    }
  });
  return { produksi, semai };
}

// ─── Hook ────────────────────────────────────────────────────────────────────
export function useGHData() {
  const [ghData,       setGhData]       = useState({});
  const [produksiData, setProduksi]     = useState({});
  const [semaiData,    setSemai]        = useState({});
  const [loading,      setLoading]      = useState(true);
  const [isDemoMode,   setIsDemoMode]   = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setIsDemoMode(false);
    try {
      if (!GHREF_URL) throw new Error("VITE_GAS_GHREF_URL tidak dikonfigurasi");
      const json = await gasFetch(`${GHREF_URL}?action=getGH`);
      if (!json.success) throw new Error(json.error || "Response tidak sukses");

      const data = json.data || {};

      // GAS sudah menghitung produksi/semai, gunakan langsung jika ada
      const { produksi, semai } = (json.produksi && json.semai)
        ? { produksi: json.produksi, semai: json.semai }
        : splitProduksiSemai(data);

      setGhData(data);
      setProduksi(produksi);
      setSemai(semai);
    } catch {
      setIsDemoMode(true);
      const { produksi, semai } = splitProduksiSemai(MOCK_DATA);
      setGhData(MOCK_DATA);
      setProduksi(produksi);
      setSemai(semai);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { ghData, produksiData, semaiData, loading, isDemoMode, refetch: fetchData };
}
