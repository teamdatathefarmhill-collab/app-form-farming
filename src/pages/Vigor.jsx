import { useState, useEffect, useCallback } from "react";
import { idbAdd, idbGetAll, idbDelete, idbCount } from "../utils/idb";
import { useGHData } from "../hooks/useGHData";
import ConfirmSubmitModal from "../components/ConfirmSubmitModal";

const DB_NAME    = "VigorOfflineDB";
const SCRIPT_URL = import.meta.env.VITE_GAS_VIGOR_URL;

const HST_MIN = 5;
const HST_MAX = 60;
const HST_CHECKPOINTS = [7, 14, 21, 33, 38, 45, 54];
const HST_NEAR_RANGE  = 2; // hari sebelum checkpoint = reminder

const TIPE_GH = [
  {
    key: "drip", label: "Drip", icon: "💧", color: "#1E88E5",
    pattern: (gh) => {
      const upper = gh.toUpperCase();
      if (upper.startsWith("BERGAS")) { const n = parseInt(upper.replace("BERGAS","").trim()); return n >= 1 && n <= 8 && n !== 6; }
      if (upper.startsWith("COLOMADU")) { const n = parseInt(upper.replace("COLOMADU","").trim()); return n >= 1 && n <= 4; }
      return false;
    },
  },
  {
    key: "kolam", label: "Kolam", icon: "🏊", color: "#00897B",
    pattern: (gh) => {
      const upper = gh.toUpperCase();
      if (upper.startsWith("TOHUDAN")) { const n = parseInt(upper.replace("TOHUDAN","").trim()); return (n >= 1 && n <= 14) || n === 22; }
      if (upper.startsWith("SAWAHAN")) { const n = parseInt(upper.replace("SAWAHAN","").trim()); return n >= 1 && n <= 4; }
      return false;
    },
  },
  {
    key: "dutch", label: "Dutch Bucket", icon: "🪣", color: "#FB8C00",
    pattern: (gh) => {
      const upper = gh.toUpperCase();
      if (upper.startsWith("TOHUDAN")) { const n = parseInt(upper.replace("TOHUDAN","").trim()); return n >= 15 && n <= 21; }
      return false;
    },
  },
];

function getCheckpointStatus(hst) {
  if (hst === null) return null;
  // Cek apakah pas atau sudah lewat checkpoint (dalam 3 hari setelah checkpoint)
  for (const cp of HST_CHECKPOINTS) {
    if (hst >= cp && hst <= cp + 3) {
      return { type: "due", cp, label: `⚠️ Waktunya input Vigor HST ${cp}!` };
    }
  }
  // Cek approaching (dalam HST_NEAR_RANGE hari sebelum checkpoint)
  for (const cp of HST_CHECKPOINTS) {
    if (hst >= cp - HST_NEAR_RANGE && hst < cp) {
      return { type: "soon", cp, label: `🔔 ${cp - hst} hari lagi menuju checkpoint HST ${cp}` };
    }
  }
  return null;
}

function hstTerdekat(hst) {
  return HST_CHECKPOINTS.reduce((prev, curr) =>
    Math.abs(curr - hst) < Math.abs(prev - hst) ? curr : prev
  );
}

// ─── Aspek Vigor ──────────────────────────────────────────────────────────────
const LEBAR_DAUN_OPTIONS = ["<7", "7–9,9", "10–12"];
const DIAMETER_OPTIONS   = [
  "Tanaman kutilang",
  "Batang kecil, antar ruas pendek",
  "Batang besar, antar ruas panjang",
  "Batang besar, ruas pendek",
];
const WARNA_DAUN_OPTIONS = [
  "> 8 tanaman menguning",
  "5–8 tanaman menguning",
  "1–4 tanaman menguning",
  "Tidak ada menguning",
];

// ─── Aspek Perakaran ──────────────────────────────────────────────────────────
const WARNA_AKAR_OPTIONS  = ["Akar Coklat", "Akar Putih Bersih"];
const VOLUME_AKAR_OPTIONS = ["Tidak Ada Akar", "Volume Akar Sedikit", "Volume Akar Banyak"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function hitungHST(tgl) {
  const [y, m, d] = tgl.split("-").map(Number);
  const tanam = new Date(y, m - 1, d);
  const now   = new Date();
  return Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - tanam) / 86400000);
}

