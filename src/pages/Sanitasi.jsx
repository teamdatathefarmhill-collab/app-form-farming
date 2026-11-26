import { useState, useEffect, useCallback } from "react";
import { useDraft } from "../hooks/useDraft";
import { useAuth } from "../hooks/useAuth";
import { idbAdd, idbGetAll, idbDelete, idbCount, gasFetch, gasPost } from "../utils/idb";
import { useGHData } from "../hooks/useGHData";
import { useGHBlockedList, warnIfGHBlocked } from "../hooks/useGHBlockedList";
import { FormShell, FieldAlert, SuccessState, GHPicker, ReviewTable, SegmentTabs, Stepper, PhotoBox, OperatorField } from "../components/form";
import { formatTanggal, formatAngka } from "../lib/format";
import { hstMaksGH } from "../lib/hstLimit";

const DB_NAME = "SanitasiOfflineDB";

const SCRIPT_URL = import.meta.env.VITE_GAS_SANITASI_URL;

// v2 — cache key diupdate agar invalidate data lama yang belum ada varian
const LS_SEMAI_CACHE_KEY = "farmhill_semairef_cache_v2";
const LS_SEMAI_CACHE_TTL = 1000 * 60 * 30;
function saveSemaiCache(data) {
  try { localStorage.setItem(LS_SEMAI_CACHE_KEY, JSON.stringify({ data, savedAt: Date.now() })); } catch { /* kuota penuh, abaikan */ }
}
function loadSemaiCache() {
  try {
    const raw = localStorage.getItem(LS_SEMAI_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.savedAt > LS_SEMAI_CACHE_TTL) return null; // expired → fetch ulang
    return parsed.data;
  } catch { return null; }
}
const HST_MAKS = Infinity; // tanpa batas — GH tampil sampai ada tanam baru

const TIPE_GH = [
  {
    key: "drip", label: "Drip",
    pattern: (gh) => {
      const upper = gh.toUpperCase();
      if (upper.startsWith("BERGAS")) { const n = parseInt(upper.replace("BERGAS","").trim()); return n >= 1 && n <= 8 && n !== 6; }
      if (upper.startsWith("COLOMADU")) { const n = parseInt(upper.replace("COLOMADU","").trim()); return n >= 1 && n <= 4; }
      if (upper.startsWith("TOHUDAN")) { const n = parseInt(upper.replace("TOHUDAN","").trim()); return n === 12 || n === 14 || n === 15 || n === 16 || n === 17 || n === 18 || n === 19 || n === 20 || n === 21; }
      return false;
    },
  },
  {
    key: "kolam", label: "Kolam",
    pattern: (gh) => {
      const upper = gh.toUpperCase().trim();
      if (upper === "SAWAHAN TUNNEL 1" || upper === "TOHUDAN 22") return true;
      if (upper.startsWith("TOHUDAN")) { const n = parseInt(upper.replace("TOHUDAN","").trim()); return (n >= 1 && n <= 11) || n === 13; }
      if (upper.startsWith("SAWAHAN")) { const n = parseInt(upper.replace("SAWAHAN","").trim()); return n >= 1 && n <= 4; }
      return false;
    },
  },
  {
    key: "rnd", label: "RnD",
    pattern: (gh) => gh.toUpperCase().trim() === "OPEN FIELD 1",
  },
  {
    key: "semai", label: "GH Semai",
    pattern: () => false, // ditangani terpisah via semaiData
  },
];

// ─── Kategori sanitasi ────────────────────────────────────────────────────────
const HAMA_SUBKATEGORI = ["Nematoda", "Tikus", "Ulat Kompos", "Tungau", "Thrips", "Aphids","Ulat"];

const KATEGORI_SEMAI = [
  { key: "keriting", label: "Keriting", subkategori: [] },
  { key: "mozaik",   label: "Mozaik",   subkategori: [] },
  { key: "gsb",      label: "GSB",      subkategori: [] },
  { key: "hama",     label: "Hama",     subkategori: HAMA_SUBKATEGORI },
  { key: "fisik",    label: "Fisik",    subkategori: ["Patah Tangkai", "Tanpa Pucuk", "Abnormal","Busuk pangkal & Layu"] },
];

const LAYU_SUBKATEGORI = ["Menyempit Kering", "Menyempit Berlendir", "Busuk Kering", "Busuk Berlendir"];

