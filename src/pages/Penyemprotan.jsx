import { useState, useEffect, useCallback } from "react";
import { useDraft } from "../hooks/useDraft";
import { useAuth } from "../hooks/useAuth";
import { idbAdd, idbGetAll, idbDelete, idbCount, gasPost } from "../utils/idb";
import { useGHData } from "../hooks/useGHData";
import { useGHBlockedList, warnIfGHBlocked } from "../hooks/useGHBlockedList";
import { FormShell, FieldAlert, SuccessState, GHPicker, ReviewTable, Dialog, Icon, OperatorField } from "../components/form";
import { formatTanggal } from "../lib/format";

const DB_NAME    = "PenyemprotanOfflineDB";
const SCRIPT_URL = import.meta.env.VITE_GAS_PENYEMPROTAN_URL;

// GH Nursery selalu tampil di Penyemprotan (tidak bergantung data sheet REF)
const NURSERY_GH = [
  "NURSERY 1","NURSERY 2","NURSERY 3","NURSERY 4","NURSERY 6","NURSERY 7","NURSERY 1 SAWAHAN",
];

function buildGHGroups(ghData) {
  const areaMap = {};
  const addGH = (ghName) => {
    const match = ghName.match(/^(.+?)\s+(\d+)(?:\s+(.+))?$/);
    if (!match) return;
    const area  = match[1].trim();
    const num   = parseInt(match[2]);
    const extra = match[3] ? match[3].trim() : "";
    if (!areaMap[area]) {
      areaMap[area] = { area, items: [] };
    }
    const name = extra ? `${area} ${num} ${extra}` : `${area} ${num}`;
    if (!areaMap[area].items.some(i => i.name === name)) {
      areaMap[area].items.push({ name, num, label: extra ? `${num} ${extra}` : String(num), extra });
    }
  };
  // Nama dari sheet yang berakhiran sufiks (mis. "NURSERY 1 SAWAHAN") hanya diterima untuk Nursery
  Object.keys(ghData).sort().forEach(ghName => {
    if (/^(.+?)\s+(\d+)$/.test(ghName) || ghName.toUpperCase().startsWith("NURSERY")) addGH(ghName.toUpperCase().startsWith("NURSERY") ? ghName.toUpperCase() : ghName);
  });
  NURSERY_GH.forEach(addGH);
  Object.values(areaMap).forEach(g => g.items.sort((a, b) => a.num - b.num || a.extra.localeCompare(b.extra)));
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
  "DACONIL","JIMMY HANTU","MGS","PENTACURE","SORE","SPRING","VELUM","ZEEWA","ANDAVIT",
  // Perekat / surfaktan (untuk pencampuran) — SEMENTARA, tunggu konfirmasi tim HPT
  "AGRISTICK","CITOWETT","LATRON","SILWET L-77","TRITON","SUPER SPREADER",
];

// ─── Konsentrasi ──────────────────────────────────────────────────────────────
const KONSENTRASI_LIST = [
  "0.25 Gr/L","0.5 Gr/L","0.75 Gr/L","1 Gr/L","2 Gr/L","3 Gr/L","1 Gr/6L","1/12 Gr/L","5 Gr/16L",
  "0.15 ml/L","0.20 ml/L","0.25 ml/L","0.50 ml/L","0.75 ml/L","1 ml/L","1.5 ml/L","2 ml/L",
];

// ─── Waktu (periode) ──────────────────────────────────────────────────────────
const WAKTU_PERIODE_LIST = ["Pagi","Siang","Sore"];

// ─── Sterilisasi ──────────────────────────────────────────────────────────────
const STERILISASI_LIST = ["Steril Ke-1","Steril Ke-2","Steril Ke-3","Steril Ke-4","Steril","Tidak ada"];

// ─── Oles GSB ─────────────────────────────────────────────────────────────────
const PESTISIDA_GSB   = ["Spring","Copcide","Ridomil","Deconil"];
const KONSENTRASI_GSB = ["50 g/L","100 g/L"];

// ─── Peruntukan Gas (shared) ──────────────────────────────────────────────────
const PERUNTUKAN_LIST = ["Kocor Media","Cuci Insecnet","Penyemprotan Pestisida","Penyemprotan Air Baku"];

// ─── Kegiatan ─────────────────────────────────────────────────────────────────
const KEGIATAN = [
  { key: "penggunaan_ambil", icon: "SprayCan",   label: "Penggunaan & pengambilan obat", desc: "Catat pengambilan stok dan/atau penggunaan pestisida" },
  { key: "oles_gsb",         icon: "Paintbrush", label: "Oles GSB",                      desc: "Pengolesan pestisida untuk pengendalian GSB" },
  { key: "pemakaian_gas",    icon: "Flame",      label: "Pemakaian gas",                 desc: "Catat penggunaan tabung gas untuk kegiatan penyemprotan" },
];
const kegiatanLabel = (key) => KEGIATAN.find(k => k.key === key)?.label || "";

