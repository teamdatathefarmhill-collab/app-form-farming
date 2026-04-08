import { useState, useEffect, useCallback } from "react";
import { idbAdd, idbGetAll, idbDelete, idbCount, gasFetch } from "../utils/idb";

const DB_NAME    = "VigorOfflineDB";
const SCRIPT_URL = import.meta.env.VITE_GAS_VIGOR_URL;

const HST_CHECKPOINTS = [7, 14, 21, 33, 38, 45, 54];
const HST_MIN = 5;
const HST_MAX = 60;

// ─── Data GH mock (fallback demo) ────────────────────────────────────────────
const buatBaris = (jumlah) => {
  const abjad = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return Array.from({ length: jumlah }, (_, i) => ({
    baris: i < 26 ? abjad[i] : abjad[Math.floor(i / 26) - 1] + abjad[i % 26],
    varian: "Aruni",
  }));
};

const MOCK_GH_DATA = {
  "TOHUDAN 2":  { periode: "26.1", tanam: "2026-02-09", baris: buatBaris(21) },
  "COLOMADU 1": { periode: "26.1", tanam: "2026-02-09", baris: buatBaris(18) },
  "BERGAS 1":   { periode: "26.1", tanam: "2026-02-15", baris: buatBaris(18) },
  "SAWAHAN 1":  { periode: "26.1", tanam: "2026-01-20", baris: buatBaris(42) },
};

// ─── Aspek penilaian ──────────────────────────────────────────────────────────
const ASPEK_TANAMAN = [
  { key: "tinggi",   label: "Tinggi tanaman", satuan: "cm",  tipe: "numerik",  placeholder: "cth: 45" },
  { key: "daun",     label: "Jumlah daun",    satuan: "lbr", tipe: "numerik",  placeholder: "cth: 12" },
  { key: "tunas",    label: "Tunas air",       satuan: "bh",  tipe: "numerik",  placeholder: "cth: 2" },
  { key: "warnaDaun",label: "Warna daun",     satuan: "",    tipe: "skor",     placeholder: "" },
  { key: "batang",   label: "Kondisi batang",  satuan: "",    tipe: "skor",     placeholder: "" },
  { key: "akar",     label: "Kondisi akar",    satuan: "",    tipe: "skor",     placeholder: "" },
  { key: "vigor",    label: "Skor vigor",      satuan: "",    tipe: "skor",     placeholder: "" },
];

const ASPEK_BUAH = [
  { key: "diameterBuah", label: "Diameter buah",    satuan: "cm", tipe: "numerik", placeholder: "cth: 8.5" },
  { key: "bobotBuah",    label: "Bobot estimasi",   satuan: "g",  tipe: "numerik", placeholder: "cth: 350" },
  { key: "jumlahBuah",   label: "Jumlah buah",      satuan: "bh", tipe: "numerik", placeholder: "cth: 1" },
  { key: "warnaBuah",    label: "Warna kulit",       satuan: "",   tipe: "skor",    placeholder: "" },
  { key: "jaring",       label: "Kondisi jaring",    satuan: "",   tipe: "skor",    placeholder: "" },
  { key: "kualitasBuah", label: "Skor kualitas buah",satuan: "",   tipe: "skor",    placeholder: "" },
];

const SKOR_DESC = {
  1: { label: "Buruk",       warna: "#c62828", bg: "#ffebee", border: "#ef9a9a" },
  2: { label: "Cukup",       warna: "#e65100", bg: "#fff3e0", border: "#ffb74d" },
  3: { label: "Baik",        warna: "#1565C0", bg: "#e3f2fd", border: "#90CAF9" },
  4: { label: "Sangat Baik", warna: "#2e7d32", bg: "#e8f5e9", border: "#a5d6a7" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function hitungHST(tgl) {
  const [y, m, d] = tgl.split("-").map(Number);
  const tanam = new Date(y, m - 1, d);
  const now   = new Date();
  return Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - tanam) / 86400000);
}

