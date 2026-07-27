// ─── useGHBlockedList — GH yang sedang di-Shutdown lewat tombol Emergency ────
// Dipakai di semua form yang punya "pilih GH" untuk cegah operator mengisi
// data pada GH yang kondisinya sedang tidak baik.
//
// Sumber   : VITE_GAS_GHREF_URL?action=getGHRestartLog (sheet "GH Restart")
// Aturan   : GH terblokir selama aksi Shutdown TERBARU untuk GH itu punya
//            periode yang SAMA dengan periode aktif GH tersebut sekarang
//            (dari GH REF). Begitu ada tanam baru (periode berubah), GH
//            otomatis kebuka lagi — TIDAK bergantung pada tombol Restart.

import { useState, useEffect, useCallback } from "react";
import { gasFetch } from "../utils/idb";
import { useGHData } from "./useGHData";

const GHREF_URL = import.meta.env.VITE_GAS_GHREF_URL;

export function useGHBlockedList() {
  const { ghData } = useGHData();
  const [blockedMap, setBlockedMap] = useState({});

  const fetchBlocked = useCallback(async () => {
    if (!GHREF_URL) return;
    try {
      const json = await gasFetch(`${GHREF_URL}?action=getGHRestartLog`);
      if (!json.success) return;
      const rows = json.data || []; // terbaru duluan (lihat GAS getGHRestartLog)

      // Index ghData (periode aktif saat ini) by nama GH ter-uppercase
      const ghByUpper = {};
      Object.entries(ghData).forEach(([name, info]) => {
        ghByUpper[name.trim().toUpperCase()] = info;
      });

      // Ambil entri Shutdown TERBARU per GH
      const latestShutdown = {};
      rows.forEach((r) => {
        if (String(r.aksi).toUpperCase() !== "SHUTDOWN") return;
        const key = String(r.gh || "").trim().toUpperCase();
        if (!key || latestShutdown[key]) return;
        latestShutdown[key] = r;
      });

      const map = {};
      Object.entries(latestShutdown).forEach(([key, entry]) => {
        const currentPeriode = String(ghByUpper[key]?.periode || "");
        const shutdownPeriode = String(entry.periode || "");
        // Masih terblokir hanya kalau belum ada periode tanam baru
        if (currentPeriode && currentPeriode === shutdownPeriode) {
          map[key] = { alasan: entry.alasan, aksi: entry.aksi, periode: shutdownPeriode };
        }
      });

      setBlockedMap(map);
    } catch {
      // Offline / gagal fetch — biarkan blockedMap apa adanya (default kosong)
    }
  }, [ghData]);

  useEffect(() => { fetchBlocked(); }, [fetchBlocked]);

  return { blockedMap, refetchBlocked: fetchBlocked };
}

// ── Popup GH diblokir — pub/sub sederhana ────────────────────────────────────
// warnIfGHBlocked() dipanggil dari banyak halaman form (bukan komponen React),
// jadi popupnya di-broadcast lewat listener ke <GHBlockedModal /> yang di-mount
// sekali di App.jsx, bukan window.alert() bawaan browser.
let listeners = [];

export function subscribeGHBlocked(cb) {
  listeners.push(cb);
  return () => { listeners = listeners.filter((l) => l !== cb); };
}

// ── Helper: cek + tampilkan popup kalau GH sedang diblokir ──────────────────
// Pakai di handleSelectGH / handleSubmit tiap form. Return true = diblokir,
// caller harus batalkan pemilihan/submit.
export function warnIfGHBlocked(gh, blockedMap) {
  if (!gh) return false;
  const info = blockedMap[String(gh).trim().toUpperCase()];
  if (!info) return false;
  listeners.forEach((l) => l({ gh, aksi: info.aksi, alasan: info.alasan }));
  return true;
}
