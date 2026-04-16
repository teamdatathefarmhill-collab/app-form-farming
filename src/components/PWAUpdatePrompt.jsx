import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

export default function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // Cek update setiap 60 detik saat app terbuka
      if (r) {
        setInterval(() => r.update(), 60 * 1000);
      }
    },
  });

  if (!needRefresh) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: 72, // di atas bottom nav
      left: 12,
      right: 12,
      zIndex: 999,
      background: "#1b5e20",
      borderRadius: 14,
      padding: "12px 16px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
          🔄 Update tersedia
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
          Versi baru app sudah siap
        </div>
      </div>
      <button
        onClick={() => updateServiceWorker(true)}
        style={{
          background: "#fff",
          border: "none",
          borderRadius: 10,
          padding: "8px 16px",
          fontSize: 13,
          fontWeight: 700,
          color: "#1b5e20",
          cursor: "pointer",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        Update
      </button>
    </div>
  );
}
