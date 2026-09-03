import { useState, useEffect, useCallback } from "react";
import { useDraft } from "../hooks/useDraft";
import { idbAdd, idbGetAll, idbDelete, idbCount, gasFetch, gasPost } from "../utils/idb";
import { useGHData } from "../hooks/useGHData";
import { useGHBlockedList, warnIfGHBlocked } from "../hooks/useGHBlockedList";
import ConfirmSubmitModal from "../components/ConfirmSubmitModal";
import { color } from "../styles/tokens";

const DB_NAME = "GramasiOfflineDB";

const SCRIPT_URL = import.meta.env.VITE_GAS_GRAMASI_URL;
const HST_MIN = 26;
const HST_MAX = 55;

// ─── Tanggal helpers — selalu computed fresh, TIDAK di module level ──────────
// Supaya kalau app dibiarkan terbuka semalam, tanggalnya tetap akurat saat dibuka pagi
function getTodayDisplay() {
  return new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function getTodayLabel() {
  return new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// ─── localStorage helpers (cache lokal, fallback offline) ─────────────────────
const LS_PREFIX = "gramasi_submitted_";

// Key selalu fresh pakai tanggal saat ini (bukan frozen di module load)
// PENTING: pakai tanggal lokal, bukan toISOString() (itu UTC) — kalau pakai UTC,
// di WIB (UTC+7) cache baru "ganti hari" jam 7 pagi, bukan jam 12 malam lokal.
function getLSKey() {
  const d = new Date();
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${LS_PREFIX}${y}-${m}-${day}`;
}

// Hapus cache hari-hari sebelumnya supaya tidak numpuk & tidak bocor ke hari lain
function cleanOldKeys() {
  try {
    const currentKey = getLSKey();
    Object.keys(localStorage)
      .filter(k => k.startsWith(LS_PREFIX) && k !== currentKey)
      .forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

function getSubmittedToday() {
  try { return JSON.parse(localStorage.getItem(getLSKey()) || "[]"); }
  catch { return []; }
}
function markSubmitted(gh) {
  const list = getSubmittedToday();
  if (!list.includes(gh)) localStorage.setItem(getLSKey(), JSON.stringify([...list, gh]));
}
function mergeSubmitted(serverList) {
  const local = getSubmittedToday();
  const merged = [...new Set([...serverList, ...local])];
  localStorage.setItem(getLSKey(), JSON.stringify(merged));
  return merged;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function hitungHST(tgl) {
  const [y, m, d] = tgl.split("-").map(Number);
  const tanam = new Date(y, m - 1, d);
  const now = new Date();
  const nowLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((nowLocal - tanam) / 86400000);
}

function calcAvg(s1, s2, s3) {
  const all = [s1, s2, s3];
  const hasValue = all.some(v => v !== "");
  if (!hasValue) return "";
  const vals = all.map(Number).filter(v => v > 0);
  return vals.length > 0 ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : "0.00";
}

// ─── Cek kenaikan/penurunan ekstrem dibanding pengukuran terakhir ───────────
// Naik lebih dari threshold (beda-beda per fase HST, makin tua makin sensitif
// karena pertumbuhan harian wajarnya makin kecil) → "naik". Turun (delta < 0,
// fase berapapun) → "turun". Boleh ada gap berapa hari pun, tetap dibandingkan
// ke pengukuran terakhir yang ada.
function getNaikThreshold(hst) {
  if (hst !== null && hst !== undefined && hst > 35) return 100;
  if (hst !== null && hst !== undefined && hst >= 30) return 200;
  return 200; // fase HST < 30 (atau HST tidak diketahui) — default
}

function getDeltaWarning(currVal, prevVal, hst) {
  if (currVal === "" || currVal === undefined || currVal === null) return null;
  if (prevVal === null || prevVal === undefined) return null;
  const curr = parseFloat(currVal);
  if (isNaN(curr)) return null;
  const delta = curr - prevVal;
  const naikThreshold = getNaikThreshold(hst);
  if (delta > naikThreshold) return { type: "naik", delta, curr, prev: prevVal };
  if (delta < 0)             return { type: "turun", delta, curr, prev: prevVal };
  return null;
}

function hstColor(hst) {
  if (hst <= 40) return { bg: color.brandBg, border: color.brand300, text: color.brand700, badge: "#c8e6c9" };
  if (hst <= 50) return { bg: "#fff8e1", border: "#ffe082", text: "#f57f17", badge: "#fff9c4" };
  return             { bg: "#fbe9e7", border: "#ffab91", text: "#bf360c", badge: "#fce4ec" };
}

export default function Gramasi() {
  const { getDraft, saveDraft, clearDraft } = useDraft("gramasi");
  const _draft = getDraft();

  // Tanggal selalu fresh saat komponen mount — bukan dari module-level variable
  const [todayISO]   = useState(() => getTodayDisplay());
  const [todayLabel] = useState(() => getTodayLabel());

  const [step, setStep]         = useState(_draft?.step || 1);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const { ghData, loading: loadingGH, isDemoMode } = useGHData();
  const { blockedMap } = useGHBlockedList();

  const [selectedGH, setSelectedGH]     = useState(_draft?.selectedGH || "");
  const [tableData, setTableData]       = useState(_draft?.tableData  || []);
  const [lastGramasi, setLastGramasi]   = useState({});
  const [operator, setOperator]         = useState(_draft?.operator   || "");
  const [keterangan, setKeterangan]     = useState(_draft?.keterangan || "");
  const [syncing, setSyncing]           = useState(false);
  const [syncProgress, setSyncProgress] = useState({ done: 0, total: 0 });
  const [submitError, setSubmitError]   = useState(null);
  const [savedOffline, setSavedOffline] = useState(false);
  const [confirmOpen, setConfirmOpen]   = useState(false);

  const [submittedToday, setSubmittedToday] = useState(() => {
    cleanOldKeys(); // bersihin cache hari sebelumnya saat pertama load
    return getSubmittedToday();
  });
  const [showWarning, setShowWarning]           = useState(false);
  const [pendingGH, setPendingGH]               = useState("");
  const [loadingSubmitted, setLoadingSubmitted] = useState(false);

  // ── Fetch GH yang sudah disubmit hari ini dari server (cross-device) ──
  const fetchSubmittedToday = useCallback(async () => {
    if (!isOnline || isDemoMode) return;
    setLoadingSubmitted(true);
    try {
      const url = `${SCRIPT_URL}?action=getSubmittedToday&tanggal=${encodeURIComponent(todayISO)}`;
      const data = await gasFetch(url);
      if (Array.isArray(data.submitted)) {
        const serverDate = data.tanggal;
        if (!serverDate || serverDate === todayISO) {
          const merged = mergeSubmitted(data.submitted);
          setSubmittedToday(merged);
        } else {
          console.warn("Server returned data for wrong date:", serverDate, "expected:", todayISO);
        }
      }
    } catch {
      // Gagal fetch — pakai cache lokal saja
    } finally {
      setLoadingSubmitted(false);
    }
  }, [isOnline, isDemoMode, todayISO]);

  // ── Offline state ──
  const [pendingCount, setPendingCount]         = useState(0);
  const [isSyncingPending, setIsSyncingPending] = useState(false);

  useEffect(() => {
    if (step === 3) return;
    saveDraft({ step, selectedGH, tableData, operator, keterangan });
  }, [step, selectedGH, tableData, operator]);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await idbCount(DB_NAME);
      setPendingCount(count);
    } catch {
      setPendingCount(0);
    }
  }, []);

  useEffect(() => { refreshPendingCount(); }, [refreshPendingCount]);

  // ── Fetch submitted hari ini dari server saat step 1 & saat online ──
  useEffect(() => {
    if (step === 1) fetchSubmittedToday();
  }, [step, fetchSubmittedToday]);

  // ── Fetch data pengukuran terakhir (sebelum hari ini) per baris ──
  const fetchLastGramasi = useCallback(async (gh) => {
    setLastGramasi({});
    if (!isOnline || isDemoMode || !gh) return;
    try {
      const url = `${SCRIPT_URL}?action=getLastGramasi&gh=${encodeURIComponent(gh)}&tanggal=${encodeURIComponent(todayISO)}`;
      const data = await gasFetch(url);
      if (data.success) setLastGramasi(data.data || {});
    } catch {
      // Gagal fetch — biarkan kosong, tidak ada warning ditampilkan
    }
  }, [isOnline, isDemoMode, todayISO]);

  // ── Fetch pengukuran terakhir (untuk cek kenaikan/penurunan ekstrem) saat GH dipilih ──
  useEffect(() => {
    if (step === 2 && selectedGH) fetchLastGramasi(selectedGH);
  }, [step, selectedGH, fetchLastGramasi]);

  useEffect(() => {
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // ── Auto-sync saat kembali online ──
  useEffect(() => {
    if (isOnline) syncPendingData();
  }, [isOnline]);

  // ── Sync semua pending ke GAS ──
  const syncPendingData = useCallback(async () => {
    const allPending = await idbGetAll(DB_NAME);
    if (allPending.length === 0) return;
    setIsSyncingPending(true);
    for (const record of allPending) {
      try {
        await gasPost(SCRIPT_URL, { action: "submitGramasiBatch", rows: record.payloads });
        markSubmitted(record.gh);
        setSubmittedToday(getSubmittedToday());
        await idbDelete(DB_NAME, record.id);
      } catch {
        // Gagal sync record ini, skip dulu — coba lagi nanti
      }
    }
    await refreshPendingCount();
    setIsSyncingPending(false);
  }, [refreshPendingCount]);

  const ghAktif = Object.entries(ghData).filter(([, info]) => {
    if (!info.tanam) return true;
    const hst = hitungHST(info.tanam);
    return hst >= HST_MIN && hst <= HST_MAX;
  });

  const handleSelectGH = (gh) => {
    if (warnIfGHBlocked(gh, blockedMap)) return;
    if (submittedToday.includes(gh)) {
      setPendingGH(gh);
      setShowWarning(true);
    } else {
      doSelectGH(gh);
    }
  };

  const doSelectGH = (gh) => {
    setSelectedGH(gh);
    setTableData((ghData[gh]?.baris || []).map(b => ({ ...b, s1: "", s2: "", s3: "" })));
    setShowWarning(false);
    setPendingGH("");
  };

  const updateCell = (i, field, val) => {
    if (val !== "" && !/^\d*\.?\d*$/.test(val)) return;
    const intPart = val.split(".")[0];
    if (intPart.length > 4) return;
    setTableData(prev => {
      const d = [...prev];
      d[i] = { ...d[i], [field]: val };
      return d;
    });
  };

  const ghInfo      = ghData[selectedGH];
  const hst         = ghInfo?.tanam ? hitungHST(ghInfo.tanam) : null;
  const col         = hst !== null ? hstColor(hst) : hstColor(30);
  const filledCount = tableData.filter(r => r.s1 !== "" && r.s2 !== "" && r.s3 !== "").length;
  const allFilled   = tableData.length > 0 && filledCount === tableData.length;
  const canSubmit   = allFilled && operator.trim().length > 0;

  // ── Build semua payload per baris ──
  const buildPayloads = () => {
    const client_timestamp = new Date().toISOString();
    // Ambil tanggal fresh saat submit — bukan dari state yang mungkin sudah stale
    const submitDate = getTodayDisplay();
    return tableData.map(row => {
      const avg = calcAvg(row.s1, row.s2, row.s3);
      return {
        client_timestamp,
        tanggal:    submitDate,
        gh:         selectedGH,
        periode:    ghInfo?.periode || "",
        hst:        hst ?? "",
        baris:      row.baris,
        varian:     row.varian,
        s1:         row.s1 || 0,
        s2:         row.s2 || 0,
        s3:         row.s3 || 0,
        avg:        avg || 0,
        operator,
        keterangan: keterangan.trim() || "",
      };
    });
  };

  const handleSubmit = async () => {
    if (warnIfGHBlocked(selectedGH, blockedMap)) return;
    setSyncing(true);
    setSubmitError(null);
    const payloads = buildPayloads();
    setSyncProgress({ done: 0, total: payloads.length });

    // ── Mode Demo ──
    if (isDemoMode) {
      for (let i = 0; i < payloads.length; i++) {
        await new Promise(r => setTimeout(r, 60));
        setSyncProgress({ done: i + 1, total: payloads.length });
      }
      markSubmitted(selectedGH);
      setSubmittedToday(getSubmittedToday());
      setStep(3);
      setSyncing(false);
      return;
    }

    // ── Mode Offline ──
    if (!isOnline) {
      try {
        await idbAdd(DB_NAME, { gh: selectedGH, tanggal: todayISO, createdAt: Date.now(), payloads });
        await refreshPendingCount();
        markSubmitted(selectedGH);
        setSubmittedToday(getSubmittedToday());
        clearDraft();
        setSavedOffline(true);
        setStep(3);
      } catch {
        setSubmitError("Gagal menyimpan data offline. Coba lagi.");
      } finally {
        setSyncing(false);
      }
      return;
    }

    // ── Mode Online ──
    setSavedOffline(false);
    try {
      await gasPost(SCRIPT_URL, { action: "submitGramasiBatch", rows: payloads });
      setSyncProgress({ done: payloads.length, total: payloads.length });
      markSubmitted(selectedGH);
      setSubmittedToday(getSubmittedToday());
      clearDraft();
      setStep(3);
    } catch {
      setSubmitError("Gagal mengirim data. Cek koneksi dan coba lagi.");
    } finally {
      setSyncing(false);
    }
  };

  const resetForm = () => {
    clearDraft();
    setStep(1); setSelectedGH(""); setTableData([]); setOperator(""); setKeterangan("");
    setSyncing(false); setSyncProgress({ done: 0, total: 0 });
    setSubmitError(null); setSavedOffline(false); setLastGramasi({});
  };

  return (
    <div style={{ minHeight: "100vh", background: color.bg, fontFamily: "'DM Sans','Segoe UI',sans-serif", margin: "0 auto" }}>

      {/* ── Header ── */}
      <div style={{ background: color.brand700, color: color.card, padding: "14px 16px 10px", position: "sticky", top: 0, zIndex: 10, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, opacity: 0.75, letterSpacing: 1.5, textTransform: "uppercase" }}>Form Gramasi Harian</div>
            <div style={{ fontSize: 13, opacity: 0.65, marginTop: 1 }}>{todayLabel}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {pendingCount > 0 && (
              <button
                onClick={isOnline ? syncPendingData : undefined}
                title={isOnline ? "Klik untuk sync sekarang" : "Akan sync otomatis saat online"}
                style={{
                  fontSize: 10, fontWeight: 700,
                  background: isOnline ? "rgba(33,150,243,0.3)" : "rgba(255,179,0,0.3)",
                  border: `1px solid ${isOnline ? "rgba(33,150,243,0.6)" : "rgba(255,179,0,0.6)"}`,
                  color: color.card, padding: "2px 8px", borderRadius: 20,
                  cursor: isOnline ? "pointer" : "default",
                  display: "flex", alignItems: "center", gap: 4,
                }}
              >
                {isSyncingPending ? "⏳" : "📤"} {pendingCount} pending
              </button>
            )}
            {isDemoMode && (
              <div style={{ fontSize: 10, fontWeight: 700, background: "rgba(255,179,0,0.25)", border: "1px solid rgba(255,179,0,0.5)", borderRadius: 20, padding: "2px 8px", color: "#fff9c4" }}>DEMO</div>
            )}
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: isOnline ? color.brand300 : color.dangerBorder, boxShadow: isOnline ? `0 0 6px ${color.brand300}` : `0 0 6px ${color.dangerBorder}` }} />
          </div>
        </div>

        {!isOnline && (
          <div style={{ marginTop: 8, padding: "6px 10px", background: "rgba(244,67,54,0.2)", border: "1px solid rgba(244,67,54,0.4)", borderRadius: 7, display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontSize: 13 }}>📵</span>
            <span style={{ fontSize: 11, color: "#ffcdd2" }}>Mode offline — data tersimpan lokal & sync otomatis saat online</span>
          </div>
        )}

        {step < 3 && (
          <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
            {[1, 2].map(s => (
              <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: s <= step ? color.brand300 : "rgba(255,255,255,0.2)", transition: "background 0.3s" }} />
            ))}
          </div>
        )}
      </div>

      {/* Modal Warning Double Submit */}
      {showWarning && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: color.card, borderRadius: 16, padding: 24, maxWidth: "100%", width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
            <div style={{ fontSize: 36, textAlign: "center", marginBottom: 12 }}>⚠️</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: color.text, textAlign: "center", marginBottom: 8 }}>GH Sudah Diisi Hari Ini</div>
            <div style={{ fontSize: 13, color: color.textMuted, textAlign: "center", marginBottom: 20, lineHeight: 1.5 }}>
              <strong>{pendingGH}</strong> sudah disubmit hari ini. Yakin mau isi ulang? Data baru akan ditambahkan ke Sheets.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setShowWarning(false); setPendingGH(""); }} style={{ flex: 1, padding: "11px", background: color.bg, border: `1px solid ${color.border}`, borderRadius: 10, color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Batal</button>
              <button onClick={() => doSelectGH(pendingGH)} style={{ flex: 1, padding: "11px", background: color.danger, border: "none", borderRadius: 10, color: color.card, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Isi Ulang</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: "16px" }}>

        {/* ══ STEP 1 — Pilih GH ══ */}
        {step === 1 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: color.brand900, marginBottom: 4 }}>Pilih Greenhouse</div>
            <div style={{ fontSize: 12, color: color.textSoft, marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
              GH aktif dengan HST {HST_MIN}–{HST_MAX} hari
              {loadingSubmitted && (
                <span style={{ fontSize: 10, color: color.textGhost, background: color.bg, borderRadius: 20, padding: "2px 8px" }}>🔄 cek status GH...</span>
              )}
            </div>

            {isDemoMode && (
              <div style={{ background: "#fff8e1", border: "1px solid #ffe082", borderRadius: 10, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>🔌</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: "#f57f17", fontWeight: 600 }}>Server tidak terjangkau</div>
                  <div style={{ fontSize: 11, color: "#a67c00", marginTop: 2 }}>Menampilkan data demo</div>
                </div>
              </div>
            )}

            {loadingGH ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: color.textGhost }}>
                <div style={{ fontSize: 28 }}>🔄</div>
                <div style={{ fontSize: 13, marginTop: 8 }}>Memuat data GH...</div>
              </div>
            ) : ghAktif.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0", color: color.textGhost, fontSize: 13 }}>Tidak ada GH aktif (HST {HST_MIN}–{HST_MAX})</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {ghAktif.map(([gh, info]) => {
                  const hstGH    = info.tanam ? hitungHST(info.tanam) : null;
                  const c        = hstGH !== null ? hstColor(hstGH) : hstColor(30);
                  const dipilih  = selectedGH === gh;
                  const sudahIsi = submittedToday.includes(gh);
                  return (
                    <button key={gh} onClick={() => handleSelectGH(gh)} style={{ padding: "12px 10px", borderRadius: 14, cursor: "pointer", textAlign: "center", border: dipilih ? `2px solid ${color.brand700}` : sudahIsi ? `1px solid ${color.warningBorder}` : `1px solid ${color.border}`, background: dipilih ? color.brandBg : sudahIsi ? "#fff8e1" : color.card, boxShadow: dipilih ? "0 2px 10px rgba(46,125,50,0.15)" : "0 1px 4px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", alignItems: "center", gap: 7, transition: "all 0.2s" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: dipilih ? color.brand700 : color.text, lineHeight: 1.3 }}>{gh}</div>
                      <div style={{ fontSize: 10, color: color.textGhost }}>P{info.periode} · {info.baris?.length || 0} baris</div>
                      {hstGH !== null && (
                        <div style={{ background: c.badge, border: `1px solid ${c.border}`, borderRadius: 8, padding: "4px 12px", width: "100%" }}>
                          <span style={{ fontSize: 17, fontWeight: 800, color: c.text }}>{hstGH}</span>
                          <span style={{ fontSize: 10, color: c.text, marginLeft: 3 }}>HST</span>
                        </div>
                      )}
                      {sudahIsi && (
                        <div style={{ fontSize: 10, background: color.warningBg, border: `1px solid ${color.warningBorder}`, borderRadius: 20, padding: "2px 10px", color: color.warning, fontWeight: 600 }}>✓ Sudah diisi hari ini</div>
                      )}
                      {dipilih && !sudahIsi && <div style={{ fontSize: 13 }}>✅</div>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ STEP 2 — Input Tabel ══ */}
        {step === 2 && (
          <div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              <div style={{ background: color.brandBg, border: `1px solid ${color.brand300}`, borderRadius: 20, padding: "3px 12px", fontSize: 12, color: color.brand700, fontWeight: 700 }}>{selectedGH}</div>
              <div style={{ background: color.bg, borderRadius: 20, padding: "3px 12px", fontSize: 12, color: color.textMuted }}>Periode {ghInfo?.periode}</div>
              {hst !== null && (
                <div style={{ background: col.badge, border: `1px solid ${col.border}`, borderRadius: 20, padding: "3px 12px", fontSize: 12, color: col.text, fontWeight: 700 }}>{hst} HST</div>
              )}
            </div>

            {!isOnline && (
              <div style={{ marginBottom: 12, padding: "8px 12px", background: color.warningBg, border: `1px solid ${color.warningBorder}`, borderRadius: 9, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14 }}>📵</span>
                <span style={{ fontSize: 11, color: color.warning }}>Offline — data akan disimpan lokal & dikirim otomatis saat online</span>
              </div>
            )}

            <div style={{ fontWeight: 700, fontSize: 17, color: color.brand900, marginBottom: 2 }}>Input Gramasi</div>
            <div style={{ fontSize: 12, color: color.textSoft, marginBottom: 8 }}>{filledCount}/{tableData.length} baris terisi</div>

            <div style={{ background: color.border, borderRadius: 4, height: 5, marginBottom: 14, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 4, background: "#4CAF50", width: `${tableData.length > 0 ? (filledCount / tableData.length) * 100 : 0}%`, transition: "width 0.3s" }} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: "#388e3c", letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 700 }}>
                👤 Nama Operator <span style={{ color: color.danger }}>*</span>
              </label>
              <input
                type="text" value={operator}
                onChange={e => setOperator(e.target.value)}
                placeholder="Tulis nama lengkap..."
                style={{ width: "100%", marginTop: 8, padding: "11px 14px", background: color.card, border: `1.5px solid ${operator.trim() ? color.brand400 : color.border}`, borderRadius: 10, color: color.text, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
              />
            </div>

            {(() => {
              // ── Kumpulkan semua warning kenaikan/penurunan ekstrem dibanding pengukuran terakhir ──
              const rowWarnings = tableData.map(row => {
                const prev = lastGramasi[row.baris];
                const prevMatch = prev && (!prev.varian || prev.varian === row.varian) ? prev : null;
                if (!prevMatch) return { s1: null, s2: null, s3: null, avg: null };
                const avg = calcAvg(row.s1, row.s2, row.s3);
                return {
                  s1:  getDeltaWarning(row.s1, prevMatch.s1, hst),
                  s2:  getDeltaWarning(row.s2, prevMatch.s2, hst),
                  s3:  getDeltaWarning(row.s3, prevMatch.s3, hst),
                  avg: avg !== "" ? getDeltaWarning(avg, prevMatch.avg, hst) : null,
                };
              });
              const flatWarnings = [];
              tableData.forEach((row, i) => {
                const w = rowWarnings[i];
                ["s1", "s2", "s3", "avg"].forEach(key => {
                  if (w[key]) {
                    const labelKey = key === "avg" ? "Avg" : key.toUpperCase();
                    flatWarnings.push(
                      w[key].type === "naik"
                        ? `Baris ${row.baris} (${labelKey}): naik ekstrem ke ${w[key].curr}g (sebelumnya ${w[key].prev}g)`
                        : `Baris ${row.baris} (${labelKey}): turun ke ${w[key].curr}g (sebelumnya ${w[key].prev}g)`
                    );
                  }
                });
              });

              return (
                <>
                  {flatWarnings.length > 0 && (
                    <div style={{ fontSize: 11, color: color.warning, background: color.warningBg, border: `1px solid ${color.warningBorder}`, borderRadius: 8, padding: "8px 12px", marginBottom: 10, lineHeight: 1.6 }}>
                      ⚠️ <strong>Cek lagi — {flatWarnings.length} nilai beda jauh dari pengukuran sebelumnya:</strong>
                      <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                        {flatWarnings.map((msg, idx) => <li key={idx}>{msg}</li>)}
                      </ul>
                    </div>
                  )}

                  <div style={{ overflowX: "auto", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.08)", marginBottom: 16 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: color.brand700, color: color.card }}>
                          {["Baris","Varian","S1 (g)","S2 (g)","S3 (g)","Avg"].map(h => (
                            <th key={h} style={{ padding: "9px 6px", textAlign: ["Baris","Varian"].includes(h) ? "left" : "center", fontWeight: 700, fontSize: 11, whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tableData.map((row, i) => {
                          const avg     = calcAvg(row.s1, row.s2, row.s3);
                          const rowFull = row.s1 !== "" && row.s2 !== "" && row.s3 !== "";
                          const w       = rowWarnings[i];
                          return (
                            <tr key={i} style={{ background: rowFull ? "#f1f8e9" : i % 2 === 0 ? color.card : "#fafafa", transition: "background 0.2s" }}>
                              <td style={{ padding: "6px 8px", fontWeight: 700, color: color.brand700, whiteSpace: "nowrap" }}>{row.baris}</td>
                              <td style={{ padding: "6px 6px", fontSize: 11, color: color.textMuted, whiteSpace: "nowrap" }}>{row.varian}</td>
                              {["s1","s2","s3"].map(s => (
                                <td key={s} style={{ padding: "4px 3px", textAlign: "center" }}>
                                  <input
                                    type="number" inputMode="decimal"
                                    value={row[s]}
                                    onChange={e => updateCell(i, s, e.target.value)}
                                    placeholder="—"
                                    title={w[s] ? (w[s].type === "naik" ? `Naik ekstrem dari ${w[s].prev}g` : `Turun dari ${w[s].prev}g`) : undefined}
                                    style={{ width: 52, height: 32, textAlign: "center", border: `1.5px solid ${w[s] ? color.danger : row[s] !== "" ? color.brand400 : color.border}`, borderRadius: 7, fontSize: 13, fontWeight: 600, color: w[s] ? color.dangerDeep : row[s] !== "" ? color.brand700 : "#bbb", outline: "none", background: w[s] ? color.dangerBg : color.card }}
                                  />
                                </td>
                              ))}
                              <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: w.avg ? color.dangerDeep : avg ? color.brand900 : "#ccc", fontSize: 13 }}>
                                {w.avg ? "⚠️ " : ""}{avg || "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()}

            <div style={{ marginBottom: 12, marginTop: 4 }}>
              <label style={{ fontSize: 11, color: "#388e3c", letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 700 }}>
                📝 Keterangan <span style={{ fontSize: 10, color: color.textGhost, textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>— opsional</span>
              </label>
              <input
                type="text" value={keterangan}
                onChange={e => setKeterangan(e.target.value)}
                placeholder="Contoh: ganti sampel dari kemarin, baris C rusak..."
                style={{ width: "100%", marginTop: 8, padding: "11px 14px", background: color.card, border: `1.5px solid ${keterangan.trim() ? color.brand400 : color.border}`, borderRadius: 10, color: color.text, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
              />
            </div>

            {!allFilled && tableData.length > 0 && (
              <div style={{ fontSize: 12, color: color.warning, background: color.warningBg, border: `1px solid ${color.warningBorder}`, borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>
                ⚠️ {tableData.length - filledCount} baris belum lengkap (perlu 3 sampel)
              </div>
            )}

            {submitError && (
              <div style={{ fontSize: 12, color: color.dangerDeep, background: color.dangerBg, border: `1px solid ${color.dangerBorder}`, borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>
                ⚠️ {submitError}
              </div>
            )}

            {syncing && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: color.textMuted, marginBottom: 6 }}>Mengirim data...</div>
                <div style={{ background: color.border, borderRadius: 4, height: 6, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 4, background: `linear-gradient(90deg,${color.brand700},#4CAF50)`, width: `${syncProgress.total > 0 ? (syncProgress.done / syncProgress.total) * 100 : 0}%`, transition: "width 0.3s" }} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ STEP 3 — Sukses ══ */}
        {step === 3 && (
          <div style={{ textAlign: "center", paddingTop: 32 }}>
            <div style={{ fontSize: 60, marginBottom: 12 }}>
              {isDemoMode ? "🧪" : savedOffline ? "💾" : "✅"}
            </div>
            <div style={{ fontSize: 21, fontWeight: 800, color: isDemoMode ? "#f57f17" : savedOffline ? color.info : color.brand700, marginBottom: 6 }}>
              {isDemoMode ? "Demo Selesai!" : savedOffline ? "Tersimpan Lokal!" : "Data Tersimpan!"}
            </div>
            <div style={{ fontSize: 13, color: color.textSoft, marginBottom: 20 }}>
              {isDemoMode
                ? "Data tidak dikirim (mode demo)"
                : savedOffline
                  ? "Data disimpan di perangkat. Otomatis terkirim ke Google Sheets saat online."
                  : `${tableData.length} baris berhasil dikirim ke Google Sheets`}
            </div>

            {savedOffline && (
              <div style={{ background: color.infoBg, border: `1px solid ${color.infoBorder}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, textAlign: "left" }}>
                <div style={{ fontSize: 12, color: color.info, fontWeight: 600, marginBottom: 4 }}>📡 Cara sync:</div>
                <div style={{ fontSize: 12, color: "#555" }}>Biarkan app terbuka saat koneksi kembali — data terkirim otomatis. Atau klik badge "pending" di header.</div>
                {pendingCount > 0 && <div style={{ fontSize: 12, color: color.info, marginTop: 6 }}>{pendingCount} record menunggu sync.</div>}
              </div>
            )}

            <div style={{ background: isDemoMode ? "#fff8e1" : savedOffline ? color.infoBg : color.brandBg, border: `1px solid ${isDemoMode ? "#ffe082" : savedOffline ? color.infoBorder : color.brand300}`, borderRadius: 14, padding: "16px", textAlign: "left", marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: isDemoMode ? "#f57f17" : savedOffline ? color.info : color.brand700, fontWeight: 700, marginBottom: 10 }}>Ringkasan</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: color.text }}>{selectedGH} · Periode {ghInfo?.periode} · {hst} HST</div>
              <div style={{ fontSize: 13, color: color.textMuted, marginTop: 2 }}>Operator: {operator}</div>
              <div style={{ fontSize: 13, color: color.textMuted, marginTop: 2 }}>Tanggal: {todayISO}</div>
              {keterangan.trim() && (
                <div style={{ fontSize: 13, color: color.textMuted, marginTop: 2 }}>Keterangan: {keterangan}</div>
              )}
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(0,0,0,0.06)", fontSize: 13, fontWeight: 700, color: isDemoMode ? "#f57f17" : savedOffline ? color.info : color.brand700 }}>
                Avg keseluruhan: {(() => {
                  const avgs = tableData.map(r => parseFloat(calcAvg(r.s1, r.s2, r.s3))).filter(v => v > 0);
                  return avgs.length > 0 ? (avgs.reduce((a, b) => a + b, 0) / avgs.length).toFixed(2) + " g" : "—";
                })()}
              </div>
            </div>

            <button onClick={resetForm} style={{ width: "100%", padding: "15px", background: isDemoMode ? "#fff8e1" : savedOffline ? color.infoBg : color.brandBg, border: `2px solid ${isDemoMode ? color.warningBorder : savedOffline ? color.infoBorder : color.brand400}`, borderRadius: 12, color: isDemoMode ? color.warning : savedOffline ? color.info : color.brand700, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              + Input GH Berikutnya
            </button>
          </div>
        )}
      </div>

      {/* ── Bottom Nav ── */}
      {step < 3 && (
        <div style={{ padding: "12px 16px 24px", borderTop: `1px solid ${color.border}`, background: color.card, position: "sticky", bottom: 0, display: "flex", gap: 10 }}>
          {step > 1 && (
            <button onClick={() => { setStep(s => s - 1); setSubmitError(null); }} style={{ flex: 1, padding: "13px", background: color.bg, border: `1px solid ${color.border}`, borderRadius: 12, color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>← Kembali</button>
          )}
          {step === 1 && (
            <button onClick={() => setStep(2)} disabled={!selectedGH} style={{ flex: 2, padding: "13px", border: "none", borderRadius: 12, background: selectedGH ? `linear-gradient(135deg,${color.brand700},#43a047)` : color.border, color: selectedGH ? color.card : color.textGhost, fontSize: 15, fontWeight: 700, cursor: selectedGH ? "pointer" : "not-allowed", transition: "all 0.2s" }}>
              Lanjut Input →
            </button>
          )}
          {step === 2 && (
            <button onClick={() => setConfirmOpen(true)} disabled={!canSubmit || syncing} style={{ flex: 2, padding: "13px", border: "none", borderRadius: 12, background: canSubmit && !syncing ? (!isOnline ? `linear-gradient(135deg,${color.info},#1976D2)` : `linear-gradient(135deg,${color.brand900},${color.brand700})`) : color.border, color: canSubmit && !syncing ? color.card : color.textGhost, fontSize: 15, fontWeight: 700, cursor: canSubmit && !syncing ? "pointer" : "not-allowed", transition: "all 0.2s" }}>
              {syncing
                ? `⏳ Mengirim...`
                : !isOnline && canSubmit
                  ? `💾 Simpan Offline (${tableData.length} baris)`
                  : `Submit ${tableData.length} Baris ✓`}
            </button>
          )}
        </div>
      )}

      <ConfirmSubmitModal
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => { setConfirmOpen(false); handleSubmit(); }}
        color="#1E88E5"
        isOffline={!isOnline}
        summary={[
          { label: "Tanggal",   value: todayISO },
          { label: "GH",        value: selectedGH },
          { label: "Jml Baris", value: `${tableData.length} baris` },
          { label: "Operator",  value: operator },
          ...(keterangan.trim() ? [{ label: "Keterangan", value: keterangan }] : []),
        ]}
      />

      <style>{`
        input[type=number]::-webkit-outer-spin-button,
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
      `}</style>
    </div>
  );
}
