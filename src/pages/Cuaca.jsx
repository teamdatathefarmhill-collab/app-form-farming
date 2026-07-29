import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { color, radius } from "../styles/tokens";

const WEBHOOK = "https://script.google.com/macros/s/AKfycbzBndG0bEIxKN2RJ7zvI571vRk9EOq5iuN-OzObBU6LHZDvG2GKb6ptXRqHdMj1Z7K2Dw/exec";

const JAM_OPTIONS = [
  "07.00","08.00","09.00","10.00","11.00",
  "12.00","13.00","14.00","15.00","16.00",
];

/* ─── ANIMATED WEATHER ICONS ─── */

function SunIcon({ size = 40 }) {
  return (
    <motion.svg viewBox="0 0 48 48" fill="none" style={{ width: size, height: size }}>
      <motion.g animate={{ rotate: 360 }} transition={{ duration: 12, ease: "linear", repeat: Infinity }}>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <motion.line key={deg} x1="24" y1="6" x2="24" y2="10"
            stroke="#FBBF24" strokeWidth={2} strokeLinecap="round"
            style={{ transformOrigin: "24px 24px", rotate: deg }}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2, repeat: Infinity, delay: deg / 360 }} />
        ))}
      </motion.g>
      <motion.circle cx="24" cy="24" r="8" fill="#FBBF24" opacity={0.2}
        animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} />
      <circle cx="24" cy="24" r="8" stroke="#FBBF24" strokeWidth={2} />
    </motion.svg>
  );
}

function PartlyCloudyIcon({ size = 40 }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" style={{ width: size, height: size }}>
      <motion.g animate={{ rotate: 360 }} transition={{ duration: 20, ease: "linear", repeat: Infinity }}
        style={{ transformOrigin: "16px 16px" }}>
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <line key={deg} x1="16" y1="6" x2="16" y2="9"
            stroke="#FBBF24" strokeWidth={1.5} strokeLinecap="round"
            style={{ transformOrigin: "16px 16px", rotate: deg }} />
        ))}
      </motion.g>
      <circle cx="16" cy="16" r="6" stroke="#FBBF24" strokeWidth={1.5} fill="#FBBF24" fillOpacity={0.15} />
      <motion.g animate={{ x: [0, 1.5, 0, -1.5, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}>
        <path d="M38 34H18a7 7 0 01-.5-14A9 9 0 0136 22a6 6 0 012 12z" fill="#94A3B8" opacity={0.12} />
        <path d="M38 34H18a7 7 0 01-.5-14A9 9 0 0136 22a6 6 0 012 12z" stroke="#94A3B8" strokeWidth={2} strokeLinecap="round" />
      </motion.g>
    </svg>
  );
}

