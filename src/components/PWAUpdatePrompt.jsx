import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

export default function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      if (!r) return;

      // Cek update setiap kali user buka app dari background
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          r.update();
        }
      });

      // Cek update setiap kali online kembali
      window.addEventListener("online", () => r.update());

      // Tetap cek berkala setiap 3 menit (bukan 60 detik)
      // SW akan wake up saat ada fetch, jadi interval ini lebih reliable
      setInterval(() => r.update(), 3 * 60 * 1000);
    },
  });

  if (!needRefresh) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: 72,
      left: 12,
      right: 12,
      zIndex: 999,
      background: "linear-gradient(135deg, #1b5e20, #2e7d32)",
      borderRadius: 14,
      padding: "12px 16px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
      animation: "slideUp 0.3s ease",
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
          🔄 Ada pembaruan!
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
          Tap update untuk versi terbaru
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
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
