import { useState, useEffect, useCallback } from "react";
import { useDraft } from "../hooks/useDraft";
import { useAuth } from "../hooks/useAuth";
import { idbAdd, idbGetAll, idbDelete, idbCount, gasFetch } from "../utils/idb";
import { useGHData } from "../hooks/useGHData";
import { useGHBlockedList, warnIfGHBlocked } from "../hooks/useGHBlockedList";
import { FormShell, FieldAlert, SuccessState, GHPicker, ReviewTable, Dialog, SegmentTabs, Stepper, OperatorField } from "../components/form";
import { formatTanggal } from "../lib/format";
import { hstMaksGH } from "../lib/hstLimit";

const DB_NAME = "HPTOfflineDB";

const SCRIPT_URL = import.meta.env.VITE_GAS_HPT_URL;

const LS_SEMAI_CACHE_KEY = "farmhill_semairef_cache";

function saveSemaiCache(data) {
  try { localStorage.setItem(LS_SEMAI_CACHE_KEY, JSON.stringify({ data, savedAt: Date.now() })); }
  catch { /* abaikan */ }
}
function loadSemaiCache() {
  try {
    const raw = localStorage.getItem(LS_SEMAI_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw).data;
  } catch { return null; }
}


const LS_KEY = `hpt_${new Date().toLocaleDateString("id-ID")}`;
function getSubmittedToday() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); }
  catch { return []; }
}
function markSubmitted(gh) {
  const list = getSubmittedToday();
  if (!list.includes(gh)) localStorage.setItem(LS_KEY, JSON.stringify([...list, gh]));
}

function hitungHST(tgl) {
  const [y, m, d] = tgl.split("-").map(Number);
  const tanam = new Date(y, m - 1, d);
  const now = new Date();
  const nowLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((nowLocal - tanam) / 86400000);
}

// HST mendekati batas akhir (65) ditandai supaya diprioritaskan
function hstTone(hst) {
  if (hst <= 40) return "neutral";
  if (hst <= 50) return "warning";
  return "due";
}

// todayISO dikirim ke sheet (format dd/mm/yyyy) — jangan diubah
const todayISO   = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });

// key & label dikirim/ditampilkan apa adanya — jangan diubah
const HAMA_LIST = [
  { key: "kutu_kebul",  label: "Kutu Kebul",     unit: "ekor" },
  { key: "thrips",      label: "Thrips",          unit: "ekor" },
  { key: "ulat_kupu",   label: "Ulat/Kupu-kupu", unit: "ekor" },
  { key: "tungau",      label: "Tungau",          unit: "per daun" },
  { key: "tikus",       label: "Tikus",           unit: "ekor" },
  { key: "aphids",      label: "Aphids",          unit: "ekor" },
  { key: "ulat_kompos", label: "Ulat Kompos",     unit: "ekor" },
  { key: "kutu_putih",  label: "Kutu Putih",      unit: "ekor" },
];

const PENYAKIT_SKOR = [
  { key: "dm", label: "DM", fullLabel: "Downy Mildew",   hasSkor: true },
  { key: "pm", label: "PM", fullLabel: "Powdery Mildew", hasSkor: true },
];
const PENYAKIT_SIMPLE = [
  { key: "gsb", label: "GSB", fullLabel: "Gummy Stem Blight" },
];
const SKOR_KEYS = ["skor1", "skor2", "skor3", "skor4"];

function initHPTData() {
  const hama = {};
  HAMA_LIST.forEach(h => { hama[h.key] = ""; });
  const penyakit = {};
  PENYAKIT_SKOR.forEach(p => {
    penyakit[p.key] = { insidensi: "", skor1: "", skor2: "", skor3: "", skor4: "" };
  });
  PENYAKIT_SIMPLE.forEach(p => {
    penyakit[p.key] = { jumlah: "" };
  });
  return { hama, penyakit, keterangan: "" };
}

