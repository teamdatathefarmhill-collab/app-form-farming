import { useState, useEffect, useCallback } from "react";
import { idbAdd, idbGetAll, idbDelete, idbCount } from "../utils/idb";
import { useGHData } from "../hooks/useGHData";
import ConfirmSubmitModal from "../components/ConfirmSubmitModal";
import FotoSelfie from "../components/FotoSelfie";

const DB_NAME = "SanitasiOfflineDB";

const SCRIPT_URL = import.meta.env.VITE_GAS_SANITASI_URL;
const HST_MAKS = 65;

const TIPE_GH = [
  {
    key: "drip", label: "Drip", icon: "💧", color: "#1E88E5",
    pattern: (gh) => {
      const upper = gh.toUpperCase();
      if (upper.startsWith("BERGAS")) { const n = parseInt(upper.replace("BERGAS","").trim()); return n >= 1 && n <= 8 && n !== 6; }
      if (upper.startsWith("COLOMADU")) { const n = parseInt(upper.replace("COLOMADU","").trim()); return n >= 1 && n <= 4; }
      if (upper.startsWith("TOHUDAN")) { const n = parseInt(upper.replace("TOHUDAN","").trim()); return n === 12; }
      return false;
    },
  },
  {
    key: "kolam", label: "Kolam", icon: "🏊", color: "#00897B",
    pattern: (gh) => {
      const upper = gh.toUpperCase();
      if (upper.startsWith("TOHUDAN")) { const n = parseInt(upper.replace("TOHUDAN","").trim()); return (n >= 1 && n <= 11) || n === 13 || n === 22; }
      if (upper.startsWith("SAWAHAN")) { const n = parseInt(upper.replace("SAWAHAN","").trim()); return n >= 1 && n <= 4; }
      return false;
    },
  },
  {
    key: "dutch", label: "Dutch Bucket", icon: "🪣", color: "#FB8C00",
    pattern: (gh) => {
      const upper = gh.toUpperCase();
      if (upper.startsWith("TOHUDAN")) { const n = parseInt(upper.replace("TOHUDAN","").trim()); return n === 14 || (n >= 15 && n <= 21); }
      return false;
    },
  },
];

// ─── Kategori sanitasi ────────────────────────────────────────────────────────
const KATEGORI = [
  { key: "fisik",    label: "Fisik",    icon: "🌿", color: "#4CAF50", subkategori: ["Patah Tangkai", "Tanpa Pucuk"] },
  { key: "hama",     label: "Hama",     icon: "🐛", color: "#FF7043", subkategori: [] },
  { key: "keriting", label: "Keriting", icon: "🍃", color: "#FFB300", subkategori: [] },
  { key: "mozaik",   label: "Mozaik",   icon: "🦠", color: "#AB47BC", subkategori: [] },
  { key: "dm",       label: "DM",       icon: "💧", color: "#1E88E5", subkategori: [] },
  { key: "gsb",      label: "GSB",      icon: "⚠️", color: "#E53935", subkategori: [] },
  { key: "semai",    label: "Semai",    icon: "🌱", color: "#00897B", subkategori: ["Busuk Pangkal Batang", "Layu", "Stunting"] },
  { key: "buah",     label: "Buah",     icon: "🍅", color: "#F4511E", subkategori: ["Buah Tidak Produktif", "Crack", "Buah Cacar/Peyang"] },
];

const todayLabel = new Date().toLocaleDateString("id-ID", {
  weekday: "long", day: "numeric", month: "long", year: "numeric",
});
const todayISO = new Date().toLocaleDateString("id-ID", {
  day: "2-digit", month: "2-digit", year: "numeric",
});

function hitungHST(tgl) {
  // Parse manual agar tidak kena masalah UTC
  const [y, m, d] = tgl.split("-").map(Number);
  const tanam = new Date(y, m - 1, d); // local time, bukan UTC
  const now = new Date();
  const nowLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((nowLocal - tanam) / 86400000);
}

function totalPerVarian(d = {}) {
  return KATEGORI.reduce((s, k) => s + (parseInt(d[k.key]) || 0), 0);
}

function initVarianData(varianList) {
  const obj = {};
  varianList.forEach((v) => {
    obj[v] = { fisik: "", hama: "", keriting: "", mozaik: "", dm: "", gsb: "", semai: "", buah: "", keterangan: "", sub: {} };
  });
  return obj;
}

