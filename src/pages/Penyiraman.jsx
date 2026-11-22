import { useState, useEffect, useRef } from "react";
import { useDraft } from "../hooks/useDraft";
import { useAuth } from "../hooks/useAuth";
import { useGHBlockedList } from "../hooks/useGHBlockedList";
import { gasFetch, gasPost } from "../utils/idb";
import { FormShell, FieldAlert, SuccessState, GHPicker, ReviewTable, OptionList, SegmentTabs, Switch, NumberField, OperatorField } from "../components/form";
import { formatTanggal } from "../lib/format";
import { hstMaksGH } from "../lib/hstLimit";

const SCRIPT_URL = import.meta.env.VITE_GAS_PENYIRAMAN_URL;

const GH_PER_TIPE = {
  "Kolam (Tohudan)": [
    "TOHUDAN 1","TOHUDAN 2","TOHUDAN 3","TOHUDAN 4","TOHUDAN 5","TOHUDAN 6",
    "TOHUDAN 7","TOHUDAN 8","TOHUDAN 9","TOHUDAN 10","TOHUDAN 11","TOHUDAN 13",
    "TOHUDAN 22"
  ],
  "Drip (Tohudan/Bergas)": [
    "COLOMADU 1","COLOMADU 2","COLOMADU 3","COLOMADU 4",
    "BERGAS 1","BERGAS 2","BERGAS 3","BERGAS 4","BERGAS 5","BERGAS 7","BERGAS 8",
    "TOHUDAN 12","TOHUDAN 14","TOHUDAN 15","TOHUDAN 16","TOHUDAN 17","TOHUDAN 18","TOHUDAN 19","TOHUDAN 20","TOHUDAN 21",
  ],
  "Kolam (Sawahan)": [
    "SAWAHAN 1","SAWAHAN 2","SAWAHAN 3","SAWAHAN 4","SAWAHAN TUNNEL 1"
  ],
  "RnD": [
    "OPEN FIELD 1",
  ],
};

const TIPE_LIST = Object.keys(GH_PER_TIPE);

// Cache REF terakhir yang berhasil dimuat — dipakai sebagai cadangan kalau server
// sedang sibuk/error (rate limit, timeout), supaya daftar GH tidak kosong.
const REF_CACHE_KEY = "penyiraman_ref_cache";
function readRefCache() {
  try {
    const c = JSON.parse(localStorage.getItem(REF_CACHE_KEY) || "null");
    if (!c?.data) return { data: {}, dataRnd: {} };
    // HST di cache sudah basi — hitung ulang dari tanggal tanam
    const fix = (map) => {
      const out = {};
      const now = new Date(); now.setHours(0, 0, 0, 0);
      for (const [g, v] of Object.entries(map || {})) {
        let hst = v.hst;
        if (v.tanam) {
          const [y, m, d] = v.tanam.split("-").map(Number);
          hst = Math.floor((now - new Date(y, m - 1, d)) / 86400000);
        }
        if (hst !== null && hst !== undefined && hst >= Math.max(70, hstMaksGH(g, 0) + 1)) continue;
        out[g] = { ...v, hst };
      }
      return out;
    };
    return { data: fix(c.data), dataRnd: fix(c.dataRnd) };
  } catch { return { data: {}, dataRnd: {} }; }
}
function writeRefCache(data, dataRnd) {
  try { localStorage.setItem(REF_CACHE_KEY, JSON.stringify({ data, dataRnd })); } catch { /* abaikan */ }
}
const isMultiSuhuRH = (gh) => gh === "SAWAHAN 3" || gh === "SAWAHAN 4";
// GH yang fisiknya punya instalasi Dutch Bucket TAMBAHAN di samping Drip biasa (walau tipe
// form-nya sekarang "Drip") — form untuk GH ini isi field varian Drip SEKALIGUS field
// Tandon/Bucket, disubmit jadi baris-baris terpisah (per varian + 1 baris Dutch Bucket).
const DB_GH_LIST = ["TOHUDAN 18"];
const isDbGH = (gh) => DB_GH_LIST.includes(gh);
const RND_REF_GH_LIST = ["SAWAHAN TUNNEL 1", "TOHUDAN 22", "OPEN FIELD 1"];
const isRndRefGH = (gh) => RND_REF_GH_LIST.includes((gh || "").toUpperCase().trim());

