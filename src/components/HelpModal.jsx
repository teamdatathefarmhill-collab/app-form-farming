// ─── HelpModal ─────────────────────────────────────────────────────────────────
// Modal tutorial generik — bottom sheet berisi daftar section {title, body}
//
// Props:
//   open    — boolean, apakah modal tampil
//   onClose — callback saat user menutup modal
//   title   — judul modal
//   sections — array of { heading, items: string[] }

export default function HelpModal({ open, onClose, title = "Cara Pakai", sections = [] }) {
  if (!open) return null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9998,
        background: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)",
      }}
    >
      <div style={{
        width: "100%", maxWidth: 520,
        background: "linear-gradient(180deg, #0f1f14 0%, #0a1a0f 100%)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "20px 20px 0 0",
        padding: "0 0 env(safe-area-inset-bottom,16px) 0",
        maxHeight: "85vh",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.5)",
      }}>

        <div style={{
          padding: "18px 20px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          display: "flex", alignItems: "center", gap: 12,
          flexShrink: 0,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            background: "rgba(76,175,80,0.15)",
            border: "1px solid rgba(76,175,80,0.35)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20,
          }}>
            ℹ️
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: "#81c784", fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 2 }}>
              Panduan
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>
              {title}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 22, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }}>
          {sections.map((sec, i) => (
            <div key={i} style={{ marginBottom: i < sections.length - 1 ? 16 : 0 }}>
              <div style={{ fontSize: 11.5, color: "#81c784", fontWeight: 700, letterSpacing: 0.6, marginBottom: 6 }}>
                {sec.heading}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {sec.items.map((it, j) => (
                  <div key={j} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ color: "#4caf50", fontSize: 12, marginTop: 2 }}>•</span>
                    <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.75)", lineHeight: 1.55 }}>{it}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          padding: "12px 20px 16px",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{
              width: "100%", padding: "13px", borderRadius: 12, border: "none",
              background: "linear-gradient(135deg,#1b5e20,#2e7d32)",
              color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
            }}
          >
            Mengerti
          </button>
        </div>
      </div>

      <style>{`
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>
    </div>
  );
}
