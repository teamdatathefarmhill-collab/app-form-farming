import Icon from "./Icon";

// Kotak foto 72px: ketuk untuk ambil foto, pratinjau, tombol hapus.
//   capture  — "environment" (kamera belakang) | "user" (selfie)
//   onChange — (file, previewUrl) => void
export default function PhotoBox({ label, hint, preview, onChange, onClear, capture = "environment" }) {
  const handleChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onChange(file, URL.createObjectURL(file));
    e.target.value = "";
  };

  return (
    <div className="fh-photo">
      <span className="fh-label">{label}</span>
      <div className="fh-photo-row">
        <label className={`fh-photo-box${preview ? " has-photo" : ""}`} aria-label={preview ? `Ganti ${label}` : `Ambil ${label}`}>
          {preview
            ? <img src={preview} alt={label} />
            : <Icon name="Camera" size={24} />}
          <input type="file" accept="image/*" capture={capture} onChange={handleChange} hidden />
        </label>
        <div className="fh-photo-side">
          <span className="fh-hint">{preview ? "Ketuk foto untuk ganti" : hint}</span>
          {preview && (
            <button type="button" className="fh-link-btn" style={{ color: "var(--status-danger-fg)", minHeight: 32 }} onClick={onClear}>
              <Icon name="X" size={16} /> Hapus
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
