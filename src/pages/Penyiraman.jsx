import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";

const SCRIPT_URL = import.meta.env.VITE_GAS_PENYIRAMAN_URL;

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
const isMultiSuhuRH = (gh) => gh === "SAWAHAN 3" || gh === "SAWAHAN 4";
const isDutchBucket = (tipe) => tipe === "Dutch Bucket";

const todayISO   = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
const todayLabel = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

function hstColor(hst) {
  if (hst === null || hst === undefined) return { bg: "#f5f5f5", text: "#aaa", border: "#e0e0e0" };
  if (hst <= 21) return { bg: "#e8f5e9", text: "#2e7d32", border: "#a5d6a7" };
  if (hst <= 40) return { bg: "#fff8e1", text: "#f57f17", border: "#ffe082" };
  return             { bg: "#fbe9e7", text: "#bf360c", border: "#ffab91" };
}

function initVarianData() {
  return { ecIn: "", ecOut: "", phIn: "", phOut: "", volume: "", volNutrisi: "", suhu: "", rh: "", suhuArr: ["","","",""], rhArr: ["","","",""] };
}

function Field({ label, value, onChange, placeholder, satuan, type = "number" }) {
  const filled = value !== "";
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#0277bd", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 3 }}>
        {label} {satuan && <span style={{ fontWeight: 400, color: "#aaa", textTransform: "none" }}>({satuan})</span>}
      </div>
      <input
        type={type} inputMode={type === "number" ? "decimal" : "text"} value={value}
        onChange={e => onChange(e.target.value)} placeholder={placeholder || "0"}
        style={{
          width: "100%", height: 38, padding: "0 10px",
          border: `1.5px solid ${filled ? "#81c784" : "#e0e0e0"}`,
          borderRadius: 8, fontSize: 13, fontWeight: 600,
          color: filled ? "#2e7d32" : "#bbb", outline: "none",
          background: "#fff", boxSizing: "border-box", fontFamily: "inherit",
        }}
      />
    </div>
  );
}

