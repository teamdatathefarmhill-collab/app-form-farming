import { useState, useEffect, useCallback } from "react";
import { idbAdd, idbGetAll, idbDelete, idbCount, gasFetch } from "../utils/idb";

const DB_NAME     = "SOOfflineDB";
const SCRIPT_URL  = import.meta.env.VITE_GAS_SO_URL;
const REF_CSV_URL = import.meta.env.VITE_REF_SO_URL;

// ─── Tipe GH & mapping nama ───────────────────────────────────────────────────
const TIPE_GH = [
  { key: "drip",         label: "Drip",         color: "#1565C0" },
  { key: "kolam",        label: "Kolam",        color: "#00838F" },
  { key: "dutch_bucket", label: "Dutch Bucket", color: "#6A1B9A" },
];

function buildGHNames() {
  const drip = [
    ...["BERGAS 1","BERGAS 2","BERGAS 3","BERGAS 4","BERGAS 5","BERGAS 7","BERGAS 8"],
    ...["COLOMADU 1","COLOMADU 2","COLOMADU 3","COLOMADU 4"],
  ];
  const kolam = [
    ...Array.from({ length: 14 }, (_, i) => `TOHUDAN ${i + 1}`),
    ...["SAWAHAN 1","SAWAHAN 2","SAWAHAN 3","SAWAHAN 4"],
    "TOHUDAN 22",
  ];
  const dutch_bucket = Array.from({ length: 7 }, (_, i) => `TOHUDAN ${i + 15}`);
  return { drip, kolam, dutch_bucket };
}

const GH_NAMES = buildGHNames();

// ─── Varian list untuk manual entry ──────────────────────────────────────────
const VARIAN_LIST = [
  "Greeniegal","Midori","Elysia","Sunray","Sarasuka","Aruni",
  "Servo F1","Tombatu F1","Inko F1","Lainnya",
];

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
    // "2026-01-29"
    const [y, m, d] = cleaned.split("-").map(Number);
    tanam = new Date(y, m - 1, d);

  } else if (/^\d{1,2}-[a-zA-Z]{3}-\d{4}$/.test(cleaned)) {
    // "29-Jan-2026"
    const [d, mon, y] = cleaned.split("-");
    const m = BULAN[mon.toLowerCase()];
    if (!m) return null;
    tanam = new Date(parseInt(y), m - 1, parseInt(d));

  } else if (/^\d{1,2}\s+[a-zA-Z]{3,}\s+\d{4}$/.test(cleaned)) {
    // "9 Apr 2026" atau "10 April 2026"
    const parts = cleaned.split(/\s+/);
    const d = parseInt(parts[0]);
    const mon = parts[1].slice(0, 3).toLowerCase();
    const y = parseInt(parts[2]);
    const m = BULAN[mon];
    if (!m) return null;
    tanam = new Date(y, m - 1, d);

  } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleaned)) {
    // "29/01/2026"
    const [d, m, y] = cleaned.split("/").map(Number);
    tanam = new Date(y, m - 1, d);

  } else {
    // fallback ke Date parser
    tanam = new Date(cleaned);
  }

  if (!tanam || isNaN(tanam)) return null;
  const now = new Date();
  const nowLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((nowLocal - tanam) / 86400000);
}

