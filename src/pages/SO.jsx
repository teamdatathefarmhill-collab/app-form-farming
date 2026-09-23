import { useState, useEffect, useCallback } from "react";
import { useDraft } from "../hooks/useDraft";
import { idbAdd, idbGetAll, idbDelete, idbCount, gasPost } from "../utils/idb";
import { useGHData } from "../hooks/useGHData";
import { useGHBlockedList, warnIfGHBlocked } from "../hooks/useGHBlockedList";
import { useSOHistory, hasCompletedCheckpoint } from "../hooks/useSOHistory";
import ConfirmSubmitModal from "../components/ConfirmSubmitModal";
import { color } from "../styles/tokens";

const DB_NAME    = "SOOfflineDB";
const SCRIPT_URL = import.meta.env.VITE_GAS_SO_URL;

// ─── Tipe GH & mapping nama ───────────────────────────────────────────────────
const TIPE_GH = [
  { key: "drip",         label: "Drip",         color: color.info },
  { key: "kolam",        label: "Kolam",        color: "#00838F" },
];

function buildGHNames() {
  const drip = [
    ...["BERGAS 1","BERGAS 2","BERGAS 3","BERGAS 4","BERGAS 5","BERGAS 7","BERGAS 8"],
    ...["COLOMADU 1","COLOMADU 2","COLOMADU 3","COLOMADU 4"],
    ...["TOHUDAN 14","TOHUDAN 15","TOHUDAN 16","TOHUDAN 17","TOHUDAN 18","TOHUDAN 19","TOHUDAN 20","TOHUDAN 21"],
  ];
  const kolam = [
    ...Array.from({ length: 13 }, (_, i) => `TOHUDAN ${i + 1}`),
    ...["SAWAHAN 1","SAWAHAN 2","SAWAHAN 3","SAWAHAN 4"],
    "TOHUDAN 22","SAWAHAN TUNNEL 1",
  ];
  return { drip, kolam };
}

const GH_NAMES = buildGHNames();

// ─── Varian list ──────────────────────────────────────────────────────────────
const VARIAN_LIST = [
  "Greeniegal","Sunray","Midori","Elysia","Aruni",
  "Greenie Sweet","Sarasuka","Daegoji","Sagami","S7","Dalmatian","Lainnya",
];

// ─── Checkpoint SO ────────────────────────────────────────────────────────────
const SO_CHECKPOINT_1 = 35;
const SO_CHECKPOINT_2 = 50;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function hitungHST(tglStr) {
  const cleaned = tglStr?.trim();
  if (!cleaned) return null;

  const BULAN = {
    jan:1, feb:2, mar:3, apr:4, may:5, mei:5, jun:6,
    jul:7, aug:8, agu:8, sep:9, oct:10, okt:10, nov:11, dec:12, des:12,
  };

  let tanam;

  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    const [y, m, d] = cleaned.split("-").map(Number);
    tanam = new Date(y, m - 1, d);
  } else if (/^\d{1,2}-[a-zA-Z]{3}-\d{4}$/.test(cleaned)) {
    const [d, mon, y] = cleaned.split("-");
    const m = BULAN[mon.toLowerCase()];
    if (!m) return null;
    tanam = new Date(parseInt(y), m - 1, parseInt(d));
  } else if (/^\d{1,2}\s+[a-zA-Z]{3,}\s+\d{4}$/.test(cleaned)) {
    const parts = cleaned.split(/\s+/);
    const d = parseInt(parts[0]);
    const mon = parts[1].slice(0, 3).toLowerCase();
    const y = parseInt(parts[2]);
    const m = BULAN[mon];
    if (!m) return null;
    tanam = new Date(y, m - 1, d);
  } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleaned)) {
    const [d, m, y] = cleaned.split("/").map(Number);
    tanam = new Date(y, m - 1, d);
  } else {
    tanam = new Date(cleaned);
  }

  if (!tanam || isNaN(tanam)) return null;
  const now = new Date();
  const nowLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((nowLocal - tanam) / 86400000);
}

// ─── getSOStatus — dengan soHistory check ────────────────────────────────────
// Sekarang menerima soHistory + info GH untuk cek apakah checkpoint sudah
// pernah dipenuhi di periode yang sama. Kalau sudah, tidak dianggap terlambat.
function getSOStatus(hst, soHistory, gh, periode) {
  if (hst === null) return { late: false, checkpoint: null, daysLate: 0 };

  if (hst > SO_CHECKPOINT_1 && hst < SO_CHECKPOINT_2) {
    // Lewat checkpoint 1 — cek apakah sudah pernah submit di window checkpoint 1
    // (HST berapa pun sebelum checkpoint 2 dimulai, termasuk yang telat)
    const alreadyDone = hasCompletedCheckpoint(soHistory, gh, periode, 0, SO_CHECKPOINT_2);
    if (alreadyDone) return { late: false, checkpoint: SO_CHECKPOINT_1, daysLate: 0 };
    return { late: true, checkpoint: SO_CHECKPOINT_1, daysLate: hst - SO_CHECKPOINT_1 };
  }

  if (hst > SO_CHECKPOINT_2) {
    // Lewat checkpoint 2 — cek apakah sudah pernah submit di window checkpoint 2
    // (HST >= 50, termasuk yang telat)
    const alreadyDone = hasCompletedCheckpoint(soHistory, gh, periode, SO_CHECKPOINT_2);
    if (alreadyDone) return { late: false, checkpoint: SO_CHECKPOINT_2, daysLate: 0 };
    return { late: true, checkpoint: SO_CHECKPOINT_2, daysLate: hst - SO_CHECKPOINT_2 };
  }

  return {
    late: false,
    checkpoint: hst === SO_CHECKPOINT_1 || hst === SO_CHECKPOINT_2 ? hst : null,
    daysLate: 0,
  };
}