// todayISO dikirim ke sheet (format dd/mm/yyyy) — jangan diubah
const todayISO   = new Date().toLocaleDateString("id-ID",{day:"2-digit",month:"2-digit",year:"numeric"});

// Angka desimal: koma diterima, disimpan dengan titik seperti input number lama
const desimal = (raw) => raw.replace(",", ".").replace(/[^\d.]/g, "");

// ─── Komponen: Searchable Pestisida Picker (dengan opsi "Lainnya" manual) ────
function PestisidaPicker({ value, onChange, label }) {
  const [search, setSearch] = useState("");
  const [open, setOpen]     = useState(false);
  const [manual, setManual] = useState(() => value !== "" && !PESTISIDA_LIST.includes(value));

  const filtered = search.trim().length > 0
    ? PESTISIDA_LIST.filter(p => p.toLowerCase().includes(search.toLowerCase()))
    : PESTISIDA_LIST;

  const isCustom = manual || (value !== "" && !PESTISIDA_LIST.includes(value));

  if (isCustom) {
    return (
      <div style={{ display: "flex", gap: 6 }}>
        <input
          className="fh-input" value={value} onChange={e => onChange(e.target.value)} autoFocus
          placeholder="Tulis nama pestisida" aria-label={label}
        />
        <button type="button" className="fh-icon-btn" style={{ height: 48, width: 48 }} onClick={() => { onChange(""); setManual(false); }} aria-label="Batal isi manual">
          <Icon name="X" />
        </button>
      </div>
    );
  }

  if (value) {
    return (
      <div className="fh-picked">
        <span>{value}</span>
        <button type="button" className="fh-icon-btn" style={{ border: "none", background: "transparent", color: "inherit" }} onClick={() => onChange("")} aria-label={`Ganti ${label}`}>
          <Icon name="X" />
        </button>
      </div>
    );
  }

  return (
    <div className="fh-combo">
      <div className="fh-search">
        <Icon name="Search" size={18} />
        <input
          className="fh-input" value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Cari nama pestisida" aria-label={label}
        />
      </div>
      {open && (
        <div className="fh-combo-list" role="listbox">
          {filtered.map(p => (
            <button key={p} type="button" className="fh-combo-item" onMouseDown={() => { onChange(p); setSearch(""); setOpen(false); }}>
              {p}
            </button>
          ))}
          <button type="button" className="fh-combo-item is-manual" onMouseDown={() => { setManual(true); setSearch(""); setOpen(false); }}>
            <Icon name="PenLine" size={16} /> Lainnya, isi manual
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Komponen: Pilihan chip dengan opsi "Lainnya" (isi manual) ───────────────
function ChoiceChips({ list, value, onChange, placeholder = "Tulis pilihan lain", withLainnya = true }) {
  const [manual, setManual] = useState(() => value !== "" && !list.includes(value));
  const isCustom = withLainnya && (manual || (value !== "" && !list.includes(value)));

  return (
    <div className="fh-section">
      <div className="fh-chips">
        {list.map(item => (
          <button key={item} type="button" aria-pressed={value === item}
            className={`fh-chip${value === item ? " is-active" : ""}`}
            onClick={() => { onChange(value === item ? "" : item); setManual(false); }}>
            {item}
          </button>
        ))}
        {withLainnya && (
          <button type="button" className={`fh-chip is-dashed${isCustom ? " is-active" : ""}`} onClick={() => { setManual(true); onChange(""); }}>
            <Icon name="PenLine" size={16} /> Lainnya
          </button>
        )}
      </div>
      {isCustom && (
        <input className="fh-input" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoFocus />
      )}
    </div>
  );
}

// ─── Komponen: Segmented — pilihan sejajar; allowClear = tekan lagi untuk kosongkan ──
function Segmented({ options, value, onChange, allowClear = false, label }) {
  return (
    <div className="fh-seg" role="radiogroup" aria-label={label}>
      {options.map(opt => {
        const active = value === opt.v;
        return (
          <button key={String(opt.v)} type="button" role="radio" aria-checked={active}
            className={`fh-chip${active ? " is-active" : ""}`}
            onClick={() => onChange(allowClear && active ? (opt.clear ?? "") : opt.v)}>
            {opt.l}
          </button>
        );
      })}
    </div>
  );
}

// ─── Komponen: Field dengan label ─────────────────────────────────────────────
function Field({ label, required, children }) {
  return (
    <div className="fh-section">
      <span className="fh-label">{label}{required ? "" : <span className="fh-meta" style={{ fontWeight: 400 }}> · opsional</span>}</span>
      {children}
    </div>
  );
}

// ─── Komponen: Input angka dengan satuan di dalam ─────────────────────────────
function UnitInput({ value, onChange, unit, label }) {
  return (
    <div className="fh-unit">
      <input className="fh-input is-number" type="text" inputMode="decimal" value={value}
        onChange={e => onChange(desimal(e.target.value))} placeholder="0" aria-label={label} />
      <span className="fh-unit-label">{unit}</span>
    </div>
  );
}

// ─── Komponen: Isian Gas (Nomor Gas / Gas Baru? / Peruntukan) ─────────────────
// required — wajib di form Pemakaian gas; opsional di form Penggunaan
function GasFields({ data, setData, required = false, peruntukanLainnya = true }) {
  return (
    <>
      <Field label="Nomor gas" required={required}>
        <input className="fh-input" value={data.nomorGas} onChange={e => setData(d => ({ ...d, nomorGas: e.target.value }))} placeholder="Contoh: G-01" />
      </Field>
      <Field label="Apakah gas baru?" required={required}>
        <Segmented label="Gas baru" allowClear value={data.gasBaru}
          options={[{ v: true, l: "Ya", clear: null }, { v: false, l: "Tidak", clear: null }]}
          onChange={v => setData(d => ({ ...d, gasBaru: v }))} />
      </Field>
      <Field label="Peruntukan" required={required}>
        <ChoiceChips list={PERUNTUKAN_LIST} value={data.peruntukan} withLainnya={peruntukanLainnya}
          onChange={v => setData(d => ({ ...d, peruntukan: v }))} placeholder="Tulis peruntukan lain" />
      </Field>
    </>
  );
}

// ─── App utama ─────────────────────────────────────────────────────────────────
export default function Penyemprotan() {
  const { user } = useAuth();
  const { getDraft, saveDraft, clearDraft } = useDraft("penyemprotan");
  const _draft = getDraft();

  const [step, setStep]             = useState(_draft?.step       || "start");
  const [navHistory, setNavHistory] = useState(_draft?.navHistory || []);

  const [activity, setActivity]     = useState(_draft?.activity   || "");
  const [selectedGH, setSelectedGH] = useState(_draft?.selectedGH || "");
  // Operator otomatis dari akun login; bisa diubah di langkah rekap
  const [operator, setOperator]     = useState(_draft?.operator || user?.nama || "");

  // ── Oles GSB ──
  const [pestisidaGSB, setPestisidaGSB]     = useState(_draft?.pestisidaGSB   || "");
  const [konsentrasiGSB, setKonsentrasiGSB] = useState(_draft?.konsentrasiGSB || "");
  const [penggunaanGram, setPenggunaanGram] = useState(_draft?.penggunaanGram || "");

  // ── Pengambilan Pestisida ──
  const [adaPengambilan, setAdaPengambilan] = useState(null);
  const [ambil, setAmbil] = useState({
    namaPestisida: "", jumlah: "",
  });

  // ── Penggunaan Pestisida ──
  const [guna, setGuna] = useState({
    namaPestisida: "", konsentrasi: "", jumlahPemakaian: "", sterilisasi: "",
    suhuMulai: "", rhMulai: "", suhuSelesai: "", rhSelesai: "",
    waktuMulai: "", waktuSelesai: "", waktuPeriode: "",
    varianTidakDisemprot: "", keterangan: "",
    nomorGas: "", gasBaru: null, peruntukan: "",
    jenisCampuran: "tanpa", namaPestisida2: "", konsentrasi2: "", jumlahPemakaian2: "",
  });

  // ── Pemakaian Gas ──
  const [gas, setGas] = useState({
    waktuMulai: "", waktuSelesai: "", nomorGas: "", gasBaru: null, peruntukan: "",
  });

  // useAuth membaca sessionStorage setelah render pertama → isi operator begitu nama tersedia
  useEffect(() => {
    if (user?.nama) setOperator(prev => prev || user.nama);
  }, [user?.nama]);

  // ── Offline ──
  useEffect(() => {
    if (step === "sukses") return;
    saveDraft({ step, navHistory, activity, selectedGH, operator, pestisidaGSB, konsentrasiGSB, penggunaanGram });
  }, [step, navHistory, activity, selectedGH, operator, pestisidaGSB, konsentrasiGSB, penggunaanGram]);

  const [isOnline, setIsOnline]                 = useState(navigator.onLine);
  const [pendingCount, setPendingCount]         = useState(0);
  const [syncing, setSyncing]                   = useState(false);
  const [submitError, setSubmitError]           = useState(null);
  const [savedOffline, setSavedOffline]         = useState(false);
  const [isSyncingPending, setIsSyncingPending] = useState(false);
  const [sessionKey] = useState(() => "sk_" + Date.now() + "_" + Math.random().toString(36).slice(2));
  const isDemoMode = !SCRIPT_URL;

  const { ghData, loading: loadingGH } = useGHData();
  const { blockedMap } = useGHBlockedList();
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

  const syncPendingData = useCallback(async () => {
    const all = await idbGetAll(DB_NAME);
    if (!all.length) return;
    setIsSyncingPending(true);
    for (const rec of all) {
      try {
        const res = await gasPost(SCRIPT_URL, rec.payload);
        // Data yang ditolak server karena tidak lengkap tidak akan pernah berhasil — buang dari antrian
        if (res?.success || /tidak lengkap/i.test(res?.error || "")) await idbDelete(DB_NAME, rec.id);
      } catch { /* coba lagi nanti */ }
    }
    await refreshPendingCount();
    setIsSyncingPending(false);
  }, [refreshPendingCount]);

  // ── Auto-sync saat kembali online ──
  useEffect(() => { if (isOnline) syncPendingData(); }, [isOnline]);

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
    const base = { action:"submitPenyemprotan", tanggal:todayISO, gh:selectedGH, operator:operator.trim(), type:activity, client_timestamp: new Date().toISOString() };
    if (activity === "oles_gsb") {
      return { ...base, pestisida:pestisidaGSB, konsentrasi:konsentrasiGSB, penggunaan_gram:penggunaanGram };
    }
    if (activity === "pemakaian_gas") {
      return {
        ...base,
        gas_waktu_mulai:   gas.waktuMulai,
        gas_waktu_selesai: gas.waktuSelesai,
        gas_nomor:         gas.nomorGas,
        gas_baru:          gas.gasBaru,
        gas_peruntukan:    gas.peruntukan,
      };
    }
    return {
      ...base,
      ada_pengambilan: adaPengambilan,
      // Pengambilan
      ambil_nama_pestisida:       ambil.namaPestisida,
      ambil_jumlah:               ambil.jumlah,
      // Penggunaan
      guna_nama_pestisida:        guna.namaPestisida,
      guna_konsentrasi:           guna.konsentrasi,
      guna_jumlah_pemakaian:      guna.jumlahPemakaian,
      guna_suhu_mulai:            guna.suhuMulai,
      guna_rh_mulai:              guna.rhMulai,
      guna_suhu_selesai:          guna.suhuSelesai,
      guna_rh_selesai:            guna.rhSelesai,
      guna_waktu_mulai:           guna.waktuMulai,
      guna_waktu_selesai:         guna.waktuSelesai,
      guna_waktu_periode:         guna.waktuPeriode,
      guna_varian_skip:           guna.varianTidakDisemprot,
      guna_sterilisasi:           guna.sterilisasi,
      guna_nomor_gas:             guna.nomorGas,
      guna_gas_baru:              guna.gasBaru,
      guna_peruntukan:            guna.peruntukan,
      guna_keterangan:            guna.keterangan,
      guna_jenis_campuran:        guna.jenisCampuran === "campuran" ? "Campuran" : "Tanpa Campuran",
      guna_nama_pestisida_2:      guna.jenisCampuran === "campuran" ? guna.namaPestisida2 : "",
      guna_konsentrasi_2:         guna.jenisCampuran === "campuran" ? guna.konsentrasi2 : "",
      guna_jumlah_pemakaian_2:    guna.jenisCampuran === "campuran" ? guna.jumlahPemakaian2 : "",
    };
  };

  const handleSubmit = async () => {
    if (warnIfGHBlocked(selectedGH, blockedMap)) return;
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
      } catch { setSubmitError("Data belum tersimpan di perangkat. Tekan Simpan offline sekali lagi."); setSyncing(false); return; }
      navigateTo("sukses"); setSyncing(false); return;
    }
    try {
      const res = await gasPost(SCRIPT_URL, payload);
      if (!res?.success) { setSubmitError(`Ditolak server: ${res?.error || "alasan tidak diketahui"}. Periksa isian lalu kirim lagi.`); setSyncing(false); return; }
    } catch { setSubmitError("Data belum terkirim karena koneksi terputus. Cek sinyal lalu tekan Kirim lagi."); setSyncing(false); return; }
    navigateTo("sukses"); setSyncing(false);
  };

  const resetForm = () => {
    clearDraft();
    setStep("start"); setNavHistory([]);
    setActivity(""); setSelectedGH(""); setOperator(user?.nama || "");
    setPestisidaGSB(""); setKonsentrasiGSB(""); setPenggunaanGram("");
    setAdaPengambilan(null);
    setAmbil({ namaPestisida:"", jumlah:"" });
    setGuna({ namaPestisida:"", konsentrasi:"", jumlahPemakaian:"", sterilisasi:"", suhuMulai:"", rhMulai:"", suhuSelesai:"", rhSelesai:"", waktuMulai:"", waktuSelesai:"", waktuPeriode:"", varianTidakDisemprot:"", keterangan:"", nomorGas:"", gasBaru:null, peruntukan:"", jenisCampuran:"tanpa", namaPestisida2:"", konsentrasi2:"", jumlahPemakaian2:"" });
    setGas({ waktuMulai:"", waktuSelesai:"", nomorGas:"", gasBaru:null, peruntukan:"" });
    setSyncing(false); setSubmitError(null); setSavedOffline(false);
  };

  // ── Validasi ──
  const canStart   = activity !== "" && selectedGH !== "";
  const canOlesGSB = pestisidaGSB !== "" && konsentrasiGSB !== "" && penggunaanGram !== "";
  const canAmbil   = adaPengambilan === true ? (ambil.namaPestisida !== "" && ambil.jumlah !== "") : true;
  const canGuna    = guna.namaPestisida !== "" && guna.konsentrasi !== "" && guna.jumlahPemakaian !== ""
    && (guna.jenisCampuran !== "campuran" || (guna.namaPestisida2 !== "" && guna.konsentrasi2 !== "" && guna.jumlahPemakaian2 !== ""));
  const canGas     = gas.nomorGas.trim() !== "" && gas.gasBaru !== null && gas.peruntukan !== "";
  const canSubmit  = operator.trim() !== "" && !syncing;

  const setG = (field) => (v) => setGuna(d => ({ ...d, [field]: v }));

  // ── Header ──
  const stepNo = step === "start" ? 1 : step === "rekap" ? 3 : 2;
  const title = step === "start" || step === "sukses" ? "Penyemprotan" : `Penyemprotan · ${selectedGH}`;
  const subtitle = step === "start"
    ? `${formatTanggal()} · Langkah 1 dari 3`
    : step === "sukses"
      ? formatTanggal()
      : `${kegiatanLabel(activity)} · Langkah ${stepNo} dari 3`;

  // ── Footer ──
  let footer = null;
  if (step === "start") {
    footer = (
      <button type="button" className="fh-btn fh-btn-primary" disabled={!canStart}
        onClick={() => navigateTo(activity === "oles_gsb" ? "form_oles" : activity === "pemakaian_gas" ? "form_gas" : "form_ambil")}>
        {!activity ? "Pilih kegiatan" : !selectedGH ? "Pilih GH" : "Lanjut"}
      </button>
    );
  } else if (step === "form_oles") {
    footer = <button type="button" className="fh-btn fh-btn-primary" disabled={!canOlesGSB} onClick={() => navigateTo("rekap")}>Lihat rekap</button>;
  } else if (step === "form_ambil" && adaPengambilan === true) {
    footer = (
      <div className="fh-btn-row">
        <button type="button" className="fh-btn fh-btn-secondary" disabled={!canAmbil} onClick={() => navigateTo("rekap")}>Langsung rekap</button>
        <button type="button" className="fh-btn fh-btn-primary" disabled={!canAmbil} onClick={() => navigateTo("form_guna")}>Lanjut ke penggunaan</button>
      </div>
    );
  } else if (step === "form_guna") {
    footer = <button type="button" className="fh-btn fh-btn-primary" disabled={!canGuna} onClick={() => navigateTo("rekap")}>Lihat rekap</button>;
  } else if (step === "form_gas") {
    footer = <button type="button" className="fh-btn fh-btn-primary" disabled={!canGas} onClick={() => navigateTo("rekap")}>Lihat rekap</button>;
  } else if (step === "rekap") {
    footer = (
      <div className="fh-btn-row">
        <button type="button" className="fh-btn fh-btn-secondary" onClick={goBack}>Kembali</button>
        <button type="button" className="fh-btn fh-btn-primary" disabled={!canSubmit} onClick={handleSubmit}>
          {syncing ? "Mengirim…" : isDemoMode ? "Kirim demo" : !isOnline ? "Simpan offline" : "Kirim"}
        </button>
      </div>
    );
  } else if (step === "sukses") {
    footer = <button type="button" className="fh-btn fh-btn-secondary" onClick={resetForm}>Isi GH lain</button>;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <FormShell
      title={title}
      subtitle={subtitle}
      steps={step === "sukses" ? 0 : 3}
      step={stepNo}
      onBack={step !== "sukses" && navHistory.length > 0 ? goBack : undefined}
      footer={footer}
    >

      {/* ── Status koneksi & antrean ── */}
      {step !== "sukses" && !isOnline && (
        <FieldAlert tone="info">Mode offline. Data disimpan di perangkat dan terkirim otomatis saat online.</FieldAlert>
      )}
      {step !== "sukses" && pendingCount > 0 && (
        <FieldAlert
          tone="warning"
          action={isOnline && !isSyncingPending ? { label: "Kirim sekarang", onClick: syncPendingData } : undefined}
        >
          {isSyncingPending ? "Mengirim data tertunda…" : `${pendingCount} isian tersimpan offline, belum terkirim.`}
        </FieldAlert>
      )}
      {step !== "sukses" && isDemoMode && (
        <FieldAlert tone="warning">Mode demo. Data tidak dikirim ke sheet.</FieldAlert>
      )}

      {/* ══ START ══════════════════════════════════════════════════════════════ */}
      {step === "start" && (
        <>
          <section className="fh-section">
            <span className="fh-label">Kegiatan</span>
            <div className="fh-options" role="radiogroup" aria-label="Kegiatan">
              {KEGIATAN.map(opt => {
                const active = activity === opt.key;
                return (
                  <button key={opt.key} type="button" role="radio" aria-checked={active}
                    className={`fh-option${active ? " is-active" : ""}`}
                    onClick={() => { setActivity(opt.key); setSelectedGH(""); }}>
                    <Icon name={opt.icon} size={24} className="fh-option-icon" />
                    <span className="fh-option-label">
                      {opt.label}
                      <span className="fh-option-desc">{opt.desc}</span>
                    </span>
                    <span className="fh-option-radio" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </section>

          {activity && (
            <section className="fh-section">
              <div className="fh-section-head">
                <span className="fh-label">Pilih GH</span>
                {selectedGH && <span className="fh-meta">{selectedGH} dipilih</span>}
              </div>
              <GHPicker
                loading={loadingGH}
                selected={selectedGH}
                onSelect={(g) => { if (!warnIfGHBlocked(g, blockedMap)) setSelectedGH(g); }}
                items={ghGroups.flatMap(group => group.items.map(item => {
                  const blockedInfo = blockedMap[item.name.trim().toUpperCase()];
                  return { gh: item.name, badges: blockedInfo ? [{ label: blockedInfo.aksi, tone: "danger" }] : [] };
                }))}
              />
            </section>
          )}
        </>
      )}

      {/* ══ FORM OLES GSB ══════════════════════════════════════════════════════ */}
      {step === "form_oles" && (
        <>
          <Field label="Pestisida" required>
            <ChoiceChips list={PESTISIDA_GSB} value={pestisidaGSB} withLainnya={false} onChange={setPestisidaGSB} />
          </Field>
          <Field label="Konsentrasi" required>
            <Segmented label="Konsentrasi" value={konsentrasiGSB} onChange={setKonsentrasiGSB}
              options={KONSENTRASI_GSB.map(k => ({ v: k, l: k }))} />
          </Field>
          <Field label="Penggunaan" required>
            <UnitInput label="Penggunaan" unit="gram" value={penggunaanGram} onChange={setPenggunaanGram} />
          </Field>
        </>
      )}

      {/* ══ FORM PENGAMBILAN PESTISIDA ═════════════════════════════════════════ */}
      {step === "form_ambil" && adaPengambilan === true && (
        <>
          <span className="fh-overline">Pengambilan pestisida</span>
          <Field label="Nama pestisida" required>
            <PestisidaPicker label="Nama pestisida" value={ambil.namaPestisida} onChange={v => setAmbil(d => ({ ...d, namaPestisida: v }))} />
          </Field>
          <Field label="Jumlah pengambilan" required>
            <input className="fh-input" value={ambil.jumlah} onChange={e => setAmbil(d => ({ ...d, jumlah: e.target.value }))}
              placeholder="Contoh: 500 ml, 1 botol, 2 kg" />
          </Field>
        </>
      )}

      {/* ══ FORM PENGGUNAAN PESTISIDA ══════════════════════════════════════════ */}
      {step === "form_guna" && (
        <>
          {adaPengambilan && (
            <FieldAlert tone="info">Pengambilan: {ambil.namaPestisida} · {ambil.jumlah}</FieldAlert>
          )}

          <span className="fh-overline">Campuran</span>
          <div className="fh-card fh-card-body" style={{ gap: 14 }}>
            <Field label="Nama pestisida" required>
              <PestisidaPicker label="Nama pestisida" value={guna.namaPestisida} onChange={setG("namaPestisida")} />
            </Field>
            <Field label="Konsentrasi" required>
              <ChoiceChips list={KONSENTRASI_LIST} value={guna.konsentrasi} onChange={setG("konsentrasi")} placeholder="Tulis konsentrasi lain" />
            </Field>
            <Field label="Jumlah pemakaian" required>
              <input className="fh-input" value={guna.jumlahPemakaian} onChange={e => setG("jumlahPemakaian")(e.target.value)} placeholder="Contoh: 2 L, 500 ml, 200 g" />
            </Field>
          </div>

          <Field label="Pencampuran" required>
            <Segmented label="Pencampuran" value={guna.jenisCampuran} onChange={setG("jenisCampuran")}
              options={[{ v: "tanpa", l: "Tanpa campuran" }, { v: "campuran", l: "Campuran" }]} />
          </Field>

          {guna.jenisCampuran === "campuran" && (
            <div className="fh-card fh-card-body" style={{ gap: 14 }}>
              <span className="fh-overline">Dicampur dengan pestisida ke-2</span>
              <Field label="Nama pestisida ke-2" required>
                <PestisidaPicker label="Nama pestisida ke-2" value={guna.namaPestisida2} onChange={setG("namaPestisida2")} />
              </Field>
              <Field label="Konsentrasi ke-2" required>
                <ChoiceChips list={KONSENTRASI_LIST} value={guna.konsentrasi2} onChange={setG("konsentrasi2")} placeholder="Tulis konsentrasi lain" />
              </Field>
              <Field label="Jumlah pemakaian ke-2" required>
                <input className="fh-input" value={guna.jumlahPemakaian2} onChange={e => setG("jumlahPemakaian2")(e.target.value)} placeholder="Contoh: 2 L, 500 ml, 200 g" />
              </Field>
            </div>
          )}

          <span className="fh-overline">Kondisi & waktu</span>
          <div className="fh-grid-2" style={{ gap: 12 }}>
            <Field label="Suhu mulai"><UnitInput label="Suhu mulai" unit="°C" value={guna.suhuMulai} onChange={setG("suhuMulai")} /></Field>
            <Field label="RH mulai"><UnitInput label="RH mulai" unit="%" value={guna.rhMulai} onChange={setG("rhMulai")} /></Field>
            <Field label="Suhu selesai"><UnitInput label="Suhu selesai" unit="°C" value={guna.suhuSelesai} onChange={setG("suhuSelesai")} /></Field>
            <Field label="RH selesai"><UnitInput label="RH selesai" unit="%" value={guna.rhSelesai} onChange={setG("rhSelesai")} /></Field>
            <Field label="Waktu mulai">
              <input className="fh-input" type="time" value={guna.waktuMulai} onChange={e => setG("waktuMulai")(e.target.value)} />
            </Field>
            <Field label="Waktu selesai">
              <input className="fh-input" type="time" value={guna.waktuSelesai} onChange={e => setG("waktuSelesai")(e.target.value)} />
            </Field>
          </div>

          <Field label="Waktu">
            <Segmented label="Waktu" allowClear value={guna.waktuPeriode} onChange={setG("waktuPeriode")}
              options={WAKTU_PERIODE_LIST.map(w => ({ v: w, l: w }))} />
          </Field>

          <Field label="Varian yang tidak disemprot">
            <input className="fh-input" value={guna.varianTidakDisemprot} onChange={e => setG("varianTidakDisemprot")(e.target.value)} placeholder="Nama varian, bila ada" />
          </Field>

          <Field label="Sterilisasi">
            <select className={`fh-select${guna.sterilisasi ? "" : " is-empty"}`} value={guna.sterilisasi} onChange={e => setG("sterilisasi")(e.target.value)}>
              <option value="">Pilih sterilisasi</option>
              {STERILISASI_LIST.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>

          <span className="fh-overline">Gas</span>
          <div className="fh-card fh-card-body" style={{ gap: 14 }}>
            <GasFields data={guna} setData={setGuna} />
          </div>

          <Field label="Keterangan">
            <textarea className="fh-textarea" rows={2} value={guna.keterangan} onChange={e => setG("keterangan")(e.target.value)} placeholder="Catatan tambahan" />
          </Field>
        </>
      )}

      {/* ══ FORM PEMAKAIAN GAS ═════════════════════════════════════════════════ */}
      {step === "form_gas" && (
        <>
          <div className="fh-grid-2" style={{ gap: 12 }}>
            <Field label="Waktu mulai">
              <input className="fh-input" type="time" value={gas.waktuMulai} onChange={e => setGas(d => ({ ...d, waktuMulai: e.target.value }))} />
            </Field>
            <Field label="Waktu selesai">
              <input className="fh-input" type="time" value={gas.waktuSelesai} onChange={e => setGas(d => ({ ...d, waktuSelesai: e.target.value }))} />
            </Field>
          </div>
          <GasFields data={gas} setData={setGas} required peruntukanLainnya={false} />
        </>
      )}

      {/* ══ REKAP ══════════════════════════════════════════════════════════════ */}
      {step === "rekap" && (
        <>
          <OperatorField user={user} value={operator} onChange={setOperator} minLength={1} />

          <ReviewTable title="Umum" info={[
            ["Tanggal", formatTanggal()],
            ["GH", selectedGH],
            ["Kegiatan", kegiatanLabel(activity)],
          ]} />

          {activity === "oles_gsb" && (
            <ReviewTable title="Oles GSB" info={[
              ["Pestisida", pestisidaGSB],
              ["Konsentrasi", konsentrasiGSB],
              ["Penggunaan", `${penggunaanGram} gram`],
            ]} />
          )}

          {activity === "penggunaan_ambil" && (
            <ReviewTable title="Pengambilan" info={[
              ["Ada pengambilan", adaPengambilan ? "Ya" : "Tidak"],
              ...(adaPengambilan ? [["Pestisida", ambil.namaPestisida], ["Jumlah", ambil.jumlah]] : []),
            ]} />
          )}

          {activity === "pemakaian_gas" && (
            <ReviewTable title="Pemakaian gas" info={[
              ...(gas.waktuMulai   ? [["Waktu mulai", gas.waktuMulai]] : []),
              ...(gas.waktuSelesai ? [["Waktu selesai", gas.waktuSelesai]] : []),
              ["Nomor gas", gas.nomorGas],
              ["Gas baru", gas.gasBaru ? "Ya" : "Tidak"],
              ["Peruntukan", gas.peruntukan],
            ]} />
          )}

          {activity === "penggunaan_ambil" && guna.namaPestisida && (
            <ReviewTable title="Penggunaan" info={[
              ["Pestisida", guna.namaPestisida],
              ["Konsentrasi", guna.konsentrasi],
              ["Pemakaian", guna.jumlahPemakaian],
              ["Pencampuran", guna.jenisCampuran === "campuran" ? "Campuran" : "Tanpa campuran"],
              ...(guna.jenisCampuran === "campuran" ? [
                ["Pestisida ke-2", guna.namaPestisida2],
                ["Konsentrasi ke-2", guna.konsentrasi2],
                ["Pemakaian ke-2", guna.jumlahPemakaian2],
              ] : []),
              ...(guna.suhuMulai    ? [["Suhu mulai", `${guna.suhuMulai.replace(".", ",")} °C`]] : []),
              ...(guna.rhMulai      ? [["RH mulai", `${guna.rhMulai.replace(".", ",")} %`]] : []),
              ...(guna.suhuSelesai  ? [["Suhu selesai", `${guna.suhuSelesai.replace(".", ",")} °C`]] : []),
              ...(guna.rhSelesai    ? [["RH selesai", `${guna.rhSelesai.replace(".", ",")} %`]] : []),
              ...(guna.waktuMulai   ? [["Waktu mulai", guna.waktuMulai]] : []),
              ...(guna.waktuSelesai ? [["Waktu selesai", guna.waktuSelesai]] : []),
              ...(guna.waktuPeriode ? [["Waktu", guna.waktuPeriode]] : []),
              ...(guna.varianTidakDisemprot ? [["Varian dilewati", guna.varianTidakDisemprot]] : []),
              ...(guna.sterilisasi  ? [["Sterilisasi", guna.sterilisasi]] : []),
              ...(guna.nomorGas     ? [["Nomor gas", guna.nomorGas]] : []),
              ...(guna.gasBaru !== null ? [["Gas baru", guna.gasBaru ? "Ya" : "Tidak"]] : []),
              ...(guna.peruntukan   ? [["Peruntukan", guna.peruntukan]] : []),
              ...(guna.keterangan   ? [["Keterangan", guna.keterangan]] : []),
            ]} />
          )}

          {submitError && <FieldAlert tone="danger">{submitError}</FieldAlert>}
        </>
      )}

      {/* ══ SUKSES ══════════════════════════════════════════════════════════════ */}
      {step === "sukses" && (
        <SuccessState
          offline={savedOffline}
          title={isDemoMode ? "Demo selesai" : savedOffline ? "Tersimpan di perangkat" : `${kegiatanLabel(activity)} terkirim`}
          description={isDemoMode
            ? "Data tidak dikirim (mode demo)."
            : savedOffline
              ? `Terkirim otomatis ke sheet saat online.${pendingCount > 0 ? ` ${pendingCount} isian menunggu.` : ""}`
              : "Data masuk ke sheet."}
          summary={[
            ["GH", selectedGH],
            ["Isian", activity === "oles_gsb"
              ? `${pestisidaGSB} · ${konsentrasiGSB} · ${penggunaanGram} g`
              : activity === "pemakaian_gas"
                ? `Gas ${gas.nomorGas} · ${gas.peruntukan}`
                : `${guna.namaPestisida} ${guna.konsentrasi} ${guna.jumlahPemakaian}${guna.jenisCampuran === "campuran" ? ` + ${guna.namaPestisida2} ${guna.konsentrasi2} ${guna.jumlahPemakaian2}` : ""}`],
            ["Operator", operator],
          ]}
        />
      )}

      {/* ══ Ada pengambilan obat? ══════════════════════════════════════════════ */}
      <Dialog
        open={step === "form_ambil" && adaPengambilan === null}
        title="Ada pengambilan obat hari ini?"
        onClose={goBack}
        actions={
          <div className="fh-section">
            <button type="button" className="fh-btn fh-btn-primary" onClick={() => handleAnswerAmbil(true)}>Ya, ada pengambilan</button>
            <button type="button" className="fh-btn fh-btn-secondary" onClick={() => handleAnswerAmbil(false)}>Tidak, langsung ke penggunaan</button>
          </div>
        }
      >
        Pengambilan pestisida dari gudang atau supplier.
      </Dialog>
    </FormShell>
  );
}
