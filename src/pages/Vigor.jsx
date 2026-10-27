import { useState, useEffect, useCallback, useRef } from "react";
import { useDraft } from "../hooks/useDraft";
import { useAuth } from "../hooks/useAuth";
import { idbAdd, idbGetAll, idbDelete, idbCount, gasPost } from "../utils/idb";
import { useGHData } from "../hooks/useGHData";
import { useGHBlockedList, warnIfGHBlocked } from "../hooks/useGHBlockedList";
import { FormShell, FieldAlert, SuccessState, GHPicker, ReviewTable, OptionList, SegmentTabs, PhotoBox, Dialog } from "../components/form";
import { formatTanggal } from "../lib/format";
import { HST_CHECKPOINTS, HST_NEAR_RANGE, TIPE_GH } from "../lib/vigorDue";

const DB_NAME    = "VigorOfflineDB";
const SCRIPT_URL = import.meta.env.VITE_GAS_VIGOR_URL;

// ─── Changelog ───────────────────────────────────────────────────────────────
export const CHANGELOG = [
  "Tampilan baru Farmhill: GH per lokasi, tab per varian, tiap variabel satu kartu pilihan, langkah rekap sebelum kirim",
  "Tambah kolom Keterangan (opsional) di bawah Foto Selfie — satu catatan untuk seluruh checkpoint, masuk ke kolom Keterangan di sheet (sama di semua baris varian)",
  "Tambah checkpoint HST 11 — Vigor Semai (Akar, Batang, Daun, Warna Daun, skor 1–4, 3 sampel random per varian); data masuk ke sheet terpisah",
  "Tipe GH RnD dihapus dari Pilih GH — Tohudan 22, Sawahan Tunnel 1 & Open Field 1 kini kembali masuk tipe Kolam",
  "Tambah Netting Buah (Crack Basah) di checkpoint HST 45",
  "Kesegaran Tanaman (Kelayuan) di HST 38/45/54 kini satu section dengan Warna Daun (sebelumnya section terpisah)",
  "Tambah Kesegaran Tanaman (Kelayuan) di checkpoint HST 7, 14, 18, 33 (sebelumnya hanya HST 38/45/54)",
  "GH RnD: tambah Open Field 1 ke daftar GH RnD",
  "HST aktif sekarang mulai dari HST 1 (sebelumnya HST 5)",
  "GH RnD (Tohudan 22 & Sawahan Tunnel) kini tampil sebagai tipe tersendiri di Pilih GH — tidak lagi bergabung di Kolam",
  "Revisi label Warna Akar: sekarang lebih deskriptif (Mati/Busuk & Sehat)",
  "Revisi opsi Netting Buah HST 45: persentase diperbarui sesuai standar baru",
  "Panduan sampling: teks disesuaikan per tipe GH (Kolam & Dutch Bucket)",
  "Keterangan lebar daun: kini dinamis sesuai HST (daun ke-4, ke-7, ke-11)",
  "Tambah seksi Pendataan Buah Net/Bercak Hitam pada HST 54",
];

const HST_MIN = 1;
const HST_MAX = 60;

function getCheckpointStatus(hst) {
  if (hst === null) return null;
  for (const cp of HST_CHECKPOINTS) {
    if (hst >= cp && hst <= cp + 3) return { type: "due",  cp, label: `Waktunya input Vigor HST ${cp}.` };
  }
  for (const cp of HST_CHECKPOINTS) {
    if (hst >= cp - HST_NEAR_RANGE && hst < cp) return { type: "soon", cp, label: `${cp - hst} hari lagi menuju checkpoint HST ${cp}.` };
  }
  return null;
}

function hstTerdekat(hst) {
  return HST_CHECKPOINTS.reduce((prev, curr) =>
    Math.abs(curr - hst) < Math.abs(prev - hst) ? curr : prev
  );
}

const RND_GH_LIST = ["TOHUDAN 22", "SAWAHAN TUNNEL 1", "OPEN FIELD 1"];
const LEBAR_DAUN_RND_OPTIONS = ["Buruk", "Sedang", "Baik"];

function isRndGH(gh) {
  if (!gh) return false;
  return RND_GH_LIST.some(r => gh.toUpperCase().trim() === r);
}