function hstTerdekat(hst) {
  return HST_CHECKPOINTS.reduce((prev, curr) =>
    Math.abs(curr - hst) < Math.abs(prev - hst) ? curr : prev
  );
}

function hstColor(hst) {
  if (hst <= 21) return { bg: "#e8f5e9", border: "#a5d6a7", text: "#2e7d32", badge: "#c8e6c9" };
  if (hst <= 40) return { bg: "#fff8e1", border: "#ffe082", text: "#f57f17", badge: "#fff9c4" };
  return              { bg: "#fbe9e7", border: "#ffab91", text: "#bf360c", badge: "#fce4ec" };
}

function initRowData(baris) {
  const tanaman = Object.fromEntries(ASPEK_TANAMAN.map(a => [a.key, ""]));
  const buah    = Object.fromEntries(ASPEK_BUAH.map(a => [a.key, ""]));
  return baris.map(b => ({ ...b, tanaman: { ...tanaman }, buah: { ...buah } }));
}

const LS_KEY = `vigor_${new Date().toLocaleDateString("id-ID")}`;
function getSubmittedToday() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
}
function markSubmitted(gh) {
  const list = getSubmittedToday();
  if (!list.includes(gh)) localStorage.setItem(LS_KEY, JSON.stringify([...list, gh]));
}

const todayISO   = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
const todayLabel = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

