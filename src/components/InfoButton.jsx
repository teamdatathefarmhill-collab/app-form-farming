import { useState } from "react";
import { createPortal } from "react-dom";
import SOPModal from "./SOPModal";
import SOP from "../data/sopContent";
import { Icon } from "./form";

// ─── InfoButton ────────────────────────────────────────────────────────────────
// Tombol "i" di header app untuk membuka panduan menu kapan saja.
// Header app masih gelap (sampai bottom bar/header baru di PRD 6.0), jadi tombol
// ini memakai garis putih tipis; ukurannya sama dengan tombol WA di sebelahnya.
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
        style={{
          width: 30, height: 30, borderRadius: 4, padding: 0, flexShrink: 0,
          border: "1px solid rgba(255,255,255,0.28)",
          background: "rgba(255,255,255,0.06)",
          color: "rgba(255,255,255,0.85)",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer",
        }}
      >
        <Icon name="Info" size={17} />
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