// ─── Opsi form ────────────────────────────────────────────────────────────────
const LEBAR_DAUN_7_OPTIONS  = ["<7", "7–9,9", "10–12"];
const LEBAR_DAUN_14_OPTIONS = ["< 13 cm", "13.0 - 14.9 cm", "15.0 - 17.0 cm"];
const LEBAR_DAUN_18_OPTIONS = ["< 16 cm", "16.0 - 17.9 cm", "18 - 20 cm"];
const LEBAR_DAUN_33_OPTIONS = [
  "Lebar daun atas dan daun bawah kecil",
  "Lebar daun atas lebih kecil dengan daun tengah",
  "Lebar daun atas sama dengan daun tengah",
];
const DIAMETER_7_14_OPTIONS = [
  "Tanaman Kutilang (Diameter batang kecil, antar ruas panjang)",
  "Batang kecil, antar ruas pendek",
  "Batang besar, antar ruas panjang",
  "Batang besar, ruas pendek",
];
const DIAMETER_33_OPTIONS = ["Diameter batang kecil", "Diameter batang besar"];
const WARNA_DAUN_OPTIONS = [
  "> 8 tanaman menguning",
  "5–8 tanaman menguning",
  "1–4 tanaman menguning",
  "Tidak ada menguning",
];
const WARNA_AKAR_OPTIONS  = ["Akar Coklat (Mati/Busuk)", "Akar Putih Bersih / Akar Coklat Sehat"];
const VOLUME_AKAR_OPTIONS = ["Tidak Ada Akar", "Volume Akar Sedikit", "Volume Akar Banyak"];
const SIMETRI_BUAH_OPTIONS = [
  "Buah asimetris/peyang > 40 tanaman",
  "Buah asimetris/peyang 31 - 40 tanaman",
  "Buah asimetris/peyang 21 - 30 tanaman",
  "Buah asimetris/peyang < 20 tanaman",
];
const BUAH_BAJANG_OPTIONS = [
  "Bunga bajang/menguning sebelum mekar banyak (> 2 tunas/cabang)",
  "Bunga bajang/menguning sebelum mekar sedikit (+- 2 tunas/cabang)",
  "Tidak ada bunga bajang/menguning",
];
const CABANG_BUAH_OPTIONS = [
  "Buah jadi pada cabang > 13",
  "Buah jadi pada cabang 12 - 13",
  "Buah jadi pada cabang 9 - 11",
];
const PANJANG_TUNAS_AIR_OPTIONS = ["1 Ruas", "2 Ruas", "3 Ruas", "4 Ruas"];
const KESEGARAN_OPTIONS = ["Layu", "Lemas", "Segar"];
const NETTING_BUAH_45_OPTIONS = [
  "Varian MD, EL, SS <10% tanaman mulai netting ; SG, GR, dll <80% netting",
  "Varian MD, EL, SS 10% tanaman sudah mulai netting ; SG, GR, dll 80% - 100% netting",
];
const NETTING_BUAH_54_OPTIONS = [
  "Varian bernet crack terbuka (crack basah) > 40 tanaman",
  "Varian bernet crack terbuka (crack basah) 20 - 40 tanaman",
  "Varian bernet crack terbuka (crack basah) < 20 tanaman",
];
const NETTING_50_54_OPTIONS = [
  "Varian MD, EL, SS < 80% tanaman sudah mencapai netting 50%",
  "Varian MD, EL, SS 80% atau 150 tanaman sudah mencapai netting 50%",
];
const NET_BERCAK_HITAM_54_OPTIONS = [
  "Varian Greeniegal dan/atau Daegoji terdapat net/bercak hitam >10% per buah",
  "Varian Greeniegal dan/atau Daegoji terdapat net/bercak hitam 5-10% per buah",
  "Tidak ada net/bercak hitam pada Greeniegal dan/atau Daegoji",
];

// ─── Vigor Semai (HST 11) — skor 1–4 per variabel, bobot masing-masing 25% ───
const SEMAI_VARIABEL = [
  { key: "semaiAkar", label: "Akar", options: [
    { skor: 4, desc: "Akar serabut lebar dan merata, terikat penuh (>90%), warna putih, pertumbuhan >95% rata" },
    { skor: 3, desc: "Akar serabut cukup, terikat sebagian (70-89%), warnah putih, pertumbuhan 85-95% rata" },
    { skor: 2, desc: "Akar serabut sedikit mengikat (50-69%), warna putih sedikit coklat, pertumbuhan 70-84,9% rata" },
    { skor: 1, desc: "Akar serabut < 50%, warna putih sedikit coklat, pertumbuhan tidak rata <70%" },
  ]},
  { key: "semaiBatang", label: "Batang", options: [
    { skor: 4, desc: "Diameter batang besar, batang tegak" },
    { skor: 3, desc: "Diameter batang besar, batang sedikit memanjang" },
    { skor: 2, desc: "Diameter batang sedikit kurus memanjang, etiolasi ringan" },
    { skor: 1, desc: "Kurus, etiolasi" },
  ]},
  { key: "semaiDaun", label: "Daun", options: [
    { skor: 4, desc: "Jumlah daun 3, daun lebar" },
    { skor: 3, desc: "Jumlah daun 3, daun sedang" },
    { skor: 2, desc: "Jumlah daun 2, daun sedang" },
    { skor: 1, desc: "Jumlah daun 1-2, daun kecil dan beberapa mengkerut" },
  ]},
  { key: "semaiWarnaDaun", label: "Warna Daun", options: [
    { skor: 4, desc: "Warna daun hijau pekat, tidak ada ciri-ciri defisiensi (>95% rata hijau)" },
    { skor: 3, desc: "Warna daun hijau tidak pekat, tidak ada ciri-ciri defisiensi (85-95% rata hijau)" },
    { skor: 2, desc: "Warna daun pucat dan hijau muda (70-84,9% hijau)" },
    { skor: 1, desc: "Warna daun kekuningan (<70% hijau), menunjukkan gejala klorosis" },
  ]},
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function hitungHST(tgl) {
  const [y, m, d] = tgl.split("-").map(Number);
  const tanam = new Date(y, m - 1, d);
  const now   = new Date();
  return Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - tanam) / 86400000);
}


