import { useState, useEffect, useCallback } from "react";
import { idbAdd, idbGetAll, idbDelete, idbCount } from "../utils/idb";
import { useGHData } from "../hooks/useGHData";
import ConfirmSubmitModal from "../components/ConfirmSubmitModal";

const DB_NAME = "GramasiOfflineDB";

const SCRIPT_URL = import.meta.env.VITE_GAS_GRAMASI_URL;
const HST_MIN = 30;
const HST_MAX = 55;


// ─── localStorage helpers ─────────────────────────────────────────────────────
const LS_KEY = `gramasi_${new Date().toLocaleDateString("id-ID")}`;
function getSubmittedToday() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); }
  catch { return []; }
}
function markSubmitted(gh) {
  const list = getSubmittedToday();
  if (!list.includes(gh)) localStorage.setItem(LS_KEY, JSON.stringify([...list, gh]));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function hitungHST(tgl) {
  // Parse manual agar tidak kena masalah UTC
  const [y, m, d] = tgl.split("-").map(Number);
  const tanam = new Date(y, m - 1, d); // local time, bukan UTC
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

function hstColor(hst) {
  if (hst <= 40) return { bg: "#e8f5e9", border: "#a5d6a7", text: "#2e7d32", badge: "#c8e6c9" };
  if (hst <= 50) return { bg: "#fff8e1", border: "#ffe082", text: "#f57f17", badge: "#fff9c4" };
  return             { bg: "#fbe9e7", border: "#ffab91", text: "#bf360c", badge: "#fce4ec" };
}

const todayISO   = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
const todayLabel = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export default function Gramasi() {
  const [step, setStep]   = useState(1);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const { ghData, loading: loadingGH, isDemoMode } = useGHData();

  const [selectedGH, setSelectedGH]     = useState("");
  const [tableData, setTableData]       = useState([]);
  const [operator, setOperator]         = useState("");
  const [syncing, setSyncing]           = useState(false);
  const [syncProgress, setSyncProgress] = useState({ done: 0, total: 0 });
  const [submitError, setSubmitError]   = useState(null);
  const [savedOffline, setSavedOffline] = useState(false);
  const [confirmOpen, setConfirmOpen]   = useState(false);

  const [submittedToday, setSubmittedToday] = useState(getSubmittedToday());
  const [showWarning, setShowWarning]       = useState(false);
  const [pendingGH, setPendingGH]           = useState("");

  // ── Offline state ──
  const [pendingCount, setPendingCount]         = useState(0);
  const [isSyncingPending, setIsSyncingPending] = useState(false);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await idbCount(DB_NAME);
      setPendingCount(count);
    } catch {
      setPendingCount(0);
    }
  }, []);

  useEffect(() => { refreshPendingCount(); }, [refreshPendingCount]);

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
        let allSuccess = true;
        for (const payload of record.payloads) {
          try {
            await fetch(SCRIPT_URL, {
              method: "POST",
              headers: { "Content-Type": "text/plain" },
              body: JSON.stringify(payload),
              redirect: "follow",
            });
          } catch {
            allSuccess = false;
            break;
          }
        }
        if (allSuccess) {
          markSubmitted(record.gh);
          setSubmittedToday(getSubmittedToday());
          await idbDelete(DB_NAME, record.id);
        }
      } catch {
        // skip, coba lagi next time
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
    return tableData.map(row => {
      const avg = calcAvg(row.s1, row.s2, row.s3);
      return {
        action: "submitGramasi",
        client_timestamp,
        tanggal: todayISO,
        gh: selectedGH,
        periode: ghInfo?.periode || "",
        hst: hst ?? "",
        baris: row.baris,
        varian: row.varian,
        s1: row.s1 || 0,
        s2: row.s2 || 0,
        s3: row.s3 || 0,
        avg: avg || 0,
        operator,
      };
    });
  };

  const handleSubmit = async () => {
    setSyncing(true);
    setSubmitError(null);
    setSyncProgress({ done: 0, total: tableData.length });

    // ── Mode Demo ──
    if (isDemoMode) {
      for (let i = 0; i < tableData.length; i++) {
        await new Promise(r => setTimeout(r, 60));
        setSyncProgress({ done: i + 1, total: tableData.length });
      }
      markSubmitted(selectedGH);
      setSubmittedToday(getSubmittedToday());
      setStep(3);
      setSyncing(false);
      return;
    }

    const payloads = buildPayloads();

    // ══ MODE OFFLINE ══
    if (!isOnline) {
      try {
        await idbAdd(DB_NAME, { gh: selectedGH, tanggal: todayISO, createdAt: Date.now(), payloads });
        await refreshPendingCount();
        markSubmitted(selectedGH);
        setSubmittedToday(getSubmittedToday());
        setSavedOffline(true);
        setStep(3);
      } catch {
        setSubmitError("Gagal menyimpan data offline. Coba lagi.");
      } finally {
        setSyncing(false);
      }
      return;
    }

    // ══ MODE ONLINE ══
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
        setSyncProgress({ done, total: tableData.length });
      } catch {
        setSubmitError(`Gagal mengirim baris ${payload.baris}, cek koneksi`);
        setSyncing(false);
        return;
      }
    }
    markSubmitted(selectedGH);
    setSubmittedToday(getSubmittedToday());
    setStep(3);
    setSyncing(false);
  };

  const resetForm = () => {
    setStep(1); setSelectedGH(""); setTableData([]); setOperator("");
    setSyncing(false); setSyncProgress({ done: 0, total: 0 });
    setSubmitError(null); setSavedOffline(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5", fontFamily: "'DM Sans','Segoe UI',sans-serif", margin: "0 auto" }}>

      {/* ── Header ── */}
      <div style={{ background: "#2e7d32", color: "#fff", padding: "14px 16px 10px", position: "sticky", top: 0, zIndex: 10, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, opacity: 0.75, letterSpacing: 1.5, textTransform: "uppercase" }}>Form Gramasi Harian</div>
            <div style={{ fontSize: 13, opacity: 0.65, marginTop: 1 }}>{todayLabel}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Badge pending */}
            {pendingCount > 0 && (
              <button
                onClick={isOnline ? syncPendingData : undefined}
                title={isOnline ? "Klik untuk sync sekarang" : "Akan sync otomatis saat online"}
                style={{
                  fontSize: 10, fontWeight: 700,
                  background: isOnline ? "rgba(33,150,243,0.3)" : "rgba(255,179,0,0.3)",
                  border: `1px solid ${isOnline ? "rgba(33,150,243,0.6)" : "rgba(255,179,0,0.6)"}`,
                  color: "#fff", padding: "2px 8px", borderRadius: 20,
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
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: isOnline ? "#a5d6a7" : "#ef9a9a", boxShadow: isOnline ? "0 0 6px #a5d6a7" : "0 0 6px #ef9a9a" }} />
          </div>
        </div>

        {/* Banner offline */}
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

      {/* Modal Warning Double Submit */}
      {showWarning && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: "100%", width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
            <div style={{ fontSize: 36, textAlign: "center", marginBottom: 12 }}>⚠️</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#333", textAlign: "center", marginBottom: 8 }}>GH Sudah Diisi Hari Ini</div>
            <div style={{ fontSize: 13, color: "#666", textAlign: "center", marginBottom: 20, lineHeight: 1.5 }}>
              <strong>{pendingGH}</strong> sudah disubmit hari ini. Yakin mau isi ulang? Data baru akan ditambahkan ke Sheets.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setShowWarning(false); setPendingGH(""); }} style={{ flex: 1, padding: "11px", background: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: 10, color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Batal</button>
              <button onClick={() => doSelectGH(pendingGH)} style={{ flex: 1, padding: "11px", background: "#e53935", border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Isi Ulang</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: "16px" }}>

        {/* ══ STEP 1 — Pilih GH ══ */}
        {step === 1 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: "#1b5e20", marginBottom: 4 }}>Pilih Greenhouse</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 14 }}>GH aktif dengan HST {HST_MIN}–{HST_MAX} hari</div>

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
              <div style={{ textAlign: "center", padding: "32px 0", color: "#aaa", fontSize: 13 }}>Tidak ada GH aktif (HST {HST_MIN}–{HST_MAX})</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {ghAktif.map(([gh, info]) => {
                  const hstGH   = info.tanam ? hitungHST(info.tanam) : null;
                  const c       = hstGH !== null ? hstColor(hstGH) : hstColor(30);
                  const dipilih = selectedGH === gh;
                  const sudahIsi = submittedToday.includes(gh);
                  return (
                    <button key={gh} onClick={() => handleSelectGH(gh)} style={{ padding: "12px 10px", borderRadius: 14, cursor: "pointer", textAlign: "center", border: dipilih ? "2px solid #2e7d32" : sudahIsi ? "1px solid #ffb74d" : "1px solid #e0e0e0", background: dipilih ? "#e8f5e9" : sudahIsi ? "#fff8e1" : "#fff", boxShadow: dipilih ? "0 2px 10px rgba(46,125,50,0.15)" : "0 1px 4px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", alignItems: "center", gap: 7, transition: "all 0.2s" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: dipilih ? "#2e7d32" : "#333", lineHeight: 1.3 }}>{gh}</div>
                      <div style={{ fontSize: 10, color: "#aaa" }}>P{info.periode} · {info.baris?.length || 0} baris</div>
                      {hstGH !== null && (
                        <div style={{ background: c.badge, border: `1px solid ${c.border}`, borderRadius: 8, padding: "4px 12px", width: "100%" }}>
                          <span style={{ fontSize: 17, fontWeight: 800, color: c.text }}>{hstGH}</span>
                          <span style={{ fontSize: 10, color: c.text, marginLeft: 3 }}>HST</span>
                        </div>
                      )}
                      {sudahIsi && (
                        <div style={{ fontSize: 10, background: "#fff3e0", border: "1px solid #ffb74d", borderRadius: 20, padding: "2px 10px", color: "#e65100", fontWeight: 600 }}>✓ Sudah diisi hari ini</div>
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
              <div style={{ background: "#e8f5e9", border: "1px solid #a5d6a7", borderRadius: 20, padding: "3px 12px", fontSize: 12, color: "#2e7d32", fontWeight: 700 }}>{selectedGH}</div>
              <div style={{ background: "#f5f5f5", borderRadius: 20, padding: "3px 12px", fontSize: 12, color: "#666" }}>Periode {ghInfo?.periode}</div>
              {hst !== null && (
                <div style={{ background: col.badge, border: `1px solid ${col.border}`, borderRadius: 20, padding: "3px 12px", fontSize: 12, color: col.text, fontWeight: 700 }}>{hst} HST</div>
              )}
            </div>

            {/* Banner offline di step 2 */}
            {!isOnline && (
              <div style={{ marginBottom: 12, padding: "8px 12px", background: "#fff3e0", border: "1px solid #ffb74d", borderRadius: 9, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14 }}>📵</span>
                <span style={{ fontSize: 11, color: "#e65100" }}>Offline — data akan disimpan lokal & dikirim otomatis saat online</span>
              </div>
            )}

            <div style={{ fontWeight: 700, fontSize: 17, color: "#1b5e20", marginBottom: 2 }}>Input Gramasi</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>{filledCount}/{tableData.length} baris terisi</div>

            <div style={{ background: "#e0e0e0", borderRadius: 4, height: 5, marginBottom: 14, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 4, background: "#4CAF50", width: `${tableData.length > 0 ? (filledCount / tableData.length) * 100 : 0}%`, transition: "width 0.3s" }} />
            </div>

            <div style={{ overflowX: "auto", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.08)", marginBottom: 16 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#2e7d32", color: "#fff" }}>
                    {["Baris","Varian","S1 (g)","S2 (g)","S3 (g)","Avg"].map(h => (
                      <th key={h} style={{ padding: "9px 6px", textAlign: ["Baris","Varian"].includes(h) ? "left" : "center", fontWeight: 700, fontSize: 11, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableData.map((row, i) => {
                    const avg     = calcAvg(row.s1, row.s2, row.s3);
                    const rowFull = row.s1 !== "" && row.s2 !== "" && row.s3 !== "";
                    return (
                      <tr key={i} style={{ background: rowFull ? "#f1f8e9" : i % 2 === 0 ? "#fff" : "#fafafa", transition: "background 0.2s" }}>
                        <td style={{ padding: "6px 8px", fontWeight: 700, color: "#2e7d32", whiteSpace: "nowrap" }}>{row.baris}</td>
                        <td style={{ padding: "6px 6px", fontSize: 11, color: "#666", whiteSpace: "nowrap" }}>{row.varian}</td>
                        {["s1","s2","s3"].map(s => (
                          <td key={s} style={{ padding: "4px 3px", textAlign: "center" }}>
                            <input
                              type="number" inputMode="decimal"
                              value={row[s]}
                              onChange={e => updateCell(i, s, e.target.value)}
                              placeholder="—"
                              style={{ width: 52, height: 32, textAlign: "center", border: `1.5px solid ${row[s] !== "" ? "#81c784" : "#e0e0e0"}`, borderRadius: 7, fontSize: 13, fontWeight: 600, color: row[s] !== "" ? "#2e7d32" : "#bbb", outline: "none", background: "#fff" }}
                            />
                          </td>
                        ))}
                        <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: avg ? "#1b5e20" : "#ccc", fontSize: 13 }}>
                          {avg || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Operator */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: "#388e3c", letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 700 }}>
                👤 Nama Operator <span style={{ color: "#e53935" }}>*</span>
              </label>
              <input
                type="text" value={operator}
                onChange={e => setOperator(e.target.value)}
                placeholder="Tulis nama lengkap..."
                style={{ width: "100%", marginTop: 8, padding: "11px 14px", background: "#fff", border: `1.5px solid ${operator.trim() ? "#81c784" : "#e0e0e0"}`, borderRadius: 10, color: "#333", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
              />
            </div>

            {!allFilled && tableData.length > 0 && (
              <div style={{ fontSize: 12, color: "#e65100", background: "#fff3e0", border: "1px solid #ffb74d", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>
                ⚠️ {tableData.length - filledCount} baris belum lengkap (perlu 3 sampel)
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
                  <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg,#2e7d32,#4CAF50)", width: `${syncProgress.total > 0 ? (syncProgress.done / syncProgress.total) * 100 : 0}%`, transition: "width 0.3s" }} />
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
              {isDemoMode ? "Demo Selesai!" : savedOffline ? "Tersimpan Lokal!" : "Data Tersimpan!"}
            </div>
            <div style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>
              {isDemoMode
                ? "Data tidak dikirim (mode demo)"
                : savedOffline
                  ? "Data disimpan di perangkat. Otomatis terkirim ke Google Sheets saat online."
                  : `${tableData.length} baris berhasil dikirim ke Google Sheets`}
            </div>

            {savedOffline && (
              <div style={{ background: "#e3f2fd", border: "1px solid #90CAF9", borderRadius: 10, padding: "10px 14px", marginBottom: 16, textAlign: "left" }}>
                <div style={{ fontSize: 12, color: "#1565C0", fontWeight: 600, marginBottom: 4 }}>📡 Cara sync:</div>
                <div style={{ fontSize: 12, color: "#555" }}>Biarkan app terbuka saat koneksi kembali — data terkirim otomatis. Atau klik badge "pending" di header.</div>
                {pendingCount > 0 && <div style={{ fontSize: 12, color: "#1565C0", marginTop: 6 }}>{pendingCount} record menunggu sync.</div>}
              </div>
            )}

            <div style={{ background: isDemoMode ? "#fff8e1" : savedOffline ? "#e3f2fd" : "#e8f5e9", border: `1px solid ${isDemoMode ? "#ffe082" : savedOffline ? "#90CAF9" : "#a5d6a7"}`, borderRadius: 14, padding: "16px", textAlign: "left", marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: isDemoMode ? "#f57f17" : savedOffline ? "#1565C0" : "#2e7d32", fontWeight: 700, marginBottom: 10 }}>Ringkasan</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#333" }}>{selectedGH} · Periode {ghInfo?.periode} · {hst} HST</div>
              <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>Operator: {operator}</div>
              <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>Tanggal: {todayISO}</div>
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(0,0,0,0.06)", fontSize: 13, fontWeight: 700, color: isDemoMode ? "#f57f17" : savedOffline ? "#1565C0" : "#2e7d32" }}>
                Avg keseluruhan: {(() => {
                  const avgs = tableData.map(r => parseFloat(calcAvg(r.s1, r.s2, r.s3))).filter(v => v > 0);
                  return avgs.length > 0 ? (avgs.reduce((a, b) => a + b, 0) / avgs.length).toFixed(2) + " g" : "—";
                })()}
              </div>
            </div>

            <button onClick={resetForm} style={{ width: "100%", padding: "15px", background: isDemoMode ? "#fff8e1" : savedOffline ? "#e3f2fd" : "#e8f5e9", border: `2px solid ${isDemoMode ? "#ffb74d" : savedOffline ? "#90CAF9" : "#81c784"}`, borderRadius: 12, color: isDemoMode ? "#e65100" : savedOffline ? "#1565C0" : "#2e7d32", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              + Input GH Berikutnya
            </button>
          </div>
        )}
      </div>

      {/* ── Bottom Nav ── */}
      {step < 3 && (
        <div style={{ padding: "12px 16px 24px", borderTop: "1px solid #e0e0e0", background: "#fff", position: "sticky", bottom: 0, display: "flex", gap: 10 }}>
          {step > 1 && (
            <button onClick={() => { setStep(s => s - 1); setSubmitError(null); }} style={{ flex: 1, padding: "13px", background: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: 12, color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>← Kembali</button>
          )}
          {step === 1 && (
            <button onClick={() => setStep(2)} disabled={!selectedGH} style={{ flex: 2, padding: "13px", border: "none", borderRadius: 12, background: selectedGH ? "linear-gradient(135deg,#2e7d32,#43a047)" : "#e0e0e0", color: selectedGH ? "#fff" : "#aaa", fontSize: 15, fontWeight: 700, cursor: selectedGH ? "pointer" : "not-allowed", transition: "all 0.2s" }}>
              Lanjut Input →
            </button>
          )}
          {step === 2 && (
            <button onClick={() => setConfirmOpen(true)} disabled={!canSubmit || syncing} style={{ flex: 2, padding: "13px", border: "none", borderRadius: 12, background: canSubmit && !syncing ? (!isOnline ? "linear-gradient(135deg,#1565C0,#1976D2)" : "linear-gradient(135deg,#1b5e20,#2e7d32)") : "#e0e0e0", color: canSubmit && !syncing ? "#fff" : "#aaa", fontSize: 15, fontWeight: 700, cursor: canSubmit && !syncing ? "pointer" : "not-allowed", transition: "all 0.2s" }}>
              {syncing
                ? `⏳ ${syncProgress.done}/${syncProgress.total}...`
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
