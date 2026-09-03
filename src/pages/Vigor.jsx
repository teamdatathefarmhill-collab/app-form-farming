import { useState, useEffect, useCallback, useRef } from "react";
import { useDraft } from "../hooks/useDraft";
import { idbAdd, idbGetAll, idbDelete, idbCount, gasPost } from "../utils/idb";
import { useGHData } from "../hooks/useGHData";
import { useGHBlockedList, warnIfGHBlocked } from "../hooks/useGHBlockedList";
import ConfirmSubmitModal from "../components/ConfirmSubmitModal";
import FotoSelfie from "../components/FotoSelfie";
import { color } from "../styles/tokens";

const DB_NAME    = "VigorOfflineDB";
const SCRIPT_URL = import.meta.env.VITE_GAS_VIGOR_URL;

// ─── Changelog ───────────────────────────────────────────────────────────────
export const CHANGELOG = [
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
const HST_CHECKPOINTS = [7, 14, 18, 33, 38, 45, 54];
const HST_NEAR_RANGE  = 2;

const TIPE_GH = [
  {
    key: "drip", label: "Drip", icon: "💧", color: "#1E88E5",
    pattern: (gh) => {
      const upper = gh.toUpperCase();
      if (upper.startsWith("BERGAS"))   { const n = parseInt(upper.replace("BERGAS","").trim());   return n >= 1 && n <= 8 && n !== 6; }
      if (upper.startsWith("COLOMADU")) { const n = parseInt(upper.replace("COLOMADU","").trim()); return n >= 1 && n <= 4; }
      if (upper.startsWith("TOHUDAN")) { const n = parseInt(upper.replace("TOHUDAN","").trim());  return n === 12 || n === 14 || n === 15 || n === 16 || n === 17 || n === 19 || n === 20 || n === 21; }
      return false;
    },
  },
  {
    key: "kolam", label: "Kolam", icon: "🏊", color: "#00897B",
    pattern: (gh) => {
      const upper = gh.toUpperCase().trim();
      if (upper === "SAWAHAN TUNNEL 1") return true;
      if (upper.startsWith("TOHUDAN")) { const n = parseInt(upper.replace("TOHUDAN","").trim()); return (n >= 1 && n <= 11) || n === 13 || n === 22; }
      if (upper.startsWith("SAWAHAN")) { const n = parseInt(upper.replace("SAWAHAN","").trim()); return n >= 1 && n <= 4; }
      return false;
    },
  },
  {
    key: "dutch", label: "Dutch Bucket", icon: "🪣", color: "#FB8C00",
    pattern: (gh) => {
      const upper = gh.toUpperCase();
      if (upper.startsWith("TOHUDAN")) { const n = parseInt(upper.replace("TOHUDAN","").trim()); return n === 18; }
      return false;
    },
  },
  {
    key: "rnd", label: "RnD", icon: "🧪", color: "#6D4C41",
    pattern: (gh) => gh.toUpperCase().trim() === "OPEN FIELD 1",
  },
];

function getCheckpointStatus(hst) {
  if (hst === null) return null;
  for (const cp of HST_CHECKPOINTS) {
    if (hst >= cp && hst <= cp + 3) return { type: "due",  cp, label: `⚠️ Waktunya input Vigor HST ${cp}!` };
  }
  for (const cp of HST_CHECKPOINTS) {
    if (hst >= cp - HST_NEAR_RANGE && hst < cp) return { type: "soon", cp, label: `🔔 ${cp - hst} hari lagi menuju checkpoint HST ${cp}` };
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

// ─── Helpers ─────────────────────────────────────────────────────────────────
function hitungHST(tgl) {
  const [y, m, d] = tgl.split("-").map(Number);
  const tanam = new Date(y, m - 1, d);
  const now   = new Date();
  return Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - tanam) / 86400000);
}

function hstColor(hst) {
  if (hst <= 21) return { bg: color.brandBg, border: color.brand300, text: color.brand700, badge: "#c8e6c9" };
  if (hst <= 40) return { bg: "#fff8e1", border: "#ffe082", text: "#f57f17", badge: "#fff9c4" };
  return              { bg: "#fbe9e7", border: "#ffab91", text: "#bf360c", badge: "#fce4ec" };
}

function initVarianData(varianList) {
  const obj = {};
  varianList.forEach(v => {
    obj[v] = {
      lebarDaun: "", diameterBatang: "", warnaDaun: "", warnaAkar: "", volumeAkar: "",
      simetriBuah: "", cabangBuah: "", buahBajang: "", panjangTunasAir: "",
      kesegaran: "", nettingBuah: "", netting50: "", netBercakHitam: "",
    };
  });
  return obj;
}

function isVarianFilled(d, showKualitas, showPolinasi, showKesegaran, showNetting, showNetting50, showNetBercakHitam, showLebarDiameter, showSimetri) {
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

// ─── Komponen: Pilih Opsi (Radio style) ──────────────────────────────────────
function PilihOpsi({ options, value, onChange, color = color.brand700, cols = 1 }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 6 }}>
      {options.map((opt, i) => {
        const active = value === opt;
        return (
          <button key={i} onClick={() => onChange(opt)}
            style={{
              padding: "9px 10px", textAlign: "left", borderRadius: 10, cursor: "pointer",
              border: `1.5px solid ${active ? color : color.border}`,
              background: active ? `${color}12` : color.card,
              color: active ? color : "#555",
              fontSize: 12, fontWeight: active ? 700 : 400,
              transition: "all 0.15s", lineHeight: 1.4,
              display: "flex", alignItems: "flex-start", gap: 6,
            }}>
            <span style={{ flexShrink: 0, marginTop: 1 }}>{active ? "●" : "○"}</span>
            <span>{opt}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
// initialGH/onDone — opsional, dipakai oleh Home Koor GH untuk auto-pilih GH
// dari jadwal harian. Tidak mempengaruhi cara form ini dipakai biasa (tanpa props).
export default function Vigor({ initialGH, onDone } = {}) {
  const [step, setStep]         = useState(1);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Tanggal selalu fresh saat komponen mount
  const [todayISO]   = useState(() => new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" }));
  const [todayLabel] = useState(() => new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));

  const { ghData, loading: loadingGH, isDemoMode } = useGHData();
  const { blockedMap } = useGHBlockedList();

  const { getDraft, saveDraft, clearDraft } = useDraft("vigor");
  const _draft = getDraft();

  const [selectedGH, setSelectedGH]     = useState(_draft?.selectedGH   || "");
  const [selectedHST, setSelectedHST]   = useState(_draft?.selectedHST  || null);
  const [selectedTipe, setSelectedTipe] = useState(_draft?.selectedTipe || "");
  const [varianData, setVarianData]     = useState(_draft?.varianData   || {});
  const [operator, setOperator]         = useState(_draft?.operator     || "");
  const [activeVarian, setActiveVarian] = useState(null);

  const [submitting, setSubmitting]     = useState(false);
  const [confirmOpen, setConfirmOpen]   = useState(false);
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

  useEffect(() => {
    if (step === 3) return;
    saveDraft({ step, selectedGH, selectedHST, selectedTipe, varianData, operator });
  }, [step, selectedGH, selectedHST, selectedTipe, varianData, operator]);

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

  useEffect(() => { if (isOnline) syncPending(); }, [isOnline]);

  // ── Sync offline pending — kirim batch per record ──────────────────────────
  const syncPending = useCallback(async () => {
    const all = await idbGetAll(DB_NAME);
    if (!all.length) return;
    setIsSyncingPending(true);
    for (const record of all) {
      try {
        const json = await gasPost(SCRIPT_URL, { action: "submitVigorBatch", rows: record.payloads });
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

  const ghAktif = Object.entries(ghData).filter(([, info]) => {
    if (!info.tanam) return true;
    const hst = hitungHST(info.tanam);
    return hst >= HST_MIN && hst <= HST_MAX;
  });

  const handleSelectGH = (gh) => {
    if (warnIfGHBlocked(gh, blockedMap)) return;
    if (submittedToday.includes(gh)) { setPendingGH(gh); setShowWarning(true); }
    else doSelectGH(gh);
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
  const col        = hstAktual !== null ? hstColor(hstAktual) : hstColor(21);

  const showLebarDiameter  = selectedHST !== 38 && selectedHST !== 45 && selectedHST !== 54;
  const showKualitas       = selectedHST !== null && selectedHST > 30;
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

  const filledCount = varianList.filter(v => isVarianFilled(varianData[v] || {}, showKualitas, showPolinasi, showKesegaran, showNetting, showNetting50Field, showNetBercakHitam, showLebarDiameter, showSimetri)).length;
  const allFilled   = varianList.length > 0 && filledCount === varianList.length;
  const canSubmit   = allFilled && operator.trim().length > 0;

  const buildPayloads = () => {
    const client_timestamp = new Date().toISOString();
    const submitDate = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
    return varianList.map(varian => {
      const d = varianData[varian] || {};
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
      clearDraft(); setStep(3); setSubmitting(false);
      return;
    }

    // ── Offline — simpan ke IDB ──
    if (!isOnline) {
      try {
        await idbAdd(DB_NAME, { gh: selectedGH, tanggal: todayISO, createdAt: Date.now(), payloads });
        await refreshPendingCount();
        markSubmitted(selectedGH); setSubmittedToday(getSubmittedToday());
        clearDraft(); setSavedOffline(true); setStep(3);
      } catch {
        setSubmitError("Gagal menyimpan data offline. Coba lagi.");
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
        action: "submitVigorBatch",
        rows: payloads.map(p => ({ ...p, selfie_url: resolvedSelfieUrl })),
      });
      if (!json.success) throw new Error(json.error || "Gagal menyimpan");

      markSubmitted(selectedGH); setSubmittedToday(getSubmittedToday());
      clearDraft(); setStep(3);
    } catch (e) {
      setSubmitError(e.message || "Terjadi kesalahan, coba lagi.");
    } finally { setSubmitting(false); }
  };

  const resetForm = () => {
    clearDraft();
    setStep(1); setSelectedGH(""); setOperator(""); setVarianData({});
    setSelectedHST(null); setSelectedTipe(""); setActiveVarian(null); setSubmitting(false);
    setSubmitError(null); setSavedOffline(false);
    setSelfieFile(null); setSelfiePreview(null); setSelfieUrl("");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f4f7f4", fontFamily: "'Segoe UI', system-ui, sans-serif", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${color.brand900}, ${color.brand700})`, padding: "14px 16px 12px", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            {onDone && (
              <button onClick={onDone} style={{ background: "none", border: "none", padding: 0, marginBottom: 6, color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                ← Kembali ke Home
              </button>
            )}
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", letterSpacing: 2, textTransform: "uppercase" }}>Form Vigor Harian</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{todayLabel}</div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {pendingCount > 0 && (
              <button onClick={isOnline ? syncPending : undefined}
                style={{ fontSize: 10, fontWeight: 700, background: isOnline ? "rgba(33,150,243,0.25)" : "rgba(255,179,0,0.2)", border: `1px solid ${isOnline ? "rgba(33,150,243,0.5)" : "rgba(255,179,0,0.4)"}`, borderRadius: 20, padding: "3px 9px", color: isOnline ? color.infoBorder : "#FFB300", cursor: isOnline ? "pointer" : "default" }}>
                {isSyncingPending ? "⏳" : "📤"} {pendingCount} pending
              </button>
            )}
            {isDemoMode && <span style={{ fontSize: 10, background: "rgba(255,179,0,0.2)", border: "1px solid rgba(255,179,0,0.4)", color: "#FFB300", padding: "3px 8px", borderRadius: 20, fontWeight: 700 }}>DEMO</span>}
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: isOnline ? "#69f0ae" : "#f44336", display: "inline-block", boxShadow: isOnline ? "0 0 6px #69f0ae" : "0 0 6px #f44336" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 5, marginTop: 12 }}>
          {["Pilih GH", "Input Vigor", "Selesai"].map((label, i) => {
            const s = i + 1;
            const active = step === s, done = step > s;
            return (
              <div key={s} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ height: 3, borderRadius: 2, marginBottom: 4, background: done ? "#69f0ae" : active ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.15)", transition: "background 0.3s" }} />
                <div style={{ fontSize: 9, color: active ? color.card : done ? "#69f0ae" : "rgba(255,255,255,0.3)", fontWeight: active ? 700 : 400 }}>{label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Warning modal */}
      {showWarning && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: color.card, borderRadius: 16, padding: 24, maxWidth: 340, width: "100%" }}>
            <div style={{ fontSize: 32, textAlign: "center", marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: color.text, textAlign: "center", marginBottom: 8 }}>Sudah disubmit hari ini</div>
            <div style={{ fontSize: 13, color: color.textMuted, textAlign: "center", marginBottom: 20, lineHeight: 1.5 }}>
              <strong>{pendingGH}</strong> sudah disubmit hari ini. Data baru akan ditambahkan.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setShowWarning(false); setPendingGH(""); }} style={{ flex: 1, padding: 11, background: color.bg, border: `1px solid ${color.border}`, borderRadius: 10, color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Batal</button>
              <button onClick={() => doSelectGH(pendingGH)} style={{ flex: 1, padding: 11, background: color.danger, border: "none", borderRadius: 10, color: color.card, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Isi Ulang</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ flex: 1, padding: 16 }}>

        {/* ══ STEP 1 — Pilih GH ══ */}
        {step === 1 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: color.brand900, marginBottom: 4 }}>Pilih Greenhouse</div>
            <div style={{ fontSize: 12, color: color.textSoft, marginBottom: 14 }}>GH aktif HST {HST_MIN}–{HST_MAX}</div>
            {loadingGH ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: color.textGhost }}>
                <div style={{ fontSize: 28 }}>🔄</div>
                <div style={{ fontSize: 13, marginTop: 8 }}>Memuat data GH...</div>
              </div>
            ) : ghAktif.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0", color: color.textGhost, fontSize: 13 }}>Tidak ada GH aktif</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {TIPE_GH.map(tipe => {
                  const ghDiTipe = ghAktif.filter(([gh]) => tipe.pattern(gh));
                  const isOpen   = selectedTipe === tipe.key;
                  const hasDue   = ghDiTipe.some(([, info]) => getCheckpointStatus(info.tanam ? hitungHST(info.tanam) : null)?.type === "due");
                  const hasSoon  = !hasDue && ghDiTipe.some(([, info]) => getCheckpointStatus(info.tanam ? hitungHST(info.tanam) : null)?.type === "soon");
                  return (
                    <div key={tipe.key} style={{ border: `1.5px solid ${isOpen ? tipe.color + "55" : color.border}`, borderRadius: 14, overflow: "hidden", background: color.card }}>
                      <button onClick={() => setSelectedTipe(isOpen ? "" : tipe.key)}
                        style={{ width: "100%", padding: "13px 16px", background: isOpen ? `${tipe.color}10` : color.card, border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 20 }}>{tipe.icon}</span>
                          <div style={{ textAlign: "left" }}>
                            <div style={{ fontSize: 14, fontWeight: 800, color: isOpen ? tipe.color : color.text }}>{tipe.label}</div>
                            <div style={{ fontSize: 11, color: color.textGhost, marginTop: 1 }}>{ghDiTipe.length} GH aktif saat ini</div>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {hasDue  && <span style={{ fontSize: 10, background: color.warningBg, border: `1px solid ${color.warningBorder}`, borderRadius: 20, padding: "2px 8px", color: color.warning, fontWeight: 700 }}>⚠️ Due</span>}
                          {hasSoon && <span style={{ fontSize: 10, background: color.brandBg, border: `1px solid ${color.brand300}`, borderRadius: 20, padding: "2px 8px", color: color.brand700, fontWeight: 700 }}>🔔 Soon</span>}
                          <span style={{ fontSize: 14, color: "#bbb", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s", display: "inline-block" }}>▼</span>
                        </div>
                      </button>
                      {isOpen && (
                        <div style={{ padding: "10px 12px 14px", borderTop: `1px solid ${tipe.color}22` }}>
                          {ghDiTipe.length === 0 ? (
                            <div style={{ textAlign: "center", padding: 20, color: color.textGhost, fontSize: 13 }}>Tidak ada GH aktif di tipe ini.</div>
                          ) : (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                              {ghDiTipe.map(([gh, info]) => {
                                const hstGH    = info.tanam ? hitungHST(info.tanam) : null;
                                const c        = hstGH !== null ? hstColor(hstGH) : hstColor(21);
                                const dipilih  = selectedGH === gh;
                                const sudahIsi = submittedToday.includes(gh);
                                const cs       = getCheckpointStatus(hstGH);
                                return (
                                  <button key={gh} onClick={() => handleSelectGH(gh)}
                                    style={{ padding: "12px 10px", borderRadius: 12, cursor: "pointer", textAlign: "center", border: dipilih ? `2px solid ${tipe.color}` : sudahIsi ? `1px solid ${color.warningBorder}` : `1px solid ${color.border}`, background: dipilih ? `${tipe.color}12` : sudahIsi ? "#fff8e1" : "#fafafa", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, transition: "all 0.2s" }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: dipilih ? tipe.color : color.text }}>{gh}</div>
                                    <div style={{ fontSize: 10, color: color.textGhost }}>P{info.periode} · {info.varian?.length || 0} varian</div>
                                    {hstGH !== null && (
                                      <div style={{ background: c.badge, border: `1px solid ${c.border}`, borderRadius: 8, padding: "4px 10px", width: "100%" }}>
                                        <span style={{ fontSize: 16, fontWeight: 800, color: c.text }}>{hstGH}</span>
                                        <span style={{ fontSize: 10, color: c.text, marginLeft: 3 }}>HST</span>
                                      </div>
                                    )}
                                    {cs && (
                                      <div style={{ width: "100%", fontSize: 10, borderRadius: 7, padding: "3px 6px", fontWeight: 700, background: cs.type === "due" ? color.warningBg : color.brandBg, border: `1px solid ${cs.type === "due" ? color.warningBorder : color.brand300}`, color: cs.type === "due" ? color.warning : color.brand700 }}>
                                        {cs.label}
                                      </div>
                                    )}
                                    {sudahIsi && <div style={{ fontSize: 10, background: color.warningBg, border: `1px solid ${color.warningBorder}`, borderRadius: 20, padding: "2px 8px", color: color.warning, fontWeight: 600 }}>✓ Sudah diisi</div>}
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

        {/* ══ STEP 2 — Input Per Varian ══ */}
        {step === 2 && (
          <div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              <div style={{ background: color.brandBg, border: `1px solid ${color.brand300}`, borderRadius: 20, padding: "3px 12px", fontSize: 12, color: color.brand700, fontWeight: 700 }}>{selectedGH}</div>
              <div style={{ background: color.bg, borderRadius: 20, padding: "3px 12px", fontSize: 12, color: color.textMuted }}>P{ghInfo?.periode}</div>
              {hstAktual !== null && (
                <div style={{ background: col.badge, border: `1px solid ${col.border}`, borderRadius: 20, padding: "3px 12px", fontSize: 12, color: col.text, fontWeight: 700 }}>{hstAktual} HST aktual</div>
              )}
            </div>

            {(() => {
              const cs = getCheckpointStatus(hstAktual);
              if (!cs) return null;
              return (
                <div style={{ marginBottom: 12, padding: "9px 14px", background: cs.type === "due" ? color.warningBg : color.brandBg, border: `1px solid ${cs.type === "due" ? color.warningBorder : color.brand300}`, borderRadius: 10, fontSize: 12, color: cs.type === "due" ? color.warning : color.brand700, fontWeight: 600 }}>
                  {cs.label}
                </div>
              );
            })()}

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: "#388e3c", letterSpacing: 1.1, textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>Checkpoint HST</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {HST_CHECKPOINTS.map(h => (
                  <button key={h} onClick={() => setSelectedHST(h)}
                    style={{ padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${selectedHST === h ? color.brand900 : color.border}`, background: selectedHST === h ? color.brandBg : color.card, color: selectedHST === h ? color.brand900 : color.textSoft, fontSize: 13, fontWeight: selectedHST === h ? 700 : 400, cursor: "pointer" }}>
                    HST {h}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ fontSize: 12, color: color.textSoft, marginBottom: 6 }}>{filledCount}/{varianList.length} varian terisi</div>
            <div style={{ background: color.border, borderRadius: 4, height: 5, marginBottom: 14, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 4, background: "#4CAF50", width: `${varianList.length > 0 ? (filledCount / varianList.length) * 100 : 0}%`, transition: "width 0.3s" }} />
            </div>

            {!isOnline && (
              <div style={{ marginBottom: 12, padding: "8px 12px", background: color.warningBg, border: `1px solid ${color.warningBorder}`, borderRadius: 9, display: "flex", alignItems: "center", gap: 8 }}>
                <span>📵</span>
                <span style={{ fontSize: 11, color: color.warning }}>Offline — data tersimpan lokal & dikirim otomatis saat online</span>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {varianList.map((varian) => {
                const d      = varianData[varian] || {};
                const filled = isVarianFilled(d, showKualitas, showPolinasi, showKesegaran, showNetting, showNetting50Field, showNetBercakHitam, showLebarDiameter, showSimetri);
                const isOpen = activeVarian === varian;
                return (
                  <div key={varian} style={{ background: color.card, borderRadius: 12, border: `1.5px solid ${filled ? color.brand300 : color.border}`, overflow: "hidden" }}>
                    <button onClick={() => setActiveVarian(isOpen ? null : varian)}
                      style={{ width: "100%", padding: "12px 14px", background: filled ? "#f1f8e9" : color.card, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: filled ? color.brand700 : color.text }}>🌾 {varian}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {filled  && <span style={{ fontSize: 14 }}>✅</span>}
                        {!filled && <span style={{ fontSize: 10, background: color.warningBg, border: `1px solid ${color.warningBorder}`, borderRadius: 20, padding: "2px 8px", color: color.warning }}>Belum lengkap</span>}
                        <span style={{ fontSize: 12, color: "#bbb", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
                      </div>
                    </button>

                    {isOpen && (
                      <div style={{ padding: "14px", borderTop: "1px solid #f0f0f0" }}>

                        {/* ASPEK VIGOR */}
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#388e3c", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>🌿 Aspek Vigor Tanaman</div>
                        {(() => {
                          const tipeGH = TIPE_GH.find(t => t.pattern(selectedGH));
                          const samplingText = tipeGH?.key === "kolam"
                            ? "Sistem Kolam: ambil mulai dari tanaman ke-16 dari baris depan sejumlah 7 tanaman, dan ke-16 dari baris belakang sejumlah 7 tanaman (total 14 tanaman)"
                            : tipeGH?.key === "dutch"
                            ? "Sistem DB: ambil mulai dari bucket/polybag ke-16 dari baris depan sejumlah 7 tanaman, dan ke-16 dari baris belakang sejumlah 7 tanaman (total 14 tanaman)"
                            : "Ambil sampel setelah 10 tanaman depan dan 10 tanaman belakang, hindari tanaman yang terpengaruh variabel luar";
                          return <div style={{ fontSize: 10, color: color.textSoft, marginBottom: 4 }}>{samplingText}</div>;
                        })()}

                        {showLebarDiameter && (
                          <div style={{ marginBottom: 14 }}>
                            <div style={{ fontSize: 12, color: "#555", marginBottom: 4, fontWeight: 600 }}>1. Lebar Daun (cm)</div>
                            <div style={{ fontSize: 11, color: color.textGhost, marginBottom: 8 }}>
                              {selectedHST === 7 ? "Dilakukan pada daun ke-4" : selectedHST === 14 ? "Dilakukan pada daun ke-7" : selectedHST === 18 ? "Dilakukan pada daun ke-11" : "Dilakukan pada daun ke-4"}
                            </div>
                            <PilihOpsi options={lebarDaunOptions} value={d.lebarDaun} onChange={val => updateVarian(varian, "lebarDaun", val)} color={color.brand700} cols={3} />
                          </div>
                        )}

                        {showLebarDiameter && (
                          <div style={{ marginBottom: 14 }}>
                            <div style={{ fontSize: 12, color: "#555", marginBottom: 4, fontWeight: 600 }}>2. Diameter Batang</div>
                            <div style={{ fontSize: 11, color: color.textGhost, marginBottom: 8 }}>Penilaian DB pada ruas ke-3 hingga ke-5</div>
                            <PilihOpsi options={diameterOptions} value={d.diameterBatang} onChange={val => updateVarian(varian, "diameterBatang", val)} color={color.info} cols={2} />
                          </div>
                        )}

                        <div style={{ marginBottom: 18 }}>
                          <div style={{ fontSize: 12, color: "#555", marginBottom: 8, fontWeight: 600 }}>{showLebarDiameter ? "3." : "1."} Warna Daun</div>
                          <PilihOpsi options={WARNA_DAUN_OPTIONS} value={d.warnaDaun} onChange={val => updateVarian(varian, "warnaDaun", val)} color="#f57f17" cols={2} />
                        </div>

                        {/* KESEGARAN — bagian Aspek Vigor (sejajar Warna Daun, semua checkpoint relevan) */}
                        {showKesegaranVigor && (
                          <div style={{ marginBottom: 18 }}>
                            <div style={{ fontSize: 12, color: "#555", marginBottom: 8, fontWeight: 600 }}>{showLebarDiameter ? "4." : "2."} Kesegaran Tanaman (Kelayuan)</div>
                            <PilihOpsi options={KESEGARAN_OPTIONS} value={d.kesegaran} onChange={val => updateVarian(varian, "kesegaran", val)} color={color.brand700} cols={3} />
                          </div>
                        )}

                        {/* ASPEK PERAKARAN */}
                        <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 14, marginBottom: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#795548", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>🪱 Aspek Perakaran</div>
                          <div style={{ fontSize: 10, color: color.textSoft, marginBottom: 12 }}>Sampel 1 tanaman per varian, gali ±2 cm pada media tanam</div>
                        </div>

                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: 12, color: "#555", marginBottom: 8, fontWeight: 600 }}>1. Warna Akar Serabut</div>
                          <PilihOpsi options={WARNA_AKAR_OPTIONS} value={d.warnaAkar} onChange={val => updateVarian(varian, "warnaAkar", val)} color="#795548" cols={2} />
                        </div>

                        <div style={{ marginBottom: showKualitas || showKesegaran || showNetting ? 18 : 6 }}>
                          <div style={{ fontSize: 12, color: "#555", marginBottom: 8, fontWeight: 600 }}>2. Volume Akar</div>
                          <PilihOpsi options={VOLUME_AKAR_OPTIONS} value={d.volumeAkar} onChange={val => updateVarian(varian, "volumeAkar", val)} color="#795548" cols={3} />
                        </div>

                        {/* KUALITAS BUAH — Simetri & Cabang (HST 33 & 38) */}
                        {showSimetri && (
                          <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 14 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#AD1457", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>🍈 Aspek Kualitas Buah</div>
                            <div style={{ fontSize: 10, color: color.textSoft, marginBottom: 12 }}>Per baris (± 198 tanaman) per varian</div>
                            <div style={{ fontSize: 12, color: "#555", marginBottom: 10, fontWeight: 600 }}>1. Simetri Buah</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                              {SIMETRI_BUAH_OPTIONS.map((opt, idx) => {
                                const active = d.simetriBuah === opt;
                                return (
                                  <button key={idx} onClick={() => updateVarian(varian, "simetriBuah", opt)}
                                    style={{ padding: "10px", textAlign: "center", borderRadius: 10, cursor: "pointer", border: `1.5px solid ${active ? "#AD1457" : color.border}`, background: active ? "#FCE4EC" : color.card, color: active ? "#AD1457" : "#555", fontSize: 12, fontWeight: active ? 700 : 400, lineHeight: 1.4 }}>
                                    <div style={{ fontSize: 16, marginBottom: 4 }}>{active ? "●" : "○"}</div>
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>
                            <div style={{ fontSize: 12, color: "#555", marginBottom: 10, fontWeight: 600, marginTop: 14 }}>2. Cabang Buah</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                              {CABANG_BUAH_OPTIONS.map((opt, idx) => {
                                const active = d.cabangBuah === opt;
                                return (
                                  <button key={idx} onClick={() => updateVarian(varian, "cabangBuah", opt)}
                                    style={{ padding: "10px", textAlign: "center", borderRadius: 10, cursor: "pointer", border: `1.5px solid ${active ? "#AD1457" : color.border}`, background: active ? "#FCE4EC" : color.card, color: active ? "#AD1457" : "#555", fontSize: 12, fontWeight: active ? 700 : 400, lineHeight: 1.4 }}>
                                    <div style={{ fontSize: 16, marginBottom: 4 }}>{active ? "●" : "○"}</div>
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* POLINASI (HST 18) */}
                        {showPolinasi && (
                          <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 14, marginTop: showKualitas ? 14 : 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: color.info, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>🌸 Aspek Penilaian Keberhasilan Polinasi</div>
                            <div style={{ fontSize: 10, color: color.textSoft, marginBottom: 12 }}>Ambil sampel setelah 10 tanaman depan dan 10 tanaman belakang, hindari tanaman yang terpengaruh variabel luar</div>
                            <div style={{ marginBottom: 12, padding: "9px 12px", background: "#fff8e1", border: "1px solid #ffe082", borderRadius: 8, fontSize: 11, color: "#7a6000", lineHeight: 1.5 }}>
                              ⚠️ Umur 18 HST belum selesai dilakukan polinasi, untuk itu penilaian keberhasilan cabang polinasi belum dapat dilakukan.
                            </div>
                            <div style={{ fontSize: 12, color: "#555", marginBottom: 10, fontWeight: 600 }}>1. Buah Bajang</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                              {BUAH_BAJANG_OPTIONS.map((opt, idx) => {
                                const active = d.buahBajang === opt;
                                return (
                                  <button key={idx} onClick={() => updateVarian(varian, "buahBajang", opt)}
                                    style={{ padding: "10px 14px", textAlign: "left", borderRadius: 10, cursor: "pointer", border: `1.5px solid ${active ? color.info : color.border}`, background: active ? color.infoBg : color.card, color: active ? color.info : "#555", fontSize: 12, fontWeight: active ? 700 : 400, lineHeight: 1.4, display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ flexShrink: 0 }}>{active ? "●" : "○"}</span><span>{opt}</span>
                                  </button>
                                );
                              })}
                            </div>
                            <div style={{ fontSize: 12, color: "#555", marginBottom: 10, fontWeight: 600 }}>2. Panjang Tunas Air</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                              {PANJANG_TUNAS_AIR_OPTIONS.map((opt, idx) => {
                                const active = d.panjangTunasAir === opt;
                                return (
                                  <button key={idx} onClick={() => updateVarian(varian, "panjangTunasAir", opt)}
                                    style={{ padding: "10px 6px", textAlign: "center", borderRadius: 10, cursor: "pointer", border: `1.5px solid ${active ? color.info : color.border}`, background: active ? color.infoBg : color.card, color: active ? color.info : "#555", fontSize: 12, fontWeight: active ? 700 : 400, lineHeight: 1.4 }}>
                                    <div style={{ fontSize: 16, marginBottom: 4 }}>{active ? "●" : "○"}</div>{opt}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* NETTING BUAH (HST 45 & 54) */}
                        {showNetting && (
                          <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 14, marginTop: 14 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#AD1457", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>🍈 Kualitas Buah Tambahan</div>
                            <div style={{ fontSize: 12, color: "#555", marginBottom: 10, fontWeight: 600 }}>{selectedHST === 54 ? "Netting Buah (Crack Basah)" : "Netting Buah"}</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                              {(selectedHST === 54 ? NETTING_BUAH_54_OPTIONS : NETTING_BUAH_45_OPTIONS).map((opt, idx) => {
                                const active = d.nettingBuah === opt;
                                return (
                                  <button key={idx} onClick={() => updateVarian(varian, "nettingBuah", opt)}
                                    style={{ padding: "10px 14px", textAlign: "left", borderRadius: 10, cursor: "pointer", border: `1.5px solid ${active ? "#AD1457" : color.border}`, background: active ? "#FCE4EC" : color.card, color: active ? "#AD1457" : "#555", fontSize: 12, fontWeight: active ? 700 : 400, lineHeight: 1.4, display: "flex", alignItems: "flex-start", gap: 8 }}>
                                    <span style={{ flexShrink: 0, marginTop: 1 }}>{active ? "●" : "○"}</span><span>{opt}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* NETTING 50% (HST 54) / NETTING BUAH CRACK (HST 45) — sama-sama pakai field netting50 */}
                        {showNetting50Field && (
                          <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 14, marginTop: 14 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: color.purple700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>🍈 {showNettingCrack45 ? "Kualitas Buah Tambahan" : "Netting 50%"}</div>
                            <div style={{ fontSize: 12, color: "#555", marginBottom: 10, fontWeight: 600 }}>{showNettingCrack45 ? "Netting Buah (Crack Basah)" : "Pencapaian Netting 50%"}</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                              {(showNettingCrack45 ? NETTING_BUAH_54_OPTIONS : NETTING_50_54_OPTIONS).map((opt, idx) => {
                                const active = d.netting50 === opt;
                                return (
                                  <button key={idx} onClick={() => updateVarian(varian, "netting50", opt)}
                                    style={{ padding: "10px 14px", textAlign: "left", borderRadius: 10, cursor: "pointer", border: `1.5px solid ${active ? color.purple700 : color.border}`, background: active ? color.purpleBg : color.card, color: active ? color.purple700 : "#555", fontSize: 12, fontWeight: active ? 700 : 400, lineHeight: 1.4, display: "flex", alignItems: "flex-start", gap: 8 }}>
                                    <span style={{ flexShrink: 0, marginTop: 1 }}>{active ? "●" : "○"}</span><span>{opt}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* NET/BERCAK HITAM (HST 54) */}
                        {showNetBercakHitam && (
                          <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 14, marginTop: 14 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#BF360C", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>🍈 Kualitas Buah Tambahan</div>
                            <div style={{ fontSize: 12, color: "#555", marginBottom: 10, fontWeight: 600 }}>Pendataan Buah Net/Bercak Hitam</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                              {NET_BERCAK_HITAM_54_OPTIONS.map((opt, idx) => {
                                const active = d.netBercakHitam === opt;
                                return (
                                  <button key={idx} onClick={() => updateVarian(varian, "netBercakHitam", opt)}
                                    style={{ padding: "10px 14px", textAlign: "left", borderRadius: 10, cursor: "pointer", border: `1.5px solid ${active ? "#BF360C" : color.border}`, background: active ? "#FBE9E7" : color.card, color: active ? "#BF360C" : "#555", fontSize: 12, fontWeight: active ? 700 : 400, lineHeight: 1.4, display: "flex", alignItems: "flex-start", gap: 8 }}>
                                    <span style={{ flexShrink: 0, marginTop: 1 }}>{active ? "●" : "○"}</span><span>{opt}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: "#388e3c", letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 700 }}>
                👤 Nama Operator <span style={{ color: color.danger }}>*</span>
              </label>
              <input type="text" value={operator} onChange={e => setOperator(e.target.value)} placeholder="Tulis nama lengkap..."
                style={{ width: "100%", marginTop: 8, padding: "11px 14px", background: color.card, border: `1.5px solid ${operator.trim() ? color.brand400 : color.border}`, borderRadius: 10, color: color.text, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
            </div>

            <FotoSelfie
              fotoFile={selfieFile} fotoPreview={selfiePreview}
              onChange={(file, preview) => { setSelfieFile(file); setSelfiePreview(preview); setSelfieUrl(""); }}
              onClear={() => { setSelfieFile(null); setSelfiePreview(null); setSelfieUrl(""); }}
              isOffline={!isOnline} darkMode={false}
            />

            {!allFilled && varianList.length > 0 && (
              <div style={{ fontSize: 12, color: color.warning, background: color.warningBg, border: `1px solid ${color.warningBorder}`, borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>
                ⚠️ {varianList.length - filledCount} varian belum lengkap — tap varian untuk mengisi
              </div>
            )}
            {submitError && (
              <div style={{ fontSize: 12, color: color.dangerDeep, background: color.dangerBg, border: `1px solid ${color.dangerBorder}`, borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>⚠️ {submitError}</div>
            )}
          </div>
        )}

        {/* ══ STEP 3 — Sukses ══ */}
        {step === 3 && (
          <div style={{ textAlign: "center", paddingTop: 32 }}>
            <div style={{ fontSize: 60, marginBottom: 12 }}>{isDemoMode ? "🧪" : savedOffline ? "💾" : "✅"}</div>
            <div style={{ fontSize: 21, fontWeight: 800, color: isDemoMode ? "#f57f17" : savedOffline ? color.info : color.brand700, marginBottom: 6 }}>
              {isDemoMode ? "Demo Selesai!" : savedOffline ? "Tersimpan Lokal!" : "Data Tersimpan!"}
            </div>
            <div style={{ fontSize: 13, color: color.textSoft, marginBottom: 20 }}>
              {isDemoMode ? "Data tidak dikirim (mode demo)" : savedOffline ? "Otomatis terkirim ke Google Sheets saat online." : `${varianList.length} varian berhasil dikirim ke Google Sheets`}
            </div>
            <div style={{ background: savedOffline ? color.infoBg : color.brandBg, border: `1px solid ${savedOffline ? color.infoBorder : color.brand300}`, borderRadius: 14, padding: 16, textAlign: "left", marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: color.text }}>{selectedGH} · P{ghInfo?.periode} · {hstAktual} HST</div>
              <div style={{ fontSize: 13, color: color.textMuted, marginTop: 2 }}>Operator: {operator}</div>
              <div style={{ fontSize: 13, color: color.textMuted, marginTop: 2 }}>{varianList.length} varian · {todayISO}</div>
            </div>
            {onDone ? (
              <button onClick={onDone} style={{ width: "100%", padding: 15, background: color.brandBg, border: `2px solid ${color.brand400}`, borderRadius: 12, color: color.brand700, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                ← Kembali ke Home
              </button>
            ) : (
              <button onClick={resetForm} style={{ width: "100%", padding: 15, background: color.brandBg, border: `2px solid ${color.brand400}`, borderRadius: 12, color: color.brand700, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                + Input GH Berikutnya
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      {step < 3 && (
        <div style={{ padding: "12px 16px 24px", borderTop: `1px solid ${color.border}`, background: color.card, position: "sticky", bottom: 0, display: "flex", gap: 10 }}>
          {step > 1 && !onDone && (
            <button onClick={() => { setStep(s => s - 1); setSubmitError(null); }}
              style={{ flex: 1, padding: 13, background: color.bg, border: `1px solid ${color.border}`, borderRadius: 12, color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>← Kembali</button>
          )}
          {step === 1 && (
            <button onClick={() => setStep(2)} disabled={!selectedGH}
              style={{ flex: 2, padding: 13, border: "none", borderRadius: 12, background: selectedGH ? `linear-gradient(135deg,${color.brand900},${color.brand700})` : color.border, color: selectedGH ? color.card : color.textGhost, fontSize: 15, fontWeight: 700, cursor: selectedGH ? "pointer" : "not-allowed" }}>
              Lanjut Input →
            </button>
          )}
          {step === 2 && (
            <button onClick={() => setConfirmOpen(true)} disabled={!canSubmit || submitting}
              style={{ flex: 2, padding: 13, border: "none", borderRadius: 12, background: canSubmit && !submitting ? (!isOnline ? `linear-gradient(135deg,${color.info},#1976D2)` : `linear-gradient(135deg,${color.brand900},${color.brand700})`) : color.border, color: canSubmit && !submitting ? color.card : color.textGhost, fontSize: 15, fontWeight: 700, cursor: canSubmit && !submitting ? "pointer" : "not-allowed" }}>
              {submitting ? "⏳ Menyimpan..." : !isOnline && canSubmit ? "💾 Simpan Offline" : `Submit ${varianList.length} Varian ✓`}
            </button>
          )}
        </div>
      )}

      <ConfirmSubmitModal
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => { setConfirmOpen(false); handleSubmit(); }}
        color="#43A047" isOffline={!isOnline} isDemoMode={isDemoMode}
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