function initVarianData(varianList) {
  const obj = {};
  varianList.forEach(v => {
    obj[v] = {
      lebarDaun: "", diameterBatang: "", warnaDaun: "", warnaAkar: "", volumeAkar: "",
      simetriBuah: "", cabangBuah: "", buahBajang: "", panjangTunasAir: "",
      kesegaran: "", nettingBuah: "", netting50: "", netBercakHitam: "",
      semaiAkar: "", semaiBatang: "", semaiDaun: "", semaiWarnaDaun: "",
    };
  });
  return obj;
}

function isVarianFilled(d, showKualitas, showPolinasi, showKesegaran, showNetting, showNetting50, showNetBercakHitam, showLebarDiameter, showSimetri, showSemai) {
  if (showSemai) return SEMAI_VARIABEL.every(v => d[v.key] !== "" && d[v.key] != null);
  if (showLebarDiameter && (d.lebarDaun === "" || d.diameterBatang === "")) return false;
  if (d.warnaDaun === "" || d.warnaAkar === "" || d.volumeAkar === "") return false;
  if (showKualitas && showSimetri && d.simetriBuah === "") return false;
  if (showKualitas && showSimetri && d.cabangBuah === "") return false;
  if (showPolinasi  && (d.buahBajang === "" || d.panjangTunasAir === "")) return false;
  if (showKesegaran && d.kesegaran === "") return false;
  if (showNetting   && d.nettingBuah === "") return false;
  if (showNetting50 && d.netting50 === "") return false;
  if (showNetBercakHitam && d.netBercakHitam === "") return false;
  return true;
}

// ─── localStorage helpers — pakai fungsi supaya tanggal selalu fresh ─────────
const LS_PREFIX = "vigor_submitted_";

