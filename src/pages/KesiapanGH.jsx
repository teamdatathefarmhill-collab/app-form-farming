import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../hooks/useAuth";
import { idbAdd, idbGetAll, idbDelete, idbCount } from "../utils/idb";
import html2canvas from "html2canvas";
import ConfirmSubmitModal from "../components/ConfirmSubmitModal";

const DB_NAME    = "KesiapanOfflineDB";
const SCRIPT_URL = import.meta.env.VITE_GAS_KESIAPAN_URL;

const todayISO   = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
const todayLabel = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

// ─── Data GH per Tipe ────────────────────────────────────────
const GH_PER_TIPE = {
  "Dutch Bucket": ["TOHUDAN 15","TOHUDAN 16","TOHUDAN 17","TOHUDAN 18","TOHUDAN 19","TOHUDAN 20","TOHUDAN 21"],
  "Drip":         ["BERGAS 1","BERGAS 2","BERGAS 3","BERGAS 4","BERGAS 5","BERGAS 7","BERGAS 8","COLOMADU 1","COLOMADU 2","COLOMADU 3","COLOMADU 4"],
  "Kolam P1":     ["TOHUDAN 1","TOHUDAN 2","TOHUDAN 3","TOHUDAN 4","TOHUDAN 5","TOHUDAN 6","TOHUDAN 7","TOHUDAN 8","TOHUDAN 9","TOHUDAN 10","TOHUDAN 11","TOHUDAN 12","TOHUDAN 13","TOHUDAN 14"],
  "Kolam P2":     ["TOHUDAN 1","TOHUDAN 2","TOHUDAN 3","TOHUDAN 4","TOHUDAN 5","TOHUDAN 6","TOHUDAN 7","TOHUDAN 8","TOHUDAN 9","TOHUDAN 10","TOHUDAN 11","TOHUDAN 12","TOHUDAN 13","TOHUDAN 14"],
};

const TIPE_LIST = Object.keys(GH_PER_TIPE);

