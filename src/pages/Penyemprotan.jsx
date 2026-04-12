import { useState, useEffect, useCallback } from "react";
import { idbAdd, idbGetAll, idbDelete, idbCount } from "../utils/idb";
import { useGHData } from "../hooks/useGHData";
import ConfirmSubmitModal from "../components/ConfirmSubmitModal";

const DB_NAME    = "PenyemprotanOfflineDB";
const SCRIPT_URL = import.meta.env.VITE_GAS_PENYEMPROTAN_URL;

// ─── Warna per area GH ────────────────────────────────────────────────────────
const AREA_COLORS = {
  "BERGAS":        "#FF7043",
  "TOHUDAN":       "#1E88E5",
  "SAWAHAN":       "#43A047",
  "COLOMADU":      "#AB47BC",
  "NURSERY":       "#00897B",
  "SEMAI SAWAHAN": "#FFB300",
  "SEMAI":         "#FFB300",
};

function buildGHGroups(ghData) {
  const areaMap = {};
  Object.keys(ghData).sort().forEach(ghName => {
    const match = ghName.match(/^(.+?)\s+(\d+)$/);
    if (!match) return;
    const area = match[1].trim();
    const num  = parseInt(match[2]);
    if (!areaMap[area]) {
      areaMap[area] = { area, color: AREA_COLORS[area] || "#607D8B", nomor: [] };
    }
    if (!areaMap[area].nomor.includes(num)) areaMap[area].nomor.push(num);
  });
  Object.values(areaMap).forEach(g => g.nomor.sort((a, b) => a - b));
  return Object.values(areaMap);
}

// ─── Pestisida (shared) ───────────────────────────────────────────────────────
const PESTISIDA_LIST = [
  "ENDURE","NISSOZIN","TENCHU","TOXEDOWN","EVISET","SIVANTO","INVERISH GOLD",
  "DEMOLISH","AMISTARTOP 250 ML","MERIVON","GLACIER","RIDOMIL","DITHANE",
  "COPCIDE","KUPROXAT","SAMITE","ROTRAZ","MITISUN","ATONIK","AMINOFOL",
  "FERTILON","CALBOR","MKP","ARES","FORMADES","DEMOLISH 200 ML","EVISET 100 GR",
  "NISSOZIN 200 GR","TENCHU 100 GR","TOXEDON 250 ML","ROTRAZ 500 ML",
  "SAMITE 100 ML","AMISTARTOP 100 ML","COPCIDE 77WP 400 GR","DITHANE 500 GR",
  "KUPROXAT 500 ML","MERIVON 100 ML","RIDOMIL GOLD 500 GR","AXER BORER 250 ML",
  "ATONIK 250 ML","NEEM OIL","AMINOFOL 500 ML","SCORE","FETRILON 25 GR",
  "CURACRON","ENDURE 100 ML","ENDURE 200 ML","SUNLIGHT","APPLAUD","ZK",
  "ORONDIS OPTI","MANOHARA","KING BOSS","TSUBAME 250 ML",
];

// ─── Konsentrasi ──────────────────────────────────────────────────────────────
const KONSENTRASI_LIST = [
  "0.25 Gr/L","0.5 Gr/L","0.75 Gr/L","1 Gr/L","2 Gr/L","3 Gr/L","1 Gr/6L","1/12 Gr/L",
  "0.15 ml/L","0.25 ml/L","0.50 ml/L","0.75 ml/L","1 ml/L",
];

// ─── Sterilisasi ──────────────────────────────────────────────────────────────
const STERILISASI_LIST = ["Steril Ke-1","Steril Ke-2","Steril Ke-3","Steril Ke-4","Steril","Tidak ada"];

// ─── Oles GSB ─────────────────────────────────────────────────────────────────
const PESTISIDA_GSB   = ["Spring","Copcide","Ridomil","Dhitane","Kupraxot","Nordox","Daconil"];
const KONSENTRASI_GSB = ["50 g/L","100 g/L"];

const todayISO   = new Date().toLocaleDateString("id-ID",{day:"2-digit",month:"2-digit",year:"numeric"});
const todayLabel = new Date().toLocaleDateString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric"});

