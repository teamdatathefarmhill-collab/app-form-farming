import { useState, useEffect, useCallback } from "react";
import { useDraft } from "../hooks/useDraft";
import { useAuth } from "../hooks/useAuth";
import { idbAdd, idbGetAll, idbDelete, idbCount, gasFetch, gasPost } from "../utils/idb";
import { useGHData } from "../hooks/useGHData";
import { useGHBlockedList } from "../hooks/useGHBlockedList";
import { FormShell, FieldAlert, SuccessState, OptionList, GHPicker, ReviewTable, Icon, OperatorField } from "../components/form";
import { formatTanggal, formatAngka, formatSelisih } from "../lib/format";

const DB_NAME    = "PemetaanOfflineDB";
const SCRIPT_URL = import.meta.env.VITE_GAS_PEMETAAN_URL;

const LS_SEMAI_CACHE_KEY = "farmhill_pemetaan_semairef_cache";
function saveSemaiCache(data) {
  try { localStorage.setItem(LS_SEMAI_CACHE_KEY, JSON.stringify({ data, savedAt: Date.now() })); } catch { /* ignore */ }
}
function loadSemaiCache() {
  try {
    const raw = localStorage.getItem(LS_SEMAI_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw).data;
  } catch { return null; }
}

// todayISO dikirim ke sheet (format dd/mm/yyyy) — jangan diubah
const todayISO   = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
const todayLabel = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

const fmtNum = formatAngka;

function emptyEntry() { return { varian: "", jumlah: "" }; }

// ─── Kualitas bibit per varian — dipecah 3 aspek (Akar/Batang/Daun), tiap
// aspek dinilai lewat 1 dari 4 kriteria deskriptif, masing-masing punya skor
// tetap (4/3/2/1). Total skor (3-12) lalu dipetakan jadi kategori akhir:
// 10-12 Baik, 7-9 Sedang, 3-6 Buruk (menutup semua kemungkinan total). ──
const KUALITAS_ASPEK_OPTIONS = {
  akar: [
    { skor: 4, deskripsi: "Akar serabut lebat dan merata, terikat penuh (>90%), warna putih" },
    { skor: 3, deskripsi: "Akar serabut cukup, terikat sebagian (70-89%), warna putih" },
    { skor: 2, deskripsi: "Akar serabut sedikit mengikat (50-69%), warna putih sedikit coklat" },
    { skor: 1, deskripsi: "Akar serabut < 50%, warna putih sedikit coklat" },
  ],
  batang: [
    { skor: 4, deskripsi: "Diameter batang besar, batang tegak" },
    { skor: 3, deskripsi: "Diameter batang besar, batang sedikit memanjang" },
    { skor: 2, deskripsi: "Diameter batang sedikit kurus memanjang, etiolasi ringan" },
    { skor: 1, deskripsi: "Kurus, etiolasi" },
  ],
  daun: [
    { skor: 4, deskripsi: "Warna daun hijau segar, jumlah daun 3, daun lebar" },
    { skor: 3, deskripsi: "Warna daun hijau muda, jumlah daun 3, daun sedang" },
    { skor: 2, deskripsi: "Warna daun hijau muda, daun 2, daun sedang" },
    { skor: 1, deskripsi: "Warna daun kekuningan, daun 1-2, daun kecil" },
  ],
};
const KUALITAS_ASPEK = [
  { key: "akar",   label: "Akar" },
  { key: "batang", label: "Batang" },
  { key: "daun",   label: "Daun" },
];
const KATEGORI_TONE = { Baik: "success", Sedang: "warning", Buruk: "danger" };

// ── Total skor 1 varian = jumlah skor Akar+Batang+Daun. Kategori (Baik/Sedang/
// Buruk) cuma valid kalau ketiganya sudah dinilai, jadi total di sini juga
// null kalau salah satu aspek masih kosong (biar tidak misleading). ──
function hitungTotalKualitas(k) {
  if (!k) return null;
  const vals = KUALITAS_ASPEK.map((a) => k[a.key]).filter((v) => v !== undefined && v !== "" && v !== null);
  if (vals.length < KUALITAS_ASPEK.length) return null;
  return vals.reduce((s, v) => s + Number(v), 0);
}

// ── Kategori akhir dari total skor (hanya valid & tampil kalau ketiga aspek sudah diisi) ──
function kategoriKualitas(total) {
  if (total === null) return null;
  if (total >= 10) return "Baik";
  if (total >= 7) return "Sedang";
  return "Buruk";
}