// ─── Matriks Aspek per Tipe GH ───────────────────────────────
const MATRIKS = {
  "Dutch Bucket": [
    {
      key: "tandon", label: "Tandon", bobotAspek: 20,
      items: [
        { code: "DB_T1",  label: "Tandon dalam keadaan bersih",              bobotVariabel: 3  },
        { code: "DB_T2",  label: "Tidak ada kebocoran tandon",               bobotVariabel: 10 },
        { code: "DB_T3",  label: "Pompa utama berfungsi normal",             bobotVariabel: 15 },
        { code: "DB_T4",  label: "Pressure gauge berfungsi normal",          bobotVariabel: 5  },
        { code: "DB_T5",  label: "Filter air berfungsi normal",              bobotVariabel: 5  },
        { code: "DB_T6",  label: "Filter air dalam kondisi bersih",          bobotVariabel: 5  },
        { code: "DB_T7",  label: "Pompa DO berfungsi normal",                bobotVariabel: 15 },
        { code: "DB_T8",  label: "Nilai DO tandon >5 mg/L",                  bobotVariabel: 15 },
        { code: "DB_T9",  label: "Jumlah lampu UV sesuai (1 lampu)",         bobotVariabel: 2  },
        { code: "DB_T10", label: "Lampu UV menyala normal",                  bobotVariabel: 10 },
        { code: "DB_T11", label: "Instalasi kelistrikan berjalan normal",    bobotVariabel: 15 },
      ],
    },
    {
      key: "inst_input", label: "Instalasi Input", bobotAspek: 20,
      items: [
        { code: "DB_II1",  label: "Stop kran input berfungsi normal",                    bobotVariabel: 5  },
        { code: "DB_II2",  label: "Tidak ada sumbatan dan kebocoran pipa input",         bobotVariabel: 10 },
        { code: "DB_II3",  label: "Tekanan air yang mengalir sesuai standar (1.2 bar)",  bobotVariabel: 10 },
        { code: "DB_II4",  label: "Stop kran PE 16 mm berfungsi normal",                 bobotVariabel: 10 },
        { code: "DB_II5",  label: "Tidak ada kebocoran stop kran PE 16 mm",              bobotVariabel: 5  },
        { code: "DB_II6",  label: "Tidak ada kebocoran selang PE 16 mm",                 bobotVariabel: 10 },
        { code: "DB_II7",  label: "Tekanan air pada pipa PE 16 mm sesuai (≥ 0.3 bar)",  bobotVariabel: 10 },
        { code: "DB_II8",  label: "Seluruh PCJ berfungsi normal (8 L/H)",                bobotVariabel: 15 },
        { code: "DB_II9",  label: "Selang PE 5 mm berfungsi normal",                     bobotVariabel: 15 },
        { code: "DB_II10", label: "Debit input yang masuk ke dalam bucket rata",         bobotVariabel: 10 },
      ],
    },
    {
      key: "inst_penyiraman", label: "Instalasi Penyiraman", bobotAspek: 20,
      items: [
        { code: "DB_IP1", label: "Bucket dalam kondisi layak pakai",              bobotVariabel: 25 },
        { code: "DB_IP2", label: "Tutup bucket dalam kondisi layak pakai",        bobotVariabel: 20 },
        { code: "DB_IP3", label: "Elbow berfungsi normal tidak ada kebocoran",    bobotVariabel: 25 },
        { code: "DB_IP4", label: "Nilai DO bucket >5 mg/L",                       bobotVariabel: 30 },
      ],
    },
    {
      key: "inst_output", label: "Instalasi Output", bobotAspek: 20,
      items: [
        { code: "DB_IO1", label: "Pipa output 2 inch tidak ada kerusakan/kebocoran",    bobotVariabel: 25 },
        { code: "DB_IO2", label: "Aliran output berjalan normal/tidak ada luapan",      bobotVariabel: 25 },
        { code: "DB_IO3", label: "Pipa output 3 inch tidak ada kerusakan/kebocoran",    bobotVariabel: 25 },
        { code: "DB_IO4", label: "Stop kran output berfungsi normal",                   bobotVariabel: 25 },
      ],
    },
    {
      key: "inst_gh", label: "Instalasi Greenhouse", bobotAspek: 20,
      items: [
        { code: "DB_IG1", label: "Bangunan GH dalam kondisi baik",            bobotVariabel: 15 },
        { code: "DB_IG2", label: "Plastik UV & insectnet dalam kondisi baik", bobotVariabel: 20 },
        { code: "DB_IG3", label: "Tidak ada kebocoran talang",                bobotVariabel: 20 },
        { code: "DB_IG4", label: "Weedmat dalam kondisi baik",                bobotVariabel: 15 },
        { code: "DB_IG5", label: "Jumlah tali rambat sesuai kebutuhan",       bobotVariabel: 15 },
        { code: "DB_IG6", label: "Kawat seling dalam kondisi baik",           bobotVariabel: 15 },
      ],
    },
  ],

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
function statusDariPersen(persen) {
  if (persen >= 70) return { label: "Siap Tanam",      warna: "#2e7d32", bg: "#e8f5e9", border: "#a5d6a7" };
  if (persen >= 50) return { label: "Perlu Perbaikan", warna: "#e65100", bg: "#fff3e0", border: "#ffb74d" };
  return               { label: "Tidak Layak",    warna: "#c62828", bg: "#ffebee", border: "#ef9a9a" };
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

  const [step, setStep]           = useState(1);
  const [tipe, setTipe]           = useState("");
  const [gh, setGh]               = useState("");
  const [scores, setScores]       = useState({});
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
  const [confirmOpen, setConfirmOpen]     = useState(false);

  const aspekList   = tipe ? MATRIKS[tipe] : [];
  const allItems    = aspekList.flatMap(a => a.items);
  const filledCount = allItems.filter(i => scores[i.code] !== null).length;
  const allFilled   = allItems.length > 0 && filledCount === allItems.length;
  const totalBobot  = hitungTotalBobot(tipe, scores);
  const maxTotal    = hitungMaxTotal(tipe);
  const totalPct    = maxTotal > 0 ? Math.round((totalBobot / maxTotal) * 100) : 0;
  const status      = statusDariPersen(totalPct);
  const submittedKey = tipe && gh ? `${tipe}__${gh}` : "";

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
        const res  = await fetch(SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(record.payload), redirect: "follow" });
        const json = await res.json();
        if (json.success) { markSubmittedLocal(record.key); await idbDelete(DB_NAME, record.id); }
      } catch {}
    }
    await refreshPendingCount();
    setIsSyncingPending(false);
  }, [refreshPendingCount]);

  const fetchSubmitted = useCallback(async (selectedTipe) => {
    if (!selectedTipe) return;
    setLoadingSubmitted(true);
    try {
      const res  = await fetch(`${SCRIPT_URL}?action=getSubmitted&tipe=${encodeURIComponent(selectedTipe)}&tanggal=${encodeURIComponent(todayISO)}`);
      const json = await res.json();
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

  const handleSelectTipe = (t) => {
    setTipe(t); setGh("");
    setScores(initScores(t));
    setActiveAspek(MATRIKS[t]?.[0]?.key || "");
    setSubmittedToday([]);
    fetchSubmitted(t);
  };

  const handleSelectGH = (g) => {
    if (submittedToday.includes(`${tipe}__${g}`)) { setPendingGH(g); setShowWarning(true); }
    else doSelectGH(g);
  };

  const doSelectGH = (g) => {
    setGh(g); setShowWarning(false); setPendingGH("");
  };

  const setScore = (code, val) => setScores(prev => ({ ...prev, [code]: val }));

  const buildPayload = () => {
    const payload = {
      action: "submitKesiapan",
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
        backgroundColor: "#f5f5f5",
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
    setSubmitting(true);
    setSubmitError(null);
    const payload = buildPayload();

    if (!isOnline) {
      try {
        await idbAdd(DB_NAME, { key: submittedKey, payload });
        await refreshPendingCount();
        markSubmittedLocal(submittedKey);
        setSubmittedToday(prev => [...new Set([...prev, submittedKey])]);
        setSavedOffline(true); setStep(4);
      } catch { setSubmitError("Gagal menyimpan offline. Coba lagi."); }
      finally { setSubmitting(false); }
      return;
    }

    try {
      const res  = await fetch(SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(payload), redirect: "follow" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "GAS error");
      markSubmittedLocal(submittedKey);
      setSubmittedToday(prev => [...new Set([...prev, submittedKey])]);
      setSavedOffline(false); setStep(4);
    } catch (err) {
      setSubmitError("Gagal kirim data. " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setStep(1); setTipe(""); setGh(""); setScores({});
    setActiveAspek(""); setSubmitError(null); setSavedOffline(false);
  };

  const activeAspekData = aspekList.find(a => a.key === activeAspek);

  // ─── RENDER ────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5", fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>

      {/* Header */}
      <div style={{ background: "#004D40", color: "#fff", padding: "14px 16px 10px", position: "sticky", top: 0, zIndex: 10, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, opacity: 0.75, letterSpacing: 1.5, textTransform: "uppercase" }}>Form Kesiapan GH</div>
            <div style={{ fontSize: 13, opacity: 0.65, marginTop: 1 }}>{todayLabel}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {pendingCount > 0 && (
              <button onClick={isOnline ? syncPending : undefined}
                style={{ fontSize: 10, fontWeight: 700, background: isOnline ? "rgba(33,150,243,0.3)" : "rgba(255,179,0,0.3)", border: `1px solid ${isOnline ? "rgba(33,150,243,0.6)" : "rgba(255,179,0,0.6)"}`, color: "#fff", padding: "2px 8px", borderRadius: 20, cursor: isOnline ? "pointer" : "default" }}>
                {isSyncingPending ? "⏳" : "📤"} {pendingCount} pending
              </button>
            )}
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: isOnline ? "#a5d6a7" : "#ef9a9a" }} />
            <span style={{ fontSize: 10, opacity: 0.6 }}>{user?.nama}</span>
          </div>
        </div>
        {step < 4 && (
          <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
            {[1,2,3].map(s => (
              <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: s <= step ? "#80CBC4" : "rgba(255,255,255,0.2)", transition: "background 0.3s" }} />
            ))}
          </div>
        )}
      </div>

      {/* Modal double submit */}
      {showWarning && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 360 }}>
            <div style={{ fontSize: 36, textAlign: "center", marginBottom: 12 }}>⚠️</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#333", textAlign: "center", marginBottom: 8 }}>GH Sudah Dicek Hari Ini</div>
            <div style={{ fontSize: 13, color: "#666", textAlign: "center", marginBottom: 8, lineHeight: 1.5 }}>
              <strong>{tipe} · {pendingGH}</strong> sudah disubmit hari ini.
            </div>

            {!showKodeInput ? (
              <>
                <div style={{ fontSize: 12, color: "#888", textAlign: "center", marginBottom: 20, lineHeight: 1.5 }}>
                  Jika ada kesalahan input, hubungi Team Data untuk konfirmasi dan dapatkan kode akses.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <a href={`https://wa.me/08559932224?text=${encodeURIComponent(`Halo Team Data, saya ${user?.nama} ingin melaporkan kesalahan input pada Kesiapan GH.\nTipe: ${tipe}\nGreenhouse: ${pendingGH}\nTanggal: ${todayISO}\n\nMohon kode akses untuk pengisian ulang. Terima kasih.`)}`}
                    target="_blank" rel="noreferrer"
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: 12, background: "#25D366", border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", textDecoration: "none", boxSizing: "border-box" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/></svg>
                    Hubungi Team Data via WhatsApp
                  </a>
                  <button onClick={() => setShowKodeInput(true)}
                    style={{ padding: 11, background: "#e0f2f1", border: "1px solid #80CBC4", borderRadius: 10, color: "#004D40", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                    Sudah punya kode akses
                  </button>
                  <button onClick={() => { setShowWarning(false); setPendingGH(""); setKodeInput(""); setKodeError(""); }}
                    style={{ padding: 11, background: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: 10, color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                    Kembali
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 12, color: "#888", textAlign: "center", marginBottom: 16, lineHeight: 1.5 }}>
                  Masukkan kode akses dari Team Data untuk melanjutkan.
                </div>
                <input
                  type="number" inputMode="numeric" maxLength={4}
                  value={kodeInput} onChange={e => { setKodeInput(e.target.value); setKodeError(""); }}
                  placeholder="Kode 4 digit"
                  style={{ width: "100%", padding: "12px", textAlign: "center", fontSize: 24, fontWeight: 700, letterSpacing: 8, border: `2px solid ${kodeError ? "#ef9a9a" : "#e0e0e0"}`, borderRadius: 10, outline: "none", boxSizing: "border-box", marginBottom: 8, color: "#333" }}
                />
                {kodeError && (
                  <div style={{ fontSize: 12, color: "#c62828", textAlign: "center", marginBottom: 8 }}>⚠️ {kodeError}</div>
                )}
                <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                  <button onClick={() => { setShowKodeInput(false); setKodeInput(""); setKodeError(""); }}
                    style={{ flex: 1, padding: 11, background: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: 10, color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                    ← Kembali
                  </button>
                  <button onClick={() => {
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
                      setKodeError("Kode salah. Hubungi Team Data.");
                    }
                  }}
                    style={{ flex: 1, padding: 11, background: "#004D40", border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                    Verifikasi
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div style={{ padding: 16 }}>

        {/* ══ STEP 1 — Pilih Tipe & GH ══ */}
        {step === 1 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: "#004D40", marginBottom: 4 }}>Pilih Tipe & Greenhouse</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>Pilih tipe GH terlebih dahulu</div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#00897B", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Tipe GH</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {TIPE_LIST.map(t => (
                  <button key={t} onClick={() => handleSelectTipe(t)}
                    style={{ padding: "12px 16px", borderRadius: 12, cursor: "pointer", textAlign: "left", border: tipe === t ? "2px solid #004D40" : "1.5px solid #e0e0e0", background: tipe === t ? "#e0f2f1" : "#fff", color: tipe === t ? "#004D40" : "#333", fontSize: 14, fontWeight: tipe === t ? 700 : 500, display: "flex", alignItems: "center", justifyContent: "space-between", transition: "all 0.2s" }}>
                    <span>{t}</span>
                    {tipe === t && <span>✓</span>}
                  </button>
                ))}
              </div>
            </div>

            {tipe && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#00897B", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
                  Nama Greenhouse
                  {loadingSubmitted && <span style={{ fontSize: 10, fontWeight: 400, color: "#aaa", marginLeft: 8 }}>memeriksa data...</span>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {GH_PER_TIPE[tipe].map(g => {
                    const sudahIsi = submittedToday.includes(`${tipe}__${g}`);
                    const sel = gh === g;
                    return (
                      <button key={g} onClick={() => handleSelectGH(g)}
                        style={{ padding: "10px 8px", borderRadius: 10, cursor: "pointer", textAlign: "center", border: sel ? "2px solid #004D40" : sudahIsi ? "1px solid #ffb74d" : "1px solid #e0e0e0", background: sel ? "#e0f2f1" : sudahIsi ? "#fff8e1" : "#fff", color: sel ? "#004D40" : "#333", fontSize: 13, fontWeight: sel ? 700 : 500, transition: "all 0.2s" }}>
                        <div>{g}</div>
                        {sudahIsi && <div style={{ fontSize: 10, color: "#e65100", marginTop: 2 }}>✓ Sudah dicek</div>}
                        {sel && !sudahIsi && <div style={{ fontSize: 11, marginTop: 2 }}>✓</div>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ STEP 2 — Penilaian ══ */}
        {step === 2 && (
          <div>
            {/* Badge info */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              <div style={{ background: "#e0f2f1", border: "1px solid #80CBC4", borderRadius: 20, padding: "3px 12px", fontSize: 12, color: "#004D40", fontWeight: 700 }}>{tipe}</div>
              <div style={{ background: "#f5f5f5", borderRadius: 20, padding: "3px 12px", fontSize: 12, color: "#666" }}>{gh}</div>
            </div>

            {/* Progress */}
            <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{filledCount}/{allItems.length} variabel terisi</div>
            <div style={{ background: "#e0e0e0", borderRadius: 4, height: 5, marginBottom: 14, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 4, background: "#00897B", width: `${allItems.length > 0 ? (filledCount / allItems.length) * 100 : 0}%`, transition: "width 0.3s" }} />
            </div>

            {/* Tab Aspek */}
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 14 }}>
              {aspekList.map(a => {
                const katFilled = a.items.every(i => scores[i.code] !== null);
                const isActive  = activeAspek === a.key;
                return (
                  <button key={a.key} onClick={() => setActiveAspek(a.key)}
                    style={{ flexShrink: 0, padding: "6px 12px", borderRadius: 20, border: `1.5px solid ${isActive ? "#004D40" : "#e0e0e0"}`, background: isActive ? "#e0f2f1" : "#fff", color: isActive ? "#004D40" : "#888", fontSize: 11, fontWeight: isActive ? 700 : 400, cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4 }}>
                    {a.label}
                    {katFilled && <span style={{ fontSize: 10 }}>✅</span>}
                  </button>
                );
              })}
            </div>

            {/* Item penilaian */}
            {activeAspekData && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#00897B", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                  {activeAspekData.label}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {activeAspekData.items.map(item => {
                    const val = scores[item.code];
                    return (
                      <div key={item.code} style={{ background: "#fff", border: `1.5px solid ${val === "notgood" ? "#ef9a9a" : val === "good" ? "#a5d6a7" : "#e0e0e0"}`, borderRadius: 12, padding: "10px 12px" }}>
                        <div style={{ fontSize: 12, color: "#333", fontWeight: 500, marginBottom: 8, minHeight: 32, display: "flex", alignItems: "center" }}>{item.label}</div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => setScore(item.code, "good")}
                            style={{ flex: 1, padding: "8px 4px", borderRadius: 8, border: `1.5px solid ${val === "good" ? "#a5d6a7" : "#e0e0e0"}`, background: val === "good" ? "#e8f5e9" : "#fafafa", color: val === "good" ? "#2e7d32" : "#aaa", fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all .15s" }}>
                            Good
                          </button>
                          <button onClick={() => setScore(item.code, "notgood")}
                            style={{ flex: 1, padding: "8px 4px", borderRadius: 8, border: `1.5px solid ${val === "notgood" ? "#ef9a9a" : "#e0e0e0"}`, background: val === "notgood" ? "#ffebee" : "#fafafa", color: val === "notgood" ? "#c62828" : "#aaa", fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all .15s" }}>
                            Not Good
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ STEP 3 — Rekap ══ */}
        {step === 3 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: "#004D40", marginBottom: 4 }}>Rekap Sebelum Submit</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>Pastikan semua data sudah benar</div>

            {/* Konten yang akan di-screenshot */}
            <div ref={rekapRef} style={{ background: "#f5f5f5", padding: 8, borderRadius: 14 }}>

              {/* Header laporan */}
              <div style={{ background: "#004D40", borderRadius: 10, padding: "12px 16px", marginBottom: 10, display: "flex", alignItems: "center", gap: 12 }}>
                <img src="/logo-farmhill.png" alt="Farmhill" style={{ height: 36, borderRadius: 6, background: "#fff", padding: "2px 6px" }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Laporan Kesiapan Greenhouse</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)" }}>PT. Kebun Bumi Lestari · {todayLabel}</div>
                </div>
              </div>

              {/* Info umum */}
              <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#00897B", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>📋 Informasi Umum</div>
                {[["Tanggal", todayISO], ["Operator", user?.nama], ["Tipe GH", tipe], ["Greenhouse", gh]].map(([l, v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f0f0f0" }}>
                    <span style={{ fontSize: 12, color: "#666" }}>{l}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#333" }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Rekap per aspek — hanya Good/Not Good count, tanpa bobot */}
              <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#00897B", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>📋 Rekap Per Aspek</div>
                {aspekList.map(a => {
                  const goodCount    = a.items.filter(i => scores[i.code] === "good").length;
                  const notGoodCount = a.items.filter(i => scores[i.code] === "notgood").length;
                  return (
                    <div key={a.key} style={{ padding: "8px 0", borderBottom: "1px solid #f0f0f0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 12, color: "#333", fontWeight: 500 }}>{a.label}</span>
                        <div style={{ display: "flex", gap: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, background: "#e8f5e9", color: "#2e7d32", border: "1px solid #a5d6a7", borderRadius: 20, padding: "2px 10px" }}>✓ {goodCount} Good</span>
                          {notGoodCount > 0 && (
                            <span style={{ fontSize: 11, fontWeight: 700, background: "#ffebee", color: "#c62828", border: "1px solid #ef9a9a", borderRadius: 20, padding: "2px 10px" }}>✗ {notGoodCount} Not Good</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {/* Total simpel */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, marginTop: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#333" }}>Total</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, background: "#e8f5e9", color: "#2e7d32", border: "1px solid #a5d6a7", borderRadius: 20, padding: "3px 12px" }}>
                      ✓ {allItems.filter(i => scores[i.code] === "good").length} Good
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, background: "#ffebee", color: "#c62828", border: "1px solid #ef9a9a", borderRadius: 20, padding: "3px 12px" }}>
                      ✗ {allItems.filter(i => scores[i.code] === "notgood").length} Not Good
                    </span>
                  </div>
                </div>
              </div>

            </div>{/* end rekapRef */}

            {/* Tombol download PNG */}
            <button onClick={handleDownloadPNG} disabled={downloading}
              style={{ width: "100%", padding: 12, marginBottom: 10, border: "1.5px solid #00897B", borderRadius: 12, background: downloading ? "#e0e0e0" : "#e0f2f1", color: downloading ? "#aaa" : "#004D40", fontSize: 14, fontWeight: 700, cursor: downloading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {downloading ? "⏳ Menyimpan..." : "📥 Download Laporan PNG"}
            </button>

            {submitError && (
              <div style={{ fontSize: 12, color: "#c62828", background: "#ffebee", border: "1px solid #ef9a9a", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>⚠️ {submitError}</div>
            )}
          </div>
        )}

        {/* ══ STEP 4 — Sukses ══ */}
        {step === 4 && (
          <div style={{ textAlign: "center", paddingTop: 32 }}>
            <div style={{ fontSize: 60, marginBottom: 12 }}>{savedOffline ? "💾" : "✅"}</div>
            <div style={{ fontSize: 21, fontWeight: 800, color: savedOffline ? "#1565C0" : "#004D40", marginBottom: 6 }}>
              {savedOffline ? "Tersimpan Lokal!" : "Penilaian Tersimpan!"}
            </div>
            <div style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>
              {savedOffline ? "Otomatis terkirim saat online." : "Data berhasil dikirim ke Google Sheets"}
            </div>
            <div style={{ background: savedOffline ? "#e3f2fd" : "#e0f2f1", border: `1px solid ${savedOffline ? "#90CAF9" : "#80CBC4"}`, borderRadius: 14, padding: 16, textAlign: "left", marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#004D40" }}>{tipe} · {gh}</div>
              <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>Operator: {user?.nama} · {todayISO}</div>
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(0,0,0,0.06)", display: "flex", gap: 10, justifyContent: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 700, background: "#e8f5e9", color: "#2e7d32", border: "1px solid #a5d6a7", borderRadius: 20, padding: "4px 14px" }}>
                  ✓ {allItems.filter(i => scores[i.code] === "good").length} Good
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, background: "#ffebee", color: "#c62828", border: "1px solid #ef9a9a", borderRadius: 20, padding: "4px 14px" }}>
                  ✗ {allItems.filter(i => scores[i.code] === "notgood").length} Not Good
                </span>
              </div>
            </div>
            <button onClick={resetForm} style={{ width: "100%", padding: 15, background: "#e0f2f1", border: "2px solid #80CBC4", borderRadius: 12, color: "#004D40", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              + Cek GH Berikutnya
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
          {step === 1 && (
            <button onClick={() => setStep(2)} disabled={!tipe || !gh}
              style={{ flex: 2, padding: 13, border: "none", borderRadius: 12, background: tipe && gh ? "linear-gradient(135deg,#004D40,#00695C)" : "#e0e0e0", color: tipe && gh ? "#fff" : "#aaa", fontSize: 15, fontWeight: 700, cursor: tipe && gh ? "pointer" : "not-allowed" }}>
              Lanjut Penilaian →
            </button>
          )}
          {step === 2 && (
            <button onClick={() => setStep(3)} disabled={!allFilled}
              style={{ flex: 2, padding: 13, border: "none", borderRadius: 12, background: allFilled ? "linear-gradient(135deg,#004D40,#00695C)" : "#e0e0e0", color: allFilled ? "#fff" : "#aaa", fontSize: 15, fontWeight: 700, cursor: allFilled ? "pointer" : "not-allowed" }}>
              {allFilled ? "Lihat Rekap →" : `⚠️ ${allItems.length - filledCount} belum terisi`}
            </button>
          )}
          {step === 3 && (
            <button onClick={() => setConfirmOpen(true)} disabled={submitting}
              style={{ flex: 2, padding: 13, border: "none", borderRadius: 12, background: submitting ? "#e0e0e0" : !isOnline ? "linear-gradient(135deg,#1565C0,#1976D2)" : "linear-gradient(135deg,#004D40,#00695C)", color: submitting ? "#aaa" : "#fff", fontSize: 15, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer" }}>
              {submitting ? "⏳ Menyimpan..." : !isOnline ? "💾 Simpan Offline" : "Submit Penilaian ✓"}
            </button>
          )}
        </div>
      )}

      <ConfirmSubmitModal
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => { setConfirmOpen(false); handleSubmit(); }}
        color="#00897B"
        isOffline={!isOnline}
        summary={[
          { label: "Tanggal",  value: todayISO },
          { label: "GH",       value: gh },
          { label: "Tipe",     value: tipe },
          { label: "Skor",     value: `${totalPct}% (${status?.label || ""})` },
          { label: "Operator", value: user?.nama || "" },
        ]}
      />

      <style>{`* { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }`}</style>
    </div>
  );
}
