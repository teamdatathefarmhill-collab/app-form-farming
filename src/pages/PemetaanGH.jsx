import { useState, useEffect, useCallback } from "react";
import { useDraft } from "../hooks/useDraft";
import { idbAdd, idbGetAll, idbDelete, idbCount, gasFetch } from "../utils/idb";
import { useGHData } from "../hooks/useGHData";
import ConfirmSubmitModal from "../components/ConfirmSubmitModal";

const DB_NAME    = "PemetaanOfflineDB";
const SCRIPT_URL = import.meta.env.VITE_GAS_PEMETAAN_URL;

const LS_SEMAI_CACHE_KEY = "farmhill_pemetaan_semairef_cache";
const LS_SEMAI_CACHE_TTL = 1000 * 60 * 30; // 30 menit
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

const todayISO   = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
const todayLabel = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

function fmtNum(n) {
  return (n || 0).toLocaleString("id-ID");
}

function emptyEntry() { return { varian: "", jumlah: "" }; }

// ─── Daftar lengkap varian yang kita punya — dropdown pilih varian pakai ini,
// bukan cuma varian yang kebetulan ada di referensi semai GH tsb. ──
const ALL_VARIAN = ["Greenigal", "Elysia", "Midori", "Aruni", "Greenie sweet", "Daegoji", "S7", "Sagami", "Emeralda", "Sunray"];

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
  const { getDraft, saveDraft, clearDraft } = useDraft("pemetaan");
  const _draft = getDraft();

  const [step, setStep] = useState(_draft?.step || 1);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const { produksiData, loading: loadingGH, isDemoMode } = useGHData();

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
  const [operator, setOperator]     = useState(_draft?.operator   || "");
  const [keteranganSelisih, setKeteranganSelisih] = useState(_draft?.keteranganSelisih || {});

  const [syncing, setSyncing]         = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [savedOffline, setSavedOffline] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
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
    saveDraft({ step, selectedGH, barisRows, operator, keteranganSelisih });
  }, [step, selectedGH, barisRows, operator, keteranganSelisih]);

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
        await fetch(SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify(record.payload),
          redirect: "follow",
        });
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
    setSelectedGH(gh);
    const produksiInfo = findProduksiInfo(produksiData, gh);
    setBarisRows(buildBarisRows(produksiInfo));
    setKeteranganSelisih({});
    setStep(2);
  };

  // ── Opsi dropdown: varian dari referensi semai (raw, dgn suffix batch bila ada)
  // ditambah sisa varian yang kita punya tapi belum ada di referensi semai GH ini,
  // supaya user tetap bisa pilih varian lain yang benar-benar ditanam. ──
  const semaiVarianRaw = (semaiData[selectedGH]?.varian || []).map((v) => v.nama);
  const semaiVarianBase = new Set(semaiVarianRaw.map(varianDisplayName));
  const dropdownVarianOptions = [...semaiVarianRaw, ...ALL_VARIAN.filter((v) => !semaiVarianBase.has(v))];

  const referensiMap = {};
  (semaiData[selectedGH]?.varian || []).forEach((v) => { referensiMap[v.nama] = (referensiMap[v.nama] || 0) + v.populasi; });

  // ── Realisasi per varian = jumlah semua entries di semua baris (termasuk Sulaman) ──
  const realisasiMap = {};
  barisRows.forEach((row) => {
    row.entries.forEach((e) => {
      if (!e.varian || e.jumlah === "") return;
      realisasiMap[e.varian] = (realisasiMap[e.varian] || 0) + (parseInt(e.jumlah) || 0);
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
      const newRow = { baris: "", isSulaman: false, entries: [emptyEntry()] };
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
  const canProceedStep2 = allBarisNamed && allRegulerFilled && operator.trim().length > 0 && keteranganOK;

  // ── Teks untuk grup ──
  const barisLines = barisRows
    .filter((r) => !r.isSulaman && r.entries.some((e) => e.varian && e.jumlah !== ""))
    .map((r) => `${r.baris} ${r.entries.filter((e) => e.varian && e.jumlah !== "").map((e) => `${e.varian} ${e.jumlah}`).join(", ")}`);
  const sulamanRow = barisRows.find((r) => r.isSulaman);
  const sulamanLine = sulamanRow && sulamanRow.entries.some((e) => e.varian && e.jumlah !== "")
    ? `Sulaman ${sulamanRow.entries.filter((e) => e.varian && e.jumlah !== "").map((e) => `${e.varian} ${e.jumlah}`).join(", ")}`
    : null;

  const clipboardText = [
    `PEMETAAN GH ${selectedGH.toUpperCase()}`,
    todayLabel,
    ...barisLines,
    ...(sulamanLine ? [sulamanLine] : []),
    `Total tanaman ${fmtNum(totalUtama)}`,
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
    selisih: mismatches.map((v) => ({
      varian: v,
      referensi: referensiMap[v] || 0,
      realisasi: realisasiMap[v] || 0,
      selisih: (realisasiMap[v] || 0) - (referensiMap[v] || 0),
      keterangan: (keteranganSelisih[v] || "").trim(),
    })),
  });

  const handleSubmit = async () => {
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
        setSubmitError("Gagal menyimpan data offline. Coba lagi.");
      } finally {
        setSyncing(false);
      }
      return;
    }

    setSavedOffline(false);
    try {
      await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload),
        redirect: "follow",
      });
      clearDraft();
      setStep(4);
    } catch {
      setSubmitError("Gagal mengirim data. Cek koneksi dan coba lagi.");
    } finally {
      setSyncing(false);
    }
  };

  const resetForm = () => {
    clearDraft();
    setStep(1); setSelectedGH(""); setBarisRows([]); setOperator("");
    setKeteranganSelisih({}); setSyncing(false); setSubmitError(null);
    setSavedOffline(false); setCopyDone(false);
  };

  const loadingAll = loadingGH || loadingSemai;

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5", fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>

      {/* ── Header ── */}
      <div style={{ background: "#1b5e20", color: "#fff", padding: "14px 16px 10px", position: "sticky", top: 0, zIndex: 10, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, opacity: 0.75, letterSpacing: 1.5, textTransform: "uppercase" }}>Pemetaan GH Produksi</div>
            <div style={{ fontSize: 13, opacity: 0.65, marginTop: 1 }}>{todayLabel}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {pendingCount > 0 && (
              <button onClick={isOnline ? syncPendingData : undefined}
                style={{ fontSize: 10, fontWeight: 700, background: isOnline ? "rgba(33,150,243,0.3)" : "rgba(255,179,0,0.3)", border: `1px solid ${isOnline ? "rgba(33,150,243,0.6)" : "rgba(255,179,0,0.6)"}`, color: "#fff", padding: "2px 8px", borderRadius: 20, cursor: isOnline ? "pointer" : "default" }}>
                {isSyncingPending ? "⏳" : "📤"} {pendingCount} pending
              </button>
            )}
            {isDemoMode && (
              <div style={{ fontSize: 10, fontWeight: 700, background: "rgba(255,179,0,0.25)", border: "1px solid rgba(255,179,0,0.5)", borderRadius: 20, padding: "2px 8px", color: "#fff9c4" }}>DEMO</div>
            )}
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: isOnline ? "#a5d6a7" : "#ef9a9a" }} />
          </div>
        </div>

        {!isOnline && (
          <div style={{ marginTop: 8, padding: "6px 10px", background: "rgba(244,67,54,0.2)", border: "1px solid rgba(244,67,54,0.4)", borderRadius: 7, display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontSize: 13 }}>📵</span>
            <span style={{ fontSize: 11, color: "#ffcdd2" }}>Mode offline — data tersimpan lokal & sync otomatis saat online</span>
          </div>
        )}

        {step < 4 && (
          <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
            {[1, 2, 3].map((s) => (
              <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: s <= step ? "#a5d6a7" : "rgba(255,255,255,0.2)" }} />
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: 16 }}>

        {/* ══ STEP 1 — Pilih GH ══ */}
        {step === 1 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: "#1b5e20", marginBottom: 4 }}>GH Semai Aktif</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>
              Sumbernya sama dengan referensi Sanitasi/HPT Semai — GH tujuan yang di Data sprout (New) kolom Tanam-nya masih kosong.
            </div>

            {loadingAll ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#aaa" }}>
                <div style={{ fontSize: 28 }}>🔄</div>
                <div style={{ fontSize: 13, marginTop: 8 }}>Memuat data...</div>
              </div>
            ) : semaiAktif.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0", color: "#aaa", fontSize: 13 }}>Tidak ada GH semai aktif saat ini.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {semaiAktif.map((item) => {
                  const dipilih = selectedGH === item.gh;
                  return (
                    <button key={item.gh} onClick={() => handleSelectGH(item.gh)}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "12px 13px", borderRadius: 12, border: dipilih ? "1.5px solid #2e7d32" : "1.5px solid #e0e0e0", background: dipilih ? "#e8f5e9" : "#fff", cursor: "pointer", textAlign: "left" }}>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 800, color: dipilih ? "#1b5e20" : "#333" }}>{item.gh}</div>
                        <div style={{ fontSize: 10.5, color: "#999", marginTop: 2 }}>P{item.periode} · {item.varian?.length || 0} varian</div>
                      </div>
                      {dipilih && <div style={{ fontSize: 11, fontWeight: 800, background: "#e8f5e9", color: "#2e7d32", border: "1px solid #2e7d32", borderRadius: 20, padding: "3px 10px" }}>✓ Dipilih</div>}
                    </button>
                  );
                })}
              </div>
            )}

            <div style={{ fontSize: 11, color: "#aaa", textAlign: "center", marginTop: 16, lineHeight: 1.6 }}>
              Begitu kolom <strong>Tanam</strong> di Data sprout (New) diisi tanggal, GH ini akan hilang dari daftar aktif.
            </div>
          </div>
        )}

        {/* ══ STEP 2 — Input Pemetaan ══ */}
        {step === 2 && (
          <div>
            <button onClick={() => setStep(1)} style={{ background: "none", border: "none", color: "#666", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 12 }}>← Kembali</button>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
              <div style={{ background: "#e8f5e9", border: "1px solid #a5d6a7", borderRadius: 20, padding: "3px 12px", fontSize: 12, color: "#2e7d32", fontWeight: 700 }}>{selectedGH}</div>
              <div style={{ background: "#f5f5f5", borderRadius: 20, padding: "3px 12px", fontSize: 12, color: "#666" }}>Periode {semaiData[selectedGH]?.periode}</div>
              <div style={{ background: "#f5f5f5", borderRadius: 20, padding: "3px 12px", fontSize: 12, color: "#666" }}>{regulerRows.length} baris + Sulaman</div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: "#2e7d32", letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 700 }}>
                👤 Nama Operator <span style={{ color: "#e53935" }}>*</span>
              </label>
              <input type="text" value={operator} onChange={(e) => setOperator(e.target.value)}
                placeholder="Tulis nama lengkap..."
                style={{ width: "100%", marginTop: 8, padding: "11px 14px", background: "#fff", border: `1.5px solid ${operator.trim() ? "#81c784" : "#e0e0e0"}`, borderRadius: 10, color: "#333", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
            </div>

            <div style={{ fontWeight: 700, fontSize: 15, color: "#1b5e20", margin: "0 0 2px" }}>Realisasi per Baris</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>Tiap baris = 1 kartu. Satu baris boleh diisi lebih dari satu varian.</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
              {barisRows.map((row, rowIdx) => {
                const subtotal = row.entries.reduce((s, e) => s + (parseInt(e.jumlah) || 0), 0);
                const isManualLabel = !row.baris && !row.isSulaman;
                return (
                  <div key={rowIdx} style={{ background: "#fff", border: `1.5px solid ${row.isSulaman ? "#ce93d870" : "#e0e0e0"}`, borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", background: row.isSulaman ? "#f3e5f5" : "#e8f5e9" }}>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: row.isSulaman ? "#6A1B9A" : "#1b5e20", display: "flex", alignItems: "center", gap: 6 }}>
                        {row.isSulaman ? "🧵 Sulaman" : "🌾"}
                        {!row.isSulaman && (
                          isManualLabel
                            ? <input value={row.baris} onChange={(e) => updateBarisLabel(rowIdx, e.target.value)} placeholder="Nama baris" style={{ width: 90, padding: "3px 6px", borderRadius: 6, border: "1px solid #a5d6a7", fontSize: 12, fontWeight: 700 }} />
                            : `Baris ${barisDisplayLabel(row.baris)}`
                        )}
                        {row.isSulaman && <span style={{ fontWeight: 600, fontSize: 10, opacity: 0.75 }}>(opsional, di luar total)</span>}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 800, color: "#333" }}>{fmtNum(subtotal)}</span>
                        {isManualLabel && (
                          <button onClick={() => removeManualBaris(rowIdx)} style={{ background: "none", border: "none", color: "#e53935", fontSize: 16, cursor: "pointer", lineHeight: 1 }}>×</button>
                        )}
                      </span>
                    </div>
                    <div style={{ padding: "9px 10px 10px", display: "flex", flexDirection: "column", gap: 7 }}>
                      {row.entries.map((entry, entryIdx) => (
                        <div key={entryIdx} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <select value={entry.varian} onChange={(e) => updateEntry(rowIdx, entryIdx, "varian", e.target.value)}
                            style={{ flex: 1, padding: "8px 9px", borderRadius: 8, border: "1.5px solid #e0e0e0", background: "#fafafa", fontSize: 12.5, fontWeight: 600, color: "#333" }}>
                            <option value="">Pilih varian</option>
                            {dropdownVarianOptions.map((v) => <option key={v} value={v}>{varianDisplayName(v)}</option>)}
                          </select>
                          <input type="number" inputMode="numeric" value={entry.jumlah}
                            onChange={(e) => updateEntry(rowIdx, entryIdx, "jumlah", e.target.value)}
                            placeholder="0"
                            style={{ width: 64, padding: "8px 9px", borderRadius: 8, border: "1.5px solid #e0e0e0", background: "#fafafa", fontSize: 12.5, fontWeight: 700, textAlign: "center", color: "#333" }} />
                          <button onClick={() => removeEntry(rowIdx, entryIdx)} style={{ background: "none", border: "none", color: "#e53935", fontSize: 17, cursor: "pointer", width: 22 }}>×</button>
                        </div>
                      ))}
                      <button onClick={() => addEntry(rowIdx)}
                        style={{ alignSelf: "flex-start", border: "1px dashed #bbb", background: "transparent", color: "#888", borderRadius: 8, padding: "6px 11px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                        + Tambah varian
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <button onClick={addManualBaris}
              style={{ width: "100%", padding: 10, background: "#f3e5f5", border: "1.5px dashed #ce93d8", borderRadius: 10, color: "#6A1B9A", fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 16 }}>
              + Tambah baris tidak terdaftar
            </button>

            {!allBarisNamed && (
              <div style={{ fontSize: 12, color: "#e65100", background: "#fff3e0", border: "1px solid #ffb74d", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>⚠️ Ada baris tambahan yang belum diberi nama</div>
            )}
            {!allRegulerFilled && allBarisNamed && (
              <div style={{ fontSize: 12, color: "#e65100", background: "#fff3e0", border: "1px solid #ffb74d", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>⚠️ Masih ada baris yang varian/jumlahnya belum lengkap</div>
            )}

            {/* ── Ref panel — ditaruh paling bawah supaya operator bisa isi baris dulu tanpa scroll panjang ── */}
            {varianList.length > 0 && (
              <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 13, padding: "12px 13px 6px", marginBottom: 14 }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#1b5e20", marginBottom: 8 }}>🌱 Referensi Populasi Akhir (Semai) vs Realisasi</div>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 54px 64px", gap: 6, fontSize: 9, textTransform: "uppercase", color: "#aaa", paddingBottom: 4 }}>
                  <span>Varian</span><span style={{ textAlign: "right" }}>Referensi</span><span style={{ textAlign: "right" }}>Realisasi</span>
                </div>
                {varianList.map((v) => {
                  const ref = referensiMap[v] || 0;
                  const real = realisasiMap[v] || 0;
                  const diff = real - ref;
                  const isMismatch = diff !== 0;
                  return (
                    <div key={v} style={{ padding: "6px 0", borderTop: "1px dashed #eee" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 54px 64px", gap: 6, alignItems: "baseline", fontSize: 11.5 }}>
                        <span style={{ color: "#333", fontWeight: 600 }}>{v}</span>
                        <span style={{ textAlign: "right", color: "#888" }}>{fmtNum(ref)}</span>
                        <span style={{ textAlign: "right" }}>
                          <span style={{ display: "block", fontWeight: 700, color: isMismatch ? "#e65100" : "#333" }}>{fmtNum(real)}</span>
                          <span style={{ display: "block", fontSize: 9.5, fontWeight: 700, color: isMismatch ? "#e65100" : "#2e7d32" }}>{isMismatch ? `⚠ ${diff > 0 ? "+" : ""}${diff}` : "✓ sesuai"}</span>
                        </span>
                      </div>
                      {isMismatch && (
                        <div style={{ marginTop: 7, padding: "9px 10px", background: "#fff3e0", borderLeft: "3px solid #e65100", borderRadius: "0 8px 8px 0" }}>
                          <div style={{ fontSize: 11, color: "#e65100", fontWeight: 700, marginBottom: 6 }}>⚠️ {v} selisih {diff > 0 ? "+" : ""}{diff} dari referensi semai — wajib jelaskan kenapa</div>
                          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: "#e65100", marginBottom: 4 }}>✎ Alasan selisih (wajib diisi)</div>
                          <textarea
                            rows={2}
                            value={keteranganSelisih[v] || ""}
                            onChange={(e) => setKeteranganSelisih((prev) => ({ ...prev, [v]: e.target.value }))}
                            placeholder={`Contoh: ${Math.abs(diff)} bibit ${v} layu saat pindah tanam...`}
                            style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: "1.5px solid #e65100", background: "#fff", color: "#333", fontFamily: "inherit", fontSize: 12.5, resize: "none", boxSizing: "border-box" }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {!keteranganOK && (
              <div style={{ fontSize: 12, color: "#e65100", background: "#fff3e0", border: "1px solid #ffb74d", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>⚠️ Ada selisih vs referensi semai yang belum dijelaskan</div>
            )}
          </div>
        )}

        {/* ══ STEP 3 — Ringkasan ══ */}
        {step === 3 && (
          <div>
            <button onClick={() => setStep(2)} style={{ background: "none", border: "none", color: "#666", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 12 }}>← Kembali</button>

            <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 13, padding: "13px 14px", marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#1b5e20" }}>📋 Teks untuk grup</span>
                <button onClick={() => {
                  navigator.clipboard.writeText(clipboardText).then(() => {
                    setCopyDone(true);
                    setTimeout(() => setCopyDone(false), 1400);
                  }).catch(() => {});
                }} style={{ border: "none", background: copyDone ? "#2e7d32" : "#43a047", color: "#fff", fontSize: 11, fontWeight: 800, padding: "6px 12px", borderRadius: 8, cursor: "pointer" }}>
                  {copyDone ? "✓ Disalin" : "Copy"}
                </button>
              </div>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", fontSize: 12.5, lineHeight: 1.65, color: "#333", background: "#f6f8f4", borderRadius: 9, padding: "10px 11px", border: "1px solid #eee" }}>
                {clipboardText}
              </pre>
            </div>

            {mismatches.length > 0 ? (
              <div style={{ background: "#fff3e0", border: "1px solid #e65100", borderRadius: 13, padding: "13px 14px", marginBottom: 14 }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#e65100", marginBottom: 9 }}>⚠️ Keterangan Selisih ({mismatches.length} varian)</div>
                {mismatches.map((v) => (
                  <div key={v} style={{ marginBottom: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11.5, fontWeight: 800, color: "#333" }}>
                      <span>{v}</span>
                      <span style={{ color: "#e65100", textAlign: "right" }}>{fmtNum(realisasiMap[v] || 0)} vs {fmtNum(referensiMap[v])} ({(realisasiMap[v] || 0) - referensiMap[v] > 0 ? "+" : ""}{(realisasiMap[v] || 0) - referensiMap[v]})</span>
                    </div>
                    <div style={{ background: "#fff", borderRadius: 8, padding: "6px 10px", border: "1px solid #eee", fontSize: 12, color: "#333", marginTop: 3 }}>
                      "{keteranganSelisih[v]}"
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ background: "#e8f5e9", border: "1px solid #a5d6a7", borderRadius: 13, padding: "12px 14px", marginBottom: 14, fontSize: 12.5, color: "#2e7d32" }}>
                ✓ Semua varian sesuai referensi semai — tidak ada keterangan diperlukan.
              </div>
            )}

            <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 13, padding: "13px 14px", marginBottom: 16 }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#1b5e20", marginBottom: 8 }}>🔍 Total per Varian</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 14 }}>
                {varianList.map((v) => {
                  const ref = referensiMap[v] || 0, real = realisasiMap[v] || 0;
                  return (
                    <div key={v} style={{ display: "flex", justifyContent: "space-between", gap: 6, fontSize: 11.5, padding: "3px 0" }}>
                      <span style={{ color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</span>
                      <span style={{ fontWeight: 700, whiteSpace: "nowrap", color: real === ref ? "#2e7d32" : "#e65100" }}>{fmtNum(real)}/{fmtNum(ref)}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ borderTop: "1px dashed #eee", marginTop: 8, paddingTop: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "2px 0" }}><span style={{ color: "#666" }}>Total baris (tanpa sulaman)</span><span style={{ fontWeight: 700 }}>{fmtNum(totalUtama)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "2px 0" }}><span style={{ color: "#666" }}>Sulaman</span><span style={{ fontWeight: 700 }}>{fmtNum(totalSulaman)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 800, padding: "4px 0" }}><span>Total realisasi + sulaman</span><span>{fmtNum(totalUtama + totalSulaman)}</span></div>
              </div>
            </div>

            {submitError && (
              <div style={{ fontSize: 12, color: "#c62828", background: "#ffebee", border: "1px solid #ef9a9a", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>⚠️ {submitError}</div>
            )}
          </div>
        )}

        {/* ══ STEP 4 — Sukses ══ */}
        {step === 4 && (
          <div style={{ textAlign: "center", paddingTop: 32 }}>
            <div style={{ fontSize: 60, marginBottom: 12 }}>{isDemoMode ? "🧪" : savedOffline ? "💾" : "✅"}</div>
            <div style={{ fontSize: 21, fontWeight: 800, color: isDemoMode ? "#f57f17" : savedOffline ? "#1565C0" : "#2e7d32", marginBottom: 6 }}>
              {isDemoMode ? "Demo Selesai!" : savedOffline ? "Tersimpan Lokal!" : "Pemetaan Tersimpan!"}
            </div>
            <div style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>
              {isDemoMode ? "Data tidak dikirim (mode demo)" : savedOffline ? "Data disimpan di perangkat. Otomatis terkirim ke Google Sheets saat online." : `${selectedGH} berhasil dikirim ke sheet Data.`}
            </div>
            <button onClick={resetForm} style={{ width: "100%", padding: 15, background: isDemoMode ? "#fff8e1" : savedOffline ? "#e3f2fd" : "#e8f5e9", border: `2px solid ${isDemoMode ? "#ffb74d" : savedOffline ? "#90CAF9" : "#81c784"}`, borderRadius: 12, color: isDemoMode ? "#e65100" : savedOffline ? "#1565C0" : "#2e7d32", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              + Pemetaan GH Berikutnya
            </button>
          </div>
        )}
      </div>

      {/* ── Bottom Nav ── */}
      {step === 2 && (
        <div style={{ padding: "12px 16px 24px", borderTop: "1px solid #e0e0e0", background: "#fff", position: "sticky", bottom: 0, display: "flex", gap: 10 }}>
          <button onClick={() => setStep(1)} style={{ flex: 1, padding: 13, background: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: 12, color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>← Kembali</button>
          <button onClick={() => setStep(3)} disabled={!canProceedStep2}
            style={{ flex: 2, padding: 13, border: "none", borderRadius: 12, background: canProceedStep2 ? "linear-gradient(135deg,#1b5e20,#2e7d32)" : "#e0e0e0", color: canProceedStep2 ? "#fff" : "#aaa", fontSize: 15, fontWeight: 700, cursor: canProceedStep2 ? "pointer" : "not-allowed" }}>
            Review Ringkasan →
          </button>
        </div>
      )}
      {step === 3 && (
        <div style={{ padding: "12px 16px 24px", borderTop: "1px solid #e0e0e0", background: "#fff", position: "sticky", bottom: 0, display: "flex", gap: 10 }}>
          <button onClick={() => setStep(2)} style={{ flex: 1, padding: 13, background: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: 12, color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>← Kembali</button>
          <button onClick={() => setConfirmOpen(true)} disabled={syncing}
            style={{ flex: 2, padding: 13, border: "none", borderRadius: 12, background: syncing ? "rgba(76,175,80,0.3)" : isDemoMode ? "linear-gradient(135deg,#5d4037,#795548)" : !isOnline ? "linear-gradient(135deg,#1565C0,#1976D2)" : "linear-gradient(135deg,#1b5e20,#2e7d32)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: syncing ? "not-allowed" : "pointer" }}>
            {syncing ? "⏳ Mengirim..." : isDemoMode ? "Submit Demo 🧪" : !isOnline ? "💾 Simpan Offline" : "Submit Pemetaan ✓"}
          </button>
        </div>
      )}

      <ConfirmSubmitModal
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => { setConfirmOpen(false); handleSubmit(); }}
        color="#2e7d32"
        isOffline={!isOnline}
        isDemoMode={isDemoMode}
        summary={[
          { label: "Tanggal", value: todayISO },
          { label: "GH", value: selectedGH },
          { label: "Total tanaman", value: `${fmtNum(totalUtama)} (+${fmtNum(totalSulaman)} sulaman)` },
          { label: "Operator", value: operator },
          ...(mismatches.length > 0 ? [{ label: "Selisih", value: `${mismatches.length} varian perlu keterangan` }] : []),
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
