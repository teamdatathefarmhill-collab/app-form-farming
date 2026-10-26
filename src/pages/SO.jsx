import { useState, useEffect, useCallback } from "react";
import { useDraft } from "../hooks/useDraft";
import { useAuth } from "../hooks/useAuth";
import { idbAdd, idbGetAll, idbDelete, idbCount, gasPost } from "../utils/idb";
import { useGHData } from "../hooks/useGHData";
import { useGHBlockedList, warnIfGHBlocked } from "../hooks/useGHBlockedList";
import { useSOHistory, hasCompletedCheckpoint } from "../hooks/useSOHistory";
import { FormShell, FieldAlert, SuccessState, GHPicker, ReviewTable, EntryTable, Dialog, Icon } from "../components/form";
import { formatTanggal, formatAngka } from "../lib/format";

const DB_NAME    = "SOOfflineDB";
const SCRIPT_URL = import.meta.env.VITE_GAS_SO_URL;

// ─── Tipe GH & mapping nama ───────────────────────────────────────────────────
const TIPE_GH = [
  { key: "drip",         label: "Drip"  },
  { key: "kolam",        label: "Kolam" },
];

function buildGHNames() {
  const drip = [
    ...["BERGAS 1","BERGAS 2","BERGAS 3","BERGAS 4","BERGAS 5","BERGAS 7","BERGAS 8"],
    ...["COLOMADU 1","COLOMADU 2","COLOMADU 3","COLOMADU 4"],
    ...["TOHUDAN 14","TOHUDAN 15","TOHUDAN 16","TOHUDAN 17","TOHUDAN 18","TOHUDAN 19","TOHUDAN 20","TOHUDAN 21"],
  ];
  const kolam = [
    ...Array.from({ length: 13 }, (_, i) => `TOHUDAN ${i + 1}`),
    ...["SAWAHAN 1","SAWAHAN 2","SAWAHAN 3","SAWAHAN 4"],
    "TOHUDAN 22","SAWAHAN TUNNEL 1",
  ];
  return { drip, kolam };
}

const GH_NAMES = buildGHNames();

// ─── Varian list ──────────────────────────────────────────────────────────────
const VARIAN_LIST = [
  "Greeniegal","Sunray","Midori","Elysia","Elysia TMY","Emeralda","Aruni",
  "Greenie Sweet","Sarasuka","Daegoji","Sagami","S7","Dalmatian","Lainnya",
];

// ─── Checkpoint SO ────────────────────────────────────────────────────────────
const SO_CHECKPOINT_1 = 35;
const SO_CHECKPOINT_2 = 50;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function hitungHST(tglStr) {
  const cleaned = tglStr?.trim();
  if (!cleaned) return null;

  const BULAN = {
    jan:1, feb:2, mar:3, apr:4, may:5, mei:5, jun:6,
    jul:7, aug:8, agu:8, sep:9, oct:10, okt:10, nov:11, dec:12, des:12,
  };

  let tanam;

  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    const [y, m, d] = cleaned.split("-").map(Number);
    tanam = new Date(y, m - 1, d);
  } else if (/^\d{1,2}-[a-zA-Z]{3}-\d{4}$/.test(cleaned)) {
    const [d, mon, y] = cleaned.split("-");
    const m = BULAN[mon.toLowerCase()];
    if (!m) return null;
    tanam = new Date(parseInt(y), m - 1, parseInt(d));
  } else if (/^\d{1,2}\s+[a-zA-Z]{3,}\s+\d{4}$/.test(cleaned)) {
    const parts = cleaned.split(/\s+/);
    const d = parseInt(parts[0]);
    const mon = parts[1].slice(0, 3).toLowerCase();
    const y = parseInt(parts[2]);
    const m = BULAN[mon];
    if (!m) return null;
    tanam = new Date(y, m - 1, d);
  } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleaned)) {
    const [d, m, y] = cleaned.split("/").map(Number);
    tanam = new Date(y, m - 1, d);
  } else {
    tanam = new Date(cleaned);
  }

  if (!tanam || isNaN(tanam)) return null;
  const now = new Date();
  const nowLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((nowLocal - tanam) / 86400000);
}

