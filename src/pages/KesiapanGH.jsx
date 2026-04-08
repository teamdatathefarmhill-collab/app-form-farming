import { useState, useEffect, useCallback } from "react";
import { idbAdd, idbGetAll, idbDelete, idbCount } from "../utils/idb";

const DB_NAME    = "KesiapanOfflineDB";
const SCRIPT_URL = import.meta.env.VITE_GAS_KESIAPAN_URL;

// ─── Definisi kategori & item ─────────────────────────────────────────────────
const KATEGORI = [
  {
    key: "irigasi", label: "Sistem Irigasi", icon: "💧",
    warna: "#1565C0", badge: "#e3f2fd", border: "#90CAF9",
    items: [
      { code: "A1", label: "Kondisi pipa & selang drip" },
      { code: "A2", label: "Fungsi pompa & timer irigasi" },
      { code: "A3", label: "EC & pH larutan nutrisi" },
    ],
  },
  {
    key: "struktur", label: "Struktur GH", icon: "🏗️",
    warna: "#2e7d32", badge: "#e8f5e9", border: "#a5d6a7",
    items: [
      { code: "B1", label: "Kondisi atap & plastik mulsa" },
      { code: "B2", label: "Ventilasi & sirkulasi udara" },
    ],
  },
  {
    key: "peralatan", label: "Peralatan Tanam", icon: "🧰",
    warna: "#e65100", badge: "#fff3e0", border: "#ffb74d",
    items: [
      { code: "C1", label: "Kondisi tray & media tanam" },
      { code: "C2", label: "Ketersediaan stok nutrisi" },
    ],
  },
  {
    key: "sanitasi", label: "Sanitasi GH", icon: "🧹",
    warna: "#6a1b9a", badge: "#f3e5f5", border: "#ce93d8",
    items: [
      { code: "D1", label: "Kebersihan lantai & jalur tanam" },
      { code: "D2", label: "Bebas gulma & kontaminasi" },
    ],
  },
];

const ALL_ITEMS = KATEGORI.flatMap(k => k.items);

const LOKASI_GH = {
  Tohudan:  ["GH-01","GH-02","GH-03","GH-04","GH-05"],
  Sawahan:  ["GH-01","GH-02","GH-03"],
  Colomadu: ["GH-01","GH-02","GH-03","GH-04"],
  Bergas:   ["GH-01","GH-02"],
};