function stripQ(s) {
  return (s || "").trim().replace(/\r/g, "").replace(/^["']+|["']+$/g, "").trim();
}

function parseCSV(text) {
  const lines = text.trim().split("\n").filter(l => l.trim());
  const rawHeaders = lines[0].split(",").map(h => stripQ(h).toLowerCase());
  return lines.slice(1).map(line => {
    const vals = line.split(",").map(v => stripQ(v));
    const obj = {};
    rawHeaders.forEach((h, i) => { if (h) obj[h] = vals[i] ?? ""; });
    return obj;
  });
}

function buildGHData(rows) {
  // Pass 1: cari periode MAX per GH
  const latestPeriode = {};
  const latestTanam   = {};
  for (const row of rows) {
    const gh      = stripQ(row["greenhouse"]);
    const periode = stripQ(row["periode"]);
    // Kolom L = Tanam — header CSV bisa "tanam" atau "bulan tanam"
    const tanam   = stripQ(row["tanam"] || row["bulan tanam"] || "");
    if (!gh || !periode) continue;
    const pNew = parseFloat(periode);
    const pOld = parseFloat(latestPeriode[gh] ?? "-1");
    if (!isNaN(pNew) && pNew > pOld) {
      latestPeriode[gh] = periode;
      latestTanam[gh]   = tanam;
    }
  }

  // Pass 2: ambil baris hanya dari periode max
  const map = {};
  for (const row of rows) {
    const gh      = stripQ(row["greenhouse"]);
    const periode = stripQ(row["periode"]);
    // Kolom H = Baris, Kolom I = Varian
    const baris   = stripQ(row["baris"]);
    const varian  = stripQ(row["varian"] || row["true var"] || "");
    const tanam   = stripQ(row["tanam"] || row["bulan tanam"] || "");
    if (!gh || !baris || !periode) continue;
    if (periode !== latestPeriode[gh]) continue;
    if (!map[gh]) map[gh] = { periode: latestPeriode[gh], tanam: latestTanam[gh], baris: [] };
    // Hindari duplikat baris
    if (!map[gh].baris.find(b => b.baris === baris)) {
      map[gh].baris.push({ baris, varian });
    }
  }
  return map;
}

function hstChipStyle(hst) {
  if (hst === null) return { bg: "#f5f5f5", color: "#999", border: "#e0e0e0" };
  if (hst === 29 || hst === 49) return { bg: "#fff3e0", color: "#e65100", border: "#ffb74d" }; // H-1 warning
  if (hst === 30 || hst === 50) return { bg: "#fbe9e7", color: "#bf360c", border: "#ffab91" }; // deadline
  if (hst > 50) return { bg: "#fce4ec", color: "#880e4f", border: "#f48fb1" };
  return { bg: "#e8f5e9", color: "#2e7d32", border: "#a5d6a7" };
}

function isSODeadlineAlert(hst) {
  return hst === 29 || hst === 30 || hst === 49 || hst === 50;
}

// SO dilakukan di HST 29-32 (sekitar 30) dan HST 49-52 (sekitar 50)
// GH aktif untuk SO: HST < 65
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

// ─── MOCK DATA fallback ───────────────────────────────────────────────────────
const MOCK_GH_DATA = {
  "TOHUDAN 1": {
    periode: "26.1", tanam: "29-Jan-2026",
    baris: [
      { baris: "A", varian: "Greeniegal" }, { baris: "B", varian: "Sarasuka" },
      { baris: "C", varian: "Sarasuka" },   { baris: "D1", varian: "Greeniegal" },
      { baris: "D2", varian: "Sarasuka" },  { baris: "E", varian: "Greeniegal" },
      { baris: "F", varian: "Sarasuka" },   { baris: "G", varian: "Elysia" },
      { baris: "H", varian: "Elysia" },     { baris: "I", varian: "Midori" },
    ],
  },
  "BERGAS 3": {
    periode: "25.2", tanam: "11-Mar-2026",
    baris: [
      { baris: "A", varian: "Sunray" },  { baris: "B", varian: "Greeniegal" },
      { baris: "C", varian: "Midori" },  { baris: "D", varian: "Elysia" },
    ],
  },
};

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function SO() {
  const [step, setStep]               = useState(1); // 1=pilih GH (accordion), 2=form, 3=sukses
  const [ghData, setGhData]           = useState({});
  const [loadingRef, setLoadingRef]   = useState(true);
  const [isDemoMode, setIsDemoMode]   = useState(false);
  const [isOnline, setIsOnline]       = useState(navigator.onLine);

  const [openTipe, setOpenTipe] = useState(null); // accordion
  const [selectedGH, setSelectedGH]     = useState("");
  const [tableData, setTableData]       = useState([]); // [{baris, varian, populasi, isManual}]
  const [operator, setOperator]         = useState("");

  const [syncing, setSyncing]           = useState(false);
  const [syncProgress, setSyncProgress] = useState({ done: 0, total: 0 });
  const [submitError, setSubmitError]   = useState(null);
  const [savedOffline, setSavedOffline] = useState(false);

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

  const refreshPendingCount = useCallback(async () => {
    try { setPendingCount(await idbCount(DB_NAME)); } catch { setPendingCount(0); }
  }, []);

  useEffect(() => { refreshPendingCount(); }, [refreshPendingCount]);

  // ── Auto-sync saat kembali online ──
  useEffect(() => { if (isOnline) syncPendingData(); }, [isOnline]);

  // ── Fetch REF CSV ──
  useEffect(() => { fetchRefData(); }, []);

  const fetchRefData = async () => {
    setLoadingRef(true);
    setIsDemoMode(false);
    try {
      const res  = await fetch(REF_CSV_URL);
      const text = await res.text();
      const rows = parseCSV(text);
      // Debug: log header baris pertama dan sample row
      if (rows.length > 0) {
        console.log("[SO REF] Headers:", Object.keys(rows[0]));
        console.log("[SO REF] Sample row:", rows[0]);
      }
      const data = buildGHData(rows);
      console.log("[SO REF] GH loaded:", Object.keys(data).length, "GH");
      if (Object.keys(data).length === 0) throw new Error("empty");
      setGhData(data);
    } catch (err) {
      console.warn("[SO REF] Fallback to demo:", err.message);
      setIsDemoMode(true);
      setGhData(MOCK_GH_DATA);
    } finally {
      setLoadingRef(false);
    }
  };

  // ── Sync pending offline ──
  const syncPendingData = useCallback(async () => {
    const allPending = await idbGetAll(DB_NAME);
    if (allPending.length === 0) return;
    setIsSyncingPending(true);
    for (const record of allPending) {
      try {
        let allOk = true;
        for (const payload of record.payloads) {
          try {
            await fetch(SCRIPT_URL, {
              method: "POST",
              headers: { "Content-Type": "text/plain" },
              body: JSON.stringify(payload),
              redirect: "follow",
            });
          } catch { allOk = false; break; }
        }
        if (allOk) {
          markSubmitted(record.gh);
          setSubmittedToday(getSubmittedToday());
          await idbDelete(DB_NAME, record.id);
        }
      } catch { /* skip */ }
    }
    await refreshPendingCount();
    setIsSyncingPending(false);
  }, [refreshPendingCount]);

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

  // ── Reminder banner — GH H-1 dari semua tipe ──
  const reminderGH = useCallback(() => {
    const result = [];
    for (const tipe of TIPE_GH) {
      for (const gh of ghAktifPerTipe(tipe.key)) {
        if (gh.hst === 29 || gh.hst === 49) result.push(gh);
      }
    }
    return result;
  }, [ghAktifPerTipe]);

  // ── Pilih GH ──
  const handleSelectGH = (gh) => {
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

  // ── Validasi ──
  const normalRows    = tableData.filter(r => !r.isManual);
  const manualRows    = tableData.filter(r => r.isManual);
  const filledNormal  = normalRows.filter(r => r.populasi !== "").length;
  const filledManual  = manualRows.filter(r => r.baris.trim() && r.varian && r.populasi !== "").length;
  const totalRows     = tableData.length;
  const filledCount   = filledNormal + filledManual;
  const allNormalFilled = normalRows.length > 0 && filledNormal === normalRows.length;
  const manualOK      = manualRows.every(r => r.baris.trim() && r.varian && r.populasi !== "");
  const canSubmit     = allNormalFilled && manualOK && operator.trim().length > 0;

  // ── Build payloads ──
  const buildPayloads = () => {
    const ghInfo    = ghData[selectedGH];
    const hst       = ghInfo?.tanam ? hitungHST(ghInfo.tanam) : "";
    const ts        = todayTimestamp();
    return tableData
      .filter(r => r.populasi !== "")
      .map(r => ({
        action:     "submitSO",
        timestamp:  ts,
        tanggal:    todayISO,
        operator:   operator.trim(),
        greenhouse: selectedGH,
        periode:    ghInfo?.periode || "",
        hst:        hst ?? "",
        baris:      r.baris,
        varian:     r.varian,
        populasi:   parseInt(r.populasi) || 0,
      }));
  };

  // ── Submit ──
  const handleSubmit = async () => {
    setSyncing(true); setSubmitError(null);
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
      setStep(3); setSyncing(false);
      return;
    }

    // Offline
    if (!isOnline) {
      try {
        await idbAdd(DB_NAME, { gh: selectedGH, tanggal: todayISO, createdAt: Date.now(), payloads });
        await refreshPendingCount();
        markSubmitted(selectedGH);
        setSubmittedToday(getSubmittedToday());
        setSavedOffline(true); setStep(3);
      } catch { setSubmitError("Gagal menyimpan data offline. Coba lagi."); }
      finally { setSyncing(false); }
      return;
    }

    // Online
    setSavedOffline(false);
    let done = 0;
    for (const payload of payloads) {
      try {
        await fetch(SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify(payload),
          redirect: "follow",
        });
        done++;
        setSyncProgress({ done, total: payloads.length });
      } catch {
        setSubmitError(`Gagal kirim baris ${payload.baris}. Cek koneksi.`);
        setSyncing(false); return;
      }
    }
    markSubmitted(selectedGH);
    setSubmittedToday(getSubmittedToday());
    setStep(3); setSyncing(false);
  };

  const resetForm = () => {
    setStep(1); setOpenTipe(null); setSelectedGH(""); setTableData([]);
    setOperator(""); setSyncing(false); setSyncProgress({ done: 0, total: 0 });
    setSubmitError(null); setSavedOffline(false);
  };

  // ── Derived values ──
  const ghInfo     = ghData[selectedGH];
  const hstAktif   = ghInfo?.tanam ? hitungHST(ghInfo.tanam) : null;
  const chipStyle  = hstChipStyle(hstAktif);
  const reminders  = reminderGH();

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5", fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>

      {/* ── Header ── */}
      <div style={{ background: "#1b5e20", color: "#fff", padding: "14px 16px 10px", position: "sticky", top: 0, zIndex: 10, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, opacity: 0.75, letterSpacing: 1.5, textTransform: "uppercase" }}>Stock Opname Populasi</div>
            <div style={{ fontSize: 13, opacity: 0.65, marginTop: 1 }}>{todayLabel}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {pendingCount > 0 && (
              <button onClick={isOnline ? syncPendingData : undefined}
                style={{ fontSize: 10, fontWeight: 700, background: isOnline ? "rgba(33,150,243,0.3)" : "rgba(255,179,0,0.3)", border: `1px solid ${isOnline ? "rgba(33,150,243,0.6)" : "rgba(255,179,0,0.6)"}`, color: "#fff", padding: "2px 8px", borderRadius: 20, cursor: isOnline ? "pointer" : "default", display: "flex", alignItems: "center", gap: 4 }}>
                {isSyncingPending ? "⏳" : "📤"} {pendingCount} pending
              </button>
            )}
            {isDemoMode && (
              <div style={{ fontSize: 10, fontWeight: 700, background: "rgba(255,179,0,0.25)", border: "1px solid rgba(255,179,0,0.5)", borderRadius: 20, padding: "2px 8px", color: "#fff9c4" }}>DEMO</div>
            )}
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: isOnline ? "#a5d6a7" : "#ef9a9a", boxShadow: isOnline ? "0 0 6px #a5d6a7" : "0 0 6px #ef9a9a" }} />
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
              <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: s <= step ? "#a5d6a7" : "rgba(255,255,255,0.2)", transition: "background 0.3s" }} />
            ))}
          </div>
        )}
      </div>

      {/* ── Modal double submit warning ── */}
      {showDoubleWarn && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: 360, width: "100%" }}>
            <div style={{ fontSize: 36, textAlign: "center", marginBottom: 12 }}>⚠️</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#333", textAlign: "center", marginBottom: 8 }}>GH Sudah Diisi Hari Ini</div>
            <div style={{ fontSize: 13, color: "#666", textAlign: "center", marginBottom: 20, lineHeight: 1.5 }}>
              <strong>{pendingGH}</strong> sudah disubmit hari ini. Yakin mau isi ulang?
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setShowDoubleWarn(false); setPendingGH(""); }} style={{ flex: 1, padding: "11px", background: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: 10, color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Batal</button>
              <button onClick={() => doSelectGH(pendingGH)} style={{ flex: 1, padding: "11px", background: "#e53935", border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Isi Ulang</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: "16px" }}>

        {/* ══ STEP 1 — Pilih GH (Accordion) ══ */}
        {step === 1 && (
          <div>
            {reminders.length > 0 && (
              <div style={{ background: "#fff3e0", border: "1px solid #ffb74d", borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#e65100", marginBottom: 6 }}>🔔 Reminder SO — H-1 Deadline</div>
                {reminders.map(gh => (
                  <div key={gh.name} style={{ fontSize: 12, color: "#bf360c", lineHeight: 1.7 }}>
                    • <strong>{gh.name}</strong> — HST {gh.hst} (deadline SO besok)
                  </div>
                ))}
              </div>
            )}

            {isDemoMode && (
              <div style={{ background: "#fff8e1", border: "1px solid #ffe082", borderRadius: 10, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>🔌</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: "#f57f17", fontWeight: 600 }}>Data REF tidak terjangkau</div>
                  <div style={{ fontSize: 11, color: "#a67c00", marginTop: 2 }}>Menampilkan data demo</div>
                </div>
                <button onClick={fetchRefData} style={{ padding: "5px 10px", background: "#fff3e0", border: "1px solid #ffb74d", borderRadius: 7, color: "#e65100", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Coba Lagi</button>
              </div>
            )}

            <div style={{ fontWeight: 700, fontSize: 18, color: "#1b5e20", marginBottom: 4 }}>Pilih Greenhouse</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>Stock opname dilakukan sekitar HST 30 &amp; HST 50</div>

            {loadingRef ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#aaa" }}>
                <div style={{ fontSize: 28 }}>🔄</div>
                <div style={{ fontSize: 13, marginTop: 8 }}>Memuat data referensi...</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {TIPE_GH.map(tipe => {
                  const aktif       = ghAktifPerTipe(tipe.key);
                  const isOpen      = openTipe === tipe.key;
                  const hasReminder = aktif.some(g => g.hst === 29 || g.hst === 49);
                  return (
                    <div key={tipe.key} style={{ borderRadius: 14, border: `1.5px solid ${isOpen ? tipe.color : "#e0e0e0"}`, background: "#fff", overflow: "hidden", transition: "border-color 0.2s" }}>
                      <button onClick={() => setOpenTipe(isOpen ? null : tipe.key)}
                        style={{ width: "100%", padding: "14px 16px", background: isOpen ? `${tipe.color}10` : "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ textAlign: "left" }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: tipe.color }}>{tipe.label}</div>
                          <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{aktif.length} GH aktif saat ini</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {hasReminder && <div style={{ fontSize: 10, fontWeight: 700, background: "#fff3e0", border: "1px solid #ffb74d", borderRadius: 20, padding: "2px 8px", color: "#e65100" }}>H-1 ⚠</div>}
                          <span style={{ fontSize: 18, color: tipe.color, transition: "transform 0.2s", display: "inline-block", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}>›</span>
                        </div>
                      </button>

                      {isOpen && (
                        <div style={{ padding: "0 12px 14px", borderTop: `1px solid ${tipe.color}20` }}>
                          {aktif.length === 0 ? (
                            <div style={{ textAlign: "center", padding: "20px 0", color: "#aaa", fontSize: 13 }}>Tidak ada GH aktif untuk tipe ini.</div>
                          ) : (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
                              {aktif.map(gh => {
                                const chip     = hstChipStyle(gh.hst);
                                const sudahIsi = submittedToday.includes(gh.name);
                                const alert    = isSODeadlineAlert(gh.hst);
                                return (
                                  <button key={gh.name} onClick={() => handleSelectGH(gh.name)}
                                    style={{ padding: "10px 8px", borderRadius: 12, cursor: "pointer", textAlign: "center", border: sudahIsi ? "1px solid #ffb74d" : alert ? `2px solid ${chip.border}` : "1px solid #e0e0e0", background: sudahIsi ? "#fff8e1" : "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, transition: "all 0.2s" }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: "#333", lineHeight: 1.3 }}>{gh.name}</div>
                                    <div style={{ fontSize: 10, color: "#aaa" }}>P{gh.periode} · {gh.baris?.length || 0} baris</div>
                                    {gh.hst !== null && (
                                      <div style={{ background: chip.bg, border: `1px solid ${chip.border}`, borderRadius: 7, padding: "3px 10px", width: "100%" }}>
                                        <span style={{ fontSize: 15, fontWeight: 800, color: chip.color }}>{gh.hst}</span>
                                        <span style={{ fontSize: 10, color: chip.color, marginLeft: 3 }}>HST</span>
                                      </div>
                                    )}
                                    {sudahIsi && <div style={{ fontSize: 10, background: "#fff3e0", border: "1px solid #ffb74d", borderRadius: 20, padding: "2px 8px", color: "#e65100", fontWeight: 600 }}>✓ Sudah diisi</div>}
                                    {alert && !sudahIsi && <div style={{ fontSize: 10, background: "#fbe9e7", border: "1px solid #ffab91", borderRadius: 20, padding: "2px 8px", color: "#bf360c", fontWeight: 600 }}>⚠ Deadline</div>}
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
            <button onClick={() => setStep(1)} style={{ background: "none", border: "none", color: "#666", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 12, display: "flex", alignItems: "center", gap: 4 }}>← Kembali</button>

            {/* Info chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
              <div style={{ background: "#e8f5e9", border: "1px solid #a5d6a7", borderRadius: 20, padding: "3px 12px", fontSize: 12, color: "#2e7d32", fontWeight: 700 }}>{selectedGH}</div>
              <div style={{ background: "#f5f5f5", borderRadius: 20, padding: "3px 12px", fontSize: 12, color: "#666" }}>Periode {ghInfo?.periode}</div>
              {hstAktif !== null && (
                <div style={{ background: chipStyle.bg, border: `1px solid ${chipStyle.border}`, borderRadius: 20, padding: "3px 12px", fontSize: 12, color: chipStyle.color, fontWeight: 700 }}>{hstAktif} HST</div>
              )}
            </div>

            {!isOnline && (
              <div style={{ marginBottom: 12, padding: "8px 12px", background: "#fff3e0", border: "1px solid #ffb74d", borderRadius: 9, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14 }}>📵</span>
                <span style={{ fontSize: 11, color: "#e65100" }}>Offline — data disimpan lokal & dikirim otomatis saat online</span>
              </div>
            )}

            <div style={{ fontWeight: 700, fontSize: 17, color: "#1b5e20", marginBottom: 2 }}>Input Populasi</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>{filledCount}/{totalRows} baris terisi</div>

            {/* Progress bar */}
            <div style={{ background: "#e0e0e0", borderRadius: 4, height: 5, marginBottom: 14, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 4, background: "#4CAF50", width: `${totalRows > 0 ? (filledCount / totalRows) * 100 : 0}%`, transition: "width 0.3s" }} />
            </div>

            {/* Tabel */}
            <div style={{ overflowX: "auto", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.08)", marginBottom: 16 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#1b5e20", color: "#fff" }}>
                    <th style={{ padding: "9px 10px", textAlign: "left", fontWeight: 700, fontSize: 11 }}>Baris</th>
                    <th style={{ padding: "9px 6px", textAlign: "left", fontWeight: 700, fontSize: 11 }}>Varian</th>
                    <th style={{ padding: "9px 10px", textAlign: "center", fontWeight: 700, fontSize: 11 }}>Populasi</th>
                    <th style={{ padding: "9px 6px", width: 32 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {tableData.map((row, i) => {
                    const filled = row.populasi !== "";
                    const isManual = row.isManual;
                    return (
                      <tr key={i} style={{ background: isManual ? "#f3e5f5" : filled ? "#f1f8e9" : i % 2 === 0 ? "#fff" : "#fafafa", transition: "background 0.2s" }}>
                        <td style={{ padding: "6px 10px", fontWeight: 700, color: isManual ? "#6A1B9A" : "#1b5e20", whiteSpace: "nowrap" }}>
                          {isManual ? (
                            <input type="text" value={row.baris} onChange={e => updateManualField(i, "baris", e.target.value)}
                              placeholder="A" style={{ width: 44, textAlign: "center", border: "1.5px solid #ce93d8", borderRadius: 6, padding: "4px 6px", fontSize: 12, fontWeight: 700, color: "#6A1B9A", outline: "none", background: "#fff" }} />
                          ) : row.baris}
                        </td>
                        <td style={{ padding: "6px 6px", fontSize: 11, color: isManual ? "#6A1B9A" : "#666", whiteSpace: "nowrap" }}>
                          {isManual ? (
                            <select value={row.varian} onChange={e => updateManualField(i, "varian", e.target.value)}
                              style={{ border: "1.5px solid #ce93d8", borderRadius: 6, padding: "4px 6px", fontSize: 11, color: "#6A1B9A", outline: "none", background: "#fff", maxWidth: 110 }}>
                              <option value="">Pilih varian</option>
                              {VARIAN_LIST.map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                          ) : row.varian}
                        </td>
                        <td style={{ padding: "4px 6px", textAlign: "center" }}>
                          <input type="number" inputMode="numeric" value={row.populasi}
                            onChange={e => updatePopulasi(i, e.target.value)}
                            placeholder="—"
                            style={{ width: 70, height: 32, textAlign: "center", border: `1.5px solid ${filled ? (isManual ? "#ce93d8" : "#81c784") : "#e0e0e0"}`, borderRadius: 7, fontSize: 13, fontWeight: 600, color: filled ? (isManual ? "#6A1B9A" : "#2e7d32") : "#bbb", outline: "none", background: "#fff" }} />
                        </td>
                        <td style={{ padding: "4px 6px", textAlign: "center" }}>
                          {isManual && (
                            <button onClick={() => removeManualRow(i)} style={{ background: "none", border: "none", color: "#e53935", fontSize: 16, cursor: "pointer", padding: "2px 4px", lineHeight: 1 }}>×</button>
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
              style={{ width: "100%", padding: "10px", background: "#f3e5f5", border: "1.5px dashed #ce93d8", borderRadius: 10, color: "#6A1B9A", fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 16 }}>
              + Tambah baris / varian tidak terdaftar
            </button>

            {/* Ringkasan & Copy to Clipboard */}
            {filledCount > 0 && (() => {
              // Hitung total per varian
              const totalPerVarian = {};
              let totalAll = 0;
              tableData.forEach(r => {
                if (r.populasi === "") return;
                const pop = parseInt(r.populasi) || 0;
                const v   = r.varian || "Tidak diketahui";
                totalPerVarian[v] = (totalPerVarian[v] || 0) + pop;
                totalAll += pop;
              });

              // Group per huruf baris — K1, K2, K3 → K (strip angka di akhir)
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

              // Build teks baris — "K Elysia 130 Greeniegal 48 Sunray 4"
              const lines = barisOrder.map(baris => {
                const parts = Object.entries(barisGroup[baris]).map(([v, p]) => `${v} ${p}`).join(" ");
                return `${baris} ${parts}`;
              });

              // Tambah total per varian
              const totalLines = Object.entries(totalPerVarian)
                .sort((a, b) => b[1] - a[1])
                .map(([v, t]) => `${v}: ${t.toLocaleString("id-ID")} tanaman`);

              const clipboardText = [
                `SO ${selectedGH} - ${todayISO}`,
                `Periode ${ghData[selectedGH]?.periode || ""} | ${ghAktifPerTipe ? (hitungHST(ghData[selectedGH]?.tanam) ?? "") : ""} HST`,
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
                      style={{ padding: "5px 12px", background: "#558b2f", border: "none", borderRadius: 8, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      📋 Copy
                    </button>
                  </div>

                  {/* Per baris */}
                  <div style={{ fontFamily: "monospace", fontSize: 12, color: "#333", marginBottom: 10, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
                    {lines.join("\n")}
                  </div>

                  {/* Total per varian */}
                  <div style={{ borderTop: "1px solid #dce775", paddingTop: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#558b2f", marginBottom: 6 }}>Total per varian</div>
                    {Object.entries(totalPerVarian).sort((a,b) => b[1]-a[1]).map(([v, t]) => (
                      <div key={v} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "2px 0" }}>
                        <span style={{ color: "#555" }}>{v}</span>
                        <span style={{ fontWeight: 700, color: "#1b5e20", fontFamily: "monospace" }}>{t.toLocaleString("id-ID")}</span>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, borderTop: "1px solid #dce775", marginTop: 6, paddingTop: 6 }}>
                      <span>Total keseluruhan</span>
                      <span style={{ color: "#1b5e20", fontFamily: "monospace" }}>{totalAll.toLocaleString("id-ID")}</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Input operator */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: "#388e3c", letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 700 }}>
                👤 Nama Operator <span style={{ color: "#e53935" }}>*</span>
              </label>
              <input type="text" value={operator} onChange={e => setOperator(e.target.value)}
                placeholder="Tulis nama lengkap..."
                style={{ width: "100%", marginTop: 8, padding: "11px 14px", background: "#fff", border: `1.5px solid ${operator.trim() ? "#81c784" : "#e0e0e0"}`, borderRadius: 10, color: "#333", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
            </div>

            {!allNormalFilled && normalRows.length > 0 && (
              <div style={{ fontSize: 12, color: "#e65100", background: "#fff3e0", border: "1px solid #ffb74d", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>
                ⚠️ {normalRows.length - filledNormal} baris referensi belum diisi
              </div>
            )}
            {submitError && (
              <div style={{ fontSize: 12, color: "#c62828", background: "#ffebee", border: "1px solid #ef9a9a", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>
                ⚠️ {submitError}
              </div>
            )}
            {syncing && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>Menyimpan {syncProgress.done}/{syncProgress.total} baris...</div>
                <div style={{ background: "#e0e0e0", borderRadius: 4, height: 6, overflow: "hidden" }}>
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
            <div style={{ fontSize: 21, fontWeight: 800, color: isDemoMode ? "#f57f17" : savedOffline ? "#1565C0" : "#2e7d32", marginBottom: 6 }}>
              {isDemoMode ? "Demo Selesai!" : savedOffline ? "Tersimpan Lokal!" : "Data SO Tersimpan!"}
            </div>
            <div style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>
              {isDemoMode
                ? "Data tidak dikirim (mode demo)"
                : savedOffline
                  ? "Data disimpan di perangkat. Otomatis terkirim ke Google Sheets saat online."
                  : `${buildPayloads().length} baris berhasil dikirim ke Google Sheets`}
            </div>

            {savedOffline && (
              <div style={{ background: "#e3f2fd", border: "1px solid #90CAF9", borderRadius: 10, padding: "10px 14px", marginBottom: 16, textAlign: "left" }}>
                <div style={{ fontSize: 12, color: "#1565C0", fontWeight: 600, marginBottom: 4 }}>📡 Cara sync:</div>
                <div style={{ fontSize: 12, color: "#555" }}>Biarkan app terbuka saat koneksi kembali — data terkirim otomatis.</div>
              </div>
            )}

            <div style={{ background: isDemoMode ? "#fff8e1" : savedOffline ? "#e3f2fd" : "#e8f5e9", border: `1px solid ${isDemoMode ? "#ffe082" : savedOffline ? "#90CAF9" : "#a5d6a7"}`, borderRadius: 14, padding: 16, textAlign: "left", marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: isDemoMode ? "#f57f17" : savedOffline ? "#1565C0" : "#2e7d32", fontWeight: 700, marginBottom: 10 }}>Ringkasan SO</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#333" }}>{selectedGH} · Periode {ghInfo?.periode} · {hstAktif} HST</div>
              <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>Operator: {operator}</div>
              <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>Tanggal: {todayISO}</div>
              <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>Total baris: {tableData.filter(r => r.populasi !== "").length} baris</div>
              <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>
                Total populasi: {tableData.reduce((sum, r) => sum + (parseInt(r.populasi) || 0), 0).toLocaleString("id-ID")} tanaman
              </div>
            </div>

            <button onClick={resetForm} style={{ width: "100%", padding: "15px", background: isDemoMode ? "#fff8e1" : savedOffline ? "#e3f2fd" : "#e8f5e9", border: `2px solid ${isDemoMode ? "#ffb74d" : savedOffline ? "#90CAF9" : "#81c784"}`, borderRadius: 12, color: isDemoMode ? "#e65100" : savedOffline ? "#1565C0" : "#2e7d32", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              + Input GH Berikutnya
            </button>
          </div>
        )}
      </div>

      {/* ── Bottom Nav ── */}
      {step === 2 && (
        <div style={{ padding: "12px 16px 24px", borderTop: "1px solid #e0e0e0", background: "#fff", position: "sticky", bottom: 0, display: "flex", gap: 10 }}>
          <button onClick={() => { setStep(1); setSubmitError(null); }} style={{ flex: 1, padding: "13px", background: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: 12, color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>← Kembali</button>
          <button onClick={handleSubmit} disabled={!canSubmit || syncing}
            style={{ flex: 2, padding: "13px", border: "none", borderRadius: 12, background: canSubmit && !syncing ? (!isOnline ? "linear-gradient(135deg,#1565C0,#1976D2)" : "linear-gradient(135deg,#1b5e20,#2e7d32)") : "#e0e0e0", color: canSubmit && !syncing ? "#fff" : "#aaa", fontSize: 15, fontWeight: 700, cursor: canSubmit && !syncing ? "pointer" : "not-allowed", transition: "all 0.2s" }}>
            {syncing
              ? `⏳ ${syncProgress.done}/${syncProgress.total}...`
              : !isOnline && canSubmit
                ? `💾 Simpan Offline (${tableData.filter(r => r.populasi !== "").length} baris)`
                : `Submit ${tableData.filter(r => r.populasi !== "").length} Baris ✓`}
          </button>
        </div>
      )}

      <style>{`
        input[type=number]::-webkit-outer-spin-button,
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
      `}</style>
    </div>
  );
}