// ─── Daftar lengkap varian yang kita punya — dropdown pilih varian pakai ini,
// bukan cuma varian yang kebetulan ada di referensi semai GH tsb. ──
const ALL_VARIAN = ["Greeniegal", "Elysia", "Midori", "Aruni", "Greenie sweet", "Daegoji", "S7", "Sagami", "Emeralda", "Sunray"];

// ─── Nama varian di sheet bisa punya suffix angka batch (mis. "Greeniegal 1") ──
// Dropdown cukup tampilkan nama dasarnya; angkanya tetap dipakai apa adanya
// di value/rekap supaya tetap cocok dengan referensi semai per varian.
function varianDisplayName(nama) {
  return (nama || "").replace(/\s+\d+\s*$/, "").trim();
}

// ─── Huruf dasar baris (mis. "G1" → "G", "M2" → "M") — dipakai untuk
// menggabungkan baris sumber yang terpecah per varian, dan sebagai label kartu. ──
function barisDisplayLabel(baris) {
  return (baris || "").replace(/\d+\s*$/, "").trim();
}

// ─── Baris sumber bisa terpecah per varian (mis. "M1", "M2" untuk blok M yang
// ditanami 2 varian). Baris dengan huruf dasar sama digabung jadi satu kartu
// dengan beberapa entri varian, supaya rekap otomatis jadi "M Sunray 161, Midori 39". ──
function buildBarisRows(produksiInfo) {
  const baris = produksiInfo?.baris || [];
  const reguler = [];
  const groupIdx = {};
  baris.forEach((b) => {
    const label = barisDisplayLabel(b.baris) || b.baris;
    if (groupIdx[label] === undefined) {
      groupIdx[label] = reguler.length;
      reguler.push({ baris: label, isSulaman: false, entries: [{ varian: b.varian || "", jumlah: "" }] });
    } else {
      reguler[groupIdx[label]].entries.push({ varian: b.varian || "", jumlah: "" });
    }
  });
  return [
    ...reguler,
    { baris: "Sulaman", isSulaman: true, entries: [emptyEntry()] },
  ];
}

// ─── Cari data baris produksi (GHRef) untuk GH tujuan tertentu — case-insensitive ──
function findProduksiInfo(produksiData, ghTujuan) {
  const target = ghTujuan.trim().toUpperCase();
  const key = Object.keys(produksiData).find((k) => k.trim().toUpperCase() === target);
  return key ? produksiData[key] : null;
}

