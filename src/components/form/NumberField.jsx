// Label 13px + input angka 48px dengan satuan di dalam + pesan error di bawah.
// Koma diterima sebagai desimal dan disimpan dengan titik (format yang sudah dipakai sheet).
//   error — teks peringatan; field ditandai danger bila ada
export default function NumberField({ label, unit, value, onChange, error, placeholder = "0" }) {
  const handle = (raw) => onChange(raw.replace(",", ".").replace(/[^\d.-]/g, ""));
  return (
    <label className="fh-section" style={{ gap: 4 }}>
      <span className="fh-label">{label}</span>
      <span className={unit ? "fh-unit" : undefined} style={{ display: "block" }}>
        <input
          className={`fh-input is-number${error ? " is-error" : ""}`}
          type="text"
          inputMode="decimal"
          value={String(value ?? "").replace(".", ",")}
          placeholder={placeholder}
          onChange={e => handle(e.target.value)}
          aria-invalid={!!error}
        />
        {unit && <span className="fh-unit-label">{unit}</span>}
      </span>
      {error && <span className="fh-error-text">{error}</span>}
    </label>
  );
}
