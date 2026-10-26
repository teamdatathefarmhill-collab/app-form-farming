import { createPortal } from "react-dom";

// Dialog konfirmasi di tengah layar.
//   actions — node tombol (biasanya .fh-btn-row)
export default function Dialog({ open, title, children, actions, onClose }) {
  if (!open) return null;
  return createPortal(
    <div className="fh-root fh-overlay" onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="fh-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h2 className="fh-dialog-title">{title}</h2>
        <div className="fh-dialog-body">{children}</div>
        {actions && <div className="fh-dialog-actions">{actions}</div>}
      </div>
    </div>,
    document.body
  );
}
