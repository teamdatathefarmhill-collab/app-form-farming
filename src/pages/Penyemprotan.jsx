import { useState, useEffect, useCallback } from "react";
import { idbAdd, idbGetAll, idbDelete, idbCount } from "../utils/idb";

const DB_NAME    = "PenyemprotanOfflineDB";
const SCRIPT_URL = import.meta.env.VITE_GAS_PENYEMPROTAN_URL;

// ─── Data GH (statis) ─────────────────────────────────────────────────────────
const GH_GROUPS = [
  { area: "BERGAS",        color: "#FF7043", nomor: [1,2,3,4,5,7,8] },
  { area: "TOHUDAN",       color: "#1E88E5", nomor: Array.from({length:22},(_,i)=>i+1) },
  { area: "SAWAHAN",       color: "#43A047", nomor: [1,2,3,4] },
  { area: "COLOMADU",      color: "#AB47BC", nomor: [1,2,3,4] },
  { area: "NURSERY",       color: "#00897B", nomor: [1,2,3,4,5,6] },
  { area: "SEMAI SAWAHAN", color: "#FFB300", nomor: [1] },
];

// ─── Data Oles GSB ─────────────────────────────────────────────────────────────
const PESTISIDA_GSB   = ["Spring","Copcide","Ridomil","Dhitane","Kupraxot","Nordox","Daconil"];
const KONSENTRASI_GSB = ["50 g/L","100 g/L"];

const todayISO   = new Date().toLocaleDateString("id-ID",{day:"2-digit",month:"2-digit",year:"numeric"});
const todayLabel = new Date().toLocaleDateString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric"});

