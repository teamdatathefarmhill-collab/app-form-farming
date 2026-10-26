import Icon from "./Icon";

// Kerangka halaman form: header putih, progress opsional, konten, footer sticky.
//   steps     — jumlah langkah (0 = tanpa progress bar)
//   step      — langkah aktif (1-based)
//   onBack    — tampilkan tombol kembali bila ada
//   actions   — elemen tambahan di kanan header (mis. tombol SOP)
//   footer    — isi footer sticky (biasanya tombol utama)
export default function FormShell({ title, subtitle, steps = 0, step = 1, onBack, actions, footer, children }) {
  return (
    <div className={`fh-root${footer ? " has-footer" : ""}`}>
      <header className="fh-header">
        {onBack && (
          <button type="button" className="fh-icon-btn" onClick={onBack} aria-label="Kembali">
            <Icon name="ArrowLeft" />
          </button>
        )}
        <div className="fh-header-text">
          <h1 className="fh-title">{title}</h1>
          {subtitle && <p className="fh-subtitle">{subtitle}</p>}
        </div>
        {actions}
      </header>

      {steps > 1 && (
        <div className="fh-progress" aria-label={`Langkah ${step} dari ${steps}`}>
          {Array.from({ length: steps }, (_, i) => (
            <span key={i} className={i < step ? "is-done" : ""} />
          ))}
        </div>
      )}

      <main className="fh-content">{children}</main>

      {footer && (
        <footer className="fh-footer">
          <div className="fh-footer-inner">{footer}</div>
        </footer>
      )}
    </div>
  );
}
