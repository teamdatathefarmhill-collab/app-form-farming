// ─── VigorReminder ───────────────────────────────────────────────────────────
// Banner pengingat di Home: GH yang sedang "due" checkpoint Vigor tapi datanya
// BELUM ada di sheet (dicek live lewat GAS Vigor action getVigorStatus), plus
// antrean offline yang tersimpan di HP tapi belum terkirim ke server.
//
// onOpenVigor(gh) — dipanggil saat baris GH diketuk (buka form Vigor).
// popup — tampil sebagai modal (dipakai saat menu Vigor dibuka), bukan banner inline.

import { useState, useEffect, useCallback, useMemo } from "react";
import { useGHData } from "../hooks/useGHData";
import { idbGetAll, idbDelete, gasFetch, gasPost } from "../utils/idb";
import { isVigorGH, dueCheckpoint } from "../lib/vigorDue";
import { Icon } from "./form";

const SCRIPT_URL = import.meta.env.VITE_GAS_VIGOR_URL;
const DB_NAME    = "VigorOfflineDB";
const HST_MAX    = 60;

function hitungHST(tgl) {
  if (!tgl) return null;
  const [y, m, d] = tgl.split("-").map(Number);
  const now = new Date();
  return Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(y, m - 1, d)) / 86400000);
}

const doneKey = (gh, periode, cp) => `${String(gh).trim().toUpperCase()}|${Number(periode)}|${Number(cp)}`;

