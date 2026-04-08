import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";

const SCRIPT_URL = import.meta.env.VITE_GAS_PENYIRAMAN_URL;

// ─── Tipe GH & mapping nama GH statis ────────────────────────
const GH_PER_TIPE = {
  "Drip/Kolam (Tohudan)": [
    "TOHUDAN 1","TOHUDAN 2","TOHUDAN 3","TOHUDAN 4","TOHUDAN 5","TOHUDAN 6",
    "TOHUDAN 7","TOHUDAN 8","TOHUDAN 9","TOHUDAN 10","TOHUDAN 11","TOHUDAN 12",
    "COLOMADU 1","COLOMADU 2","COLOMADU 3","COLOMADU 4",
  ],
  "Drip (Bergas)": [
    "BERGAS 1","BERGAS 2","BERGAS 3","BERGAS 4","BERGAS 5","BERGAS 7","BERGAS 8",
  ],
  "Kolam (Sawahan)": [
    "SAWAHAN 1","SAWAHAN 2","SAWAHAN 3","SAWAHAN 4",
  ],
  "Dutch Bucket": [
    "TOHUDAN 13","TOHUDAN 14","TOHUDAN 15","TOHUDAN 16","TOHUDAN 17",
    "TOHUDAN 18","TOHUDAN 19","TOHUDAN 20","TOHUDAN 21",
  ],
};

const TIPE_LIST = Object.keys(GH_PER_TIPE);

function hstColor(hst) {
  if (hst === null) return { bg: "#f5f5f5", text: "#aaa", border: "#e0e0e0" };
  if (hst <= 21)   return { bg: "#e8f5e9", text: "#2e7d32", border: "#a5d6a7" };
  if (hst <= 40)   return { bg: "#fff8e1", text: "#f57f17", border: "#ffe082" };
  return               { bg: "#fbe9e7", text: "#bf360c", border: "#ffab91" };
}

const isMultiSuhuRH = (gh) => gh === "SAWAHAN 3" || gh === "SAWAHAN 4";
const isDutchBucket = (tipe) => tipe === "Dutch Bucket";

const todayISO = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
const todayLabel = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

// ─── Input Component ──────────────────────────────────────────
function Field({ label, value, onChange, placeholder, satuan, type = "number" }) {
  const filled = value !== "";
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#388e3c", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 5 }}>
        {label} {satuan && <span style={{ fontWeight: 400, color: "#aaa", textTransform: "none" }}>({satuan})</span>}
      </div>
      <input
        type={type} inputMode={type === "number" ? "decimal" : "text"} value={value}
        onChange={e => onChange(e.target.value)} placeholder={placeholder || `Isi ${label}`}
        style={{
          width: "100%", height: 40, padding: "0 12px",
          border: `1.5px solid ${filled ? "#81c784" : "#e0e0e0"}`,
          borderRadius: 10, fontSize: 14, fontWeight: 600,
          color: filled ? "#2e7d32" : "#999", outline: "none",
          background: "#fff", boxSizing: "border-box", fontFamily: "inherit",
        }}
      />
    </div>
  );
}

