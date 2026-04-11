import { useState, useEffect, useCallback } from "react";
import { idbAdd, idbGetAll, idbDelete, idbCount, gasFetch } from "../utils/idb";

const DB_NAME = "PenyemprotanOfflineDB";

const SCRIPT_URL = import.meta.env.VITE_GAS_PENYEMPROTAN_URL;
const HST_MAKS = 65;

// ─── Mock data ────────────────────────────────────────────────────────────────
const MOCK_GH_DATA = {
  "COLOMADU 1": { periode: "3", tanam: "2026-01-15", varian: ["Servo F1", "Tombatu F1"] },
  "COLOMADU 2": { periode: "3", tanam: "2026-01-20", varian: ["Servo F1", "Inko F1"] },
  "COLOMADU 3": { periode: "2", tanam: "2025-12-10", varian: ["Tombatu F1"] },
  "COLOMADU 4": { periode: "4", tanam: "2026-02-01", varian: ["Servo F1", "Tombatu F1", "Inko F1"] },
  "COLOMADU 5": { periode: "1", tanam: "2025-10-01", varian: ["Inko F1"] },
};

// ─── Jenis perlakuan ──────────────────────────────────────────────────────────
const JENIS_OPTIONS = [
  { key: "insektisida", label: "Insektisida",  icon: "🐛", color: "#FF7043" },
  { key: "fungisida",   label: "Fungisida",    icon: "🍄", color: "#AB47BC" },
  { key: "akarisida",   label: "Akarisida",    icon: "🕷️", color: "#E53935" },
  { key: "pupuk_daun",  label: "Pupuk Daun",   icon: "🌿", color: "#43A047" },
  { key: "lainnya",     label: "Lainnya",      icon: "🧪", color: "#1E88E5" },
];

const todayLabel = new Date().toLocaleDateString("id-ID", {
  weekday: "long", day: "numeric", month: "long", year: "numeric",
});
const todayISO = new Date().toLocaleDateString("id-ID", {
  day: "2-digit", month: "2-digit", year: "numeric",
});

function hitungHST(tgl) {
  const [y, m, d] = tgl.split("-").map(Number);
  const tanam = new Date(y, m - 1, d);
  const now = new Date();
  const nowLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((nowLocal - tanam) / 86400000);
}

function hstColor(hst) {
  if (hst <= 30) return { bg: "rgba(76,175,80,0.15)",  border: "rgba(76,175,80,0.4)",  text: "#81c784" };
  if (hst <= 50) return { bg: "rgba(255,179,0,0.12)",  border: "rgba(255,179,0,0.35)", text: "#FFB300" };
  return           { bg: "rgba(229,57,53,0.12)",  border: "rgba(229,57,53,0.35)", text: "#ef9a9a" };
}