function hstColor(hst) {
  if (hst <= 21) return { bg: "#e8f5e9", border: "#a5d6a7", text: "#2e7d32", badge: "#c8e6c9" };
  if (hst <= 40) return { bg: "#fff8e1", border: "#ffe082", text: "#f57f17", badge: "#fff9c4" };
  return              { bg: "#fbe9e7", border: "#ffab91", text: "#bf360c", badge: "#fce4ec" };
}

function initVarianData(varianList) {
  const obj = {};
  varianList.forEach(v => {
    obj[v] = {
      lebarDaun:   "",
      diameterBatang: "",
      warnaDaun:   "",
      warnaAkar:   "",
      volumeAkar:  "",
    };
  });
  return obj;
}

function isVarianFilled(d) {
  return d.lebarDaun !== "" && d.diameterBatang !== "" && d.warnaDaun !== "" &&
         d.warnaAkar !== "" && d.volumeAkar !== "";
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

// ─── Komponen: Pilih Opsi (Radio style) ──────────────────────────────────────
function PilihOpsi({ options, value, onChange, color = "#2e7d32" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {options.map((opt, i) => {
        const active = value === opt;
        return (
          <button key={i} onClick={() => onChange(opt)}
            style={{
              padding: "9px 14px", textAlign: "left", borderRadius: 10, cursor: "pointer",
              border: `1.5px solid ${active ? color : "#e0e0e0"}`,
              background: active ? `${color}12` : "#fff",
              color: active ? color : "#555",
              fontSize: 13, fontWeight: active ? 700 : 400,
              transition: "all 0.15s",
            }}>
            <span style={{ marginRight: 8 }}>{active ? "●" : "○"}</span>
            {opt}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Vigor() {
  const [step, setStep]       = useState(1);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const { ghData, loading: loadingGH, isDemoMode } = useGHData();

  const [selectedGH, setSelectedGH]   = useState("");
  const [selectedHST, setSelectedHST] = useState(null);
  const [selectedTipe, setSelectedTipe] = useState("");
  const [varianData, setVarianData]   = useState({});
  const [operator, setOperator]       = useState("");
  const [activeVarian, setActiveVarian] = useState(null);

  const [submitting, setSubmitting]   = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
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
    setSelectedGH(gh);
    setSelectedHST(hst !== null ? hstTerdekat(hst) : HST_CHECKPOINTS[0]);
    setVarianData(initVarianData(info?.varian || []));
    setActiveVarian(null);
    setShowWarning(false);
    setPendingGH("");
  };

  const updateVarian = (varian, field, val) => {
    setVarianData(prev => ({ ...prev, [varian]: { ...prev[varian], [field]: val } }));
  };

  const ghInfo   = ghData[selectedGH];
  const varianList = ghInfo?.varian || [];
  const hstAktual  = ghInfo?.tanam ? hitungHST(ghInfo.tanam) : null;
  const col        = hstAktual !== null ? hstColor(hstAktual) : hstColor(21);

  const filledCount = varianList.filter(v => isVarianFilled(varianData[v] || {})).length;
  const allFilled   = varianList.length > 0 && filledCount === varianList.length;
  const canSubmit   = allFilled && operator.trim().length > 0;

  const buildPayloads = () =>
    varianList.map(varian => {
      const d = varianData[varian] || {};
      return {
        action:          "submitVigor",
        tanggal:         todayISO,
        gh:              selectedGH,
        periode:         ghInfo?.periode || "",
        hst_aktual:      hstAktual ?? "",
        hst_checkpoint:  selectedHST ?? "",
        varian,
        operator,
        lebar_daun:      d.lebarDaun      || "",
        diameter_batang: d.diameterBatang || "",
        warna_daun:      d.warnaDaun      || "",
        warna_akar:      d.warnaAkar      || "",
        volume_akar:     d.volumeAkar     || "",
      };
    });

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    const payloads = buildPayloads();

    if (isDemoMode) {
      await new Promise(r => setTimeout(r, 600));
      markSubmitted(selectedGH); setSubmittedToday(getSubmittedToday());
      setStep(3); setSubmitting(false);
      return;
    }

    if (!isOnline) {
      try {
        await idbAdd(DB_NAME, { gh: selectedGH, tanggal: todayISO, createdAt: Date.now(), payloads });
        await refreshPendingCount();
        markSubmitted(selectedGH); setSubmittedToday(getSubmittedToday());
        setSavedOffline(true); setStep(3);
      } catch {
        setSubmitError("Gagal menyimpan data offline. Coba lagi.");
      } finally { setSubmitting(false); }
      return;
    }

    setSavedOffline(false);
    try {
      for (const payload of payloads) {
        const res  = await fetch(SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(payload), redirect: "follow" });
        const json = await res.json();
        if (!json.success) throw new Error(json.message || "Gagal menyimpan");
      }
      markSubmitted(selectedGH); setSubmittedToday(getSubmittedToday());
      setStep(3);
    } catch (e) {
      setSubmitError(e.message || "Terjadi kesalahan, coba lagi.");
    } finally { setSubmitting(false); }
  };

  const resetForm = () => {
    setStep(1); setSelectedGH(""); setOperator(""); setVarianData({});
    setSelectedHST(null); setSelectedTipe(""); setActiveVarian(null); setSubmitting(false);
    setSubmitError(null); setSavedOffline(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f4f7f4", fontFamily: "'Segoe UI', system-ui, sans-serif", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #1b5e20, #2e7d32)", padding: "14px 16px 12px", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", letterSpacing: 2, textTransform: "uppercase" }}>Form Vigor Harian</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{todayLabel}</div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {pendingCount > 0 && (
              <button onClick={isOnline ? syncPending : undefined}
                style={{ fontSize: 10, fontWeight: 700, background: isOnline ? "rgba(33,150,243,0.25)" : "rgba(255,179,0,0.2)", border: `1px solid ${isOnline ? "rgba(33,150,243,0.5)" : "rgba(255,179,0,0.4)"}`, borderRadius: 20, padding: "3px 9px", color: isOnline ? "#90CAF9" : "#FFB300", cursor: isOnline ? "pointer" : "default" }}>
                {isSyncingPending ? "⏳" : "📤"} {pendingCount} pending
              </button>
            )}
            {isDemoMode && <span style={{ fontSize: 10, background: "rgba(255,179,0,0.2)", border: "1px solid rgba(255,179,0,0.4)", color: "#FFB300", padding: "3px 8px", borderRadius: 20, fontWeight: 700 }}>DEMO</span>}
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: isOnline ? "#69f0ae" : "#f44336", display: "inline-block", boxShadow: isOnline ? "0 0 6px #69f0ae" : "0 0 6px #f44336" }} />
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ display: "flex", gap: 5, marginTop: 12 }}>
          {["Pilih GH", "Input Vigor", "Selesai"].map((label, i) => {
            const s = i + 1;
            const active = step === s, done = step > s;
            return (
              <div key={s} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ height: 3, borderRadius: 2, marginBottom: 4, background: done ? "#69f0ae" : active ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.15)", transition: "background 0.3s" }} />
                <div style={{ fontSize: 9, color: active ? "#fff" : done ? "#69f0ae" : "rgba(255,255,255,0.3)", fontWeight: active ? 700 : 400 }}>{label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Warning modal */}
      {showWarning && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: 340, width: "100%" }}>
            <div style={{ fontSize: 32, textAlign: "center", marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#333", textAlign: "center", marginBottom: 8 }}>Sudah disubmit hari ini</div>
            <div style={{ fontSize: 13, color: "#666", textAlign: "center", marginBottom: 20, lineHeight: 1.5 }}>
              <strong>{pendingGH}</strong> sudah disubmit hari ini. Data baru akan ditambahkan.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setShowWarning(false); setPendingGH(""); }} style={{ flex: 1, padding: 11, background: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: 10, color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Batal</button>
              <button onClick={() => doSelectGH(pendingGH)} style={{ flex: 1, padding: 11, background: "#e53935", border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Isi Ulang</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ flex: 1, padding: 16 }}>

        {/* ══ STEP 1 — Pilih GH ══ */}
        {step === 1 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: "#1b5e20", marginBottom: 4 }}>Pilih Greenhouse</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 14 }}>GH aktif HST {HST_MIN}–{HST_MAX}</div>

            {loadingGH ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#aaa" }}>
                <div style={{ fontSize: 28 }}>🔄</div>
                <div style={{ fontSize: 13, marginTop: 8 }}>Memuat data GH...</div>
              </div>
            ) : ghAktif.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0", color: "#aaa", fontSize: 13 }}>Tidak ada GH aktif</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {TIPE_GH.map(tipe => {
                  const ghDiTipe  = ghAktif.filter(([gh]) => tipe.pattern(gh));
                  const isOpen    = selectedTipe === tipe.key;
                  const hasDue    = ghDiTipe.some(([gh, info]) => {
                    const cs = getCheckpointStatus(info.tanam ? hitungHST(info.tanam) : null);
                    return cs?.type === "due";
                  });
                  const hasSoon   = !hasDue && ghDiTipe.some(([gh, info]) => {
                    const cs = getCheckpointStatus(info.tanam ? hitungHST(info.tanam) : null);
                    return cs?.type === "soon";
                  });

                  return (
                    <div key={tipe.key} style={{ border: `1.5px solid ${isOpen ? tipe.color + "55" : "#e0e0e0"}`, borderRadius: 14, overflow: "hidden", background: "#fff" }}>
                      {/* Accordion header */}
                      <button onClick={() => setSelectedTipe(isOpen ? "" : tipe.key)}
                        style={{ width: "100%", padding: "13px 16px", background: isOpen ? `${tipe.color}10` : "#fff", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 20 }}>{tipe.icon}</span>
                          <div style={{ textAlign: "left" }}>
                            <div style={{ fontSize: 14, fontWeight: 800, color: isOpen ? tipe.color : "#333" }}>{tipe.label}</div>
                            <div style={{ fontSize: 11, color: "#aaa", marginTop: 1 }}>{ghDiTipe.length} GH aktif saat ini</div>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {hasDue  && <span style={{ fontSize: 10, background: "#fff3e0", border: "1px solid #ffb74d", borderRadius: 20, padding: "2px 8px", color: "#e65100", fontWeight: 700 }}>⚠️ Due</span>}
                          {hasSoon && <span style={{ fontSize: 10, background: "#e8f5e9", border: "1px solid #a5d6a7", borderRadius: 20, padding: "2px 8px", color: "#2e7d32", fontWeight: 700 }}>🔔 Soon</span>}
                          <span style={{ fontSize: 14, color: "#bbb", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>▼</span>
                        </div>
                      </button>

                      {/* GH grid */}
                      {isOpen && (
                        <div style={{ padding: "10px 12px 14px", borderTop: `1px solid ${tipe.color}22` }}>
                          {ghDiTipe.length === 0 ? (
                            <div style={{ textAlign: "center", padding: 20, color: "#aaa", fontSize: 13 }}>Tidak ada GH aktif di tipe ini.</div>
                          ) : (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                              {ghDiTipe.map(([gh, info]) => {
                                const hstGH    = info.tanam ? hitungHST(info.tanam) : null;
                                const c        = hstGH !== null ? hstColor(hstGH) : hstColor(21);
                                const dipilih  = selectedGH === gh;
                                const sudahIsi = submittedToday.includes(gh);
                                return (
                                  <button key={gh} onClick={() => handleSelectGH(gh)}
                                    style={{ padding: "12px 10px", borderRadius: 12, cursor: "pointer", textAlign: "center", border: dipilih ? `2px solid ${tipe.color}` : sudahIsi ? "1px solid #ffb74d" : "1px solid #e0e0e0", background: dipilih ? `${tipe.color}12` : sudahIsi ? "#fff8e1" : "#fafafa", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, transition: "all 0.2s" }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: dipilih ? tipe.color : "#333" }}>{gh}</div>
                                    <div style={{ fontSize: 10, color: "#aaa" }}>P{info.periode} · {info.varian?.length || 0} varian</div>
                                    {hstGH !== null && (
                                      <div style={{ background: c.badge, border: `1px solid ${c.border}`, borderRadius: 8, padding: "4px 10px", width: "100%" }}>
                                        <span style={{ fontSize: 16, fontWeight: 800, color: c.text }}>{hstGH}</span>
                                        <span style={{ fontSize: 10, color: c.text, marginLeft: 3 }}>HST</span>
                                      </div>
                                    )}
                                    {(() => {
                                      const cs = getCheckpointStatus(hstGH);
                                      if (!cs) return null;
                                      return (
                                        <div style={{ width: "100%", fontSize: 10, borderRadius: 7, padding: "3px 6px", fontWeight: 700, background: cs.type === "due" ? "#fff3e0" : "#e8f5e9", border: `1px solid ${cs.type === "due" ? "#ffb74d" : "#a5d6a7"}`, color: cs.type === "due" ? "#e65100" : "#2e7d32" }}>
                                          {cs.label}
                                        </div>
                                      );
                                    })()}
                                    {sudahIsi && <div style={{ fontSize: 10, background: "#fff3e0", border: "1px solid #ffb74d", borderRadius: 20, padding: "2px 8px", color: "#e65100", fontWeight: 600 }}>✓ Sudah diisi</div>}
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

        {/* ══ STEP 2 — Input Per Varian ══ */}
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

            {/* Checkpoint warning */}
            {(() => {
              const cs = getCheckpointStatus(hstAktual);
              if (!cs) return null;
              return (
                <div style={{ marginBottom: 12, padding: "9px 14px", background: cs.type === "due" ? "#fff3e0" : "#e8f5e9", border: `1px solid ${cs.type === "due" ? "#ffb74d" : "#a5d6a7"}`, borderRadius: 10, fontSize: 12, color: cs.type === "due" ? "#e65100" : "#2e7d32", fontWeight: 600 }}>
                  {cs.label}
                </div>
              );
            })()}

            {/* Checkpoint selector */}
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

            {/* Progress */}
            <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>{filledCount}/{varianList.length} varian terisi</div>
            <div style={{ background: "#e0e0e0", borderRadius: 4, height: 5, marginBottom: 14, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 4, background: "#4CAF50", width: `${varianList.length > 0 ? (filledCount / varianList.length) * 100 : 0}%`, transition: "width 0.3s" }} />
            </div>

            {!isOnline && (
              <div style={{ marginBottom: 12, padding: "8px 12px", background: "#fff3e0", border: "1px solid #ffb74d", borderRadius: 9, display: "flex", alignItems: "center", gap: 8 }}>
                <span>📵</span>
                <span style={{ fontSize: 11, color: "#e65100" }}>Offline — data tersimpan lokal & dikirim otomatis saat online</span>
              </div>
            )}

            {/* List varian accordion */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {varianList.map((varian, i) => {
                const d      = varianData[varian] || {};
                const filled = isVarianFilled(d);
                const isOpen = activeVarian === varian;

                return (
                  <div key={varian} style={{ background: "#fff", borderRadius: 12, border: `1.5px solid ${filled ? "#a5d6a7" : "#e0e0e0"}`, overflow: "hidden" }}>
                    {/* Header varian */}
                    <button onClick={() => setActiveVarian(isOpen ? null : varian)}
                      style={{ width: "100%", padding: "12px 14px", background: filled ? "#f1f8e9" : "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: filled ? "#2e7d32" : "#333" }}>🌾 {varian}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {filled && <span style={{ fontSize: 14 }}>✅</span>}
                        {!filled && <span style={{ fontSize: 10, background: "#fff3e0", border: "1px solid #ffb74d", borderRadius: 20, padding: "2px 8px", color: "#e65100" }}>Belum lengkap</span>}
                        <span style={{ fontSize: 12, color: "#bbb", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
                      </div>
                    </button>

                    {/* Body varian */}
                    {isOpen && (
                      <div style={{ padding: "14px", borderTop: "1px solid #f0f0f0" }}>

                        {/* === ASPEK VIGOR === */}
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#388e3c", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>🌿 Aspek Vigor Tanaman</div>
                        <div style={{ fontSize: 10, color: "#888", marginBottom: 4 }}>Pendataan 14 tanaman per varian (7 depan + 7 belakang)</div>

                        {/* Lebar Daun */}
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: 12, color: "#555", marginBottom: 8, fontWeight: 600 }}>1. Lebar Daun (cm)</div>
                          <PilihOpsi options={LEBAR_DAUN_OPTIONS} value={d.lebarDaun} onChange={val => updateVarian(varian, "lebarDaun", val)} color="#2e7d32" />
                        </div>

                        {/* Diameter Batang */}
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: 12, color: "#555", marginBottom: 8, fontWeight: 600 }}>2. Diameter Batang</div>
                          <PilihOpsi options={DIAMETER_OPTIONS} value={d.diameterBatang} onChange={val => updateVarian(varian, "diameterBatang", val)} color="#1565C0" />
                        </div>

                        {/* Warna Daun */}
                        <div style={{ marginBottom: 18 }}>
                          <div style={{ fontSize: 12, color: "#555", marginBottom: 8, fontWeight: 600 }}>3. Warna Daun</div>
                          <PilihOpsi options={WARNA_DAUN_OPTIONS} value={d.warnaDaun} onChange={val => updateVarian(varian, "warnaDaun", val)} color="#f57f17" />
                        </div>

                        {/* === ASPEK PERAKARAN === */}
                        <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 14, marginBottom: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#795548", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>🪱 Aspek Perakaran</div>
                          <div style={{ fontSize: 10, color: "#888", marginBottom: 12 }}>Sampel 1 tanaman per varian, gali ±2 cm pada media tanam</div>
                        </div>

                        {/* Warna Akar */}
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: 12, color: "#555", marginBottom: 8, fontWeight: 600 }}>1. Warna Akar Serabut</div>
                          <PilihOpsi options={WARNA_AKAR_OPTIONS} value={d.warnaAkar} onChange={val => updateVarian(varian, "warnaAkar", val)} color="#795548" />
                        </div>

                        {/* Volume Akar */}
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ fontSize: 12, color: "#555", marginBottom: 8, fontWeight: 600 }}>2. Volume Akar</div>
                          <PilihOpsi options={VOLUME_AKAR_OPTIONS} value={d.volumeAkar} onChange={val => updateVarian(varian, "volumeAkar", val)} color="#795548" />
                        </div>
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

            {!allFilled && varianList.length > 0 && (
              <div style={{ fontSize: 12, color: "#e65100", background: "#fff3e0", border: "1px solid #ffb74d", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>
                ⚠️ {varianList.length - filledCount} varian belum lengkap — tap varian untuk mengisi
              </div>
            )}
            {submitError && (
              <div style={{ fontSize: 12, color: "#c62828", background: "#ffebee", border: "1px solid #ef9a9a", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>⚠️ {submitError}</div>
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
                : `${varianList.length} varian berhasil dikirim ke Google Sheets`}
            </div>
            <div style={{ background: savedOffline ? "#e3f2fd" : "#e8f5e9", border: `1px solid ${savedOffline ? "#90CAF9" : "#a5d6a7"}`, borderRadius: 14, padding: 16, textAlign: "left", marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#333" }}>{selectedGH} · P{ghInfo?.periode} · {hstAktual} HST</div>
              <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>Operator: {operator}</div>
              <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>{varianList.length} varian · {todayISO}</div>
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
            <button onClick={() => setConfirmOpen(true)} disabled={!canSubmit || submitting}
              style={{ flex: 2, padding: 13, border: "none", borderRadius: 12, background: canSubmit && !submitting ? (!isOnline ? "linear-gradient(135deg,#1565C0,#1976D2)" : "linear-gradient(135deg,#1b5e20,#2e7d32)") : "#e0e0e0", color: canSubmit && !submitting ? "#fff" : "#aaa", fontSize: 15, fontWeight: 700, cursor: canSubmit && !submitting ? "pointer" : "not-allowed" }}>
              {submitting ? "⏳ Menyimpan..."
                : !isOnline && canSubmit ? `💾 Simpan Offline`
                : `Submit ${varianList.length} Varian ✓`}
            </button>
          )}
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
          { label: "Tanggal",  value: todayISO },
          { label: "GH",       value: selectedGH },
          { label: "Varian",   value: `${varianList.length} varian` },
          { label: "Operator", value: operator },
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