// Batas deteksi typo: ~2x dari nilai maksimal wajar masing-masing field
const TYPO_LIMITS = {
  ph:  { max: 12,  label: "pH (maks wajar ~6)",      hint: "batas wajar ≤ 12. Contoh: tulis 6,0 bukan 60" },
  ec:  { max: 8,   label: "EC (maks wajar ~4 mS/cm)", hint: "batas wajar ≤ 8 mS/cm. Contoh: tulis 3,2 bukan 32" },
};

function getVarianErrors(d) {
  const errors = {};
  const check = (val, type, key) => {
    const n = parseFloat(val);
    if (val !== "" && !isNaN(n) && n > TYPO_LIMITS[type].max)
      errors[key] = `Kemungkinan typo — ${TYPO_LIMITS[type].hint}`;
  };
  check(d.ecIn,  "ec", "ecIn");
  check(d.ecOut, "ec", "ecOut");
  check(d.phIn,  "ph", "phIn");
  check(d.phOut, "ph", "phOut");
  return errors;
}

function getDbErrors(dbData) {
  const errors = {};
  const check = (val, type, key) => {
    const n = parseFloat(val);
    if (val !== "" && !isNaN(n) && n > TYPO_LIMITS[type].max)
      errors[key] = `Kemungkinan typo — ${TYPO_LIMITS[type].hint}`;
  };
  check(dbData.ecTandon, "ec", "ecTandon");
  check(dbData.ecBucket, "ec", "ecBucket");
  check(dbData.phTandon, "ph", "phTandon");
  check(dbData.phBucket, "ph", "phBucket");
  return errors;
}

// todayISO dikirim ke sheet (format dd/mm/yyyy) — jangan diubah
const todayISO   = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });

// Badge HST: muda netral, menengah kuning, tua oranye
function hstTone(hst) {
  if (hst <= 21) return "neutral";
  if (hst <= 40) return "warning";
  return "due";
}

function initVarianData() {
  return { ecIn: "", ecOut: "", phIn: "", phOut: "", volume: "", volNutrisi: "", suhu: "", rh: "", suhuArr: ["","","",""], rhArr: ["","","",""] };
}

function initDbData() {
  return { ecTandon: "", ecBucket: "", phTandon: "", phBucket: "", doTandon: "", doBucket: "", suhu: "", rh: "", volNutrisi: "" };
}

// Jumlah field wajib per varian yang sudah terisi → dipakai untuk hitungan di tab varian
function countVarianFilled(d, multi) {
  const base = ["ecIn", "ecOut", "phIn", "phOut", "volume", "volNutrisi"].filter(k => d[k] !== "").length;
  if (multi) return base + d.suhuArr.filter(x => x !== "").length + d.rhArr.filter(x => x !== "").length;
  return base + (d.suhu !== "" ? 1 : 0) + (d.rh !== "" ? 1 : 0);
}
const varianFieldTotal = (multi) => (multi ? 14 : 8);