function hstColor(hst) {
  if (hst <= 30) return { bg: "rgba(76,175,80,0.15)",  border: "rgba(76,175,80,0.4)",  text: "#81c784" };
  if (hst <= 50) return { bg: "rgba(255,179,0,0.12)",  border: "rgba(255,179,0,0.35)", text: "#FFB300" };
  return           { bg: "rgba(229,57,53,0.12)",  border: "rgba(229,57,53,0.35)", text: "#ef9a9a" };
}

// ─── Komponen: Block input satu varian ───────────────────────────────────────
function VarianBlock({ varian, data, onChange }) {
  const total = totalPerVarian(data);
  const needsKet = total === 0 || total > 50;

  const handleNum = (key, val) => {
    if (val === "" || /^\d+$/.test(val)) onChange(key, val);
  };

  const handleSub = (katKey, subLabel, val) => {
    if (val === "" || /^\d+$/.test(val)) {
      const newSub = { ...(data.sub || {}), [`${katKey}_${subLabel}`]: val };
      onChange("sub", newSub);
    }
  };

  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 14, overflow: "hidden", marginBottom: 14 }}>
      {/* Header */}
      <div style={{ padding: "10px 14px", background: "rgba(76,175,80,0.08)", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#81c784" }}>🌾 {varian}</span>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: total > 0 ? "#4CAF50" : "rgba(255,255,255,0.18)", lineHeight: 1 }}>{total || 0}</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>total</div>
        </div>
      </div>

      {/* Grid angka */}
      <div style={{ padding: "12px 14px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 12 }}>
          {KATEGORI.map((k) => (
            <div key={k.key}>
              <div style={{ background: data[k.key] > 0 ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.025)", border: `1px solid ${data[k.key] > 0 ? k.color + "55" : "rgba(255,255,255,0.07)"}`, borderRadius: data[k.key] > 0 && k.subkategori.length > 0 ? "9px 9px 0 0" : 9, padding: "7px 10px", display: "flex", alignItems: "center", gap: 7, transition: "all 0.2s" }}>
                <span style={{ fontSize: 15 }}>{k.icon}</span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", flex: 1 }}>{k.label}</span>
                <input
                  type="number" inputMode="numeric"
                  value={data[k.key] || ""}
                  onChange={(e) => handleNum(k.key, e.target.value)}
                  placeholder="0"
                  style={{ width: 46, height: 32, textAlign: "center", background: "rgba(0,0,0,0.3)", border: `1px solid ${data[k.key] > 0 ? k.color : "rgba(255,255,255,0.12)"}`, borderRadius: 7, color: data[k.key] > 0 ? k.color : "#fff", fontSize: 15, fontWeight: 700, outline: "none" }}
                />
              </div>

              {k.subkategori.length > 0 && data[k.key] > 0 && (
                <div style={{ background: "rgba(0,0,0,0.2)", border: `1px solid ${k.color}33`, borderTop: "none", borderRadius: "0 0 9px 9px", padding: "8px 10px 10px" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 7, textTransform: "uppercase", letterSpacing: 1 }}>Rincian</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {k.subkategori.map((sub) => {
                      const subKey = `${k.key}_${sub}`;
                      const subVal = (data.sub || {})[subKey] || "";
                      return (
                        <div key={sub} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", flex: 1, lineHeight: 1.3 }}>↳ {sub}</span>
                          <input
                            type="number" inputMode="numeric"
                            value={subVal}
                            onChange={(e) => handleSub(k.key, sub, e.target.value)}
                            placeholder="0"
                            style={{ width: 44, height: 28, textAlign: "center", background: "rgba(0,0,0,0.3)", border: `1px solid ${subVal > 0 ? k.color : "rgba(255,255,255,0.12)"}`, borderRadius: 6, color: subVal > 0 ? k.color : "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: 600, outline: "none" }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Keterangan */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: needsKet ? "#FFB300" : "rgba(255,255,255,0.3)" }}>
            {needsKet ? "⚠️ Keterangan (wajib)" : "Keterangan (opsional)"}
          </label>
          {needsKet && (
            <div style={{ marginTop: 5, padding: "6px 10px", fontSize: 11, color: "#FFB300", background: "rgba(255,179,0,0.07)", border: "1px solid rgba(255,179,0,0.2)", borderRadius: 7 }}>
              {total === 0 ? "Tidak ada sanitasi hari ini, jelaskan alasannya" : "Sanitasi tinggi, jelaskan penyebabnya"}
            </div>
          )}
          <textarea
            value={data.keterangan || ""}
            onChange={(e) => onChange("keterangan", e.target.value)}
            placeholder="Catatan untuk varian ini..."
            rows={2}
            style={{ width: "100%", marginTop: 6, padding: "9px 12px", background: "rgba(255,255,255,0.05)", border: `1px solid ${needsKet && !data.keterangan ? "rgba(255,179,0,0.45)" : "rgba(255,255,255,0.09)"}`, borderRadius: 8, color: "#fff", fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box", fontFamily: "inherit" }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── App utama ────────────────────────────────────────────────────────────────
export default function Sanitasi() {
  const [step, setStep] = useState(1);

  const { ghData, loading: loadingGH, isDemoMode } = useGHData();

  const [selectedGH, setSelectedGH]     = useState("");
  const [selectedTipe, setSelectedTipe] = useState("");
  const [varianData, setVarianData]     = useState({});
  const [operator, setOperator]         = useState("");
  const [fotoPreview, setFotoPreview]   = useState(null);
  const [fotoFile, setFotoFile]         = useState(null);
  const [fotoUrl, setFotoUrl]           = useState("");
  const [fotoUploading, setFotoUploading] = useState(false);

  const [selfieFile, setSelfieFile]     = useState(null);
  const [selfiePreview, setSelfiePreview] = useState(null);
  const [selfieUrl, setSelfieUrl]       = useState("");

  const [syncing, setSyncing]           = useState(false);
  const [syncProgress, setSyncProgress] = useState({ done: 0, total: 0 });
  const [submitError, setSubmitError]   = useState(null);
  const [isOnline, setIsOnline]         = useState(navigator.onLine);
  const [confirmOpen, setConfirmOpen]   = useState(false);

  // ── State offline ──
  const [pendingCount, setPendingCount] = useState(0);
  const [savedOffline, setSavedOffline] = useState(false);
  const [isSyncingPending, setIsSyncingPending] = useState(false);

  const [sessionKey] = useState(
    () => "sk_" + Date.now() + "_" + Math.random().toString(36).slice(2)
  );

  // ── Load pending count dari IndexedDB ──
  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await idbCount(DB_NAME);
      setPendingCount(count);
    } catch {
      setPendingCount(0);
    }
  }, []);

  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  // ── Online/offline listener ──
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

  // ── Auto-sync saat kembali online ──
  useEffect(() => {
    if (isOnline) {
      syncPendingData();
    }
  }, [isOnline]);

  // ── Sync semua data pending ke GAS ──
  const syncPendingData = useCallback(async () => {
    const allPending = await idbGetAll(DB_NAME);
    if (allPending.length === 0) return;

    setIsSyncingPending(true);

    for (const record of allPending) {
      try {
        // Upload foto jika ada (disimpan sebagai base64 saat offline)
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
          } catch {
            resolvedFotoUrl = "";
          }
        }

        // Kirim semua payload per varian
        let allSuccess = true;
        for (const payload of record.payloads) {
          try {
            await fetch(SCRIPT_URL, {
              method: "POST",
              headers: { "Content-Type": "text/plain" },
              body: JSON.stringify({ ...payload, fotoUrl: resolvedFotoUrl }),
              redirect: "follow",
            });
          } catch {
            allSuccess = false;
            break;
          }
        }

        if (allSuccess) {
          await idbDelete(DB_NAME, record.id);
        }
      } catch {
        // Skip record ini, coba lagi nanti
      }
    }

    await refreshPendingCount();
    setIsSyncingPending(false);
  }, [sessionKey, refreshPendingCount]);

  const ghAktif = Object.entries(ghData).filter(([, info]) => {
    if (!info.tanam) return true;
    return hitungHST(info.tanam) <= HST_MAKS;
  });
  const ghDisembunyikan = Object.keys(ghData).length - ghAktif.length;

  const handleSelectGH = (gh) => {
    setSelectedGH(gh);
    setVarianData(initVarianData(ghData[gh]?.varian || []));
  };

  const handleVarianChange = (varian, field, val) => {
    setVarianData((prev) => ({ ...prev, [varian]: { ...prev[varian], [field]: val } }));
  };

  const ghInfo     = ghData[selectedGH];
  const varianList = ghInfo?.varian || [];
  const hst        = ghInfo?.tanam ? hitungHST(ghInfo.tanam) : null;

  const allVarianValid = varianList.every((v) => {
    const d = varianData[v] || {};
    const total = totalPerVarian(d);
    const needsKet = total === 0 || total > 50;
    return !needsKet || (d.keterangan || "").trim().length > 0;
  });
  const canProceedStep2  = allVarianValid && operator.trim().length > 0;
  const totalSemuaVarian = varianList.reduce((s, v) => s + totalPerVarian(varianData[v] || {}), 0);

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
          fileName: `sanitasi_${selectedGH}_${todayISO.replace(/\//g, "-")}_${Date.now()}.jpg`,
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
        } catch {
          resolve("");
        }
      };
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });
  };

  // ── Buat array payload per varian (dipakai saat online dan offline) ──
  const buildPayloads = () => {
    const client_timestamp = new Date().toISOString();
    return varianList.map((varian) => {
      const d = varianData[varian] || {};
      const subKetArr = [];
      KATEGORI.forEach((k) => {
        if (k.subkategori.length > 0 && parseInt(d[k.key]) > 0) {
          k.subkategori.forEach((sub) => {
            const subVal = (d.sub || {})[`${k.key}_${sub}`];
            if (parseInt(subVal) > 0) subKetArr.push(`${k.label}-${sub}: ${subVal}`);
          });
        }
      });
      const keteranganFinal = [d.keterangan, ...subKetArr].filter(Boolean).join(" | ");
      return {
        action: "submitSanitasi",
        client_timestamp,
        tanggal: todayISO,
        gh: selectedGH,
        periode: ghInfo?.periode || "",
        hst: hst ?? "",
        varian,
        fisik:     d.fisik     || 0,
        hama:      d.hama      || 0,
        keriting:  d.keriting  || 0,
        mozaik:    d.mozaik    || 0,
        dm:        d.dm        || 0,
        gsb:       d.gsb       || 0,
        semai:     d.semai     || 0,
        buah:      d.buah      || 0,
        keterangan: keteranganFinal,
        fotoUrl: "",
        operator: operator || "",
      };
    });
  };

  const handleSubmit = async () => {
    setSyncing(true);
    setSubmitError(null);
    setSyncProgress({ done: 0, total: varianList.length });

    // ── Mode Demo ──
    if (isDemoMode) {
      for (let i = 0; i < varianList.length; i++) {
        await new Promise((r) => setTimeout(r, 700));
        setSyncProgress({ done: i + 1, total: varianList.length });
      }
      setStep(4);
      setSyncing(false);
      return;
    }

    const payloads = buildPayloads();

    // ══ MODE OFFLINE ══════════════════════════════════════════════════════════
    if (!isOnline) {
      // Baca foto sebagai base64 untuk disimpan lokal
      let fotoBase64 = null;
      let fotoMimeType = null;
      let fotoFileName = null;

      if (fotoFile) {
        await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => {
            fotoBase64 = ev.target.result.split(",")[1];
            fotoMimeType = fotoFile.type || "image/jpeg";
            fotoFileName = `sanitasi_${selectedGH}_${todayISO.replace(/\//g, "-")}_${Date.now()}.jpg`;
            resolve();
          };
          reader.onerror = () => resolve();
          reader.readAsDataURL(fotoFile);
        });
      }

      try {
        await idbAdd(DB_NAME, {
          tanggal: todayISO,
          gh: selectedGH,
          createdAt: Date.now(),
          payloads,
          fotoBase64,
          fotoMimeType,
          fotoFileName,
          sessionKey,
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

    // Upload foto papan dulu
    let resolvedFotoUrl = fotoUrl;
    if (fotoFile && !fotoUrl) {
      setFotoUploading(true);
      resolvedFotoUrl = await uploadFoto(fotoFile);
      setFotoUrl(resolvedFotoUrl);
      setFotoUploading(false);
    }

    // Upload selfie operator
    let resolvedSelfieUrl = selfieUrl;
    if (selfieFile && !selfieUrl) {
      const selfiePayload = {
        action: "uploadFoto",
        fileName: `${operator.trim().replace(/\s+/g, "_")}_${todayISO.replace(/\//g, "-")}.jpg`,
        mimeType: selfieFile.type || "image/jpeg",
        base64Data: await new Promise((res) => {
          const reader = new FileReader();
          reader.onload = (ev) => res(ev.target.result.split(",")[1]);
          reader.readAsDataURL(selfieFile);
        }),
        sessionKey: sessionKey + "_selfie",
      };
      try {
        const r = await fetch(SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(selfiePayload), redirect: "follow" });
        const result = await r.json();
        resolvedSelfieUrl = result.url || "";
        setSelfieUrl(resolvedSelfieUrl);
      } catch { resolvedSelfieUrl = ""; }
    }

    let done = 0;
    for (const payload of payloads) {
      try {
        await fetch(SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({ ...payload, fotoUrl: resolvedFotoUrl || "", selfieUrl: resolvedSelfieUrl || "" }),
          redirect: "follow",
        });
        done++;
        setSyncProgress({ done, total: varianList.length });
      } catch {
        setSubmitError(`Gagal mengirim varian ${payload.varian}, cek koneksi`);
        setSyncing(false);
        return;
      }
    }

    setStep(4);
    setSyncing(false);
  };

  const resetForm = () => {
    setStep(1);
    setSelectedGH("");
    setSelectedTipe("");
    setVarianData({});
    setOperator("");
    setFotoPreview(null);
    setFotoFile(null);
    setFotoUrl("");
    setFotoUploading(false);
    setSelfieFile(null);
    setSelfiePreview(null);
    setSelfieUrl("");
    setSyncing(false);
    setSyncProgress({ done: 0, total: 0 });
    setSubmitError(null);
    setSavedOffline(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #0a2e1a 0%, #1a4a2a 60%, #0d3320 100%)", fontFamily: "'DM Sans', 'Segoe UI', sans-serif", color: "#e8f5e9", display: "flex", flexDirection: "column", margin: "0 auto" }}>

      {/* ── Header ── */}
      <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.25)", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, color: "#81c784", letterSpacing: 2, textTransform: "uppercase", fontWeight: 600 }}>Form Sanitasi Harian</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{todayLabel}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Badge pending offline */}
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
            {/* Dot online/offline */}
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: isOnline ? "#4CAF50" : "#f44336", boxShadow: isOnline ? "0 0 8px #4CAF50" : "0 0 8px #f44336" }} />
          </div>
        </div>

        {/* Banner offline */}
        {!isOnline && (
          <div style={{ marginTop: 10, padding: "7px 12px", background: "rgba(244,67,54,0.1)", border: "1px solid rgba(244,67,54,0.25)", borderRadius: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14 }}>📵</span>
            <span style={{ fontSize: 11, color: "#ef9a9a" }}>Mode offline — data akan tersimpan lokal & sync otomatis saat online</span>
          </div>
        )}

        {step < 4 && (
          <div style={{ display: "flex", gap: 4, marginTop: 12 }}>
            {[1, 2, 3].map((s) => (
              <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: s <= step ? "#4CAF50" : "rgba(255,255,255,0.1)", transition: "background 0.3s" }} />
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
            ) : ghAktif.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                Tidak ada GH aktif (HST ≤ {HST_MAKS})
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {TIPE_GH.map(tipe => {
                  const ghDiTipe = ghAktif.filter(([gh]) => tipe.pattern(gh));
                  const isOpen   = selectedTipe === tipe.key;
                  return (
                    <div key={tipe.key} style={{ border: `1.5px solid ${isOpen ? tipe.color + "55" : "rgba(255,255,255,0.1)"}`, borderRadius: 14, overflow: "hidden" }}>
                      <button onClick={() => setSelectedTipe(isOpen ? "" : tipe.key)}
                        style={{ width: "100%", padding: "13px 16px", background: isOpen ? `${tipe.color}15` : "rgba(255,255,255,0.03)", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 20 }}>{tipe.icon}</span>
                          <div style={{ textAlign: "left" }}>
                            <div style={{ fontSize: 14, fontWeight: 800, color: isOpen ? tipe.color : "#fff" }}>{tipe.label}</div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>{ghDiTipe.length} GH aktif</div>
                          </div>
                        </div>
                        <span style={{ fontSize: 14, color: "rgba(255,255,255,0.3)", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>▼</span>
                      </button>

                      {isOpen && (
                        <div style={{ padding: "10px 12px 14px", borderTop: `1px solid ${tipe.color}22` }}>
                          {ghDiTipe.length === 0 ? (
                            <div style={{ textAlign: "center", padding: 20, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Tidak ada GH aktif di tipe ini.</div>
                          ) : (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                              {ghDiTipe.map(([gh, info]) => {
                                const hstGH   = info.tanam ? hitungHST(info.tanam) : null;
                                const col     = hstGH !== null ? hstColor(hstGH) : hstColor(0);
                                const dipilih = selectedGH === gh;
                                return (
                                  <button key={gh} onClick={() => handleSelectGH(gh)} style={{ padding: "10px 10px 8px", borderRadius: 12, cursor: "pointer", textAlign: "center", border: dipilih ? `2px solid ${tipe.color}` : "1px solid rgba(255,255,255,0.09)", background: dipilih ? `${tipe.color}18` : "rgba(255,255,255,0.03)", transition: "all 0.2s", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: dipilih ? tipe.color : "#fff", lineHeight: 1.2 }}>{gh}</div>
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
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ STEP 2 — Input semua varian ══ */}
        {step === 2 && (
          <div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
              <div style={{ background: "rgba(76,175,80,0.2)", border: "1px solid rgba(76,175,80,0.4)", borderRadius: 20, padding: "3px 12px", fontSize: 12, color: "#81c784", fontWeight: 600 }}>{selectedGH}</div>
              <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 20, padding: "3px 12px", fontSize: 12, color: "rgba(255,255,255,0.6)" }}>Periode {ghInfo?.periode}</div>
              {hst !== null && (() => {
                const col = hstColor(hst);
                return <div style={{ background: col.bg, border: `1px solid ${col.border}`, borderRadius: 20, padding: "3px 12px", fontSize: 12, color: col.text, fontWeight: 700 }}>{hst} HST</div>;
              })()}
            </div>

            <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px", color: "#fff" }}>Input Sanitasi</h2>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 16 }}>Isi data untuk semua {varianList.length} varian sekaligus.</p>

            {varianList.map((v) => (
              <VarianBlock
                key={v}
                varian={v}
                data={varianData[v] || {}}
                onChange={(field, val) => handleVarianChange(v, field, val)}
              />
            ))}

            <div style={{ background: totalSemuaVarian > 0 ? "rgba(76,175,80,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${totalSemuaVarian > 0 ? "rgba(76,175,80,0.25)" : "rgba(255,255,255,0.07)"}`, borderRadius: 12, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Total seluruh varian</span>
              <span style={{ fontSize: 26, fontWeight: 800, color: totalSemuaVarian > 0 ? "#4CAF50" : "rgba(255,255,255,0.2)" }}>{totalSemuaVarian}</span>
            </div>

            {/* Foto */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: "#81c784", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600 }}>
                📸 Foto Papan {fotoPreview ? "✅" : "(opsional)"}
                {!isOnline && fotoPreview && <span style={{ color: "#FFB300", marginLeft: 6 }}>· disimpan lokal</span>}
              </label>
              <label style={{ display: "block", marginTop: 8, cursor: "pointer", overflow: "hidden", border: `2px dashed ${fotoPreview ? "rgba(76,175,80,0.5)" : "rgba(255,255,255,0.15)"}`, borderRadius: 12, padding: fotoPreview ? 0 : "20px 0", textAlign: "center", position: "relative" }}>
                {fotoPreview ? (
                  <>
                    <img src={fotoPreview} alt="preview" style={{ width: "100%", display: "block", borderRadius: 10 }} />
                    <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.6)", borderRadius: 8, padding: "4px 10px", fontSize: 11, color: "#81c784" }}>📷 Ganti foto</div>
                  </>
                ) : (
                  <div>
                    <div style={{ fontSize: 28 }}>📸</div>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>Ambil foto papan whiteboard</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 3 }}>
                      {isOnline ? "1 foto untuk seluruh GH · disimpan ke Drive" : "1 foto untuk seluruh GH · diupload otomatis saat online"}
                    </div>
                  </div>
                )}
                <input type="file" accept="image/*" capture="environment" onChange={handleFoto} style={{ display: "none" }} />
              </label>
            </div>

            {/* Operator */}
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: "#81c784", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600 }}>
                👤 Nama Operator <span style={{ color: "#ef9a9a" }}>*</span>
              </label>
              <input
                type="text" value={operator}
                onChange={(e) => setOperator(e.target.value)}
                placeholder="Tulis nama lengkap..."
                style={{ width: "100%", marginTop: 8, padding: "12px 14px", background: "rgba(255,255,255,0.06)", border: `1px solid ${operator.trim() ? "rgba(129,199,132,0.4)" : "rgba(255,255,255,0.12)"}`, borderRadius: 10, color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
              />
              {!operator.trim() && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 5 }}>Wajib diisi sebelum bisa lanjut</div>}
            </div>

            {/* Selfie Operator */}
            <FotoSelfie
              fotoFile={selfieFile}
              fotoPreview={selfiePreview}
              onChange={(file, preview) => { setSelfieFile(file); setSelfiePreview(preview); setSelfieUrl(""); }}
              onClear={() => { setSelfieFile(null); setSelfiePreview(null); setSelfieUrl(""); }}
              isOffline={!isOnline}
              darkMode={true}
            />
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

            {/* Banner offline di step 3 */}
            {!isOnline && (
              <div style={{ background: "rgba(255,179,0,0.08)", border: "1px solid rgba(255,179,0,0.25)", borderRadius: 10, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
                <span>📵</span>
                <div style={{ fontSize: 12, color: "#FFB300" }}>Offline — data akan disimpan lokal & dikirim otomatis saat koneksi kembali</div>
              </div>
            )}

            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
              {[
                { label: "Greenhouse",     value: selectedGH },
                { label: "Periode",        value: ghInfo?.periode },
                { label: "HST",            value: hst !== null ? `${hst} hari` : "-" },
                { label: "Tanggal",        value: todayISO },
                { label: "Operator",       value: operator },
                { label: "Total Sanitasi", value: `${totalSemuaVarian} tanaman (${varianList.length} varian)` },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", padding: "11px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)", gap: 12 }}>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.38)", minWidth: 110 }}>{item.label}</span>
                  <span style={{ fontSize: 13, color: "#fff", fontWeight: 600, flex: 1 }}>{item.value}</span>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 11, color: "#81c784", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600, marginBottom: 10 }}>Detail per Varian</div>
            {varianList.map((v) => {
              const d     = varianData[v] || {};
              const total = totalPerVarian(d);
              const aktif = KATEGORI.filter((k) => parseInt(d[k.key]) > 0);
              return (
                <div key={v} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 14px", marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: aktif.length > 0 ? 8 : 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#81c784" }}>🌾 {v}</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: total > 0 ? "#4CAF50" : "rgba(255,255,255,0.25)" }}>{total}</span>
                  </div>
                  {aktif.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: d.keterangan ? 8 : 0 }}>
                      {aktif.map((k) => {
                        const subAktif = k.subkategori.filter((sub) => parseInt((d.sub || {})[`${k.key}_${sub}`]) > 0);
                        return (
                          <div key={k.key}>
                            <span style={{ fontSize: 12, background: k.color + "22", border: `1px solid ${k.color}44`, borderRadius: 6, padding: "2px 8px", color: k.color }}>
                              {k.icon} {k.label}: {d[k.key]}
                            </span>
                            {subAktif.map((sub) => (
                              <span key={sub} style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginLeft: 8 }}>
                                ↳ {sub}: {(d.sub || {})[`${k.key}_${sub}`]}
                              </span>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {d.keterangan ? (
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", fontStyle: "italic" }}>
                      "{d.keterangan}"
                    </div>
                  ) : null}
                </div>
              );
            })}

            {fotoPreview && (
              <div style={{ marginBottom: 14, marginTop: 6 }}>
                <div style={{ fontSize: 11, color: "#81c784", letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>
                  Foto {fotoUrl ? "✅ Tersimpan di Drive" : isOnline ? "📎 Siap diupload" : "📵 Tersimpan lokal (upload otomatis)"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <img src={fotoPreview} alt="foto" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8 }} />
                  {fotoUrl && (
                    <a href={fotoUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#81c784" }}>
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
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>
                  {fotoUploading
                    ? "⏳ Upload foto ke Drive..."
                    : `Menyimpan ${syncProgress.done}/${syncProgress.total} varian...`}
                </div>
                <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 4, overflow: "hidden", height: 6 }}>
                  <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg, #2e7d32, #4CAF50)", width: `${syncProgress.total > 0 ? (syncProgress.done / syncProgress.total) * 100 : 0}%`, transition: "width 0.4s ease" }} />
                </div>
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
            <h2 style={{ fontSize: 22, fontWeight: 800, color: isDemoMode ? "#FFB300" : savedOffline ? "#64B5F6" : "#4CAF50", margin: "0 0 8px" }}>
              {isDemoMode ? "Demo Selesai!" : savedOffline ? "Tersimpan Lokal!" : "Data Tersimpan!"}
            </h2>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", margin: "0 0 4px" }}>
              {isDemoMode
                ? "Data tidak dikirim (mode demo)"
                : savedOffline
                  ? "Data disimpan di perangkat. Akan otomatis terkirim ke Google Sheets saat online."
                  : `${varianList.length} baris berhasil dikirim ke Google Sheets`}
            </p>

            {/* Info pending saat offline */}
            {savedOffline && (
              <div style={{ background: "rgba(33,150,243,0.08)", border: "1px solid rgba(33,150,243,0.25)", borderRadius: 10, padding: "10px 14px", margin: "12px 0", textAlign: "left" }}>
                <div style={{ fontSize: 12, color: "#64B5F6", fontWeight: 600, marginBottom: 4 }}>📡 Cara sync:</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                  Biarkan app terbuka saat koneksi kembali — data akan terkirim otomatis. Atau klik badge "pending" di header.
                </div>
                {pendingCount > 0 && (
                  <div style={{ fontSize: 12, color: "#64B5F6", marginTop: 6 }}>{pendingCount} record menunggu sync.</div>
                )}
              </div>
            )}

            <div style={{ background: isDemoMode ? "rgba(255,179,0,0.08)" : savedOffline ? "rgba(33,150,243,0.08)" : "rgba(76,175,80,0.1)", border: `1px solid ${isDemoMode ? "rgba(255,179,0,0.3)" : savedOffline ? "rgba(33,150,243,0.3)" : "rgba(76,175,80,0.3)"}`, borderRadius: 12, padding: "14px 16px", margin: "20px 0", textAlign: "left" }}>
              <div style={{ fontSize: 12, color: isDemoMode ? "#FFB300" : savedOffline ? "#64B5F6" : "#81c784", marginBottom: 10, fontWeight: 600 }}>Ringkasan</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>{selectedGH} · Periode {ghInfo?.periode} · {hst} HST</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>Operator: {operator}</div>
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                {varianList.map((v) => (
                  <div key={v} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: "rgba(255,255,255,0.5)" }}>🌾 {v}</span>
                    <span style={{ color: "#4CAF50", fontWeight: 700 }}>{totalPerVarian(varianData[v] || {})} tan.</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "rgba(255,255,255,0.5)" }}>Total</span>
                <span style={{ color: "#4CAF50", fontWeight: 800, fontSize: 16 }}>{totalSemuaVarian} tanaman</span>
              </div>
              {fotoUrl && (
                <a href={fotoUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginTop: 10, fontSize: 13, color: "#81c784" }}>
                  📎 Lihat foto di Drive →
                </a>
              )}
            </div>
            <button onClick={resetForm} style={{ width: "100%", padding: "16px", background: isDemoMode ? "rgba(255,179,0,0.15)" : savedOffline ? "rgba(33,150,243,0.15)" : "rgba(76,175,80,0.2)", border: `2px solid ${isDemoMode ? "rgba(255,179,0,0.4)" : savedOffline ? "rgba(33,150,243,0.4)" : "rgba(76,175,80,0.4)"}`, borderRadius: 12, color: isDemoMode ? "#FFB300" : savedOffline ? "#64B5F6" : "#4CAF50", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
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
              style={{ flex: 2, padding: "14px", border: "none", borderRadius: 12, background: (step === 1 ? selectedGH : canProceedStep2) ? "linear-gradient(135deg, #2e7d32, #43a047)" : "rgba(255,255,255,0.06)", color: (step === 1 ? selectedGH : canProceedStep2) ? "#fff" : "rgba(255,255,255,0.3)", fontSize: 15, fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}
            >
              {step === 1 ? "Lanjut Input →" : "Review Data →"}
            </button>
          )}
          {step === 3 && (
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={syncing}
              style={{ flex: 2, padding: "14px", background: syncing ? "rgba(76,175,80,0.3)" : isDemoMode ? "linear-gradient(135deg, #5d4037, #795548)" : !isOnline ? "linear-gradient(135deg, #1565C0, #1976D2)" : "linear-gradient(135deg, #1b5e20, #2e7d32)", border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 700, cursor: syncing ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              {syncing
                ? (fotoUploading ? "⏳ Upload foto..." : `⏳ ${syncProgress.done}/${syncProgress.total}...`)
                : isDemoMode
                  ? "Submit Demo 🧪"
                  : !isOnline
                    ? `💾 Simpan Offline (${varianList.length} var)`
                    : `Submit ${varianList.length} Varian ✓`}
            </button>
          )}
        </div>
      )}

      <ConfirmSubmitModal
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => { setConfirmOpen(false); handleSubmit(); }}
        color="#4CAF50"
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
