import { useState, useEffect, useCallback, useRef } from "react";
import { useDraft } from "../hooks/useDraft";
import { useAuth } from "../hooks/useAuth";
import { idbAdd, idbGetAll, idbDelete, idbCount, gasFetch, gasPost } from "../utils/idb";
import html2canvas from "html2canvas";
import { useGHBlockedList, warnIfGHBlocked } from "../hooks/useGHBlockedList";
import { FormShell, FieldAlert, SuccessState, GHPicker, ReviewTable, Dialog, SegmentTabs, GoodNotGood, Icon } from "../components/form";
import { formatTanggal } from "../lib/format";

const DB_NAME    = "KesiapanOfflineDB";
const SCRIPT_URL = import.meta.env.VITE_GAS_KESIAPAN_URL;

// todayISO dikirim ke sheet (format dd/mm/yyyy) — jangan diubah
const todayISO   = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });

// ─── Data GH per Tipe ────────────────────────────────────────
const GH_PER_TIPE = {
  "Drip":         ["BERGAS 1","BERGAS 2","BERGAS 3","BERGAS 4","BERGAS 5","BERGAS 7","BERGAS 8","COLOMADU 1","COLOMADU 2","COLOMADU 3","COLOMADU 4","TOHUDAN 14","TOHUDAN 15","TOHUDAN 16","TOHUDAN 17","TOHUDAN 18","TOHUDAN 19","TOHUDAN 20","TOHUDAN 21"],
  "Kolam P1":     ["TOHUDAN 1","TOHUDAN 2","TOHUDAN 3","TOHUDAN 4","TOHUDAN 5","TOHUDAN 6","TOHUDAN 7","TOHUDAN 8","TOHUDAN 9","TOHUDAN 10","TOHUDAN 11","TOHUDAN 12","TOHUDAN 13","TOHUDAN 22","SAWAHAN TUNNEL 1"],
  "Kolam P2":     ["TOHUDAN 1","TOHUDAN 2","TOHUDAN 3","TOHUDAN 4","TOHUDAN 5","TOHUDAN 6","TOHUDAN 7","TOHUDAN 8","TOHUDAN 9","TOHUDAN 10","TOHUDAN 11","TOHUDAN 12","TOHUDAN 13"],
};

const TIPE_LIST = Object.keys(GH_PER_TIPE);