const SKOR_DESC = {
  1: { label: "Buruk",       warna: "#c62828", bg: "#ffebee", border: "#ef9a9a" },
  2: { label: "Cukup",       warna: "#e65100", bg: "#fff3e0", border: "#ffb74d" },
  3: { label: "Baik",        warna: "#1565C0", bg: "#e3f2fd", border: "#90CAF9" },
  4: { label: "Sangat Baik", warna: "#2e7d32", bg: "#e8f5e9", border: "#a5d6a7" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function avg(vals) {
  const filled = vals.filter(v => v > 0);
  if (!filled.length) return null;
  return +(filled.reduce((a, b) => a + b, 0) / filled.length).toFixed(2);
}

function statusDariSkor(skor) {
  if (skor === null) return { label: "Belum diisi",     warna: "#aaa",    bg: "#f5f5f5", border: "#e0e0e0" };
  if (skor >= 3.0)  return { label: "Layak Tanam",      warna: "#2e7d32", bg: "#e8f5e9", border: "#a5d6a7" };
  if (skor >= 2.0)  return { label: "Perlu Perbaikan",  warna: "#e65100", bg: "#fff3e0", border: "#ffb74d" };
  return              { label: "Tidak Layak",    warna: "#c62828", bg: "#ffebee", border: "#ef9a9a" };
}

const LS_KEY = `kesiapan_${new Date().toLocaleDateString("id-ID")}`;
function getSubmittedToday() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
}
function markSubmitted(key) {
  const list = getSubmittedToday();
  if (!list.includes(key)) localStorage.setItem(LS_KEY, JSON.stringify([...list, key]));
}

const todayISO   = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
const todayLabel = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

function initScores()  { return Object.fromEntries(ALL_ITEMS.map(i => [i.code, 0])); }
function initCatatan() { return Object.fromEntries(ALL_ITEMS.map(i => [i.code, ""])); }

// ─── Sub-komponen Skor Button ─────────────────────────────────────────────────
function SkorBtn({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 5 }}>
      {[1, 2, 3, 4].map(n => {
        const s = SKOR_DESC[n];
        const active = value === n;
        return (
          <button key={n} onClick={() => onChange(n)}
            style={{ flex: 1, padding: "8px 4px", border: `1.5px solid ${active ? s.border : "#e0e0e0"}`, borderRadius: 9, background: active ? s.bg : "#fafafa", color: active ? s.warna : "#bbb", fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "all .15s", lineHeight: 1 }}>
            {n}
            <div style={{ fontSize: 8, marginTop: 2, fontWeight: 400, color: active ? s.warna : "#ddd" }}>{s.label}</div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function KesiapanGH() {
  const [step, setStep]         = useState(1);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount]         = useState(0);
  const [isSyncingPending, setIsSyncingPending] = useState(false);

  // Step 1 — Identitas
  const [lokasi, setLokasi]     = useState("");
  const [gh, setGh]             = useState("");
  const [operator, setOperator] = useState("");
  const [tanggal, setTanggal]   = useState(new Date().toISOString().split("T")[0]);

  // Step 2 — Penilaian
  const [scores, setScores]       = useState(initScores);
  const [catatan, setCatatan]     = useState(initCatatan);
  const [activeKat, setActiveKat] = useState(KATEGORI[0].key);

  // Submit state
  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [savedOffline, setSavedOffline] = useState(false);

  // Double submit guard
  const [submittedToday, setSubmittedToday] = useState(getSubmittedToday);
  const [showWarning, setShowWarning]       = useState(false);

  const submittedKey = lokasi && gh ? `${lokasi}__${gh}` : "";

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const refreshPendingCount = useCallback(async () => {
    try { setPendingCount(await idbCount(DB_NAME)); } catch { setPendingCount(0); }
  }, []);

  useEffect(() => { refreshPendingCount(); }, [refreshPendingCount]);
  useEffect(() => { if (isOnline) syncPending(); }, [isOnline]);

  const syncPending = useCallback(async () => {
    const all = await idbGetAll(DB_NAME);
    if (!all.length) return;
    setIsSyncingPending(true);
    for (const record of all) {
      try {
        const res  = await fetch(SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(record.payload), redirect: "follow" });
        const json = await res.json();
        if (json.success) {
          markSubmitted(record.key);
          setSubmittedToday(getSubmittedToday());
          await idbDelete(DB_NAME, record.id);
        }
      } catch { /* retry later */ }
    }
    await refreshPendingCount();
    setIsSyncingPending(false);
  }, [refreshPendingCount]);

  // ─── Kalkulasi ─────────────────────────────────────────────────────────────
  const katAvg = (kat) => avg(kat.items.map(i => scores[i.code]));

  const totalScore = (() => {
    const avgs = KATEGORI.map(k => katAvg(k)).filter(v => v !== null);
    return avgs.length ? avg(avgs) : null;
  })();

  const filledCount = ALL_ITEMS.filter(i => scores[i.code] > 0).length;
  const allFilled   = filledCount === ALL_ITEMS.length;
  const canNext1    = lokasi && gh && operator.trim();
  const canSubmit   = allFilled;
  const status      = statusDariSkor(totalScore);

  // ─── Build payload ──────────────────────────────────────────────────────────
  const buildPayload = () => {
    const p = { action: "submitKesiapan", tanggal: todayISO, lokasi, gh, operator };
    ALL_ITEMS.forEach(item => {
      p[`skor_${item.code.toLowerCase()}`]    = scores[item.code] || 0;
      p[`catatan_${item.code.toLowerCase()}`] = catatan[item.code] || "";
    });
    KATEGORI.forEach(k => { p[`skor_${k.key}`] = katAvg(k) ?? 0; });
    p.skor_total = totalScore ?? 0;
    p.status     = status.label;
    return p;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    const payload = buildPayload();

    if (!isOnline) {
      try {
        await idbAdd(DB_NAME, { key: submittedKey, tanggal: todayISO, createdAt: Date.now(), payload });
        await refreshPendingCount();
        markSubmitted(submittedKey); setSubmittedToday(getSubmittedToday());
        setSavedOffline(true); setStep(3);
      } catch { setSubmitError("Gagal menyimpan offline. Coba lagi."); }
      finally { setSubmitting(false); }
      return;
    }

    try {
      const res  = await fetch(SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(payload), redirect: "follow" });
      const json = await res.json();
      if (json.success) {
        markSubmitted(submittedKey); setSubmittedToday(getSubmittedToday());
        setSavedOffline(false); setStep(3);
      } else throw new Error(json.error || "GAS error");
    } catch {
      try {
        await idbAdd(DB_NAME, { key: submittedKey, tanggal: todayISO, createdAt: Date.now(), payload });
        await refreshPendingCount();
        markSubmitted(submittedKey); setSubmittedToday(getSubmittedToday());
        setSavedOffline(true); setStep(3);
      } catch { setSubmitError("Gagal mengirim & menyimpan. Periksa koneksi."); }
    } finally { setSubmitting(false); }
  };

  const handleLanjutStep2 = () => {
    if (submittedToday.includes(submittedKey)) setShowWarning(true);
    else setStep(2);
  };

  const resetForm = () => {
    setStep(1); setLokasi(""); setGh(""); setOperator("");
    setTanggal(new Date().toISOString().split("T")[0]);
    setScores(initScores()); setCatatan(initCatatan());
    setActiveKat(KATEGORI[0].key);
    setSavedOffline(false); setSubmitError(null);
  };

  const katAktif = KATEGORI.find(k => k.key === activeKat);

  // ─── RENDER ────────────────────────────────────────────────────────────────
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
                style={{ fontSize: 10, fontWeight: 700, background: isOnline ? "rgba(33,150,243,0.3)" : "rgba(255,179,0,0.3)", border: `1px solid ${isOnline ? "rgba(33,150,243,0.6)" : "rgba(255,179,0,0.6)"}`, color: "#fff", padding: "2px 8px", borderRadius: 20, cursor: isOnline ? "pointer" : "default", display: "flex", alignItems: "center", gap: 4 }}>
                {isSyncingPending ? "⏳" : "📤"} {pendingCount} pending
              </button>
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
        {step < 3 && (
          <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
            {[1, 2].map(s => (
              <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: s <= step ? "#80CBC4" : "rgba(255,255,255,0.2)", transition: "background 0.3s" }} />
            ))}
          </div>
        )}
      </div>

      {/* Modal double submit */}
      {showWarning && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
            <div style={{ fontSize: 36, textAlign: "center", marginBottom: 12 }}>⚠️</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#333", textAlign: "center", marginBottom: 8 }}>GH Sudah Diisi Hari Ini</div>
            <div style={{ fontSize: 13, color: "#666", textAlign: "center", marginBottom: 20, lineHeight: 1.5 }}>
              <strong>{lokasi} {gh}</strong> sudah dicek hari ini. Data baru akan ditambahkan ke Sheets.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowWarning(false)} style={{ flex: 1, padding: 11, background: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: 10, color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Batal</button>
              <button onClick={() => { setShowWarning(false); setStep(2); }} style={{ flex: 1, padding: 11, background: "#e53935", border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Isi Ulang</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: 16 }}>

        {/* ══ STEP 1 — Identitas ══ */}
        {step === 1 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: "#004D40", marginBottom: 4 }}>Identitas GH</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 18 }}>Isi data greenhouse yang akan dinilai</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Lokasi */}
              <div>
                <label style={{ fontSize: 11, color: "#00695C", letterSpacing: 1.1, textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: 6 }}>Lokasi</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {Object.keys(LOKASI_GH).map(l => (
                    <button key={l} onClick={() => { setLokasi(l); setGh(""); }}
                      style={{ padding: "11px 8px", borderRadius: 12, border: `1.5px solid ${lokasi === l ? "#004D40" : "#e0e0e0"}`, background: lokasi === l ? "#e0f2f1" : "#fff", color: lokasi === l ? "#004D40" : "#555", fontSize: 14, fontWeight: lokasi === l ? 700 : 400, cursor: "pointer", transition: "all .15s" }}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {/* GH */}
              {lokasi && (
                <div>
                  <label style={{ fontSize: 11, color: "#00695C", letterSpacing: 1.1, textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: 6 }}>Greenhouse</label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    {LOKASI_GH[lokasi].map(g => (
                      <button key={g} onClick={() => setGh(g)}
                        style={{ padding: "11px 8px", borderRadius: 12, border: `1.5px solid ${gh === g ? "#004D40" : "#e0e0e0"}`, background: gh === g ? "#e0f2f1" : "#fff", color: gh === g ? "#004D40" : "#555", fontSize: 14, fontWeight: gh === g ? 700 : 400, cursor: "pointer", transition: "all .15s" }}>
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Operator */}
              <div>
                <label style={{ fontSize: 11, color: "#00695C", letterSpacing: 1.1, textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: 6 }}>
                  Nama Operator <span style={{ color: "#e53935" }}>*</span>
                </label>
                <input type="text" value={operator} onChange={e => setOperator(e.target.value)} placeholder="Nama koordinator / petugas..."
                  style={{ width: "100%", padding: "12px 14px", background: "#fff", border: `1.5px solid ${operator.trim() ? "#80CBC4" : "#e0e0e0"}`, borderRadius: 10, color: "#333", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
              </div>

              {/* Tanggal */}
              <div>
                <label style={{ fontSize: 11, color: "#00695C", letterSpacing: 1.1, textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: 6 }}>Tanggal</label>
                <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)}
                  style={{ width: "100%", padding: "12px 14px", background: "#fff", border: "1.5px solid #e0e0e0", borderRadius: 10, color: "#333", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
              </div>

              {/* Panduan skor */}
              <div style={{ background: "#fff", border: "1.5px solid #e0e0e0", borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Panduan skor</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {Object.entries(SKOR_DESC).map(([n, s]) => (
                    <div key={n} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 26, height: 26, borderRadius: 7, background: s.bg, border: `1px solid ${s.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: s.warna, flexShrink: 0 }}>{n}</div>
                      <span style={{ fontSize: 11, color: "#666", lineHeight: 1.3 }}>{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ STEP 2 — Penilaian ══ */}
        {step === 2 && (
          <div>
            {/* Info */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
              <div style={{ background: "#e0f2f1", border: "1px solid #80CBC4", borderRadius: 20, padding: "3px 12px", fontSize: 12, color: "#004D40", fontWeight: 700 }}>{lokasi} · {gh}</div>
              <div style={{ background: "#f5f5f5", borderRadius: 20, padding: "3px 12px", fontSize: 12, color: "#666" }}>{operator}</div>
            </div>

            {!isOnline && (
              <div style={{ marginBottom: 12, padding: "8px 12px", background: "#fff3e0", border: "1px solid #ffb74d", borderRadius: 9, display: "flex", alignItems: "center", gap: 8 }}>
                <span>📵</span>
                <span style={{ fontSize: 11, color: "#e65100" }}>Offline — data tersimpan lokal & dikirim otomatis saat online</span>
              </div>
            )}

            {/* Progres */}
            <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>{filledCount}/{ALL_ITEMS.length} item dinilai</div>
            <div style={{ background: "#e0e0e0", borderRadius: 4, height: 5, marginBottom: 16, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 4, background: "#00897B", width: `${(filledCount / ALL_ITEMS.length) * 100}%`, transition: "width 0.3s" }} />
            </div>

            {/* Tab kategori */}
            <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto", paddingBottom: 2 }}>
              {KATEGORI.map(k => {
                const katFilled = k.items.every(i => scores[i.code] > 0);
                const isActive  = activeKat === k.key;
                return (
                  <button key={k.key} onClick={() => setActiveKat(k.key)}
                    style={{ flexShrink: 0, padding: "7px 14px", borderRadius: 20, border: `1.5px solid ${isActive ? k.warna : "#e0e0e0"}`, background: isActive ? k.badge : "#fff", color: isActive ? k.warna : "#888", fontSize: 12, fontWeight: isActive ? 700 : 400, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
                    <span>{k.icon}</span>
                    {k.label}
                    {katFilled && <span style={{ fontSize: 10 }}>✅</span>}
                  </button>
                );
              })}
            </div>

            {/* Item penilaian kategori aktif */}
            {katAktif && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {katAktif.items.map(item => (
                  <div key={item.code} style={{ background: "#fff", border: `1.5px solid ${scores[item.code] > 0 ? SKOR_DESC[scores[item.code]].border : "#e0e0e0"}`, borderRadius: 12, padding: "13px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <span style={{ fontFamily: "monospace", fontSize: 10, background: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: 5, padding: "1px 6px", color: "#888" }}>{item.code}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>{item.label}</span>
                      {scores[item.code] > 0 && (
                        <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: SKOR_DESC[scores[item.code]].warna, background: SKOR_DESC[scores[item.code]].bg, border: `1px solid ${SKOR_DESC[scores[item.code]].border}`, borderRadius: 20, padding: "1px 8px" }}>
                          {SKOR_DESC[scores[item.code]].label}
                        </span>
                      )}
                    </div>

                    <SkorBtn
                      value={scores[item.code]}
                      onChange={val => setScores(prev => ({ ...prev, [item.code]: val }))}
                    />

                    <textarea
                      value={catatan[item.code]}
                      onChange={e => setCatatan(prev => ({ ...prev, [item.code]: e.target.value }))}
                      placeholder="Catatan (opsional)..."
                      rows={2}
                      style={{ width: "100%", marginTop: 8, padding: "8px 10px", border: "1.5px solid #e0e0e0", borderRadius: 8, fontSize: 12, color: "#333", background: "#fafafa", resize: "none", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Ringkasan skor */}
            <div style={{ marginTop: 16, background: "#fff", border: "1.5px solid #e0e0e0", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", background: "#f5f5f5", borderBottom: "1px solid #e0e0e0", fontSize: 12, fontWeight: 700, color: "#555" }}>Ringkasan skor</div>
              <div style={{ padding: "10px 14px" }}>
                {KATEGORI.map(k => {
                  const v = katAvg(k);
                  const s = statusDariSkor(v);
                  return (
                    <div key={k.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f0f0f0" }}>
                      <span style={{ fontSize: 12, color: "#555" }}>{k.icon} {k.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: v !== null ? s.warna : "#ccc", fontFamily: "monospace" }}>
                        {v !== null ? v.toFixed(2) : "—"}
                      </span>
                    </div>
                  );
                })}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, marginTop: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#333" }}>Total</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: status.warna, fontFamily: "monospace" }}>
                      {totalScore !== null ? totalScore.toFixed(2) : "—"}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: status.warna, background: status.bg, border: `1px solid ${status.border}`, borderRadius: 20, padding: "2px 10px" }}>
                      {status.label}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {submitError && (
              <div style={{ fontSize: 12, color: "#c62828", background: "#ffebee", border: "1px solid #ef9a9a", borderRadius: 8, padding: "8px 12px", marginTop: 12 }}>⚠️ {submitError}</div>
            )}
          </div>
        )}

        {/* ══ STEP 3 — Sukses ══ */}
        {step === 3 && (
          <div style={{ textAlign: "center", paddingTop: 32 }}>
            <div style={{ fontSize: 60, marginBottom: 12 }}>{savedOffline ? "💾" : "✅"}</div>
            <div style={{ fontSize: 21, fontWeight: 800, color: savedOffline ? "#1565C0" : "#004D40", marginBottom: 6 }}>
              {savedOffline ? "Tersimpan Lokal!" : "Penilaian Tersimpan!"}
            </div>
            <div style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>
              {savedOffline ? "Otomatis terkirim ke Google Sheets saat online." : "Data berhasil dikirim ke Google Sheets"}
            </div>
            <div style={{ background: savedOffline ? "#e3f2fd" : "#e0f2f1", border: `1px solid ${savedOffline ? "#90CAF9" : "#80CBC4"}`, borderRadius: 14, padding: 16, textAlign: "left", marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#333", marginBottom: 4 }}>{lokasi} · {gh}</div>
              <div style={{ fontSize: 13, color: "#666" }}>Operator: {operator} · {todayISO}</div>
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                {KATEGORI.map(k => {
                  const v = katAvg(k);
                  const s = statusDariSkor(v);
                  return (
                    <div key={k.key} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
                      <span style={{ color: "#666" }}>{k.icon} {k.label}</span>
                      <span style={{ fontWeight: 700, color: s.warna }}>{v !== null ? v.toFixed(2) : "—"}</span>
                    </div>
                  );
                })}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, paddingTop: 8, marginTop: 4, borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                  <span>Total</span>
                  <span style={{ color: status.warna }}>{totalScore?.toFixed(2)} — {status.label}</span>
                </div>
              </div>
            </div>
            <button onClick={resetForm} style={{ width: "100%", padding: 15, background: "#e0f2f1", border: "2px solid #80CBC4", borderRadius: 12, color: "#004D40", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              + Cek GH Berikutnya
            </button>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      {step < 3 && (
        <div style={{ padding: "12px 16px 24px", borderTop: "1px solid #e0e0e0", background: "#fff", position: "sticky", bottom: 0, display: "flex", gap: 10 }}>
          {step > 1 && (
            <button onClick={() => { setStep(s => s - 1); setSubmitError(null); }}
              style={{ flex: 1, padding: 13, background: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: 12, color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>← Kembali</button>
          )}
          {step === 1 && (
            <button onClick={handleLanjutStep2} disabled={!canNext1}
              style={{ flex: 2, padding: 13, border: "none", borderRadius: 12, background: canNext1 ? "linear-gradient(135deg,#004D40,#00695C)" : "#e0e0e0", color: canNext1 ? "#fff" : "#aaa", fontSize: 15, fontWeight: 700, cursor: canNext1 ? "pointer" : "not-allowed" }}>
              Lanjut Penilaian →
            </button>
          )}
          {step === 2 && (
            <button onClick={handleSubmit} disabled={!canSubmit || submitting}
              style={{ flex: 2, padding: 13, border: "none", borderRadius: 12, background: canSubmit && !submitting ? (!isOnline ? "linear-gradient(135deg,#1565C0,#1976D2)" : "linear-gradient(135deg,#004D40,#00695C)") : "#e0e0e0", color: canSubmit && !submitting ? "#fff" : "#aaa", fontSize: 15, fontWeight: 700, cursor: canSubmit && !submitting ? "pointer" : "not-allowed" }}>
              {submitting ? "⏳ Menyimpan..." : !isOnline && canSubmit ? "💾 Simpan Offline" : "Submit Penilaian ✓"}
            </button>
          )}
        </div>
      )}

      <style>{`* { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }`}</style>
    </div>
  );
}