const TIPE_GH = [
  {
    key: "drip",
    label: "Drip",
    pattern: (gh) => {
      const upper = gh.toUpperCase();
      if (upper.startsWith("BERGAS")) {
        const num = parseInt(upper.replace("BERGAS", "").trim());
        return num >= 1 && num <= 8 && num !== 6;
      }
      if (upper.startsWith("COLOMADU")) {
        const num = parseInt(upper.replace("COLOMADU", "").trim());
        return num >= 1 && num <= 4;
      }
      if (upper.startsWith("TOHUDAN")) {
        const num = parseInt(upper.replace("TOHUDAN", "").trim());
        return num === 14 || num === 15 || num === 16 || num === 17 || num === 18 || num === 19 || num === 20 || num === 21;
      }
      return false;
    },
  },
  {
    key: "kolam",
    label: "Kolam",
    pattern: (gh) => {
      const upper = gh.toUpperCase();
      if (upper.startsWith("TOHUDAN")) {
        const num = parseInt(upper.replace("TOHUDAN", "").trim());
        return (num >= 1 && num <= 13) || num === 22;
      }
      if (upper.startsWith("SAWAHAN")) {
        const num = parseInt(upper.replace("SAWAHAN", "").trim());
        return num >= 1 && num <= 4;
      }
      return false;
    },
  },
];

const isFilled = (v) => v !== undefined && v !== "" && v !== "0";


