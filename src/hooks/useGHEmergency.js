// ─── useGHEmergency — shutdown/restart GH + riwayat all-time ─────────────────
// Sumber: GAS GHRef.js (reuse VITE_GAS_GHREF_URL yang sudah ada, tidak perlu
// deploy/env var baru). Data ditulis ke sheet "GH Restart" di spreadsheet REF
// — sheet ini juga jadi sumber data untuk dashboard monitoring project lain.
//
// Fetches : VITE_GAS_GHREF_URL?action=getGHRestartLog
// Submits : VITE_GAS_GHREF_URL (POST, action=submitGHRestart)
//
// Tidak pakai offline queue bersama (lib/offlineQueue) karena queue itu di-flush
// global ke VITE_GAS_SANITASI_URL (lihat main.jsx) — kalau dipakai di sini,
// aksi shutdown/restart akan "hilang" (terkirim ke endpoint yang salah).
// Aksi darurat harus tahu pasti berhasil/gagal saat itu juga.

import { useState, useCallback } from "react";
import { gasFetch } from "../utils/idb";

const GAS_URL = import.meta.env.VITE_GAS_GHREF_URL;

export function useGHEmergency() {
  const [log, setLog]             = useState([]);
  const [loadingLog, setLoadingLog] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchLog = useCallback(async () => {
    if (!GAS_URL) return;
    setLoadingLog(true);
    try {
      const json = await gasFetch(`${GAS_URL}?action=getGHRestartLog`);
      if (json.success) setLog(json.data || []);
    } catch {
      // Offline / gagal fetch — biarkan riwayat lama (kalau ada) tetap tampil
    } finally {
      setLoadingLog(false);
    }
  }, []);

  const submit = useCallback(async ({ gh, periode, aksi, alasan }) => {
    if (!GAS_URL) return { success: false, error: "VITE_GAS_GHREF_URL belum dikonfigurasi" };
    setSubmitting(true);
    try {
      const res = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
          action: "submitGHRestart",
          gh, periode, aksi, alasan,
          client_timestamp: new Date().toISOString(),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "GAS returned error");
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || "Gagal mengirim, cek koneksi lalu coba lagi" };
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { log, loadingLog, submitting, fetchLog, submit };
}