// ─── Matriks Aspek per Tipe GH ───────────────────────────────
const MATRIKS = {
  "Drip": [
    {
      key: "tandon", label: "Tandon", bobotAspek: 25,
      items: [
        { code: "DR_T1", label: "Tandon dalam keadaan bersih",           bobotVariabel: 5  },
        { code: "DR_T2", label: "Tidak ada kebocoran tandon",            bobotVariabel: 15 },
        { code: "DR_T3", label: "Pompa utama berfungsi normal",          bobotVariabel: 15 },
        { code: "DR_T4", label: "Pompa air baku berfungsi normal",       bobotVariabel: 15 },
        { code: "DR_T5", label: "Pressure gauge berfungsi normal",       bobotVariabel: 10 },
        { code: "DR_T6", label: "Filter air berfungsi normal",           bobotVariabel: 5  },
        { code: "DR_T7", label: "Filter air dalam kondisi bersih",       bobotVariabel: 10 },
        { code: "DR_T8", label: "Instalasi kelistrikan berfungsi normal",bobotVariabel: 15 },
        { code: "DR_T9", label: "Seluruh stop kran berfungsi normal",    bobotVariabel: 10 },
      ],
    },
    {
      key: "inst_input", label: "Instalasi Input", bobotAspek: 40,
      items: [
        { code: "DR_II0",  label: "Tidak ada sumbatan dan kebocoran pipa input",        bobotVariabel: 10 },
        { code: "DR_II1",  label: "Tekanan air yang mengalir sesuai standar (1.2 bar)", bobotVariabel: 5  },
        { code: "DR_II2",  label: "Stop kran PE 16 mm berfungsi normal",                bobotVariabel: 5  },
        { code: "DR_II3",  label: "Tidak ada kebocoran stop kran PE 16 mm",             bobotVariabel: 5  },
        { code: "DR_II4",  label: "Tidak ada kebocoran selang PE 16 mm",                bobotVariabel: 10 },
        { code: "DR_II5",  label: "Tekanan air pada pipa PE 16 mm sesuai (≥ 0.3 bar)", bobotVariabel: 10 },
        { code: "DR_II6",  label: "Seluruh PCJ berfungsi normal (4 L/H)",               bobotVariabel: 15 },
        { code: "DR_II7",  label: "Selang PE 5 mm berfungsi normal",                    bobotVariabel: 10 },
        { code: "DR_II8",  label: "Dripper berfungsi normal",                            bobotVariabel: 15 },
        { code: "DR_II9",  label: "Debit air dripper rata (toleransi 10 ml)",            bobotVariabel: 15 },
      ],
    },
    {
      key: "inst_gh", label: "Instalasi Greenhouse", bobotAspek: 35,
      items: [
        { code: "DR_IG1", label: "Bangunan GH dalam kondisi baik",            bobotVariabel: 15 },
        { code: "DR_IG2", label: "Plastik UV & insectnet dalam kondisi baik", bobotVariabel: 20 },
        { code: "DR_IG3", label: "Tidak ada kebocoran talang",                bobotVariabel: 20 },
        { code: "DR_IG4", label: "Weedmat dalam kondisi baik",                bobotVariabel: 15 },
        { code: "DR_IG5", label: "Jumlah tali rambat sesuai kebutuhan",       bobotVariabel: 15 },
        { code: "DR_IG6", label: "Kawat seling dalam kondisi baik",           bobotVariabel: 15 },
      ],
    },
  ],

  "Kolam P1": [
    {
      key: "tandon_air_baku", label: "Tandon Air Baku", bobotAspek: 10,
      items: [
        { code: "P1_TAB1", label: "Tandon air baku dalam keadaan bersih",  bobotVariabel: 25 },
        { code: "P1_TAB2", label: "Tidak ada kebocoran kolam tandon",       bobotVariabel: 35 },
        { code: "P1_TAB3", label: "Sumber air baku berjalan normal",        bobotVariabel: 40 },
      ],
    },
    {
      key: "tandon_nutrisi", label: "Tandon Nutrisi", bobotAspek: 10,
      items: [
        { code: "P1_TN1", label: "Tandon dalam keadaan bersih",                bobotVariabel: 15 },
        { code: "P1_TN2", label: "Tidak ada kebocoran tandon",                 bobotVariabel: 20 },
        { code: "P1_TN3", label: "Jumlah lampu UV sesuai (1 lampu) / tandon",  bobotVariabel: 10 },
        { code: "P1_TN4", label: "Lampu UV menyala normal",                    bobotVariabel: 15 },
        { code: "P1_TN5", label: "Sumber air baku berjalan normal",            bobotVariabel: 15 },
        { code: "P1_TN6", label: "Instalasi kelistrikan berjalan normal",      bobotVariabel: 25 },
      ],
    },
    {
      key: "pompa", label: "Pompa", bobotAspek: 15,
      items: [
        { code: "P1_PM1", label: "Pompa utama berfungsi normal",              bobotVariabel: 20 },
        { code: "P1_PM2", label: "Tusen klep berfungsi normal",               bobotVariabel: 15 },
        { code: "P1_PM3", label: "Pressure gauge berfungsi normal",           bobotVariabel: 10 },
        { code: "P1_PM4", label: "Stop kran pada pompa berfungsi normal",     bobotVariabel: 10 },
        { code: "P1_PM5", label: "Filter air berfungsi normal",               bobotVariabel: 10 },
        { code: "P1_PM6", label: "Instalasi kelistrikan berjalan normal",     bobotVariabel: 20 },
        { code: "P1_PM7", label: "Tombol kelistrikan berjalan normal",        bobotVariabel: 15 },
      ],
    },
    {
      key: "inst_input", label: "Instalasi Input", bobotAspek: 15,
      items: [
        { code: "P1_II1", label: "Stop kran 1½ inch input berfungsi normal",       bobotVariabel: 25 },
        { code: "P1_II2", label: "Tidak ada sumbatan dan kebocoran pipa input",    bobotVariabel: 35 },
        { code: "P1_II3", label: "Aliran pipa input berjalan normal",              bobotVariabel: 40 },
      ],
    },
    {
      key: "inst_kolam", label: "Instalasi Kolam", bobotAspek: 25,
      items: [
        { code: "P1_IK1", label: "Selang T-Tape terpasang dengan lurus & rata",          bobotVariabel: 25 },
        { code: "P1_IK2", label: "Lubang emitter menghadap ke atas",                     bobotVariabel: 10 },
        { code: "P1_IK3", label: "Kolam dalam kondisi bersih",                           bobotVariabel: 10 },
        { code: "P1_IK4", label: "Valve Drat ½ inch to T-Tape berfungsi normal",        bobotVariabel: 15 },
        { code: "P1_IK5", label: "Debit air yang keluar seragam",                        bobotVariabel: 40 },
      ],
    },
    {
      key: "inst_gh", label: "Instalasi Greenhouse", bobotAspek: 25,
      items: [
        { code: "P1_IG0", label: "Bangunan GH dalam kondisi baik",            bobotVariabel: 15 },
        { code: "P1_IG01", label: "Plastik UV & insectnet dalam kondisi baik", bobotVariabel: 20 },
        { code: "P1_IG02", label: "Tidak ada kebocoran talang",                bobotVariabel: 20 },
        { code: "P1_IG1", label: "Weedmat dalam kondisi baik",                bobotVariabel: 10 },
        { code: "P1_IG2", label: "Jumlah tali rambat sesuai kebutuhan",       bobotVariabel: 10 },
        { code: "P1_IG3", label: "Kawat seling dalam kondisi baik",           bobotVariabel: 15 },
        { code: "P1_IG4", label: "Termohigrometer berfungsi normal",          bobotVariabel: 10 },
      ],
    },
  ],

  "Kolam P2": [
    {
      key: "tandon_air_baku", label: "Tandon Air Baku", bobotAspek: 10,
      items: [
        { code: "P2_TAB1", label: "Tandon air baku dalam keadaan bersih",  bobotVariabel: 25 },
        { code: "P2_TAB2", label: "Tidak ada kebocoran kolam tandon",       bobotVariabel: 35 },
        { code: "P2_TAB3", label: "Sumber air baku berjalan normal",        bobotVariabel: 40 },
      ],
    },
    {
      key: "tandon_nutrisi", label: "Tandon Nutrisi", bobotAspek: 10,
      items: [
        { code: "P2_TN1", label: "Kolam tandon dalam keadaan bersih",             bobotVariabel: 15 },
        { code: "P2_TN2", label: "Tidak ada kebocoran kolam tandon",              bobotVariabel: 20 },
        { code: "P2_TN3", label: "Jumlah lampu UV sesuai (1 lampu) / tandon",     bobotVariabel: 10 },
        { code: "P2_TN4", label: "Lampu UV menyala normal",                       bobotVariabel: 15 },
        { code: "P2_TN5", label: "Sumber air baku berjalan normal",               bobotVariabel: 15 },
        { code: "P2_TN6", label: "Instalasi kelistrikan berjalan normal",         bobotVariabel: 25 },
      ],
    },
    {
      key: "pompa", label: "Pompa", bobotAspek: 20,
      items: [
        { code: "P2_PM1", label: "Pompa utama berfungsi normal",              bobotVariabel: 20 },
        { code: "P2_PM2", label: "Tusen klep berfungsi normal",               bobotVariabel: 15 },
        { code: "P2_PM3", label: "Pressure gauge berfungsi normal",           bobotVariabel: 10 },
        { code: "P2_PM4", label: "Stop kran pada pompa berfungsi normal",     bobotVariabel: 10 },
        { code: "P2_PM5", label: "Filter air berfungsi normal",               bobotVariabel: 10 },
        { code: "P2_PM6", label: "Instalasi kelistrikan berjalan normal",     bobotVariabel: 20 },
        { code: "P2_PM7", label: "Tombol kelistrikan berjalan normal",        bobotVariabel: 15 },
      ],
    },
    {
      key: "inst_input", label: "Instalasi Input", bobotAspek: 10,
      items: [
        { code: "P2_II1", label: "Stop kran 1½ inch input berfungsi normal",       bobotVariabel: 25 },
        { code: "P2_II2", label: "Tidak ada sumbatan dan kebocoran pipa input",    bobotVariabel: 35 },
        { code: "P2_II3", label: "Aliran pipa input berjalan normal",              bobotVariabel: 40 },
      ],
    },
    {
      key: "inst_kolam", label: "Instalasi Kolam", bobotAspek: 25,
      items: [
        { code: "P2_IK1", label: "Kolam dalam kondisi baik (Dinding dan Alas)",   bobotVariabel: 5  },
        { code: "P2_IK2", label: "Plastik kolam dalam kondisi baik",              bobotVariabel: 5  },
        { code: "P2_IK3", label: "Lubang drainase berfungsi dengan baik",         bobotVariabel: 5  },
        { code: "P2_IK4", label: "Selang T-Tape terpasang dengan lurus & rata",   bobotVariabel: 20 },
        { code: "P2_IK5", label: "Lubang emitter menghadap ke atas",              bobotVariabel: 10 },
        { code: "P2_IK6", label: "Kolam dalam kondisi bersih",                    bobotVariabel: 10 },
        { code: "P2_IK7", label: "Valve Drat ½ inch to T-Tape berfungsi normal",  bobotVariabel: 15 },
        { code: "P2_IK8", label: "Debit air yang keluar seragam",                 bobotVariabel: 30 },
      ],
    },
    {
      key: "inst_gh", label: "Instalasi Greenhouse", bobotAspek: 25,
      items: [
        { code: "P2_IG1", label: "Bangunan GH dalam kondisi baik",            bobotVariabel: 15 },
        { code: "P2_IG2", label: "Plastik UV & insectnet dalam kondisi baik", bobotVariabel: 20 },
        { code: "P2_IG3", label: "Tidak ada kebocoran talang",                bobotVariabel: 20 },
        { code: "P2_IG4", label: "Weedmat dalam kondisi baik",                bobotVariabel: 10 },
        { code: "P2_IG5", label: "Jumlah tali rambat sesuai kebutuhan",       bobotVariabel: 10 },
        { code: "P2_IG6", label: "Kawat seling dalam kondisi baik",           bobotVariabel: 15 },
        { code: "P2_IG7", label: "Termohigrometer berfungsi normal",          bobotVariabel: 10 },
      ],
    },
  ],
};