export default function HPT() {
  const { user } = useAuth();
  // ── Draft persistence ──
  const { getDraft, saveDraft, clearDraft } = useDraft("hpt");
  const _draft = getDraft();

  const [step, setStep]       = useState(_draft?.step === 2 || _draft?.step === 3 ? _draft.step : 1);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const { produksiData, loading: loadingGH, isDemoMode } = useGHData();
  const { blockedMap } = useGHBlockedList();

  // Semai data di-fetch langsung dari VITE_GAS_HPT_URL, terpisah dari useGHData
  const [semaiData,      setSemaiData]      = useState({});
  const [loadingSemai,   setLoadingSemai]   = useState(false);

  const fetchSemaiRef = useCallback(async () => {
    setLoadingSemai(true);
    try {
      const json = await gasFetch(`${SCRIPT_URL}?action=getSemaiRef`);
      if (json?.semai) {
        setSemaiData(json.semai);
        saveSemaiCache(json.semai);
      } else {
        throw new Error("Response semai kosong");
      }
    } catch {
      // Fallback ke cache kalau fetch gagal
      const cached = loadSemaiCache();
      if (cached) setSemaiData(cached);
    } finally {
      setLoadingSemai(false);
    }
  }, []);

  useEffect(() => { fetchSemaiRef(); }, [fetchSemaiRef]);

  const [selectedGH, setSelectedGH] = useState(_draft?.selectedGH || "");
  const [activeTab, setActiveTab]   = useState(_draft?.activeTab   || "produksi");
  // Operator otomatis dari akun login; bisa diubah di langkah rekap
  const [operator, setOperator]     = useState(_draft?.operator || user?.nama || "");
  const [hptData, setHptData]       = useState(_draft?.hptData     || initHPTData());
  const [syncing, setSyncing]       = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [savedOffline, setSavedOffline] = useState(false);

  const [submittedToday, setSubmittedToday] = useState(getSubmittedToday());
  const [showWarning, setShowWarning]       = useState(false);
  const [pendingGH, setPendingGH]           = useState("");

  const [pendingCount, setPendingCount]         = useState(0);
  const [isSyncingPending, setIsSyncingPending] = useState(false);

  // useAuth membaca sessionStorage setelah render pertama → isi operator begitu nama tersedia
  useEffect(() => {
    if (user?.nama) setOperator(prev => prev || user.nama);
  }, [user?.nama]);

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

  useEffect(() => {
    if (isOnline) syncPendingData();
  }, [isOnline]);


  const syncPendingData = useCallback(async () => {
    const allPending = await idbGetAll(DB_NAME);
    if (allPending.length === 0) return;
    setIsSyncingPending(true);
    for (const record of allPending) {
      try {
        const params = new URLSearchParams(record.payload).toString();
        const result = await gasFetch(`${SCRIPT_URL}?${params}`);
        if (result?.status === "ok" || result?.success) {
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

  const HST_MAKS = Infinity; // tanpa batas — GH tampil sampai ada tanam baru
  const ghAktif    = Object.entries(produksiData).filter(([gh, info]) => {
    if (!info.tanam) return true;
    return hitungHST(info.tanam) <= hstMaksGH(gh, HST_MAKS);
  });
  const semaiAktif = Object.entries(semaiData).filter(([, info]) => info.status === "SEDANG_SEMAI");

  const handleSelectGH = (gh) => {
    if (warnIfGHBlocked(gh, blockedMap)) return;
    if (submittedToday.includes(gh)) {
      setPendingGH(gh);
      setShowWarning(true);
    } else {
      doSelectGH(gh);
    }
  };

  const doSelectGH = (gh) => {
    setSelectedGH(gh);
    setHptData(initHPTData());
    setShowWarning(false);
    setPendingGH("");
    setStep(2);
  };

  const ghInfo = activeTab === "semai" ? semaiData[selectedGH] : produksiData[selectedGH];
  const ghLabel = (activeTab === "semai" && ghInfo?.nama) || selectedGH;
  const hst  = ghInfo?.tanam ? hitungHST(ghInfo.tanam) : null;
  const umurLabel = activeTab === "semai" ? "HSS" : "HST";

  const loadingRef = activeTab === "semai" ? loadingSemai : loadingGH;
  // data GH harus sudah termuat — periode & HST diambil dari situ
  const canSubmit = operator.trim().length >= 2 && !syncing && !loadingRef;

  const handleHama = (key, val) => {
    if (val === "" || /^\d+$/.test(val))
      setHptData(d => ({ ...d, hama: { ...d.hama, [key]: val } }));
  };

  const handlePenyakitField = (key, field, raw) => {
    const val = raw.replace(",", "."); // koma diterima sebagai desimal
    if (val === "" || /^\d*\.?\d*$/.test(val))
      setHptData(d => ({ ...d, penyakit: { ...d.penyakit, [key]: { ...d.penyakit[key], [field]: val } } }));
  };

  // Auto-save draft
  useEffect(() => {
    if (step === 4) return;
    saveDraft({ step, selectedGH, activeTab, operator, hptData });
  }, [step, selectedGH, activeTab, operator, hptData]);

  const resetForm = () => {
    clearDraft();
    setStep(1); setSelectedGH(""); setOperator(user?.nama || ""); setActiveTab("produksi");
    setHptData(initHPTData()); setSyncing(false);
    setSubmitError(null); setSavedOffline(false);
  };

  const buildPayload = () => ({
    action: "submitHPT",
    client_timestamp: new Date().toISOString(),
    tipe: activeTab,
    tanggal: todayISO,
    gh: ghLabel,
    periode: ghInfo?.periode || "",
    hst,
    operator,
    ...Object.fromEntries(HAMA_LIST.map(h => [`hama_${h.key}`, hptData.hama[h.key] || "0"])),
    ...Object.fromEntries(PENYAKIT_SKOR.flatMap(p => [
      [`penyakit_${p.key}_insidensi`, hptData.penyakit[p.key]?.insidensi || "0"],
      [`penyakit_${p.key}_skor1`,     hptData.penyakit[p.key]?.skor1     || "0"],
      [`penyakit_${p.key}_skor2`,     hptData.penyakit[p.key]?.skor2     || "0"],
      [`penyakit_${p.key}_skor3`,     hptData.penyakit[p.key]?.skor3     || "0"],
      [`penyakit_${p.key}_skor4`,     hptData.penyakit[p.key]?.skor4     || "0"],
    ])),
    ...Object.fromEntries(PENYAKIT_SIMPLE.map(p => [
      [`penyakit_${p.key}`, hptData.penyakit[p.key]?.jumlah || "0"],
    ])),
    keterangan: hptData.keterangan,
  });

  const handleSubmit = async () => {
    if (warnIfGHBlocked(selectedGH, blockedMap)) return;
    if (isDemoMode) {
      markSubmitted(selectedGH);
      setSubmittedToday(getSubmittedToday());
      setStep(4);
      return;
    }

    setSyncing(true);
    setSubmitError(null);
    const payload = buildPayload();

    // ══ OFFLINE ══
    if (!isOnline) {
      try {
        await idbAdd(DB_NAME, { gh: selectedGH, tanggal: todayISO, createdAt: Date.now(), payload });
        await refreshPendingCount();
        markSubmitted(selectedGH);
        clearDraft(); setSubmittedToday(getSubmittedToday());
        setSavedOffline(true);
        setStep(4);
      } catch {
        setSubmitError("Data belum tersimpan di perangkat. Tekan Simpan offline sekali lagi.");
      } finally {
        setSyncing(false);
      }
      return;
    }

    // ══ ONLINE ══
    setSavedOffline(false);
    try {
      const params = new URLSearchParams(payload).toString();
      const result = await gasFetch(`${SCRIPT_URL}?${params}`);
      if (result?.status === "ok" || result?.success) {
        markSubmitted(selectedGH);
        clearDraft(); setSubmittedToday(getSubmittedToday());
        setStep(4);
      } else {
        throw new Error(result?.message || "Gagal menyimpan");
      }
    } catch (e) {
      // Gagal jaringan (TypeError) → simpan ke antrean offline agar data tidak hilang.
      if (e instanceof TypeError) {
        try {
          await idbAdd(DB_NAME, { gh: selectedGH, tanggal: todayISO, createdAt: Date.now(), payload });
          await refreshPendingCount();
          markSubmitted(selectedGH);
          clearDraft(); setSubmittedToday(getSubmittedToday());
          setSavedOffline(true);
          setStep(4);
          return;
        } catch { /* gagal simpan lokal → tampilkan error di bawah */ }
      }
      setSubmitError(`Data belum terkirim (${e.message || "koneksi terputus"}). Cek sinyal lalu tekan Kirim lagi.`);
    } finally {
      setSyncing(false);
    }
  };

  // ── Ringkasan isian (rekap & sukses) ──
  const hamaTerisi = HAMA_LIST.filter(h => isFilled(hptData.hama[h.key]));
  const penyakitRows = [
    ...PENYAKIT_SKOR.map(p => {
      const pd = hptData.penyakit[p.key] || {};
      return {
        key: p.key,
        nama: `${p.label} · ${p.fullLabel}`,
        insidensi: pd.insidensi || "0",
        skor: SKOR_KEYS.map(sk => pd[sk] || "0").join(" · "),
      };
    }),
    ...PENYAKIT_SIMPLE.map(p => ({
      key: p.key,
      nama: `${p.label} · ${p.fullLabel}`,
      insidensi: hptData.penyakit[p.key]?.jumlah || "0",
      skor: "-",
    })),
  ];

  // ── Header ──
  const title = step === 2 || step === 3 ? `HPT · ${ghLabel}` : "HPT";
  const ghMeta = [ghInfo?.periode && `P${ghInfo.periode}`, hst !== null && `${hst} ${umurLabel}`].filter(Boolean).join(" · ");
  const subtitle = step === 1
    ? `${formatTanggal()} · Langkah 1 dari 3`
    : step === 4
      ? formatTanggal()
      : `${ghMeta ? `${ghMeta} · ` : ""}Langkah ${step} dari 3`;
  const onBack = step === 2 ? () => setStep(1) : step === 3 ? () => { setStep(2); setSubmitError(null); } : undefined;

  // ── Footer ──
  let footer = null;
  if (step === 2) {
    footer = (
      <button type="button" className="fh-btn fh-btn-primary" onClick={() => setStep(3)}>
        Lihat rekap
      </button>
    );
  } else if (step === 3) {
    const sendLabel = syncing ? "Mengirim…"
      : loadingRef ? "Memuat data GH…"
      : isDemoMode ? "Kirim demo"
      : !isOnline ? "Simpan offline"
      : "Kirim HPT";
    footer = (
      <div className="fh-btn-row">
        <button type="button" className="fh-btn fh-btn-secondary" onClick={() => { setStep(2); setSubmitError(null); }}>Kembali</button>
        <button type="button" className="fh-btn fh-btn-primary" disabled={!canSubmit} onClick={handleSubmit}>{sendLabel}</button>
      </div>
    );
  } else if (step === 4) {
    footer = <button type="button" className="fh-btn fh-btn-secondary" onClick={resetForm}>Isi GH lain</button>;
  }

  return (
    <FormShell title={title} subtitle={subtitle} steps={step < 4 ? 3 : 0} step={step} onBack={onBack} footer={footer}>

      {/* ── Status koneksi & antrean ── */}
      {step < 4 && !isOnline && (
        <FieldAlert tone="info">Mode offline. Data disimpan di perangkat dan terkirim otomatis saat online.</FieldAlert>
      )}
      {step < 4 && pendingCount > 0 && (
        <FieldAlert
          tone="warning"
          action={isOnline && !isSyncingPending ? { label: "Kirim sekarang", onClick: syncPendingData } : undefined}
        >
          {isSyncingPending ? "Mengirim data tertunda…" : `${pendingCount} GH tersimpan offline, belum terkirim.`}
        </FieldAlert>
      )}
      {step < 4 && isDemoMode && (
        <FieldAlert tone="warning">Mode demo. Data tidak dikirim ke sheet.</FieldAlert>
      )}

      {/* ══ STEP 1 — Pilih GH ══ */}
      {step === 1 && (
        <>
          <SegmentTabs
            label="Jenis GH"
            value={activeTab}
            onChange={(key) => { setActiveTab(key); setSelectedGH(""); }}
            tabs={[
              { key: "produksi", label: "GH produksi" },
              { key: "semai", label: "Semai" },
            ]}
          />

          {activeTab === "produksi" && (
            <GHPicker
              loading={loadingGH}
              selected={selectedGH}
              onSelect={handleSelectGH}
              emptyText="Tidak ada GH produksi aktif."
              items={ghAktif.flatMap(([gh, info]) => {
                const tipe = TIPE_GH.find(t => t.pattern(gh));
                if (!tipe) return [];
                const h = info.tanam ? hitungHST(info.tanam) : null;
                const done = submittedToday.includes(gh);
                const blockedInfo = blockedMap[gh.trim().toUpperCase()];
                const badges = [];
                if (blockedInfo) badges.push({ label: blockedInfo.aksi, tone: "danger" });
                if (done) badges.push({ label: "Sudah diisi", tone: "success" });
                if (h !== null) badges.push({ label: `${h} HST`, tone: hstTone(h) });
                return [{
                  gh,
                  meta: `${tipe.label}${info.periode ? ` · P${info.periode}` : ""}`,
                  badges,
                  done,
                  sortValue: h,
                }];
              })}
            />
          )}

          {activeTab === "semai" && (
            <GHPicker
              loading={loadingSemai}
              selected={selectedGH}
              onSelect={handleSelectGH}
              emptyText="Tidak ada data semai aktif."
              items={semaiAktif.map(([nama, info]) => {
                const done = submittedToday.includes(nama);
                const hss = info.tanam ? hitungHST(info.tanam) : null;
                const badges = [];
                if (done) badges.push({ label: "Sudah diisi", tone: "success" });
                if (hss !== null) badges.push({ label: `${hss} HSS`, tone: "neutral" });
                return {
                  gh: nama,
                  label: info.nama || nama,
                  meta: [info.ghTujuan && `Bibit ${info.ghTujuan}`, info.periode && `P${info.periode}`, info.hssRef && `Ref ${info.hssRef} HSS`].filter(Boolean).join(" · "),
                  badges,
                  done,
                  sortValue: hss,
                };
              })}
            />
          )}
        </>
      )}

      {/* ══ STEP 2 — Input HPT ══ */}
      {step === 2 && (
        <>
          <section className="fh-section">
            <div className="fh-section-head">
              <span className="fh-label">Populasi hama</span>
              <span className="fh-meta">{hamaTerisi.length}/{HAMA_LIST.length} ada temuan</span>
            </div>
            <div className="fh-grid-2">
              {HAMA_LIST.map(h => {
                const val = hptData.hama[h.key];
                return (
                  <div key={h.key} className={`fh-card fh-field-card${isFilled(val) ? " is-filled" : ""}`}>
                    <div>
                      <div className="fh-field-title">{h.label}</div>
                      <div className="fh-field-unit">{h.unit}</div>
                    </div>
                    <Stepper label={h.label} value={val} onChange={v => handleHama(h.key, v)} />
                  </div>
                );
              })}
            </div>
          </section>

          <section className="fh-section">
            <span className="fh-label">Penyakit · insidensi dan skor</span>
            {PENYAKIT_SKOR.map(p => {
              const pd = hptData.penyakit[p.key];
              const active = pd && Object.values(pd).some(isFilled);
              return (
                <div key={p.key} className={`fh-card fh-field-card${active ? " is-filled" : ""}`} style={{ gap: 12 }}>
                  <div className="fh-field-title">
                    {p.label} <span className="fh-field-unit" style={{ fontWeight: 400 }}>· {p.fullLabel}</span>
                  </div>
                  <label className="fh-section" style={{ gap: 4 }}>
                    <span className="fh-hint">Insidensi (jumlah tanaman terserang)</span>
                    <input
                      className="fh-input is-number"
                      type="text"
                      inputMode="decimal"
                      value={pd?.insidensi || ""}
                      placeholder="0"
                      onChange={e => handlePenyakitField(p.key, "insidensi", e.target.value)}
                    />
                  </label>
                  <div>
                    <span className="fh-hint" style={{ display: "block", marginBottom: 4 }}>Jumlah tanaman per skor</span>
                    <div className="fh-grid-4">
                      {SKOR_KEYS.map((sk, i) => (
                        <label key={sk}>
                          <span className="fh-mini-label">Skor {i + 1}</span>
                          <input
                            className="fh-input is-number"
                            style={{ textAlign: "center", padding: "0 4px" }}
                            type="text"
                            inputMode="decimal"
                            value={pd?.[sk] || ""}
                            placeholder="0"
                            onChange={e => handlePenyakitField(p.key, sk, e.target.value)}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}

            {PENYAKIT_SIMPLE.map(p => {
              const pd = hptData.penyakit[p.key];
              return (
                <div key={p.key} className={`fh-card fh-field-card${isFilled(pd?.jumlah) ? " is-filled" : ""}`}>
                  <div className="fh-field-title">
                    {p.label} <span className="fh-field-unit" style={{ fontWeight: 400 }}>· {p.fullLabel}</span>
                  </div>
                  <label className="fh-section" style={{ gap: 4 }}>
                    <span className="fh-hint">Jumlah tanaman terserang</span>
                    <input
                      className="fh-input is-number"
                      type="text"
                      inputMode="decimal"
                      value={pd?.jumlah || ""}
                      placeholder="0"
                      onChange={e => handlePenyakitField(p.key, "jumlah", e.target.value)}
                    />
                  </label>
                </div>
              );
            })}
          </section>

          <label className="fh-section">
            <div className="fh-section-head">
              <span className="fh-label">Keterangan</span>
              <span className="fh-meta">opsional</span>
            </div>
            <textarea
              className="fh-textarea"
              rows={3}
              value={hptData.keterangan}
              onChange={e => setHptData(d => ({ ...d, keterangan: e.target.value }))}
              placeholder="Catatan tambahan"
            />
          </label>
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
              ["GH", ghLabel],
              ["Jenis", activeTab === "semai" ? "Semai" : "Produksi"],
              ["Periode", ghInfo?.periode || "-"],
              [umurLabel, hst ?? "-"],
              ...(hptData.keterangan.trim() ? [["Keterangan", hptData.keterangan.trim()]] : []),
            ]}
          />

          <ReviewTable
            title="Hama"
            info={hamaTerisi.length > 0
              ? hamaTerisi.map(h => [h.label, `${hptData.hama[h.key]} ${h.unit}`])
              : [["Temuan hama", "Tidak ada"]]}
          />

          <ReviewTable
            title="Penyakit"
            columns={[
              { key: "nama", label: "Penyakit" },
              { key: "insidensi", label: "Insid.", num: true },
              { key: "skor", label: "S1 · S2 · S3 · S4", num: true },
            ]}
            rows={penyakitRows}
          />

          {submitError && <FieldAlert tone="danger">{submitError}</FieldAlert>}
        </>
      )}

      {/* ══ STEP 4 — Sukses ══ */}
      {step === 4 && (
        <SuccessState
          offline={savedOffline}
          title={isDemoMode ? "Demo selesai" : savedOffline ? "Tersimpan di perangkat" : `HPT ${ghLabel} terkirim`}
          description={isDemoMode
            ? "Data tidak dikirim (mode demo)."
            : savedOffline
              ? `Terkirim otomatis ke sheet saat online.${pendingCount > 0 ? ` ${pendingCount} GH menunggu.` : ""}`
              : "Data masuk ke sheet."}
          summary={[
            ["GH", ghLabel],
            [umurLabel, hst ?? "-"],
            ["Hama", hamaTerisi.length > 0 ? hamaTerisi.map(h => `${h.label} ${hptData.hama[h.key]}`).join(", ") : "Tidak ada"],
            ["Operator", operator],
          ]}
        />
      )}

      <Dialog
        open={showWarning}
        title="GH sudah diisi hari ini"
        onClose={() => { setShowWarning(false); setPendingGH(""); }}
        actions={
          <div className="fh-btn-row">
            <button type="button" className="fh-btn fh-btn-secondary" onClick={() => { setShowWarning(false); setPendingGH(""); }}>Batal</button>
            <button type="button" className="fh-btn fh-btn-primary" onClick={() => doSelectGH(pendingGH)}>Isi ulang</button>
          </div>
        }
      >
        {pendingGH} sudah dikirim hari ini. Isi ulang akan menambah baris baru di sheet, data lama tidak terhapus.
      </Dialog>
    </FormShell>
  );
}