// ─── getSOStatus — dengan soHistory check ────────────────────────────────────
// Sekarang menerima soHistory + info GH untuk cek apakah checkpoint sudah
// pernah dipenuhi di periode yang sama. Kalau sudah, tidak dianggap terlambat.
function getSOStatus(hst, soHistory, gh, periode) {
  if (hst === null) return { late: false, checkpoint: null, daysLate: 0 };

  if (hst > SO_CHECKPOINT_1 && hst < SO_CHECKPOINT_2) {
    // Lewat checkpoint 1 — cek apakah sudah pernah submit di window checkpoint 1
    // (HST berapa pun sebelum checkpoint 2 dimulai, termasuk yang telat)
    const alreadyDone = hasCompletedCheckpoint(soHistory, gh, periode, 0, SO_CHECKPOINT_2);
    if (alreadyDone) return { late: false, checkpoint: SO_CHECKPOINT_1, daysLate: 0 };
    return { late: true, checkpoint: SO_CHECKPOINT_1, daysLate: hst - SO_CHECKPOINT_1 };
  }

  if (hst > SO_CHECKPOINT_2) {
    // Lewat checkpoint 2 — cek apakah sudah pernah submit di window checkpoint 2
    // (HST >= 50, termasuk yang telat)
    const alreadyDone = hasCompletedCheckpoint(soHistory, gh, periode, SO_CHECKPOINT_2);
    if (alreadyDone) return { late: false, checkpoint: SO_CHECKPOINT_2, daysLate: 0 };
    return { late: true, checkpoint: SO_CHECKPOINT_2, daysLate: hst - SO_CHECKPOINT_2 };
  }

  return {
    late: false,
    checkpoint: hst === SO_CHECKPOINT_1 || hst === SO_CHECKPOINT_2 ? hst : null,
    daysLate: 0,
  };
}

// Badge HST: H-1 checkpoint = warning, hari H = due (melon), lainnya netral
function hstTone(hst) {
  if (hst === SO_CHECKPOINT_1 - 1 || hst === SO_CHECKPOINT_2 - 1) return "warning";
  if (hst === SO_CHECKPOINT_1 || hst === SO_CHECKPOINT_2) return "due";
  return "neutral";
}

function isSODeadlineAlert(hst) {
  return hst === SO_CHECKPOINT_1 - 1 || hst === SO_CHECKPOINT_1 ||
         hst === SO_CHECKPOINT_2 - 1 || hst === SO_CHECKPOINT_2;
}

function isSOAktif(hst) {
  return hst !== null && hst >= 1 && hst < 65;
}

const LS_KEY_PREFIX = "so_submitted_";
function getLSKey() {
  return LS_KEY_PREFIX + new Date().toLocaleDateString("id-ID");
}
function getSubmittedToday() {
  try { return JSON.parse(localStorage.getItem(getLSKey()) || "[]"); } catch { return []; }
}
function markSubmitted(gh) {
  const list = getSubmittedToday();
  if (!list.includes(gh)) localStorage.setItem(getLSKey(), JSON.stringify([...list, gh]));
}

const todayISO   = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
const todayTimestamp = () => new Date().toLocaleString("id-ID");


// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function SO() {
  const { user } = useAuth();
  const { getDraft, saveDraft, clearDraft } = useDraft("so");
  const _draft = getDraft();

  const [step, setStep]         = useState(_draft?.step || 1);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const { ghData, loading: loadingRef, isDemoMode, refetch: fetchRefData } = useGHData();
  const { blockedMap } = useGHBlockedList();
  const { soHistory, loading: loadingHistory, refetch: fetchSOHistory }    = useSOHistory();

  const [selectedGH, setSelectedGH]     = useState(_draft?.selectedGH || "");
  const [tableData, setTableData]       = useState(_draft?.tableData  || []);
  // Operator otomatis dari akun login; bisa diubah di langkah rekap
  const [operator, setOperator]         = useState(_draft?.operator || user?.nama || "");
  const [keterangan, setKeterangan]     = useState(_draft?.keterangan || "");

  const [syncing, setSyncing]           = useState(false);
  const [syncProgress, setSyncProgress] = useState({ done: 0, total: 0 });
  const [submitError, setSubmitError]   = useState(null);
  const [savedOffline, setSavedOffline] = useState(false);
  const [copyDone, setCopyDone]         = useState(false);

  const [submittedToday, setSubmittedToday] = useState(getSubmittedToday());
  const [showDoubleWarn, setShowDoubleWarn] = useState(false);
  const [pendingGH, setPendingGH]           = useState("");

  const [pendingCount, setPendingCount]         = useState(0);
  const [isSyncingPending, setIsSyncingPending] = useState(false);

  // useAuth membaca sessionStorage setelah render pertama → isi operator begitu nama tersedia
  useEffect(() => {
    if (user?.nama) setOperator(prev => prev || user.nama);
  }, [user?.nama]);

  // ── Online/offline listener ──
  useEffect(() => {
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online",  on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => {
    if (step === 4) return;
    saveDraft({ step, selectedGH, tableData, operator, keterangan });
  }, [step, selectedGH, tableData, operator, keterangan]);

  const refreshPendingCount = useCallback(async () => {
    try { setPendingCount(await idbCount(DB_NAME)); } catch { setPendingCount(0); }
  }, []);

  useEffect(() => { refreshPendingCount(); }, [refreshPendingCount]);

  // ── Auto-sync saat kembali online ──
  useEffect(() => {
    if (isOnline) {
      syncPendingData();
      fetchSOHistory(); // refresh SO history saat online kembali
    }
  }, [isOnline]);

  // ── Sync pending offline ──
  const syncPendingData = useCallback(async () => {
    const allPending = await idbGetAll(DB_NAME);
    if (allPending.length === 0) return;
    setIsSyncingPending(true);
    for (const record of allPending) {
      try {
        await gasPost(SCRIPT_URL, { action: "submitSOBatch", rows: record.payloads });
        markSubmitted(record.gh);
        setSubmittedToday(getSubmittedToday());
        await idbDelete(DB_NAME, record.id);
      } catch {
        // Gagal sync record ini, skip — coba lagi nanti
      }
    }
    await refreshPendingCount();
    setIsSyncingPending(false);
  }, [refreshPendingCount]);

  // ── Helper: getSOStatus dengan soHistory ──
  // Wrapper agar tidak perlu pass soHistory manual setiap kali
  const getStatus = useCallback((hst, gh, periode) => {
    return getSOStatus(hst, soHistory, gh, periode);
  }, [soHistory]);

  // ── GH aktif per tipe ──
  const ghAktifPerTipe = useCallback((tipe) => {
    const names = GH_NAMES[tipe] || [];
    return names
      .filter(name => {
        const info = ghData[name];
        if (!info) return false;
        const hst = hitungHST(info.tanam);
        return isSOAktif(hst);
      })
      .map(name => {
        const info = ghData[name];
        const hst  = hitungHST(info.tanam);
        return { name, ...info, hst };
      });
  }, [ghData]);

  // ── Reminder banner ──
  const reminderGH = useCallback(() => {
    const result = [];
    for (const tipe of TIPE_GH) {
      for (const gh of ghAktifPerTipe(tipe.key)) {
        const st = getStatus(gh.hst, gh.name, gh.periode);
        if (gh.hst === SO_CHECKPOINT_1 - 1 || gh.hst === SO_CHECKPOINT_2 - 1) {
          result.push({ ...gh, reminderType: "h1" });
        } else if (gh.hst === SO_CHECKPOINT_1 || gh.hst === SO_CHECKPOINT_2) {
          if (!submittedToday.includes(gh.name)) result.push({ ...gh, reminderType: "hariH" });
        } else if (st.late) {
          if (!submittedToday.includes(gh.name)) {
            result.push({ ...gh, reminderType: "late", daysLate: st.daysLate, checkpoint: st.checkpoint });
          }
        }
      }
    }
    return result;
  }, [ghAktifPerTipe, submittedToday, getStatus]);

  // ── Pilih GH ──
  const handleSelectGH = (gh) => {
    if (warnIfGHBlocked(gh, blockedMap)) return;
    if (submittedToday.includes(gh)) {
      setPendingGH(gh); setShowDoubleWarn(true);
    } else {
      doSelectGH(gh);
    }
  };

  const doSelectGH = (gh) => {
    setSelectedGH(gh);
    const info = ghData[gh];
    setTableData((info?.baris || []).map(b => ({ baris: b.baris, varian: b.varian, populasi: "", isManual: false })));
    setKeterangan("");
    setShowDoubleWarn(false);
    setPendingGH("");
    setStep(2);
  };

  // ── Tabel helpers ──
  const updatePopulasi = (i, val) => {
    if (val !== "" && !/^\d+$/.test(val)) return;
    setTableData(prev => { const d = [...prev]; d[i] = { ...d[i], populasi: val }; return d; });
  };

  const updateManualField = (i, field, val) => {
    setTableData(prev => { const d = [...prev]; d[i] = { ...d[i], [field]: val }; return d; });
  };

  const addManualRow = () => {
    setTableData(prev => [...prev, { baris: "", varian: "", populasi: "", isManual: true }]);
  };

  const removeManualRow = (i) => {
    setTableData(prev => prev.filter((_, idx) => idx !== i));
  };

  // ── Derived values ──
  const ghInfo    = ghData[selectedGH];
  const hstAktif  = ghInfo?.tanam ? hitungHST(ghInfo.tanam) : null;
  const soStatus  = getStatus(hstAktif, selectedGH, ghInfo?.periode);
  const reminders = reminderGH();

  // ── Validasi ──
  const normalRows      = tableData.filter(r => !r.isManual);
  const manualRows      = tableData.filter(r => r.isManual);
  const filledNormal    = normalRows.filter(r => r.populasi !== "").length;
  const filledManual    = manualRows.filter(r => r.baris.trim() && r.varian && r.populasi !== "").length;
  const totalRows       = tableData.length;
  const filledCount     = filledNormal + filledManual;
  const allNormalFilled = normalRows.length > 0 && filledNormal === normalRows.length;
  const manualOK        = manualRows.every(r => r.baris.trim() && r.varian && r.populasi !== "");
  const keteranganOK    = !soStatus.late || keterangan.trim().length > 0;
  const canProceed      = allNormalFilled && manualOK && keteranganOK;
  // data GH harus sudah termuat — periode/HST/status terlambat diambil dari situ
  const canSubmit       = canProceed && operator.trim().length > 0 && !loadingRef && !loadingHistory;
  const rowsTerisi      = tableData.filter(r => r.populasi !== "").length;

  // ── Ringkasan per baris & total per varian (untuk kartu ringkasan + teks grup) ──
  const totalPerVarian = {};
  let totalAll = 0;
  tableData.forEach(r => {
    if (r.populasi === "") return;
    const pop = parseInt(r.populasi) || 0;
    const v   = r.varian || "Tidak diketahui";
    totalPerVarian[v] = (totalPerVarian[v] || 0) + pop;
    totalAll += pop;
  });
  const totalVarianSorted = Object.entries(totalPerVarian).sort((a, b) => b[1] - a[1]);

  const barisGroup = {};
  const barisOrder = [];
  tableData.forEach(r => {
    if (r.populasi === "") return;
    const barisKey = r.baris.replace(/\d+$/, "").trim() || r.baris;
    if (!barisGroup[barisKey]) {
      barisGroup[barisKey] = {};
      barisOrder.push(barisKey);
    }
    const v = r.varian || "?";
    barisGroup[barisKey][v] = (barisGroup[barisKey][v] || 0) + (parseInt(r.populasi) || 0);
  });

  const lines = barisOrder.map(baris => {
    const parts = Object.entries(barisGroup[baris]).map(([v, p]) => `${v} ${p}`).join(" ");
    return `${baris} ${parts}`;
  });

  const totalLines = totalVarianSorted.map(([v, t]) => `${v}: ${t.toLocaleString("id-ID")} tanaman`);

  const clipboardText = [
    `SO ${selectedGH} - ${todayISO}`,
    `Periode ${ghData[selectedGH]?.periode || ""} | ${hstAktif ?? ""} HST`,
    ...(soStatus.late ? [`TERLAMBAT ${soStatus.daysLate} hari dari checkpoint HST ${soStatus.checkpoint}${keterangan.trim() ? ` — Alasan: ${keterangan.trim()}` : ""}`] : []),
    "",
    ...lines,
    "",
    "--- TOTAL PER VARIAN ---",
    ...totalLines,
    `TOTAL: ${totalAll.toLocaleString("id-ID")} tanaman`,
  ].join("\n");

  // ── Build payloads ──
  const buildPayloads = () => {
    const ghInfoP           = ghData[selectedGH];
    const hst               = ghInfoP?.tanam ? hitungHST(ghInfoP.tanam) : "";
    const ts                = todayTimestamp();
    const client_timestamp  = new Date().toISOString();
    const ketFinal          = soStatus.late ? keterangan.trim() : "";
    return tableData
      .filter(r => r.populasi !== "")
      .map(r => ({
        action:           "submitSOBatch",
        client_timestamp: client_timestamp,
        timestamp:        ts,
        tanggal:          todayISO,
        operator:         operator.trim(),
        greenhouse:       selectedGH,
        periode:          ghInfoP?.periode || "",
        hst:              hst ?? "",
        baris:            r.baris,
        varian:           r.varian,
        populasi:         parseInt(r.populasi) || 0,
        keterangan:       ketFinal,
      }));
  };

  // ── Submit ──
  const handleSubmit = async () => {
    if (warnIfGHBlocked(selectedGH, blockedMap)) return;
    setSyncing(true);
    setSubmitError(null);
    const payloads = buildPayloads();
    setSyncProgress({ done: 0, total: payloads.length });

    // Demo mode
    if (isDemoMode) {
      for (let i = 0; i < payloads.length; i++) {
        await new Promise(r => setTimeout(r, 60));
        setSyncProgress({ done: i + 1, total: payloads.length });
      }
      markSubmitted(selectedGH);
      setSubmittedToday(getSubmittedToday());
      setStep(4);
      setSyncing(false);
      return;
    }

    // Offline
    if (!isOnline) {
      try {
        await idbAdd(DB_NAME, { gh: selectedGH, tanggal: todayISO, createdAt: Date.now(), payloads });
        await refreshPendingCount();
        markSubmitted(selectedGH);
        setSubmittedToday(getSubmittedToday());
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

    // Online
    setSavedOffline(false);
    try {
      setSyncProgress({ done: 0, total: payloads.length });
      await gasPost(SCRIPT_URL, { action: "submitSOBatch", rows: payloads });
      setSyncProgress({ done: payloads.length, total: payloads.length });
      markSubmitted(selectedGH);
      setSubmittedToday(getSubmittedToday());
      clearDraft();
      // Refresh SO history setelah submit berhasil supaya status langsung update
      fetchSOHistory();
      setStep(4);
    } catch {
      setSubmitError("Data belum terkirim karena koneksi terputus. Cek sinyal lalu tekan Kirim lagi.");
    } finally {
      setSyncing(false);
    }
  };

  const resetForm = () => {
    clearDraft();
    setStep(1); setSelectedGH(""); setTableData([]);
    setOperator(user?.nama || ""); setKeterangan(""); setSyncing(false); setSyncProgress({ done: 0, total: 0 });
    setSubmitError(null); setSavedOffline(false); setCopyDone(false);
  };

  const copyText = () => {
    navigator.clipboard.writeText(clipboardText).then(() => {
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 1400);
    }).catch(() => {});
  };

  const loadingAll = loadingRef || loadingHistory;

  // ── Pengingat langkah 1 ──
  const deadline = reminders.filter(r => r.reminderType === "h1" || r.reminderType === "hariH");
  const late1    = reminders.filter(r => r.reminderType === "late" && r.checkpoint === SO_CHECKPOINT_1).sort((a, b) => b.daysLate - a.daysLate);
  const late2    = reminders.filter(r => r.reminderType === "late" && r.checkpoint === SO_CHECKPOINT_2).sort((a, b) => b.daysLate - a.daysLate);

  // ── Header ──
  const title = step === 2 || step === 3 ? `SO · ${selectedGH}` : "Stock opname";
  const ghMeta = [ghInfo?.periode && `P${ghInfo.periode}`, hstAktif !== null && `${hstAktif} HST`].filter(Boolean).join(" · ");
  const subtitle = step === 1
    ? `${formatTanggal()} · Langkah 1 dari 3`
    : step === 4
      ? formatTanggal()
      : `${ghMeta ? `${ghMeta} · ` : ""}Langkah ${step} dari 3`;
  const backTo1 = () => { setStep(1); setSubmitError(null); };
  const onBack = step === 2 ? backTo1 : step === 3 ? () => { setStep(2); setSubmitError(null); } : undefined;

  // ── Footer ──
  let footer = null;
  if (step === 2) {
    let label = "Lihat rekap";
    if (!allNormalFilled) label = `${normalRows.length - filledNormal} baris belum diisi`;
    else if (!manualOK) label = "Lengkapi baris manual";
    else if (!keteranganOK) label = "Isi alasan terlambat";
    footer = (
      <button type="button" className="fh-btn fh-btn-primary" disabled={!canProceed} onClick={() => setStep(3)}>
        {label}
      </button>
    );
  } else if (step === 3) {
    const sendLabel = syncing
      ? `Mengirim… ${syncProgress.done}/${syncProgress.total}`
      : loadingRef || loadingHistory ? "Memuat data GH…"
      : isDemoMode ? "Kirim demo"
      : !isOnline ? `Simpan offline (${rowsTerisi} baris)`
      : `Kirim ${rowsTerisi} baris`;
    footer = (
      <div className="fh-btn-row">
        <button type="button" className="fh-btn fh-btn-secondary" onClick={() => { setStep(2); setSubmitError(null); }}>Kembali</button>
        <button type="button" className="fh-btn fh-btn-primary" disabled={!canSubmit || syncing} onClick={handleSubmit}>{sendLabel}</button>
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

      {/* ══ STEP 1 — Pilih GH ══ */}
      {step === 1 && (
        <>
          {isDemoMode && (
            <FieldAlert tone="warning" action={{ label: "Coba lagi", onClick: fetchRefData }}>
              Data REF tidak terjangkau. Menampilkan data demo, data tidak dikirim ke sheet.
            </FieldAlert>
          )}

          {!loadingAll && deadline.length > 0 && (
            <FieldAlert tone="warning">
              <strong>Deadline SO ({deadline.length} GH):</strong>{" "}
              {deadline.map(gh => `${gh.name} (${gh.reminderType === "hariH" ? "hari ini" : "besok"})`).join(", ")}
            </FieldAlert>
          )}
          {!loadingAll && [[SO_CHECKPOINT_1, late1], [SO_CHECKPOINT_2, late2]].map(([cp, list]) => list.length > 0 && (
            <FieldAlert key={cp} tone="danger">
              <strong>Lewat checkpoint HST {cp} ({list.length} GH):</strong>{" "}
              {list.map(gh => `${gh.name} (+${gh.daysLate} hari)`).join(", ")}
            </FieldAlert>
          ))}

          <section className="fh-section">
            <span className="fh-label">Pilih GH</span>
            <p className="fh-hint">Stock opname dilakukan pada checkpoint HST {SO_CHECKPOINT_1} dan HST {SO_CHECKPOINT_2}.</p>
          </section>

          <GHPicker
            loading={loadingAll}
            selected={selectedGH}
            onSelect={handleSelectGH}
            emptyText="Tidak ada GH aktif untuk SO saat ini."
            items={TIPE_GH.flatMap(tipe => ghAktifPerTipe(tipe.key).map(gh => {
              const lateInfo = getStatus(gh.hst, gh.name, gh.periode);
              const sudahIsi = submittedToday.includes(gh.name);
              const blockedInfo = blockedMap[gh.name.trim().toUpperCase()];
              const badges = [];
              if (blockedInfo) badges.push({ label: blockedInfo.aksi, tone: "danger" });
              if (sudahIsi) badges.push({ label: "Sudah diisi", tone: "success" });
              else if (lateInfo.late) badges.push({ label: `Terlambat ${lateInfo.daysLate} hari`, tone: "danger" });
              else if (isSODeadlineAlert(gh.hst)) badges.push({ label: "Deadline", tone: "due" });
              if (gh.hst !== null) badges.push({ label: `${gh.hst} HST`, tone: hstTone(gh.hst) });
              return {
                gh: gh.name,
                meta: `${tipe.label} · ${gh.periode ? `P${gh.periode} · ` : ""}${gh.baris?.length || 0} baris`,
                badges,
                done: sudahIsi,
                urgent: !sudahIsi && (lateInfo.late || isSODeadlineAlert(gh.hst)),
                sortValue: gh.hst,
              };
            }))}
          />
        </>
      )}

      {/* ══ STEP 2 — Form Input ══ */}
      {step === 2 && (
        <>
          {soStatus.late && (
            <section className="fh-section">
              <FieldAlert tone="danger">
                SO ini terlambat {soStatus.daysLate} hari dari checkpoint HST {soStatus.checkpoint}. Isi alasannya sebelum lanjut.
              </FieldAlert>
              <label className="fh-section">
                <span className="fh-label">Alasan terlambat (wajib)</span>
                <textarea
                  className={`fh-textarea${keterangan.trim() ? "" : " is-error"}`}
                  rows={3}
                  value={keterangan}
                  onChange={e => setKeterangan(e.target.value)}
                  placeholder={`Kenapa SO terlambat ${soStatus.daysLate} hari dari checkpoint HST ${soStatus.checkpoint}`}
                />
              </label>
            </section>
          )}

          <section className="fh-section">
            <div className="fh-section-head">
              <span className="fh-label">Populasi per baris</span>
              <span className="fh-meta">{filledCount}/{totalRows} baris</span>
            </div>
            <div className="fh-bar">
              <span style={{ width: `${totalRows > 0 ? (filledCount / totalRows) * 100 : 0}%` }} />
            </div>
          </section>

          <EntryTable
            columns={[
              { key: "baris", label: "Baris · varian" },
              { key: "populasi", label: "Populasi", width: 100, input: true, inputMode: "numeric" },
            ]}
            rows={tableData}
            rowKey={(row, i) => `${i}`}
            onChange={(i, _key, val) => updatePopulasi(i, val)}
            isRowDone={(row) => row.isManual ? !!(row.baris.trim() && row.varian && row.populasi !== "") : row.populasi !== ""}
            renderCell={(row, col, i) => {
              if (!row.isManual) {
                return (
                  <>
                    <span className="fh-row-label">{row.baris}</span>
                    <span className="fh-row-sub">{row.varian}</span>
                  </>
                );
              }
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      className={`fh-input${row.baris.trim() ? "" : " is-error"}`}
                      style={{ width: 72 }}
                      value={row.baris}
                      onChange={e => updateManualField(i, "baris", e.target.value)}
                      placeholder="Baris"
                      aria-label="Nama baris manual"
                    />
                    <span className="fh-tag">manual</span>
                    <button type="button" className="fh-icon-btn is-danger" style={{ marginLeft: "auto" }} onClick={() => removeManualRow(i)} aria-label="Hapus baris manual">
                      <Icon name="X" />
                    </button>
                  </div>
                  <select
                    className={`fh-select${row.varian ? "" : " is-empty"}`}
                    value={row.varian}
                    onChange={e => updateManualField(i, "varian", e.target.value)}
                    aria-label="Varian baris manual"
                  >
                    <option value="">Pilih varian</option>
                    {VARIAN_LIST.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              );
            }}
          />

          <button type="button" className="fh-dashed-btn" onClick={addManualRow}>
            <Icon name="Plus" size={18} /> Baris / varian tidak terdaftar
          </button>

          {filledCount > 0 && (
            <div className="fh-card is-sunken fh-card-body">
              <div className="fh-section-head">
                <span className="fh-overline">Total per varian</span>
                <span className="fh-meta">{formatAngka(totalAll)} tanaman</span>
              </div>
              {totalVarianSorted.map(([v, t]) => (
                <div key={v} className="fh-section-head" style={{ fontSize: 15 }}>
                  <span>{v}</span>
                  <span className="fh-num">{formatAngka(t)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ══ STEP 3 — Rekap ══ */}
      {step === 3 && (
        <>
          <label className="fh-section">
            <span className="fh-label">Operator</span>
            <input
              className={`fh-input${operator.trim() ? "" : " is-error"}`}
              value={operator}
              onChange={e => setOperator(e.target.value)}
              placeholder="Nama operator"
            />
            <p className="fh-hint">Terisi dari akun login. Ubah bila yang mengisi orang lain.</p>
          </label>

          <ReviewTable
            title="Rekap"
            info={[
              ["Tanggal", formatTanggal()],
              ["GH", selectedGH],
              ["Periode", ghInfo?.periode || "-"],
              ["HST", hstAktif ?? "-"],
              ["Baris terisi", `${rowsTerisi} baris`],
              ["Total populasi", `${formatAngka(totalAll)} tanaman`],
              ...(soStatus.late ? [["Terlambat", `${soStatus.daysLate} hari (HST ${soStatus.checkpoint})`]] : []),
            ]}
            columns={[
              { key: "varian", label: "Varian" },
              { key: "total", label: "Populasi", num: true },
            ]}
            rows={totalVarianSorted.map(([v, t]) => ({ key: v, varian: v, total: formatAngka(t) }))}
            footer={{ varian: "Total", total: formatAngka(totalAll) }}
          />

          {soStatus.late && (
            <section className="fh-section">
              <span className="fh-label">Alasan terlambat</span>
              <p className="fh-card fh-card-body" style={{ margin: 0 }}>{keterangan.trim()}</p>
            </section>
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
          title={isDemoMode ? "Demo selesai" : savedOffline ? "Tersimpan di perangkat" : `SO ${selectedGH} terkirim`}
          description={isDemoMode
            ? "Data tidak dikirim (mode demo)."
            : savedOffline
              ? "Terkirim otomatis ke sheet saat online."
              : `${rowsTerisi} baris masuk ke sheet.`}
          summary={[
            ["GH", selectedGH],
            ["HST", hstAktif ?? "-"],
            ["Baris", rowsTerisi],
            ["Total populasi", formatAngka(totalAll)],
            ["Operator", operator],
            ...(soStatus.late ? [["Terlambat", `${soStatus.daysLate} hari`]] : []),
          ]}
        />
      )}

      <Dialog
        open={showDoubleWarn}
        title="GH sudah diisi hari ini"
        onClose={() => { setShowDoubleWarn(false); setPendingGH(""); }}
        actions={
          <div className="fh-btn-row">
            <button type="button" className="fh-btn fh-btn-secondary" onClick={() => { setShowDoubleWarn(false); setPendingGH(""); }}>Batal</button>
            <button type="button" className="fh-btn fh-btn-primary" onClick={() => doSelectGH(pendingGH)}>Isi ulang</button>
          </div>
        }
      >
        {pendingGH} sudah dikirim hari ini. Isi ulang akan menambah baris baru di sheet, data lama tidak terhapus.
      </Dialog>
    </FormShell>
  );
}
