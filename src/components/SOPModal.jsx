import { useState, useEffect } from "react";
import SOP from "../data/sopContent";
import { Icon } from "./form";

// ─── Key localStorage untuk tracking menu yang sudah dibaca ───────────────────
const STORAGE_KEY = "farmhill_sop_seen";

function getSeenMenus() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function markMenuSeen(menuKey) {
  const seen = getSeenMenus();
  seen[menuKey] = true;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seen));
}

export function isMenuSeen(menuKey) {
  return !!getSeenMenus()[menuKey];
}

export function resetAllSeen() {
  localStorage.removeItem(STORAGE_KEY);
}

// ─── SOPModal — panduan per menu, bottom sheet terang (Farmhill design system) ─
// Halaman: langkah 1..n, lalu satu halaman "Catatan penting".
export default function SOPModal({ menuKey, onClose }) {
  const sop = SOP[menuKey];
  const [activeStep, setActiveStep] = useState(0);

  // Reset step saat ganti menu
  useEffect(() => {
    setActiveStep(0);
  }, [menuKey]);

  if (!sop) return null;

  const totalSteps = sop.steps.length;
  const isLastStep = activeStep === totalSteps - 1;
  const isNotesStep = activeStep === totalSteps; // halaman terakhir = catatan

  function handleClose() {
    // Selalu tandai sudah dibaca saat ditutup — agar tidak auto-muncul lagi.
    // User tetap bisa buka kapan saja lewat tombol "i".
    markMenuSeen(menuKey);
    onClose();
  }

  function handleNext() {
    if (isLastStep) {
      setActiveStep(totalSteps); // ke halaman catatan
    } else if (isNotesStep) {
      handleClose();
    } else {
      setActiveStep(s => s + 1);
    }
  }

  const currentStep = !isNotesStep ? sop.steps[activeStep] : null;

  return (
    <div
      className="fh-root fh-overlay is-sheet"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="fh-sheet" role="dialog" aria-modal="true" aria-label={`Panduan ${sop.title}`}>

        {/* ── Header ── */}
        <div className="fh-sheet-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="fh-overline">Panduan penggunaan</div>
            <h2 className="fh-dialog-title" style={{ marginTop: 2 }}>{sop.title}</h2>
            <p className="fh-hint" style={{ marginTop: 4 }}>{sop.description}</p>
          </div>
          <button type="button" className="fh-icon-btn" onClick={handleClose} aria-label="Tutup panduan">
            <Icon name="X" />
          </button>
        </div>

        {/* ── Progress ── */}
        <div style={{ padding: "12px 16px 0" }}>
          <div style={{ display: "flex", gap: 4 }}>
            {[...Array(totalSteps + 1)].map((_, i) => (
              <span
                key={i}
                style={{ flex: 1, height: 4, borderRadius: 2, background: i <= activeStep ? "var(--leaf-600)" : "var(--cream-200)" }}
              />
            ))}
          </div>
          <p className="fh-meta" style={{ margin: "6px 0 0", textAlign: "right" }}>
            {isNotesStep ? "Catatan penting" : `Langkah ${activeStep + 1} dari ${totalSteps}`}
          </p>
        </div>

        {/* ── Isi ── */}
        <div className="fh-sheet-body">
          {currentStep && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="fh-step-num">{currentStep.step}</span>
                <h3 className="fh-dialog-title" style={{ margin: 0 }}>{currentStep.title}</h3>
              </div>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "var(--ink-700)" }}>
                {currentStep.detail}
              </p>

              <div className="fh-dots" role="tablist" aria-label="Pilih langkah">
                {sop.steps.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    className={i === activeStep ? "is-active" : ""}
                    onClick={() => setActiveStep(i)}
                    aria-label={`Langkah ${s.step}`}
                    aria-selected={i === activeStep}
                  >
                    <span />
                  </button>
                ))}
              </div>
            </>
          )}

          {isNotesStep && (
            <>
              <h3 className="fh-dialog-title" style={{ margin: 0 }}>Catatan penting</h3>
              {sop.notes.map((note, i) => (
                <div key={i} className="fh-card" style={{ display: "flex", gap: 10, padding: "12px 14px", alignItems: "flex-start" }}>
                  <span className="fh-step-num is-soft" style={{ width: 24, height: 24, fontSize: 12 }}>{i + 1}</span>
                  <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: "var(--ink-700)" }}>{note}</p>
                </div>
              ))}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="fh-sheet-foot">
          <div className="fh-btn-row">
            {activeStep > 0 && (
              <button type="button" className="fh-btn fh-btn-secondary" onClick={() => setActiveStep(s => s - 1)}>
                Kembali
              </button>
            )}
            <button type="button" className="fh-btn fh-btn-primary" onClick={handleNext}>
              {isNotesStep ? "Saya mengerti" : isLastStep ? "Lihat catatan" : "Lanjut"}
            </button>
          </div>
          <p className="fh-meta" style={{ margin: 0, textAlign: "center" }}>
            Buka lagi kapan saja lewat tombol <Icon name="Info" size={14} style={{ verticalAlign: "-2px" }} /> di kanan atas.
          </p>
        </div>
      </div>
    </div>
  );
}
