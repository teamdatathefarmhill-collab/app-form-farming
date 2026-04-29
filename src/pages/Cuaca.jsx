import { useState } from "react";

const WEBHOOK = "https://script.google.com/macros/s/AKfycbzBndG0bEIxKN2RJ7zvI571vRk9EOq5iuN-OzObBU6LHZDvG2GKb6ptXRqHdMj1Z7K2Dw/exec";

const JAM_OPTIONS = [
  "07.00","08.00","09.00","10.00","11.00",
  "12.00","13.00","14.00","15.00","16.00",
];

const CUACA_OPTIONS = [
  { label: "Cerah",         icon: "☀️",  skor: 100 },
  { label: "Cerah Berawan", icon: "⛅",  skor: 80  },
  { label: "Berawan",       icon: "☁️",  skor: 50  },
  { label: "Mendung",       icon: "🌥️", skor: 25  },
  { label: "Hujan",         icon: "🌧️", skor: 0   },
];

function getTodayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const dd   = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function jamToString(jamStr) {
  // "07.00" → "07:00:00", "16.00" → "16:00:00"  (format time biar match kolom Sheets)
  const h = jamStr.split(".")[0].padStart(2, "0");
  return `${h}:00`;
}

export const CHANGELOG = [
  "Form pengukuran cuaca harian",
  "Tanggal otomatis hari ini",
  "Data langsung terkirim ke Google Sheets Log Cuaca",
];

export default function Cuaca() {
  const [jam,          setJam]          = useState("");
  const [selectedCuaca, setSelectedCuaca] = useState(null);
  const [submitting,   setSubmitting]   = useState(false);
  const [step,         setStep]         = useState(1); // 1 = form, 2 = sukses
  const [submitError,  setSubmitError]  = useState(null);

  const todayISO  = getTodayISO();
  const todayLabel = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

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
    ? selectedCuaca.skor >= 80 ? "#1b5e20"
    : selectedCuaca.skor >= 50 ? "#e65100"
    : "#b71c1c"
    : "#888";

  const skorBg = selectedCuaca
    ? selectedCuaca.skor >= 80 ? "#e8f5e9"
    : selectedCuaca.skor >= 50 ? "#fff3e0"
    : "#ffebee"
    : "#f5f5f5";

  return (
    <div style={{ minHeight: "100vh", background: "#f7f9f7", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #0d47a1, #1565C0)", padding: "20px 16px 16px", color: "#fff" }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>
          Pengukuran
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 2 }}>🌤️ Cuaca Harian</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>{todayLabel}</div>
      </div>

      <div style={{ padding: "20px 16px", maxWidth: 480, margin: "0 auto" }}>

        {/* ══ STEP 1 — Form ══ */}
        {step === 1 && (
          <>
            {/* Tanggal info */}
            <div style={{ background: "#e3f2fd", border: "1px solid #90caf9", borderRadius: 12, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>📅</span>
              <div>
                <div style={{ fontSize: 11, color: "#1565C0", fontWeight: 700, letterSpacing: 0.5 }}>TANGGAL HARI INI</div>
                <div style={{ fontSize: 13, color: "#0d47a1", fontWeight: 600 }}>{todayISO}</div>
              </div>
            </div>

            {/* Pilih Jam */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, color: "#1565C0", letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: 8 }}>
                🕐 Jam Pengukuran <span style={{ color: "#e53935" }}>*</span>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                {JAM_OPTIONS.map(j => {
                  const active = jam === j;
                  return (
                    <button key={j} onClick={() => setJam(j)}
                      style={{
                        padding: "10px 4px", borderRadius: 10, border: `1.5px solid ${active ? "#1565C0" : "#e0e0e0"}`,
                        background: active ? "#e3f2fd" : "#fff",
                        color: active ? "#0d47a1" : "#555",
                        fontSize: 12, fontWeight: active ? 700 : 400,
                        cursor: "pointer", transition: "all 0.15s",
                      }}>
                      {j}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Pilih Cuaca */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, color: "#1565C0", letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: 8 }}>
                🌡️ Kondisi Cuaca <span style={{ color: "#e53935" }}>*</span>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                {CUACA_OPTIONS.map(c => {
                  const active = selectedCuaca?.label === c.label;
                  return (
                    <button key={c.label} onClick={() => setSelectedCuaca(c)}
                      style={{
                        padding: "12px 4px 10px",
                        borderRadius: 12,
                        border: `1.5px solid ${active ? "#1565C0" : "#e0e0e0"}`,
                        background: active ? "#e3f2fd" : "#fff",
                        cursor: "pointer",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                        transition: "all 0.15s",
                      }}>
                      <span style={{ fontSize: 22, lineHeight: 1 }}>{c.icon}</span>
                      <span style={{ fontSize: 10, fontWeight: active ? 700 : 400, color: active ? "#0d47a1" : "#666", textAlign: "center", lineHeight: 1.3 }}>{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Skor preview */}
            {selectedCuaca && (
              <div style={{ background: skorBg, border: `1px solid ${skorColor}33`, borderRadius: 12, padding: "10px 14px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 13, color: skorColor, fontWeight: 600 }}>
                  {selectedCuaca.icon} {selectedCuaca.label}
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: skorColor }}>
                  Skor: {selectedCuaca.skor}
                </div>
              </div>
            )}

            {submitError && (
              <div style={{ fontSize: 12, color: "#c62828", background: "#ffebee", border: "1px solid #ef9a9a", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
                ⚠️ {submitError}
              </div>
            )}

            {/* Submit */}
            <button onClick={handleSubmit} disabled={!canSubmit || submitting}
              style={{
                width: "100%", padding: 15, border: "none", borderRadius: 12,
                background: canSubmit && !submitting ? "linear-gradient(135deg,#0d47a1,#1565C0)" : "#e0e0e0",
                color: canSubmit && !submitting ? "#fff" : "#aaa",
                fontSize: 15, fontWeight: 700, cursor: canSubmit && !submitting ? "pointer" : "not-allowed",
              }}>
              {submitting ? "⏳ Mengirim..." : "Kirim ke Google Sheets ✓"}
            </button>
          </>
        )}

        {/* ══ STEP 2 — Sukses ══ */}
        {step === 2 && (
          <div style={{ textAlign: "center", paddingTop: 32 }}>
            <div style={{ fontSize: 60, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 21, fontWeight: 800, color: "#1b5e20", marginBottom: 6 }}>Data Tersimpan!</div>
            <div style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>Data cuaca berhasil dikirim ke Google Sheets</div>
            <div style={{ background: "#e8f5e9", border: "1px solid #a5d6a7", borderRadius: 14, padding: 16, textAlign: "left", marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#333", marginBottom: 6 }}>Ringkasan</div>
              <div style={{ fontSize: 13, color: "#555", lineHeight: 2 }}>
                📅 {todayISO}<br />
                🕐 Jam {jam}<br />
                {selectedCuaca?.icon} {selectedCuaca?.label}<br />
                📊 Skor: <strong style={{ color: skorColor }}>{selectedCuaca?.skor}</strong>
              </div>
            </div>
            <button onClick={resetForm}
              style={{ width: "100%", padding: 15, background: "#e8f5e9", border: "2px solid #81c784", borderRadius: 12, color: "#1b5e20", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              + Input Jam Berikutnya
            </button>
          </div>
        )}
      </div>

      <style>{`* { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }`}</style>
    </div>
  );
}