function CloudIcon({ size = 40 }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" style={{ width: size, height: size }}>
      <motion.g animate={{ x: [0, 2, 0, -2, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}>
        <path d="M36 30H14a8 8 0 01-.5-16A10 10 0 0134 16a7 7 0 012 14z" fill="#94A3B8" opacity={0.12} />
        <path d="M36 30H14a8 8 0 01-.5-16A10 10 0 0134 16a7 7 0 012 14z" stroke="#94A3B8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </motion.g>
    </svg>
  );
}

/* Mendung = awan gelap, lebih berat */
function MendungIcon({ size = 40 }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" style={{ width: size, height: size }}>
      <motion.g animate={{ x: [0, 1.5, 0, -1.5, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}>
        <path d="M36 30H14a8 8 0 01-.5-16A10 10 0 0134 16a7 7 0 012 14z" fill="#475569" opacity={0.18} />
        <path d="M36 30H14a8 8 0 01-.5-16A10 10 0 0134 16a7 7 0 012 14z" stroke="#475569" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      </motion.g>
      {/* awan kedua di belakang, biar keliatan tumpuk */}
      <motion.g animate={{ x: [0, -2, 0, 2, 0] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}>
        <path d="M40 36H20a6 6 0 01-.4-12A8 8 0 0138 26a5 5 0 012 10z" fill="#334155" opacity={0.12} />
        <path d="M40 36H20a6 6 0 01-.4-12A8 8 0 0138 26a5 5 0 012 10z" stroke="#334155" strokeWidth={1.5} strokeLinecap="round" strokeDasharray="2 2" />
      </motion.g>
    </svg>
  );
}

function RainIcon({ size = 40 }) {
  const drops = [
    { x: 16, d: 0 }, { x: 22, d: 0.3 }, { x: 28, d: 0.6 }, { x: 34, d: 0.15 },
  ];
  return (
    <svg viewBox="0 0 48 48" fill="none" style={{ width: size, height: size }}>
      <path d="M36 22H14a7 7 0 01-.5-14A9 9 0 0134 10a6 6 0 012 12z" fill="#60A5FA" opacity={0.1} />
      <path d="M36 22H14a7 7 0 01-.5-14A9 9 0 0134 10a6 6 0 012 12z" stroke="#60A5FA" strokeWidth={2} strokeLinecap="round" />
      {drops.map((drop) => (
        <motion.line key={drop.x} x1={drop.x} y1={26} x2={drop.x} y2={30}
          stroke="#60A5FA" strokeWidth={2} strokeLinecap="round"
          animate={{ y: [0, 12], opacity: [0.8, 0] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: drop.d, ease: "easeIn" }} />
      ))}
    </svg>
  );
}

/* ─── CUACA OPTIONS pakai Icon component, bukan emoji string ─── */
const CUACA_OPTIONS = [
  { label: "Cerah",         Icon: SunIcon,          emoji: "☀️",  skor: 100 },
  { label: "Cerah Berawan", Icon: PartlyCloudyIcon,  emoji: "⛅",  skor: 80  },
  { label: "Berawan",       Icon: CloudIcon,          emoji: "☁️",  skor: 50  },
  { label: "Mendung",       Icon: MendungIcon,        emoji: "🌥️", skor: 25  },
  { label: "Hujan",         Icon: RainIcon,           emoji: "🌧️", skor: 0   },
];

function getTodayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const dd   = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function jamToString(jamStr) {
  const h = jamStr.split(".")[0].padStart(2, "0");
  return `${h}:00`;
}

function timeToJamOption(timeStr) {
  if (!timeStr) return null;
  const h = String(timeStr).split(":")[0].padStart(2, "0");
  return `${h}.00`;
}

export const CHANGELOG = [
  "Form pengukuran cuaca harian",
  "Tanggal otomatis hari ini",
  "Data langsung terkirim ke Google Sheets Log Cuaca",
  "Jam yang sudah diisi ditandai merah otomatis via JSONP",
  "Icon cuaca diganti ke animated SVG (framer-motion)",
];

export default function Cuaca() {
  const [jam,           setJam]           = useState("");
  const [selectedCuaca, setSelectedCuaca] = useState(null);
  const [submitting,    setSubmitting]    = useState(false);
  const [step,          setStep]          = useState(1);
  const [submitError,   setSubmitError]   = useState(null);
  const [filledJams,    setFilledJams]    = useState(new Set());
  const [loadingFilled, setLoadingFilled] = useState(true);
  const [fetchStatus,   setFetchStatus]   = useState("loading");

  const todayISO   = getTodayISO();
  const todayLabel = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  useEffect(() => {
    async function fetchFilledJams() {
      try {
        const callbackName = `cb_${Date.now()}`;
        const url = `${WEBHOOK}?tanggal=${todayISO}&callback=${callbackName}`;

        await new Promise((resolve, reject) => {
          const script = document.createElement("script");

          window[callbackName] = (data) => {
            delete window[callbackName];
            script.remove();
            if (Array.isArray(data)) {
              const filled = new Set();
              data.forEach(row => {
                const jamOpt = timeToJamOption(row.jam || "");
                if (jamOpt) filled.add(jamOpt);
              });
              setFilledJams(filled);
              setFetchStatus("ok");
            } else {
              setFetchStatus("error");
            }
            resolve();
          };

          script.onerror = () => {
            delete window[callbackName];
            script.remove();
            setFetchStatus("error");
            reject(new Error("script load error"));
          };

          script.src = url;
          document.head.appendChild(script);

          setTimeout(() => {
            if (window[callbackName]) {
              delete window[callbackName];
              script.remove();
              setFetchStatus("error");
              reject(new Error("timeout"));
            }
          }, 10000);
        });
      } catch {
        setFetchStatus("error");
      } finally {
        setLoadingFilled(false);
      }
    }

    fetchFilledJams();
  }, [todayISO]);

  const canSubmit = jam && selectedCuaca !== null;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await fetch(WEBHOOK, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tanggal: todayISO,
          jam: jamToString(jam),
          cuaca: selectedCuaca.label,
          skoring: selectedCuaca.skor,
        }),
      });
      setFilledJams(prev => new Set([...prev, jam]));
      setStep(2);
    } catch {
      setSubmitError("Gagal mengirim data. Cek koneksi internet kamu.");
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setJam("");
    setSelectedCuaca(null);
    setSubmitError(null);
    setStep(1);
  }

  const skorColor = selectedCuaca
    ? selectedCuaca.skor >= 80 ? color.brand900
    : selectedCuaca.skor >= 50 ? color.warning
    : "#b71c1c"
    : color.textSoft;

  const skorBg = selectedCuaca
    ? selectedCuaca.skor >= 80 ? color.brandBg
    : selectedCuaca.skor >= 50 ? color.warningBg
    : color.dangerBg
    : color.bg;

  const totalFilled = filledJams.size;

  return (
    <div style={{ minHeight: "100vh", background: "#f7f9f7", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${color.infoDark}, ${color.info})`, padding: "20px 16px 16px", color: color.card }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>
          Pengukuran
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 2 }}>🌤️ Cuaca Harian</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>{todayLabel}</div>

        {!loadingFilled && totalFilled > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>
              {totalFilled} dari {JAM_OPTIONS.length} jam sudah diisi hari ini
            </div>
            <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: radius.full, height: 5, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${(totalFilled / JAM_OPTIONS.length) * 100}%`,
                background: totalFilled === JAM_OPTIONS.length ? "#69f0ae" : color.card,
                borderRadius: radius.full,
                transition: "width 0.4s ease",
              }} />
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: "20px 16px", maxWidth: 480, margin: "0 auto" }}>

        {step === 1 && (
          <>
            {/* Tanggal info */}
            <div style={{ background: color.infoBg, border: `1px solid ${color.infoBorder}`, borderRadius: radius.lg, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>📅</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: color.info, fontWeight: 700, letterSpacing: 0.5 }}>TANGGAL HARI INI</div>
                <div style={{ fontSize: 13, color: color.infoDark, fontWeight: 600 }}>{todayISO}</div>
              </div>
              <div style={{ fontSize: 11, color: loadingFilled ? color.textFaint : fetchStatus === "ok" ? color.brand700 : color.danger }}>
                {loadingFilled ? "⏳ memuat..." : fetchStatus === "ok" ? "✓ tersinkron" : "⚠ offline"}
              </div>
            </div>

            {/* Legend */}
            {!loadingFilled && totalFilled > 0 && (
              <div style={{ display: "flex", gap: 12, marginBottom: 12, fontSize: 11, color: color.textMuted, alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: "#ffcdd2", border: `1.5px solid ${color.danger}` }} />
                  Sudah diisi
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: color.card, border: `1.5px solid ${color.border}` }} />
                  Belum diisi
                </div>
              </div>
            )}

            {/* Pilih Jam */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, color: color.info, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: 8 }}>
                🕐 Jam Pengukuran <span style={{ color: color.danger }}>*</span>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                {JAM_OPTIONS.map(j => {
                  const active   = jam === j;
                  const isFilled = filledJams.has(j);
                  return (
                    <button
                      key={j}
                      onClick={() => setJam(j)}
                      title={isFilled ? `Jam ${j} sudah diisi` : `Pilih jam ${j}`}
                      style={{
                        padding: "10px 4px 8px",
                        borderRadius: radius.md,
                        border: `1.5px solid ${active ? color.info : isFilled ? color.danger : color.border}`,
                        background: active ? color.infoBg : isFilled ? color.dangerBg : color.card,
                        color: active ? color.infoDark : isFilled ? color.dangerDeep : "#555",
                        fontSize: 12,
                        fontWeight: active ? 700 : isFilled ? 600 : 400,
                        cursor: "pointer",
                        transition: "all 0.15s",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 2,
                      }}
                    >
                      {j}
                      {isFilled && (
                        <span style={{ fontSize: 9, color: color.danger, fontWeight: 700, lineHeight: 1 }}>✓ terisi</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Pilih Cuaca — pakai animated icon */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, color: color.info, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: 8 }}>
                🌡️ Kondisi Cuaca <span style={{ color: color.danger }}>*</span>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                {CUACA_OPTIONS.map(c => {
                  const active = selectedCuaca?.label === c.label;
                  return (
                    <button key={c.label} onClick={() => setSelectedCuaca(c)}
                      style={{
                        padding: "12px 4px 10px",
                        borderRadius: radius.lg,
                        border: `1.5px solid ${active ? color.info : color.border}`,
                        background: active ? color.infoBg : color.card,
                        cursor: "pointer",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                        transition: "all 0.15s",
                      }}>
                      {/* ← Animated SVG icon, bukan emoji */}
                      <c.Icon size={36} />
                      <span style={{ fontSize: 10, fontWeight: active ? 700 : 400, color: active ? color.infoDark : color.textMuted, textAlign: "center", lineHeight: 1.3 }}>{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Skor preview */}
            {selectedCuaca && (
              <div style={{ background: skorBg, border: `1px solid ${skorColor}33`, borderRadius: radius.lg, padding: "10px 14px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <selectedCuaca.Icon size={28} />
                  <span style={{ fontSize: 13, color: skorColor, fontWeight: 600 }}>{selectedCuaca.label}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: skorColor }}>
                  Skor: {selectedCuaca.skor}
                </div>
              </div>
            )}

            {/* Warning jam sudah terisi */}
            {jam && filledJams.has(jam) && (
              <div style={{ fontSize: 12, color: color.dangerDeep, background: color.dangerBg, border: `1px solid ${color.dangerBorder}`, borderRadius: radius.sm, padding: "8px 12px", marginBottom: 12, display: "flex", gap: 6, alignItems: "flex-start" }}>
                <span>⚠️</span>
                <span>Jam <strong>{jam}</strong> sudah pernah diisi hari ini. Data baru akan tetap terkirim sebagai entri tambahan.</span>
              </div>
            )}

            {submitError && (
              <div style={{ fontSize: 12, color: color.dangerDeep, background: color.dangerBg, border: `1px solid ${color.dangerBorder}`, borderRadius: radius.sm, padding: "8px 12px", marginBottom: 12 }}>
                ⚠️ {submitError}
              </div>
            )}

            {/* Submit */}
            <button onClick={handleSubmit} disabled={!canSubmit || submitting}
              style={{
                width: "100%", padding: 15, border: "none", borderRadius: radius.lg,
                background: canSubmit && !submitting ? `linear-gradient(135deg,${color.infoDark},${color.info})` : color.border,
                color: canSubmit && !submitting ? color.card : color.textGhost,
                fontSize: 15, fontWeight: 700, cursor: canSubmit && !submitting ? "pointer" : "not-allowed",
              }}>
              {submitting ? "⏳ Mengirim..." : "Kirim ke Google Sheets ✓"}
            </button>
          </>
        )}

        {/* Sukses */}
        {step === 2 && (
          <div style={{ textAlign: "center", paddingTop: 32 }}>
            <div style={{ fontSize: 60, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 21, fontWeight: 800, color: color.brand900, marginBottom: 6 }}>Data Tersimpan!</div>
            <div style={{ fontSize: 13, color: color.textSoft, marginBottom: 20 }}>Data cuaca berhasil dikirim ke Google Sheets</div>
            <div style={{ background: color.brandBg, border: `1px solid ${color.brand300}`, borderRadius: 14, padding: 16, textAlign: "left", marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: color.text, marginBottom: 10 }}>Ringkasan</div>
              <div style={{ fontSize: 13, color: "#555", lineHeight: 2.2 }}>
                <div>📅 {todayISO}</div>
                <div>🕐 Jam {jam}</div>
                {/* Animated icon di sukses screen */}
                {selectedCuaca && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <selectedCuaca.Icon size={24} />
                    <span>{selectedCuaca.label}</span>
                  </div>
                )}
                <div>📊 Skor: <strong style={{ color: skorColor }}>{selectedCuaca?.skor}</strong></div>
              </div>
            </div>
            <button onClick={resetForm}
              style={{ width: "100%", padding: 15, background: color.brandBg, border: `2px solid ${color.brand400}`, borderRadius: radius.lg, color: color.brand900, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              + Input Jam Berikutnya
            </button>
          </div>
        )}
      </div>

      <style>{`* { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }`}</style>
    </div>
  );
}