// initialGH/onDone — opsional, dipakai oleh Home Koor GH untuk auto-pilih GH
// dari jadwal harian. Tidak mempengaruhi cara form ini dipakai biasa (tanpa props).
export default function Penyiraman({ initialGH, onDone } = {}) {
  const { user } = useAuth();

  const { blockedMap } = useGHBlockedList();
  const { getDraft, saveDraft, clearDraft } = useDraft("penyiraman");
  const _draft = getDraft();

  // Draft lama bisa nyimpen tipe yang sudah tidak ada lagi (mis. "Dutch Bucket" yang
  // sekarang dihapus) — kalau dipakai apa adanya, GH_PER_TIPE[tipe] jadi undefined dan crash.
  const draftTipeValid = _draft?.tipe && Object.prototype.hasOwnProperty.call(GH_PER_TIPE, _draft.tipe);

  const [step, setStep]         = useState(draftTipeValid ? (_draft?.step || 1) : 1);
  const [tipe, setTipe]         = useState(draftTipeValid ? _draft.tipe : "");
  const [gh, setGh]             = useState(draftTipeValid ? (_draft?.gh || "") : "");
  // Operator otomatis dari akun login; bisa diubah di langkah rekap
  const [operator, setOperator]     = useState(_draft?.operator || user?.nama || "");
  const [submitting, setSubmitting] = useState(false);
  const [, setSubmitProgress] = useState({ done: 0, total: 0 });
  const [submitError, setSubmitError] = useState(null);
  const [activeVarian, setActiveVarian] = useState("");
  // Salin isian varian pertama ke varian lain (dulu auto-fill tersembunyi 400ms)
  const [salinVarian, setSalinVarian] = useState(true);

  const stepRef = useRef(step);
  stepRef.current = step;

  const [refData, setRefData]       = useState(() => readRefCache().data);
  const [refDataRnd, setRefDataRnd] = useState(() => readRefCache().dataRnd);
  const [loadingRef, setLoadingRef] = useState(true);
  const [refError, setRefError]     = useState("");
  const [refFromCache, setRefFromCache] = useState(() => Object.keys(readRefCache().data).length > 0);
  const [varianData, setVarianData] = useState(_draft?.varianData || {});
  const [nutrisi, setNutrisi]       = useState(_draft?.nutrisi || "");
  const [dbData, setDbData]         = useState(_draft?.dbData || initDbData());

  const loadRefRef = useRef(null);

  // useAuth membaca sessionStorage setelah render pertama → isi operator begitu nama tersedia
  useEffect(() => {
    if (user?.nama) setOperator(prev => prev || user.nama);
  }, [user?.nama]);

  useEffect(() => {
    const loadRef = () => {
      setLoadingRef(true);
      return gasFetch(`${SCRIPT_URL}?action=getREF`)
        .then(json => {
          if (json?.success && json.data) {
            setRefData(json.data); setRefDataRnd(json.dataRnd || {});
            setRefError(""); setRefFromCache(false);
            writeRefCache(json.data, json.dataRnd || {});
          } else {
            setRefError(json?.error || "Server tidak mengirim data greenhouse.");
          }
        })
        .catch(err => setRefError(err?.name === "AbortError" ? "Server tidak merespons (timeout)." : "Gagal terhubung ke server."))
        .finally(() => setLoadingRef(false));
    };
    loadRefRef.current = loadRef;
    loadRef();

    // PWA di HP operator jarang benar-benar tertutup — ambil ulang daftar GH setiap aplikasi
    // dibuka kembali ke layar, supaya GH yang baru tanam muncul tanpa harus logout/login.
    // Hanya di step 1 (pilih GH) agar tidak mengganggu isian yang sedang berjalan.
    const onVisible = () => {
      if (document.visibilityState === "visible" && stepRef.current === 1) loadRef();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    if (step === 4) return;
    saveDraft({ step, tipe, gh, operator, varianData, dbData, nutrisi });
  }, [step, tipe, gh, operator, varianData, dbData, nutrisi]);

  // GH18: isian Drip (per varian) DAN Dutch Bucket (Tandon/Bucket) sekaligus, bukan salah satu.
  const isDB        = isDbGH(gh);
  const multiSuhuRH = isMultiSuhuRH(gh);
  const refSource   = isRndRefGH(gh) ? refDataRnd : refData;
  const varianList  = gh ? (refSource[gh]?.varian?.length > 0 ? refSource[gh].varian : ["Elysia", "Greeniegal"]) : [];

  const hst = refSource[gh]?.hst ?? null;
  const allVarianErrors = {};
  varianList.forEach(v => { allVarianErrors[v] = getVarianErrors(varianData[v] || initVarianData()); });
  const dbErrors = isDB ? getDbErrors(dbData) : {};
  const hasValidationError = Object.values(allVarianErrors).some(e => Object.keys(e).length > 0)
    || Object.keys(dbErrors).length > 0;

  const handleSelectGH = (g) => {
    // Menu Penyiraman: GH Shutdown/Restart tetap bisa dipilih & diisi (tidak diblokir)
    setGh(g);
    const vList = refSource[g]?.varian?.length > 0 ? refSource[g].varian : ["Elysia", "Greeniegal"];
    const init = {};
    vList.forEach(v => { init[v] = initVarianData(); });
    setVarianData(init);
    setNutrisi(refSource[g]?.nutrisi || "");
    setDbData(initDbData());
    setActiveVarian("");
  };

  // ── Auto-pilih tipe+GH dari jadwal harian (Home Koor GH) — tidak mengubah alur normal ──
  // Override draft lama (kalau ada) sekali saat form ini dibuka dari jadwal.
  const initialGHAppliedRef = useRef(false);
  useEffect(() => {
    if (!initialGH || initialGHAppliedRef.current || loadingRef) return;
    const target = initialGH.trim().toUpperCase();
    let foundTipe = null, foundGH = null;
    for (const [t, list] of Object.entries(GH_PER_TIPE)) {
      const match = list.find(g => g.toUpperCase() === target);
      if (match) { foundTipe = t; foundGH = match; break; }
    }
    if (!foundTipe) return;
    if (tipe !== foundTipe) { setTipe(foundTipe); return; } // fase 1: set tipe, tunggu re-render
    initialGHAppliedRef.current = true; // fase 2: tipe sudah cocok, override gh + lanjut step
    handleSelectGH(foundGH);
    setStep(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialGH, loadingRef, tipe, refData, refDataRnd]);

  const updateDb = (key, val) => setDbData(prev => ({ ...prev, [key]: val }));

  // Salin dari varian pertama ke varian lain saat Switch "Salin ke varian lain" aktif.
  // Varian lain tetap bebas diedit sendiri tanpa mempengaruhi varian lain.
  const autoFillFields = ["ecIn", "ecOut", "phIn", "phOut", "volume", "volNutrisi", "suhu", "rh"];
  const salinAktif = (v) => salinVarian && varianList.length > 1 && v === varianList[0];

  const handleVarianChange = (v, key, val) => {
    setVarianData(prev => {
      const next = { ...prev, [v]: { ...(prev[v] || initVarianData()), [key]: val } };
      if (salinAktif(v) && autoFillFields.includes(key)) {
        varianList.slice(1).forEach(other => {
          next[other] = { ...(prev[other] || initVarianData()), [key]: val };
        });
      }
      return next;
    });
  };

  // arrKey: "suhuArr" | "rhArr" — isian per alat (Sawahan 3/4)
  const handleArrChange = (v, arrKey, idx, val) => {
    setVarianData(prev => {
      const setIdx = (d) => {
        const a = [...((d || initVarianData())[arrKey] || ["","","",""])];
        a[idx] = val;
        return { ...(d || initVarianData()), [arrKey]: a };
      };
      const next = { ...prev, [v]: setIdx(prev[v]) };
      if (salinAktif(v)) varianList.slice(1).forEach(other => { next[other] = setIdx(prev[other]); });
      return next;
    });
  };

  const resetForm = () => {
    clearDraft();
    setStep(1); setTipe(""); setGh(""); setSubmitError(null); setOperator(user?.nama || "");
    setVarianData({}); setSubmitProgress({ done: 0, total: 0 }); setNutrisi("");
    setDbData(initDbData()); setActiveVarian("");
  };

  // ── Validasi langkah 2 (sama dengan versi lama, minus operator yang pindah ke rekap) ──
  const varianLengkap = (v) => {
    const d = varianData[v];
    if (!d) return false;
    const base = d.ecIn !== "" && d.ecOut !== "" && d.phIn !== "" && d.phOut !== "" && d.volume !== "" && d.volNutrisi !== "";
    if (multiSuhuRH) return base && d.suhuArr.every(x => x !== "") && d.rhArr.every(x => x !== "");
    return base && d.suhu !== "" && d.rh !== "";
  };
  const varianBelum = varianList.filter(v => !varianLengkap(v)).length;
  const dbOk        = isDB ? Object.values(dbData).every(v => v !== "") : true;
  const canStep2    = !hasValidationError && varianBelum === 0 && dbOk;
  const canSubmit   = operator.trim().length >= 2 && !submitting;

  const buildPayloads = () => {
    const client_timestamp = new Date().toISOString();
    const varianPayloads = varianList.map(v => {
      const d = varianData[v] || initVarianData();
      const suhuVal = multiSuhuRH ? d.suhuArr.join(", ") : (d.suhu || "0");
      const rhVal   = multiSuhuRH ? d.rhArr.join(", ")   : (d.rh   || "0");
      return {
        action: "submitPenyiraman",
        client_timestamp,
        tanggal: todayISO, operator: operator || user?.nama || "", tipe, gh, varian: v,
        ecIn: d.ecIn || "0", ecOut: d.ecOut || "0",
        phIn: d.phIn || "0", phOut: d.phOut || "0",
        volume: d.volume || "0", volNutrisi: d.volNutrisi || "0",
        suhu: suhuVal, rh: rhVal,
        ecTandon: "", ecBucket: "", phTandon: "", phBucket: "", doTandon: "", doBucket: "",
        nutrisi: nutrisi || "",
      };
    });
    if (!isDB) return varianPayloads;
    // GH dengan instalasi Dutch Bucket tambahan — kirim 1 baris ekstra di luar varian drip
    const dbPayload = {
      action: "submitPenyiraman",
      client_timestamp,
      tanggal: todayISO, operator: operator || user?.nama || "", tipe, gh, varian: "Dutch Bucket",
      ecIn: "", ecOut: "", phIn: "", phOut: "", volume: "",
      volNutrisi: dbData.volNutrisi || "0", suhu: dbData.suhu || "0", rh: dbData.rh || "0",
      ecTandon: dbData.ecTandon || "0", ecBucket: dbData.ecBucket || "0",
      phTandon: dbData.phTandon || "0", phBucket: dbData.phBucket || "0",
      doTandon: dbData.doTandon || "0", doBucket: dbData.doBucket || "0",
      nutrisi: nutrisi || "",
    };
    return [...varianPayloads, dbPayload];
  };

  const handleSubmit = async () => {
    // Menu Penyiraman: submit tetap diizinkan walau GH sedang Shutdown/Restart
    setSubmitting(true);
    setSubmitError(null);
    const payloads = buildPayloads();
    setSubmitProgress({ done: 0, total: payloads.length });
    try {
      const json = await gasPost(SCRIPT_URL, { action: "submitPenyiramanBatch", rows: payloads });
      if (!json.success) throw new Error(json.error || "GAS error");
      setSubmitProgress({ done: payloads.length, total: payloads.length });
      clearDraft(); setStep(4);
    } catch (err) {
      setSubmitError(`Data belum terkirim (${err.message}). Cek sinyal lalu tekan Kirim lagi.`);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Varian aktif (default varian pertama) ──
  const activeKey  = varianList.includes(activeVarian) ? activeVarian : (varianList[0] || "");
  const activeIdx  = varianList.indexOf(activeKey);
  const nextVarian = varianList[activeIdx + 1];
  const goToVarian = (v) => { setActiveVarian(v); window.scrollTo(0, 0); };
  const d    = varianData[activeKey] || initVarianData();
  const errs = allVarianErrors[activeKey] || {};
  const fmt  = (x) => String(x).replace(".", ",");

  // ── Header ──
  const title = step === 2 || step === 3 ? `Penyiraman · ${gh}` : "Penyiraman";
  const ghMeta = [tipe, hst !== null && `${hst} HST`].filter(Boolean).join(" · ");
  const subtitle = step === 1
    ? `${formatTanggal()} · Langkah 1 dari 3`
    : step === 4
      ? formatTanggal()
      : `${ghMeta} · Langkah ${step} dari 3`;
  const onBack = step === 2 ? (onDone || (() => setStep(1)))
    : step === 3 ? () => { setStep(2); setSubmitError(null); }
    : step === 1 ? onDone
    : undefined;

  // ── Footer ──
  const kirimLabel = `Kirim ${varianList.length} varian${isDB ? " + DB" : ""}`;
  let footer = null;
  if (step === 2) {
    let label = "Lihat rekap";
    if (hasValidationError) label = "Periksa nilai yang ditandai merah";
    else if (varianBelum > 0) label = `Lengkapi isian ${varianBelum} varian`;
    else if (!dbOk) label = "Lengkapi data Dutch Bucket";
    footer = <button type="button" className="fh-btn fh-btn-primary" disabled={!canStep2} onClick={() => setStep(3)}>{label}</button>;
  } else if (step === 3) {
    footer = (
      <div className="fh-btn-row">
        <button type="button" className="fh-btn fh-btn-secondary" onClick={() => { setStep(2); setSubmitError(null); }}>Kembali</button>
        <button type="button" className="fh-btn fh-btn-primary" disabled={!canSubmit} onClick={handleSubmit}>
          {submitting ? "Mengirim…" : kirimLabel}
        </button>
      </div>
    );
  } else if (step === 4) {
    footer = onDone
      ? <button type="button" className="fh-btn fh-btn-secondary" onClick={onDone}>Kembali ke Home</button>
      : <button type="button" className="fh-btn fh-btn-secondary" onClick={resetForm}>Isi GH lain</button>;
  }

  const ghAktifTipe = (t) => (GH_PER_TIPE[t] || []).filter(g => (isRndRefGH(g) ? refDataRnd : refData)[g]);

  return (
    <FormShell title={title} subtitle={subtitle} steps={step < 4 ? 3 : 0} step={step} onBack={onBack} footer={footer}>

      {/* ══ STEP 1 — Tipe & GH ══ */}
      {step === 1 && (
        <>
          <section className="fh-section">
            <span className="fh-label">Tipe irigasi</span>
            <OptionList
              name="Tipe irigasi"
              columns={2}
              value={tipe}
              onChange={(t) => { setTipe(t); setGh(""); setVarianData({}); }}
              options={TIPE_LIST.map(t => ({ value: t, label: t, meta: loadingRef && !refFromCache ? undefined : `${ghAktifTipe(t).length} GH aktif` }))}
            />
          </section>

          {refError && (
            <FieldAlert
              tone="danger"
              action={{ label: loadingRef ? "Memuat…" : "Coba lagi", onClick: () => loadRefRef.current?.() }}
            >
              {refError}{refFromCache ? " Menampilkan data tersimpan terakhir, mungkin belum terbaru." : " Daftar greenhouse tidak bisa dimuat."}
            </FieldAlert>
          )}

          {tipe && (
            <section className="fh-section">
              <div className="fh-section-head">
                <span className="fh-label">Pilih GH</span>
                {loadingRef
                  ? <span className="fh-meta">memuat…</span>
                  : <button type="button" className="fh-btn fh-btn-secondary" onClick={() => loadRefRef.current?.()}>Muat ulang daftar GH</button>}
              </div>
              <GHPicker
                loading={loadingRef && ghAktifTipe(tipe).length === 0}
                selected={gh}
                onSelect={(g) => { handleSelectGH(g); setStep(2); }}
                emptyText="Tidak ada greenhouse aktif untuk tipe ini."
                items={ghAktifTipe(tipe).map(g => {
                  const info = (isRndRefGH(g) ? refDataRnd : refData)[g];
                  const h = info?.hst ?? null;
                  // Menu Penyiraman tetap membuka GH Shutdown/Restart — badge ini hanya info, bukan penghalang
                  const blockedInfo = blockedMap[g.trim().toUpperCase()];
                  const badges = [];
                  if (blockedInfo) badges.push({ label: blockedInfo.aksi, tone: "danger" });
                  if (isDbGH(g)) badges.push({ label: "+ Dutch Bucket", tone: "neutral" });
                  if (h !== null) badges.push({ label: `${h} HST`, tone: hstTone(h) });
                  return {
                    gh: g,
                    meta: [info?.periode && `P${info.periode}`, info?.varian?.length && `${info.varian.length} varian`].filter(Boolean).join(" · "),
                    badges,
                    sortValue: h,
                  };
                })}
              />
            </section>
          )}
        </>
      )}

      {/* ══ STEP 2 — Isian ══ */}
      {step === 2 && (
        <>
          <label className="fh-section">
            <div className="fh-section-head">
              <span className="fh-label">Nutrisi</span>
              <span className="fh-meta">opsional · terisi dari isian terakhir</span>
            </div>
            <input className="fh-input" value={nutrisi} onChange={e => setNutrisi(e.target.value)} placeholder="Nutrisi yang digunakan" />
          </label>

          {isDB && (
            <section className="fh-section">
              <span className="fh-overline">Dutch Bucket · tandon & bucket</span>
              <div className="fh-card fh-card-body" style={{ gap: 12 }}>
                <div className="fh-grid-2" style={{ gap: 10 }}>
                  <NumberField label="EC tandon" unit="mS/cm" value={dbData.ecTandon} onChange={v => updateDb("ecTandon", v)} error={dbErrors.ecTandon} />
                  <NumberField label="EC bucket" unit="mS/cm" value={dbData.ecBucket} onChange={v => updateDb("ecBucket", v)} error={dbErrors.ecBucket} />
                  <NumberField label="pH tandon" value={dbData.phTandon} onChange={v => updateDb("phTandon", v)} error={dbErrors.phTandon} />
                  <NumberField label="pH bucket" value={dbData.phBucket} onChange={v => updateDb("phBucket", v)} error={dbErrors.phBucket} />
                  <NumberField label="DO tandon" unit="mg/L" value={dbData.doTandon} onChange={v => updateDb("doTandon", v)} />
                  <NumberField label="DO bucket" unit="mg/L" value={dbData.doBucket} onChange={v => updateDb("doBucket", v)} />
                  <NumberField label="Suhu" unit="°C" value={dbData.suhu} onChange={v => updateDb("suhu", v)} />
                  <NumberField label="RH" unit="%" value={dbData.rh} onChange={v => updateDb("rh", v)} />
                </div>
                <NumberField label="Volume nutrisi" unit="L" value={dbData.volNutrisi} onChange={v => updateDb("volNutrisi", v)} />
              </div>
            </section>
          )}

          <section className="fh-section">
            <div className="fh-section-head">
              <span className="fh-label">Isian per varian</span>
              <span className="fh-meta">{varianList.length - varianBelum}/{varianList.length} varian lengkap</span>
            </div>
            {varianList.length > 1 && (
              <SegmentTabs
                label="Varian"
                value={activeKey}
                onChange={setActiveVarian}
                tabs={varianList.map(v => ({
                  key: v,
                  label: v,
                  count: `${countVarianFilled(varianData[v] || initVarianData(), multiSuhuRH)}/${varianFieldTotal(multiSuhuRH)}`,
                }))}
              />
            )}
            {varianList.length > 1 && activeIdx === 0 && (
              <Switch
                checked={salinVarian}
                onChange={setSalinVarian}
                label="Salin ke varian lain"
                hint={`Isian ${varianList[0]} ikut mengisi ${varianList.length - 1} varian lain. Varian lain tetap bisa diubah.`}
              />
            )}
          </section>

          {activeKey && (
            <>
              <section className="fh-section">
                <span className="fh-overline">Nutrisi masuk / keluar</span>
                <div className="fh-grid-2" style={{ gap: 10 }}>
                  <NumberField label="EC in" unit="mS/cm" value={d.ecIn} onChange={val => handleVarianChange(activeKey, "ecIn", val)} error={errs.ecIn} />
                  <NumberField label="EC out" unit="mS/cm" value={d.ecOut} onChange={val => handleVarianChange(activeKey, "ecOut", val)} error={errs.ecOut} />
                  <NumberField label="pH in" value={d.phIn} onChange={val => handleVarianChange(activeKey, "phIn", val)} error={errs.phIn} />
                  <NumberField label="pH out" value={d.phOut} onChange={val => handleVarianChange(activeKey, "phOut", val)} error={errs.phOut} />
                </div>
              </section>

              <section className="fh-section">
                <span className="fh-overline">Volume</span>
                <div className="fh-grid-2" style={{ gap: 10 }}>
                  <NumberField label="Per tanaman" unit="ml" value={d.volume} onChange={val => handleVarianChange(activeKey, "volume", val)} />
                  <NumberField label="Nutrisi" unit="L" value={d.volNutrisi} onChange={val => handleVarianChange(activeKey, "volNutrisi", val)} />
                </div>
              </section>

              <section className="fh-section">
                <span className="fh-overline">{multiSuhuRH ? "Iklim · 4 alat" : "Iklim"}</span>
                {!multiSuhuRH ? (
                  <div className="fh-grid-2" style={{ gap: 10 }}>
                    <NumberField label="Suhu" unit="°C" value={d.suhu} onChange={val => handleVarianChange(activeKey, "suhu", val)} />
                    <NumberField label="RH" unit="%" value={d.rh} onChange={val => handleVarianChange(activeKey, "rh", val)} />
                  </div>
                ) : (
                  <div className="fh-card fh-card-body" style={{ gap: 12 }}>
                    {[0, 1, 2, 3].map(idx => (
                      <div key={idx} className="fh-section" style={{ gap: 6 }}>
                        <span className="fh-label">Alat {idx + 1}</span>
                        <div className="fh-grid-2" style={{ gap: 10 }}>
                          <NumberField label="Suhu" unit="°C" value={d.suhuArr[idx]} onChange={val => handleArrChange(activeKey, "suhuArr", idx, val)} />
                          <NumberField label="RH" unit="%" value={d.rhArr[idx]} onChange={val => handleArrChange(activeKey, "rhArr", idx, val)} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {nextVarian && (
                <button type="button" className="fh-btn fh-btn-secondary" onClick={() => goToVarian(nextVarian)}>
                  Varian berikut: {nextVarian}
                </button>
              )}
            </>
          )}
        </>
      )}

      {/* ══ STEP 3 — Rekap ══ */}
      {step === 3 && (
        <>
          <OperatorField user={user} value={operator} onChange={setOperator} minLength={2} />

          <ReviewTable
            title="Rekap"
            info={[
              ["Tanggal", formatTanggal()],
              ["Tipe", tipe],
              ["GH", gh],
              ["HST", hst ?? "-"],
              ...(nutrisi ? [["Nutrisi", nutrisi]] : []),
            ]}
          />

          <div className="fh-card fh-scroll-x">
            <div className="fh-card-head"><span className="fh-overline">Parameter × varian</span></div>
            <table className="fh-table">
              <thead>
                <tr>
                  <th>Parameter</th>
                  {varianList.map(v => <th key={v} className="is-num">{v}</th>)}
                </tr>
              </thead>
              <tbody>
                {[
                  ["EC in (mS/cm)", (x) => x.ecIn || "0"],
                  ["EC out (mS/cm)", (x) => x.ecOut || "0"],
                  ["pH in", (x) => x.phIn || "0"],
                  ["pH out", (x) => x.phOut || "0"],
                  ["Volume (ml/tan)", (x) => x.volume || "0"],
                  ["Nutrisi (L)", (x) => x.volNutrisi || "0"],
                  ...(multiSuhuRH
                    ? [["Suhu 4 alat (°C)", (x) => x.suhuArr.map(y => y || "0").join(" · ")], ["RH 4 alat (%)", (x) => x.rhArr.map(y => y || "0").join(" · ")]]
                    : [["Suhu (°C)", (x) => x.suhu || "0"], ["RH (%)", (x) => x.rh || "0"]]),
                ].map(([label, get]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    {varianList.map(v => <td key={v} className="is-num fh-num">{fmt(get(varianData[v] || initVarianData()))}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isDB && (
            <ReviewTable
              title="Dutch Bucket"
              info={[
                ["EC tandon", `${fmt(dbData.ecTandon)} mS/cm`],
                ["EC bucket", `${fmt(dbData.ecBucket)} mS/cm`],
                ["pH tandon", fmt(dbData.phTandon)],
                ["pH bucket", fmt(dbData.phBucket)],
                ["DO tandon", `${fmt(dbData.doTandon)} mg/L`],
                ["DO bucket", `${fmt(dbData.doBucket)} mg/L`],
                ["Suhu", `${fmt(dbData.suhu)} °C`],
                ["RH", `${fmt(dbData.rh)} %`],
                ["Volume nutrisi", `${fmt(dbData.volNutrisi)} L`],
              ]}
            />
          )}

          {submitError && <FieldAlert tone="danger">{submitError}</FieldAlert>}
        </>
      )}

      {/* ══ STEP 4 — Sukses ══ */}
      {step === 4 && (
        <SuccessState
          title={`Penyiraman ${gh} terkirim`}
          description={`${varianList.length} varian${isDB ? " + data Dutch Bucket" : ""} masuk ke sheet.`}
          summary={[
            ["GH", `${gh} · ${tipe}`],
            ["Varian", varianList.join(", ") + (isDB ? ", Dutch Bucket" : "")],
            ["Operator", operator || user?.nama || "-"],
          ]}
        />
      )}
    </FormShell>
  );
}