// ─── Komponen Skor Button ─────────────────────────────────────────────────────
function SkorBtn({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {[1, 2, 3, 4].map(n => {
        const s = SKOR_DESC[n];
        const active = value === String(n);
        return (
          <button key={n} onClick={() => onChange(String(n))}
            style={{
              flex: 1, padding: "6px 2px", border: `1.5px solid ${active ? s.border : "#e0e0e0"}`,
              borderRadius: 8, background: active ? s.bg : "#fff",
              color: active ? s.warna : "#bbb", fontSize: 13, fontWeight: 700,
              cursor: "pointer", transition: "all .15s", lineHeight: 1,
            }}>
            {n}
            <div style={{ fontSize: 8, marginTop: 2, fontWeight: 400, color: active ? s.warna : "#ccc" }}>
              {s.label}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Komponen Input Numerik ───────────────────────────────────────────────────
function NumInput({ value, onChange, placeholder, satuan }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input
        type="number" inputMode="decimal" value={value}
        onChange={e => { if (e.target.value === "" || /^\d*\.?\d*$/.test(e.target.value)) onChange(e.target.value); }}
        placeholder={placeholder}
        style={{
          flex: 1, height: 36, padding: "0 10px", textAlign: "center",
          border: `1.5px solid ${value !== "" ? "#81c784" : "#e0e0e0"}`,
          borderRadius: 8, fontSize: 14, fontWeight: 600,
          color: value !== "" ? "#2e7d32" : "#bbb", outline: "none", background: "#fff",
        }}
      />
      {satuan && <span style={{ fontSize: 11, color: "#aaa", flexShrink: 0 }}>{satuan}</span>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Vigor() {
  const [step, setStep]           = useState(1);
  const [ghData, setGhData]       = useState({});
  const [loadingGH, setLoadingGH] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isOnline, setIsOnline]   = useState(navigator.onLine);

  const [selectedGH, setSelectedGH]   = useState("");
  const [selectedHST, setSelectedHST] = useState(null);
  const [tableData, setTableData]     = useState([]);
  const [operator, setOperator]       = useState("");
  const [isiPerformabuah, setIsiPerformaBuah] = useState(false);
  const [activeRow, setActiveRow]     = useState(null);

  const [submitting, setSubmitting]   = useState(false);
  const [submitProgress, setSubmitProgress] = useState({ done: 0, total: 0 });
  const [submitError, setSubmitError] = useState(null);
  const [savedOffline, setSavedOffline] = useState(false);

  const [submittedToday, setSubmittedToday] = useState(getSubmittedToday);
  const [showWarning, setShowWarning] = useState(false);
  const [pendingGH, setPendingGH]     = useState("");
  const [pendingCount, setPendingCount]     = useState(0);
  const [isSyncingPending, setIsSyncingPending] = useState(false);

  const refreshPendingCount = useCallback(async () => {
    try { setPendingCount(await idbCount(DB_NAME)); } catch { setPendingCount(0); }
  }, []);

  useEffect(() => { refreshPendingCount(); }, [refreshPendingCount]);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => { if (isOnline) syncPending(); }, [isOnline]);
  useEffect(() => { fetchGHData(); }, []);

  const fetchGHData = async () => {
    setLoadingGH(true);
    setIsDemoMode(false);
    try {
      const json = await gasFetch(`${SCRIPT_URL}?action=getGH`);
      if (json.success) setGhData(json.data);
      else throw new Error();
    } catch {
      setIsDemoMode(true);
      setGhData(MOCK_GH_DATA);
    } finally {
      setLoadingGH(false);
    }
  };

  const syncPending = useCallback(async () => {
    const all = await idbGetAll(DB_NAME);
    if (!all.length) return;
    setIsSyncingPending(true);
    for (const record of all) {
      try {
        let ok = true;
        for (const payload of record.payloads) {
          const res  = await fetch(SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(payload), redirect: "follow" });
          const json = await res.json();
          if (!json.success) { ok = false; break; }
        }
        if (ok) { markSubmitted(record.gh); setSubmittedToday(getSubmittedToday()); await idbDelete(DB_NAME, record.id); }
      } catch { /* retry later */ }
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
    if (submittedToday.includes(gh)) { setPendingGH(gh); setShowWarning(true); }
    else doSelectGH(gh);
  };

  const doSelectGH = (gh) => {
    const info = ghData[gh];
    const hst  = info?.tanam ? hitungHST(info.tanam) : null;
    const snap = hst !== null ? hstTerdekat(hst) : HST_CHECKPOINTS[0];
    setSelectedGH(gh);
    setSelectedHST(snap);
    setTableData(initRowData(info?.baris || []));
    setActiveRow(null);
    setShowWarning(false);
    setPendingGH("");
  };

  // Update nilai sel tanaman atau buah
  const updateTanaman = (rowIdx, key, val) => {
    setTableData(prev => {
      const d = [...prev];
      d[rowIdx] = { ...d[rowIdx], tanaman: { ...d[rowIdx].tanaman, [key]: val } };
      return d;
    });
  };

  const updateBuah = (rowIdx, key, val) => {
    setTableData(prev => {
      const d = [...prev];
      d[rowIdx] = { ...d[rowIdx], buah: { ...d[rowIdx].buah, [key]: val } };
      return d;
    });
  };

  // Cek baris terisi
  const isRowTanamanFilled = (row) =>
    ASPEK_TANAMAN.every(a => row.tanaman[a.key] !== "");

  const isRowBuahFilled = (row) =>
    !isiPerformabuah || ASPEK_BUAH.every(a => row.buah[a.key] !== "");

  const filledCount = tableData.filter(r => isRowTanamanFilled(r) && isRowBuahFilled(r)).length;
  const allFilled   = tableData.length > 0 && filledCount === tableData.length;
  const canSubmit   = allFilled && operator.trim().length > 0;

  const ghInfo = ghData[selectedGH];
  const hstAktual = ghInfo?.tanam ? hitungHST(ghInfo.tanam) : null;
  const col = hstAktual !== null ? hstColor(hstAktual) : hstColor(21);

  // Build payloads per baris
  const buildPayloads = () =>
    tableData.map(row => ({
      action: "submitVigor",
      tanggal: todayISO,
      gh: selectedGH,
      periode: ghInfo?.periode || "",
      hst_aktual: hstAktual ?? "",
      hst_checkpoint: selectedHST,
      baris: row.baris,
      varian: row.varian,
      operator,
      // Tanaman
      tinggi:    row.tanaman.tinggi    || 0,
      daun:      row.tanaman.daun      || 0,
      tunas:     row.tanaman.tunas     || 0,
      warnaDaun: row.tanaman.warnaDaun || 0,
      batang:    row.tanaman.batang    || 0,
      akar:      row.tanaman.akar      || 0,
      vigor:     row.tanaman.vigor     || 0,
      // Buah
      isiBuah:      isiPerformabuah ? "YA" : "TIDAK",
      diameterBuah: isiPerformabuah ? (row.buah.diameterBuah || 0) : "",
      bobotBuah:    isiPerformabuah ? (row.buah.bobotBuah    || 0) : "",
      jumlahBuah:   isiPerformabuah ? (row.buah.jumlahBuah   || 0) : "",
      warnaBuah:    isiPerformabuah ? (row.buah.warnaBuah    || 0) : "",
      jaring:       isiPerformabuah ? (row.buah.jaring       || 0) : "",
      kualitasBuah: isiPerformabuah ? (row.buah.kualitasBuah || 0) : "",
    }));

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    const payloads = buildPayloads();
    setSyncProgress({ done: 0, total: payloads.length });

    // Demo mode
    if (isDemoMode) {
      for (let i = 0; i < payloads.length; i++) {
        await new Promise(r => setTimeout(r, 40));
        setSubmitProgress({ done: i + 1, total: payloads.length });
      }
      markSubmitted(selectedGH); setSubmittedToday(getSubmittedToday());
      setStep(3); setSubmitting(false);
      return;
    }

    // Offline
    if (!isOnline) {
      try {
        await idbAdd(DB_NAME, { gh: selectedGH, tanggal: todayISO, createdAt: Date.now(), payloads });
        await refreshPendingCount();
        markSubmitted(selectedGH); setSubmittedToday(getSubmittedToday());
        setSavedOffline(true); setStep(3);
      } catch { setSubmitError("Gagal menyimpan offline. Coba lagi."); }
      finally { setSubmitting(false); }
      return;
    }

    // Online — kirim per baris
    setSavedOffline(false);
    let done = 0;
    for (const payload of payloads) {
      try {
        await fetch(SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(payload), redirect: "follow" });
        done++;
        setSubmitProgress({ done, total: payloads.length });
      } catch {
        setSubmitError(`Gagal kirim baris ${payload.baris}. Periksa koneksi.`);
        setSubmitting(false);
        return;
      }
    }
    markSubmitted(selectedGH); setSubmittedToday(getSubmittedToday());
    setStep(3); setSubmitting(false);
  };

  const resetForm = () => {
    setStep(1); setSelectedGH(""); setSelectedHST(null); setTableData([]);
    setOperator(""); setIsiPerformaBuah(false); setActiveRow(null);
    setSubmitting(false); setSubmitProgress({ done: 0, total: 0 });
    setSubmitError(null); setSavedOffline(false);
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5", fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>

      {/* Header */}
      <div style={{ background: "#1b5e20", color: "#fff", padding: "14px 16px 10px", position: "sticky", top: 0, zIndex: 10, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, opacity: 0.75, letterSpacing: 1.5, textTransform: "uppercase" }}>Form Vigor Harian</div>
            <div style={{ fontSize: 13, opacity: 0.65, marginTop: 1 }}>{todayLabel}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {pendingCount > 0 && (
              <button onClick={isOnline ? syncPending : undefined}
                style={{ fontSize: 10, fontWeight: 700, background: isOnline ? "rgba(33,150,243,0.3)" : "rgba(255,179,0,0.3)", border: `1px solid ${isOnline ? "rgba(33,150,243,0.6)" : "rgba(255,179,0,0.6)"}`, color: "#fff", padding: "2px 8px", borderRadius: 20, cursor: isOnline ? "pointer" : "default", display: "flex", alignItems: "center", gap: 4 }}>
                {isSyncingPending ? "⏳" : "📤"} {pendingCount} pending
              </button>
            )}
            {isDemoMode && (
              <div style={{ fontSize: 10, fontWeight: 700, background: "rgba(255,179,0,0.25)", border: "1px solid rgba(255,179,0,0.5)", borderRadius: 20, padding: "2px 8px", color: "#fff9c4" }}>DEMO</div>
            )}
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: isOnline ? "#a5d6a7" : "#ef9a9a" }} />
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
              <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: s <= step ? "#a5d6a7" : "rgba(255,255,255,0.2)", transition: "background 0.3s" }} />
            ))}
          </div>
        )}
      </div>

      {/* Modal double submit */}
      {showWarning && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
            <div style={{ fontSize: 36, textAlign: "center", marginBottom: 12 }}>⚠️</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#333", textAlign: "center", marginBottom: 8 }}>GH Sudah Diisi Hari Ini</div>
            <div style={{ fontSize: 13, color: "#666", textAlign: "center", marginBottom: 20, lineHeight: 1.5 }}>
              <strong>{pendingGH}</strong> sudah disubmit hari ini. Data baru akan ditambahkan ke Sheets.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setShowWarning(false); setPendingGH(""); }} style={{ flex: 1, padding: 11, background: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: 10, color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Batal</button>
              <button onClick={() => doSelectGH(pendingGH)} style={{ flex: 1, padding: 11, background: "#e53935", border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Isi Ulang</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: 16 }}>

        {/* ══ STEP 1 — Pilih GH ══ */}
        {step === 1 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: "#1b5e20", marginBottom: 4 }}>Pilih Greenhouse</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 14 }}>GH aktif HST {HST_MIN}–{HST_MAX}</div>

            {isDemoMode && (
              <div style={{ background: "#fff8e1", border: "1px solid #ffe082", borderRadius: 10, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>🔌</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: "#f57f17", fontWeight: 600 }}>Server tidak terjangkau</div>
                  <div style={{ fontSize: 11, color: "#a67c00", marginTop: 2 }}>Menampilkan data demo</div>
                </div>
                <button onClick={fetchGHData} style={{ padding: "5px 10px", background: "#fff3e0", border: "1px solid #ffb74d", borderRadius: 7, color: "#e65100", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Coba Lagi</button>
              </div>
            )}

            {loadingGH ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#aaa" }}>
                <div style={{ fontSize: 28 }}>🔄</div>
                <div style={{ fontSize: 13, marginTop: 8 }}>Memuat data GH...</div>
              </div>
            ) : ghAktif.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0", color: "#aaa", fontSize: 13 }}>Tidak ada GH aktif</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {ghAktif.map(([gh, info]) => {
                  const hstGH    = info.tanam ? hitungHST(info.tanam) : null;
                  const c        = hstGH !== null ? hstColor(hstGH) : hstColor(21);
                  const dipilih  = selectedGH === gh;
                  const sudahIsi = submittedToday.includes(gh);
                  return (
                    <button key={gh} onClick={() => handleSelectGH(gh)}
                      style={{ padding: "12px 10px", borderRadius: 14, cursor: "pointer", textAlign: "center", border: dipilih ? "2px solid #1b5e20" : sudahIsi ? "1px solid #ffb74d" : "1px solid #e0e0e0", background: dipilih ? "#e8f5e9" : sudahIsi ? "#fff8e1" : "#fff", display: "flex", flexDirection: "column", alignItems: "center", gap: 7, transition: "all 0.2s" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: dipilih ? "#1b5e20" : "#333" }}>{gh}</div>
                      <div style={{ fontSize: 10, color: "#aaa" }}>P{info.periode} · {info.baris?.length || 0} baris</div>
                      {hstGH !== null && (
                        <div style={{ background: c.badge, border: `1px solid ${c.border}`, borderRadius: 8, padding: "4px 12px", width: "100%" }}>
                          <span style={{ fontSize: 17, fontWeight: 800, color: c.text }}>{hstGH}</span>
                          <span style={{ fontSize: 10, color: c.text, marginLeft: 3 }}>HST</span>
                        </div>
                      )}
                      {sudahIsi && <div style={{ fontSize: 10, background: "#fff3e0", border: "1px solid #ffb74d", borderRadius: 20, padding: "2px 10px", color: "#e65100", fontWeight: 600 }}>✓ Sudah diisi hari ini</div>}
                      {dipilih && !sudahIsi && <div style={{ fontSize: 13 }}>✅</div>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ STEP 2 — Input Per Baris ══ */}
        {step === 2 && (
          <div>
            {/* Info GH */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              <div style={{ background: "#e8f5e9", border: "1px solid #a5d6a7", borderRadius: 20, padding: "3px 12px", fontSize: 12, color: "#2e7d32", fontWeight: 700 }}>{selectedGH}</div>
              <div style={{ background: "#f5f5f5", borderRadius: 20, padding: "3px 12px", fontSize: 12, color: "#666" }}>P{ghInfo?.periode}</div>
              {hstAktual !== null && (
                <div style={{ background: col.badge, border: `1px solid ${col.border}`, borderRadius: 20, padding: "3px 12px", fontSize: 12, color: col.text, fontWeight: 700 }}>{hstAktual} HST aktual</div>
              )}
            </div>

            {/* HST Checkpoint */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: "#388e3c", letterSpacing: 1.1, textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>Checkpoint HST</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {HST_CHECKPOINTS.map(h => (
                  <button key={h} onClick={() => setSelectedHST(h)}
                    style={{ padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${selectedHST === h ? "#1b5e20" : "#e0e0e0"}`, background: selectedHST === h ? "#e8f5e9" : "#fff", color: selectedHST === h ? "#1b5e20" : "#888", fontSize: 13, fontWeight: selectedHST === h ? 700 : 400, cursor: "pointer" }}>
                    HST {h}
                  </button>
                ))}
              </div>
            </div>

            {/* Toggle Buah */}
            <div style={{ background: isiPerformabuah ? "#e8f5e9" : "#fff", border: `1.5px solid ${isiPerformabuah ? "#a5d6a7" : "#e0e0e0"}`, borderRadius: 12, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#333" }}>Isi performa buah?</div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>Aktifkan jika buah sudah terbentuk</div>
              </div>
              <button onClick={() => setIsiPerformaBuah(v => !v)}
                style={{ width: 44, height: 24, borderRadius: 12, border: "none", background: isiPerformabuah ? "#2e7d32" : "#e0e0e0", position: "relative", cursor: "pointer", transition: "background 0.2s" }}>
                <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: isiPerformabuah ? 23 : 3, transition: "left 0.2s" }} />
              </button>
            </div>

            {/* Progress */}
            <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>{filledCount}/{tableData.length} baris terisi</div>
            <div style={{ background: "#e0e0e0", borderRadius: 4, height: 5, marginBottom: 14, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 4, background: "#4CAF50", width: `${tableData.length > 0 ? (filledCount / tableData.length) * 100 : 0}%`, transition: "width 0.3s" }} />
            </div>

            {!isOnline && (
              <div style={{ marginBottom: 12, padding: "8px 12px", background: "#fff3e0", border: "1px solid #ffb74d", borderRadius: 9, display: "flex", alignItems: "center", gap: 8 }}>
                <span>📵</span>
                <span style={{ fontSize: 11, color: "#e65100" }}>Offline — data tersimpan lokal & dikirim otomatis saat online</span>
              </div>
            )}

            {/* List baris — accordion per baris */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {tableData.map((row, i) => {
                const tFilled = isRowTanamanFilled(row);
                const bFilled = isRowBuahFilled(row);
                const rowOk   = tFilled && bFilled;
                const isOpen  = activeRow === i;

                return (
                  <div key={i} style={{ background: "#fff", borderRadius: 12, border: `1.5px solid ${rowOk ? "#a5d6a7" : "#e0e0e0"}`, overflow: "hidden" }}>
                    {/* Header baris */}
                    <button onClick={() => setActiveRow(isOpen ? null : i)}
                      style={{ width: "100%", padding: "11px 14px", background: rowOk ? "#f1f8e9" : "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: rowOk ? "#2e7d32" : "#333" }}>Baris {row.baris}</span>
                        <span style={{ fontSize: 11, color: "#aaa" }}>{row.varian}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {rowOk && <span style={{ fontSize: 14 }}>✅</span>}
                        {!tFilled && <span style={{ fontSize: 10, background: "#fff3e0", border: "1px solid #ffb74d", borderRadius: 20, padding: "2px 8px", color: "#e65100" }}>Belum lengkap</span>}
                        <span style={{ fontSize: 12, color: "#bbb", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
                      </div>
                    </button>

                    {/* Body baris */}
                    {isOpen && (
                      <div style={{ padding: "12px 14px", borderTop: "1px solid #f0f0f0" }}>
                        {/* Performa Tanaman */}
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#388e3c", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>🌿 Performa Tanaman</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                          {ASPEK_TANAMAN.map(aspek => (
                            <div key={aspek.key}>
                              <div style={{ fontSize: 12, color: "#555", marginBottom: 5, fontWeight: 500 }}>
                                {aspek.label} {aspek.satuan && <span style={{ color: "#aaa" }}>({aspek.satuan})</span>}
                              </div>
                              {aspek.tipe === "numerik" ? (
                                <NumInput
                                  value={row.tanaman[aspek.key]}
                                  onChange={val => updateTanaman(i, aspek.key, val)}
                                  placeholder={aspek.placeholder}
                                  satuan={aspek.satuan}
                                />
                              ) : (
                                <SkorBtn
                                  value={row.tanaman[aspek.key]}
                                  onChange={val => updateTanaman(i, aspek.key, val)}
                                />
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Performa Buah */}
                        {isiPerformabuah && (
                          <>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#e65100", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>🍈 Performa Buah</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                              {ASPEK_BUAH.map(aspek => (
                                <div key={aspek.key}>
                                  <div style={{ fontSize: 12, color: "#555", marginBottom: 5, fontWeight: 500 }}>
                                    {aspek.label} {aspek.satuan && <span style={{ color: "#aaa" }}>({aspek.satuan})</span>}
                                  </div>
                                  {aspek.tipe === "numerik" ? (
                                    <NumInput
                                      value={row.buah[aspek.key]}
                                      onChange={val => updateBuah(i, aspek.key, val)}
                                      placeholder={aspek.placeholder}
                                      satuan={aspek.satuan}
                                    />
                                  ) : (
                                    <SkorBtn
                                      value={row.buah[aspek.key]}
                                      onChange={val => updateBuah(i, aspek.key, val)}
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Operator */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: "#388e3c", letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 700 }}>
                👤 Nama Operator <span style={{ color: "#e53935" }}>*</span>
              </label>
              <input type="text" value={operator} onChange={e => setOperator(e.target.value)} placeholder="Tulis nama lengkap..."
                style={{ width: "100%", marginTop: 8, padding: "11px 14px", background: "#fff", border: `1.5px solid ${operator.trim() ? "#81c784" : "#e0e0e0"}`, borderRadius: 10, color: "#333", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
            </div>

            {!allFilled && tableData.length > 0 && (
              <div style={{ fontSize: 12, color: "#e65100", background: "#fff3e0", border: "1px solid #ffb74d", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>
                ⚠️ {tableData.length - filledCount} baris belum lengkap — tap baris untuk mengisi
              </div>
            )}
            {submitError && (
              <div style={{ fontSize: 12, color: "#c62828", background: "#ffebee", border: "1px solid #ef9a9a", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>⚠️ {submitError}</div>
            )}
            {submitting && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>Menyimpan {submitProgress.done}/{submitProgress.total} baris...</div>
                <div style={{ background: "#e0e0e0", borderRadius: 4, height: 6, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg,#1b5e20,#4CAF50)", width: `${submitProgress.total > 0 ? (submitProgress.done / submitProgress.total) * 100 : 0}%`, transition: "width 0.3s" }} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ STEP 3 — Sukses ══ */}
        {step === 3 && (
          <div style={{ textAlign: "center", paddingTop: 32 }}>
            <div style={{ fontSize: 60, marginBottom: 12 }}>{isDemoMode ? "🧪" : savedOffline ? "💾" : "✅"}</div>
            <div style={{ fontSize: 21, fontWeight: 800, color: isDemoMode ? "#f57f17" : savedOffline ? "#1565C0" : "#2e7d32", marginBottom: 6 }}>
              {isDemoMode ? "Demo Selesai!" : savedOffline ? "Tersimpan Lokal!" : "Data Tersimpan!"}
            </div>
            <div style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>
              {isDemoMode ? "Data tidak dikirim (mode demo)"
                : savedOffline ? "Otomatis terkirim ke Google Sheets saat online."
                : `${tableData.length} baris berhasil dikirim ke Google Sheets`}
            </div>
            <div style={{ background: savedOffline ? "#e3f2fd" : "#e8f5e9", border: `1px solid ${savedOffline ? "#90CAF9" : "#a5d6a7"}`, borderRadius: 14, padding: 16, textAlign: "left", marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#333" }}>{selectedGH} · P{ghInfo?.periode} · {hstAktual} HST</div>
              <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>Checkpoint: HST {selectedHST} · Operator: {operator}</div>
              <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>Performa buah: {isiPerformabuah ? "Ya" : "Tidak"}</div>
              <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>{tableData.length} baris · {todayISO}</div>
            </div>
            <button onClick={resetForm} style={{ width: "100%", padding: 15, background: "#e8f5e9", border: "2px solid #81c784", borderRadius: 12, color: "#2e7d32", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              + Input GH Berikutnya
            </button>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      {step < 3 && (
        <div style={{ padding: "12px 16px 24px", borderTop: "1px solid #e0e0e0", background: "#fff", position: "sticky", bottom: 0, display: "flex", gap: 10 }}>
          {step > 1 && (
            <button onClick={() => { setStep(s => s - 1); setSubmitError(null); }}
              style={{ flex: 1, padding: 13, background: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: 12, color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>← Kembali</button>
          )}
          {step === 1 && (
            <button onClick={() => setStep(2)} disabled={!selectedGH}
              style={{ flex: 2, padding: 13, border: "none", borderRadius: 12, background: selectedGH ? "linear-gradient(135deg,#1b5e20,#2e7d32)" : "#e0e0e0", color: selectedGH ? "#fff" : "#aaa", fontSize: 15, fontWeight: 700, cursor: selectedGH ? "pointer" : "not-allowed" }}>
              Lanjut Input →
            </button>
          )}
          {step === 2 && (
            <button onClick={handleSubmit} disabled={!canSubmit || submitting}
              style={{ flex: 2, padding: 13, border: "none", borderRadius: 12, background: canSubmit && !submitting ? (!isOnline ? "linear-gradient(135deg,#1565C0,#1976D2)" : "linear-gradient(135deg,#1b5e20,#2e7d32)") : "#e0e0e0", color: canSubmit && !submitting ? "#fff" : "#aaa", fontSize: 15, fontWeight: 700, cursor: canSubmit && !submitting ? "pointer" : "not-allowed" }}>
              {submitting ? `⏳ ${submitProgress.done}/${submitProgress.total}...`
                : !isOnline && canSubmit ? `💾 Simpan Offline (${tableData.length} baris)`
                : `Submit ${tableData.length} Baris ✓`}
            </button>
          )}
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