function hstChipStyle(hst, soStatus) {
  if (hst === null) return { bg: color.bg, color: color.textFaint, border: color.border };
  if (hst === SO_CHECKPOINT_1 - 1 || hst === SO_CHECKPOINT_2 - 1) return { bg: color.warningBg, color: color.warning, border: color.warningBorder };
  if (hst === SO_CHECKPOINT_1 || hst === SO_CHECKPOINT_2) return { bg: "#fbe9e7", color: "#bf360c", border: "#ffab91" };
  if (soStatus?.late) return { bg: "#fce4ec", color: "#880e4f", border: "#f48fb1" };
  return { bg: color.brandBg, color: color.brand700, border: color.brand300 };
}

function isSODeadlineAlert(hst) {
  return hst === SO_CHECKPOINT_1 - 1 || hst === SO_CHECKPOINT_1 ||
         hst === SO_CHECKPOINT_2 - 1 || hst === SO_CHECKPOINT_2;
}

function isSOAktif(hst) {
  return hst !== null && hst >= 1 && hst < 65;
}

const LS_KEY_PREFIX = "so_submitted_";
function getLSKey() {
  return LS_KEY_PREFIX + new Date().toLocaleDateString("id-ID");
}
function getSubmittedToday() {
  try { return JSON.parse(localStorage.getItem(getLSKey()) || "[]"); } catch { return []; }
}
function markSubmitted(gh) {
  const list = getSubmittedToday();
  if (!list.includes(gh)) localStorage.setItem(getLSKey(), JSON.stringify([...list, gh]));
}

const todayISO   = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
const todayLabel = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const todayTimestamp = () => new Date().toLocaleString("id-ID");


// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function SO() {
  const { getDraft, saveDraft, clearDraft } = useDraft("so");
  const _draft = getDraft();

  const [step, setStep]         = useState(_draft?.step || 1);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const { ghData, loading: loadingRef, isDemoMode, refetch: fetchRefData } = useGHData();
  const { blockedMap } = useGHBlockedList();
  const { soHistory, loading: loadingHistory, refetch: fetchSOHistory }    = useSOHistory();

  const [openTipe, setOpenTipe]         = useState(null);
  const [selectedGH, setSelectedGH]     = useState(_draft?.selectedGH || "");
  const [tableData, setTableData]       = useState(_draft?.tableData  || []);
  const [operator, setOperator]         = useState(_draft?.operator   || "");
  const [keterangan, setKeterangan]     = useState(_draft?.keterangan || "");

  const [syncing, setSyncing]           = useState(false);
  const [syncProgress, setSyncProgress] = useState({ done: 0, total: 0 });
  const [submitError, setSubmitError]   = useState(null);
  const [savedOffline, setSavedOffline] = useState(false);
  const [confirmOpen, setConfirmOpen]   = useState(false);

  const [submittedToday, setSubmittedToday] = useState(getSubmittedToday());
  const [showDoubleWarn, setShowDoubleWarn] = useState(false);
  const [pendingGH, setPendingGH]           = useState("");

  const [pendingCount, setPendingCount]         = useState(0);
  const [isSyncingPending, setIsSyncingPending] = useState(false);

  // ── Online/offline listener ──
  useEffect(() => {
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online",  on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => {
    if (step === 3) return;
    saveDraft({ step, selectedGH, tableData, operator, keterangan });
  }, [step, selectedGH, tableData, operator, keterangan]);

  const refreshPendingCount = useCallback(async () => {
    try { setPendingCount(await idbCount(DB_NAME)); } catch { setPendingCount(0); }
  }, []);

  useEffect(() => { refreshPendingCount(); }, [refreshPendingCount]);

  // ── Auto-sync saat kembali online ──
  useEffect(() => {
    if (isOnline) {
      syncPendingData();
      fetchSOHistory(); // refresh SO history saat online kembali
    }
  }, [isOnline]);

  // ── Sync pending offline ──
  const syncPendingData = useCallback(async () => {
    const allPending = await idbGetAll(DB_NAME);
    if (allPending.length === 0) return;
    setIsSyncingPending(true);
    for (const record of allPending) {
      try {
        await gasPost(SCRIPT_URL, { action: "submitSOBatch", rows: record.payloads });
        markSubmitted(record.gh);
        setSubmittedToday(getSubmittedToday());
        await idbDelete(DB_NAME, record.id);
      } catch {
        // Gagal sync record ini, skip — coba lagi nanti
      }
    }
    await refreshPendingCount();
    setIsSyncingPending(false);
  }, [refreshPendingCount]);

  // ── Helper: getSOStatus dengan soHistory ──
  // Wrapper agar tidak perlu pass soHistory manual setiap kali
  const getStatus = useCallback((hst, gh, periode) => {
    return getSOStatus(hst, soHistory, gh, periode);
  }, [soHistory]);

  // ── GH aktif per tipe ──
  const ghAktifPerTipe = useCallback((tipe) => {
    const names = GH_NAMES[tipe] || [];
    return names
      .filter(name => {
        const info = ghData[name];
        if (!info) return false;
        const hst = hitungHST(info.tanam);
        return isSOAktif(hst);
      })
      .map(name => {
        const info = ghData[name];
        const hst  = hitungHST(info.tanam);
        return { name, ...info, hst };
      });
  }, [ghData]);

  // ── Reminder banner ──
  const reminderGH = useCallback(() => {
    const result = [];
    for (const tipe of TIPE_GH) {
      for (const gh of ghAktifPerTipe(tipe.key)) {
        const st = getStatus(gh.hst, gh.name, gh.periode);
        if (gh.hst === SO_CHECKPOINT_1 - 1 || gh.hst === SO_CHECKPOINT_2 - 1) {
          result.push({ ...gh, reminderType: "h1" });
        } else if (gh.hst === SO_CHECKPOINT_1 || gh.hst === SO_CHECKPOINT_2) {
          if (!submittedToday.includes(gh.name)) result.push({ ...gh, reminderType: "hariH" });
        } else if (st.late) {
          if (!submittedToday.includes(gh.name)) {
            result.push({ ...gh, reminderType: "late", daysLate: st.daysLate, checkpoint: st.checkpoint });
          }
        }
      }
    }
    return result;
  }, [ghAktifPerTipe, submittedToday, getStatus]);

  // ── Pilih GH ──
  const handleSelectGH = (gh) => {
    if (warnIfGHBlocked(gh, blockedMap)) return;
    if (submittedToday.includes(gh)) {
      setPendingGH(gh); setShowDoubleWarn(true);
    } else {
      doSelectGH(gh);
    }
  };

  const doSelectGH = (gh) => {
    setSelectedGH(gh);
    const info = ghData[gh];
    setTableData((info?.baris || []).map(b => ({ baris: b.baris, varian: b.varian, populasi: "", isManual: false })));
    setKeterangan("");
    setShowDoubleWarn(false);
    setPendingGH("");
    setStep(2);
  };

  // ── Tabel helpers ──
  const updatePopulasi = (i, val) => {
    if (val !== "" && !/^\d+$/.test(val)) return;
    setTableData(prev => { const d = [...prev]; d[i] = { ...d[i], populasi: val }; return d; });
  };

  const updateManualField = (i, field, val) => {
    setTableData(prev => { const d = [...prev]; d[i] = { ...d[i], [field]: val }; return d; });
  };

  const addManualRow = () => {
    setTableData(prev => [...prev, { baris: "", varian: "", populasi: "", isManual: true }]);
  };

  const removeManualRow = (i) => {
    setTableData(prev => prev.filter((_, idx) => idx !== i));
  };

  // ── Derived values ──
  const ghInfo    = ghData[selectedGH];
  const hstAktif  = ghInfo?.tanam ? hitungHST(ghInfo.tanam) : null;
  const soStatus  = getStatus(hstAktif, selectedGH, ghInfo?.periode);
  const chipStyle = hstChipStyle(hstAktif, soStatus);
  const reminders = reminderGH();

  // ── Validasi ──
  const normalRows      = tableData.filter(r => !r.isManual);
  const manualRows      = tableData.filter(r => r.isManual);
  const filledNormal    = normalRows.filter(r => r.populasi !== "").length;
  const filledManual    = manualRows.filter(r => r.baris.trim() && r.varian && r.populasi !== "").length;
  const totalRows       = tableData.length;
  const filledCount     = filledNormal + filledManual;
  const allNormalFilled = normalRows.length > 0 && filledNormal === normalRows.length;
  const manualOK        = manualRows.every(r => r.baris.trim() && r.varian && r.populasi !== "");
  const keteranganOK    = !soStatus.late || keterangan.trim().length > 0;
  const canSubmit       = allNormalFilled && manualOK && operator.trim().length > 0 && keteranganOK;

  // ── Build payloads ──
  const buildPayloads = () => {
    const ghInfoP           = ghData[selectedGH];
    const hst               = ghInfoP?.tanam ? hitungHST(ghInfoP.tanam) : "";
    const ts                = todayTimestamp();
    const client_timestamp  = new Date().toISOString();
    const ketFinal          = soStatus.late ? keterangan.trim() : "";
    return tableData
      .filter(r => r.populasi !== "")
      .map(r => ({
        action:           "submitSOBatch",
        client_timestamp: client_timestamp,
        timestamp:        ts,
        tanggal:          todayISO,
        operator:         operator.trim(),
        greenhouse:       selectedGH,
        periode:          ghInfoP?.periode || "",
        hst:              hst ?? "",
        baris:            r.baris,
        varian:           r.varian,
        populasi:         parseInt(r.populasi) || 0,
        keterangan:       ketFinal,
      }));
  };

  // ── Submit ──
  const handleSubmit = async () => {
    if (warnIfGHBlocked(selectedGH, blockedMap)) return;
    setSyncing(true);
    setSubmitError(null);
    const payloads = buildPayloads();
    setSyncProgress({ done: 0, total: payloads.length });

    // Demo mode
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

    // Offline
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

    // Online
    setSavedOffline(false);
    try {
      setSyncProgress({ done: 0, total: payloads.length });
      await gasPost(SCRIPT_URL, { action: "submitSOBatch", rows: payloads });
      setSyncProgress({ done: payloads.length, total: payloads.length });
      markSubmitted(selectedGH);
      setSubmittedToday(getSubmittedToday());
      clearDraft();
      // Refresh SO history setelah submit berhasil supaya status langsung update
      fetchSOHistory();
      setStep(3);
    } catch {
      setSubmitError("Gagal mengirim data. Cek koneksi dan coba lagi.");
    } finally {
      setSyncing(false);
    }
  };

  const resetForm = () => {
    clearDraft();
    setStep(1); setOpenTipe(null); setSelectedGH(""); setTableData([]);
    setOperator(""); setKeterangan(""); setSyncing(false); setSyncProgress({ done: 0, total: 0 });
    setSubmitError(null); setSavedOffline(false);
  };

  const loadingAll = loadingRef || loadingHistory;

  return (
    <div style={{ minHeight: "100vh", background: color.bg, fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>

      {/* ── Header ── */}
      <div style={{ background: color.brand900, color: color.card, padding: "14px 16px 10px", position: "sticky", top: 0, zIndex: 10, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, opacity: 0.75, letterSpacing: 1.5, textTransform: "uppercase" }}>Stock Opname Populasi</div>
            <div style={{ fontSize: 13, opacity: 0.65, marginTop: 1 }}>{todayLabel}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {pendingCount > 0 && (
              <button onClick={isOnline ? syncPendingData : undefined}
                style={{ fontSize: 10, fontWeight: 700, background: isOnline ? "rgba(33,150,243,0.3)" : "rgba(255,179,0,0.3)", border: `1px solid ${isOnline ? "rgba(33,150,243,0.6)" : "rgba(255,179,0,0.6)"}`, color: color.card, padding: "2px 8px", borderRadius: 20, cursor: isOnline ? "pointer" : "default", display: "flex", alignItems: "center", gap: 4 }}>
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

        {/* Step progress bar */}
        {step < 3 && (
          <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
            {[1, 2].map(s => (
              <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: s <= step ? color.brand300 : "rgba(255,255,255,0.2)", transition: "background 0.3s" }} />
            ))}
          </div>
        )}
      </div>

      {/* ── Modal double submit warning ── */}
      {showDoubleWarn && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: color.card, borderRadius: 16, padding: 24, maxWidth: 360, width: "100%" }}>
            <div style={{ fontSize: 36, textAlign: "center", marginBottom: 12 }}>⚠️</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: color.text, textAlign: "center", marginBottom: 8 }}>GH Sudah Diisi Hari Ini</div>
            <div style={{ fontSize: 13, color: color.textMuted, textAlign: "center", marginBottom: 20, lineHeight: 1.5 }}>
              <strong>{pendingGH}</strong> sudah disubmit hari ini. Yakin mau isi ulang?
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setShowDoubleWarn(false); setPendingGH(""); }} style={{ flex: 1, padding: "11px", background: color.bg, border: `1px solid ${color.border}`, borderRadius: 10, color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Batal</button>
              <button onClick={() => doSelectGH(pendingGH)} style={{ flex: 1, padding: "11px", background: color.danger, border: "none", borderRadius: 10, color: color.card, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Isi Ulang</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: "16px" }}>

        {/* ══ STEP 1 — Pilih GH ══ */}
        {step === 1 && (
          <div>
            {(() => {
              const deadline = reminders.filter(r => r.reminderType === "h1" || r.reminderType === "hariH");
              const late1    = reminders.filter(r => r.reminderType === "late" && r.checkpoint === SO_CHECKPOINT_1).sort((a, b) => b.daysLate - a.daysLate);
              const late2    = reminders.filter(r => r.reminderType === "late" && r.checkpoint === SO_CHECKPOINT_2).sort((a, b) => b.daysLate - a.daysLate);
              if (deadline.length === 0 && late1.length === 0 && late2.length === 0) return null;

              const chipBase = { display: "inline-flex", alignItems: "center", gap: 4, borderRadius: 7, padding: "3px 8px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" };

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                  {deadline.length > 0 && (
                    <div style={{ background: color.warningBg, border: `1px solid ${color.warningBorder}`, borderRadius: 12, padding: "10px 12px" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: color.warning, marginBottom: 8 }}>
                        🔔 Deadline SO <span style={{ fontWeight: 600, opacity: 0.7 }}>({deadline.length} GH)</span>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {deadline.map(gh => (
                          <div key={gh.name} style={{ ...chipBase, background: gh.reminderType === "hariH" ? "#fbe9e7" : "#fff8e1", border: `1px solid ${gh.reminderType === "hariH" ? "#ffab91" : "#ffe082"}`, color: gh.reminderType === "hariH" ? "#bf360c" : color.warning }}>
                            {gh.name}
                            <span style={{ fontWeight: 600, fontSize: 10, opacity: 0.85 }}>{gh.reminderType === "hariH" ? "hari ini!" : "besok"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {late1.length > 0 && (
                    <div style={{ background: "#fce4ec", border: "1px solid #f48fb1", borderRadius: 12, padding: "10px 12px" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#880e4f", marginBottom: 8 }}>
                        ⏰ Lewat Checkpoint HST {SO_CHECKPOINT_1} <span style={{ fontWeight: 600, opacity: 0.7 }}>({late1.length} GH)</span>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {late1.map(gh => (
                          <div key={gh.name} style={{ ...chipBase, background: color.card, border: "1px solid #f48fb1", color: "#880e4f" }}>
                            {gh.name}
                            <span style={{ fontWeight: 600, fontSize: 10, opacity: 0.85 }}>+{gh.daysLate} hari</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {late2.length > 0 && (
                    <div style={{ background: "#fce4ec", border: "1px solid #f48fb1", borderRadius: 12, padding: "10px 12px" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#880e4f", marginBottom: 8 }}>
                        ⏰ Lewat Checkpoint HST {SO_CHECKPOINT_2} <span style={{ fontWeight: 600, opacity: 0.7 }}>({late2.length} GH)</span>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {late2.map(gh => (
                          <div key={gh.name} style={{ ...chipBase, background: color.card, border: "1px solid #f48fb1", color: "#880e4f" }}>
                            {gh.name}
                            <span style={{ fontWeight: 600, fontSize: 10, opacity: 0.85 }}>+{gh.daysLate} hari</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {isDemoMode && (
              <div style={{ background: "#fff8e1", border: "1px solid #ffe082", borderRadius: 10, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>🔌</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: "#f57f17", fontWeight: 600 }}>Data REF tidak terjangkau</div>
                  <div style={{ fontSize: 11, color: "#a67c00", marginTop: 2 }}>Menampilkan data demo</div>
                </div>
                <button onClick={fetchRefData} style={{ padding: "5px 10px", background: color.warningBg, border: `1px solid ${color.warningBorder}`, borderRadius: 7, color: color.warning, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Coba Lagi</button>
              </div>
            )}

            <div style={{ fontWeight: 700, fontSize: 18, color: color.brand900, marginBottom: 4 }}>Pilih Greenhouse</div>
            <div style={{ fontSize: 12, color: color.textSoft, marginBottom: 16 }}>Stock opname dilakukan pada checkpoint HST {SO_CHECKPOINT_1} &amp; HST {SO_CHECKPOINT_2}</div>

            {loadingAll ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: color.textGhost }}>
                <div style={{ fontSize: 28 }}>🔄</div>
                <div style={{ fontSize: 13, marginTop: 8 }}>Memuat data...</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {TIPE_GH.map(tipe => {
                  const aktif       = ghAktifPerTipe(tipe.key);
                  const isOpen      = openTipe === tipe.key;
                  const hasReminder = aktif.some(g => g.hst === SO_CHECKPOINT_1 - 1 || g.hst === SO_CHECKPOINT_2 - 1);
                  const hasLate     = aktif.some(g => getStatus(g.hst, g.name, g.periode).late && !submittedToday.includes(g.name));
                  return (
                    <div key={tipe.key} style={{ borderRadius: 14, border: `1.5px solid ${isOpen ? tipe.color : color.border}`, background: color.card, overflow: "hidden", transition: "border-color 0.2s" }}>
                      <button onClick={() => setOpenTipe(isOpen ? null : tipe.key)}
                        style={{ width: "100%", padding: "14px 16px", background: isOpen ? `${tipe.color}10` : "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ textAlign: "left" }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: tipe.color }}>{tipe.label}</div>
                          <div style={{ fontSize: 12, color: color.textSoft, marginTop: 2 }}>{aktif.length} GH aktif saat ini</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {hasLate && <div style={{ fontSize: 10, fontWeight: 700, background: "#fce4ec", border: "1px solid #f48fb1", borderRadius: 20, padding: "2px 8px", color: "#880e4f" }}>Terlambat ⏰</div>}
                          {hasReminder && <div style={{ fontSize: 10, fontWeight: 700, background: color.warningBg, border: `1px solid ${color.warningBorder}`, borderRadius: 20, padding: "2px 8px", color: color.warning }}>H-1 ⚠</div>}
                          <span style={{ fontSize: 18, color: tipe.color, transition: "transform 0.2s", display: "inline-block", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}>›</span>
                        </div>
                      </button>

                      {isOpen && (
                        <div style={{ padding: "0 12px 14px", borderTop: `1px solid ${tipe.color}20` }}>
                          {aktif.length === 0 ? (
                            <div style={{ textAlign: "center", padding: "20px 0", color: color.textGhost, fontSize: 13 }}>Tidak ada GH aktif untuk tipe ini.</div>
                          ) : (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
                              {aktif.map(gh => {
                                const lateInfo = getStatus(gh.hst, gh.name, gh.periode);
                                const chip     = hstChipStyle(gh.hst, lateInfo);
                                const sudahIsi = submittedToday.includes(gh.name);
                                const alert    = isSODeadlineAlert(gh.hst);
                                return (
                                  <button key={gh.name} onClick={() => handleSelectGH(gh.name)}
                                    style={{ padding: "10px 8px", borderRadius: 12, cursor: "pointer", textAlign: "center", border: sudahIsi ? `1px solid ${color.warningBorder}` : (alert || lateInfo.late) ? `2px solid ${chip.border}` : `1px solid ${color.border}`, background: sudahIsi ? "#fff8e1" : color.card, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, transition: "all 0.2s" }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: color.text, lineHeight: 1.3 }}>{gh.name}</div>
                                    <div style={{ fontSize: 10, color: color.textGhost }}>P{gh.periode} · {gh.baris?.length || 0} baris</div>
                                    {gh.hst !== null && (
                                      <div style={{ background: chip.bg, border: `1px solid ${chip.border}`, borderRadius: 7, padding: "3px 10px", width: "100%" }}>
                                        <span style={{ fontSize: 15, fontWeight: 800, color: chip.color }}>{gh.hst}</span>
                                        <span style={{ fontSize: 10, color: chip.color, marginLeft: 3 }}>HST</span>
                                      </div>
                                    )}
                                    {sudahIsi && <div style={{ fontSize: 10, background: color.warningBg, border: `1px solid ${color.warningBorder}`, borderRadius: 20, padding: "2px 8px", color: color.warning, fontWeight: 600 }}>✓ Sudah diisi</div>}
                                    {alert && !sudahIsi && <div style={{ fontSize: 10, background: "#fbe9e7", border: "1px solid #ffab91", borderRadius: 20, padding: "2px 8px", color: "#bf360c", fontWeight: 600 }}>⚠ Deadline</div>}
                                    {lateInfo.late && !sudahIsi && <div style={{ fontSize: 10, background: "#fce4ec", border: "1px solid #f48fb1", borderRadius: 20, padding: "2px 8px", color: "#880e4f", fontWeight: 600 }}>⏰ Terlambat {lateInfo.daysLate} hari</div>}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ STEP 2 — Form Input ══ */}
        {step === 2 && (
          <div>
            <button onClick={() => setStep(1)} style={{ background: "none", border: "none", color: color.textMuted, fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 12, display: "flex", alignItems: "center", gap: 4 }}>← Kembali</button>

            {/* Info chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
              <div style={{ background: color.brandBg, border: `1px solid ${color.brand300}`, borderRadius: 20, padding: "3px 12px", fontSize: 12, color: color.brand700, fontWeight: 700 }}>{selectedGH}</div>
              <div style={{ background: color.bg, borderRadius: 20, padding: "3px 12px", fontSize: 12, color: color.textMuted }}>Periode {ghInfo?.periode}</div>
              {hstAktif !== null && (
                <div style={{ background: chipStyle.bg, border: `1px solid ${chipStyle.border}`, borderRadius: 20, padding: "3px 12px", fontSize: 12, color: chipStyle.color, fontWeight: 700 }}>{hstAktif} HST</div>
              )}
              {soStatus.late && (
                <div style={{ background: "#fce4ec", border: "1px solid #f48fb1", borderRadius: 20, padding: "3px 12px", fontSize: 12, color: "#880e4f", fontWeight: 700 }}>⏰ Terlambat {soStatus.daysLate} hari</div>
              )}
            </div>

            {/* Banner terlambat */}
            {soStatus.late && (
              <div style={{ marginBottom: 12, padding: "8px 12px", background: "#fce4ec", border: "1px solid #f48fb1", borderRadius: 9 }}>
                <span style={{ fontSize: 12, color: "#880e4f" }}>
                  ⏰ SO ini terlambat <strong>{soStatus.daysLate} hari</strong> dari checkpoint HST {soStatus.checkpoint}. Wajib isi alasan keterlambatan sebelum submit.
                </span>
              </div>
            )}

            {!isOnline && (
              <div style={{ marginBottom: 12, padding: "8px 12px", background: color.warningBg, border: `1px solid ${color.warningBorder}`, borderRadius: 9, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14 }}>📵</span>
                <span style={{ fontSize: 11, color: color.warning }}>Offline — data disimpan lokal & dikirim otomatis saat online</span>
              </div>
            )}

            <div style={{ fontWeight: 700, fontSize: 17, color: color.brand900, marginBottom: 2 }}>Input Populasi</div>
            <div style={{ fontSize: 12, color: color.textSoft, marginBottom: 8 }}>{filledCount}/{totalRows} baris terisi</div>

            {/* Progress bar */}
            <div style={{ background: color.border, borderRadius: 4, height: 5, marginBottom: 14, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 4, background: "#4CAF50", width: `${totalRows > 0 ? (filledCount / totalRows) * 100 : 0}%`, transition: "width 0.3s" }} />
            </div>

            {/* Tabel */}
            <div style={{ overflowX: "auto", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.08)", marginBottom: 16 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: color.brand900, color: color.card }}>
                    <th style={{ padding: "9px 10px", textAlign: "left", fontWeight: 700, fontSize: 11 }}>Baris</th>
                    <th style={{ padding: "9px 6px", textAlign: "left", fontWeight: 700, fontSize: 11 }}>Varian</th>
                    <th style={{ padding: "9px 10px", textAlign: "center", fontWeight: 700, fontSize: 11 }}>Populasi</th>
                    <th style={{ padding: "9px 6px", width: 32 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {tableData.map((row, i) => {
                    const filled   = row.populasi !== "";
                    const isManual = row.isManual;
                    return (
                      <tr key={i} style={{ background: isManual ? color.purpleBg : filled ? "#f1f8e9" : i % 2 === 0 ? color.card : "#fafafa", transition: "background 0.2s" }}>
                        <td style={{ padding: "6px 10px", fontWeight: 700, color: isManual ? color.purple700 : color.brand900, whiteSpace: "nowrap" }}>
                          {isManual ? (
                            <input type="text" value={row.baris} onChange={e => updateManualField(i, "baris", e.target.value)}
                              placeholder="A" style={{ width: 44, textAlign: "center", border: `1.5px solid ${color.purple300}`, borderRadius: 6, padding: "4px 6px", fontSize: 12, fontWeight: 700, color: color.purple700, outline: "none", background: color.card }} />
                          ) : row.baris}
                        </td>
                        <td style={{ padding: "6px 6px", fontSize: 11, color: isManual ? color.purple700 : color.textMuted, whiteSpace: "nowrap" }}>
                          {isManual ? (
                            <select value={row.varian} onChange={e => updateManualField(i, "varian", e.target.value)}
                              style={{ border: `1.5px solid ${color.purple300}`, borderRadius: 6, padding: "4px 6px", fontSize: 11, color: color.purple700, outline: "none", background: color.card, maxWidth: 110 }}>
                              <option value="">Pilih varian</option>
                              {VARIAN_LIST.map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                          ) : row.varian}
                        </td>
                        <td style={{ padding: "4px 6px", textAlign: "center" }}>
                          <input type="number" inputMode="numeric" value={row.populasi}
                            onChange={e => updatePopulasi(i, e.target.value)}
                            placeholder="—"
                            style={{ width: 70, height: 32, textAlign: "center", border: `1.5px solid ${filled ? (isManual ? color.purple300 : color.brand400) : color.border}`, borderRadius: 7, fontSize: 13, fontWeight: 600, color: filled ? (isManual ? color.purple700 : color.brand700) : "#bbb", outline: "none", background: color.card }} />
                        </td>
                        <td style={{ padding: "4px 6px", textAlign: "center" }}>
                          {isManual && (
                            <button onClick={() => removeManualRow(i)} style={{ background: "none", border: "none", color: color.danger, fontSize: 16, cursor: "pointer", padding: "2px 4px", lineHeight: 1 }}>×</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Tombol tambah baris manual */}
            <button onClick={addManualRow}
              style={{ width: "100%", padding: "10px", background: color.purpleBg, border: `1.5px dashed ${color.purple300}`, borderRadius: 10, color: color.purple700, fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 16 }}>
              + Tambah baris / varian tidak terdaftar
            </button>

            {/* Ringkasan & Copy */}
            {filledCount > 0 && (() => {
              const totalPerVarian = {};
              let totalAll = 0;
              tableData.forEach(r => {
                if (r.populasi === "") return;
                const pop = parseInt(r.populasi) || 0;
                const v   = r.varian || "Tidak diketahui";
                totalPerVarian[v] = (totalPerVarian[v] || 0) + pop;
                totalAll += pop;
              });

              const barisGroup = {};
              const barisOrder = [];
              tableData.forEach(r => {
                if (r.populasi === "") return;
                const barisKey = r.baris.replace(/\d+$/, "").trim() || r.baris;
                if (!barisGroup[barisKey]) {
                  barisGroup[barisKey] = {};
                  barisOrder.push(barisKey);
                }
                const v = r.varian || "?";
                barisGroup[barisKey][v] = (barisGroup[barisKey][v] || 0) + (parseInt(r.populasi) || 0);
              });

              const lines = barisOrder.map(baris => {
                const parts = Object.entries(barisGroup[baris]).map(([v, p]) => `${v} ${p}`).join(" ");
                return `${baris} ${parts}`;
              });

              const totalLines = Object.entries(totalPerVarian)
                .sort((a, b) => b[1] - a[1])
                .map(([v, t]) => `${v}: ${t.toLocaleString("id-ID")} tanaman`);

              const clipboardText = [
                `SO ${selectedGH} - ${todayISO}`,
                `Periode ${ghData[selectedGH]?.periode || ""} | ${hstAktif ?? ""} HST`,
                ...(soStatus.late ? [`TERLAMBAT ${soStatus.daysLate} hari dari checkpoint HST ${soStatus.checkpoint}${keterangan.trim() ? ` — Alasan: ${keterangan.trim()}` : ""}`] : []),
                "",
                ...lines,
                "",
                "--- TOTAL PER VARIAN ---",
                ...totalLines,
                `TOTAL: ${totalAll.toLocaleString("id-ID")} tanaman`,
              ].join("\n");

              return (
                <div style={{ background: "#f9fbe7", border: "1.5px solid #dce775", borderRadius: 12, padding: 14, marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#558b2f", textTransform: "uppercase", letterSpacing: 1 }}>📊 Ringkasan</div>
                    <button onClick={() => {
                      navigator.clipboard.writeText(clipboardText)
                        .then(() => alert("✅ Disalin ke clipboard!"))
                        .catch(() => alert("Gagal menyalin, coba lagi."));
                    }}
                      style={{ padding: "5px 12px", background: "#558b2f", border: "none", borderRadius: 8, color: color.card, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      📋 Copy
                    </button>
                  </div>
                  <div style={{ fontFamily: "monospace", fontSize: 12, color: color.text, marginBottom: 10, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
                    {lines.join("\n")}
                  </div>
                  <div style={{ borderTop: "1px solid #dce775", paddingTop: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#558b2f", marginBottom: 6 }}>Total per varian</div>
                    {Object.entries(totalPerVarian).sort((a,b) => b[1]-a[1]).map(([v, t]) => (
                      <div key={v} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "2px 0" }}>
                        <span style={{ color: "#555" }}>{v}</span>
                        <span style={{ fontWeight: 700, color: color.brand900, fontFamily: "monospace" }}>{t.toLocaleString("id-ID")}</span>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, borderTop: "1px solid #dce775", marginTop: 6, paddingTop: 6 }}>
                      <span>Total keseluruhan</span>
                      <span style={{ color: color.brand900, fontFamily: "monospace" }}>{totalAll.toLocaleString("id-ID")}</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Input operator */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: "#388e3c", letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 700 }}>
                👤 Nama Operator <span style={{ color: color.danger }}>*</span>
              </label>
              <input type="text" value={operator} onChange={e => setOperator(e.target.value)}
                placeholder="Tulis nama lengkap..."
                style={{ width: "100%", marginTop: 8, padding: "11px 14px", background: color.card, border: `1.5px solid ${operator.trim() ? color.brand400 : color.border}`, borderRadius: 10, color: color.text, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
            </div>

            {/* Input alasan keterlambatan */}
            {soStatus.late && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: "#880e4f", letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 700 }}>
                  ⏰ Alasan Terlambat Mengisi SO <span style={{ color: color.danger }}>*</span>
                </label>
                <textarea value={keterangan} onChange={e => setKeterangan(e.target.value)}
                  placeholder={`Tulis alasan kenapa SO terlambat ${soStatus.daysLate} hari dari checkpoint HST ${soStatus.checkpoint}...`}
                  rows={3}
                  style={{ width: "100%", marginTop: 8, padding: "11px 14px", background: color.card, border: `1.5px solid ${keterangan.trim() ? "#f48fb1" : color.border}`, borderRadius: 10, color: color.text, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }} />
              </div>
            )}

            {!canSubmit && (() => {
              const missing = [];
              if (normalRows.length > 0 && !allNormalFilled) missing.push(`${normalRows.length - filledNormal} baris referensi belum diisi populasinya`);
              if (!manualOK) {
                const manualIdx = tableData.reduce((acc, r, i) => { if (r.isManual) acc.push(i); return acc; }, []);
                const incomplete = manualRows.filter(r => !(r.baris.trim() && r.varian && r.populasi !== "")).length;
                missing.push(`${incomplete} baris manual belum lengkap (baris/varian/populasi) — cek baris ke-${manualIdx.map(i => i + 1).join(", ")}`);
              }
              if (!operator.trim()) missing.push("Nama Operator belum diisi");
              if (soStatus.late && !keterangan.trim()) missing.push("Alasan Keterlambatan belum diisi");
              if (missing.length === 0) return null;
              return (
                <div style={{ fontSize: 12, color: "#880e4f", background: "#fce4ec", border: "1px solid #f48fb1", borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠️ Belum bisa submit — lengkapi dulu:</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {missing.map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                </div>
              );
            })()}
            {submitError && (
              <div style={{ fontSize: 12, color: color.dangerDeep, background: color.dangerBg, border: `1px solid ${color.dangerBorder}`, borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>
                ⚠️ {submitError}
              </div>
            )}
            {syncing && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: color.textMuted, marginBottom: 6 }}>Menyimpan {syncProgress.done}/{syncProgress.total} baris...</div>
                <div style={{ background: color.border, borderRadius: 4, height: 6, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 4, background: "#4CAF50", width: `${syncProgress.total > 0 ? (syncProgress.done / syncProgress.total) * 100 : 0}%`, transition: "width 0.3s" }} />
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
              {isDemoMode ? "Demo Selesai!" : savedOffline ? "Tersimpan Lokal!" : "Data SO Tersimpan!"}
            </div>
            <div style={{ fontSize: 13, color: color.textSoft, marginBottom: 20 }}>
              {isDemoMode
                ? "Data tidak dikirim (mode demo)"
                : savedOffline
                  ? "Data disimpan di perangkat. Otomatis terkirim ke Google Sheets saat online."
                  : `${buildPayloads().length} baris berhasil dikirim ke Google Sheets`}
            </div>

            {savedOffline && (
              <div style={{ background: color.infoBg, border: `1px solid ${color.infoBorder}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, textAlign: "left" }}>
                <div style={{ fontSize: 12, color: color.info, fontWeight: 600, marginBottom: 4 }}>📡 Cara sync:</div>
                <div style={{ fontSize: 12, color: "#555" }}>Biarkan app terbuka saat koneksi kembali — data terkirim otomatis.</div>
              </div>
            )}

            <div style={{ background: isDemoMode ? "#fff8e1" : savedOffline ? color.infoBg : color.brandBg, border: `1px solid ${isDemoMode ? "#ffe082" : savedOffline ? color.infoBorder : color.brand300}`, borderRadius: 14, padding: 16, textAlign: "left", marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: isDemoMode ? "#f57f17" : savedOffline ? color.info : color.brand700, fontWeight: 700, marginBottom: 10 }}>Ringkasan SO</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: color.text }}>{selectedGH} · Periode {ghInfo?.periode} · {hstAktif} HST</div>
              <div style={{ fontSize: 13, color: color.textMuted, marginTop: 2 }}>Operator: {operator}</div>
              <div style={{ fontSize: 13, color: color.textMuted, marginTop: 2 }}>Tanggal: {todayISO}</div>
              <div style={{ fontSize: 13, color: color.textMuted, marginTop: 2 }}>Total baris: {tableData.filter(r => r.populasi !== "").length} baris</div>
              <div style={{ fontSize: 13, color: color.textMuted, marginTop: 2 }}>
                Total populasi: {tableData.reduce((sum, r) => sum + (parseInt(r.populasi) || 0), 0).toLocaleString("id-ID")} tanaman
              </div>
              {soStatus.late && (
                <div style={{ fontSize: 13, color: "#880e4f", marginTop: 6, paddingTop: 6, borderTop: "1px dashed #f48fb1" }}>
                  ⏰ Terlambat {soStatus.daysLate} hari (checkpoint HST {soStatus.checkpoint})<br />
                  <span style={{ color: color.textMuted }}>Alasan: {keterangan}</span>
                </div>
              )}
            </div>

            <button onClick={resetForm} style={{ width: "100%", padding: "15px", background: isDemoMode ? "#fff8e1" : savedOffline ? color.infoBg : color.brandBg, border: `2px solid ${isDemoMode ? color.warningBorder : savedOffline ? color.infoBorder : color.brand400}`, borderRadius: 12, color: isDemoMode ? color.warning : savedOffline ? color.info : color.brand700, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              + Input GH Berikutnya
            </button>
          </div>
        )}
      </div>

      {/* ── Bottom Nav ── */}
      {step === 2 && (
        <div style={{ padding: "12px 16px 24px", borderTop: `1px solid ${color.border}`, background: color.card, position: "sticky", bottom: 0, display: "flex", gap: 10 }}>
          <button onClick={() => { setStep(1); setSubmitError(null); }} style={{ flex: 1, padding: "13px", background: color.bg, border: `1px solid ${color.border}`, borderRadius: 12, color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>← Kembali</button>
          <button onClick={() => setConfirmOpen(true)} disabled={!canSubmit || syncing}
            style={{ flex: 2, padding: "13px", border: "none", borderRadius: 12, background: canSubmit && !syncing ? (!isOnline ? `linear-gradient(135deg,${color.info},#1976D2)` : `linear-gradient(135deg,${color.brand900},${color.brand700})`) : color.border, color: canSubmit && !syncing ? color.card : color.textGhost, fontSize: 15, fontWeight: 700, cursor: canSubmit && !syncing ? "pointer" : "not-allowed", transition: "all 0.2s" }}>
            {syncing
              ? `⏳ Mengirim...`
              : !isOnline && canSubmit
                ? `💾 Simpan Offline (${tableData.filter(r => r.populasi !== "").length} baris)`
                : `Submit ${tableData.filter(r => r.populasi !== "").length} Baris ✓`}
          </button>
        </div>
      )}

      <ConfirmSubmitModal
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => { setConfirmOpen(false); handleSubmit(); }}
        color="#43A047"
        isOffline={!isOnline}
        isDemoMode={isDemoMode}
        summary={[
          { label: "Tanggal",   value: todayISO },
          { label: "GH",        value: selectedGH },
          { label: "Jml Baris", value: `${tableData.filter(r => r.populasi !== "").length} baris terisi` },
          { label: "Operator",  value: operator },
          ...(soStatus.late ? [{ label: "Keterangan", value: `Terlambat ${soStatus.daysLate} hari — ${keterangan.trim()}` }] : []),
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