// ─── Helpers ─────────────────────────────────────────────────
function initScores(tipe) {
  if (!tipe || !MATRIKS[tipe]) return {};
  const scores = {};
  MATRIKS[tipe].forEach(aspek => {
    aspek.items.forEach(item => { scores[item.code] = null; });
  });
  return scores;
}

// Hitung bobot terpenuhi per aspek
// Good = dapat bobot penuh variabel × (bobotAspek / 100)
// Not Good = 0 (bobot tidak terpenuhi)
function hitungBobotAspek(aspek, scores) {
  let total = 0;
  aspek.items.forEach(item => {
    if (scores[item.code] === "good") {
      total += item.bobotVariabel * (aspek.bobotAspek / 100);
    }
  });
  return +total.toFixed(2);
}

// Hitung max bobot per aspek (semua Good)
function maxBobotAspek(aspek) {
  return +(aspek.items.reduce((sum, item) => sum + item.bobotVariabel * (aspek.bobotAspek / 100), 0).toFixed(2));
}

function hitungTotalBobot(tipe, scores) {
  if (!tipe || !MATRIKS[tipe]) return 0;
  return +MATRIKS[tipe].reduce((sum, aspek) => sum + hitungBobotAspek(aspek, scores), 0).toFixed(2);
}

function hitungMaxTotal(tipe) {
  if (!tipe || !MATRIKS[tipe]) return 100;
  return +MATRIKS[tipe].reduce((sum, aspek) => sum + maxBobotAspek(aspek), 0).toFixed(2);
}