export default function VigorReminder({ onOpenVigor, popup = false }) {
  const [dismissed, setDismissed] = useState(false);
  const { ghData, loading: loadingGH } = useGHData();
  const [done, setDone]         = useState(null);   // Set key sheet, null = belum/ gagal dicek
  const [checkError, setCheckError] = useState(false);
  const [checking, setChecking] = useState(false);
  const [pending, setPending]   = useState([]);
  const [syncing, setSyncing]   = useState(false);
  const [syncMsg, setSyncMsg]   = useState("");

  const refreshPending = useCallback(async () => {
    try { setPending(await idbGetAll(DB_NAME)); } catch { setPending([]); }
  }, []);

  const refreshStatus = useCallback(async () => {
    if (!SCRIPT_URL) return;
    setChecking(true);
    try {
      const json = await gasFetch(`${SCRIPT_URL}?action=getVigorStatus`);
      if (!json.success) throw new Error(json.error || "gagal");
      setDone(new Set((json.done || []).map(r => doneKey(r.gh, r.periode, r.cp))));
      setCheckError(false);
    } catch {
      setCheckError(true);
    } finally {
      setChecking(false);
    }
  }, []);

  const refreshAll = useCallback(() => { refreshPending(); refreshStatus(); }, [refreshPending, refreshStatus]);

  useEffect(() => {
    refreshAll();
    window.addEventListener("focus", refreshAll);
    window.addEventListener("online", refreshAll);
    return () => { window.removeEventListener("focus", refreshAll); window.removeEventListener("online", refreshAll); };
  }, [refreshAll]);

  // GH yang due & belum ada di sheet. GH yang antreannya masih di HP dipisah
  // (bukan "belum diisi" — sudah diisi, tinggal terkirim).
  const pendingGH = useMemo(() => new Set(pending.map(r => String(r.gh).trim().toUpperCase())), [pending]);

  const belumDiisi = useMemo(() => {
    if (loadingGH || done === null) return [];
    return Object.entries(ghData)
      .filter(([gh]) => isVigorGH(gh))
      .map(([gh, info]) => {
        const hst = hitungHST(info.tanam);
        if (hst === null || hst < 1 || hst > HST_MAX) return null;
        const cp = dueCheckpoint(hst);
        if (cp === null) return null;
        if (done.has(doneKey(gh, info.periode, cp))) return null;
        if (pendingGH.has(gh.toUpperCase())) return null;
        return { gh, periode: info.periode, hst, cp };
      })
      .filter(Boolean)
      .sort((a, b) => b.hst - a.hst);
  }, [ghData, loadingGH, done, pendingGH]);

  const syncNow = async () => {
    setSyncing(true);
    setSyncMsg("");
    let ok = 0, fail = 0, lastErr = "";
    for (const record of pending) {
      try {
        const json = await gasPost(SCRIPT_URL, {
          action: record.payloads?.[0]?.action === "submitVigorSemai" ? "submitVigorSemaiBatch" : "submitVigorBatch",
          rows: record.payloads,
        });
        if (json.success) { await idbDelete(DB_NAME, record.id); ok++; }
        else { fail++; lastErr = json.error || ""; }
      } catch (e) { fail++; lastErr = e.message || ""; }
    }
    setSyncMsg(fail ? `Terkirim ${ok}, gagal ${fail}${lastErr ? ` — ${lastErr}` : ""}. Coba kirim lagi saat sinyal stabil.` : `${ok} antrean terkirim.`);
    setSyncing(false);
    refreshAll();
  };

  if (belumDiisi.length === 0 && pending.length === 0 && !checkError) return null;
  if (popup && dismissed) return null;

  const card = (
    <div className="fh-card" style={{ margin: popup ? 0 : "10px 12px", width: popup ? "100%" : undefined, maxWidth: popup ? 420 : undefined, maxHeight: popup ? "80vh" : undefined, overflowY: popup ? "auto" : "hidden", fontFamily: "var(--font-sans)", color: "var(--ink-900)", textAlign: "left" }}>
      <div className="fh-card-head" style={{ background: "var(--melon-50)" }}>
        <span className="fh-card-title"><Icon name="TriangleAlert" size={18} /> Pengingat Vigor</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button type="button" className="fh-btn fh-btn-secondary fh-btn-sm" onClick={refreshAll} disabled={checking}>
            {checking ? "Mengecek…" : "Cek ulang"}
          </button>
          {popup && (
            <button type="button" className="fh-icon-btn" style={{ border: "none", background: "transparent" }} onClick={() => setDismissed(true)} aria-label="Tutup">
              <Icon name="X" />
            </button>
          )}
        </span>
      </div>

      {pending.length > 0 && (
        <div className="fh-card-body" style={{ borderBottom: "1px solid var(--border-default)" }}>
          <span className="fh-label">{pending.length} isian tersimpan di HP, belum terkirim ke server</span>
          {pending.map(r => (
            <span key={r.id} className="fh-hint">{r.gh} · {r.tanggal || "-"} · {r.payloads?.length || 0} varian</span>
          ))}
          <button type="button" className="fh-btn fh-btn-primary" onClick={syncNow} disabled={syncing || !navigator.onLine}>
            {syncing ? "Mengirim…" : navigator.onLine ? "Kirim sekarang" : "Offline, tunggu sinyal"}
          </button>
          {syncMsg && <span className="fh-hint">{syncMsg}</span>}
        </div>
      )}

      {belumDiisi.length > 0 && (
        <div className="fh-card-body">
          <span className="fh-label">Checkpoint due, belum ada datanya di sheet</span>
          {belumDiisi.map(g => (
            <button key={g.gh} type="button" className="fh-gh-item" onClick={() => { onOpenVigor?.(g.gh); if (popup) setDismissed(true); }}>
              <span className="fh-gh-main"><span className="fh-gh-name">{g.gh}</span></span>
              <span className="fh-badge fh-badge-due">HST {g.hst} · checkpoint {g.cp}</span>
            </button>
          ))}
        </div>
      )}

      {checkError && (
        <div className="fh-card-body">
          <p className="fh-error-text">Status ke sheet belum bisa dicek, jadi daftar GH di atas mungkin belum lengkap. Ketuk Cek ulang.</p>
        </div>
      )}
    </div>
  );

  if (!popup) return card;
  return (
    <div className="fh-root fh-overlay" onClick={(e) => { if (e.target === e.currentTarget) setDismissed(true); }} style={{ zIndex: 300 }}>
      {card}
    </div>
  );
}
