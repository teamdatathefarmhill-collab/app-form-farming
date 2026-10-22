// ─── VigorReminder ───────────────────────────────────────────────────────────
// Banner pengingat di Home: GH yang sedang "due" checkpoint Vigor tapi datanya
// BELUM ada di sheet (dicek live lewat GAS Vigor action getVigorStatus), plus
// antrean offline yang tersimpan di HP tapi belum terkirim ke server.
//
// onOpenVigor(gh) — dipanggil saat baris GH diketuk (buka form Vigor).

import { useState, useEffect, useCallback, useMemo } from "react";
import { useGHData } from "../hooks/useGHData";
import { idbGetAll, idbDelete, gasFetch, gasPost } from "../utils/idb";
import { isVigorGH, dueCheckpoint } from "../lib/vigorDue";
import { color } from "../styles/tokens";

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

export default function VigorReminder({ onOpenVigor }) {
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
    setSyncMsg(fail ? `Terkirim ${ok}, gagal ${fail}${lastErr ? ` — ${lastErr}` : ""}` : `✓ ${ok} antrean terkirim`);
    setSyncing(false);
    refreshAll();
  };

  if (belumDiisi.length === 0 && pending.length === 0 && !checkError) return null;

  return (
    <div style={{ margin: "10px 12px", borderRadius: 14, background: color.card, border: `1.5px solid ${color.warningBorder}`, overflow: "hidden", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <div style={{ padding: "10px 14px", background: color.warningBg, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: color.warning }}>🔔 Pengingat Vigor</div>
        <button onClick={refreshAll} disabled={checking}
          style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, border: `1px solid ${color.warningBorder}`, background: color.card, color: color.warning, cursor: "pointer" }}>
          {checking ? "⏳" : "↻ Cek ulang"}
        </button>
      </div>

      {pending.length > 0 && (
        <div style={{ padding: "10px 14px", borderTop: `1px solid ${color.warningBorder}55` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: color.infoDark, marginBottom: 6 }}>
            📤 {pending.length} isian tersimpan di HP, belum terkirim ke server
          </div>
          {pending.map(r => (
            <div key={r.id} style={{ fontSize: 12, color: "#555", padding: "2px 0" }}>
              {r.gh} · {r.tanggal || "-"} · {r.payloads?.length || 0} varian
            </div>
          ))}
          <button onClick={syncNow} disabled={syncing || !navigator.onLine}
            style={{ marginTop: 8, width: "100%", padding: "9px", borderRadius: 10, border: "none", background: navigator.onLine ? color.info : "#bbb", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {syncing ? "⏳ Mengirim..." : navigator.onLine ? "Kirim sekarang" : "Offline — tunggu sinyal"}
          </button>
          {syncMsg && <div style={{ marginTop: 6, fontSize: 11, color: "#555" }}>{syncMsg}</div>}
        </div>
      )}

      {belumDiisi.length > 0 && (
        <div style={{ padding: "10px 14px", borderTop: `1px solid ${color.warningBorder}55` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: color.warning, marginBottom: 6 }}>
            ⚠️ Belum ada datanya di sheet
          </div>
          {belumDiisi.map(g => (
            <button key={g.gh} onClick={() => onOpenVigor?.(g.gh)}
              style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", marginBottom: 6, borderRadius: 10, border: `1px solid ${color.border}`, background: "#fafafa", cursor: "pointer", textAlign: "left" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: color.text }}>{g.gh}</span>
              <span style={{ fontSize: 11, color: color.warning, fontWeight: 700 }}>HST {g.hst} · checkpoint {g.cp} ›</span>
            </button>
          ))}
        </div>
      )}

      {checkError && (
        <div style={{ padding: "8px 14px", fontSize: 11, color: color.dangerDeep, background: color.dangerBg }}>
          Gagal cek status ke sheet — daftar GH belum diisi mungkin belum lengkap. Ketuk "Cek ulang".
        </div>
      )}
    </div>
  );
}
