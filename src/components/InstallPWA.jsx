import { useState, useEffect } from "react";

// ─── InstallPWA ───────────────────────────────────────────────────────────────
// Banner "Pasang sebagai App" yang muncul saat browser mendukung PWA install.
// Menyimpan prompt event dari browser dan menampilkan tombol install.

export default function InstallPWA() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [dismissed, setDismissed]         = useState(
    () => !!localStorage.getItem("farmhill_pwa_dismissed")
  );
  const [installed, setInstalled]         = useState(false);

  useEffect(() => {
    // Ambil event yang mungkin sudah ditangkap sebelum React mount
    if (window.__pwaInstallPrompt) {
      setInstallPrompt(window.__pwaInstallPrompt);
    }

    const handler = (e) => {
      e.preventDefault();
      window.__pwaInstallPrompt = e;
      setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handleInstall() {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setInstallPrompt(null);
  }

  function handleDismiss() {
    localStorage.setItem("farmhill_pwa_dismissed", "1");
    setDismissed(true);
  }

  // Tidak tampil jika: sudah dismissed, sudah installed, atau tidak ada prompt
  if (dismissed || installed || !installPrompt) return null;

  return (
    <div style={{
      position: "fixed", bottom: 72, left: 12, right: 12, zIndex: 9000,
      background: "linear-gradient(135deg, #1a2e1a, #0f1f14)",
      border: "1px solid rgba(74,170,110,0.35)",
      borderRadius: 14, padding: "12px 14px",
      display: "flex", alignItems: "center", gap: 12,
      boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: "linear-gradient(135deg, #2d7a4a, #4aaa6e)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 20,
      }}>
        🌿
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 1 }}>
          Pasang sebagai App
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }}>
          Bisa dibuka & diisi tanpa internet, langsung dari layar utama
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button
          onClick={handleDismiss}
          style={{
            padding: "7px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)",
            background: "transparent", color: "rgba(255,255,255,0.4)",
            fontSize: 12, cursor: "pointer",
          }}
        >
          Nanti
        </button>
        <button
          onClick={handleInstall}
          style={{
            padding: "7px 14px", borderRadius: 8, border: "none",
            background: "linear-gradient(135deg, #2d7a4a, #4aaa6e)",
            color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}
        >
          Pasang
        </button>
      </div>
    </div>
  );
}