function RekapRow({ label, value, satuan }) {
  if (value === "" || value === undefined || value === null) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f0f0f0" }}>
      <span style={{ fontSize: 12, color: "#666" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#2e7d32" }}>{value}{satuan ? ` ${satuan}` : ""}</span>
    </div>
  );
}

export default function Penyiraman() {
  const { user } = useAuth();

  const [step, setStep]         = useState(1);
  const [tipe, setTipe]         = useState("");
  const [gh, setGh]             = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState({ done: 0, total: 0 });
  const [submitError, setSubmitError] = useState(null);
  const [isOnline] = useState(navigator.onLine);

  const [refData, setRefData]   = useState({});
  const [loadingRef, setLoadingRef] = useState(true);
  const [varianData, setVarianData] = useState({});
  const [dbData, setDbData]     = useState({ ecTandon: "", ecBucket: "", phTandon: "", phBucket: "", doTandon: "", doBucket: "", suhu: "", rh: "", volNutrisi: "" });

  useEffect(() => {
    fetch(`${SCRIPT_URL}?action=getREF`)
      .then(r => r.json())
      .then(json => { if (json.success) setRefData(json.data); })
      .catch(() => {})
      .finally(() => setLoadingRef(false));
  }, []);

  const isDB        = isDutchBucket(tipe);
  const multiSuhuRH = isMultiSuhuRH(gh);
  const varianList  = !isDB && gh ? (refData[gh]?.varian?.length > 0 ? refData[gh].varian : ["Elysia", "Greeniegal"]) : [];

  const handleSelectGH = (g) => {
    setGh(g);
    const vList = refData[g]?.varian?.length > 0 ? refData[g].varian : ["Elysia", "Greeniegal"];
    const init = {};
    vList.forEach(v => { init[v] = initVarianData(); });
    setVarianData(init);
  };

  const updateVarian  = (v, key, val) => setVarianData(prev => ({ ...prev, [v]: { ...prev[v], [key]: val } }));
  const updateSuhuArr = (v, idx, val) => setVarianData(prev => { const a = [...(prev[v]?.suhuArr||["","","",""])]; a[idx]=val; return { ...prev, [v]: { ...prev[v], suhuArr: a } }; });
  const updateRhArr   = (v, idx, val) => setVarianData(prev => { const a = [...(prev[v]?.rhArr  ||["","","",""])]; a[idx]=val; return { ...prev, [v]: { ...prev[v], rhArr:   a } }; });
  const updateDb      = (key, val)    => setDbData(prev => ({ ...prev, [key]: val }));

  const resetForm = () => {
    setStep(1); setTipe(""); setGh(""); setSubmitError(null);
    setVarianData({}); setSubmitProgress({ done: 0, total: 0 });
    setDbData({ ecTandon: "", ecBucket: "", phTandon: "", phBucket: "", doTandon: "", doBucket: "", suhu: "", rh: "", volNutrisi: "" });
  };

  const canNext = () => {
    if (step === 1) return tipe !== "" && gh !== "";
    if (step === 2) {
      if (isDB) return Object.values(dbData).every(v => v !== "");
      return varianList.every(v => {
        const d = varianData[v];
        if (!d) return false;
        const base = d.ecIn !== "" && d.ecOut !== "" && d.phIn !== "" && d.phOut !== "" && d.volume !== "" && d.volNutrisi !== "";
        if (multiSuhuRH) return base && d.suhuArr.every(x => x !== "") && d.rhArr.every(x => x !== "");
        return base && d.suhu !== "" && d.rh !== "";
      });
    }
    return true;
  };

  const buildPayloads = () => {
    if (isDB) {
      return [{
        action: "submitPenyiraman",
        tanggal: todayISO, operator: user?.nama || "", tipe, gh, varian: "",
        ecIn: "", ecOut: "", phIn: "", phOut: "", volume: "",
        volNutrisi: dbData.volNutrisi || "0", suhu: dbData.suhu || "0", rh: dbData.rh || "0",
        ecTandon: dbData.ecTandon || "0", ecBucket: dbData.ecBucket || "0",
        phTandon: dbData.phTandon || "0", phBucket: dbData.phBucket || "0",
        doTandon: dbData.doTandon || "0", doBucket: dbData.doBucket || "0",
      }];
    }
    return varianList.map(v => {
      const d = varianData[v] || initVarianData();
      const suhuVal = multiSuhuRH ? d.suhuArr.join(", ") : (d.suhu || "0");
      const rhVal   = multiSuhuRH ? d.rhArr.join(", ")   : (d.rh   || "0");
      return {
        action: "submitPenyiraman",
        tanggal: todayISO, operator: user?.nama || "", tipe, gh, varian: v,
        ecIn: d.ecIn || "0", ecOut: d.ecOut || "0",
        phIn: d.phIn || "0", phOut: d.phOut || "0",
        volume: d.volume || "0", volNutrisi: d.volNutrisi || "0",
        suhu: suhuVal, rh: rhVal,
        ecTandon: "", ecBucket: "", phTandon: "", phBucket: "", doTandon: "", doBucket: "",
      };
    });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    const payloads = buildPayloads();
    setSubmitProgress({ done: 0, total: payloads.length });
    let done = 0;
    for (const payload of payloads) {
      try {
        const res  = await fetch(SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(payload), redirect: "follow" });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || "GAS error");
        done++;
        setSubmitProgress({ done, total: payloads.length });
      } catch (err) {
        setSubmitError(`Gagal kirim${payload.varian ? " varian " + payload.varian : ""}. ${err.message}`);
        setSubmitting(false);
        return;
      }
    }
    setStep(4);
    setSubmitting(false);
  };

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
            {[1,2,3].map(s => (
              <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: s <= step ? "#81d4fa" : "rgba(255,255,255,0.2)", transition: "background 0.3s" }} />
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: 16 }}>

        {/* ══ STEP 1 ══ */}
        {step === 1 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: "#0277bd", marginBottom: 4 }}>Pilih Tipe & Greenhouse</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>Pilih tipe sistem irigasi terlebih dahulu</div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#0277bd", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Tipe GH</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {TIPE_LIST.map(t => (
                  <button key={t} onClick={() => { setTipe(t); setGh(""); setVarianData({}); }}
                    style={{ padding: "12px 16px", borderRadius: 12, cursor: "pointer", textAlign: "left", border: tipe === t ? "2px solid #0277bd" : "1.5px solid #e0e0e0", background: tipe === t ? "#e1f5fe" : "#fff", color: tipe === t ? "#0277bd" : "#333", fontSize: 14, fontWeight: tipe === t ? 700 : 500, display: "flex", alignItems: "center", justifyContent: "space-between", transition: "all 0.2s" }}>
                    <span>{t}</span>
                    {tipe === t && <span>✓</span>}
                  </button>
                ))}
              </div>
            </div>

            {tipe && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#0277bd", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
                  Nama Greenhouse
                  {loadingRef && <span style={{ fontSize: 10, fontWeight: 400, color: "#aaa", marginLeft: 8 }}>memuat...</span>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {GH_PER_TIPE[tipe].filter(g => refData[g]).map(g => {
                    const info = refData[g];
                    const hst  = info?.hst ?? null;
                    const c    = hstColor(hst);
                    const sel  = gh === g;
                    return (
                      <button key={g} onClick={() => handleSelectGH(g)}
                        style={{ padding: "10px 8px", borderRadius: 10, cursor: "pointer", textAlign: "center", border: sel ? "2px solid #0277bd" : "1px solid #e0e0e0", background: sel ? "#e1f5fe" : "#fff", color: sel ? "#0277bd" : "#333", fontSize: 13, fontWeight: sel ? 700 : 500, transition: "all 0.2s" }}>
                        <div>{g}</div>
                        {info?.periode && <div style={{ fontSize: 10, color: "#aaa", marginTop: 2 }}>P{info.periode}</div>}
                        {hst !== null && (
                          <div style={{ marginTop: 4, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 6, padding: "2px 6px", display: "inline-block" }}>
                            <span style={{ fontSize: 12, fontWeight: 800, color: c.text }}>{hst}</span>
                            <span style={{ fontSize: 9, color: c.text, marginLeft: 2 }}>HST</span>
                          </div>
                        )}
                        {sel && <div style={{ fontSize: 11, marginTop: 3 }}>✓</div>}
                      </button>
                    );
                  })}
                </div>

                {gh && !isDB && varianList.length > 0 && (
                  <div style={{ marginTop: 14, background: "#e8f5e9", border: "1px solid #a5d6a7", borderRadius: 10, padding: "10px 14px" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#2e7d32", marginBottom: 6 }}>🌱 Varian yang akan diisi ({varianList.length})</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {varianList.map(v => (
                        <span key={v} style={{ fontSize: 12, background: "#fff", border: "1px solid #a5d6a7", borderRadius: 20, padding: "3px 10px", color: "#2e7d32", fontWeight: 600 }}>{v}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══ STEP 2 ══ */}
        {step === 2 && (
          <div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
              <div style={{ background: "#e1f5fe", border: "1px solid #81d4fa", borderRadius: 20, padding: "3px 12px", fontSize: 12, color: "#0277bd", fontWeight: 700 }}>{gh}</div>
              <div style={{ background: "#f5f5f5", borderRadius: 20, padding: "3px 12px", fontSize: 12, color: "#666" }}>{tipe}</div>
              {refData[gh]?.hst != null && (() => { const c = hstColor(refData[gh].hst); return (
                <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 20, padding: "3px 12px", fontSize: 12, color: c.text, fontWeight: 700 }}>{refData[gh].hst} HST</div>
              ); })()}
            </div>

            {/* Dutch Bucket */}
            {isDB && (
              <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #e0e0e0", padding: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#0277bd", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>💧 Data Tandon & Bucket</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <Field label="EC Tandon"  value={dbData.ecTandon}  onChange={v => updateDb("ecTandon",  v)} satuan="mS/cm" />
                  <Field label="EC Bucket"  value={dbData.ecBucket}  onChange={v => updateDb("ecBucket",  v)} satuan="mS/cm" />
                  <Field label="pH Tandon"  value={dbData.phTandon}  onChange={v => updateDb("phTandon",  v)} />
                  <Field label="pH Bucket"  value={dbData.phBucket}  onChange={v => updateDb("phBucket",  v)} />
                  <Field label="DO Tandon"  value={dbData.doTandon}  onChange={v => updateDb("doTandon",  v)} satuan="mg/L" />
                  <Field label="DO Bucket"  value={dbData.doBucket}  onChange={v => updateDb("doBucket",  v)} satuan="mg/L" />
                  <Field label="Suhu"       value={dbData.suhu}      onChange={v => updateDb("suhu",      v)} satuan="°C" />
                  <Field label="RH"         value={dbData.rh}        onChange={v => updateDb("rh",        v)} satuan="%" />
                </div>
                <Field label="Volume Nutrisi" value={dbData.volNutrisi} onChange={v => updateDb("volNutrisi", v)} satuan="L" />
              </div>
            )}

            {/* Multi varian */}
            {!isDB && varianList.map(v => {
              const d  = varianData[v] || initVarianData();
              const ok = d.ecIn && d.ecOut && d.phIn && d.phOut && d.volume && d.volNutrisi &&
                         (multiSuhuRH ? (d.suhuArr.every(x=>x!=="") && d.rhArr.every(x=>x!=="")) : (d.suhu && d.rh));
              return (
                <div key={v} style={{ background: "#fff", borderRadius: 12, border: `1.5px solid ${ok ? "#a5d6a7" : "#e0e0e0"}`, marginBottom: 10, overflow: "hidden" }}>
                  <div style={{ background: ok ? "#f1f8e9" : "#fafafa", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: ok ? "#2e7d32" : "#0277bd" }}>🌱 {v}</span>
                      {ok && <span>✅</span>}
                    </div>
                    {!ok && <span style={{ fontSize: 10, color: "#e65100", background: "#fff3e0", border: "1px solid #ffb74d", borderRadius: 20, padding: "2px 8px" }}>Belum lengkap</span>}
                  </div>
                  <div style={{ padding: "12px 14px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <Field label="EC In"          value={d.ecIn}       onChange={val => updateVarian(v,"ecIn",val)}       satuan="mS/cm" />
                      <Field label="EC Out"         value={d.ecOut}      onChange={val => updateVarian(v,"ecOut",val)}      satuan="mS/cm" />
                      <Field label="pH In"          value={d.phIn}       onChange={val => updateVarian(v,"phIn",val)} />
                      <Field label="pH Out"         value={d.phOut}      onChange={val => updateVarian(v,"phOut",val)} />
                      <Field label="Volume"         value={d.volume}     onChange={val => updateVarian(v,"volume",val)}     satuan="ml/tan" />
                      <Field label="Vol. Nutrisi"   value={d.volNutrisi} onChange={val => updateVarian(v,"volNutrisi",val)} satuan="L" />
                      {!multiSuhuRH && (
                        <>
                          <Field label="Suhu" value={d.suhu} onChange={val => updateVarian(v,"suhu",val)} satuan="°C" />
                          <Field label="RH"   value={d.rh}   onChange={val => updateVarian(v,"rh",val)}   satuan="%" />
                        </>
                      )}
                    </div>
                    {multiSuhuRH && (
                      <div style={{ marginTop: 4 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#0277bd", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>🌡️ Suhu & RH (4 Alat)</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          {[0,1,2,3].map(idx => (
                            <div key={idx} style={{ background: "#f9fbe7", border: "1px solid #dce775", borderRadius: 8, padding: "8px 10px" }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#558b2f", marginBottom: 6 }}>Alat {idx+1}</div>
                              <Field label="Suhu" value={d.suhuArr[idx]} onChange={val => updateSuhuArr(v,idx,val)} satuan="°C" />
                              <Field label="RH"   value={d.rhArr[idx]}   onChange={val => updateRhArr(v,idx,val)}   satuan="%" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
              {!isDB && <RekapRow label="Jumlah Varian" value={`${varianList.length} varian`} />}
            </div>

            {!isDB && varianList.map(v => {
              const d = varianData[v] || initVarianData();
              return (
                <div key={v} style={{ background: "#fff", borderRadius: 14, padding: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#2e7d32", marginBottom: 8 }}>🌱 {v}</div>
                  <RekapRow label="EC In"          value={d.ecIn||"0"}        satuan="mS/cm" />
                  <RekapRow label="EC Out"         value={d.ecOut||"0"}       satuan="mS/cm" />
                  <RekapRow label="pH In"          value={d.phIn||"0"} />
                  <RekapRow label="pH Out"         value={d.phOut||"0"} />
                  <RekapRow label="Volume"         value={d.volume||"0"}      satuan="ml/tanaman" />
                  <RekapRow label="Volume Nutrisi" value={d.volNutrisi||"0"}  satuan="L" />
                  {multiSuhuRH ? (
                    <>
                      <RekapRow label="Suhu (4 alat)" value={d.suhuArr.map(x=>x||"0").join(", ")} satuan="°C" />
                      <RekapRow label="RH (4 alat)"   value={d.rhArr.map(x=>x||"0").join(", ")}   satuan="%" />
                    </>
                  ) : (
                    <>
                      <RekapRow label="Suhu" value={d.suhu||"0"} satuan="°C" />
                      <RekapRow label="RH"   value={d.rh||"0"}   satuan="%" />
                    </>
                  )}
                </div>
              );
            })}

            {isDB && (
              <div style={{ background: "#fff", borderRadius: 14, padding: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#0277bd", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>💧 Data Tandon & Bucket</div>
                <RekapRow label="EC Tandon"      value={dbData.ecTandon}   satuan="mS/cm" />
                <RekapRow label="EC Bucket"      value={dbData.ecBucket}   satuan="mS/cm" />
                <RekapRow label="pH Tandon"      value={dbData.phTandon} />
                <RekapRow label="pH Bucket"      value={dbData.phBucket} />
                <RekapRow label="DO Tandon"      value={dbData.doTandon}   satuan="mg/L" />
                <RekapRow label="DO Bucket"      value={dbData.doBucket}   satuan="mg/L" />
                <RekapRow label="Suhu"           value={dbData.suhu}       satuan="°C" />
                <RekapRow label="RH"             value={dbData.rh}         satuan="%" />
                <RekapRow label="Volume Nutrisi" value={dbData.volNutrisi} satuan="L" />
              </div>
            )}

            {submitting && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>Mengirim {submitProgress.done}/{submitProgress.total} varian...</div>
                <div style={{ background: "#e0e0e0", borderRadius: 4, height: 6, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg,#0277bd,#0288d1)", width: `${submitProgress.total > 0 ? (submitProgress.done/submitProgress.total)*100 : 0}%`, transition: "width 0.3s" }} />
                </div>
              </div>
            )}
            {submitError && (
              <div style={{ fontSize: 12, color: "#c62828", background: "#ffebee", border: "1px solid #ef9a9a", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>⚠️ {submitError}</div>
            )}
          </div>
        )}

        {/* ══ STEP 4 — Sukses ══ */}
        {step === 4 && (
          <div style={{ textAlign: "center", paddingTop: 32 }}>
            <div style={{ fontSize: 60, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 21, fontWeight: 800, color: "#0277bd", marginBottom: 6 }}>Data Tersimpan!</div>
            <div style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>
              {isDB ? "Data Dutch Bucket" : `${varianList.length} varian`} berhasil dikirim ke Google Sheets
            </div>
            <div style={{ background: "#e1f5fe", border: "1px solid #81d4fa", borderRadius: 14, padding: 16, textAlign: "left", marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0277bd" }}>{gh} · {tipe}</div>
              {!isDB && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {varianList.map(v => (
                    <span key={v} style={{ fontSize: 11, background: "#e8f5e9", border: "1px solid #a5d6a7", borderRadius: 20, padding: "2px 10px", color: "#2e7d32", fontWeight: 600 }}>🌱 {v}</span>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 13, color: "#666", marginTop: 8 }}>Operator: {user?.nama} · {todayISO}</div>
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
              {submitting ? `⏳ ${submitProgress.done}/${submitProgress.total}...` : `Submit ${isDB ? "" : varianList.length + " Varian"} ✓`}
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
