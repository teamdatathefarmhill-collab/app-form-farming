import { useState } from "react";
import { createPortal } from "react-dom";
import SOPModal from "./SOPModal";
import SOP from "../data/sopContent";

// ─── InfoButton ────────────────────────────────────────────────────────────────
// Tombol "i" yang muncul di header untuk membuka panduan menu kapan saja
// Props:
//   menuKey  — key menu aktif (e.g. "penyemprotan", "gramasi", dll)
//   color    — warna aksen (opsional, default ambil dari SOP)

export default function InfoButton({ menuKey, color }) {
  const [open, setOpen] = useState(false);
  const sop = SOP[menuKey];

  if (!sop) return null;

  const accentColor = color || sop.color || "#4aaa6e";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={`Panduan ${sop.title}`}
        style={{
          width: 28, height: 28, borderRadius: 8,
          border: `1px solid ${accentColor}44`,
          background: `${accentColor}18`,
          color: accentColor,
          fontSize: 13, fontWeight: 800,
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
          fontStyle: "italic",
          fontFamily: "Georgia, serif",
          letterSpacing: 0,
          transition: "all 0.15s",
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = `${accentColor}30`;
          e.currentTarget.style.border = `1px solid ${accentColor}77`;
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = `${accentColor}18`;
          e.currentTarget.style.border = `1px solid ${accentColor}44`;
        }}
      >
        i
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