// ─── App utama ────────────────────────────────────────────────────────────────
export default function Penyemprotan() {
  const [step, setStep]             = useState(1);
  const [ghData, setGhData]         = useState({});
  const [loadingGH, setLoadingGH]   = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);

  const [selectedGH, setSelectedGH] = useState("");
  const [operator, setOperator]     = useState("");
  const [fotoPreview, setFotoPreview]     = useState(null);
  const [fotoFile, setFotoFile]           = useState(null);
  const [fotoUrl, setFotoUrl]             = useState("");
  const [fotoUploading, setFotoUploading] = useState(false);

  // Data form penyemprotan
  const [jenisKey, setJenisKey]       = useState("");
  const [namaProduk, setNamaProduk]   = useState("");
  const [dosis, setDosis]             = useState("");
  const [satuanDosis, setSatuanDosis] = useState("ml/L");
  const [volume, setVolume]           = useState("");
  const [targetOPT, setTargetOPT]     = useState("");
  const [keterangan, setKeterangan]   = useState("");

  const [syncing, setSyncing]           = useState(false);
  const [submitError, setSubmitError]   = useState(null);
  const [isOnline, setIsOnline]         = useState(navigator.onLine);

  const [pendingCount, setPendingCount]       = useState(0);
  const [savedOffline, setSavedOffline]       = useState(false);
  const [isSyncingPending, setIsSyncingPending] = useState(false);

  const [sessionKey] = useState(
    () => "sk_" + Date.now() + "_" + Math.random().toString(36).slice(2)
  );

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
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (isOnline) syncPendingData();
  }, [isOnline]);

  useEffect(() => { fetchGHData(); }, []);

  const fetchGHData = async () => {
    setLoadingGH(true);
    setIsDemoMode(false);
    try {
      const json = await gasFetch(`${SCRIPT_URL}?action=getGH`);
      if (json.success) {
        setGhData(json.data);
      } else {
        throw new Error("Response tidak sukses");
      }
    } catch {
      setIsDemoMode(true);
      setGhData(MOCK_GH_DATA);
    } finally {
      setLoadingGH(false);
    }
  };

  const syncPendingData = useCallback(async () => {
    const allPending = await idbGetAll(DB_NAME);
    if (allPending.length === 0) return;
    setIsSyncingPending(true);
    for (const record of allPending) {
      try {
        let resolvedFotoUrl = "";
        if (record.fotoBase64 && record.fotoFileName) {
          try {
            const uploadPayload = {
              action: "uploadFoto",
              fileName: record.fotoFileName,
              mimeType: record.fotoMimeType || "image/jpeg",
              base64Data: record.fotoBase64,
              sessionKey: record.sessionKey || sessionKey,
            };
            const res = await fetch(SCRIPT_URL, {
              method: "POST",
              headers: { "Content-Type": "text/plain" },
              body: JSON.stringify(uploadPayload),
              redirect: "follow",
            });
            const result = await res.json();
            resolvedFotoUrl = result.url || "";
          } catch { resolvedFotoUrl = ""; }
        }
        try {
          await fetch(SCRIPT_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({ ...record.payload, fotoUrl: resolvedFotoUrl }),
            redirect: "follow",
          });
          await idbDelete(DB_NAME, record.id);
        } catch { /* coba lagi nanti */ }
      } catch { /* skip */ }
    }
    await refreshPendingCount();
    setIsSyncingPending(false);
  }, [sessionKey, refreshPendingCount]);

  const ghAktif = Object.entries(ghData).filter(([, info]) => {
    if (!info.tanam) return true;
    return hitungHST(info.tanam) <= HST_MAKS;
  });
  const ghDisembunyikan = Object.keys(ghData).length - ghAktif.length;

  const ghInfo = ghData[selectedGH];
  const hst    = ghInfo?.tanam ? hitungHST(ghInfo.tanam) : null;

  const jenisObj = JENIS_OPTIONS.find(j => j.key === jenisKey);

  const canProceedStep2 =
    jenisKey.trim() !== "" &&
    namaProduk.trim() !== "" &&
    dosis.trim() !== "" &&
    volume.trim() !== "" &&
    operator.trim() !== "";

  const handleFoto = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFotoFile(file);
      setFotoUrl("");
      setFotoPreview(URL.createObjectURL(file));
    }
  };

  const uploadFoto = async (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target.result.split(",")[1];
        const payload = {
          action: "uploadFoto",
          fileName: `penyemprotan_${selectedGH}_${todayISO.replace(/\//g, "-")}_${Date.now()}.jpg`,
          mimeType: file.type || "image/jpeg",
          base64Data: base64,
          sessionKey,
        };
        try {
          const res = await fetch(SCRIPT_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify(payload),
            redirect: "follow",
          });
          const result = await res.json();
          resolve(result.url || "");
        } catch { resolve(""); }
      };
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });
  };

  const buildPayload = () => ({
    action: "submitPenyemprotan",
    tanggal: todayISO,
    gh: selectedGH,
    periode: ghInfo?.periode || "",
    hst: hst ?? "",
    jenis: jenisObj?.label || jenisKey,
    nama_produk: namaProduk,
    dosis: `${dosis} ${satuanDosis}`,
    volume_liter: volume,
    target_opt: targetOPT,
    keterangan,
    operator,
    fotoUrl: "",
  });

  const handleSubmit = async () => {
    setSyncing(true);
    setSubmitError(null);

    // ── Mode Demo ──
    if (isDemoMode) {
      await new Promise((r) => setTimeout(r, 800));
      setStep(4);
      setSyncing(false);
      return;
    }

    const payload = buildPayload();

    // ══ MODE OFFLINE ══════════════════════════════════════════════════════════
    if (!isOnline) {
      let fotoBase64 = null, fotoMimeType = null, fotoFileName = null;
      if (fotoFile) {
        await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => {
            fotoBase64 = ev.target.result.split(",")[1];
            fotoMimeType = fotoFile.type || "image/jpeg";
            fotoFileName = `penyemprotan_${selectedGH}_${todayISO.replace(/\//g, "-")}_${Date.now()}.jpg`;
            resolve();
          };
          reader.onerror = () => resolve();
          reader.readAsDataURL(fotoFile);
        });
      }
      try {
        await idbAdd(DB_NAME, {
          tanggal: todayISO, gh: selectedGH,
          createdAt: Date.now(),
          payload, fotoBase64, fotoMimeType, fotoFileName, sessionKey,
        });
        await refreshPendingCount();
        setSavedOffline(true);
      } catch {
        setSubmitError("Gagal menyimpan data offline. Coba lagi.");
        setSyncing(false);
        return;
      }
      setStep(4);
      setSyncing(false);
      return;
    }

    // ══ MODE ONLINE ═══════════════════════════════════════════════════════════
    setSavedOffline(false);
    let resolvedFotoUrl = fotoUrl;
    if (fotoFile && !fotoUrl) {
      setFotoUploading(true);
      resolvedFotoUrl = await uploadFoto(fotoFile);
      setFotoUrl(resolvedFotoUrl);
      setFotoUploading(false);
    }
    try {
      await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ ...payload, fotoUrl: resolvedFotoUrl || "" }),
        redirect: "follow",
      });
    } catch {
      setSubmitError("Gagal mengirim data, cek koneksi.");
      setSyncing(false);
      return;
    }
    setStep(4);
    setSyncing(false);
  };

  const resetForm = () => {
    setStep(1);
    setSelectedGH("");
    setOperator("");
    setFotoPreview(null); setFotoFile(null); setFotoUrl(""); setFotoUploading(false);
    setJenisKey(""); setNamaProduk(""); setDosis(""); setSatuanDosis("ml/L");
    setVolume(""); setTargetOPT(""); setKeterangan("");
    setSyncing(false); setSubmitError(null); setSavedOffline(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #0a1e2e 0%, #0d2d45 60%, #0a1a2e 100%)", fontFamily: "'DM Sans', 'Segoe UI', sans-serif", color: "#e3f2fd", display: "flex", flexDirection: "column", margin: "0 auto" }}>

      {/* ── Header ── */}
      <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.25)", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, color: "#64B5F6", letterSpacing: 2, textTransform: "uppercase", fontWeight: 600 }}>Form Penyemprotan Harian</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{todayLabel}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {pendingCount > 0 && (
              <button
                onClick={isOnline ? syncPendingData : undefined}
                title={isOnline ? "Klik untuk sync sekarang" : "Akan sync otomatis saat online"}
                style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                  background: isOnline ? "rgba(33,150,243,0.2)" : "rgba(255,179,0,0.15)",
                  border: `1px solid ${isOnline ? "rgba(33,150,243,0.5)" : "rgba(255,179,0,0.4)"}`,
                  borderRadius: 20, padding: "3px 9px",
                  color: isOnline ? "#64B5F6" : "#FFB300",
                  cursor: isOnline ? "pointer" : "default",
                  display: "flex", alignItems: "center", gap: 4,
                }}
              >
                {isSyncingPending ? "⏳" : "📤"} {pendingCount} pending
              </button>
            )}
            {isDemoMode && (
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, background: "rgba(255,179,0,0.15)", border: "1px solid rgba(255,179,0,0.4)", borderRadius: 20, padding: "3px 8px", color: "#FFB300" }}>DEMO</div>
            )}
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: isOnline ? "#4CAF50" : "#f44336", boxShadow: isOnline ? "0 0 8px #4CAF50" : "0 0 8px #f44336" }} />
          </div>
        </div>

        {!isOnline && (
          <div style={{ marginTop: 10, padding: "7px 12px", background: "rgba(244,67,54,0.1)", border: "1px solid rgba(244,67,54,0.25)", borderRadius: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14 }}>📵</span>
            <span style={{ fontSize: 11, color: "#ef9a9a" }}>Mode offline — data akan tersimpan lokal & sync otomatis saat online</span>
          </div>
        )}

        {step < 4 && (
          <div style={{ display: "flex", gap: 4, marginTop: 12 }}>
            {[1, 2, 3].map((s) => (
              <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: s <= step ? "#1E88E5" : "rgba(255,255,255,0.1)", transition: "background 0.3s" }} />
            ))}
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, padding: "20px 16px", overflowY: "auto" }}>

        {/* ══ STEP 1 — Pilih GH ══ */}
        {step === 1 && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px", color: "#fff" }}>Pilih Greenhouse</h2>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 16 }}>
              {isDemoMode ? "Mode demo aktif — server tidak terjangkau" : `GH aktif dengan HST ≤ ${HST_MAKS} hari`}
            </p>

            {isDemoMode && (
              <div style={{ background: "rgba(255,179,0,0.08)", border: "1px solid rgba(255,179,0,0.25)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>🔌</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: "#FFB300", fontWeight: 600 }}>Server tidak terjangkau</div>
                  <div style={{ fontSize: 11, color: "rgba(255,179,0,0.7)", marginTop: 2 }}>Pastikan Apps Script sudah di-deploy ulang dengan versi terbaru.</div>
                </div>
                <button onClick={fetchGHData} style={{ padding: "6px 12px", background: "rgba(255,179,0,0.15)", border: "1px solid rgba(255,179,0,0.35)", borderRadius: 8, color: "#FFB300", fontSize: 11, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>
                  Coba Lagi
                </button>
              </div>
            )}

            {loadingGH ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.4)" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🔄</div>
                <div style={{ fontSize: 13 }}>Memuat data GH...</div>
              </div>
            ) : (
              <>
                <label style={{ fontSize: 11, color: "#64B5F6", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600 }}>
                  Greenhouse Aktif ({ghAktif.length})
                </label>

                {ghAktif.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "32px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                    Tidak ada GH aktif (HST ≤ {HST_MAKS})
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10, marginBottom: 16 }}>
                    {ghAktif.map(([gh, info]) => {
                      const hstGH   = info.tanam ? hitungHST(info.tanam) : null;
                      const col     = hstGH !== null ? hstColor(hstGH) : hstColor(0);
                      const dipilih = selectedGH === gh;
                      return (
                        <button key={gh} onClick={() => setSelectedGH(gh)} style={{ padding: "10px 10px 8px", borderRadius: 12, cursor: "pointer", textAlign: "center", border: dipilih ? "2px solid #1E88E5" : "1px solid rgba(255,255,255,0.09)", background: dipilih ? "rgba(30,136,229,0.12)" : "rgba(255,255,255,0.03)", transition: "all 0.2s", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: dipilih ? "#64B5F6" : "#fff", lineHeight: 1.2 }}>{gh}</div>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>P{info.periode} · {info.varian?.length || 0} var</div>
                          {hstGH !== null && (
                            <div style={{ background: col.bg, border: `1px solid ${col.border}`, borderRadius: 8, padding: "4px 10px", textAlign: "center", width: "100%" }}>
                              <span style={{ fontSize: 16, fontWeight: 800, color: col.text }}>{hstGH}</span>
                              <span style={{ fontSize: 10, color: col.text, opacity: 0.8, marginLeft: 3 }}>HST</span>
                            </div>
                          )}
                          {dipilih && <div style={{ fontSize: 14 }}>✅</div>}
                        </button>
                      );
                    })}
                  </div>
                )}

                {ghDisembunyikan > 0 && (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textAlign: "center", marginTop: 4, fontStyle: "italic" }}>
                    + {ghDisembunyikan} GH disembunyikan (HST &gt; {HST_MAKS})
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ══ STEP 2 — Input data penyemprotan ══ */}
        {step === 2 && (
          <div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
              <div style={{ background: "rgba(30,136,229,0.2)", border: "1px solid rgba(30,136,229,0.4)", borderRadius: 20, padding: "3px 12px", fontSize: 12, color: "#64B5F6", fontWeight: 600 }}>{selectedGH}</div>
              <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 20, padding: "3px 12px", fontSize: 12, color: "rgba(255,255,255,0.6)" }}>Periode {ghInfo?.periode}</div>
              {hst !== null && (() => {
                const col = hstColor(hst);
                return <div style={{ background: col.bg, border: `1px solid ${col.border}`, borderRadius: 20, padding: "3px 12px", fontSize: 12, color: col.text, fontWeight: 700 }}>{hst} HST</div>;
              })()}
            </div>

            <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 16px", color: "#fff" }}>Data Penyemprotan</h2>

            {/* Jenis Perlakuan */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: "#64B5F6", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600 }}>
                Jenis Perlakuan <span style={{ color: "#ef9a9a" }}>*</span>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginTop: 8 }}>
                {JENIS_OPTIONS.map((j) => {
                  const active = jenisKey === j.key;
                  return (
                    <button key={j.key} onClick={() => setJenisKey(j.key)} style={{ padding: "10px 12px", borderRadius: 10, border: active ? `2px solid ${j.color}` : "1px solid rgba(255,255,255,0.09)", background: active ? `${j.color}22` : "rgba(255,255,255,0.03)", color: active ? j.color : "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: active ? 700 : 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, transition: "all 0.2s" }}>
                      <span style={{ fontSize: 18 }}>{j.icon}</span>
                      <span>{j.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Nama Produk */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: "#64B5F6", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600 }}>
                Nama Produk <span style={{ color: "#ef9a9a" }}>*</span>
              </label>
              <input
                type="text" value={namaProduk}
                onChange={(e) => setNamaProduk(e.target.value)}
                placeholder="Contoh: Previcur, Agrimec, Confidor..."
                style={{ width: "100%", marginTop: 8, padding: "12px 14px", background: "rgba(255,255,255,0.06)", border: `1px solid ${namaProduk.trim() ? "rgba(100,181,246,0.4)" : "rgba(255,255,255,0.12)"}`, borderRadius: 10, color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
              />
            </div>

            {/* Dosis + Volume */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 11, color: "#64B5F6", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600 }}>
                  Dosis <span style={{ color: "#ef9a9a" }}>*</span>
                </label>
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <input
                    type="number" inputMode="decimal" value={dosis}
                    onChange={(e) => setDosis(e.target.value)}
                    placeholder="0"
                    style={{ flex: 1, padding: "12px 10px", background: "rgba(255,255,255,0.06)", border: `1px solid ${dosis ? "rgba(100,181,246,0.4)" : "rgba(255,255,255,0.12)"}`, borderRadius: 10, color: "#fff", fontSize: 15, fontWeight: 700, outline: "none", textAlign: "center" }}
                  />
                  <select
                    value={satuanDosis} onChange={(e) => setSatuanDosis(e.target.value)}
                    style={{ width: 68, padding: "12px 4px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "rgba(255,255,255,0.7)", fontSize: 11, outline: "none", textAlign: "center", cursor: "pointer" }}
                  >
                    <option value="ml/L">ml/L</option>
                    <option value="g/L">g/L</option>
                    <option value="ml/tan">ml/tan</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, color: "#64B5F6", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600 }}>
                  Volume (L) <span style={{ color: "#ef9a9a" }}>*</span>
                </label>
                <input
                  type="number" inputMode="numeric" value={volume}
                  onChange={(e) => setVolume(e.target.value)}
                  placeholder="0"
                  style={{ width: "100%", marginTop: 8, padding: "12px 14px", background: "rgba(255,255,255,0.06)", border: `1px solid ${volume ? "rgba(100,181,246,0.4)" : "rgba(255,255,255,0.12)"}`, borderRadius: 10, color: "#fff", fontSize: 15, fontWeight: 700, outline: "none", textAlign: "center", boxSizing: "border-box" }}
                />
              </div>
            </div>

            {/* Target OPT */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: "#64B5F6", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600 }}>
                Target OPT / Tujuan
              </label>
              <input
                type="text" value={targetOPT}
                onChange={(e) => setTargetOPT(e.target.value)}
                placeholder="Contoh: Thrips, Downy Mildew, Pemupukan..."
                style={{ width: "100%", marginTop: 8, padding: "12px 14px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
              />
            </div>

            {/* Keterangan */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: "#64B5F6", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600 }}>
                Keterangan
              </label>
              <textarea
                value={keterangan}
                onChange={(e) => setKeterangan(e.target.value)}
                placeholder="Catatan tambahan (kondisi tanaman, cuaca, dll)..."
                rows={2}
                style={{ width: "100%", marginTop: 8, padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 8, color: "#fff", fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box", fontFamily: "inherit" }}
              />
            </div>

            {/* Foto */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: "#64B5F6", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600 }}>
                📸 Foto Dokumentasi {fotoPreview ? "✅" : "(opsional)"}
                {!isOnline && fotoPreview && <span style={{ color: "#FFB300", marginLeft: 6 }}>· disimpan lokal</span>}
              </label>
              <label style={{ display: "block", marginTop: 8, cursor: "pointer", overflow: "hidden", border: `2px dashed ${fotoPreview ? "rgba(30,136,229,0.5)" : "rgba(255,255,255,0.15)"}`, borderRadius: 12, padding: fotoPreview ? 0 : "20px 0", textAlign: "center", position: "relative" }}>
                {fotoPreview ? (
                  <>
                    <img src={fotoPreview} alt="preview" style={{ width: "100%", display: "block", borderRadius: 10 }} />
                    <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.6)", borderRadius: 8, padding: "4px 10px", fontSize: 11, color: "#64B5F6" }}>📷 Ganti foto</div>
                  </>
                ) : (
                  <div>
                    <div style={{ fontSize: 28 }}>📸</div>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>Foto dokumentasi penyemprotan</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 3 }}>
                      {isOnline ? "disimpan ke Drive" : "diupload otomatis saat online"}
                    </div>
                  </div>
                )}
                <input type="file" accept="image/*" capture="environment" onChange={handleFoto} style={{ display: "none" }} />
              </label>
            </div>

            {/* Operator */}
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: "#64B5F6", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600 }}>
                👤 Nama Operator <span style={{ color: "#ef9a9a" }}>*</span>
              </label>
              <input
                type="text" value={operator}
                onChange={(e) => setOperator(e.target.value)}
                placeholder="Tulis nama lengkap..."
                style={{ width: "100%", marginTop: 8, padding: "12px 14px", background: "rgba(255,255,255,0.06)", border: `1px solid ${operator.trim() ? "rgba(100,181,246,0.4)" : "rgba(255,255,255,0.12)"}`, borderRadius: 10, color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
              />
              {!operator.trim() && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 5 }}>Wajib diisi sebelum bisa lanjut</div>}
            </div>
          </div>
        )}

        {/* ══ STEP 3 — Konfirmasi ══ */}
        {step === 3 && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px", color: "#fff" }}>Konfirmasi Data</h2>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 18 }}>Periksa kembali sebelum submit</p>

            {isDemoMode && (
              <div style={{ background: "rgba(255,179,0,0.08)", border: "1px solid rgba(255,179,0,0.25)", borderRadius: 10, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
                <span>⚠️</span>
                <div style={{ fontSize: 12, color: "#FFB300" }}>Mode Demo — data tidak akan dikirim ke Sheets</div>
              </div>
            )}

            {!isOnline && (
              <div style={{ background: "rgba(255,179,0,0.08)", border: "1px solid rgba(255,179,0,0.25)", borderRadius: 10, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
                <span>📵</span>
                <div style={{ fontSize: 12, color: "#FFB300" }}>Offline — data akan disimpan lokal & dikirim otomatis saat koneksi kembali</div>
              </div>
            )}

            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
              {[
                { label: "Greenhouse",   value: selectedGH },
                { label: "Periode",      value: ghInfo?.periode },
                { label: "HST",          value: hst !== null ? `${hst} hari` : "-" },
                { label: "Tanggal",      value: todayISO },
                { label: "Jenis",        value: jenisObj ? `${jenisObj.icon} ${jenisObj.label}` : jenisKey },
                { label: "Nama Produk",  value: namaProduk },
                { label: "Dosis",        value: `${dosis} ${satuanDosis}` },
                { label: "Volume",       value: `${volume} Liter` },
                { label: "Target OPT",   value: targetOPT || "-" },
                { label: "Operator",     value: operator },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", padding: "11px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)", gap: 12 }}>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.38)", minWidth: 110 }}>{item.label}</span>
                  <span style={{ fontSize: 13, color: "#fff", fontWeight: 600, flex: 1 }}>{item.value}</span>
                </div>
              ))}
            </div>

            {keterangan ? (
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>Keterangan</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", fontStyle: "italic" }}>"{keterangan}"</div>
              </div>
            ) : null}

            {fotoPreview && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: "#64B5F6", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>
                  Foto {fotoUrl ? "✅ Tersimpan di Drive" : isOnline ? "📎 Siap diupload" : "📵 Tersimpan lokal"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <img src={fotoPreview} alt="foto" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8 }} />
                  {fotoUrl && (
                    <a href={fotoUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#64B5F6" }}>
                      Lihat di Drive →
                    </a>
                  )}
                </div>
              </div>
            )}

            {submitError && (
              <div style={{ padding: "12px", background: "rgba(244,67,54,0.1)", border: "1px solid rgba(244,67,54,0.3)", borderRadius: 10, fontSize: 13, color: "#ef9a9a", marginBottom: 12 }}>
                ⚠️ {submitError}
              </div>
            )}

            {syncing && (
              <div style={{ marginBottom: 12, fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
                {fotoUploading ? "⏳ Upload foto ke Drive..." : "⏳ Mengirim data..."}
              </div>
            )}
          </div>
        )}

        {/* ══ STEP 4 — Sukses ══ */}
        {step === 4 && (
          <div style={{ textAlign: "center", paddingTop: 40 }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>
              {isDemoMode ? "🧪" : savedOffline ? "💾" : "✅"}
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: isDemoMode ? "#FFB300" : savedOffline ? "#64B5F6" : "#1E88E5", margin: "0 0 8px" }}>
              {isDemoMode ? "Demo Selesai!" : savedOffline ? "Tersimpan Lokal!" : "Data Tersimpan!"}
            </h2>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", margin: "0 0 4px" }}>
              {isDemoMode
                ? "Data tidak dikirim (mode demo)"
                : savedOffline
                  ? "Data disimpan di perangkat. Akan otomatis terkirim ke Google Sheets saat online."
                  : "Data berhasil dikirim ke Google Sheets"}
            </p>

            {savedOffline && (
              <div style={{ background: "rgba(33,150,243,0.08)", border: "1px solid rgba(33,150,243,0.25)", borderRadius: 10, padding: "10px 14px", margin: "12px 0", textAlign: "left" }}>
                <div style={{ fontSize: 12, color: "#64B5F6", fontWeight: 600, marginBottom: 4 }}>📡 Cara sync:</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                  Biarkan app terbuka saat koneksi kembali — data akan terkirim otomatis.
                </div>
                {pendingCount > 0 && (
                  <div style={{ fontSize: 12, color: "#64B5F6", marginTop: 6 }}>{pendingCount} record menunggu sync.</div>
                )}
              </div>
            )}

            <div style={{ background: isDemoMode ? "rgba(255,179,0,0.08)" : savedOffline ? "rgba(33,150,243,0.08)" : "rgba(30,136,229,0.08)", border: `1px solid ${isDemoMode ? "rgba(255,179,0,0.3)" : savedOffline ? "rgba(33,150,243,0.3)" : "rgba(30,136,229,0.3)"}`, borderRadius: 12, padding: "14px 16px", margin: "20px 0", textAlign: "left" }}>
              <div style={{ fontSize: 12, color: isDemoMode ? "#FFB300" : savedOffline ? "#64B5F6" : "#64B5F6", marginBottom: 10, fontWeight: 600 }}>Ringkasan</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>{selectedGH} · Periode {ghInfo?.periode} · {hst} HST</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                {jenisObj?.icon} {jenisObj?.label || jenisKey} · {namaProduk}
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                Dosis: {dosis} {satuanDosis} · Volume: {volume} L
              </div>
              {targetOPT && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>Target: {targetOPT}</div>}
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>Operator: {operator}</div>
              {fotoUrl && (
                <a href={fotoUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginTop: 10, fontSize: 13, color: "#64B5F6" }}>
                  📎 Lihat foto di Drive →
                </a>
              )}
            </div>

            <button onClick={resetForm} style={{ width: "100%", padding: "16px", background: isDemoMode ? "rgba(255,179,0,0.15)" : savedOffline ? "rgba(33,150,243,0.15)" : "rgba(30,136,229,0.2)", border: `2px solid ${isDemoMode ? "rgba(255,179,0,0.4)" : savedOffline ? "rgba(33,150,243,0.4)" : "rgba(30,136,229,0.4)"}`, borderRadius: 12, color: isDemoMode ? "#FFB300" : savedOffline ? "#64B5F6" : "#64B5F6", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              + Input GH Berikutnya
            </button>
          </div>
        )}
      </div>

      {/* ── Bottom Nav ── */}
      {step < 4 && (
        <div style={{ padding: "12px 16px 20px", borderTop: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.3)", display: "flex", gap: 10 }}>
          {step > 1 && (
            <button onClick={() => setStep((s) => s - 1)} style={{ flex: 1, padding: "14px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              ← Kembali
            </button>
          )}
          {step < 3 && (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={step === 1 ? !selectedGH : !canProceedStep2}
              style={{ flex: 2, padding: "14px", border: "none", borderRadius: 12, background: (step === 1 ? selectedGH : canProceedStep2) ? "linear-gradient(135deg, #1565C0, #1E88E5)" : "rgba(255,255,255,0.06)", color: (step === 1 ? selectedGH : canProceedStep2) ? "#fff" : "rgba(255,255,255,0.3)", fontSize: 15, fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}
            >
              {step === 1 ? "Lanjut Input →" : "Review Data →"}
            </button>
          )}
          {step === 3 && (
            <button
              onClick={handleSubmit}
              disabled={syncing}
              style={{ flex: 2, padding: "14px", background: syncing ? "rgba(30,136,229,0.3)" : isDemoMode ? "linear-gradient(135deg, #5d4037, #795548)" : !isOnline ? "linear-gradient(135deg, #1565C0, #1976D2)" : "linear-gradient(135deg, #0d47a1, #1565C0)", border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 700, cursor: syncing ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              {syncing
                ? (fotoUploading ? "⏳ Upload foto..." : "⏳ Mengirim...")
                : isDemoMode
                  ? "Submit Demo 🧪"
                  : !isOnline
                    ? "💾 Simpan Offline"
                    : "Submit ✓"}
            </button>
          )}
        </div>
      )}

      <style>{`
        input[type=number]::-webkit-outer-spin-button,
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        select option { background: #1a2a3a; }
      `}</style>
    </div>
  );
}