// ─── Komponen: Searchable Pestisida Picker ────────────────────────────────────
function PestisidaPicker({ value, onChange, accentColor = "#64B5F6" }) {
  const [search, setSearch] = useState("");
  const [open, setOpen]     = useState(false);

  const filtered = search.trim().length > 0
    ? PESTISIDA_LIST.filter(p => p.toLowerCase().includes(search.toLowerCase()))
    : PESTISIDA_LIST;

  if (value) {
    return (
      <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:8 }}>
        <div style={{ flex:1, padding:"11px 14px", background:`${accentColor}18`, border:`1px solid ${accentColor}55`, borderRadius:10, color:accentColor, fontSize:13, fontWeight:700 }}>
          {value}
        </div>
        <button onClick={() => onChange("")}
          style={{ width:36, height:36, borderRadius:8, border:"1px solid rgba(255,255,255,0.15)", background:"rgba(255,255,255,0.06)", color:"rgba(255,255,255,0.5)", fontSize:16, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
          ✕
        </button>
      </div>
    );
  }

  return (
    <div style={{ position:"relative", marginTop:8 }}>
      <input
        type="text" value={search}
        onChange={e => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Ketik nama pestisida..."
        style={{ width:"100%", padding:"11px 14px", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.14)", borderRadius:10, color:"#fff", fontSize:14, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }}
      />
      {open && filtered.length > 0 && (
        <div style={{ position:"absolute", top:"100%", left:0, right:0, zIndex:30, background:"#0d2d45", border:"1px solid rgba(255,255,255,0.15)", borderTop:"none", borderRadius:"0 0 12px 12px", maxHeight:220, overflowY:"auto" }}>
          {filtered.map(p => (
            <button key={p} onMouseDown={() => { onChange(p); setSearch(""); setOpen(false); }}
              style={{ width:"100%", padding:"10px 14px", background:"transparent", border:"none", borderBottom:"1px solid rgba(255,255,255,0.05)", color:"rgba(255,255,255,0.8)", fontSize:13, cursor:"pointer", textAlign:"left", fontFamily:"inherit" }}
              onMouseEnter={e => e.currentTarget.style.background="rgba(255,255,255,0.07)"}
              onMouseLeave={e => e.currentTarget.style.background="transparent"}>
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Komponen: GH Picker ──────────────────────────────────────────────────────
function GHPicker({ value, onChange, groups }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      {groups.map(group => (
        <div key={group.area}>
          <div style={{ fontSize:10, color:group.color, letterSpacing:1.5, textTransform:"uppercase", fontWeight:700, marginBottom:8 }}>
            {group.area}
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
            {group.nomor.map(n => {
              const ghName  = `${group.area} ${n}`;
              const selected = value === ghName;
              return (
                <button key={n} onClick={() => onChange(ghName)}
                  style={{ width:44, height:44, borderRadius:10, border: selected ? `2px solid ${group.color}` : "1px solid rgba(255,255,255,0.12)", background: selected ? `${group.color}30` : "rgba(255,255,255,0.04)", color: selected ? group.color : "rgba(255,255,255,0.7)", fontSize:14, fontWeight: selected ? 800 : 500, cursor:"pointer", transition:"all 0.15s" }}>
                  {n}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Komponen: Field label ────────────────────────────────────────────────────
function FieldLabel({ children, required, color = "#64B5F6" }) {
  return (
    <label style={{ fontSize:11, color, letterSpacing:1.5, textTransform:"uppercase", fontWeight:600 }}>
      {children} {required && <span style={{ color:"#ef9a9a" }}>*</span>}
    </label>
  );
}

// ─── Komponen: Input teks/angka ───────────────────────────────────────────────
function Field({ type="text", value, onChange, placeholder, active, ...rest }) {
  return (
    <input
      type={type} inputMode={type==="number" ? "numeric" : undefined}
      value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ width:"100%", marginTop:8, padding:"11px 14px", background:"rgba(255,255,255,0.06)", border:`1px solid ${active||value ? "rgba(100,181,246,0.4)" : "rgba(255,255,255,0.12)"}`, borderRadius:10, color:"#fff", fontSize:14, outline:"none", boxSizing:"border-box", fontFamily:"inherit", ...rest?.style }}
      {...rest}
    />
  );
}

// ─── App utama ─────────────────────────────────────────────────────────────────
export default function Penyemprotan() {
  const [step, setStep]             = useState("start");
  const [navHistory, setNavHistory] = useState([]);

  const [activity, setActivity]     = useState("");
  const [selectedGH, setSelectedGH] = useState("");
  const [operator, setOperator]     = useState("");

  // ── Oles GSB ──
  const [pestisidaGSB, setPestisidaGSB]     = useState("");
  const [konsentrasiGSB, setKonsentrasiGSB] = useState("");
  const [penggunaanGram, setPenggunaanGram] = useState("");

  // ── Pengambilan Pestisida ──
  const [adaPengambilan, setAdaPengambilan] = useState(null);
  const [ambil, setAmbil] = useState({
    namaPestisida: "", jumlah: "",
    suhuMulai: "", rhMulai: "", suhuSelesai: "", rhSelesai: "",
    varianTidakDisemprot: "", waktuMulai: "", waktuSelesai: "", keterangan: "",
  });

  // ── Penggunaan Pestisida ──
  const [guna, setGuna] = useState({
    namaPestisida: "", konsentrasi: "", jumlahPemakaian: "", sterilisasi: "",
  });

  // ── Offline ──
  const [isOnline, setIsOnline]                 = useState(navigator.onLine);
  const [pendingCount, setPendingCount]         = useState(0);
  const [syncing, setSyncing]                   = useState(false);
  const [submitError, setSubmitError]           = useState(null);
  const [savedOffline, setSavedOffline]         = useState(false);
  const [isSyncingPending, setIsSyncingPending] = useState(false);
  const [sessionKey] = useState(() => "sk_" + Date.now() + "_" + Math.random().toString(36).slice(2));
  const isDemoMode = !SCRIPT_URL;

  const { ghData, loading: loadingGH } = useGHData();
  const ghGroups = buildGHGroups(ghData);

  const refreshPendingCount = useCallback(async () => {
    try { setPendingCount(await idbCount(DB_NAME)); } catch { setPendingCount(0); }
  }, []);

  useEffect(() => { refreshPendingCount(); }, [refreshPendingCount]);

  useEffect(() => {
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online",  on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => { if (isOnline) syncPendingData(); }, [isOnline]);

  const syncPendingData = useCallback(async () => {
    const all = await idbGetAll(DB_NAME);
    if (!all.length) return;
    setIsSyncingPending(true);
    for (const rec of all) {
      try {
        await fetch(SCRIPT_URL, { method:"POST", headers:{"Content-Type":"text/plain"}, body:JSON.stringify(rec.payload), redirect:"follow" });
        await idbDelete(DB_NAME, rec.id);
      } catch { /* coba lagi nanti */ }
    }
    await refreshPendingCount();
    setIsSyncingPending(false);
  }, [refreshPendingCount]);

  // ── Navigasi ──
  const navigateTo = (next) => { setNavHistory(h => [...h, step]); setStep(next); };
  const goBack = () => {
    const prev = navHistory[navHistory.length - 1] || "start";
    setStep(prev);
    setNavHistory(h => h.slice(0, -1));
  };

  const handleAnswerAmbil = (ada) => {
    setAdaPengambilan(ada);
    if (!ada) setStep("form_guna"); // skip form_ambil dari history, back = start
  };

  // ── Payload ──
  const buildPayload = () => {
    const base = { action:"submitPenyemprotan", tanggal:todayISO, gh:selectedGH, operator, type:activity };
    if (activity === "oles_gsb") {
      return { ...base, pestisida:pestisidaGSB, konsentrasi:konsentrasiGSB, penggunaan_gram:penggunaanGram };
    }
    return {
      ...base,
      ada_pengambilan: adaPengambilan,
      // Pengambilan
      ambil_nama_pestisida:       ambil.namaPestisida,
      ambil_jumlah:               ambil.jumlah,
      ambil_suhu_mulai:           ambil.suhuMulai,
      ambil_rh_mulai:             ambil.rhMulai,
      ambil_suhu_selesai:         ambil.suhuSelesai,
      ambil_rh_selesai:           ambil.rhSelesai,
      ambil_varian_skip:          ambil.varianTidakDisemprot,
      ambil_waktu_mulai:          ambil.waktuMulai,
      ambil_waktu_selesai:        ambil.waktuSelesai,
      ambil_keterangan:           ambil.keterangan,
      // Penggunaan
      guna_nama_pestisida:        guna.namaPestisida,
      guna_konsentrasi:           guna.konsentrasi,
      guna_jumlah_pemakaian:      guna.jumlahPemakaian,
      guna_sterilisasi:           guna.sterilisasi,
    };
  };

  const handleSubmit = async () => {
    setSyncing(true); setSubmitError(null);
    if (isDemoMode) {
      await new Promise(r => setTimeout(r, 800));
      navigateTo("sukses"); setSyncing(false); return;
    }
    const payload = buildPayload();
    if (!isOnline) {
      try {
        await idbAdd(DB_NAME, { tanggal:todayISO, gh:selectedGH, createdAt:Date.now(), payload, sessionKey });
        await refreshPendingCount(); setSavedOffline(true);
      } catch { setSubmitError("Gagal menyimpan offline. Coba lagi."); setSyncing(false); return; }
      navigateTo("sukses"); setSyncing(false); return;
    }
    try {
      await fetch(SCRIPT_URL, { method:"POST", headers:{"Content-Type":"text/plain"}, body:JSON.stringify(payload), redirect:"follow" });
    } catch { setSubmitError("Gagal mengirim, cek koneksi."); setSyncing(false); return; }
    navigateTo("sukses"); setSyncing(false);
  };

  const resetForm = () => {
    setStep("start"); setNavHistory([]);
    setActivity(""); setSelectedGH(""); setOperator("");
    setPestisidaGSB(""); setKonsentrasiGSB(""); setPenggunaanGram("");
    setAdaPengambilan(null);
    setAmbil({ namaPestisida:"", jumlah:"", suhuMulai:"", rhMulai:"", suhuSelesai:"", rhSelesai:"", varianTidakDisemprot:"", waktuMulai:"", waktuSelesai:"", keterangan:"" });
    setGuna({ namaPestisida:"", konsentrasi:"", jumlahPemakaian:"", sterilisasi:"" });
    setSyncing(false); setSubmitError(null); setSavedOffline(false);
  };

  // ── Validasi ──
  const canStart   = activity !== "" && selectedGH !== "";
  const canOlesGSB = pestisidaGSB !== "" && konsentrasiGSB !== "" && penggunaanGram !== "";
  const canAmbil   = adaPengambilan === true ? (ambil.namaPestisida !== "" && ambil.jumlah !== "") : true;
  const canGuna    = guna.namaPestisida !== "" && guna.konsentrasi !== "" && guna.jumlahPemakaian !== "";
  const canSubmit  = operator.trim() !== "";
  const [confirmOpen, setConfirmOpen] = useState(false);

  const actColor = activity === "oles_gsb" ? "#FF7043" : "#1E88E5";
  const ghGroup  = ghGroups.find(g => selectedGH.startsWith(g.area));
  const ghColor  = ghGroup?.color || "#64B5F6";

  // ── Shared input style helper ──
  const inp = (filled) => ({
    width:"100%", marginTop:8, padding:"11px 14px",
    background:"rgba(255,255,255,0.06)",
    border:`1px solid ${filled ? "rgba(100,181,246,0.4)" : "rgba(255,255,255,0.12)"}`,
    borderRadius:10, color:"#fff", fontSize:14, outline:"none",
    boxSizing:"border-box", fontFamily:"inherit",
  });

  const twoCol = { display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg,#0a1e2e 0%,#0d2d45 60%,#0a1a2e 100%)", fontFamily:"'DM Sans','Segoe UI',sans-serif", color:"#e3f2fd", display:"flex", flexDirection:"column" }}>

      {/* ── Header ── */}
      <div style={{ padding:"14px 16px 10px", borderBottom:"1px solid rgba(255,255,255,0.08)", background:"rgba(0,0,0,0.25)", position:"sticky", top:0, zIndex:10 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:11, color:"#64B5F6", letterSpacing:2, textTransform:"uppercase", fontWeight:600 }}>Form Penyemprotan</div>
            <div style={{ fontSize:12, color:"rgba(255,255,255,0.45)", marginTop:1 }}>{todayLabel}</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:7 }}>
            {pendingCount > 0 && (
              <button onClick={isOnline ? syncPendingData : undefined}
                style={{ fontSize:10, fontWeight:700, background: isOnline ? "rgba(33,150,243,0.2)" : "rgba(255,179,0,0.15)", border:`1px solid ${isOnline ? "rgba(33,150,243,0.5)" : "rgba(255,179,0,0.4)"}`, borderRadius:20, padding:"3px 9px", color: isOnline ? "#64B5F6" : "#FFB300", cursor: isOnline ? "pointer" : "default", display:"flex", alignItems:"center", gap:4 }}>
                {isSyncingPending ? "⏳" : "📤"} {pendingCount} pending
              </button>
            )}
            {isDemoMode && <div style={{ fontSize:10, fontWeight:700, background:"rgba(255,179,0,0.15)", border:"1px solid rgba(255,179,0,0.4)", borderRadius:20, padding:"3px 8px", color:"#FFB300" }}>DEMO</div>}
            <div style={{ width:8, height:8, borderRadius:"50%", background: isOnline ? "#4CAF50" : "#f44336", boxShadow: isOnline ? "0 0 8px #4CAF50" : "0 0 8px #f44336" }} />
          </div>
        </div>

        {!isOnline && (
          <div style={{ marginTop:8, padding:"6px 10px", background:"rgba(244,67,54,0.1)", border:"1px solid rgba(244,67,54,0.2)", borderRadius:7, display:"flex", alignItems:"center", gap:7 }}>
            <span style={{ fontSize:13 }}>📵</span>
            <span style={{ fontSize:11, color:"#ef9a9a" }}>Offline — tersimpan lokal & sync otomatis saat online</span>
          </div>
        )}

        {step !== "sukses" && (
          <div style={{ marginTop:10, display:"flex", alignItems:"center", gap:6 }}>
            {navHistory.length > 0 && (
              <button onClick={goBack} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.4)", fontSize:16, cursor:"pointer", padding:0, lineHeight:1 }}>←</button>
            )}
            {selectedGH && step !== "start" && (
              <div style={{ fontSize:11, background:`${ghColor}22`, border:`1px solid ${ghColor}55`, borderRadius:20, padding:"2px 9px", color:ghColor, fontWeight:600 }}>{selectedGH}</div>
            )}
            {activity && step !== "start" && (
              <div style={{ fontSize:11, background:`${actColor}22`, border:`1px solid ${actColor}55`, borderRadius:20, padding:"2px 9px", color:actColor, fontWeight:600 }}>
                {activity === "oles_gsb" ? "🖌️ Oles GSB" : "💊 Penggunaan & Pengambilan"}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <div style={{ flex:1, padding:"20px 16px", overflowY:"auto", position:"relative" }}>

        {/* ══ MODAL: Ada Pengambilan? ════════════════════════════════════════════ */}
        {step === "form_ambil" && adaPengambilan === null && (
          <div style={{ position:"absolute", inset:0, background:"rgba(8,18,30,0.96)", zIndex:20, display:"flex", alignItems:"center", justifyContent:"center", padding:24, backdropFilter:"blur(4px)" }}>
            <div style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.14)", borderRadius:20, padding:"28px 24px", maxWidth:340, width:"100%", textAlign:"center" }}>
              <div style={{ fontSize:44, marginBottom:14 }}>💊</div>
              <h3 style={{ fontSize:18, fontWeight:800, color:"#fff", margin:"0 0 8px" }}>Ada Pengambilan Obat?</h3>
              <p style={{ fontSize:13, color:"rgba(255,255,255,0.45)", margin:"0 0 24px", lineHeight:1.5 }}>
                Hari ini apakah ada pengambilan pestisida dari gudang / supplier?
              </p>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <button onClick={() => handleAnswerAmbil(true)}
                  style={{ padding:"14px", background:"linear-gradient(135deg,#1565C0,#1E88E5)", border:"none", borderRadius:12, color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer" }}>
                  ✓ Ya, Ada Pengambilan
                </button>
                <button onClick={() => handleAnswerAmbil(false)}
                  style={{ padding:"14px", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.14)", borderRadius:12, color:"rgba(255,255,255,0.65)", fontSize:14, fontWeight:600, cursor:"pointer" }}>
                  Tidak Ada → Langsung ke Penggunaan
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ START ══════════════════════════════════════════════════════════════ */}
        {step === "start" && (
          <div>
            <h2 style={{ fontSize:20, fontWeight:700, margin:"0 0 4px", color:"#fff" }}>Pilih Kegiatan</h2>
            <p style={{ fontSize:13, color:"rgba(255,255,255,0.4)", marginBottom:16 }}>Pilih jenis kegiatan penyemprotan hari ini</p>

            <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:28 }}>
              {[
                { key:"penggunaan_ambil", icon:"💊", color:"#1E88E5", label:"Penggunaan & Pengambilan Obat Baru", desc:"Catat pengambilan stok dan/atau penggunaan pestisida" },
                { key:"oles_gsb",         icon:"🖌️", color:"#FF7043", label:"Oles GSB",                            desc:"Pengolesan pestisida untuk pengendalian GSB" },
              ].map(opt => (
                <button key={opt.key} onClick={() => { setActivity(opt.key); setSelectedGH(""); }}
                  style={{ padding:"14px 16px", borderRadius:14, cursor:"pointer", textAlign:"left", border: activity === opt.key ? `2px solid ${opt.color}` : "1px solid rgba(255,255,255,0.09)", background: activity === opt.key ? `${opt.color}1a` : "rgba(255,255,255,0.03)", transition:"all 0.2s", display:"flex", alignItems:"center", gap:12 }}>
                  <span style={{ fontSize:26 }}>{opt.icon}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700, color: activity === opt.key ? opt.color : "#fff" }}>{opt.label}</div>
                    <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", marginTop:2 }}>{opt.desc}</div>
                  </div>
                  {activity === opt.key && <span style={{ color:opt.color, fontSize:18 }}>✓</span>}
                </button>
              ))}
            </div>

            {activity && (
              <>
                <h3 style={{ fontSize:15, fontWeight:700, margin:"0 0 14px", color:"#fff" }}>Pilih Greenhouse</h3>
                {loadingGH
                  ? <div style={{ color:"rgba(255,255,255,0.4)", fontSize:13, padding:"12px 0" }}>Memuat data GH...</div>
                  : <GHPicker value={selectedGH} onChange={setSelectedGH} groups={ghGroups} />
                }
                {selectedGH && (
                  <div style={{ marginTop:14, padding:"9px 14px", background:`${ghColor}18`, border:`1px solid ${ghColor}44`, borderRadius:10, fontSize:13, color:ghColor, fontWeight:600 }}>
                    ✓ {selectedGH} dipilih
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ══ FORM OLES GSB ══════════════════════════════════════════════════════ */}
        {step === "form_oles" && (
          <div>
            <h2 style={{ fontSize:20, fontWeight:700, margin:"0 0 20px", color:"#fff" }}>Isian Oles GSB</h2>

            <div style={{ marginBottom:20 }}>
              <FieldLabel required color="#FF7043">Pestisida</FieldLabel>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:10 }}>
                {PESTISIDA_GSB.map(p => (
                  <button key={p} onClick={() => setPestisidaGSB(p)}
                    style={{ padding:"9px 16px", borderRadius:20, border: pestisidaGSB===p ? "2px solid #FF7043" : "1px solid rgba(255,255,255,0.14)", background: pestisidaGSB===p ? "rgba(255,112,67,0.2)" : "rgba(255,255,255,0.04)", color: pestisidaGSB===p ? "#FF7043" : "rgba(255,255,255,0.65)", fontSize:13, fontWeight: pestisidaGSB===p ? 700 : 500, cursor:"pointer", transition:"all 0.15s" }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom:20 }}>
              <FieldLabel required color="#FF7043">Konsentrasi</FieldLabel>
              <div style={{ display:"flex", gap:10, marginTop:10 }}>
                {KONSENTRASI_GSB.map(k => (
                  <button key={k} onClick={() => setKonsentrasiGSB(k)}
                    style={{ flex:1, padding:"16px 0", borderRadius:12, border: konsentrasiGSB===k ? "2px solid #FF7043" : "1px solid rgba(255,255,255,0.14)", background: konsentrasiGSB===k ? "rgba(255,112,67,0.2)" : "rgba(255,255,255,0.04)", color: konsentrasiGSB===k ? "#FF7043" : "rgba(255,255,255,0.65)", fontSize:15, fontWeight: konsentrasiGSB===k ? 800 : 500, cursor:"pointer" }}>
                    {k}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom:20 }}>
              <FieldLabel required color="#FF7043">Penggunaan</FieldLabel>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:10 }}>
                <input type="number" inputMode="numeric" value={penggunaanGram} onChange={e => setPenggunaanGram(e.target.value)} placeholder="0"
                  style={{ flex:1, padding:"16px", background:"rgba(255,255,255,0.06)", border:`1px solid ${penggunaanGram ? "rgba(255,112,67,0.5)" : "rgba(255,255,255,0.12)"}`, borderRadius:12, color:"#fff", fontSize:24, fontWeight:700, outline:"none", textAlign:"center" }} />
                <div style={{ padding:"16px 14px", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, color:"rgba(255,255,255,0.5)", fontSize:14, whiteSpace:"nowrap" }}>gram</div>
              </div>
            </div>
          </div>
        )}

        {/* ══ FORM PENGAMBILAN PESTISIDA ═════════════════════════════════════════ */}
        {step === "form_ambil" && adaPengambilan === true && (
          <div>
            <h2 style={{ fontSize:20, fontWeight:700, margin:"0 0 20px", color:"#fff" }}>Pengambilan Pestisida</h2>

            {/* 1. Nama Pestisida */}
            <div style={{ marginBottom:14 }}>
              <FieldLabel required>Nama Pestisida</FieldLabel>
              <PestisidaPicker value={ambil.namaPestisida} onChange={v => setAmbil(d => ({...d, namaPestisida:v}))} />
            </div>

            {/* 2. Jumlah */}
            <div style={{ marginBottom:14 }}>
              <FieldLabel required>Jumlah Pengambilan</FieldLabel>
              <input type="text" value={ambil.jumlah} onChange={e => setAmbil(d => ({...d, jumlah:e.target.value}))}
                placeholder="contoh: 500 ml, 1 botol, 2 kg..."
                style={inp(ambil.jumlah)} />
            </div>

            {/* 3-4. Suhu & RH Mulai */}
            <div style={twoCol}>
              <div>
                <FieldLabel>Suhu Mulai</FieldLabel>
                <input type="number" inputMode="decimal" value={ambil.suhuMulai} onChange={e => setAmbil(d => ({...d, suhuMulai:e.target.value}))}
                  placeholder="°C" style={{ ...inp(ambil.suhuMulai), marginTop:8, textAlign:"center" }} />
              </div>
              <div>
                <FieldLabel>RH Mulai</FieldLabel>
                <input type="number" inputMode="decimal" value={ambil.rhMulai} onChange={e => setAmbil(d => ({...d, rhMulai:e.target.value}))}
                  placeholder="%" style={{ ...inp(ambil.rhMulai), marginTop:8, textAlign:"center" }} />
              </div>
            </div>

            {/* 5-6. Suhu & RH Selesai */}
            <div style={twoCol}>
              <div>
                <FieldLabel>Suhu Selesai</FieldLabel>
                <input type="number" inputMode="decimal" value={ambil.suhuSelesai} onChange={e => setAmbil(d => ({...d, suhuSelesai:e.target.value}))}
                  placeholder="°C" style={{ ...inp(ambil.suhuSelesai), marginTop:8, textAlign:"center" }} />
              </div>
              <div>
                <FieldLabel>RH Selesai</FieldLabel>
                <input type="number" inputMode="decimal" value={ambil.rhSelesai} onChange={e => setAmbil(d => ({...d, rhSelesai:e.target.value}))}
                  placeholder="%" style={{ ...inp(ambil.rhSelesai), marginTop:8, textAlign:"center" }} />
              </div>
            </div>

            {/* 8-9. Waktu Mulai & Selesai */}
            <div style={twoCol}>
              <div>
                <FieldLabel>Waktu Mulai</FieldLabel>
                <input type="time" value={ambil.waktuMulai} onChange={e => setAmbil(d => ({...d, waktuMulai:e.target.value}))}
                  style={{ ...inp(ambil.waktuMulai), marginTop:8, colorScheme:"dark" }} />
              </div>
              <div>
                <FieldLabel>Waktu Selesai</FieldLabel>
                <input type="time" value={ambil.waktuSelesai} onChange={e => setAmbil(d => ({...d, waktuSelesai:e.target.value}))}
                  style={{ ...inp(ambil.waktuSelesai), marginTop:8, colorScheme:"dark" }} />
              </div>
            </div>

            {/* 7. Varian tidak disemprot */}
            <div style={{ marginBottom:14 }}>
              <FieldLabel>Varian yang Tidak Disemprot</FieldLabel>
              <input type="text" value={ambil.varianTidakDisemprot} onChange={e => setAmbil(d => ({...d, varianTidakDisemprot:e.target.value}))}
                placeholder="Tulis nama varian (jika ada)..."
                style={inp(ambil.varianTidakDisemprot)} />
            </div>

            {/* 10. Keterangan */}
            <div style={{ marginBottom:8 }}>
              <FieldLabel>Keterangan</FieldLabel>
              <textarea value={ambil.keterangan} onChange={e => setAmbil(d => ({...d, keterangan:e.target.value}))}
                placeholder="Catatan tambahan..."
                rows={2}
                style={{ width:"100%", marginTop:8, padding:"9px 12px", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:8, color:"#fff", fontSize:13, outline:"none", resize:"none", boxSizing:"border-box", fontFamily:"inherit" }} />
            </div>
          </div>
        )}

        {/* ══ FORM PENGGUNAAN PESTISIDA ══════════════════════════════════════════ */}
        {step === "form_guna" && (
          <div>
            <h2 style={{ fontSize:20, fontWeight:700, margin:"0 0 6px", color:"#fff" }}>Penggunaan Pestisida</h2>
            {adaPengambilan && (
              <div style={{ fontSize:12, color:"rgba(100,181,246,0.7)", marginBottom:16 }}>
                💊 Pengambilan: {ambil.namaPestisida} — {ambil.jumlah}
              </div>
            )}

            {/* 1. Nama Pestisida */}
            <div style={{ marginBottom:14 }}>
              <FieldLabel required>Nama Pestisida</FieldLabel>
              <PestisidaPicker value={guna.namaPestisida} onChange={v => setGuna(d => ({...d, namaPestisida:v}))} />
            </div>

            {/* 2. Konsentrasi */}
            <div style={{ marginBottom:14 }}>
              <FieldLabel required>Konsentrasi</FieldLabel>
              <div style={{ display:"flex", flexWrap:"wrap", gap:7, marginTop:10 }}>
                {KONSENTRASI_LIST.map(k => (
                  <button key={k} onClick={() => setGuna(d => ({...d, konsentrasi:k}))}
                    style={{ padding:"8px 13px", borderRadius:20, border: guna.konsentrasi===k ? "2px solid #64B5F6" : "1px solid rgba(255,255,255,0.14)", background: guna.konsentrasi===k ? "rgba(100,181,246,0.18)" : "rgba(255,255,255,0.04)", color: guna.konsentrasi===k ? "#64B5F6" : "rgba(255,255,255,0.65)", fontSize:12, fontWeight: guna.konsentrasi===k ? 700 : 500, cursor:"pointer", transition:"all 0.15s", whiteSpace:"nowrap" }}>
                    {k}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Jumlah Pemakaian */}
            <div style={{ marginBottom:14 }}>
              <FieldLabel required>Jumlah Pemakaian</FieldLabel>
              <input type="text" value={guna.jumlahPemakaian} onChange={e => setGuna(d => ({...d, jumlahPemakaian:e.target.value}))}
                placeholder="contoh: 2 L, 500 ml, 200 g..."
                style={inp(guna.jumlahPemakaian)} />
            </div>

            {/* 4. Sterilisasi */}
            <div style={{ marginBottom:8 }}>
              <FieldLabel>Sterilisasi</FieldLabel>
              <div style={{ display:"flex", flexWrap:"wrap", gap:7, marginTop:10 }}>
                {STERILISASI_LIST.map(s => (
                  <button key={s} onClick={() => setGuna(d => ({...d, sterilisasi: guna.sterilisasi===s ? "" : s}))}
                    style={{ padding:"8px 14px", borderRadius:20, border: guna.sterilisasi===s ? "2px solid #43A047" : "1px solid rgba(255,255,255,0.14)", background: guna.sterilisasi===s ? "rgba(67,160,71,0.18)" : "rgba(255,255,255,0.04)", color: guna.sterilisasi===s ? "#81c784" : "rgba(255,255,255,0.65)", fontSize:12, fontWeight: guna.sterilisasi===s ? 700 : 500, cursor:"pointer", transition:"all 0.15s" }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══ REKAP ══════════════════════════════════════════════════════════════ */}
        {step === "rekap" && (
          <div>
            <h2 style={{ fontSize:20, fontWeight:700, margin:"0 0 4px", color:"#fff" }}>Konfirmasi Data</h2>
            <p style={{ fontSize:13, color:"rgba(255,255,255,0.4)", marginBottom:18 }}>Periksa kembali sebelum submit</p>

            {isDemoMode && <div style={{ background:"rgba(255,179,0,0.08)", border:"1px solid rgba(255,179,0,0.25)", borderRadius:10, padding:"10px 14px", marginBottom:14, fontSize:12, color:"#FFB300" }}>⚠️ Mode Demo — data tidak dikirim ke Sheets</div>}
            {!isOnline && <div style={{ background:"rgba(255,179,0,0.08)", border:"1px solid rgba(255,179,0,0.25)", borderRadius:10, padding:"10px 14px", marginBottom:14, fontSize:12, color:"#FFB300" }}>📵 Offline — akan disimpan lokal & dikirim saat online</div>}

            {/* Info umum */}
            <RekapSection title="Umum" color="#64B5F6" rows={[
              { label:"Tanggal",  value: todayISO },
              { label:"GH",       value: selectedGH },
              { label:"Kegiatan", value: activity === "oles_gsb" ? "🖌️ Oles GSB" : "💊 Penggunaan & Pengambilan" },
            ]} />

            {/* Oles GSB */}
            {activity === "oles_gsb" && (
              <RekapSection title="Oles GSB" color="#FF7043" rows={[
                { label:"Pestisida",    value: pestisidaGSB },
                { label:"Konsentrasi", value: konsentrasiGSB },
                { label:"Penggunaan",  value: `${penggunaanGram} gram` },
              ]} />
            )}

            {/* Pengambilan */}
            {activity === "penggunaan_ambil" && (
              <RekapSection title={`Pengambilan${adaPengambilan ? "" : " — Tidak Ada"}`} color="#1E88E5" rows={[
                { label:"Ada Pengambilan", value: adaPengambilan ? "Ya" : "Tidak" },
                ...(adaPengambilan ? [
                  { label:"Pestisida",  value: ambil.namaPestisida },
                  { label:"Jumlah",     value: ambil.jumlah },
                  ...(ambil.suhuMulai  ? [{ label:"Suhu Mulai",    value:`${ambil.suhuMulai} °C` }] : []),
                  ...(ambil.rhMulai    ? [{ label:"RH Mulai",      value:`${ambil.rhMulai} %` }] : []),
                  ...(ambil.suhuSelesai? [{ label:"Suhu Selesai",  value:`${ambil.suhuSelesai} °C` }] : []),
                  ...(ambil.rhSelesai  ? [{ label:"RH Selesai",    value:`${ambil.rhSelesai} %` }] : []),
                  ...(ambil.waktuMulai ? [{ label:"Waktu Mulai",   value: ambil.waktuMulai }] : []),
                  ...(ambil.waktuSelesai?[{ label:"Waktu Selesai", value: ambil.waktuSelesai }] : []),
                  ...(ambil.varianTidakDisemprot ? [{ label:"Skip Varian", value: ambil.varianTidakDisemprot }] : []),
                  ...(ambil.keterangan? [{ label:"Keterangan",    value: ambil.keterangan }] : []),
                ] : []),
              ]} />
            )}

            {/* Penggunaan */}
            {activity === "penggunaan_ambil" && guna.namaPestisida && (
              <RekapSection title="Penggunaan" color="#43A047" rows={[
                { label:"Pestisida",   value: guna.namaPestisida },
                { label:"Konsentrasi",value: guna.konsentrasi },
                { label:"Pemakaian",  value: guna.jumlahPemakaian },
                ...(guna.sterilisasi  ? [{ label:"Sterilisasi", value: guna.sterilisasi }] : []),
              ]} />
            )}

            {/* Operator */}
            <div style={{ marginBottom:14 }}>
              <FieldLabel required>👤 Nama Operator</FieldLabel>
              <input type="text" value={operator} onChange={e => setOperator(e.target.value)}
                placeholder="Tulis nama lengkap..."
                style={inp(operator.trim())} />
              {!operator.trim() && <div style={{ fontSize:11, color:"rgba(255,255,255,0.3)", marginTop:5 }}>Wajib diisi sebelum submit</div>}
            </div>

            {submitError && (
              <div style={{ padding:"12px", background:"rgba(244,67,54,0.1)", border:"1px solid rgba(244,67,54,0.3)", borderRadius:10, fontSize:13, color:"#ef9a9a", marginBottom:12 }}>
                ⚠️ {submitError}
              </div>
            )}
          </div>
        )}

        {/* ══ SUKSES ══════════════════════════════════════════════════════════════ */}
        {step === "sukses" && (
          <div style={{ textAlign:"center", paddingTop:36 }}>
            <div style={{ fontSize:60, marginBottom:14 }}>{isDemoMode ? "🧪" : savedOffline ? "💾" : "✅"}</div>
            <h2 style={{ fontSize:22, fontWeight:800, color: isDemoMode ? "#FFB300" : savedOffline ? "#64B5F6" : "#1E88E5", margin:"0 0 8px" }}>
              {isDemoMode ? "Demo Selesai!" : savedOffline ? "Tersimpan Lokal!" : "Data Tersimpan!"}
            </h2>
            <p style={{ fontSize:14, color:"rgba(255,255,255,0.5)", margin:"0 0 20px" }}>
              {isDemoMode ? "Data tidak dikirim (mode demo)" : savedOffline ? "Akan terkirim otomatis saat online." : "Berhasil dikirim ke Google Sheets"}
            </p>
            {savedOffline && pendingCount > 0 && (
              <div style={{ background:"rgba(33,150,243,0.08)", border:"1px solid rgba(33,150,243,0.25)", borderRadius:10, padding:"10px 14px", marginBottom:16, textAlign:"left", fontSize:12, color:"#64B5F6" }}>
                {pendingCount} record menunggu sync saat online.
              </div>
            )}
            <div style={{ background:"rgba(30,136,229,0.08)", border:"1px solid rgba(30,136,229,0.3)", borderRadius:12, padding:"14px 16px", marginBottom:20, textAlign:"left" }}>
              <div style={{ fontSize:13, color:"rgba(255,255,255,0.7)", fontWeight:600 }}>{selectedGH} · {todayISO}</div>
              <div style={{ fontSize:13, color:"rgba(255,255,255,0.5)", marginTop:4 }}>
                {activity === "oles_gsb"
                  ? `🖌️ ${pestisidaGSB} · ${konsentrasiGSB} · ${penggunaanGram}g`
                  : `💊 ${guna.namaPestisida} ${guna.konsentrasi} ${guna.jumlahPemakaian}`}
              </div>
              <div style={{ fontSize:13, color:"rgba(255,255,255,0.45)", marginTop:2 }}>Operator: {operator}</div>
            </div>
            <button onClick={resetForm}
              style={{ width:"100%", padding:"16px", background:"rgba(30,136,229,0.15)", border:"2px solid rgba(30,136,229,0.4)", borderRadius:12, color:"#64B5F6", fontSize:15, fontWeight:700, cursor:"pointer" }}>
              + Input GH Berikutnya
            </button>
          </div>
        )}
      </div>

      {/* ── Bottom Navigation ── */}
      {step !== "sukses" && (
        <div style={{ padding:"12px 16px 20px", borderTop:"1px solid rgba(255,255,255,0.08)", background:"rgba(0,0,0,0.3)", display:"flex", gap:10 }}>
          {navHistory.length > 0 && (
            <button onClick={goBack}
              style={{ flex:1, padding:"14px", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:12, color:"rgba(255,255,255,0.7)", fontSize:14, fontWeight:600, cursor:"pointer" }}>
              ← Kembali
            </button>
          )}

          {step === "start" && (
            <button onClick={() => navigateTo(activity === "oles_gsb" ? "form_oles" : "form_ambil")}
              disabled={!canStart}
              style={{ flex:2, padding:"14px", border:"none", borderRadius:12, background: canStart ? `linear-gradient(135deg,${actColor}cc,${actColor})` : "rgba(255,255,255,0.06)", color: canStart ? "#fff" : "rgba(255,255,255,0.3)", fontSize:15, fontWeight:700, cursor: canStart ? "pointer" : "not-allowed" }}>
              Lanjut →
            </button>
          )}

          {step === "form_oles" && (
            <button onClick={() => navigateTo("rekap")} disabled={!canOlesGSB}
              style={{ flex:2, padding:"14px", border:"none", borderRadius:12, background: canOlesGSB ? "linear-gradient(135deg,#bf360c,#FF7043)" : "rgba(255,255,255,0.06)", color: canOlesGSB ? "#fff" : "rgba(255,255,255,0.3)", fontSize:15, fontWeight:700, cursor: canOlesGSB ? "pointer" : "not-allowed" }}>
              Review Data →
            </button>
          )}

          {step === "form_ambil" && adaPengambilan === true && (
            <>
              <button onClick={() => navigateTo("form_guna")} disabled={!canAmbil}
                style={{ flex:2, padding:"14px", border:"none", borderRadius:12, background: canAmbil ? "linear-gradient(135deg,#1565C0,#1E88E5)" : "rgba(255,255,255,0.06)", color: canAmbil ? "#fff" : "rgba(255,255,255,0.3)", fontSize:13, fontWeight:700, cursor: canAmbil ? "pointer" : "not-allowed" }}>
                + ke Penggunaan →
              </button>
              <button onClick={() => navigateTo("rekap")} disabled={!canAmbil}
                style={{ flex:2, padding:"14px", border:`1px solid ${canAmbil ? "rgba(100,181,246,0.4)" : "rgba(255,255,255,0.08)"}`, borderRadius:12, background:"transparent", color: canAmbil ? "#64B5F6" : "rgba(255,255,255,0.3)", fontSize:13, fontWeight:700, cursor: canAmbil ? "pointer" : "not-allowed" }}>
                Langsung Rekap →
              </button>
            </>
          )}

          {step === "form_guna" && (
            <button onClick={() => navigateTo("rekap")} disabled={!canGuna}
              style={{ flex:2, padding:"14px", border:"none", borderRadius:12, background: canGuna ? "linear-gradient(135deg,#1565C0,#1E88E5)" : "rgba(255,255,255,0.06)", color: canGuna ? "#fff" : "rgba(255,255,255,0.3)", fontSize:15, fontWeight:700, cursor: canGuna ? "pointer" : "not-allowed" }}>
              Review Data →
            </button>
          )}

          {step === "rekap" && (
            <button onClick={() => setConfirmOpen(true)} disabled={syncing || !canSubmit}
              style={{ flex:2, padding:"14px", border:"none", borderRadius:12, background: syncing ? "rgba(30,136,229,0.3)" : !canSubmit ? "rgba(255,255,255,0.06)" : isDemoMode ? "linear-gradient(135deg,#5d4037,#795548)" : !isOnline ? "linear-gradient(135deg,#1565C0,#1976D2)" : "linear-gradient(135deg,#0d47a1,#1565C0)", color: canSubmit ? "#fff" : "rgba(255,255,255,0.3)", fontSize:15, fontWeight:700, cursor: syncing || !canSubmit ? "not-allowed" : "pointer" }}>
              {syncing ? "⏳ Mengirim..." : isDemoMode ? "Submit Demo 🧪" : !isOnline ? "💾 Simpan Offline" : "Submit ✓"}
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
        isDemoMode={isDemoMode}
        summary={[
          { label: "Tanggal",   value: todayISO },
          { label: "GH",        value: selectedGH },
          { label: "Kegiatan",  value: activity === "oles_gsb" ? "Oles GSB" : "Penggunaan & Pengambilan" },
          { label: "Pestisida", value: activity === "oles_gsb" ? pestisidaGSB : guna.namaPestisida },
          { label: "Operator",  value: operator },
        ]}
      />

      <style>{`
        input[type=number]::-webkit-outer-spin-button,
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=time]::-webkit-calendar-picker-indicator { filter: invert(1) opacity(0.5); }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        select option { background: #1a2a3a; }
      `}</style>
    </div>
  );
}

// ─── Komponen: Rekap section ───────────────────────────────────────────────────
function RekapSection({ title, color, rows }) {
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:10, color, letterSpacing:1.5, textTransform:"uppercase", fontWeight:700, marginBottom:6, paddingLeft:2 }}>{title}</div>
      <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:12, overflow:"hidden" }}>
        {rows.map((item, i) => (
          <div key={i} style={{ display:"flex", padding:"10px 14px", borderBottom: i < rows.length-1 ? "1px solid rgba(255,255,255,0.05)" : "none", gap:10 }}>
            <span style={{ fontSize:12, color:"rgba(255,255,255,0.38)", minWidth:110 }}>{item.label}</span>
            <span style={{ fontSize:12, color:"#fff", fontWeight:600, flex:1 }}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