const KATEGORI = [
  { key: "fisik",    label: "Fisik",    subkategori: ["Patah Tangkai", "Tanpa Pucuk", "Abnormal", "Busuk Pangkal"] },
  { key: "layu",     label: "Layu",     subkategori: LAYU_SUBKATEGORI },
  { key: "hama",     label: "Hama",     subkategori: HAMA_SUBKATEGORI },
  { key: "keriting", label: "Keriting", subkategori: [] },
  { key: "mozaik",   label: "Mozaik",   subkategori: [] },
  { key: "dm",       label: "DM",       subkategori: [] },
  { key: "gsb",      label: "GSB",      subkategori: [] },
  { key: "patogen",  label: "Patogen",  subkategori: [] },
  { key: "semai",    label: "Semai",    subkategori: ["Layu", "Stunting","Abnormal"] },
  { key: "buah",     label: "Buah",     subkategori: ["Buah Tidak Produktif", "Crack", "Buah Cacar/Peyang", "Busuk Buah","Pecah"] },
];

// todayISO dikirim ke sheet (format dd/mm/yyyy) — jangan diubah
const todayISO = new Date().toLocaleDateString("id-ID", {
  day: "2-digit", month: "2-digit", year: "numeric",
});

function hitungHST(tgl) {
  // Parse manual agar tidak kena masalah UTC
  const [y, m, d] = tgl.split("-").map(Number);
  const tanam = new Date(y, m - 1, d); // local time, bukan UTC
  const now = new Date();
  const nowLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((nowLocal - tanam) / 86400000);
}

function totalPerVarian(d = {}) {
  return KATEGORI.reduce((s, k) => s + (parseInt(d[k.key]) || 0), 0);
}

function initSemaiVarianData(varianList) {
  const obj = {};
  varianList.forEach((v) => {
    obj[v] = { keriting: "", mozaik: "", gsb: "", hama: "", fisik: "", keterangan: "", sub: {} };
  });
  return obj;
}

function totalPerVarianSemai(d = {}) {
  return KATEGORI_SEMAI.reduce((s, k) => s + (parseInt(d[k.key]) || 0), 0);
}

function initVarianData(varianList) {
  const obj = {};
  varianList.forEach((v) => {
    obj[v] = { fisik: "", layu: "", hama: "", keriting: "", mozaik: "", dm: "", gsb: "", semai: "", buah: "", keterangan: "", sub: {} };
  });
  return obj;
}

// HST mendekati batas akhir (65) ditandai supaya diprioritaskan
function hstTone(hst) {
  if (hst <= 30) return "neutral";
  if (hst <= 50) return "warning";
  return "due";
}

// ─── Komponen: input satu varian — kategori sebagai Stepper, subkategori muncul bila > 0 ──
function VarianInput({ data, onChange, kategori = KATEGORI, totalFn = totalPerVarian }) {
  const total = totalFn(data);
  const needsKet = total === 0 || total > 50;

  const handleNum = (key, val) => {
    if (val === "" || /^\d+$/.test(val)) onChange(key, val);
  };

  const handleSub = (katKey, subLabel, val) => {
    if (val === "" || /^\d+$/.test(val)) {
      const newSub = { ...(data.sub || {}), [`${katKey}_${subLabel}`]: val };
      onChange("sub", newSub);
    }
  };

  return (
    <>
      <div className="fh-card" style={{ overflow: "hidden" }}>
        {kategori.map((k) => {
          const val = data[k.key] || "";
          const filled = parseInt(val) > 0;
          return [
            <div key={k.key} className={`fh-count-row${filled ? " is-filled" : ""}`}>
              <span className="fh-count-label">{k.label}</span>
              <Stepper label={k.label} value={val} onChange={(v) => handleNum(k.key, v)} />
            </div>,
            ...(filled ? k.subkategori.map((sub) => {
              const subVal = (data.sub || {})[`${k.key}_${sub}`] || "";
              return (
                <div key={`${k.key}_${sub}`} className="fh-count-row is-sub">
                  <span className="fh-count-label">{sub}</span>
                  <Stepper label={`${k.label} ${sub}`} value={subVal} onChange={(v) => handleSub(k.key, sub, v)} />
                </div>
              );
            }) : []),
          ];
        })}
      </div>

      <label className="fh-section">
        <div className="fh-section-head">
          <span className="fh-label">Keterangan</span>
          <span className="fh-meta">{needsKet ? "wajib" : "opsional"}</span>
        </div>
        {needsKet && (
          <FieldAlert tone="warning">
            {total === 0 ? "Tidak ada sanitasi di varian ini. Tulis alasannya." : `Sanitasi ${total} tanaman, di atas 50. Tulis penyebabnya.`}
          </FieldAlert>
        )}
        <textarea
          className={`fh-textarea${needsKet && !(data.keterangan || "").trim() ? " is-error" : ""}`}
          rows={2}
          value={data.keterangan || ""}
          onChange={(e) => onChange("keterangan", e.target.value)}
          placeholder="Catatan untuk varian ini"
        />
      </label>
    </>
  );
}