// ─── Komponen GH Picker ────────────────────────────────────────────────────────
function GHPicker({ value, onChange }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      {GH_GROUPS.map(group => (
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

// ─── App utama ─────────────────────────────────────────────────────────────────
export default function Penyemprotan() {
  // ── Navigasi (step machine + history untuk tombol kembali) ──
  const [step, setStep]             = useState("start");
  const [navHistory, setNavHistory] = useState([]);

  // ── Data umum ──
  const [activity, setActivity]     = useState(""); // 'oles_gsb' | 'penggunaan_ambil'
  const [selectedGH, setSelectedGH] = useState("");
  const [operator, setOperator]     = useState("");

  // ── Oles GSB ──
  const [pestisida, setPestisida]           = useState("");
  const [konsentrasi, setKonsentrasi]       = useState("");
  const [penggunaanGram, setPenggunaanGram] = useState("");

  // ── Pengambilan & Penggunaan ──
  // adaPengambilan: null = belum dijawab (modal tampil), true/false = sudah dijawab
  const [adaPengambilan, setAdaPengambilan] = useState(null);
  const [ambilData, setAmbilData] = useState({ namaObat:"", jumlah:"", satuan:"ml", keterangan:"" });
  // gunaData: placeholder — field detail akan ditambahkan sesuai rekap dari user
  const [gunaData, setGunaData]   = useState({ catatan:"" });

  // ── Offline ──
  const [isOnline, setIsOnline]                   = useState(navigator.onLine);
  const [pendingCount, setPendingCount]           = useState(0);
  const [syncing, setSyncing]                     = useState(false);
  const [submitError, setSubmitError]             = useState(null);
  const [savedOffline, setSavedOffline]           = useState(false);
  const [isSyncingPending, setIsSyncingPending]   = useState(false);
  const [sessionKey] = useState(() => "sk_" + Date.now() + "_" + Math.random().toString(36).slice(2));
  const isDemoMode = !SCRIPT_URL;

  // ── Pending count ──
  const refreshPendingCount = useCallback(async () => {
    try { setPendingCount(await idbCount(DB_NAME)); } catch { setPendingCount(0); }
  }, []);

  useEffect(() => { refreshPendingCount(); }, [refreshPendingCount]);

  // ── Online/offline listener ──
  useEffect(() => {
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => { if (isOnline) syncPendingData(); }, [isOnline]);

  const syncPendingData = useCallback(async () => {
    const allPending = await idbGetAll(DB_NAME);
    if (!allPending.length) return;
    setIsSyncingPending(true);
    for (const record of allPending) {
      try {
        await fetch(SCRIPT_URL, {
          method:"POST", headers:{"Content-Type":"text/plain"},
          body: JSON.stringify(record.payload), redirect:"follow",
        });
        await idbDelete(DB_NAME, record.id);
      } catch { /* coba lagi nanti */ }
    }
    await refreshPendingCount();
    setIsSyncingPending(false);
  }, [refreshPendingCount]);

  // ── Navigasi helpers ──
  const navigateTo = (nextStep) => {
    setNavHistory(h => [...h, step]);
    setStep(nextStep);
  };

  const goBack = () => {
    const prev = navHistory[navHistory.length - 1] || "start";
    setStep(prev);
    setNavHistory(h => h.slice(0, -1));
  };

  // Jawab modal "ada pengambilan?"
  // Jika tidak: langsung skip ke form_guna tanpa push form_ambil ke history
  // (sehingga tombol kembali di form_guna = kembali ke start)
  const handleAnswerAmbil = (ada) => {
    setAdaPengambilan(ada);
    if (!ada) setStep("form_guna");
    // Jika ada=true: tetap di step form_ambil, modal tutup, form tampil
  };

  // ── Payload builder ──
  const buildPayload = () => {
    const base = { action:"submitPenyemprotan", tanggal:todayISO, gh:selectedGH, operator, type:activity };
    if (activity === "oles_gsb") {
      return { ...base, pestisida, konsentrasi, penggunaan_gram:penggunaanGram };
    }
    return {
      ...base,
      ada_pengambilan: adaPengambilan,
      nama_obat: ambilData.namaObat,
      jumlah_ambil: `${ambilData.jumlah} ${ambilData.satuan}`,
      keterangan_ambil: ambilData.keterangan,
      catatan_guna: gunaData.catatan,
    };
  };

  const handleSubmit = async () => {
    setSyncing(true);
    setSubmitError(null);

    if (isDemoMode) {
      await new Promise(r => setTimeout(r, 800));
      navigateTo("sukses");
      setSyncing(false);
      return;
    }

    const payload = buildPayload();

    if (!isOnline) {
      try {
        await idbAdd(DB_NAME, { tanggal:todayISO, gh:selectedGH, createdAt:Date.now(), payload, sessionKey });
        await refreshPendingCount();
        setSavedOffline(true);
      } catch {
        setSubmitError("Gagal menyimpan offline. Coba lagi.");
        setSyncing(false);
        return;
      }
      navigateTo("sukses");
      setSyncing(false);
      return;
    }

    try {
      await fetch(SCRIPT_URL, {
        method:"POST", headers:{"Content-Type":"text/plain"},
        body:JSON.stringify(payload), redirect:"follow",
      });
    } catch {
      setSubmitError("Gagal mengirim data, cek koneksi.");
      setSyncing(false);
      return;
    }
    navigateTo("sukses");
    setSyncing(false);
  };

  const resetForm = () => {
    setStep("start"); setNavHistory([]);
    setActivity(""); setSelectedGH(""); setOperator("");
    setPestisida(""); setKonsentrasi(""); setPenggunaanGram("");
    setAdaPengambilan(null);
    setAmbilData({ namaObat:"", jumlah:"", satuan:"ml", keterangan:"" });
    setGunaData({ catatan:"" });
    setSyncing(false); setSubmitError(null); setSavedOffline(false);
  };

  // ── Kondisi validasi per step ──
  const canStart    = activity !== "" && selectedGH !== "";
  const canOlesGSB  = pestisida !== "" && konsentrasi !== "" && penggunaanGram !== "";
  const canAmbil    = ambilData.namaObat.trim() !== "" && ambilData.jumlah !== "";
  const canSubmit   = operator.trim() !== "";

  // ── Warna activity ──
  const activityColor = activity === "oles_gsb" ? "#FF7043" : "#1E88E5";
  const ghGroup = GH_GROUPS.find(g => selectedGH.startsWith(g.area));
  const ghColor = ghGroup?.color || "#64B5F6";

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg, #0a1e2e 0%, #0d2d45 60%, #0a1a2e 100%)", fontFamily:"'DM Sans','Segoe UI',sans-serif", color:"#e3f2fd", display:"flex", flexDirection:"column" }}>

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
            <span style={{ fontSize:11, color:"#ef9a9a" }}>Offline — data tersimpan lokal & sync otomatis saat online</span>
          </div>
        )}

        {/* Breadcrumb / step indicator */}
        {step !== "sukses" && (
          <div style={{ marginTop:10, display:"flex", alignItems:"center", gap:6 }}>
            {navHistory.length > 0 && (
              <button onClick={goBack}
                style={{ background:"none", border:"none", color:"rgba(255,255,255,0.4)", fontSize:16, cursor:"pointer", padding:0, lineHeight:1 }}>←</button>
            )}
            {selectedGH && step !== "start" && (
              <div style={{ fontSize:11, background:`${ghColor}22`, border:`1px solid ${ghColor}55`, borderRadius:20, padding:"2px 9px", color:ghColor, fontWeight:600 }}>
                {selectedGH}
              </div>
            )}
            {activity && step !== "start" && (
              <div style={{ fontSize:11, background:`${activityColor}22`, border:`1px solid ${activityColor}55`, borderRadius:20, padding:"2px 9px", color:activityColor, fontWeight:600 }}>
                {activity === "oles_gsb" ? "🖌️ Oles GSB" : "💊 Penggunaan & Pengambilan"}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <div style={{ flex:1, padding:"20px 16px", overflowY:"auto", position:"relative" }}>

        {/* ══ MODAL: Ada Pengambilan Obat? ══════════════════════════════════════ */}
        {step === "form_ambil" && adaPengambilan === null && (
          <div style={{ position:"absolute", inset:0, background:"rgba(8,18,30,0.96)", zIndex:20, display:"flex", alignItems:"center", justifyContent:"center", padding:24, backdropFilter:"blur(4px)" }}>
            <div style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.14)", borderRadius:20, padding:"28px 24px", maxWidth:340, width:"100%", textAlign:"center" }}>
              <div style={{ fontSize:44, marginBottom:14 }}>💊</div>
              <h3 style={{ fontSize:18, fontWeight:800, color:"#fff", margin:"0 0 8px" }}>Ada Pengambilan Obat?</h3>
              <p style={{ fontSize:13, color:"rgba(255,255,255,0.45)", margin:"0 0 24px", lineHeight:1.5 }}>
                Hari ini apakah ada pengambilan obat baru dari gudang / supplier?
              </p>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <button onClick={() => handleAnswerAmbil(true)}
                  style={{ padding:"14px", background:"linear-gradient(135deg, #1565C0, #1E88E5)", border:"none", borderRadius:12, color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer" }}>
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

        {/* ══ START: Pilih Kegiatan + GH ════════════════════════════════════════ */}
        {step === "start" && (
          <div>
            <h2 style={{ fontSize:20, fontWeight:700, margin:"0 0 4px", color:"#fff" }}>Pilih Kegiatan</h2>
            <p style={{ fontSize:13, color:"rgba(255,255,255,0.4)", marginBottom:16 }}>Pilih jenis kegiatan penyemprotan hari ini</p>

            <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:28 }}>
              {[
                {
                  key:  "penggunaan_ambil",
                  icon: "💊",
                  color:"#1E88E5",
                  label:"Penggunaan & Pengambilan Obat Baru",
                  desc: "Catat pengambilan stok dan/atau penggunaan pestisida",
                },
                {
                  key:  "oles_gsb",
                  icon: "🖌️",
                  color:"#FF7043",
                  label:"Oles GSB",
                  desc: "Pengolesan pestisida untuk pengendalian GSB",
                },
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
              <div>
                <h3 style={{ fontSize:15, fontWeight:700, margin:"0 0 14px", color:"#fff" }}>
                  Pilih Greenhouse
                </h3>
                <GHPicker value={selectedGH} onChange={setSelectedGH} />
                {selectedGH && (
                  <div style={{ marginTop:14, padding:"9px 14px", background:`${ghColor}18`, border:`1px solid ${ghColor}44`, borderRadius:10, fontSize:13, color:ghColor, fontWeight:600 }}>
                    ✓ {selectedGH} dipilih
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══ FORM OLES GSB ══════════════════════════════════════════════════════ */}
        {step === "form_oles" && (
          <div>
            <h2 style={{ fontSize:20, fontWeight:700, margin:"0 0 20px", color:"#fff" }}>Isian Oles GSB</h2>

            {/* Pestisida */}
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:11, color:"#FF7043", letterSpacing:1.5, textTransform:"uppercase", fontWeight:600 }}>
                Pestisida <span style={{ color:"#ef9a9a" }}>*</span>
              </label>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:10 }}>
                {PESTISIDA_GSB.map(p => (
                  <button key={p} onClick={() => setPestisida(p)}
                    style={{ padding:"9px 16px", borderRadius:20, border: pestisida === p ? "2px solid #FF7043" : "1px solid rgba(255,255,255,0.14)", background: pestisida === p ? "rgba(255,112,67,0.2)" : "rgba(255,255,255,0.04)", color: pestisida === p ? "#FF7043" : "rgba(255,255,255,0.65)", fontSize:13, fontWeight: pestisida === p ? 700 : 500, cursor:"pointer", transition:"all 0.15s" }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Konsentrasi */}
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:11, color:"#FF7043", letterSpacing:1.5, textTransform:"uppercase", fontWeight:600 }}>
                Konsentrasi <span style={{ color:"#ef9a9a" }}>*</span>
              </label>
              <div style={{ display:"flex", gap:10, marginTop:10 }}>
                {KONSENTRASI_GSB.map(k => (
                  <button key={k} onClick={() => setKonsentrasi(k)}
                    style={{ flex:1, padding:"16px 0", borderRadius:12, border: konsentrasi === k ? "2px solid #FF7043" : "1px solid rgba(255,255,255,0.14)", background: konsentrasi === k ? "rgba(255,112,67,0.2)" : "rgba(255,255,255,0.04)", color: konsentrasi === k ? "#FF7043" : "rgba(255,255,255,0.65)", fontSize:15, fontWeight: konsentrasi === k ? 800 : 500, cursor:"pointer", transition:"all 0.15s" }}>
                    {k}
                  </button>
                ))}
              </div>
            </div>

            {/* Penggunaan (gram) */}
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:11, color:"#FF7043", letterSpacing:1.5, textTransform:"uppercase", fontWeight:600 }}>
                Penggunaan <span style={{ color:"#ef9a9a" }}>*</span>
              </label>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:10 }}>
                <input
                  type="number" inputMode="numeric" value={penggunaanGram}
                  onChange={e => setPenggunaanGram(e.target.value)}
                  placeholder="0"
                  style={{ flex:1, padding:"16px", background:"rgba(255,255,255,0.06)", border:`1px solid ${penggunaanGram ? "rgba(255,112,67,0.5)" : "rgba(255,255,255,0.12)"}`, borderRadius:12, color:"#fff", fontSize:24, fontWeight:700, outline:"none", textAlign:"center" }}
                />
                <div style={{ padding:"16px 14px", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, color:"rgba(255,255,255,0.5)", fontSize:14, whiteSpace:"nowrap" }}>
                  gram
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ FORM PENGAMBILAN OBAT ═══════════════════════════════════════════════ */}
        {step === "form_ambil" && adaPengambilan === true && (
          <div>
            <h2 style={{ fontSize:20, fontWeight:700, margin:"0 0 20px", color:"#fff" }}>Data Pengambilan</h2>

            {/* Nama Obat */}
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:11, color:"#64B5F6", letterSpacing:1.5, textTransform:"uppercase", fontWeight:600 }}>
                Nama Obat / Produk <span style={{ color:"#ef9a9a" }}>*</span>
              </label>
              <input type="text" value={ambilData.namaObat}
                onChange={e => setAmbilData(d => ({...d, namaObat:e.target.value}))}
                placeholder="Nama pestisida / fungisida..."
                style={{ width:"100%", marginTop:8, padding:"12px 14px", background:"rgba(255,255,255,0.06)", border:`1px solid ${ambilData.namaObat ? "rgba(100,181,246,0.4)" : "rgba(255,255,255,0.12)"}`, borderRadius:10, color:"#fff", fontSize:14, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }}
              />
            </div>

            {/* Jumlah + Satuan */}
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:11, color:"#64B5F6", letterSpacing:1.5, textTransform:"uppercase", fontWeight:600 }}>
                Jumlah <span style={{ color:"#ef9a9a" }}>*</span>
              </label>
              <div style={{ display:"flex", gap:8, marginTop:8 }}>
                <input type="number" inputMode="numeric" value={ambilData.jumlah}
                  onChange={e => setAmbilData(d => ({...d, jumlah:e.target.value}))}
                  placeholder="0"
                  style={{ flex:1, padding:"12px", background:"rgba(255,255,255,0.06)", border:`1px solid ${ambilData.jumlah ? "rgba(100,181,246,0.4)" : "rgba(255,255,255,0.12)"}`, borderRadius:10, color:"#fff", fontSize:18, fontWeight:700, outline:"none", textAlign:"center" }}
                />
                <select value={ambilData.satuan} onChange={e => setAmbilData(d => ({...d, satuan:e.target.value}))}
                  style={{ width:72, padding:"12px 6px", background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:10, color:"rgba(255,255,255,0.8)", fontSize:13, outline:"none", cursor:"pointer", textAlign:"center" }}>
                  <option value="ml">ml</option>
                  <option value="g">g</option>
                  <option value="L">L</option>
                  <option value="kg">kg</option>
                  <option value="pcs">pcs</option>
                </select>
              </div>
            </div>

            {/* Keterangan */}
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:11, color:"#64B5F6", letterSpacing:1.5, textTransform:"uppercase", fontWeight:600 }}>Keterangan</label>
              <textarea value={ambilData.keterangan} onChange={e => setAmbilData(d => ({...d, keterangan:e.target.value}))}
                placeholder="Catatan pengambilan (opsional)..."
                rows={2}
                style={{ width:"100%", marginTop:8, padding:"9px 12px", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:8, color:"#fff", fontSize:13, outline:"none", resize:"none", boxSizing:"border-box", fontFamily:"inherit" }}
              />
            </div>

            {/* Info: field lanjutan akan ditambahkan */}
            <div style={{ padding:"10px 14px", background:"rgba(255,179,0,0.07)", border:"1px solid rgba(255,179,0,0.2)", borderRadius:10, fontSize:12, color:"rgba(255,179,0,0.75)", marginTop:8 }}>
              🚧 Field detail pengambilan akan dilengkapi sesuai rekap
            </div>
          </div>
        )}

        {/* ══ FORM PENGGUNAAN OBAT ════════════════════════════════════════════════ */}
        {step === "form_guna" && (
          <div>
            <h2 style={{ fontSize:20, fontWeight:700, margin:"0 0 8px", color:"#fff" }}>Data Penggunaan Obat</h2>
            <p style={{ fontSize:13, color:"rgba(255,255,255,0.4)", marginBottom:20 }}>
              {adaPengambilan
                ? "Ada pengambilan hari ini — isi detail penggunaan"
                : "Tidak ada pengambilan — isi detail penggunaan"}
            </p>

            {/* Placeholder — field akan diisi sesuai rekap dari user */}
            <div style={{ background:"rgba(255,255,255,0.03)", border:"1px dashed rgba(255,255,255,0.14)", borderRadius:14, padding:"28px 20px", textAlign:"center", marginBottom:16 }}>
              <div style={{ fontSize:32, marginBottom:10 }}>🚧</div>
              <div style={{ fontSize:14, fontWeight:700, color:"rgba(255,255,255,0.55)", marginBottom:6 }}>Field Penggunaan Obat</div>
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.3)" }}>Detail field akan ditambahkan sesuai rekap kebutuhan</div>
            </div>

            {/* Catatan sementara */}
            <div style={{ marginBottom:8 }}>
              <label style={{ fontSize:11, color:"#64B5F6", letterSpacing:1.5, textTransform:"uppercase", fontWeight:600 }}>Catatan Sementara</label>
              <textarea value={gunaData.catatan} onChange={e => setGunaData(d => ({...d, catatan:e.target.value}))}
                placeholder="Tulis catatan penggunaan sementara..."
                rows={3}
                style={{ width:"100%", marginTop:8, padding:"9px 12px", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:8, color:"#fff", fontSize:13, outline:"none", resize:"none", boxSizing:"border-box", fontFamily:"inherit" }}
              />
            </div>
          </div>
        )}

        {/* ══ REKAP ══════════════════════════════════════════════════════════════ */}
        {step === "rekap" && (
          <div>
            <h2 style={{ fontSize:20, fontWeight:700, margin:"0 0 4px", color:"#fff" }}>Konfirmasi Data</h2>
            <p style={{ fontSize:13, color:"rgba(255,255,255,0.4)", marginBottom:18 }}>Periksa kembali sebelum submit</p>

            {isDemoMode && (
              <div style={{ background:"rgba(255,179,0,0.08)", border:"1px solid rgba(255,179,0,0.25)", borderRadius:10, padding:"10px 14px", marginBottom:14, display:"flex", alignItems:"center", gap:10 }}>
                <span>⚠️</span>
                <div style={{ fontSize:12, color:"#FFB300" }}>Mode Demo — data tidak akan dikirim ke Sheets</div>
              </div>
            )}
            {!isOnline && (
              <div style={{ background:"rgba(255,179,0,0.08)", border:"1px solid rgba(255,179,0,0.25)", borderRadius:10, padding:"10px 14px", marginBottom:14, display:"flex", alignItems:"center", gap:10 }}>
                <span>📵</span>
                <div style={{ fontSize:12, color:"#FFB300" }}>Offline — akan disimpan lokal & dikirim saat online</div>
              </div>
            )}

            {/* Summary table */}
            <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:12, overflow:"hidden", marginBottom:16 }}>
              {[
                { label:"Tanggal",  value: todayISO },
                { label:"GH",       value: selectedGH },
                { label:"Kegiatan", value: activity === "oles_gsb" ? "🖌️ Oles GSB" : "💊 Penggunaan & Pengambilan" },
                ...(activity === "oles_gsb" ? [
                  { label:"Pestisida",    value: pestisida },
                  { label:"Konsentrasi", value: konsentrasi },
                  { label:"Penggunaan",  value: `${penggunaanGram} gram` },
                ] : [
                  { label:"Ada Pengambilan", value: adaPengambilan ? "Ya" : "Tidak" },
                  ...(adaPengambilan ? [
                    { label:"Nama Obat", value: ambilData.namaObat },
                    { label:"Jumlah",    value: `${ambilData.jumlah} ${ambilData.satuan}` },
                    ...(ambilData.keterangan ? [{ label:"Ket. Ambil", value: ambilData.keterangan }] : []),
                  ] : []),
                  ...(gunaData.catatan ? [{ label:"Catatan",   value: gunaData.catatan }] : []),
                ]),
              ].map((item, i, arr) => (
                <div key={i} style={{ display:"flex", padding:"11px 16px", borderBottom: i < arr.length-1 ? "1px solid rgba(255,255,255,0.05)" : "none", gap:12 }}>
                  <span style={{ fontSize:13, color:"rgba(255,255,255,0.38)", minWidth:120 }}>{item.label}</span>
                  <span style={{ fontSize:13, color:"#fff", fontWeight:600, flex:1 }}>{item.value}</span>
                </div>
              ))}
            </div>

            {/* Nama operator */}
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:11, color:"#64B5F6", letterSpacing:1.5, textTransform:"uppercase", fontWeight:600 }}>
                👤 Nama Operator <span style={{ color:"#ef9a9a" }}>*</span>
              </label>
              <input type="text" value={operator} onChange={e => setOperator(e.target.value)}
                placeholder="Tulis nama lengkap..."
                style={{ width:"100%", marginTop:8, padding:"12px 14px", background:"rgba(255,255,255,0.06)", border:`1px solid ${operator.trim() ? "rgba(100,181,246,0.4)" : "rgba(255,255,255,0.12)"}`, borderRadius:10, color:"#fff", fontSize:15, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }}
              />
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
            <div style={{ fontSize:60, marginBottom:14 }}>
              {isDemoMode ? "🧪" : savedOffline ? "💾" : "✅"}
            </div>
            <h2 style={{ fontSize:22, fontWeight:800, color: isDemoMode ? "#FFB300" : savedOffline ? "#64B5F6" : "#1E88E5", margin:"0 0 8px" }}>
              {isDemoMode ? "Demo Selesai!" : savedOffline ? "Tersimpan Lokal!" : "Data Tersimpan!"}
            </h2>
            <p style={{ fontSize:14, color:"rgba(255,255,255,0.5)", margin:"0 0 20px" }}>
              {isDemoMode ? "Data tidak dikirim (mode demo)" : savedOffline ? "Akan terkirim otomatis saat online." : "Berhasil dikirim ke Google Sheets"}
            </p>

            {savedOffline && pendingCount > 0 && (
              <div style={{ background:"rgba(33,150,243,0.08)", border:"1px solid rgba(33,150,243,0.25)", borderRadius:10, padding:"10px 14px", marginBottom:16, textAlign:"left" }}>
                <div style={{ fontSize:12, color:"#64B5F6" }}>{pendingCount} record menunggu sync saat online.</div>
              </div>
            )}

            <div style={{ background:"rgba(30,136,229,0.08)", border:"1px solid rgba(30,136,229,0.3)", borderRadius:12, padding:"14px 16px", marginBottom:20, textAlign:"left" }}>
              <div style={{ fontSize:13, color:"rgba(255,255,255,0.7)", fontWeight:600 }}>{selectedGH} · {todayISO}</div>
              <div style={{ fontSize:13, color:"rgba(255,255,255,0.5)", marginTop:4 }}>
                {activity === "oles_gsb"
                  ? `🖌️ ${pestisida} · ${konsentrasi} · ${penggunaanGram} gram`
                  : `💊 ${adaPengambilan ? `Ambil: ${ambilData.namaObat} ${ambilData.jumlah}${ambilData.satuan}` : "Tidak ada pengambilan"}`}
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

          {/* Kembali */}
          {navHistory.length > 0 && (
            <button onClick={goBack}
              style={{ flex:1, padding:"14px", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:12, color:"rgba(255,255,255,0.7)", fontSize:14, fontWeight:600, cursor:"pointer" }}>
              ← Kembali
            </button>
          )}

          {/* START → lanjut */}
          {step === "start" && (
            <button onClick={() => navigateTo(activity === "oles_gsb" ? "form_oles" : "form_ambil")}
              disabled={!canStart}
              style={{ flex:2, padding:"14px", border:"none", borderRadius:12, background: canStart ? `linear-gradient(135deg, ${activityColor}cc, ${activityColor})` : "rgba(255,255,255,0.06)", color: canStart ? "#fff" : "rgba(255,255,255,0.3)", fontSize:15, fontWeight:700, cursor: canStart ? "pointer" : "not-allowed", transition:"all 0.2s" }}>
              Lanjut →
            </button>
          )}

          {/* FORM OLES GSB → Rekap */}
          {step === "form_oles" && (
            <button onClick={() => navigateTo("rekap")}
              disabled={!canOlesGSB}
              style={{ flex:2, padding:"14px", border:"none", borderRadius:12, background: canOlesGSB ? "linear-gradient(135deg, #bf360c, #FF7043)" : "rgba(255,255,255,0.06)", color: canOlesGSB ? "#fff" : "rgba(255,255,255,0.3)", fontSize:15, fontWeight:700, cursor: canOlesGSB ? "pointer" : "not-allowed", transition:"all 0.2s" }}>
              Review Data →
            </button>
          )}

          {/* FORM AMBIL → dua opsi */}
          {step === "form_ambil" && adaPengambilan === true && (
            <>
              <button onClick={() => navigateTo("form_guna")}
                disabled={!canAmbil}
                style={{ flex:2, padding:"14px", border:"none", borderRadius:12, background: canAmbil ? "linear-gradient(135deg, #1565C0, #1E88E5)" : "rgba(255,255,255,0.06)", color: canAmbil ? "#fff" : "rgba(255,255,255,0.3)", fontSize:13, fontWeight:700, cursor: canAmbil ? "pointer" : "not-allowed", transition:"all 0.2s" }}>
                + ke Penggunaan →
              </button>
              <button onClick={() => navigateTo("rekap")}
                disabled={!canAmbil}
                style={{ flex:2, padding:"14px", border:`1px solid ${canAmbil ? "rgba(100,181,246,0.4)" : "rgba(255,255,255,0.08)"}`, borderRadius:12, background:"transparent", color: canAmbil ? "#64B5F6" : "rgba(255,255,255,0.3)", fontSize:13, fontWeight:700, cursor: canAmbil ? "pointer" : "not-allowed", transition:"all 0.2s" }}>
                Langsung Rekap →
              </button>
            </>
          )}

          {/* FORM GUNA → Rekap */}
          {step === "form_guna" && (
            <button onClick={() => navigateTo("rekap")}
              style={{ flex:2, padding:"14px", border:"none", borderRadius:12, background:"linear-gradient(135deg, #1565C0, #1E88E5)", color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer" }}>
              Review Data →
            </button>
          )}

          {/* REKAP → Submit */}
          {step === "rekap" && (
            <button onClick={handleSubmit}
              disabled={syncing || !canSubmit}
              style={{ flex:2, padding:"14px", border:"none", borderRadius:12, background: syncing ? "rgba(30,136,229,0.3)" : !canSubmit ? "rgba(255,255,255,0.06)" : isDemoMode ? "linear-gradient(135deg, #5d4037, #795548)" : !isOnline ? "linear-gradient(135deg, #1565C0, #1976D2)" : "linear-gradient(135deg, #0d47a1, #1565C0)", color: canSubmit ? "#fff" : "rgba(255,255,255,0.3)", fontSize:15, fontWeight:700, cursor: syncing || !canSubmit ? "not-allowed" : "pointer" }}>
              {syncing ? "⏳ Mengirim..." : isDemoMode ? "Submit Demo 🧪" : !isOnline ? "💾 Simpan Offline" : "Submit ✓"}
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