// PENTING: pakai tanggal lokal, bukan toISOString() (itu UTC) — kalau pakai UTC,
// di WIB (UTC+7) cache baru "ganti hari" jam 7 pagi, bukan jam 12 malam lokal.
function getLSKey() {
  const d = new Date();
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${LS_PREFIX}${y}-${m}-${day}`;
}
function cleanOldKeys() {
  try {
    const cur = getLSKey();
    Object.keys(localStorage).filter(k => k.startsWith(LS_PREFIX) && k !== cur).forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
}
function getSubmittedToday() {
  try { return JSON.parse(localStorage.getItem(getLSKey()) || "[]"); } catch { return []; }
}
function markSubmitted(gh) {
  const list = getSubmittedToday();
  if (!list.includes(gh)) localStorage.setItem(getLSKey(), JSON.stringify([...list, gh]));
}

// ─── Main Component ───────────────────────────────────────────────────────────
// initialGH/onDone — opsional, dipakai oleh Home Koor GH untuk auto-pilih GH
// dari jadwal harian. Tidak mempengaruhi cara form ini dipakai biasa (tanpa props).
export default function Vigor({ initialGH, onDone } = {}) {
  const { user } = useAuth();
  const { getDraft, saveDraft, clearDraft } = useDraft("vigor");
  const _draft = getDraft();

  const [step, setStep]         = useState(_draft?.step === 2 || _draft?.step === 3 ? _draft.step : 1);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Tanggal selalu fresh saat komponen mount
  const [todayISO]   = useState(() => new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" }));

  const { ghData, loading: loadingGH, isDemoMode } = useGHData();
  const { blockedMap } = useGHBlockedList();

  const [selectedGH, setSelectedGH]     = useState(_draft?.selectedGH   || "");
  const [selectedHST, setSelectedHST]   = useState(_draft?.selectedHST  || null);
  const [selectedTipe, setSelectedTipe] = useState(_draft?.selectedTipe || "");
  const [varianData, setVarianData]     = useState(_draft?.varianData   || {});
  // Operator otomatis dari akun login; bisa diubah di langkah rekap
  const [operator, setOperator]         = useState(_draft?.operator || user?.nama || "");
  const [keterangan, setKeterangan]     = useState(_draft?.keterangan   || "");
  const [activeVarian, setActiveVarian] = useState(null);

  const [submitting, setSubmitting]     = useState(false);
  const [submitError, setSubmitError]   = useState(null);
  const [savedOffline, setSavedOffline] = useState(false);

  const [selfieFile, setSelfieFile]       = useState(null);
  const [selfiePreview, setSelfiePreview] = useState(null);
  const [selfieUrl, setSelfieUrl]         = useState("");

  const [submittedToday, setSubmittedToday] = useState(() => {
    cleanOldKeys();
    return getSubmittedToday();
  });
  const [showWarning, setShowWarning] = useState(false);
  const [pendingGH, setPendingGH]     = useState("");
  const [pendingCount, setPendingCount]         = useState(0);
  const [isSyncingPending, setIsSyncingPending] = useState(false);

  // useAuth membaca sessionStorage setelah render pertama → isi operator begitu nama tersedia
  useEffect(() => {
    if (user?.nama) setOperator(prev => prev || user.nama);
  }, [user?.nama]);

  useEffect(() => {
    if (step === 4) return;
    saveDraft({ step, selectedGH, selectedHST, selectedTipe, varianData, operator, keterangan });
  }, [step, selectedGH, selectedHST, selectedTipe, varianData, operator, keterangan]);

  const refreshPendingCount = useCallback(async () => {
    try { setPendingCount(await idbCount(DB_NAME)); } catch { setPendingCount(0); }
  }, []);

  useEffect(() => { refreshPendingCount(); }, [refreshPendingCount]);

  useEffect(() => {
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // ── Sync offline pending — kirim batch per record ──────────────────────────
  const syncPending = useCallback(async () => {
    const all = await idbGetAll(DB_NAME);
    if (!all.length) return;
    setIsSyncingPending(true);
    for (const record of all) {
      try {
        const json = await gasPost(SCRIPT_URL, {
          action: record.payloads?.[0]?.action === "submitVigorSemai" ? "submitVigorSemaiBatch" : "submitVigorBatch",
          rows: record.payloads,
        });
        if (json.success) {
          markSubmitted(record.gh);
          setSubmittedToday(getSubmittedToday());
          await idbDelete(DB_NAME, record.id);
        }
      } catch { /* retry nanti */ }
    }
    await refreshPendingCount();
    setIsSyncingPending(false);
  }, [refreshPendingCount]);

  // ── Auto-sync saat kembali online ──
  useEffect(() => { if (isOnline) syncPending(); }, [isOnline]);

  const ghAktif = Object.entries(ghData).filter(([, info]) => {
    if (!info.tanam) return true;
    const hst = hitungHST(info.tanam);
    return hst >= HST_MIN && hst <= HST_MAX;
  });

  const handleSelectGH = (gh) => {
    if (warnIfGHBlocked(gh, blockedMap)) return;
    if (submittedToday.includes(gh)) { setPendingGH(gh); setShowWarning(true); }
    else { doSelectGH(gh); setStep(2); }
  };

  const doSelectGH = (gh) => {
    const info = ghData[gh];
    const hst  = info?.tanam ? hitungHST(info.tanam) : null;
    setSelectedGH(gh);
    setSelectedHST(hst !== null ? hstTerdekat(hst) : HST_CHECKPOINTS[0]);
    setVarianData(initVarianData(info?.varian || []));
    setActiveVarian(null);
    setShowWarning(false);
    setPendingGH("");
  };

  // ── Auto-pilih GH dari jadwal harian (Home Koor GH) — tidak mengubah alur normal ──
  // Override draft lama (kalau ada) sekali saat form ini dibuka dari jadwal.
  const initialGHAppliedRef = useRef(false);
  useEffect(() => {
    if (!initialGH || initialGHAppliedRef.current || loadingGH) return;
    const target = initialGH.trim().toUpperCase();
    const matchedGH = Object.keys(ghData).find(g => g.toUpperCase() === target);
    if (!matchedGH) return;
    initialGHAppliedRef.current = true;
    const matchedTipe = TIPE_GH.find(t => t.pattern(matchedGH));
    if (matchedTipe) setSelectedTipe(matchedTipe.key);
    doSelectGH(matchedGH);
    setStep(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialGH, loadingGH, ghData]);

  const updateVarian = (varian, field, val) => {
    setVarianData(prev => ({ ...prev, [varian]: { ...prev[varian], [field]: val } }));
  };

  const ghInfo     = ghData[selectedGH];
  const varianList = ghInfo?.varian || [];
  const hstAktual  = ghInfo?.tanam ? hitungHST(ghInfo.tanam) : null;

  const showSemai          = selectedHST === 11;
  const showLebarDiameter  = !showSemai && selectedHST !== 38 && selectedHST !== 45 && selectedHST !== 54;
  const showKualitas       = !showSemai && selectedHST !== null && selectedHST > 30;
  const showSimetri        = selectedHST === 33 || selectedHST === 38;
  const showPolinasi       = selectedHST === 18;
  // Kesegaran selalu jadi bagian dari Aspek Vigor (sejajar Warna Daun), di semua checkpoint HST yang relevan
  const showKesegaranVigor = [7, 14, 18, 33, 38, 45, 54].includes(selectedHST);
  const showKesegaran      = showKesegaranVigor;
  const showNetting        = selectedHST === 45 || selectedHST === 54;
  // Field "netting50" dipakai dobel: di HST45 untuk Netting Buah (Crack), di HST54 untuk Pencapaian Netting 50%
  const showNettingCrack45 = selectedHST === 45;
  const showNetting50      = selectedHST === 54;
  const showNetting50Field = showNettingCrack45 || showNetting50;
  const showNetBercakHitam = selectedHST === 54;

  const isRnd = isRndGH(selectedGH);
  const lebarDaunOptions = (isRnd && (selectedHST === 7 || selectedHST === 14 || selectedHST === 18))
    ? LEBAR_DAUN_RND_OPTIONS
    : selectedHST === 14 ? LEBAR_DAUN_14_OPTIONS
    : selectedHST === 18 ? LEBAR_DAUN_18_OPTIONS
    : selectedHST === 33 ? LEBAR_DAUN_33_OPTIONS
    : LEBAR_DAUN_7_OPTIONS;
  const diameterOptions = selectedHST === 33 ? DIAMETER_33_OPTIONS : DIAMETER_7_14_OPTIONS;

  const filledCount = varianList.filter(v => isVarianFilled(varianData[v] || {}, showKualitas, showPolinasi, showKesegaran, showNetting, showNetting50Field, showNetBercakHitam, showLebarDiameter, showSimetri, showSemai)).length;
  const allFilled   = varianList.length > 0 && filledCount === varianList.length;
  const canSubmit   = allFilled && operator.trim().length > 0 && !submitting;

  // ── Daftar variabel yang tampil untuk checkpoint terpilih, dikelompokkan per aspek ──
  // Mengikuti flag show* yang sama dengan isVarianFilled & buildPayloads.
  const tipeGH = TIPE_GH.find(t => t.pattern(selectedGH));
  const samplingText = tipeGH?.key === "kolam"
    ? "Sistem kolam: ambil mulai dari tanaman ke-16 dari baris depan sejumlah 7 tanaman, dan ke-16 dari baris belakang sejumlah 7 tanaman (total 14 tanaman)."
    : tipeGH?.key === "dutch"
    ? "Sistem DB: ambil mulai dari bucket/polybag ke-16 dari baris depan sejumlah 7 tanaman, dan ke-16 dari baris belakang sejumlah 7 tanaman (total 14 tanaman)."
    : "Ambil sampel setelah 10 tanaman depan dan 10 tanaman belakang, hindari tanaman yang terpengaruh variabel luar.";
  const lebarHint = selectedHST === 14 ? "Dilakukan pada daun ke-7" : selectedHST === 18 ? "Dilakukan pada daun ke-11" : "Dilakukan pada daun ke-4";

  const aspekList = showSemai
    ? [{
        key: "semai", title: "Vigor semai",
        hint: "Per varian per GH · 3 sampel random per varian · skor 1–4, bobot tiap variabel 25%.",
        items: SEMAI_VARIABEL.map(v => ({
          key: v.key, label: v.label, skor: true,
          options: v.options.map(o => ({ value: String(o.skor), label: o.desc, meta: `skor ${o.skor}` })),
        })),
      }]
    : [
        {
          key: "vigor", title: "Aspek vigor tanaman", hint: samplingText,
          items: [
            ...(showLebarDiameter ? [
              { key: "lebarDaun", label: "Lebar daun (cm)", hint: lebarHint, options: lebarDaunOptions, columns: lebarDaunOptions.length === 3 && selectedHST !== 33 ? 3 : 1 },
              { key: "diameterBatang", label: "Diameter batang", hint: "Penilaian pada ruas ke-3 hingga ke-5", options: diameterOptions },
            ] : []),
            { key: "warnaDaun", label: "Warna daun", options: WARNA_DAUN_OPTIONS },
            ...(showKesegaranVigor ? [{ key: "kesegaran", label: "Kesegaran tanaman (kelayuan)", options: KESEGARAN_OPTIONS, columns: 3 }] : []),
          ],
        },
        {
          key: "akar", title: "Aspek perakaran", hint: "Sampel 1 tanaman per varian, gali ±2 cm pada media tanam.",
          items: [
            { key: "warnaAkar", label: "Warna akar serabut", options: WARNA_AKAR_OPTIONS },
            { key: "volumeAkar", label: "Volume akar", options: VOLUME_AKAR_OPTIONS },
          ],
        },
        ...(showSimetri ? [{
          key: "buah", title: "Aspek kualitas buah", hint: "Per baris (± 198 tanaman) per varian.",
          items: [
            { key: "simetriBuah", label: "Simetri buah", options: SIMETRI_BUAH_OPTIONS },
            { key: "cabangBuah", label: "Cabang buah", options: CABANG_BUAH_OPTIONS },
          ],
        }] : []),
        ...(showPolinasi ? [{
          key: "polinasi", title: "Aspek keberhasilan polinasi",
          hint: "Ambil sampel setelah 10 tanaman depan dan 10 tanaman belakang, hindari tanaman yang terpengaruh variabel luar.",
          note: "Umur 18 HST belum selesai polinasi, jadi penilaian keberhasilan cabang polinasi belum dapat dilakukan.",
          items: [
            { key: "buahBajang", label: "Buah bajang", options: BUAH_BAJANG_OPTIONS },
            { key: "panjangTunasAir", label: "Panjang tunas air", options: PANJANG_TUNAS_AIR_OPTIONS, columns: 2 },
          ],
        }] : []),
        ...(showNetting || showNetting50Field || showNetBercakHitam ? [{
          key: "buahTambahan", title: "Kualitas buah tambahan",
          items: [
            ...(showNetting ? [{ key: "nettingBuah", label: selectedHST === 54 ? "Netting buah (crack basah)" : "Netting buah", options: selectedHST === 54 ? NETTING_BUAH_54_OPTIONS : NETTING_BUAH_45_OPTIONS }] : []),
            ...(showNetting50Field ? [{ key: "netting50", label: showNettingCrack45 ? "Netting buah (crack basah)" : "Pencapaian netting 50%", options: showNettingCrack45 ? NETTING_BUAH_54_OPTIONS : NETTING_50_54_OPTIONS }] : []),
            ...(showNetBercakHitam ? [{ key: "netBercakHitam", label: "Pendataan buah net/bercak hitam", options: NET_BERCAK_HITAM_54_OPTIONS }] : []),
          ],
        }] : []),
      ];
  const allItems   = aspekList.flatMap(a => a.items);
  const countDone  = (v) => allItems.filter(it => (varianData[v] || {})[it.key]).length;

  const buildPayloads = () => {
    const client_timestamp = new Date().toISOString();
    const submitDate = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
    return varianList.map(varian => {
      const d = varianData[varian] || {};
      if (showSemai) {
        return {
          action:          "submitVigorSemai",
          client_timestamp,
          tanggal:         submitDate,
          gh:              selectedGH,
          periode:         ghInfo?.periode || "",
          hst_aktual:      hstAktual ?? "",
          hst_checkpoint:  selectedHST ?? "",
          varian,
          operator,
          skor_akar:       d.semaiAkar      || "",
          skor_batang:     d.semaiBatang    || "",
          skor_daun:       d.semaiDaun      || "",
          skor_warna_daun: d.semaiWarnaDaun || "",
          keterangan:      keterangan.trim(),
          selfie_url:      "",
        };
      }
      return {
        action:            "submitVigor",
        client_timestamp,
        tanggal:           submitDate,
        gh:                selectedGH,
        periode:           ghInfo?.periode || "",
        hst_aktual:        hstAktual ?? "",
        hst_checkpoint:    selectedHST ?? "",
        varian,
        operator,
        lebar_daun:        d.lebarDaun       || "",
        diameter_batang:   d.diameterBatang  || "",
        warna_daun:        d.warnaDaun       || "",
        warna_akar:        d.warnaAkar       || "",
        volume_akar:       d.volumeAkar      || "",
        simetri_buah:      showKualitas       ? (d.simetriBuah    || "") : "",
        cabang_buah:       showSimetri        ? (d.cabangBuah      || "") : "",
        buah_bajang:       showPolinasi       ? (d.buahBajang      || "") : "",
        panjang_tunas_air: showPolinasi       ? (d.panjangTunasAir || "") : "",
        kesegaran:         showKesegaran      ? (d.kesegaran       || "") : "",
        netting_buah:      showNetting        ? (d.nettingBuah     || "") : "",
        netting_50:        showNetting50Field ? (d.netting50       || "") : "",
        net_bercak_hitam:  showNetBercakHitam ? (d.netBercakHitam  || "") : "",
        keterangan:        keterangan.trim(),
        selfie_url:        "",
      };
    });
  };

  const handleSubmit = async () => {
    if (warnIfGHBlocked(selectedGH, blockedMap)) return;
    setSubmitting(true);
    setSubmitError(null);
    const payloads = buildPayloads();

    // ── Demo mode ──
    if (isDemoMode) {
      await new Promise(r => setTimeout(r, 600));
      markSubmitted(selectedGH); setSubmittedToday(getSubmittedToday());
      clearDraft(); setStep(4); setSubmitting(false);
      return;
    }

    // ── Offline — simpan ke IDB ──
    if (!isOnline) {
      try {
        await idbAdd(DB_NAME, { gh: selectedGH, tanggal: todayISO, createdAt: Date.now(), payloads });
        await refreshPendingCount();
        markSubmitted(selectedGH); setSubmittedToday(getSubmittedToday());
        clearDraft(); setSavedOffline(true); setStep(4);
      } catch {
        setSubmitError("Data belum tersimpan di perangkat. Tekan Simpan offline sekali lagi.");
      } finally { setSubmitting(false); }
      return;
    }

    // ── Online ──
    setSavedOffline(false);
    try {
      // Upload selfie dulu kalau ada
      let resolvedSelfieUrl = selfieUrl;
      if (selfieFile && !selfieUrl) {
        const selfiePayload = {
          action:     "uploadFoto",
          fileName:   `${operator.trim().replace(/\s+/g, "_")}_${todayISO.replace(/\//g, "-")}.jpg`,
          mimeType:   selfieFile.type || "image/jpeg",
          base64Data: await new Promise((res) => {
            const reader = new FileReader();
            reader.onload = (ev) => res(ev.target.result.split(",")[1]);
            reader.readAsDataURL(selfieFile);
          }),
          sessionKey: "vigor_selfie_" + Date.now(),
        };
        try {
          const result = await gasPost(SCRIPT_URL, selfiePayload);
          resolvedSelfieUrl = result.url || "";
          setSelfieUrl(resolvedSelfieUrl);
        } catch { resolvedSelfieUrl = ""; }
      }

      // Kirim semua varian sekaligus dalam satu request batch
      const json = await gasPost(SCRIPT_URL, {
        action: showSemai ? "submitVigorSemaiBatch" : "submitVigorBatch",
        rows: payloads.map(p => ({ ...p, selfie_url: resolvedSelfieUrl })),
      });
      if (!json.success) throw new Error(json.error || "Gagal menyimpan");

      markSubmitted(selectedGH); setSubmittedToday(getSubmittedToday());
      clearDraft(); setStep(4);
    } catch (e) {
      setSubmitError(`Data belum terkirim (${e.message || "koneksi terputus"}). Cek sinyal lalu tekan Kirim lagi.`);
    } finally { setSubmitting(false); }
  };

  const resetForm = () => {
    clearDraft();
    setStep(1); setSelectedGH(""); setOperator(user?.nama || ""); setKeterangan(""); setVarianData({});
    setSelectedHST(null); setSelectedTipe(""); setActiveVarian(null); setSubmitting(false);
    setSubmitError(null); setSavedOffline(false);
    setSelfieFile(null); setSelfiePreview(null); setSelfieUrl("");
  };

  // ── Varian aktif (default varian pertama) ──
  const activeKey  = varianList.includes(activeVarian) ? activeVarian : (varianList[0] || "");
  const activeIdx  = varianList.indexOf(activeKey);
  const nextVarian = varianList[activeIdx + 1];
  const goToVarian = (v) => { setActiveVarian(v); window.scrollTo(0, 0); };
  const d          = varianData[activeKey] || {};
  const cs         = getCheckpointStatus(hstAktual);

  // ── Header ──
  const title = step === 2 || step === 3 ? `Vigor · ${selectedGH}` : "Vigor";
  const ghMeta = [ghInfo?.periode && `P${ghInfo.periode}`, hstAktual !== null && `${hstAktual} HST`].filter(Boolean).join(" · ");
  const subtitle = step === 1
    ? `${formatTanggal()} · Langkah 1 dari 3`
    : step === 4
      ? formatTanggal()
      : `${ghMeta ? `${ghMeta} · ` : ""}Langkah ${step} dari 3`;
  const onBack = step === 2 ? (onDone || (() => setStep(1)))
    : step === 3 ? () => { setStep(2); setSubmitError(null); }
    : step === 1 ? onDone
    : undefined;

  // ── Footer ──
  let footer = null;
  if (step === 2) {
    footer = (
      <button type="button" className="fh-btn fh-btn-primary" disabled={!allFilled} onClick={() => setStep(3)}>
        {allFilled ? "Lihat rekap" : `${varianList.length - filledCount} varian belum lengkap`}
      </button>
    );
  } else if (step === 3) {
    footer = (
      <div className="fh-btn-row">
        <button type="button" className="fh-btn fh-btn-secondary" onClick={() => { setStep(2); setSubmitError(null); }}>Kembali</button>
        <button type="button" className="fh-btn fh-btn-primary" disabled={!canSubmit} onClick={handleSubmit}>
          {submitting ? "Mengirim…" : loadingGH ? "Memuat data GH…" : isDemoMode ? "Kirim demo" : !isOnline ? "Simpan offline" : `Kirim ${varianList.length} varian`}
        </button>
      </div>
    );
  } else if (step === 4) {
    footer = onDone
      ? <button type="button" className="fh-btn fh-btn-secondary" onClick={onDone}>Kembali ke Home</button>
      : <button type="button" className="fh-btn fh-btn-secondary" onClick={resetForm}>Isi GH lain</button>;
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
          action={isOnline && !isSyncingPending ? { label: "Kirim sekarang", onClick: syncPending } : undefined}
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
          <section className="fh-section">
            <span className="fh-label">GH aktif HST {HST_MIN}–{HST_MAX}</span>
            <p className="fh-hint">Checkpoint Vigor: HST {HST_CHECKPOINTS.join(", ")}.</p>
          </section>
          <GHPicker
            loading={loadingGH}
            selected={selectedGH}
            onSelect={handleSelectGH}
            emptyText="Tidak ada GH aktif."
            items={ghAktif.flatMap(([gh, info]) => {
              const tipe = TIPE_GH.find(t => t.pattern(gh));
              if (!tipe) return [];
              const hstGH    = info.tanam ? hitungHST(info.tanam) : null;
              const sudahIsi = submittedToday.includes(gh);
              const st       = getCheckpointStatus(hstGH);
              const blockedInfo = blockedMap[gh.trim().toUpperCase()];
              const badges = [];
              if (blockedInfo) badges.push({ label: blockedInfo.aksi, tone: "danger" });
              if (sudahIsi) badges.push({ label: "Sudah diisi", tone: "success" });
              else if (st?.type === "due") badges.push({ label: `Due HST ${st.cp}`, tone: "due" });
              else if (st?.type === "soon") badges.push({ label: `HST ${st.cp} dalam ${st.cp - hstGH} hari`, tone: "warning" });
              if (hstGH !== null) badges.push({ label: `${hstGH} HST`, tone: "neutral" });
              return [{
                gh,
                meta: [tipe.label, info.periode && `P${info.periode}`, `${info.varian?.length || 0} varian`].filter(Boolean).join(" · "),
                badges,
                done: sudahIsi,
                urgent: !sudahIsi && st?.type === "due",
                sortValue: hstGH,
              }];
            })}
          />
        </>
      )}

      {/* ══ STEP 2 — Input per varian ══ */}
      {step === 2 && (
        <>
          {cs && <FieldAlert tone={cs.type === "due" ? "warning" : "info"}>{cs.label}</FieldAlert>}

          <section className="fh-section">
            <span className="fh-label">Checkpoint HST</span>
            <div className="fh-chips">
              {HST_CHECKPOINTS.map(h => (
                <button key={h} type="button" aria-pressed={selectedHST === h}
                  className={`fh-chip${selectedHST === h ? " is-active" : ""}`}
                  onClick={() => setSelectedHST(h)}>
                  HST {h}
                </button>
              ))}
            </div>
          </section>

          <section className="fh-section">
            <div className="fh-section-head">
              <span className="fh-label">Penilaian per varian</span>
              <span className="fh-meta">{filledCount}/{varianList.length} varian lengkap</span>
            </div>
            {varianList.length > 1 && (
              <SegmentTabs
                label="Varian"
                value={activeKey}
                onChange={setActiveVarian}
                tabs={varianList.map(v => ({ key: v, label: v, count: `${countDone(v)}/${allItems.length}` }))}
              />
            )}
          </section>

          {varianList.length === 0 && (
            <FieldAlert tone="warning">GH ini belum punya daftar varian di sheet REF. Hubungi Team Data.</FieldAlert>
          )}

          {activeKey && aspekList.map(aspek => (
            <section key={aspek.key} className="fh-section" style={{ gap: 12 }}>
              <div>
                <span className="fh-overline">{aspek.title}</span>
                {aspek.hint && <p className="fh-hint" style={{ marginTop: 2 }}>{aspek.hint}</p>}
              </div>
              {aspek.note && <FieldAlert tone="info">{aspek.note}</FieldAlert>}
              {aspek.items.map(it => (
                <div key={it.key} className="fh-card fh-card-body">
                  <div>
                    <span className="fh-card-title">{it.label}</span>
                    {it.hint && <p className="fh-hint">{it.hint}</p>}
                  </div>
                  <OptionList
                    name={it.label}
                    columns={it.columns || 1}
                    value={d[it.key] || ""}
                    onChange={val => updateVarian(activeKey, it.key, val)}
                    options={it.options.map(o => typeof o === "string" ? { value: o, label: o } : o)}
                  />
                </div>
              ))}
            </section>
          ))}

          {activeKey && nextVarian && (
            <button type="button" className="fh-btn fh-btn-secondary" onClick={() => goToVarian(nextVarian)}>
              Varian berikut: {nextVarian}
            </button>
          )}

          <section className="fh-section">
            <PhotoBox
              label="Selfie operator"
              hint={isOnline ? "Opsional, disimpan ke Drive" : "Opsional, upload otomatis saat online"}
              preview={selfiePreview}
              capture="user"
              onChange={(file, url) => { setSelfieFile(file); setSelfiePreview(url); setSelfieUrl(""); }}
              onClear={() => { setSelfieFile(null); setSelfiePreview(null); setSelfieUrl(""); }}
            />
          </section>

          <label className="fh-section">
            <div className="fh-section-head">
              <span className="fh-label">Keterangan</span>
              <span className="fh-meta">opsional · untuk semua varian</span>
            </div>
            <textarea className="fh-textarea" rows={2} value={keterangan} onChange={e => setKeterangan(e.target.value)} placeholder="Catatan tambahan" />
          </label>
        </>
      )}

      {/* ══ STEP 3 — Rekap ══ */}
      {step === 3 && (
        <>
          <label className="fh-section">
            <span className="fh-label">Operator</span>
            <input className={`fh-input${operator.trim() ? "" : " is-error"}`} value={operator} onChange={e => setOperator(e.target.value)} placeholder="Nama operator" />
            <p className="fh-hint">Terisi dari akun login. Ubah bila yang mengisi orang lain.</p>
          </label>

          <ReviewTable
            title="Rekap"
            info={[
              ["Tanggal", formatTanggal()],
              ["GH", selectedGH],
              ["Periode", ghInfo?.periode || "-"],
              ["HST aktual", hstAktual ?? "-"],
              ["Checkpoint", selectedHST ? `HST ${selectedHST}` : "-"],
              ["Selfie", selfiePreview ? "Ada" : "Tidak ada"],
              ...(keterangan.trim() ? [["Keterangan", keterangan.trim()]] : []),
            ]}
          />

          {varianList.map(v => (
            <ReviewTable
              key={v}
              title={v}
              info={allItems.map(it => {
                const val = (varianData[v] || {})[it.key];
                const opt = it.options.find(o => (typeof o === "string" ? o : o.value) === val);
                return [it.label, it.skor && opt ? `Skor ${val}` : (val || "-")];
              })}
            />
          ))}

          {submitError && <FieldAlert tone="danger">{submitError}</FieldAlert>}
        </>
      )}

      {/* ══ STEP 4 — Sukses ══ */}
      {step === 4 && (
        <SuccessState
          offline={savedOffline}
          title={isDemoMode ? "Demo selesai" : savedOffline ? "Tersimpan di perangkat" : `Vigor ${selectedGH} terkirim`}
          description={isDemoMode
            ? "Data tidak dikirim (mode demo)."
            : savedOffline
              ? "Terkirim otomatis ke sheet saat online."
              : `${varianList.length} varian masuk ke sheet.`}
          summary={[
            ["GH", selectedGH],
            ["HST aktual", hstAktual ?? "-"],
            ["Checkpoint", selectedHST ? `HST ${selectedHST}` : "-"],
            ["Varian", varianList.length],
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
            <button type="button" className="fh-btn fh-btn-primary" onClick={() => { doSelectGH(pendingGH); setStep(2); }}>Isi ulang</button>
          </div>
        }
      >
        {pendingGH} sudah dikirim hari ini. Isi ulang akan menambah baris baru di sheet, data lama tidak terhapus.
      </Dialog>
    </FormShell>
  );
}