// ─── App utama ────────────────────────────────────────────────────────────────
export default function Sanitasi() {
  const { user } = useAuth();
  const { getDraft, saveDraft, clearDraft } = useDraft("sanitasi");
  const _draft = getDraft();

  const [step, setStep] = useState(_draft?.step || 1);

  const { ghData, loading: loadingGH, isDemoMode, refetch: fetchGHData } = useGHData();
  const { blockedMap } = useGHBlockedList();

  const [selectedGH, setSelectedGH]     = useState(_draft?.selectedGH   || "");
  // Tab daftar GH di langkah 1 ("produksi" | "semai"); disimpan di draft sebagai selectedTipe
  const [pickTab, setPickTab]           = useState(_draft?.isSemai || _draft?.selectedTipe === "semai" ? "semai" : "produksi");
  const [varianData, setVarianData]     = useState(_draft?.varianData   || {});
  // Operator otomatis dari akun login; bisa diubah di langkah rekap
  const [operator, setOperator]         = useState(_draft?.operator || user?.nama || "");
  const [activeVarian, setActiveVarian] = useState("");
  const [fotoPreview, setFotoPreview]   = useState(null);
  const [fotoFile, setFotoFile]         = useState(null);
  const [fotoUrl, setFotoUrl]           = useState("");
  const [fotoUploading, setFotoUploading] = useState(false);

  const [selfieFile, setSelfieFile]     = useState(null);
  const [selfiePreview, setSelfiePreview] = useState(null);
  const [selfieUrl, setSelfieUrl]       = useState("");

  const [syncing, setSyncing]           = useState(false);
  // progres kirim hanya 0/1 → 1/1; label tombol cukup "Mengirim…"
  const [, setSyncProgress]             = useState({ done: 0, total: 0 });
  const [submitError, setSubmitError]   = useState(null);
  const [isOnline, setIsOnline]         = useState(navigator.onLine);

  // ── State offline ──
  const [pendingCount, setPendingCount] = useState(0);
  const [savedOffline, setSavedOffline] = useState(false);
  const [isSyncingPending, setIsSyncingPending] = useState(false);

  const [sessionKey] = useState(
    () => "sk_" + Date.now() + "_" + Math.random().toString(36).slice(2)
  );

  // ── Semai ref data ──
  const [semaiData,    setSemaiData]    = useState({});
  const [loadingSemai, setLoadingSemai] = useState(false);
  const [isSemai,      setIsSemai]      = useState(_draft?.isSemai || false);
  const [selectedRuangSemai, setSelectedRuangSemai] = useState(_draft?.selectedRuangSemai || "");

  // useAuth membaca sessionStorage setelah render pertama → isi operator begitu nama tersedia
  useEffect(() => {
    if (user?.nama) setOperator((prev) => prev || user.nama);
  }, [user?.nama]);

  useEffect(() => {
    if (step === 4) return;
    saveDraft({ step, selectedGH, selectedTipe: pickTab, varianData, operator, isSemai, selectedRuangSemai });
  }, [step, selectedGH, pickTab, varianData, operator, isSemai, selectedRuangSemai]);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await idbCount(DB_NAME);
      setPendingCount(count);
    } catch {
      setPendingCount(0);
    }
  }, []);

  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  // ── Online/offline listener ──
  useEffect(() => {
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // ── Auto-sync saat kembali online ──
  useEffect(() => {
    if (isOnline) {
      syncPendingData();
    }
  }, [isOnline]);

  // ── Sync semua data pending ke GAS ──
  const syncPendingData = useCallback(async () => {
    const allPending = await idbGetAll(DB_NAME);
    if (allPending.length === 0) return;

    setIsSyncingPending(true);

    for (const record of allPending) {
      try {
        // Upload foto jika ada (disimpan sebagai base64 saat offline)
        let resolvedFotoUrl = "";
        if (record.fotoBase64 && record.fotoFileName) {
          try {
            const uploadPayload = {
              action: "uploadFoto",
              fileName: record.fotoFileName,
              mimeType: record.fotoMimeType || "image/jpeg",
              base64Data: record.fotoBase64,
              sessionKey: record.sessionKey || sessionKey,
            };
            const result = await gasPost(SCRIPT_URL, uploadPayload);
            resolvedFotoUrl = result.url || "";
          } catch {
            resolvedFotoUrl = "";
          }
        }

        // Kirim satu payload berisi semua varian
        await gasPost(SCRIPT_URL, { ...record.payload, fotoUrl: resolvedFotoUrl });

        await idbDelete(DB_NAME, record.id);
      } catch {
        // Skip record ini, coba lagi nanti
      }
    }

    await refreshPendingCount();
    setIsSyncingPending(false);
  }, [sessionKey, refreshPendingCount]);

  const fetchSemaiRef = useCallback(async () => {
    setLoadingSemai(true);
    try {
      const json = await gasFetch(`${SCRIPT_URL}?action=getSemaiRef`);
      if (json?.semai) { setSemaiData(json.semai); saveSemaiCache(json.semai); }
      else throw new Error("kosong");
    } catch {
      const cached = loadSemaiCache();
      if (cached) setSemaiData(cached);
    } finally { setLoadingSemai(false); }
  }, []);

  useEffect(() => { fetchSemaiRef(); }, [fetchSemaiRef]);

  // Ruang semai aktif — key adalah "GH|RuangSemai", value berisi gh, periode, namaSemai, varian[]
  const semaiAktif = Object.entries(semaiData).map(([gh, info]) => ({
    key: gh,
    gh,
    periode: info.periode,
    namaSemai: info.namaSemai || "",
    varian: info.varian || [],
    tanam: info.tanam,
  }));

  const ghAktif = Object.entries(ghData).filter(([gh, info]) => {
    if (!info.tanam) return true;
    return hitungHST(info.tanam) <= hstMaksGH(gh, HST_MAKS);
  });

  const handleSelectGH = (gh) => {
    if (warnIfGHBlocked(gh, blockedMap)) return;
    setIsSemai(false);
    setSelectedRuangSemai("");
    setSelectedGH(gh);
    setVarianData(initVarianData(ghData[gh]?.varian || []));
    setActiveVarian("");
    setStep(2);
  };

  const handleSelectSemai = (item) => {
    if (warnIfGHBlocked(item.gh, blockedMap)) return;
    setIsSemai(true);
    setSelectedGH(item.gh);
    setSelectedRuangSemai(item.key);
    setVarianData(initSemaiVarianData(item.varian));
    setActiveVarian("");
    setStep(2);
  };

  const handleVarianChange = (varian, field, val) => {
    setVarianData((prev) => ({ ...prev, [varian]: { ...prev[varian], [field]: val } }));
  };

  const ghInfo     = ghData[selectedGH];
  const semaiInfo  = semaiData[selectedGH];
  const varianList = isSemai
    ? (semaiData[selectedGH]?.varian || [])
    : (ghInfo?.varian || []);
  const hst        = isSemai
    ? (semaiInfo?.tanam ? hitungHST(semaiInfo.tanam) : null)
    : (ghInfo?.tanam ? hitungHST(ghInfo.tanam) : null);
  const activeKategori = isSemai ? KATEGORI_SEMAI : KATEGORI;
  const activeTotalFn  = isSemai ? totalPerVarianSemai : totalPerVarian;
  const umurLabel      = isSemai ? "HSS" : "HST";
  const periode        = isSemai ? semaiInfo?.periode : ghInfo?.periode;

  const varianNeedsKet = (v) => {
    const d = varianData[v] || {};
    const total = activeTotalFn(d);
    const needsKet = total === 0 || total > 50;
    return needsKet && !(d.keterangan || "").trim();
  };
  const allVarianValid = varianList.every((v) => !varianNeedsKet(v));
  const kurangKet      = varianList.filter(varianNeedsKet).length;
  const totalSemuaVarian = varianList.reduce((s, v) => s + activeTotalFn(varianData[v] || {}), 0);
  const loadingRef     = isSemai ? loadingSemai : loadingGH;
  // data GH harus sudah termuat — periode & HST diambil dari situ
  const canSubmit      = operator.trim().length > 0 && !syncing && !loadingRef;

  const uploadFoto = async (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target.result.split(",")[1];
        const payload = {
          action: "uploadFoto",
          fileName: `sanitasi_${selectedGH}_${todayISO.replace(/\//g, "-")}_${Date.now()}.jpg`,
          mimeType: file.type || "image/jpeg",
          base64Data: base64,
          sessionKey,
        };
        try {
          const result = await gasPost(SCRIPT_URL, payload);
          resolve(result.url || "");
        } catch {
          resolve("");
        }
      };
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });
  };

  // ── Buat satu payload berisi semua varian sekaligus (dipakai saat online dan offline) ──
  const buildPayload = () => {
    const client_timestamp = new Date().toISOString();
    const rows = varianList.map((varian) => {
      const d = varianData[varian] || {};
      const subKetArr = [];
      activeKategori.forEach((k) => {
        if (k.subkategori.length > 0 && parseInt(d[k.key]) > 0) {
          k.subkategori.forEach((sub) => {
            const subVal = (d.sub || {})[`${k.key}_${sub}`];
            if (parseInt(subVal) > 0) subKetArr.push(`${k.label}-${sub}: ${subVal}`);
          });
        }
      });
      const keteranganFinal = [d.keterangan, ...subKetArr].filter(Boolean).join(" | ");
      const baseRow = { varian, keterangan: keteranganFinal };
      if (isSemai) {
        return { ...baseRow, keriting: d.keriting || 0, mozaik: d.mozaik || 0, gsb: d.gsb || 0, hama: d.hama || 0, fisik: d.fisik || 0 };
      }
      return { ...baseRow, fisik: d.fisik || 0, layu: d.layu || 0, hama: d.hama || 0, keriting: d.keriting || 0, mozaik: d.mozaik || 0, dm: d.dm || 0, gsb: d.gsb || 0, semai: d.semai || 0, buah: d.buah || 0 };
    });

    return {
      action: "submitSanitasi",
      client_timestamp,
      tanggal: todayISO,
      gh: selectedGH,
      tipe: isSemai ? "semai" : "produksi",
      ruang_semai: isSemai ? selectedRuangSemai : "",
      periode: isSemai ? (semaiInfo?.periode || "") : (ghInfo?.periode || ""),
      hst: hst ?? "",
      operator: operator || "",
      fotoUrl: "",
      rows,
    };
  };

  const handleSubmit = async () => {
    if (warnIfGHBlocked(selectedGH, blockedMap)) return;
    setSyncing(true);
    setSubmitError(null);
    setSyncProgress({ done: 0, total: 1 });

    // ── Mode Demo ──
    if (isDemoMode) {
      await new Promise((r) => setTimeout(r, 700));
      setSyncProgress({ done: 1, total: 1 });
      setStep(4);
      setSyncing(false);
      return;
    }

    const payload = buildPayload();

    // ══ MODE OFFLINE ══════════════════════════════════════════════════════════
    if (!isOnline) {
      // Baca foto sebagai base64 untuk disimpan lokal
      let fotoBase64 = null;
      let fotoMimeType = null;
      let fotoFileName = null;

      if (fotoFile) {
        await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => {
            fotoBase64 = ev.target.result.split(",")[1];
            fotoMimeType = fotoFile.type || "image/jpeg";
            fotoFileName = `sanitasi_${selectedGH}_${todayISO.replace(/\//g, "-")}_${Date.now()}.jpg`;
            resolve();
          };
          reader.onerror = () => resolve();
          reader.readAsDataURL(fotoFile);
        });
      }

      try {
        await idbAdd(DB_NAME, {
          tanggal: todayISO,
          gh: selectedGH,
          createdAt: Date.now(),
          payload,
          fotoBase64,
          fotoMimeType,
          fotoFileName,
          sessionKey,
        });
        await refreshPendingCount();
        setSavedOffline(true);
      } catch {
        setSubmitError("Data belum tersimpan di perangkat. Tekan Simpan offline sekali lagi.");
        setSyncing(false);
        return;
      }

      setStep(4);
      setSyncing(false);
      return;
    }

    // ══ MODE ONLINE ═══════════════════════════════════════════════════════════
    setSavedOffline(false);

    // Upload foto papan dulu
    let resolvedFotoUrl = fotoUrl;
    if (fotoFile && !fotoUrl) {
      setFotoUploading(true);
      resolvedFotoUrl = await uploadFoto(fotoFile);
      setFotoUrl(resolvedFotoUrl);
      setFotoUploading(false);
    }

    // Upload selfie operator
    let resolvedSelfieUrl = selfieUrl;
    if (selfieFile && !selfieUrl) {
      const selfiePayload = {
        action: "uploadFoto",
        fileName: `${operator.trim().replace(/\s+/g, "_")}_${todayISO.replace(/\//g, "-")}.jpg`,
        mimeType: selfieFile.type || "image/jpeg",
        base64Data: await new Promise((res) => {
          const reader = new FileReader();
          reader.onload = (ev) => res(ev.target.result.split(",")[1]);
          reader.readAsDataURL(selfieFile);
        }),
        sessionKey: sessionKey + "_selfie",
      };
      try {
        const result = await gasPost(SCRIPT_URL, selfiePayload);
        resolvedSelfieUrl = result.url || "";
        setSelfieUrl(resolvedSelfieUrl);
      } catch { resolvedSelfieUrl = ""; }
    }

    try {
      await gasPost(SCRIPT_URL, { ...payload, fotoUrl: resolvedFotoUrl || "", selfieUrl: resolvedSelfieUrl || "" });
      setSyncProgress({ done: 1, total: 1 });
    } catch (e) {
      // Gagal jaringan (TypeError) → simpan ke antrean offline (termasuk foto) agar data tidak hilang.
      if (e instanceof TypeError) {
        try {
          let fotoBase64 = null, fotoMimeType = null, fotoFileName = null;
          if (fotoFile) {
            await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = (ev) => {
                fotoBase64 = ev.target.result.split(",")[1];
                fotoMimeType = fotoFile.type || "image/jpeg";
                fotoFileName = `sanitasi_${selectedGH}_${todayISO.replace(/\//g, "-")}_${Date.now()}.jpg`;
                resolve();
              };
              reader.onerror = () => resolve();
              reader.readAsDataURL(fotoFile);
            });
          }
          await idbAdd(DB_NAME, {
            tanggal: todayISO, gh: selectedGH, createdAt: Date.now(),
            payload, fotoBase64, fotoMimeType, fotoFileName, sessionKey,
          });
          await refreshPendingCount();
          setSavedOffline(true);
          setStep(4);
          setSyncing(false);
          return;
        } catch { /* gagal simpan lokal → tampilkan error di bawah */ }
      }
      setSubmitError("Data belum terkirim karena koneksi terputus. Cek sinyal lalu tekan Kirim lagi.");
      setSyncing(false);
      return;
    }

    setStep(4);
    setSyncing(false);
  };

  const resetForm = () => {
    clearDraft();
    setStep(1);
    setSelectedGH("");
    setIsSemai(false);
    setSelectedRuangSemai("");
    setVarianData({});
    setActiveVarian("");
    setOperator(user?.nama || "");
    setFotoPreview(null);
    setFotoFile(null);
    setFotoUrl("");
    setFotoUploading(false);
    setSelfieFile(null);
    setSelfiePreview(null);
    setSelfieUrl("");
    setSyncing(false);
    setSyncProgress({ done: 0, total: 0 });
    setSubmitError(null);
    setSavedOffline(false);
  };

  // Varian aktif default ke varian pertama
  const activeKey  = varianList.includes(activeVarian) ? activeVarian : (varianList[0] || "");
  const activeIdx  = varianList.indexOf(activeKey);
  const nextVarian = varianList[activeIdx + 1];
  const goToVarian = (v) => { setActiveVarian(v); window.scrollTo(0, 0); };

  // ── Header ──
  const title = step === 2 || step === 3 ? `Sanitasi · ${selectedGH}` : "Sanitasi";
  const ghMeta = [periode && `P${periode}`, hst !== null && `${hst} ${umurLabel}`].filter(Boolean).join(" · ");
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
      <button type="button" className="fh-btn fh-btn-primary" disabled={!allVarianValid} onClick={() => setStep(3)}>
        {allVarianValid ? "Lihat rekap" : `Isi keterangan ${kurangKet} varian`}
      </button>
    );
  } else if (step === 3) {
    const sendLabel = syncing
      ? (fotoUploading ? "Upload foto…" : "Mengirim…")
      : loadingRef ? "Memuat data GH…"
      : isDemoMode ? "Kirim demo"
      : !isOnline ? `Simpan offline (${varianList.length} varian)`
      : `Kirim ${varianList.length} varian`;
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
        <FieldAlert tone="warning" action={{ label: "Coba lagi", onClick: fetchGHData }}>
          Server tidak terjangkau. Mode demo, data tidak dikirim ke sheet.
        </FieldAlert>
      )}

      {/* ══ STEP 1 — Pilih GH ══ */}
      {step === 1 && (
        <>
          <SegmentTabs
            label="Jenis GH"
            value={pickTab}
            onChange={setPickTab}
            tabs={[
              { key: "produksi", label: "GH produksi" },
              { key: "semai", label: "GH semai" },
            ]}
          />

          {pickTab === "produksi" && (
            <GHPicker
              loading={loadingGH}
              selected={isSemai ? "" : selectedGH}
              onSelect={handleSelectGH}
              emptyText={`Tidak ada GH aktif (HST ≤ ${HST_MAKS}).`}
              items={ghAktif.flatMap(([gh, info]) => {
                const tipe = TIPE_GH.find((t) => t.pattern(gh));
                if (!tipe) return [];
                const hstGH = info.tanam ? hitungHST(info.tanam) : null;
                const blockedInfo = blockedMap[gh.trim().toUpperCase()];
                const badges = [];
                if (blockedInfo) badges.push({ label: blockedInfo.aksi, tone: "danger" });
                if (hstGH !== null) badges.push({ label: `${hstGH} HST`, tone: hstTone(hstGH) });
                return [{
                  gh,
                  meta: [tipe.label, info.periode && `P${info.periode}`, `${info.varian?.length || 0} varian`].filter(Boolean).join(" · "),
                  badges,
                  sortValue: hstGH,
                }];
              })}
            />
          )}

          {pickTab === "semai" && (
            <GHPicker
              loading={loadingSemai}
              selected={isSemai ? selectedRuangSemai : ""}
              onSelect={(key) => handleSelectSemai(semaiAktif.find((s) => s.key === key))}
              emptyText="Tidak ada ruang semai aktif."
              items={semaiAktif.map((item) => {
                const hss = item.tanam ? hitungHST(item.tanam) : null;
                return {
                  gh: item.key,
                  meta: [item.periode && `P${item.periode}`, `${item.varian?.length || 0} varian`].filter(Boolean).join(" · "),
                  badges: hss !== null ? [{ label: `${hss} HSS`, tone: "neutral" }] : [],
                  sortValue: hss,
                };
              })}
            />
          )}
        </>
      )}

      {/* ══ STEP 2 — Input per varian ══ */}
      {step === 2 && (
        <>
          <section className="fh-section">
            <div className="fh-section-head">
              <span className="fh-label">Sanitasi per varian</span>
              <span className="fh-meta">{varianList.length} varian</span>
            </div>
            {varianList.length > 1 && (
              <SegmentTabs
                label="Varian"
                value={activeKey}
                onChange={setActiveVarian}
                tabs={varianList.map((v) => ({ key: v, label: v, count: activeTotalFn(varianData[v] || {}) }))}
              />
            )}
          </section>

          {varianList.length === 0 && (
            <FieldAlert tone="warning">GH ini belum punya daftar varian di sheet REF. Hubungi Team Data.</FieldAlert>
          )}

          {activeKey && (
            <section className="fh-section">
              <div className="fh-section-head">
                <span className="fh-card-title">{activeKey}</span>
                <span className="fh-meta">total {activeTotalFn(varianData[activeKey] || {})}</span>
              </div>
              <VarianInput
                key={activeKey}
                data={varianData[activeKey] || {}}
                onChange={(field, val) => handleVarianChange(activeKey, field, val)}
                kategori={activeKategori}
                totalFn={activeTotalFn}
              />
              {nextVarian && (
                <button type="button" className="fh-btn fh-btn-secondary" onClick={() => goToVarian(nextVarian)}>
                  Varian berikut: {nextVarian}
                </button>
              )}
            </section>
          )}

          <div className="fh-card is-sunken fh-card-body">
            <div className="fh-section-head">
              <span className="fh-overline">Total seluruh varian</span>
              <span className="fh-num" style={{ fontSize: 18 }}>{formatAngka(totalSemuaVarian)}</span>
            </div>
            {varianList.length > 1 && varianList.map((v) => (
              <div key={v} className="fh-section-head" style={{ fontSize: 15 }}>
                <span>{v}</span>
                <span className="fh-num">{activeTotalFn(varianData[v] || {})}</span>
              </div>
            ))}
          </div>

          <div className="fh-grid-2" style={{ gap: 12 }}>
            <PhotoBox
              label="Foto papan"
              hint={isOnline ? "Opsional, 1 foto untuk seluruh GH" : "Opsional, upload otomatis saat online"}
              preview={fotoPreview}
              capture="environment"
              onChange={(file, url) => { setFotoFile(file); setFotoUrl(""); setFotoPreview(url); }}
              onClear={() => { setFotoFile(null); setFotoUrl(""); setFotoPreview(null); }}
            />
            <PhotoBox
              label="Selfie operator"
              hint="Opsional"
              preview={selfiePreview}
              capture="user"
              onChange={(file, url) => { setSelfieFile(file); setSelfiePreview(url); setSelfieUrl(""); }}
              onClear={() => { setSelfieFile(null); setSelfiePreview(null); setSelfieUrl(""); }}
            />
          </div>
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
              ["GH", isSemai ? selectedRuangSemai : selectedGH],
              ["Jenis", isSemai ? "Semai" : "Produksi"],
              ["Periode", periode || "-"],
              [umurLabel, hst !== null ? `${hst} hari` : "-"],
              ["Total sanitasi", `${formatAngka(totalSemuaVarian)} tanaman`],
              ["Foto papan", fotoPreview ? (isOnline ? "Siap diupload" : "Tersimpan lokal") : "Tidak ada"],
              ["Selfie", selfiePreview ? "Ada" : "Tidak ada"],
            ]}
          />

          <ReviewTable
            title="Detail per varian"
            columns={[
              { key: "varian", label: "Varian" },
              { key: "rincian", label: "Rincian" },
              { key: "total", label: "Total", num: true },
            ]}
            rows={varianList.map((v) => {
              const d = varianData[v] || {};
              const aktif = activeKategori.filter((k) => parseInt(d[k.key]) > 0);
              const rincian = aktif.map((k) => {
                const subs = k.subkategori
                  .filter((sub) => parseInt((d.sub || {})[`${k.key}_${sub}`]) > 0)
                  .map((sub) => `${sub} ${(d.sub || {})[`${k.key}_${sub}`]}`);
                return `${k.label} ${d[k.key]}${subs.length ? ` (${subs.join(", ")})` : ""}`;
              });
              return {
                key: v,
                varian: v,
                rincian: (
                  <>
                    <span style={{ fontSize: 13 }}>{rincian.length ? rincian.join(" · ") : "-"}</span>
                    {d.keterangan && <span className="fh-row-sub">{d.keterangan}</span>}
                  </>
                ),
                total: activeTotalFn(d),
              };
            })}
            footer={{ varian: "Total", rincian: "", total: formatAngka(totalSemuaVarian) }}
          />

          {submitError && <FieldAlert tone="danger">{submitError}</FieldAlert>}
        </>
      )}

      {/* ══ STEP 4 — Sukses ══ */}
      {step === 4 && (
        <SuccessState
          offline={savedOffline}
          title={isDemoMode ? "Demo selesai" : savedOffline ? "Tersimpan di perangkat" : `Sanitasi ${selectedGH} terkirim`}
          description={isDemoMode
            ? "Data tidak dikirim (mode demo)."
            : savedOffline
              ? `Terkirim otomatis ke sheet saat online.${pendingCount > 0 ? ` ${pendingCount} GH menunggu.` : ""}`
              : `${varianList.length} varian masuk ke sheet.`}
          summary={[
            ["GH", isSemai ? selectedRuangSemai : selectedGH],
            [umurLabel, hst ?? "-"],
            ...varianList.map((v) => [v, `${activeTotalFn(varianData[v] || {})} tanaman`]),
            ["Total", `${formatAngka(totalSemuaVarian)} tanaman`],
            ["Operator", operator],
          ]}
        />
      )}
      {step === 4 && fotoUrl && (
        <a className="fh-link-btn" style={{ alignSelf: "center" }} href={fotoUrl} target="_blank" rel="noopener noreferrer">
          Lihat foto papan di Drive
        </a>
      )}
    </FormShell>
  );
}