export default function PemetaanGH() {
  const { user } = useAuth();
  const { getDraft, saveDraft, clearDraft } = useDraft("pemetaan");
  const _draft = getDraft();

  const [step, setStep] = useState(_draft?.step || 1);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const { produksiData, loading: loadingGH, isDemoMode } = useGHData();
  const { blockedMap } = useGHBlockedList();

  const [semaiData, setSemaiData] = useState({});
  const [loadingSemai, setLoadingSemai] = useState(false);

  const fetchSemaiRef = useCallback(async () => {
    setLoadingSemai(true);
    try {
      const json = await gasFetch(`${SCRIPT_URL}?action=getSemaiRef`);
      if (json?.semai) { setSemaiData(json.semai); saveSemaiCache(json.semai); }
      else throw new Error("kosong");
    } catch {
      const cached = loadSemaiCache();
      if (cached) setSemaiData(cached);
    } finally {
      setLoadingSemai(false);
    }
  }, []);

  useEffect(() => { fetchSemaiRef(); }, [fetchSemaiRef]);

  const [selectedGH, setSelectedGH] = useState(_draft?.selectedGH || "");
  const [barisRows, setBarisRows]   = useState(_draft?.barisRows  || []);
  // Operator otomatis dari akun login; bisa diubah di langkah rekap
  const [operator, setOperator]     = useState(_draft?.operator || user?.nama || "");
  const [keteranganSelisih, setKeteranganSelisih] = useState(_draft?.keteranganSelisih || {});
  const [kualitasVarian, setKualitasVarian] = useState(_draft?.kualitasVarian || {});
  const [openKualitas, setOpenKualitas] = useState(null); // varian yang kartunya terbuka

  // useAuth membaca sessionStorage setelah render pertama → isi operator begitu nama tersedia
  useEffect(() => {
    if (user?.nama) setOperator((prev) => prev || user.nama);
  }, [user?.nama]);

  const [syncing, setSyncing]         = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [savedOffline, setSavedOffline] = useState(false);
  const [copyDone, setCopyDone]       = useState(false);

  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncingPending, setIsSyncingPending] = useState(false);

  useEffect(() => {
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => {
    if (step === 4) return;
    saveDraft({ step, selectedGH, barisRows, operator, keteranganSelisih, kualitasVarian });
  }, [step, selectedGH, barisRows, operator, keteranganSelisih, kualitasVarian]);

  const refreshPendingCount = useCallback(async () => {
    try { setPendingCount(await idbCount(DB_NAME)); } catch { setPendingCount(0); }
  }, []);
  useEffect(() => { refreshPendingCount(); }, [refreshPendingCount]);

  const syncPendingData = useCallback(async () => {
    const allPending = await idbGetAll(DB_NAME);
    if (allPending.length === 0) return;
    setIsSyncingPending(true);
    for (const record of allPending) {
      try {
        await gasPost(SCRIPT_URL, record.payload);
        await idbDelete(DB_NAME, record.id);
      } catch { /* coba lagi nanti */ }
    }
    await refreshPendingCount();
    setIsSyncingPending(false);
  }, [refreshPendingCount]);

  useEffect(() => { if (isOnline) syncPendingData(); }, [isOnline]);

  // ── GH aktif = ada di semai (Tanam kosong) ──
  const semaiAktif = Object.entries(semaiData).map(([gh, info]) => ({ gh, ...info }));

  const handleSelectGH = (gh) => {
    // Menu Pemetaan: GH Shutdown/Restart tetap bisa dipilih & diisi (tidak diblokir)
    setSelectedGH(gh);
    const produksiInfo = findProduksiInfo(produksiData, gh);
    setBarisRows(buildBarisRows(produksiInfo));
    setKeteranganSelisih({});
    setKualitasVarian({});
    setStep(2);
  };

  // ── Opsi dropdown: varian dari referensi semai (raw, dgn suffix batch bila ada)
  // ditambah sisa varian yang kita punya tapi belum ada di referensi semai GH ini,
  // supaya user tetap bisa pilih varian lain yang benar-benar ditanam. ──
  const semaiVarianRaw = (semaiData[selectedGH]?.varian || []).map((v) => v.nama);
  // ── Case-insensitive supaya "Greenie sweet" (daftar tetap) tidak dianggap varian
  // beda dari "Greenie Sweet" (nama asli di sheet semai). ──
  const semaiVarianBase = new Set(semaiVarianRaw.map((v) => varianDisplayName(v).toLowerCase()));
  const dropdownVarianOptions = [...semaiVarianRaw, ...ALL_VARIAN.filter((v) => !semaiVarianBase.has(v.toLowerCase()))];

  const referensiMap = {};
  (semaiData[selectedGH]?.varian || []).forEach((v) => { referensiMap[v.nama] = (referensiMap[v.nama] || 0) + v.populasi; });

  // ── Lookup nama varian referensi berdasarkan bentuk case-insensitive, supaya entri
  // realisasi yang kebetulan beda kapitalisasi (mis. draft lama) tetap match ke referensi. ──
  const referensiKeyByLower = {};
  Object.keys(referensiMap).forEach((k) => { referensiKeyByLower[k.toLowerCase()] = k; });

  // ── Realisasi per varian = jumlah semua entries di semua baris (termasuk Sulaman) ──
  const realisasiMap = {};
  barisRows.forEach((row) => {
    row.entries.forEach((e) => {
      if (!e.varian || e.jumlah === "") return;
      const key = referensiKeyByLower[e.varian.toLowerCase()] || e.varian;
      realisasiMap[key] = (realisasiMap[key] || 0) + (parseInt(e.jumlah) || 0);
    });
  });

  const varianList = Object.keys(referensiMap);
  const mismatches = varianList.filter((v) => (realisasiMap[v] || 0) !== referensiMap[v]);

  // ── Total tanaman = baris reguler saja (Sulaman tidak dihitung) ──
  const totalUtama = barisRows
    .filter((r) => !r.isSulaman)
    .reduce((s, r) => s + r.entries.reduce((s2, e) => s2 + (parseInt(e.jumlah) || 0), 0), 0);
  const totalSulaman = barisRows
    .filter((r) => r.isSulaman)
    .reduce((s, r) => s + r.entries.reduce((s2, e) => s2 + (parseInt(e.jumlah) || 0), 0), 0);

  // ── Table helpers ──
  const updateEntry = (rowIdx, entryIdx, field, val) => {
    setBarisRows((prev) => {
      const next = [...prev];
      const entries = [...next[rowIdx].entries];
      entries[entryIdx] = { ...entries[entryIdx], [field]: val };
      next[rowIdx] = { ...next[rowIdx], entries };
      return next;
    });
  };
  const addEntry = (rowIdx) => {
    setBarisRows((prev) => {
      const next = [...prev];
      next[rowIdx] = { ...next[rowIdx], entries: [...next[rowIdx].entries, emptyEntry()] };
      return next;
    });
  };
  const removeEntry = (rowIdx, entryIdx) => {
    setBarisRows((prev) => {
      const next = [...prev];
      const entries = next[rowIdx].entries.filter((_, i) => i !== entryIdx);
      next[rowIdx] = { ...next[rowIdx], entries: entries.length ? entries : [emptyEntry()] };
      return next;
    });
  };
  const addManualBaris = () => {
    setBarisRows((prev) => {
      const sulamanIdx = prev.findIndex((r) => r.isSulaman);
      const newRow = { baris: "", isSulaman: false, isManual: true, entries: [emptyEntry()] };
      const next = [...prev];
      next.splice(sulamanIdx >= 0 ? sulamanIdx : next.length, 0, newRow);
      return next;
    });
  };
  const updateBarisLabel = (rowIdx, val) => {
    setBarisRows((prev) => { const next = [...prev]; next[rowIdx] = { ...next[rowIdx], baris: val }; return next; });
  };
  const removeManualBaris = (rowIdx) => {
    setBarisRows((prev) => prev.filter((_, i) => i !== rowIdx));
  };

  // ── Validasi ──
  const regulerRows = barisRows.filter((r) => !r.isSulaman);
  const allBarisNamed = regulerRows.every((r) => r.baris.trim());
  const allRegulerFilled = regulerRows.every((r) => r.entries.every((e) => e.varian && e.jumlah !== ""));
  const keteranganOK = mismatches.every((v) => (keteranganSelisih[v] || "").trim().length > 0);
  const canProceedStep2 = allBarisNamed && allRegulerFilled && keteranganOK;
  // referensi semai harus sudah termuat — periode & selisih diambil dari situ
  const canSubmit = operator.trim().length > 0 && !syncing && !loadingSemai;

  // ── Teks untuk grup ──
  const barisLines = barisRows
    .filter((r) => !r.isSulaman && r.entries.some((e) => e.varian && e.jumlah !== ""))
    .map((r) => `${r.baris} ${r.entries.filter((e) => e.varian && e.jumlah !== "").map((e) => `${e.varian} ${e.jumlah}`).join(", ")}`);
  const sulamanRow = barisRows.find((r) => r.isSulaman);
  const sulamanLine = sulamanRow && sulamanRow.entries.some((e) => e.varian && e.jumlah !== "")
    ? `Sulaman ${sulamanRow.entries.filter((e) => e.varian && e.jumlah !== "").map((e) => `${e.varian} ${e.jumlah}`).join(", ")}`
    : null;

  // ── Breakdown total per varian = jumlah semua entries di semua baris (termasuk Sulaman),
  // dikelompokkan per nama dasar varian (tanpa suffix batch semai). ──
  const breakdownVarianMap = {};
  barisRows.forEach((row) => {
    row.entries.forEach((e) => {
      if (!e.varian || e.jumlah === "") return;
      const nama = varianDisplayName(e.varian);
      breakdownVarianMap[nama] = (breakdownVarianMap[nama] || 0) + (parseInt(e.jumlah) || 0);
    });
  });
  const breakdownVarianLines = Object.entries(breakdownVarianMap).map(([nama, jumlah]) => `${nama} ${fmtNum(jumlah)}`);

  const clipboardText = [
    `PEMETAAN GH ${selectedGH.toUpperCase()}`,
    todayLabel,
    ...barisLines,
    ...(sulamanLine ? [sulamanLine] : []),
    `Total tanaman ${fmtNum(totalUtama)}`,
    "",
    "Breakdown per Varian:",
    ...breakdownVarianLines,
  ].join("\n");

  const buildPayload = () => ({
    action: "submitPemetaan",
    tanggal: todayISO,
    gh: selectedGH,
    periode: semaiData[selectedGH]?.periode || "",
    operator: operator.trim(),
    rows: barisRows
      .filter((r) => r.entries.some((e) => e.varian && e.jumlah !== ""))
      .map((r) => {
        const validEntries = r.entries.filter((e) => e.varian && e.jumlah !== "");
        return {
          baris: r.baris,
          isSulaman: r.isSulaman,
          text: `${r.baris} ${validEntries.map((e) => `${e.varian} ${e.jumlah}`).join(", ")}`,
          entries: validEntries.map((e) => ({ varian: e.varian, jumlah: parseInt(e.jumlah) || 0 })),
        };
      }),
    kualitasBibit: varianList
      .filter((v) => hitungTotalKualitas(kualitasVarian[v]) !== null)
      .map((v) => {
        const k = kualitasVarian[v] || {};
        const total = hitungTotalKualitas(k);
        const deskripsi = (aspekKey) => (KUALITAS_ASPEK_OPTIONS[aspekKey].find((o) => o.skor === k[aspekKey]) || {}).deskripsi || "";
        return {
          varian: v,
          akarSkor: k.akar, akarDeskripsi: deskripsi("akar"),
          batangSkor: k.batang, batangDeskripsi: deskripsi("batang"),
          daunSkor: k.daun, daunDeskripsi: deskripsi("daun"),
          totalPoin: total,
          kategori: kategoriKualitas(total),
        };
      }),
    selisih: mismatches.map((v) => ({
      varian: v,
      referensi: referensiMap[v] || 0,
      realisasi: realisasiMap[v] || 0,
      selisih: (realisasiMap[v] || 0) - (referensiMap[v] || 0),
      keterangan: (keteranganSelisih[v] || "").trim(),
    })),
  });

  const handleSubmit = async () => {
    // Menu Pemetaan: submit tetap diizinkan walau GH sedang Shutdown/Restart
    setSyncing(true);
    setSubmitError(null);
    const payload = buildPayload();

    if (isDemoMode) {
      await new Promise((r) => setTimeout(r, 700));
      setStep(4);
      setSyncing(false);
      return;
    }

    if (!isOnline) {
      try {
        await idbAdd(DB_NAME, { gh: selectedGH, tanggal: todayISO, createdAt: Date.now(), payload });
        await refreshPendingCount();
        clearDraft();
        setSavedOffline(true);
        setStep(4);
      } catch {
        setSubmitError("Data belum tersimpan di perangkat. Tekan Simpan offline sekali lagi.");
      } finally {
        setSyncing(false);
      }
      return;
    }

    setSavedOffline(false);
    try {
      await gasPost(SCRIPT_URL, payload);
      clearDraft();
      setStep(4);
    } catch (e) {
      // Gagal jaringan (TypeError) → simpan ke antrean offline agar data tidak hilang.
      if (e instanceof TypeError) {
        try {
          await idbAdd(DB_NAME, { gh: selectedGH, tanggal: todayISO, createdAt: Date.now(), payload });
          await refreshPendingCount();
          clearDraft();
          setSavedOffline(true);
          setStep(4);
          return;
        } catch { /* gagal simpan lokal → tampilkan error di bawah */ }
      }
      setSubmitError("Data belum terkirim karena koneksi terputus. Cek sinyal lalu tekan Kirim lagi.");
    } finally {
      setSyncing(false);
    }
  };

  const resetForm = () => {
    clearDraft();
    setStep(1); setSelectedGH(""); setBarisRows([]); setOperator(user?.nama || "");
    setKeteranganSelisih({}); setKualitasVarian({}); setOpenKualitas(null); setSyncing(false); setSubmitError(null);
    setSavedOffline(false); setCopyDone(false);
  };

  const copyText = () => {
    navigator.clipboard.writeText(clipboardText).then(() => {
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 1400);
    }).catch(() => {});
  };

  const loadingAll = loadingGH || loadingSemai;
  const periode = semaiData[selectedGH]?.periode;

  // ── Header ──
  const title = step === 1 || step === 4 ? "Pemetaan GH" : `Pemetaan · ${selectedGH}`;
  const subtitle = step === 1
    ? `${formatTanggal()} · Langkah 1 dari 3`
    : step === 4
      ? formatTanggal()
      : `${periode ? `P${periode} · ` : ""}Langkah ${step} dari 3`;
  const onBack = step === 2 ? () => setStep(1) : step === 3 ? () => setStep(2) : undefined;

  // ── Footer ──
  let footer = null;
  if (step === 2) {
    let label = "Lihat rekap";
    if (!allBarisNamed) label = "Beri nama baris tambahan";
    else if (!allRegulerFilled) label = "Lengkapi varian dan jumlah tiap baris";
    else if (!keteranganOK) label = "Isi alasan selisih";
    footer = (
      <button type="button" className="fh-btn fh-btn-primary" disabled={!canProceedStep2} onClick={() => setStep(3)}>
        {label}
      </button>
    );
  } else if (step === 3) {
    const sendLabel = syncing ? "Mengirim…" : loadingSemai ? "Memuat data GH…" : isDemoMode ? "Kirim demo" : !isOnline ? "Simpan offline" : "Kirim pemetaan";
    footer = (
      <div className="fh-btn-row">
        <button type="button" className="fh-btn fh-btn-secondary" onClick={() => setStep(2)}>Kembali</button>
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
          {isSyncingPending ? "Mengirim data tertunda…" : `${pendingCount} pemetaan tersimpan offline, belum terkirim.`}
        </FieldAlert>
      )}
      {step < 4 && isDemoMode && (
        <FieldAlert tone="warning">Mode demo. Data tidak dikirim ke sheet.</FieldAlert>
      )}

      {/* ══ STEP 1 — Pilih GH ══ */}
      {step === 1 && (
        <>
          <section className="fh-section">
            <span className="fh-label">GH semai aktif</span>
            <p className="fh-hint">GH tujuan di Data sprout (New) yang kolom Tanam-nya masih kosong.</p>
          </section>
          <GHPicker
            loading={loadingAll}
            selected={selectedGH}
            onSelect={handleSelectGH}
            emptyText="Tidak ada GH semai aktif saat ini."
            items={semaiAktif.map((item) => {
              // Menu Pemetaan tetap membuka GH Shutdown/Restart — badge ini hanya info, bukan penghalang
              const blockedInfo = blockedMap[item.gh.trim().toUpperCase()];
              return {
                gh: item.gh,
                meta: `${item.periode ? `P${item.periode} · ` : ""}${item.varian?.length || 0} varian`,
                badges: blockedInfo ? [{ label: blockedInfo.aksi, tone: "danger" }] : [],
              };
            })}
          />
        </>
      )}

      {/* ══ STEP 2 — Input Pemetaan ══ */}
      {step === 2 && (
        <>
          <section className="fh-section">
            <div className="fh-section-head">
              <span className="fh-label">Realisasi per baris</span>
              <span className="fh-meta">{regulerRows.length} baris · total {fmtNum(totalUtama)}</span>
            </div>
            <p className="fh-hint">Satu baris boleh berisi lebih dari satu varian.</p>

            {barisRows.map((row, rowIdx) => {
              const subtotal = row.entries.reduce((s, e) => s + (parseInt(e.jumlah) || 0), 0);
              // baris tambahan manual = tanpa nama dari GHRef (draft lama tidak punya flag isManual)
              const isManual = !row.isSulaman && (row.isManual || !row.baris);
              return (
                <div key={rowIdx} className="fh-card">
                  <div className="fh-card-head">
                    <span className="fh-card-title">
                      {row.isSulaman && <>Sulaman <span className="fh-tag">di luar total</span></>}
                      {isManual && (
                        <input
                          className={`fh-input${row.baris.trim() ? "" : " is-error"}`}
                          style={{ width: 140 }}
                          value={row.baris}
                          onChange={(e) => updateBarisLabel(rowIdx, e.target.value)}
                          placeholder="Nama baris"
                          aria-label="Nama baris tambahan"
                        />
                      )}
                      {!row.isSulaman && !isManual && `Baris ${barisDisplayLabel(row.baris)}`}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button type="button" className="fh-btn fh-btn-secondary fh-btn-sm" onClick={() => addEntry(rowIdx)} aria-label={`Tambah varian di baris ${row.baris || "baru"}`}>
                        <Icon name="Plus" size={16} /> Varian
                      </button>
                      <span className="fh-num">{fmtNum(subtotal)}</span>
                      {isManual && (
                        <button type="button" className="fh-icon-btn is-danger" onClick={() => removeManualBaris(rowIdx)} aria-label="Hapus baris">
                          <Icon name="X" />
                        </button>
                      )}
                    </span>
                  </div>
                  <div className="fh-card-body">
                    {row.entries.map((entry, entryIdx) => (
                      <div key={entryIdx} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <select
                          className={`fh-select${entry.varian ? "" : " is-empty"}`}
                          style={{ flex: 1, minWidth: 0 }}
                          value={entry.varian}
                          onChange={(e) => updateEntry(rowIdx, entryIdx, "varian", e.target.value)}
                          aria-label="Varian"
                        >
                          <option value="">Pilih varian</option>
                          {dropdownVarianOptions.map((v) => <option key={v} value={v}>{varianDisplayName(v)}</option>)}
                        </select>
                        <input
                          className="fh-input is-number"
                          style={{ width: 84, flexShrink: 0 }}
                          type="text"
                          inputMode="numeric"
                          value={entry.jumlah}
                          onChange={(e) => updateEntry(rowIdx, entryIdx, "jumlah", e.target.value.replace(/\D/g, ""))}
                          placeholder="0"
                          aria-label="Jumlah tanaman"
                        />
                        <button type="button" className="fh-icon-btn is-danger" onClick={() => removeEntry(rowIdx, entryIdx)} aria-label="Hapus varian">
                          <Icon name="X" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            <button type="button" className="fh-dashed-btn" onClick={addManualBaris}>
              <Icon name="Plus" size={18} /> Baris tidak terdaftar
            </button>
          </section>

          {/* ── Referensi semai vs realisasi, alasan selisih wajib inline ── */}
          {varianList.length > 0 && (
            <section className="fh-section">
              <span className="fh-label">Referensi semai vs realisasi</span>
              <div className="fh-card" style={{ overflow: "hidden" }}>
                <table className="fh-table">
                  <thead>
                    <tr><th>Varian</th><th className="is-num">Ref.</th><th className="is-num">Real.</th><th className="is-num">Selisih</th></tr>
                  </thead>
                  <tbody>
                    {varianList.map((v) => {
                      const ref = referensiMap[v] || 0;
                      const real = realisasiMap[v] || 0;
                      const diff = real - ref;
                      const isMismatch = diff !== 0;
                      const alasan = keteranganSelisih[v] || "";
                      return [
                        <tr key={v}>
                          <td>{v}</td>
                          <td className="is-num">{fmtNum(ref)}</td>
                          <td className="is-num fh-num">{fmtNum(real)}</td>
                          <td className="is-num">
                            {isMismatch
                              ? <span className="fh-badge fh-badge-danger">{formatSelisih(diff)}</span>
                              : <span className="fh-badge fh-badge-success"><Icon name="Check" size={14} strokeWidth={2.5} />sesuai</span>}
                          </td>
                        </tr>,
                        isMismatch && (
                          <tr key={`${v}-alasan`} className="is-detail">
                            <td colSpan={4}>
                              <label className="fh-section">
                                <span className="fh-label">Alasan selisih {v} (wajib)</span>
                                <textarea
                                  className={`fh-textarea${alasan.trim() ? "" : " is-error"}`}
                                  rows={2}
                                  value={alasan}
                                  onChange={(e) => setKeteranganSelisih((prev) => ({ ...prev, [v]: e.target.value }))}
                                  placeholder={`Contoh: ${Math.abs(diff)} bibit ${v} layu saat pindah tanam`}
                                />
                              </label>
                            </td>
                          </tr>
                        ),
                      ];
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── Kualitas bibit per varian — opsional ── */}
          {varianList.length > 0 && (
            <section className="fh-section">
              <div className="fh-section-head">
                <span className="fh-label">Kualitas bibit per varian</span>
                <span className="fh-meta">opsional</span>
              </div>
              <p className="fh-hint">Nilai akar, batang, dan daun. Total skor menentukan kategori.</p>
              {varianList.map((v) => {
                const k = kualitasVarian[v] || {};
                const total = hitungTotalKualitas(k);
                const kategori = kategoriKualitas(total);
                const open = openKualitas === v;
                return (
                  <div key={v} className="fh-card">
                    <button
                      type="button"
                      className="fh-card-head"
                      style={{ width: "100%", background: "none", border: "none", borderBottom: open ? "1px solid var(--border-default)" : "none", cursor: "pointer", minHeight: 52, color: "inherit" }}
                      onClick={() => setOpenKualitas(open ? null : v)}
                      aria-expanded={open}
                    >
                      <span className="fh-card-title">{v}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {total !== null
                          ? <span className={`fh-badge fh-badge-${KATEGORI_TONE[kategori]}`}>{total}/12 · {kategori}</span>
                          : <span className="fh-meta">belum dinilai</span>}
                        <Icon name={open ? "ChevronUp" : "ChevronDown"} />
                      </span>
                    </button>
                    {open && (
                      <div className="fh-card-body" style={{ gap: 14 }}>
                        {KUALITAS_ASPEK.map((aspek) => (
                          <div key={aspek.key} className="fh-section">
                            <span className="fh-label">{aspek.label}</span>
                            <OptionList
                              name={`${aspek.label} ${v}`}
                              value={k[aspek.key]}
                              // tekan pilihan yang sama lagi untuk mengosongkan
                              onChange={(val) => setKualitasVarian((prev) => ({
                                ...prev,
                                [v]: { ...prev[v], [aspek.key]: prev[v]?.[aspek.key] === val ? "" : val },
                              }))}
                              options={KUALITAS_ASPEK_OPTIONS[aspek.key].map((o) => ({
                                value: o.skor,
                                label: o.deskripsi,
                                meta: `skor ${o.skor}`,
                              }))}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          )}
        </>
      )}

      {/* ══ STEP 3 — Rekap ══ */}
      {step === 3 && (
        <>
          <OperatorField user={user} value={operator} onChange={setOperator} minLength={1} />

          <ReviewTable
            title="Rekap"
            info={[
              ["Tanggal", formatTanggal()],
              ["GH", selectedGH],
              ["Periode", periode || "-"],
              ["Total tanaman", fmtNum(totalUtama)],
              ["Sulaman", fmtNum(totalSulaman)],
              ["Total + sulaman", fmtNum(totalUtama + totalSulaman)],
            ]}
            columns={[
              { key: "varian", label: "Varian" },
              { key: "real", label: "Real./Ref.", num: true },
              { key: "kualitas", label: "Kualitas", num: true },
            ]}
            rows={varianList.map((v) => {
              const ref = referensiMap[v] || 0, real = realisasiMap[v] || 0;
              const total = hitungTotalKualitas(kualitasVarian[v]);
              const kategori = kategoriKualitas(total);
              return {
                key: v,
                varian: v,
                real: (
                  <span className={`fh-badge fh-badge-${real === ref ? "success" : "danger"}`}>
                    {fmtNum(real)}/{fmtNum(ref)}
                  </span>
                ),
                kualitas: kategori ? `${total} · ${kategori}` : "-",
              };
            })}
          />

          {mismatches.length > 0 ? (
            <section className="fh-section">
              <span className="fh-label">Keterangan selisih ({mismatches.length} varian)</span>
              {mismatches.map((v) => (
                <div key={v} className="fh-card fh-card-body">
                  <div className="fh-section-head">
                    <span className="fh-card-title">{v}</span>
                    <span className="fh-badge fh-badge-danger">{formatSelisih((realisasiMap[v] || 0) - referensiMap[v])}</span>
                  </div>
                  <p className="fh-hint" style={{ color: "var(--ink-900)" }}>{keteranganSelisih[v]}</p>
                </div>
              ))}
            </section>
          ) : (
            <FieldAlert tone="success">Semua varian sesuai referensi semai.</FieldAlert>
          )}

          <section className="fh-section">
            <div className="fh-section-head">
              <span className="fh-label">Teks untuk grup</span>
              <button type="button" className="fh-btn fh-btn-secondary fh-btn-sm" onClick={copyText}>
                <Icon name={copyDone ? "Check" : "Copy"} size={16} /> {copyDone ? "Disalin" : "Salin"}
              </button>
            </div>
            <pre className="fh-pre">{clipboardText}</pre>
          </section>

          {submitError && <FieldAlert tone="danger">{submitError}</FieldAlert>}
        </>
      )}

      {/* ══ STEP 4 — Sukses ══ */}
      {step === 4 && (
        <SuccessState
          offline={savedOffline}
          title={isDemoMode ? "Demo selesai" : savedOffline ? "Tersimpan di perangkat" : `Pemetaan ${selectedGH} terkirim`}
          description={isDemoMode
            ? "Data tidak dikirim (mode demo)."
            : savedOffline
              ? "Terkirim otomatis ke sheet saat online."
              : "Data masuk ke sheet Data."}
          summary={[
            ["GH", selectedGH],
            ["Total tanaman", fmtNum(totalUtama)],
            ["Sulaman", fmtNum(totalSulaman)],
            ["Operator", operator],
          ]}
        />
      )}
    </FormShell>
  );
}
