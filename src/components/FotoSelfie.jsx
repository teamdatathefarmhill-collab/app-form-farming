// ─── FotoSelfie — Komponen upload foto selfie operator ───────────────────────
// Props:
//   fotoFile    : File | null  — file yang dipilih
//   fotoPreview : string       — object URL untuk preview
//   onChange    : (file, previewUrl) => void
//   onClear     : () => void
//   isOffline   : boolean      — tampilkan note "upload otomatis saat online"
//   darkMode    : boolean      — untuk form dengan background gelap (Sanitasi, HPT)

export default function FotoSelfie({ fotoFile, fotoPreview, onChange, onClear, isOffline = false, darkMode = false }) {
  const c = darkMode ? {
    label:       "rgba(255,255,255,0.6)",
    labelActive: "#81c784",
    border:      "rgba(255,255,255,0.15)",
    borderActive:"rgba(76,175,80,0.5)",
    bg:          "rgba(255,255,255,0.04)",
    bgActive:    "rgba(76,175,80,0.06)",
    sub:         "rgba(255,255,255,0.3)",
    note:        "#FFB300",
    noteBg:      "rgba(255,179,0,0.08)",
    noteBorder:  "rgba(255,179,0,0.25)",
    clearBg:     "rgba(244,67,54,0.15)",
    clearBorder: "rgba(244,67,54,0.35)",
    clearText:   "#ef9a9a",
  } : {
    label:       "#555",
    labelActive: "#2e7d32",
    border:      "#e0e0e0",
    borderActive:"#a5d6a7",
    bg:          "#fafafa",
    bgActive:    "#f1f8e9",
    sub:         "#aaa",
    note:        "#e65100",
    noteBg:      "#fff3e0",
    noteBorder:  "#ffb74d",
    clearBg:     "#ffebee",
    clearBorder: "#ef9a9a",
    clearText:   "#c62828",
  };

  const handleChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    onChange(file, previewUrl);
  };

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Label */}
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: fotoPreview ? c.labelActive : c.label, marginBottom: 8 }}>
        📸 Foto Selfie Operator {fotoPreview ? "✅" : <span style={{ color: c.sub, fontWeight: 400 }}>(opsional)</span>}
      </div>

      {/* Upload area */}
      <label style={{
        display: "block", cursor: "pointer", borderRadius: 12, overflow: "hidden",
        border: `2px dashed ${fotoPreview ? c.borderActive : c.border}`,
        background: fotoPreview ? c.bgActive : c.bg,
        transition: "all 0.2s",
      }}>
        {fotoPreview ? (
          <div style={{ position: "relative" }}>
            <img src={fotoPreview} alt="selfie preview"
              style={{ width: "100%", maxHeight: 220, objectFit: "cover", display: "block" }} />
            <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.55)", borderRadius: 8, padding: "4px 10px", fontSize: 11, color: "#fff" }}>
              📷 Ganti foto
            </div>
          </div>
        ) : (
          <div style={{ padding: "20px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🤳</div>
            <div style={{ fontSize: 13, color: c.label, fontWeight: 500 }}>Tap untuk ambil foto selfie</div>
            <div style={{ fontSize: 11, color: c.sub, marginTop: 4 }}>
              {isOffline ? "Foto akan diupload otomatis saat online" : "Foto disimpan ke Google Drive"}
            </div>
          </div>
        )}
        <input
          type="file"
          accept="image/*"
          capture="user"
          onChange={handleChange}
          style={{ display: "none" }}
        />
      </label>

      {/* Tombol hapus foto */}
      {fotoPreview && (
        <button onClick={onClear}
          style={{ marginTop: 8, width: "100%", padding: "8px", background: c.clearBg, border: `1px solid ${c.clearBorder}`, borderRadius: 8, color: c.clearText, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          🗑 Hapus foto
        </button>
      )}

      {/* Note offline */}
      {isOffline && fotoPreview && (
        <div style={{ marginTop: 8, padding: "7px 12px", background: c.noteBg, border: `1px solid ${c.noteBorder}`, borderRadius: 8, fontSize: 11, color: c.note }}>
          📵 Foto tersimpan lokal — akan diupload ke Drive saat koneksi kembali
        </div>
      )}
    </div>
  );
}
