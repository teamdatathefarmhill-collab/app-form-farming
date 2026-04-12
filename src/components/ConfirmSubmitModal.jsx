// ─── ConfirmSubmitModal ────────────────────────────────────────────────────────
// Warning dialog sebelum submit — minta user konfirmasi data sudah benar
//
// Props:
//   open         — boolean, apakah modal tampil
//   onConfirm    — callback saat user klik "Yakin, Submit"
//   onCancel     — callback saat user klik "Periksa Lagi"
//   title        — judul konfirmasi (opsional)
//   summary      — array of { label, value } untuk tampilkan ringkasan data
//   color        — warna aksen
//   isOffline    — boolean, tampilkan info simpan offline
//   isDemoMode   — boolean, tampilkan badge demo

export default function ConfirmSubmitModal({
  open,
  onConfirm,
  onCancel,
  title = "Konfirmasi Submit",
  summary = [],
  color = "#1E88E5",
  isOffline = false,
  isDemoMode = false,
}) {
  if (!open) return null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
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
        maxHeight: "80vh",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.5)",
      }}>

        {/* ── Warning header ── */}
        <div style={{
          padding: "18px 20px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          display: "flex", alignItems: "center", gap: 12,
          flexShrink: 0,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            background: "rgba(255,179,0,0.12)",
            border: "1px solid rgba(255,179,0,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20,
          }}>
            ⚠️
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: "#FFB300", fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 2 }}>
              Sebelum Submit
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>
              {title}
            </div>
          </div>
        </div>

        {/* ── Body (scrollable) ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }}>

          {/* Mode badges */}
          {isDemoMode && (
            <div style={{
              padding: "10px 14px", marginBottom: 12, borderRadius: 10,
              background: "rgba(255,179,0,0.08)", border: "1px solid rgba(255,179,0,0.25)",
              fontSize: 12, color: "#FFB300",
            }}>
              🧪 <strong>Mode Demo</strong> — data tidak akan dikirim ke Google Sheets
            </div>
          )}
          {isOffline && !isDemoMode && (
            <div style={{
              padding: "10px 14px", marginBottom: 12, borderRadius: 10,
              background: "rgba(33,150,243,0.08)", border: "1px solid rgba(33,150,243,0.25)",
              fontSize: 12, color: "#64B5F6",
            }}>
              📵 <strong>Offline</strong> — data disimpan lokal & dikirim otomatis saat online
            </div>
          )}

          {/* Pesan utama */}
          <p style={{
            fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.7,
            margin: "0 0 14px",
          }}>
            Pastikan semua data di bawah sudah <strong style={{ color: "#fff" }}>benar dan lengkap</strong> sebelum dikirim. Data yang sudah tersubmit tidak bisa diubah langsung dari aplikasi.
          </p>

          {/* Ringkasan data */}
          {summary.length > 0 && (
            <div style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: 12, overflow: "hidden", marginBottom: 14,
            }}>
              {summary.map((item, i) => (
                item.value ? (
                  <div key={i} style={{
                    display: "flex", padding: "9px 14px",
                    borderBottom: i < summary.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                    gap: 10, alignItems: "flex-start",
                  }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", minWidth: 100, flexShrink: 0 }}>
                      {item.label}
                    </span>
                    <span style={{ fontSize: 12, color: "#fff", fontWeight: 600, flex: 1, wordBreak: "break-word" }}>
                      {item.value}
                    </span>
                  </div>
                ) : null
              ))}
            </div>
          )}

          {/* Checklist reminder */}
          <div style={{
            background: `${color}0d`, border: `1px solid ${color}22`,
            borderRadius: 10, padding: "10px 14px",
          }}>
            <div style={{ fontSize: 11, color: color, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
              Cek Sebelum Submit
            </div>
            {[
              "GH yang dipilih sudah benar",
              "Semua angka/data sudah sesuai kondisi aktual",
              "Nama operator sudah diisi dengan benar",
            ].map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: i < 2 ? 6 : 0 }}>
                <span style={{ color: color, fontSize: 14 }}>✓</span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Footer buttons ── */}
        <div style={{
          padding: "12px 20px 16px",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          display: "flex", gap: 10, flexShrink: 0,
        }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: "13px", borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.05)",
              color: "rgba(255,255,255,0.65)",
              fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}
          >
            ← Periksa Lagi
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 2, padding: "13px", borderRadius: 12, border: "none",
              background: isDemoMode
                ? "linear-gradient(135deg,#5d4037,#795548)"
                : isOffline
                  ? "linear-gradient(135deg,#1565C0,#1976D2)"
                  : `linear-gradient(135deg, ${color}cc, ${color})`,
              color: "#fff",
              fontSize: 14, fontWeight: 700, cursor: "pointer",
            }}
          >
            {isDemoMode ? "Submit Demo 🧪" : isOffline ? "💾 Simpan Offline" : "Yakin, Submit ✓"}
          </button>
        </div>
      </div>

      <style>{`
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>
    </div>
  );
}
