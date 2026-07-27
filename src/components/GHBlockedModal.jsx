// GHBlockedModal.jsx
// Popup dalam-aplikasi untuk GH yang sedang Shutdown/Restart lewat Emergency
// GH button. Menggantikan window.alert() bawaan browser — subscribe ke event
// dari warnIfGHBlocked() (lihat src/hooks/useGHBlockedList.js). Di-mount sekali
// di App.jsx.

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { subscribeGHBlocked } from "../hooks/useGHBlockedList";

export default function GHBlockedModal() {
  const [payload, setPayload] = useState(null);

  useEffect(() => subscribeGHBlocked(setPayload), []);

  if (!payload) return null;

  const isShutdown = String(payload.aksi).toUpperCase() === "SHUTDOWN";

  return createPortal(
    <div
      onClick={() => setPayload(null)}
      style={{
        position: "fixed", inset: 0, zIndex: 400,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, boxSizing: "border-box",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#12201a", width: "100%", maxWidth: 360,
          borderRadius: 16, padding: "20px 20px 18px",
          fontFamily: "'Segoe UI', system-ui, sans-serif",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>{isShutdown ? "⏻" : "🔄"}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 4 }}>
            GH "{payload.gh}" sedang {payload.aksi}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
            GH ini tidak bisa diisi saat ini
          </div>
        </div>

        <div style={{
          background: "rgba(229,57,53,0.12)", border: "1px solid rgba(229,57,53,0.3)",
          borderRadius: 10, padding: "10px 12px", marginBottom: 16,
          fontSize: 12.5, color: "rgba(255,255,255,0.85)", lineHeight: 1.5,
        }}>
          <strong style={{ color: "#ef5350" }}>Alasan:</strong> {payload.alasan}
        </div>

        <button
          onClick={() => setPayload(null)}
          style={{
            width: "100%", padding: "11px 12px", borderRadius: 10, border: "none",
            background: "#2d7a4a", color: "#fff", fontSize: 13, fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Oke, Mengerti
        </button>
      </div>
    </div>,
    document.body
  );
}
