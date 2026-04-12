import { useState, useEffect } from "react";
import SOP from "../data/sopContent";

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

// ─── SOPModal Component ────────────────────────────────────────────────────────
export default function SOPModal({ menuKey, onClose }) {
  const sop = SOP[menuKey];
  const [activeStep, setActiveStep] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // Reset step saat ganti menu
  useEffect(() => {
    setActiveStep(0);
    setDontShowAgain(false);
  }, [menuKey]);

  if (!sop) return null;

  const totalSteps = sop.steps.length;
  const isLastStep = activeStep === totalSteps - 1;
  const isNotesStep = activeStep === totalSteps; // step terakhir = notes

  function handleClose() {
    if (dontShowAgain) markMenuSeen(menuKey);
    onClose();
  }

  function handleNext() {
    if (isLastStep) {
      setActiveStep(totalSteps); // ke halaman notes
    } else if (isNotesStep) {
      handleClose();
    } else {
      setActiveStep(s => s + 1);
    }
  }

  const currentStep = !isNotesStep ? sop.steps[activeStep] : null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
        padding: "0 0 0 0",
      }}
    >
      <div style={{
        width: "100%", maxWidth: 520,
        background: "linear-gradient(180deg, #0f1f14 0%, #0a1a0f 100%)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "20px 20px 0 0",
        padding: "0 0 env(safe-area-inset-bottom,16px) 0",
        maxHeight: "88vh",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.5)",
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: "18px 20px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          display: "flex", alignItems: "flex-start", gap: 12,
          flexShrink: 0,
        }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12, flexShrink: 0,
            background: `${sop.color}22`,
            border: `1px solid ${sop.color}44`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20,
          }}>
            {sop.icon}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: sop.color, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 2 }}>
              Panduan Penggunaan
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", lineHeight: 1.2 }}>
              {sop.title}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 3, lineHeight: 1.4 }}>
              {sop.description}
            </div>
          </div>
          <button
            onClick={handleClose}
            style={{
              width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.45)",
              fontSize: 14, cursor: "pointer", flexShrink: 0, display: "flex",
              alignItems: "center", justifyContent: "center",
            }}
          >✕</button>
        </div>

        {/* ── Progress bar ── */}
        <div style={{ padding: "10px 20px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 4 }}>
            {[...Array(totalSteps + 1)].map((_, i) => (
              <div key={i} style={{
                flex: 1, height: 3, borderRadius: 2,
                background: i <= activeStep ? sop.color : "rgba(255,255,255,0.1)",
                transition: "background 0.3s",
              }} />
            ))}
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 5, textAlign: "right" }}>
            {isNotesStep ? "Catatan Penting" : `Langkah ${activeStep + 1} dari ${totalSteps}`}
          </div>
        </div>

        {/* ── Content (scrollable) ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>

          {/* Langkah-langkah */}
          {!isNotesStep && currentStep && (
            <div>
              {/* Step indicator */}
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                background: `${sop.color}18`, border: `1px solid ${sop.color}33`,
                borderRadius: 20, padding: "4px 12px 4px 6px", marginBottom: 16,
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: "50%",
                  background: sop.color, color: "#fff",
                  fontSize: 12, fontWeight: 800,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {currentStep.step}
                </div>
                <span style={{ fontSize: 12, color: sop.color, fontWeight: 700 }}>
                  Langkah {currentStep.step}
                </span>
              </div>

              <h3 style={{ fontSize: 18, fontWeight: 800, color: "#fff", margin: "0 0 10px", lineHeight: 1.3 }}>
                {currentStep.title}
              </h3>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", lineHeight: 1.7, margin: 0 }}>
                {currentStep.detail}
              </p>

              {/* Mini step navigator (dots) */}
              <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 24 }}>
                {sop.steps.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveStep(i)}
                    style={{
                      width: i === activeStep ? 20 : 8,
                      height: 8, borderRadius: 4, border: "none", cursor: "pointer",
                      background: i === activeStep ? sop.color : "rgba(255,255,255,0.15)",
                      transition: "all 0.2s", padding: 0,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Notes/Catatan penting */}
          {isNotesStep && (
            <div>
              <div style={{
                display: "flex", alignItems: "center", gap: 8, marginBottom: 16,
              }}>
                <span style={{ fontSize: 20 }}>📌</span>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: "#fff", margin: 0 }}>
                  Catatan Penting
                </h3>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {sop.notes.map((note, i) => (
                  <div key={i} style={{
                    display: "flex", gap: 10, padding: "12px 14px",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12, alignItems: "flex-start",
                  }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                      background: `${sop.color}22`, border: `1px solid ${sop.color}44`,
                      color: sop.color, fontSize: 11, fontWeight: 800,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      marginTop: 1,
                    }}>
                      {i + 1}
                    </span>
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", margin: 0, lineHeight: 1.6 }}>
                      {note}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: "12px 20px 16px",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
        }}>
          {/* Checkbox jangan tampilkan lagi */}
          <button
            onClick={() => setDontShowAgain(v => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "transparent", border: "none", cursor: "pointer",
              padding: "0 0 10px", width: "100%", textAlign: "left",
            }}
          >
            <div style={{
              width: 18, height: 18, borderRadius: 5,
              border: `2px solid ${dontShowAgain ? sop.color : "rgba(255,255,255,0.2)"}`,
              background: dontShowAgain ? `${sop.color}22` : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, transition: "all 0.2s",
            }}>
              {dontShowAgain && <span style={{ color: sop.color, fontSize: 11, fontWeight: 900 }}>✓</span>}
            </div>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
              Jangan tampilkan lagi untuk menu ini
            </span>
          </button>

          <div style={{ display: "flex", gap: 10 }}>
            {activeStep > 0 && (
              <button
                onClick={() => setActiveStep(s => s - 1)}
                style={{
                  flex: 1, padding: "13px", borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.05)",
                  color: "rgba(255,255,255,0.6)",
                  fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}
              >
                ← Kembali
              </button>
            )}
            <button
              onClick={handleNext}
              style={{
                flex: 2, padding: "13px", borderRadius: 12, border: "none",
                background: isNotesStep
                  ? `linear-gradient(135deg, ${sop.color}cc, ${sop.color})`
                  : `linear-gradient(135deg, ${sop.color}99, ${sop.color}cc)`,
                color: "#fff",
                fontSize: 14, fontWeight: 700, cursor: "pointer",
              }}
            >
              {isNotesStep ? "Saya Mengerti ✓" : isLastStep ? "Lihat Catatan →" : "Lanjut →"}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>
    </div>
  );
}
