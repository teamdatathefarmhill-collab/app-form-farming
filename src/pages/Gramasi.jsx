import { useState, useEffect, useCallback } from "react";
import { useDraft } from "../hooks/useDraft";
import { useAuth } from "../hooks/useAuth";
import { idbAdd, idbGetAll, idbDelete, idbCount, gasFetch, gasPost } from "../utils/idb";
import { useGHData } from "../hooks/useGHData";
import { useGHBlockedList, warnIfGHBlocked } from "../hooks/useGHBlockedList";
import { FormShell, FieldAlert, SuccessState, GHPicker, ReviewTable, EntryTable, Dialog, OperatorField } from "../components/form";
import { formatTanggal } from "../lib/format";
import { hstMaksGH } from "../lib/hstLimit";

const DB_NAME = "GramasiOfflineDB";

const SCRIPT_URL = import.meta.env.VITE_GAS_GRAMASI_URL;
const HST_MIN = 26;
const HST_MAX = 55;

// ─── Tanggal helpers — selalu computed fresh, TIDAK di module level ──────────
// Supaya kalau app dibiarkan terbuka semalam, tanggalnya tetap akurat saat dibuka pagi
function getTodayDisplay() {
  return new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ─── localStorage helpers (cache lokal, fallback offline) ─────────────────────
const LS_PREFIX = "gramasi_submitted_";

// Key selalu fresh pakai tanggal saat ini (bukan frozen di module load)
// PENTING: pakai tanggal lokal, bukan toISOString() (itu UTC) — kalau pakai UTC,
// di WIB (UTC+7) cache baru "ganti hari" jam 7 pagi, bukan jam 12 malam lokal.
function getLSKey() {
  const d = new Date();
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${LS_PREFIX}${y}-${m}-${day}`;
}

// Hapus cache hari-hari sebelumnya supaya tidak numpuk & tidak bocor ke hari lain
function cleanOldKeys() {
  try {
    const currentKey = getLSKey();
    Object.keys(localStorage)
      .filter(k => k.startsWith(LS_PREFIX) && k !== currentKey)
      .forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

function getSubmittedToday() {
  try { return JSON.parse(localStorage.getItem(getLSKey()) || "[]"); }
  catch { return []; }
}
function markSubmitted(gh) {
  const list = getSubmittedToday();
  if (!list.includes(gh)) localStorage.setItem(getLSKey(), JSON.stringify([...list, gh]));
}
function mergeSubmitted(serverList) {
  const local = getSubmittedToday();
  const merged = [...new Set([...serverList, ...local])];
  localStorage.setItem(getLSKey(), JSON.stringify(merged));
  return merged;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function hitungHST(tgl) {
  const [y, m, d] = tgl.split("-").map(Number);
  const tanam = new Date(y, m - 1, d);
  const now = new Date();
  const nowLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((nowLocal - tanam) / 86400000);
}

function calcAvg(s1, s2, s3) {
  const all = [s1, s2, s3];
  const hasValue = all.some(v => v !== "");
  if (!hasValue) return "";
  const vals = all.map(Number).filter(v => v > 0);
  return vals.length > 0 ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : "0.00";
}

// ─── Cek kenaikan/penurunan ekstrem dibanding pengukuran terakhir ───────────
// Naik lebih dari threshold (beda-beda per fase HST, makin tua makin sensitif
// karena pertumbuhan harian wajarnya makin kecil) → "naik". Turun (delta < 0,
// fase berapapun) → "turun". Boleh ada gap berapa hari pun, tetap dibandingkan
// ke pengukuran terakhir yang ada.
function getNaikThreshold(hst) {
  if (hst !== null && hst !== undefined && hst > 35) return 100;
  if (hst !== null && hst !== undefined && hst >= 30) return 200;
  return 200; // fase HST < 30 (atau HST tidak diketahui) — default
}

function getDeltaWarning(currVal, prevVal, hst) {
  if (currVal === "" || currVal === undefined || currVal === null) return null;
  if (prevVal === null || prevVal === undefined) return null;
  const curr = parseFloat(currVal);
  if (isNaN(curr)) return null;
  const delta = curr - prevVal;
  const naikThreshold = getNaikThreshold(hst);
  if (delta > naikThreshold) return { type: "naik", delta, curr, prev: prevVal };
  if (delta < 0)             return { type: "turun", delta, curr, prev: prevVal };
  return null;
}

// HST mendekati batas akhir (55) ditandai supaya diprioritaskan
function hstTone(hst) {
  if (hst <= 40) return "neutral";
  if (hst <= 50) return "warning";
  return "due";
}

// Tampilan desimal Indonesia ("123,33"); nilai yang dikirim tetap pakai titik
function tampilDesimal(v) {
  return String(v).replace(".", ",");
}

const CELL_LABEL = { s1: "S1", s2: "S2", s3: "S3", avg: "Rata²" };

export default function Gramasi() {
  const { user } = useAuth();
  const { getDraft, saveDraft, clearDraft } = useDraft("gramasi");
  const _draft = getDraft();

  // Tanggal selalu fresh saat komponen mount — bukan dari module-level variable
  const [todayISO]   = useState(() => getTodayDisplay());

  const [step, setStep]         = useState(_draft?.step || 1);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const { ghData, loading: loadingGH, isDemoMode } = useGHData();
  const { blockedMap } = useGHBlockedList();

  const [selectedGH, setSelectedGH]     = useState(_draft?.selectedGH || "");
  const [tableData, setTableData]       = useState(_draft?.tableData  || []);
  const [lastGramasi, setLastGramasi]   = useState({});
  // Operator otomatis dari akun login; bisa diubah di langkah rekap
  const [operator, setOperator]         = useState(_draft?.operator || user?.nama || "");
  const [keterangan, setKeterangan]     = useState(_draft?.keterangan || "");
  const [syncing, setSyncing]           = useState(false);
  const [syncProgress, setSyncProgress] = useState({ done: 0, total: 0 });
  const [submitError, setSubmitError]   = useState(null);
  const [savedOffline, setSavedOffline] = useState(false);

  const [submittedToday, setSubmittedToday] = useState(() => {
    cleanOldKeys(); // bersihin cache hari sebelumnya saat pertama load
    return getSubmittedToday();
  });
  const [showWarning, setShowWarning]           = useState(false);
  const [pendingGH, setPendingGH]               = useState("");
  const [loadingSubmitted, setLoadingSubmitted] = useState(false);

  // useAuth membaca sessionStorage setelah render pertama → isi operator begitu nama tersedia
  useEffect(() => {
    if (user?.nama) setOperator(prev => prev || user.nama);
  }, [user?.nama]);

  // ── Fetch GH yang sudah disubmit hari ini dari server (cross-device) ──
  const fetchSubmittedToday = useCallback(async () => {
    if (!isOnline || isDemoMode) return;
    setLoadingSubmitted(true);
    try {
      const url = `${SCRIPT_URL}?action=getSubmittedToday&tanggal=${encodeURIComponent(todayISO)}`;
      const data = await gasFetch(url);
      if (Array.isArray(data.submitted)) {
        const serverDate = data.tanggal;
        if (!serverDate || serverDate === todayISO) {
          const merged = mergeSubmitted(data.submitted);
          setSubmittedToday(merged);
        } else {
          console.warn("Server returned data for wrong date:", serverDate, "expected:", todayISO);
        }
      }
    } catch {
      // Gagal fetch — pakai cache lokal saja
    } finally {
      setLoadingSubmitted(false);
    }
  }, [isOnline, isDemoMode, todayISO]);

  // ── Offline state ──
  const [pendingCount, setPendingCount]         = useState(0);
  const [isSyncingPending, setIsSyncingPending] = useState(false);

  useEffect(() => {
    if (step === 4) return;
    saveDraft({ step, selectedGH, tableData, operator, keterangan });
  }, [step, selectedGH, tableData, operator, keterangan]);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await idbCount(DB_NAME);
      setPendingCount(count);
    } catch {
      setPendingCount(0);
    }
  }, []);

  useEffect(() => { refreshPendingCount(); }, [refreshPendingCount]);

  // ── Fetch submitted hari ini dari server saat step 1 & saat online ──
  useEffect(() => {
    if (step === 1) fetchSubmittedToday();
  }, [step, fetchSubmittedToday]);

  // ── Fetch data pengukuran terakhir (sebelum hari ini) per baris ──
  const fetchLastGramasi = useCallback(async (gh) => {
    setLastGramasi({});
    if (!isOnline || isDemoMode || !gh) return;
    try {
      const url = `${SCRIPT_URL}?action=getLastGramasi&gh=${encodeURIComponent(gh)}&tanggal=${encodeURIComponent(todayISO)}`;
      const data = await gasFetch(url);
      if (data.success) setLastGramasi(data.data || {});
    } catch {
      // Gagal fetch — biarkan kosong, tidak ada warning ditampilkan
    }
  }, [isOnline, isDemoMode, todayISO]);

  // ── Fetch pengukuran terakhir (untuk cek kenaikan/penurunan ekstrem) saat GH dipilih ──
  useEffect(() => {
    if (step === 2 && selectedGH) fetchLastGramasi(selectedGH);
  }, [step, selectedGH, fetchLastGramasi]);

  useEffect(() => {
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // ── Auto-sync saat kembali online ──
  useEffect(() => {
    if (isOnline) syncPendingData();
  }, [isOnline]);

  // ── Sync semua pending ke GAS ──
  const syncPendingData = useCallback(async () => {
    const allPending = await idbGetAll(DB_NAME);
    if (allPending.length === 0) return;
    setIsSyncingPending(true);
    for (const record of allPending) {
      try {
        await gasPost(SCRIPT_URL, { action: "submitGramasiBatch", rows: record.payloads });
        markSubmitted(record.gh);
        setSubmittedToday(getSubmittedToday());
        await idbDelete(DB_NAME, record.id);
      } catch {
        // Gagal sync record ini, skip dulu — coba lagi nanti
      }
    }
    await refreshPendingCount();
    setIsSyncingPending(false);
  }, [refreshPendingCount]);

  const ghAktif = Object.entries(ghData).filter(([gh, info]) => {
    if (!info.tanam) return true;
    const hst = hitungHST(info.tanam);
    return hst >= HST_MIN && hst <= hstMaksGH(gh, HST_MAX);
  });

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
    setTableData((ghData[gh]?.baris || []).map(b => ({ ...b, s1: "", s2: "", s3: "" })));
    setShowWarning(false);
    setPendingGH("");
    setStep(2);
  };

  const updateCell = (i, field, raw) => {
    const val = raw.replace(",", "."); // koma diterima sebagai desimal
    if (val !== "" && !/^\d*\.?\d*$/.test(val)) return;
    const intPart = val.split(".")[0];
    if (intPart.length > 4) return;
    setTableData(prev => {
      const d = [...prev];
      d[i] = { ...d[i], [field]: val };
      return d;
    });
  };

  const ghInfo      = ghData[selectedGH];
  const hst         = ghInfo?.tanam ? hitungHST(ghInfo.tanam) : null;
  const filledCount = tableData.filter(r => r.s1 !== "" && r.s2 !== "" && r.s3 !== "").length;
  const allFilled   = tableData.length > 0 && filledCount === tableData.length;
  // data GH harus sudah termuat — periode & HST diambil dari situ
  const canSubmit   = allFilled && operator.trim().length > 0 && !loadingGH;

  // ── Peringatan kenaikan/penurunan ekstrem dibanding pengukuran terakhir, per sel ──
  const rowWarnings = tableData.map(row => {
    const prev = lastGramasi[row.baris];
    const prevMatch = prev && (!prev.varian || prev.varian === row.varian) ? prev : null;
    if (!prevMatch) return { s1: null, s2: null, s3: null, avg: null };
    const avg = calcAvg(row.s1, row.s2, row.s3);
    return {
      s1:  getDeltaWarning(row.s1, prevMatch.s1, hst),
      s2:  getDeltaWarning(row.s2, prevMatch.s2, hst),
      s3:  getDeltaWarning(row.s3, prevMatch.s3, hst),
      avg: avg !== "" ? getDeltaWarning(avg, prevMatch.avg, hst) : null,
    };
  });
  const totalWarnings = rowWarnings.reduce((n, w) => n + Object.values(w).filter(Boolean).length, 0);

  const avgKeseluruhan = (() => {
    const avgs = tableData.map(r => parseFloat(calcAvg(r.s1, r.s2, r.s3))).filter(v => v > 0);
    return avgs.length > 0 ? `${tampilDesimal((avgs.reduce((a, b) => a + b, 0) / avgs.length).toFixed(2))} g` : "-";
  })();

  // ── Build semua payload per baris ──
  const buildPayloads = () => {
    const client_timestamp = new Date().toISOString();
    // Ambil tanggal fresh saat submit — bukan dari state yang mungkin sudah stale
    const submitDate = getTodayDisplay();
    return tableData.map(row => {
      const avg = calcAvg(row.s1, row.s2, row.s3);
      return {
        client_timestamp,
        tanggal:    submitDate,
        gh:         selectedGH,
        periode:    ghInfo?.periode || "",
        hst:        hst ?? "",
        baris:      row.baris,
        varian:     row.varian,
        s1:         row.s1 || 0,
        s2:         row.s2 || 0,
        s3:         row.s3 || 0,
        avg:        avg || 0,
        operator,
        keterangan: keterangan.trim() || "",
      };
    });
  };

  const handleSubmit = async () => {
    if (warnIfGHBlocked(selectedGH, blockedMap)) return;
    setSyncing(true);
    setSubmitError(null);
    const payloads = buildPayloads();
    setSyncProgress({ done: 0, total: payloads.length });

    // ── Mode Demo ──
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

    // ── Mode Offline ──
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

    // ── Mode Online ──
    setSavedOffline(false);
    try {
      await gasPost(SCRIPT_URL, { action: "submitGramasiBatch", rows: payloads });
      setSyncProgress({ done: payloads.length, total: payloads.length });
      markSubmitted(selectedGH);
      setSubmittedToday(getSubmittedToday());
      clearDraft();
      setStep(4);
    } catch (e) {
      // Gagal jaringan (TypeError) → simpan ke antrean offline agar data tidak hilang.
      if (e instanceof TypeError) {
        try {
          await idbAdd(DB_NAME, { gh: selectedGH, tanggal: todayISO, createdAt: Date.now(), payloads });
          await refreshPendingCount();
          markSubmitted(selectedGH);
          setSubmittedToday(getSubmittedToday());
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
    setStep(1); setSelectedGH(""); setTableData([]); setOperator(user?.nama || ""); setKeterangan("");
    setSyncing(false); setSyncProgress({ done: 0, total: 0 });
    setSubmitError(null); setSavedOffline(false); setLastGramasi({});
  };

  // ── Header ──
  const title = step === 2 || step === 3 ? `Gramasi · ${selectedGH}` : "Gramasi";
  const ghMeta = [ghInfo?.periode && `P${ghInfo.periode}`, hst !== null && `${hst} HST`].filter(Boolean).join(" · ");
  const subtitle = step === 1
    ? `${formatTanggal()} · Langkah 1 dari 3`
    : step === 4
      ? formatTanggal()
      : `${ghMeta ? `${ghMeta} · ` : ""}Langkah ${step} dari 3`;
  const onBack = step === 2 ? () => setStep(1) : step === 3 ? () => { setStep(2); setSubmitError(null); } : undefined;

  // ── Footer ──
  let footer = null;
  if (step === 2) {
    const sisa = tableData.length - filledCount;
    footer = (
      <button type="button" className="fh-btn fh-btn-primary" disabled={!allFilled} onClick={() => setStep(3)}>
        {allFilled ? "Lihat rekap" : `${sisa} baris belum lengkap`}
      </button>
    );
  } else if (step === 3) {
    const sendLabel = syncing
      ? `Mengirim… ${syncProgress.done}/${syncProgress.total}`
      : loadingGH ? "Memuat data GH…"
      : isDemoMode ? "Kirim demo"
      : !isOnline ? `Simpan offline (${tableData.length} baris)`
      : `Kirim ${tableData.length} baris`;
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
      {step < 4 && isDemoMode && (
        <FieldAlert tone="warning">Server tidak terjangkau. Menampilkan data demo, data tidak dikirim ke sheet.</FieldAlert>
      )}

      {/* ══ STEP 1 — Pilih GH ══ */}
      {step === 1 && (
        <>
          <section className="fh-section">
            <div className="fh-section-head">
              <span className="fh-label">GH aktif HST {HST_MIN}–{HST_MAX}</span>
              {loadingSubmitted && <span className="fh-meta">mengecek status…</span>}
            </div>
          </section>
          <GHPicker
            loading={loadingGH}
            selected={selectedGH}
            onSelect={handleSelectGH}
            emptyText={`Tidak ada GH aktif dengan HST ${HST_MIN}–${HST_MAX}.`}
            items={ghAktif.map(([gh, info]) => {
              const hstGH = info.tanam ? hitungHST(info.tanam) : null;
              const blockedInfo = blockedMap[gh.trim().toUpperCase()];
              const badges = [];
              if (blockedInfo) badges.push({ label: blockedInfo.aksi, tone: "danger" });
              if (submittedToday.includes(gh)) badges.push({ label: "Sudah diisi", tone: "success" });
              if (hstGH !== null) badges.push({ label: `${hstGH} HST`, tone: hstTone(hstGH) });
              return {
                gh,
                meta: `${info.periode ? `P${info.periode} · ` : ""}${info.baris?.length || 0} baris`,
                badges,
                done: submittedToday.includes(gh),
                sortValue: hstGH,
              };
            })}
          />
        </>
      )}

      {/* ══ STEP 2 — Input Tabel ══ */}
      {step === 2 && (
        <>
          <section className="fh-section">
            <div className="fh-section-head">
              <span className="fh-label">Berat sampel (g)</span>
              <span className="fh-meta">{filledCount}/{tableData.length} baris</span>
            </div>
            <div className="fh-bar">
              <span style={{ width: `${tableData.length > 0 ? (filledCount / tableData.length) * 100 : 0}%` }} />
            </div>
          </section>

          {totalWarnings > 0 && (
            <FieldAlert tone="warning">
              {totalWarnings} nilai beda jauh dari pengukuran sebelumnya. Cek lagi sel yang ditandai merah sebelum kirim.
            </FieldAlert>
          )}

          <EntryTable
            columns={[
              { key: "baris", label: "Baris" },
              { key: "s1", label: "S1", width: 64, input: true },
              { key: "s2", label: "S2", width: 64, input: true },
              { key: "s3", label: "S3", width: 64, input: true },
              { key: "avg", label: "Rata²", width: 62, num: true },
            ]}
            rows={tableData}
            rowKey={(row, i) => `${row.baris}-${i}`}
            onChange={updateCell}
            displayValue={tampilDesimal}
            isRowDone={(row) => row.s1 !== "" && row.s2 !== "" && row.s3 !== ""}
            cellError={(i, key) => !!rowWarnings[i]?.[key]}
            renderCell={(row, col, i) => {
              if (col.key === "baris") {
                return (
                  <>
                    <span className="fh-row-label">{row.baris}</span>
                    <span className="fh-row-sub">{row.varian}</span>
                  </>
                );
              }
              const avg = calcAvg(row.s1, row.s2, row.s3);
              return (
                <span className="fh-num" style={rowWarnings[i]?.avg ? { color: "var(--status-danger-fg)" } : undefined}>
                  {avg ? tampilDesimal(avg) : "-"}
                </span>
              );
            }}
            rowDetail={(row, i) => {
              const w = rowWarnings[i];
              const msgs = ["s1", "s2", "s3", "avg"].filter(k => w[k]).map(k =>
                `${CELL_LABEL[k]} ${w[k].type === "naik" ? "naik ekstrem" : "turun"} ke ${tampilDesimal(w[k].curr)} g, sebelumnya ${tampilDesimal(w[k].prev)} g`
              );
              return msgs.length > 0 ? <p className="fh-error-text">{msgs.join(". ")}.</p> : null;
            }}
          />

          <label className="fh-section">
            <div className="fh-section-head">
              <span className="fh-label">Keterangan</span>
              <span className="fh-meta">opsional</span>
            </div>
            <input
              className="fh-input"
              value={keterangan}
              onChange={e => setKeterangan(e.target.value)}
              placeholder="Contoh: ganti sampel dari kemarin, baris C rusak"
            />
          </label>
        </>
      )}

      {/* ══ STEP 3 — Rekap ══ */}
      {step === 3 && (
        <>
          <OperatorField user={user} value={operator} onChange={setOperator} minLength={1} />

          {totalWarnings > 0 && (
            <FieldAlert tone="warning">{totalWarnings} nilai beda jauh dari pengukuran sebelumnya. Pastikan sudah benar.</FieldAlert>
          )}

          <ReviewTable
            title="Rekap"
            info={[
              ["Tanggal", formatTanggal()],
              ["GH", selectedGH],
              ["Periode", ghInfo?.periode || "-"],
              ["HST", hst ?? "-"],
              ["Rata² keseluruhan", avgKeseluruhan],
              ...(keterangan.trim() ? [["Keterangan", keterangan.trim()]] : []),
            ]}
            columns={[
              { key: "baris", label: "Baris" },
              { key: "sampel", label: "S1 · S2 · S3", num: true },
              { key: "avg", label: "Rata²", num: true },
            ]}
            rows={tableData.map((row, i) => ({
              key: `${row.baris}-${i}`,
              baris: <><span className="fh-row-label">{row.baris}</span><span className="fh-row-sub">{row.varian}</span></>,
              sampel: [row.s1, row.s2, row.s3].map(tampilDesimal).join(" · "),
              avg: tampilDesimal(calcAvg(row.s1, row.s2, row.s3) || "-"),
            }))}
          />

          {submitError && <FieldAlert tone="danger">{submitError}</FieldAlert>}
        </>
      )}

      {/* ══ STEP 4 — Sukses ══ */}
      {step === 4 && (
        <SuccessState
          offline={savedOffline}
          title={isDemoMode ? "Demo selesai" : savedOffline ? "Tersimpan di perangkat" : `Gramasi ${selectedGH} terkirim`}
          description={isDemoMode
            ? "Data tidak dikirim (mode demo)."
            : savedOffline
              ? `Terkirim otomatis ke sheet saat online.${pendingCount > 0 ? ` ${pendingCount} GH menunggu.` : ""}`
              : `${tableData.length} baris masuk ke sheet.`}
          summary={[
            ["GH", selectedGH],
            ["HST", hst ?? "-"],
            ["Baris", tableData.length],
            ["Rata² keseluruhan", avgKeseluruhan],
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
