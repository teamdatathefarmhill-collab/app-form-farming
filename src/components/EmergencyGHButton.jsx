// EmergencyGHButton.jsx
// Tombol darurat: operator pilih GH lalu Shutdown/Restart karena kondisi tidak
// baik. Setiap aksi tercatat di sheet "GH Restart" (all-time record), yang
// juga jadi sumber data untuk dashboard monitoring di project terpisah.
// Taruh di: src/components/EmergencyGHButton.jsx

import { useState } from "react";
import { useGHData } from "../hooks/useGHData";
import { useGHEmergency } from "../hooks/useGHEmergency";

const AKSI_OPTIONS = [
  { value: "Shutdown", label: "Shutdown", icon: "⏻", color: "#e53935" },
  { value: "Restart",  label: "Restart",  icon: "🔄", color: "#43a047" },
];

export default function EmergencyGHButton() {
  const [open, setOpen]     = useState(false);
  const [gh, setGh]         = useState("");
  const [aksi, setAksi]     = useState("");
  const [alasan, setAlasan] = useState("");
  const [feedback, setFeedback] = useState(null); // { type: 'success'|'error', text }

  const { ghData } = useGHData();
  const { log, loadingLog, submitting, fetchLog, submit } = useGHEmergency();
  const periode = ghData[gh]?.periode || "";

  const ghNames = Object.keys(ghData).sort();

  function openModal() {
    setOpen(true);
    setFeedback(null);
    fetchLog();
  }

  function closeModal() {
    setOpen(false);
    setGh(""); setAksi(""); setAlasan(""); setFeedback(null);
  }

  async function handleSubmit() {
    if (!gh || !aksi || !alasan.trim()) {
      setFeedback({ type: "error", text: "GH, aksi, dan alasan wajib diisi." });
      return;
    }
    const confirmed = window.confirm(
      `Yakin ${aksi.toUpperCase()} GH "${gh}"?\n\nAlasan: ${alasan.trim()}`
    );
    if (!confirmed) return;

    const result = await submit({ gh, periode, aksi, alasan: alasan.trim() });
    if (result.success) {
      setFeedback({ type: "success", text: `${aksi} GH "${gh}" berhasil dicatat.` });
      setGh(""); setAksi(""); setAlasan("");
      fetchLog();
    } else {
      setFeedback({ type: "error", text: result.error || "Gagal mengirim, coba lagi." });
    }
  }

  return (
    <>
      <button
        onClick={openModal}
        title="Emergency — Shutdown / Restart GH"
        style={{
          width: 30, height: 30, borderRadius: 8,
          border: "1px solid rgba(229,57,53,0.4)",
          background: "rgba(229,57,53,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", padding: 0, flexShrink: 0, fontSize: 15,
        }}
      >
        🚨
      </button>

      {open && (
        <div
          onClick={closeModal}
          style={{
            position: "fixed", inset: 0, zIndex: 300,
            background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#12201a", width: "100%", maxWidth: 480,
              maxHeight: "88vh", overflowY: "auto",
              borderRadius: "16px 16px 0 0",
              padding: "18px 18px 24px",
              fontFamily: "'Segoe UI', system-ui, sans-serif",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>
                🚨 Emergency GH
              </div>
              <button onClick={closeModal} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>

            {/* ── Form aksi ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
              <div>
                <label style={labelStyle}>Pilih GH</label>
                <select value={gh} onChange={(e) => setGh(e.target.value)} style={inputStyle}>
                  <option value="">-- pilih GH --</option>
                  {ghNames.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Aksi</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {AKSI_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setAksi(opt.value)}
                      style={{
                        flex: 1, padding: "10px 8px", borderRadius: 10,
                        border: aksi === opt.value ? `1.5px solid ${opt.color}` : "1px solid rgba(255,255,255,0.15)",
                        background: aksi === opt.value ? `${opt.color}26` : "rgba(255,255,255,0.04)",
                        color: aksi === opt.value ? opt.color : "rgba(255,255,255,0.7)",
                        fontSize: 13, fontWeight: 600, cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      }}
                    >
                      <span>{opt.icon}</span> {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Alasan / Kondisi</label>
                <textarea
                  value={alasan}
                  onChange={(e) => setAlasan(e.target.value)}
                  placeholder="Jelaskan kondisi GH, mis. hama berat, alat rusak, dll."
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                />
              </div>

              {feedback && (
                <div style={{
                  fontSize: 12, padding: "8px 10px", borderRadius: 8,
                  background: feedback.type === "success" ? "rgba(67,160,71,0.15)" : "rgba(229,57,53,0.15)",
                  color: feedback.type === "success" ? "#66bb6a" : "#ef5350",
                }}>
                  {feedback.text}
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  padding: "11px 12px", borderRadius: 10, border: "none",
                  background: submitting ? "rgba(229,57,53,0.4)" : "#e53935",
                  color: "#fff", fontSize: 13, fontWeight: 700,
                  cursor: submitting ? "default" : "pointer",
                }}
              >
                {submitting ? "Mengirim..." : "Catat & Kirim"}
              </button>
            </div>

            {/* ── Riwayat all-time ── */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.55)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Riwayat (All Time)
              </div>
              {loadingLog && (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Memuat riwayat...</div>
              )}
              {!loadingLog && log.length === 0 && (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Belum ada riwayat.</div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {log.map((item, i) => {
                  const isShutdown = String(item.aksi).toUpperCase() === "SHUTDOWN";
                  return (
                    <div key={i} style={{
                      padding: "8px 10px", borderRadius: 8,
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: "#fff" }}>{item.gh}</span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6,
                          background: isShutdown ? "rgba(229,57,53,0.2)" : "rgba(67,160,71,0.2)",
                          color: isShutdown ? "#ef5350" : "#66bb6a",
                        }}>
                          {item.aksi}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 2 }}>
                        {item.timestamp}{item.periode ? ` · Periode ${item.periode}` : ""}
                      </div>
                      <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.7)" }}>{item.alasan}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const labelStyle = {
  display: "block", fontSize: 11, fontWeight: 600,
  color: "rgba(255,255,255,0.5)", marginBottom: 4,
};

const inputStyle = {
  width: "100%", padding: "9px 10px", borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.05)", color: "#fff",
  fontSize: 13, boxSizing: "border-box",
};