// Status berdasarkan persentase bobot terpenuhi
// ≥ 70% = Siap Tanam, 50-69% = Perlu Perbaikan, < 50% = Tidak Layak
// label dikirim ke sheet sebagai `status` — jangan diubah
function statusDariPersen(persen) {
  if (persen >= 70) return { label: "Siap Tanam",      tone: "success" };
  if (persen >= 50) return { label: "Perlu Perbaikan", tone: "warning" };
  return               { label: "Tidak Layak",    tone: "danger" };
}

function statusAspek(aspek, scores) {
  const b   = hitungBobotAspek(aspek, scores);
  const max = maxBobotAspek(aspek);
  const pct = max > 0 ? Math.round((b / max) * 100) : 0;
  return { bobot: b, max, pct, ...statusDariPersen(pct) };
}

const LS_KEY = `kesiapan_${new Date().toLocaleDateString("id-ID")}`;
function getSubmittedLocal() { try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; } }
function markSubmittedLocal(key) {
  const list = getSubmittedLocal();
  if (!list.includes(key)) localStorage.setItem(LS_KEY, JSON.stringify([...list, key]));
}

// ─── Main Component ───────────────────────────────────────────
export default function KesiapanGH() {
  const { user } = useAuth();

  const { getDraft, saveDraft, clearDraft } = useDraft("kesiapan");
  const _draft = getDraft();

  const { blockedMap } = useGHBlockedList();
  // Draft lama bisa nyimpen tipe yang sudah tidak ada lagi (mis. "Dutch Bucket" yang
  // sekarang dihapus) — kalau dipakai apa adanya, GH_PER_TIPE[tipe] jadi undefined dan crash.
  const draftTipeValid = _draft?.tipe && Object.prototype.hasOwnProperty.call(GH_PER_TIPE, _draft.tipe);

  const [step, setStep]           = useState(draftTipeValid ? (_draft?.step || 1) : 1);
  const [tipe, setTipe]           = useState(draftTipeValid ? _draft.tipe : "");
  const [gh, setGh]               = useState(draftTipeValid ? (_draft?.gh || "") : "");
  const [scores, setScores]       = useState(draftTipeValid ? (_draft?.scores || {}) : {});
  const [activeAspek, setActiveAspek] = useState("");
  const [submitting, setSubmitting]   = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [savedOffline, setSavedOffline] = useState(false);
  const [isOnline, setIsOnline]   = useState(navigator.onLine);
  const rekapRef = useRef(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncingPending, setIsSyncingPending] = useState(false);
  const [submittedToday, setSubmittedToday] = useState([]);
  const [loadingSubmitted, setLoadingSubmitted] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [pendingGH, setPendingGH] = useState("");
  const [showKodeInput, setShowKodeInput] = useState(false);
  const [kodeInput, setKodeInput]         = useState("");
  const [kodeError, setKodeError]         = useState("");

  const aspekList   = tipe ? MATRIKS[tipe] : [];
  const allItems    = aspekList.flatMap(a => a.items);
  const filledCount = allItems.filter(i => scores[i.code] !== null && scores[i.code] !== undefined).length;
  const allFilled   = allItems.length > 0 && filledCount === allItems.length;
  const totalBobot  = hitungTotalBobot(tipe, scores);
  const maxTotal    = hitungMaxTotal(tipe);
  const totalPct    = maxTotal > 0 ? Math.round((totalBobot / maxTotal) * 100) : 0;
  const status      = statusDariPersen(totalPct);
  const submittedKey = tipe && gh ? `${tipe}__${gh}` : "";

  useEffect(() => {
    if (step === 4) return;
    saveDraft({ step, tipe, gh, scores });
  }, [step, tipe, gh, scores]);

  const refreshPendingCount = useCallback(async () => {
    try { setPendingCount(await idbCount(DB_NAME)); } catch { setPendingCount(0); }
  }, []);

  useEffect(() => { refreshPendingCount(); }, [refreshPendingCount]);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => { if (isOnline) syncPending(); }, [isOnline]);

  const syncPending = useCallback(async () => {
    const all = await idbGetAll(DB_NAME);
    if (!all.length) return;
    setIsSyncingPending(true);
    for (const record of all) {
      try {
        const json = await gasPost(SCRIPT_URL, record.payload);
        if (json.success) { markSubmittedLocal(record.key); await idbDelete(DB_NAME, record.id); }
      } catch { /* gagal kirim record ini — coba lagi nanti */ }
    }
    await refreshPendingCount();
    setIsSyncingPending(false);
  }, [refreshPendingCount]);

  const fetchSubmitted = useCallback(async (selectedTipe) => {
    if (!selectedTipe) return;
    setLoadingSubmitted(true);
    try {
      const json = await gasFetch(`${SCRIPT_URL}?action=getSubmitted&tipe=${encodeURIComponent(selectedTipe)}&tanggal=${encodeURIComponent(todayISO)}`);
      if (json.success) {
        // Gabung dari GAS + localStorage sebagai fallback
        const fromGAS   = json.submitted.map(gh => `${selectedTipe}__${gh}`);
        const fromLocal = getSubmittedLocal().filter(k => k.startsWith(`${selectedTipe}__`));
        const merged    = [...new Set([...fromGAS, ...fromLocal])];
        setSubmittedToday(merged);
      } else {
        setSubmittedToday(getSubmittedLocal());
      }
    } catch {
      // Fallback ke localStorage jika offline
      setSubmittedToday(getSubmittedLocal());
    } finally {
      setLoadingSubmitted(false);
    }
  }, []);

  // Draft yang dipulihkan sudah punya tipe → ambil status "sudah dicek" tanpa harus pilih ulang
  useEffect(() => { if (tipe) fetchSubmitted(tipe); }, []);

  const handleSelectTipe = (t) => {
    setTipe(t); setGh("");
    setScores(initScores(t));
    setActiveAspek(MATRIKS[t]?.[0]?.key || "");
    setSubmittedToday([]);
    fetchSubmitted(t);
  };

  const handleSelectGH = (g) => {
    if (warnIfGHBlocked(g, blockedMap)) return;
    if (submittedToday.includes(`${tipe}__${g}`)) { setPendingGH(g); setShowWarning(true); }
    else doSelectGH(g);
  };

  const doSelectGH = (g) => {
    setGh(g); setShowWarning(false); setPendingGH("");
    setStep(2);
  };

  const setScore = (code, val) => setScores(prev => ({ ...prev, [code]: val }));

  const buildPayload = () => {
    const payload = {
      action: "submitKesiapan",
      client_timestamp: new Date().toISOString(),
      tanggal: todayISO,
      operator: user?.nama || "",
      tipe, gh,
      totalBobot,
      totalPct,
      status: status.label,
    };
    aspekList.forEach(aspek => {
      const { bobot, pct } = statusAspek(aspek, scores);
      payload[`aspek_${aspek.key}_bobot`] = bobot;
      payload[`aspek_${aspek.key}_pct`]   = pct;
      aspek.items.forEach(item => {
        payload[item.code] = scores[item.code] || "good";
      });
    });
    return payload;
  };

  const handleDownloadPNG = async () => {
    if (!rekapRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(rekapRef.current, {
        backgroundColor: "#f7f5ee",
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const link = document.createElement("a");
      link.download = `Kesiapan_${tipe.replace(/\s/g,"_")}_${gh.replace(/\s/g,"_")}_${todayISO.replace(/\//g,"-")}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("Download error:", err);
    } finally {
      setDownloading(false);
    }
  };

  const handleSubmit = async () => {
    if (warnIfGHBlocked(gh, blockedMap)) return;
    setSubmitting(true);
    setSubmitError(null);
    const payload = buildPayload();

    if (!isOnline) {
      try {
        await idbAdd(DB_NAME, { key: submittedKey, payload });
        await refreshPendingCount();
        markSubmittedLocal(submittedKey);
        setSubmittedToday(prev => [...new Set([...prev, submittedKey])]);
        clearDraft(); setSavedOffline(true); setStep(4);
      } catch { setSubmitError("Data belum tersimpan di perangkat. Tekan Simpan offline sekali lagi."); }
      finally { setSubmitting(false); }
      return;
    }

    try {
      const json = await gasPost(SCRIPT_URL, payload);
      if (!json.success) throw new Error(json.error || "GAS error");
      markSubmittedLocal(submittedKey);
      setSubmittedToday(prev => [...new Set([...prev, submittedKey])]);
      clearDraft(); setSavedOffline(false); setStep(4);
    } catch (err) {
      setSubmitError(`Data belum terkirim (${err.message}). Cek sinyal lalu tekan Kirim lagi.`);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    clearDraft();
    setStep(1); setTipe(""); setGh(""); setScores({});
    setActiveAspek(""); setSubmitError(null); setSavedOffline(false);
  };

  const closeWarning = () => {
    setShowWarning(false); setPendingGH(""); setShowKodeInput(false); setKodeInput(""); setKodeError("");
  };

  const verifikasiKode = () => {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const kodeHariIni = `${dd}${mm}`;
    if (kodeInput === kodeHariIni) {
      doSelectGH(pendingGH);
      setShowKodeInput(false);
      setKodeInput("");
      setKodeError("");
    } else {
      setKodeError("Kode salah. Hubungi Team Data untuk kode hari ini.");
    }
  };

  // Aspek aktif default ke aspek pertama — draft yang dipulihkan tidak menyimpan tab aktif
  const activeKey       = activeAspek || aspekList[0]?.key || "";
  const activeIdx       = aspekList.findIndex(a => a.key === activeKey);
  const activeAspekData = aspekList[activeIdx];
  const nextAspek       = aspekList[activeIdx + 1];
  const isFilledItem    = (code) => scores[code] !== null && scores[code] !== undefined;
  const goodCount       = allItems.filter(i => scores[i.code] === "good").length;
  const notGoodCount    = allItems.filter(i => scores[i.code] === "notgood").length;

  const goToAspek = (key) => { setActiveAspek(key); window.scrollTo(0, 0); };

  // ── Header ──
  const title = step === 2 || step === 3 ? `Kesiapan · ${gh}` : "Kesiapan GH";
  const subtitle = step === 1
    ? `${formatTanggal()} · Langkah 1 dari 3`
    : step === 4
      ? formatTanggal()
      : `${tipe} · Langkah ${step} dari 3`;
  const onBack = step === 2 ? () => setStep(1) : step === 3 ? () => { setStep(2); setSubmitError(null); } : undefined;

  // ── Footer ──
  let footer = null;
  if (step === 2) {
    footer = (
      <button type="button" className="fh-btn fh-btn-primary" disabled={!allFilled} onClick={() => setStep(3)}>
        {allFilled ? "Lihat rekap" : `${allItems.length - filledCount} variabel belum dinilai`}
      </button>
    );
  } else if (step === 3) {
    footer = (
      <div className="fh-btn-row">
        <button type="button" className="fh-btn fh-btn-secondary" onClick={() => { setStep(2); setSubmitError(null); }}>Kembali</button>
        <button type="button" className="fh-btn fh-btn-primary" disabled={submitting} onClick={handleSubmit}>
          {submitting ? "Mengirim…" : !isOnline ? "Simpan offline" : "Kirim penilaian"}
        </button>
      </div>
    );
  } else if (step === 4) {
    footer = <button type="button" className="fh-btn fh-btn-secondary" onClick={resetForm}>Cek GH lain</button>;
  }

  // ─── RENDER ────────────────────────────────────────────────
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
          {isSyncingPending ? "Mengirim data tertunda…" : `${pendingCount} penilaian tersimpan offline, belum terkirim.`}
        </FieldAlert>
      )}

      {/* ══ STEP 1 — Pilih Tipe & GH ══ */}
      {step === 1 && (
        <>
          <section className="fh-section">
            <span className="fh-label">Tipe GH</span>
            <SegmentTabs
              label="Tipe GH"
              value={tipe}
              onChange={handleSelectTipe}
              tabs={TIPE_LIST.map(t => ({ key: t, label: t }))}
            />
            <p className="fh-hint">Daftar variabel penilaian mengikuti tipe GH.</p>
          </section>

          {tipe ? (
            <>
              <section className="fh-section">
                <div className="fh-section-head">
                  <span className="fh-label">Pilih GH</span>
                  {loadingSubmitted && <span className="fh-meta">mengecek status…</span>}
                </div>
              </section>
              <GHPicker
                selected={gh}
                onSelect={handleSelectGH}
                items={(GH_PER_TIPE[tipe] || []).map(g => {
                  const sudahIsi = submittedToday.includes(`${tipe}__${g}`);
                  const blockedInfo = blockedMap[g.trim().toUpperCase()];
                  const badges = [];
                  if (blockedInfo) badges.push({ label: blockedInfo.aksi, tone: "danger" });
                  if (sudahIsi) badges.push({ label: "Sudah dicek", tone: "success" });
                  return { gh: g, badges, done: sudahIsi };
                })}
              />
            </>
          ) : (
            <p className="fh-empty">Pilih tipe GH dulu.</p>
          )}
        </>
      )}

      {/* ══ STEP 2 — Penilaian ══ */}
      {step === 2 && (
        <>
          <section className="fh-section">
            <div className="fh-section-head">
              <span className="fh-label">Penilaian</span>
              <span className="fh-meta">{filledCount}/{allItems.length} variabel</span>
            </div>
            <div className="fh-bar">
              <span style={{ width: `${allItems.length > 0 ? (filledCount / allItems.length) * 100 : 0}%` }} />
            </div>
          </section>

          <SegmentTabs
            label="Aspek"
            value={activeKey}
            onChange={setActiveAspek}
            tabs={aspekList.map(a => ({
              key: a.key,
              label: a.label,
              count: `${a.items.filter(i => isFilledItem(i.code)).length}/${a.items.length}`,
            }))}
          />

          {activeAspekData && (
            <section className="fh-section">
              {activeAspekData.items.map(item => {
                const val = scores[item.code];
                return (
                  <div key={item.code} className={`fh-card fh-check-item${val === "notgood" ? " is-bad" : ""}`}>
                    <span className="fh-check-label">{item.label}</span>
                    <GoodNotGood label={item.label} value={val} onChange={v => setScore(item.code, v)} />
                  </div>
                );
              })}
              {nextAspek && activeAspekData.items.every(i => isFilledItem(i.code)) && (
                <button type="button" className="fh-btn fh-btn-secondary" onClick={() => goToAspek(nextAspek.key)}>
                  Aspek berikut: {nextAspek.label}
                </button>
              )}
            </section>
          )}
        </>
      )}

      {/* ══ STEP 3 — Rekap ══ */}
      {step === 3 && (
        <>
          {/* Konten yang ikut di-download sebagai PNG */}
          <div ref={rekapRef} className="fh-section" style={{ gap: 12, padding: 4 }}>
            <div className="fh-card fh-card-body" style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <img src="/logo-farmhill.png" alt="Farmhill" style={{ height: 36 }} />
              <div>
                <div className="fh-card-title">Laporan kesiapan greenhouse</div>
                <div className="fh-meta">PT. Kebun Bumi Lestari · {formatTanggal()}</div>
              </div>
            </div>

            <ReviewTable
              title="Informasi umum"
              info={[
                ["Tanggal", formatTanggal()],
                ["Operator", user?.nama || "-"],
                ["Tipe GH", tipe],
                ["Greenhouse", gh],
              ]}
            />

            <ReviewTable
              title="Rekap per aspek"
              columns={[
                { key: "aspek", label: "Aspek" },
                { key: "good", label: "Good", num: true },
                { key: "notgood", label: "Not good", num: true },
              ]}
              rows={aspekList.map(a => {
                const ng = a.items.filter(i => scores[i.code] === "notgood").length;
                return {
                  key: a.key,
                  aspek: a.label,
                  good: a.items.filter(i => scores[i.code] === "good").length,
                  notgood: ng > 0 ? <span className="fh-badge fh-badge-danger">{ng}</span> : 0,
                };
              })}
              footer={{ aspek: "Total", good: goodCount, notgood: notGoodCount }}
            />

            {notGoodCount > 0 && (
              <ReviewTable
                title="Variabel not good"
                info={aspekList.flatMap(a => a.items
                  .filter(i => scores[i.code] === "notgood")
                  .map(i => [i.label, a.label]))}
              />
            )}
          </div>

          <button type="button" className="fh-btn fh-btn-secondary" disabled={downloading} onClick={handleDownloadPNG}>
            <Icon name="Download" size={18} /> {downloading ? "Menyimpan gambar…" : "Download laporan PNG"}
          </button>

          {submitError && <FieldAlert tone="danger">{submitError}</FieldAlert>}
        </>
      )}

      {/* ══ STEP 4 — Sukses ══ */}
      {step === 4 && (
        <SuccessState
          offline={savedOffline}
          title={savedOffline ? "Tersimpan di perangkat" : `Kesiapan ${gh} terkirim`}
          description={savedOffline ? "Terkirim otomatis ke sheet saat online." : "Data masuk ke sheet."}
          summary={[
            ["GH", `${tipe} · ${gh}`],
            ["Good", goodCount],
            ["Not good", notGoodCount],
            ["Operator", user?.nama || "-"],
          ]}
        />
      )}

      {/* ── GH sudah dicek hari ini: isi ulang perlu kode akses dari Team Data ── */}
      <Dialog
        open={showWarning}
        title="GH sudah dicek hari ini"
        onClose={closeWarning}
        actions={!showKodeInput ? (
          <div className="fh-section">
            <a
              className="fh-btn fh-btn-primary"
              style={{ textDecoration: "none" }}
              href={`https://wa.me/08559932224?text=${encodeURIComponent(`Halo Team Data, saya ${user?.nama} ingin melaporkan kesalahan input pada Kesiapan GH.\nTipe: ${tipe}\nGreenhouse: ${pendingGH}\nTanggal: ${todayISO}\n\nMohon kode akses untuk pengisian ulang. Terima kasih.`)}`}
              target="_blank"
              rel="noreferrer"
            >
              Minta kode lewat WhatsApp
            </a>
            <button type="button" className="fh-btn fh-btn-secondary" onClick={() => setShowKodeInput(true)}>Sudah punya kode akses</button>
            <button type="button" className="fh-btn fh-btn-secondary" onClick={closeWarning}>Batal</button>
          </div>
        ) : (
          <div className="fh-btn-row">
            <button type="button" className="fh-btn fh-btn-secondary" onClick={() => { setShowKodeInput(false); setKodeInput(""); setKodeError(""); }}>Kembali</button>
            <button type="button" className="fh-btn fh-btn-primary" onClick={verifikasiKode}>Verifikasi</button>
          </div>
        )}
      >
        {!showKodeInput ? (
          <>{tipe} · {pendingGH} sudah dikirim hari ini. Bila ada salah input, minta kode akses ke Team Data untuk mengisi ulang.</>
        ) : (
          <div className="fh-section">
            <span>Masukkan kode akses dari Team Data.</span>
            <input
              className={`fh-input is-number${kodeError ? " is-error" : ""}`}
              style={{ textAlign: "center", letterSpacing: "0.3em" }}
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={kodeInput}
              onChange={e => { setKodeInput(e.target.value.replace(/\D/g, "")); setKodeError(""); }}
              placeholder="4 digit"
              aria-label="Kode akses"
            />
            {kodeError && <p className="fh-error-text">{kodeError}</p>}
          </div>
        )}
      </Dialog>
    </FormShell>
  );
}
