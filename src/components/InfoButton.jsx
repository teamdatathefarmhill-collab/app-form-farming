import { useState } from "react";
import { createPortal } from "react-dom";
import SOPModal from "./SOPModal";
import SOP from "../data/sopContent";
import { Icon } from "./form";

// ─── InfoButton ────────────────────────────────────────────────────────────────
// Tombol "i" di header app untuk membuka panduan menu kapan saja.
// Bergaya .fh-appbar-btn — sama dengan tombol WA & Logout di header app.
// Props:
//   menuKey  — key menu aktif (e.g. "penyemprotan", "gramasi", dll)

export default function InfoButton({ menuKey }) {
  const [open, setOpen] = useState(false);
  const sop = SOP[menuKey];

  if (!sop) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Panduan ${sop.title}`}
        aria-label={`Panduan ${sop.title}`}
        className="fh-appbar-btn"
      >
        <Icon name="Info" size={18} />
      </button>

      {open && createPortal(
        <SOPModal
          menuKey={menuKey}
          onClose={() => setOpen(false)}
        />,
        document.body
      )}
    </>
  );
}