// ─── Rekap Row ────────────────────────────────────────────────
function RekapRow({ label, value, satuan }) {
  if (value === "" || value === undefined) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #f0f0f0" }}>
      <span style={{ fontSize: 13, color: "#666" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: "#2e7d32" }}>{value}{satuan ? ` ${satuan}` : ""}</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────
export default function Penyiraman() {
  const { user } = useAuth();

  const [step, setStep] = useState(1);
  const [tipe, setTipe] = useState("");
  const [gh, setGh] = useState("");
  const [varian, setVarian] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [isOnline] = useState(navigator.onLine);

  // REF data dari GAS
  const [refData, setRefData] = useState({});
  const [loadingRef, setLoadingRef] = useState(true);

  useEffect(() => {
    fetch(`${SCRIPT_URL}?action=getREF`)
      .then(r => r.json())
      .then(json => {
        if (json.success) setRefData(json.data);
      })
      .catch(() => {}) // fallback ke static jika gagal
      .finally(() => setLoadingRef(false));
  }, []);

  // Field Drip/Kolam
  const [ecIn, setEcIn] = useState("");
  const [ecOut, setEcOut] = useState("");
  const [phIn, setPhIn] = useState("");
  const [phOut, setPhOut] = useState("");
  const [volume, setVolume] = useState("");
  const [volNutrisi, setVolNutrisi] = useState("");
  const [suhu, setSuhu] = useState("");
  const [rh, setRh] = useState("");

  // Multi suhu/RH untuk Sawahan 3 & 4
  const [suhuArr, setSuhuArr] = useState(["", "", "", ""]);
  const [rhArr, setRhArr] = useState(["", "", "", ""]);

  // Field Dutch Bucket
  const [ecTandon, setEcTandon] = useState("");
  const [ecBucket, setEcBucket] = useState("");
  const [phTandon, setPhTandon] = useState("");
  const [phBucket, setPhBucket] = useState("");
  const [doTandon, setDoTandon] = useState("");
  const [doBucket, setDoBucket] = useState("");
  const [suhuDB, setSuhuDB] = useState("");
  const [rhDB, setRhDB] = useState("");
  const [volNutrisiDB, setVolNutrisiDB] = useState("");

  const resetForm = () => {
    setStep(1); setTipe(""); setGh(""); setVarian(""); setSubmitError(null);
    setEcIn(""); setEcOut(""); setPhIn(""); setPhOut("");
    setVolume(""); setVolNutrisi(""); setSuhu(""); setRh("");
    setSuhuArr(["","","",""]); setRhArr(["","","",""]);
    setEcTandon(""); setEcBucket(""); setPhTandon(""); setPhBucket("");
    setDoTandon(""); setDoBucket(""); setSuhuDB(""); setRhDB(""); setVolNutrisiDB("");
  };

  const multiSuhuRH = isMultiSuhuRH(gh);
  const isDB = isDutchBucket(tipe);

  // Cek form lengkap
  const canNext = () => {
    if (step === 1) {
      if (!tipe || !gh) return false;
      if (!isDB && !varian) return false;
      return true;
    }
    if (step === 2) {
      if (isDB) {
        return ecTandon && ecBucket && phTandon && phBucket && doTandon && doBucket && suhuDB && rhDB && volNutrisiDB;
      }
      const baseOk = ecIn && ecOut && phIn && phOut && volume && volNutrisi;
      if (multiSuhuRH) return baseOk && suhuArr.every(v => v !== "") && rhArr.every(v => v !== "");
      return baseOk && suhu && rh;
    }
    return true;
  };

  const buildPayload = () => {
    const suhuVal = multiSuhuRH ? suhuArr.join(", ") : (isDB ? suhuDB : suhu);
    const rhVal   = multiSuhuRH ? rhArr.join(", ")   : (isDB ? rhDB   : rh);
    return {
      action: "submitPenyiraman",
      tanggal: todayISO,
      operator: user?.nama || "",
      tipe,
      gh,
      varian: isDB ? "" : varian,
      // Drip/Kolam
      ecIn:      isDB ? "" : ecIn,
      ecOut:     isDB ? "" : ecOut,
      phIn:      isDB ? "" : phIn,
      phOut:     isDB ? "" : phOut,
      volume:    isDB ? "" : volume,
      volNutrisi: isDB ? volNutrisiDB : volNutrisi,
      suhu:      suhuVal,
      rh:        rhVal,
      // Dutch Bucket
      ecTandon:  isDB ? ecTandon  : "",
      ecBucket:  isDB ? ecBucket  : "",
      phTandon:  isDB ? phTandon  : "",
      phBucket:  isDB ? phBucket  : "",
      doTandon:  isDB ? doTandon  : "",
      doBucket:  isDB ? doBucket  : "",
    };
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    const payload = buildPayload();
    try {
      const res = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload),
        redirect: "follow",
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "GAS error");
      setStep(4);
    } catch (err) {
      setSubmitError("Gagal kirim data. Periksa koneksi. " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ─── RENDER ────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5", fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>

      {/* Header */}
      <div style={{ background: "#0277bd", color: "#fff", padding: "14px 16px 10px", position: "sticky", top: 0, zIndex: 10, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, opacity: 0.75, letterSpacing: 1.5, textTransform: "uppercase" }}>Form Penyiraman</div>
            <div style={{ fontSize: 13, opacity: 0.65, marginTop: 1 }}>{todayLabel}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: isOnline ? "#a5d6a7" : "#ef9a9a" }} />
            <span style={{ fontSize: 10, opacity: 0.6 }}>{user?.nama}</span>
          </div>
        </div>
        {step < 4 && (
          <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
            {[1, 2, 3].map(s => (
              <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: s <= step ? "#81d4fa" : "rgba(255,255,255,0.2)", transition: "background 0.3s" }} />
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: 16 }}>

        {/* ══ STEP 1 — Pilih Tipe, GH & Varian ══ */}
        {step === 1 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: "#0277bd", marginBottom: 4 }}>Pilih Tipe & Greenhouse</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>Pilih tipe sistem irigasi terlebih dahulu</div>

            {/* Tipe GH */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#0277bd", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Tipe GH</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {TIPE_LIST.map(t => (
                  <button key={t} onClick={() => { setTipe(t); setGh(""); setVarian(""); }}
                    style={{
                      padding: "12px 16px", borderRadius: 12, cursor: "pointer", textAlign: "left",
                      border: tipe === t ? "2px solid #0277bd" : "1.5px solid #e0e0e0",
                      background: tipe === t ? "#e1f5fe" : "#fff",
                      color: tipe === t ? "#0277bd" : "#333",
                      fontSize: 14, fontWeight: tipe === t ? 700 : 500,
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      transition: "all 0.2s",
                    }}>
                    <span>{t}</span>
                    {tipe === t && <span style={{ fontSize: 16 }}>✓</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Pilih GH */}
            {tipe && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#0277bd", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
                  Nama Greenhouse
                  {loadingRef && <span style={{ fontSize: 10, fontWeight: 400, color: "#aaa", marginLeft: 8 }}>memuat data...</span>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {GH_PER_TIPE[tipe].map(g => {
                    const info = refData[g];
                    const hst  = info?.hst ?? null;
                    const c    = hstColor(hst);
                    const selected = gh === g;
                    return (
                      <button key={g} onClick={() => { setGh(g); setVarian(""); }}
                        style={{
                          padding: "10px 8px", borderRadius: 10, cursor: "pointer", textAlign: "center",
                          border: selected ? "2px solid #0277bd" : "1px solid #e0e0e0",
                          background: selected ? "#e1f5fe" : "#fff",
                          color: selected ? "#0277bd" : "#333",
                          fontSize: 13, fontWeight: selected ? 700 : 500,
                          transition: "all 0.2s",
                        }}>
                        <div>{g}</div>
                        {info?.periode && (
                          <div style={{ fontSize: 10, color: "#aaa", marginTop: 2 }}>P{info.periode}</div>
                        )}
                        {hst !== null && (
                          <div style={{ marginTop: 4, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 6, padding: "2px 6px", display: "inline-block" }}>
                            <span style={{ fontSize: 12, fontWeight: 800, color: c.text }}>{hst}</span>
                            <span style={{ fontSize: 9, color: c.text, marginLeft: 2 }}>HST</span>
                          </div>
                        )}
                        {selected && <div style={{ fontSize: 11, marginTop: 3 }}>✓</div>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Pilih Varian — hanya non-Dutch Bucket */}
            {tipe && gh && !isDB && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#0277bd", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Varian</div>
                {loadingRef ? (
                  <div style={{ fontSize: 12, color: "#aaa" }}>Memuat varian...</div>
                ) : (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {(refData[gh]?.varian?.length > 0 ? refData[gh].varian : ["Elysia", "Greeniegal"]).map(v => (
                      <button key={v} onClick={() => setVarian(v)}
                        style={{
                          padding: "10px 20px", borderRadius: 10, cursor: "pointer",
                          border: varian === v ? "2px solid #0277bd" : "1px solid #e0e0e0",
                          background: varian === v ? "#e1f5fe" : "#fff",
                          color: varian === v ? "#0277bd" : "#333",
                          fontSize: 14, fontWeight: varian === v ? 700 : 500,
                          transition: "all 0.2s",
                        }}>
                        {v} {varian === v && "✓"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══ STEP 2 — Input Data ══ */}
        {step === 2 && (
          <div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
              <div style={{ background: "#e1f5fe", border: "1px solid #81d4fa", borderRadius: 20, padding: "3px 12px", fontSize: 12, color: "#0277bd", fontWeight: 700 }}>{gh}</div>
              <div style={{ background: "#f5f5f5", borderRadius: 20, padding: "3px 12px", fontSize: 12, color: "#666" }}>{tipe}</div>
              {!isDB && varian && (
                <div style={{ background: "#e8f5e9", border: "1px solid #a5d6a7", borderRadius: 20, padding: "3px 12px", fontSize: 12, color: "#2e7d32", fontWeight: 700 }}>🌱 {varian}</div>
              )}
            </div>

            {/* Dutch Bucket */}
            {isDB && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#0277bd", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>💧 Data Tandon & Bucket</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <Field label="EC Tandon"  value={ecTandon}  onChange={setEcTandon}  satuan="mS/cm" placeholder="0.0" />
                  <Field label="EC Bucket"  value={ecBucket}  onChange={setEcBucket}  satuan="mS/cm" placeholder="0.0" />
                  <Field label="pH Tandon"  value={phTandon}  onChange={setPhTandon}  placeholder="0.0" />
                  <Field label="pH Bucket"  value={phBucket}  onChange={setPhBucket}  placeholder="0.0" />
                  <Field label="DO Tandon"  value={doTandon}  onChange={setDoTandon}  satuan="mg/L" placeholder="0.0" />
                  <Field label="DO Bucket"  value={doBucket}  onChange={setDoBucket}  satuan="mg/L" placeholder="0.0" />
                  <Field label="Suhu"       value={suhuDB}    onChange={setSuhuDB}    satuan="°C" placeholder="0.0" />
                  <Field label="RH"         value={rhDB}      onChange={setRhDB}      satuan="%" placeholder="0" />
                </div>
                <Field label="Volume Nutrisi" value={volNutrisiDB} onChange={setVolNutrisiDB} satuan="L" placeholder="0" />
              </div>
            )}

            {/* Drip / Kolam */}
            {!isDB && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#0277bd", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>💧 Data Penyiraman</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <Field label="EC In"  value={ecIn}  onChange={setEcIn}  satuan="mS/cm" placeholder="0.0" />
                  <Field label="EC Out" value={ecOut} onChange={setEcOut} satuan="mS/cm" placeholder="0.0" />
                  <Field label="pH In"  value={phIn}  onChange={setPhIn}  placeholder="0.0" />
                  <Field label="pH Out" value={phOut} onChange={setPhOut} placeholder="0.0" />
                </div>
                <Field label="Volume" value={volume} onChange={setVolume} satuan="ml/tanaman" placeholder="0" />
                <Field label="Volume Nutrisi" value={volNutrisi} onChange={setVolNutrisi} satuan="L" placeholder="0" />

                {/* Suhu & RH */}
                {multiSuhuRH ? (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#0277bd", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>🌡️ Suhu & RH (4 Alat)</div>
                    {[0,1,2,3].map(idx => (
                      <div key={idx} style={{ background: "#f9fbe7", border: "1px solid #dce775", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#558b2f", marginBottom: 8 }}>Alat {idx + 1}</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <Field label="Suhu" value={suhuArr[idx]} onChange={v => { const a=[...suhuArr]; a[idx]=v; setSuhuArr(a); }} satuan="°C" placeholder="0.0" />
                          <Field label="RH"   value={rhArr[idx]}   onChange={v => { const a=[...rhArr];   a[idx]=v; setRhArr(a);   }} satuan="%" placeholder="0" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <Field label="Suhu" value={suhu} onChange={setSuhu} satuan="°C" placeholder="0.0" />
                    <Field label="RH"   value={rh}   onChange={setRh}   satuan="%" placeholder="0" />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══ STEP 3 — Rekap ══ */}
        {step === 3 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: "#0277bd", marginBottom: 4 }}>Cek Data Sebelum Submit</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>Pastikan semua data sudah benar</div>

            <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#0277bd", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>📋 Informasi Umum</div>
              <RekapRow label="Tanggal"  value={todayISO} />
              <RekapRow label="Operator" value={user?.nama} />
              <RekapRow label="Tipe GH"  value={tipe} />
              <RekapRow label="GH"       value={gh} />
              {!isDB && <RekapRow label="Varian" value={varian} />}
            </div>

            <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#0277bd", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>💧 Data Penyiraman</div>
              {isDB ? (
                <>
                  <RekapRow label="EC Tandon"      value={ecTandon}     satuan="mS/cm" />
                  <RekapRow label="EC Bucket"      value={ecBucket}     satuan="mS/cm" />
                  <RekapRow label="pH Tandon"      value={phTandon} />
                  <RekapRow label="pH Bucket"      value={phBucket} />
                  <RekapRow label="DO Tandon"      value={doTandon}     satuan="mg/L" />
                  <RekapRow label="DO Bucket"      value={doBucket}     satuan="mg/L" />
                  <RekapRow label="Suhu"           value={suhuDB}       satuan="°C" />
                  <RekapRow label="RH"             value={rhDB}         satuan="%" />
                  <RekapRow label="Volume Nutrisi" value={volNutrisiDB} satuan="L" />
                </>
              ) : (
                <>
                  <RekapRow label="EC In"          value={ecIn}       satuan="mS/cm" />
                  <RekapRow label="EC Out"         value={ecOut}      satuan="mS/cm" />
                  <RekapRow label="pH In"          value={phIn} />
                  <RekapRow label="pH Out"         value={phOut} />
                  <RekapRow label="Volume"         value={volume}     satuan="ml/tanaman" />
                  <RekapRow label="Volume Nutrisi" value={volNutrisi} satuan="L" />
                  {multiSuhuRH ? (
                    <>
                      <RekapRow label="Suhu (4 alat)" value={suhuArr.join(", ")} satuan="°C" />
                      <RekapRow label="RH (4 alat)"   value={rhArr.join(", ")}   satuan="%" />
                    </>
                  ) : (
                    <>
                      <RekapRow label="Suhu" value={suhu} satuan="°C" />
                      <RekapRow label="RH"   value={rh}   satuan="%" />
                    </>
                  )}
                </>
              )}
            </div>

            {submitError && (
              <div style={{ fontSize: 12, color: "#c62828", background: "#ffebee", border: "1px solid #ef9a9a", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>
                ⚠️ {submitError}
              </div>
            )}
          </div>
        )}

        {/* ══ STEP 4 — Sukses ══ */}
        {step === 4 && (
          <div style={{ textAlign: "center", paddingTop: 32 }}>
            <div style={{ fontSize: 60, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 21, fontWeight: 800, color: "#0277bd", marginBottom: 6 }}>Data Tersimpan!</div>
            <div style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>Data penyiraman berhasil dikirim ke Google Sheets</div>
            <div style={{ background: "#e1f5fe", border: "1px solid #81d4fa", borderRadius: 14, padding: 16, textAlign: "left", marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0277bd" }}>{gh} · {tipe}</div>
              {!isDB && varian && <div style={{ fontSize: 13, color: "#2e7d32", marginTop: 2 }}>🌱 {varian}</div>}
              <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>Operator: {user?.nama} · {todayISO}</div>
            </div>
            <button onClick={resetForm} style={{ width: "100%", padding: 15, background: "#e1f5fe", border: "2px solid #81d4fa", borderRadius: 12, color: "#0277bd", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              + Input Penyiraman Berikutnya
            </button>
          </div>
        )}

      </div>

      {/* Bottom Nav */}
      {step < 4 && (
        <div style={{ padding: "12px 16px 24px", borderTop: "1px solid #e0e0e0", background: "#fff", position: "sticky", bottom: 0, display: "flex", gap: 10 }}>
          {step > 1 && (
            <button onClick={() => { setStep(s => s - 1); setSubmitError(null); }}
              style={{ flex: 1, padding: 13, background: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: 12, color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              ← Kembali
            </button>
          )}
          {step < 3 && (
            <button onClick={() => setStep(s => s + 1)} disabled={!canNext()}
              style={{ flex: 2, padding: 13, border: "none", borderRadius: 12, background: canNext() ? "linear-gradient(135deg,#0277bd,#0288d1)" : "#e0e0e0", color: canNext() ? "#fff" : "#aaa", fontSize: 15, fontWeight: 700, cursor: canNext() ? "pointer" : "not-allowed" }}>
              {step === 1 ? "Lanjut Input →" : "Lihat Rekap →"}
            </button>
          )}
          {step === 3 && (
            <button onClick={handleSubmit} disabled={submitting}
              style={{ flex: 2, padding: 13, border: "none", borderRadius: 12, background: submitting ? "#e0e0e0" : "linear-gradient(135deg,#0277bd,#0288d1)", color: submitting ? "#aaa" : "#fff", fontSize: 15, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer" }}>
              {submitting ? "⏳ Mengirim..." : "Submit ✓"}
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
