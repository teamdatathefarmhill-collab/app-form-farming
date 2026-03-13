import { useState } from "react";
import Sanitasi from "./pages/Sanitasi";
import HPT from "./pages/HPT";
import Gramasi from "./pages/Gramasi";

const TABS = [
  { key: "sanitasi", label: "Sanitasi", icon: "🌿", color: "#4CAF50",  component: Sanitasi },
  { key: "hpt",      label: "HPT",      icon: "🐛", color: "#FF7043",  component: HPT      },
  { key: "gramasi",  label: "Gramasi",  icon: "⚖️", color: "#1E88E5",  component: Gramasi  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("sanitasi");

  const ActivePage  = TABS.find((t) => t.key === activeTab)?.component;
  const activeColor = TABS.find((t) => t.key === activeTab)?.color || "#4CAF50";

  return (
    <div style={{ minHeight: "100vh", width: "100%", display: "flex", flexDirection: "column", position: "relative" }}>

      {/* ── Halaman aktif ── */}
      <div style={{ flex: 1, paddingBottom: 64, width: "100%" }}>
        {ActivePage && <ActivePage />}
      </div>

      {/* ── Bottom Tab Navigation ── */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          width: "100%",
          background: "rgba(10,20,15,0.97)",
          borderTop: "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          zIndex: 100,
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                flex: 1,
                padding: "10px 4px 14px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                transition: "all 0.2s",
                borderTop: isActive ? `2px solid ${tab.color}` : "2px solid transparent",
              }}
            >
              <span style={{ fontSize: 22, lineHeight: 1 }}>{tab.icon}</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? tab.color : "rgba(255,255,255,0.35)",
                  letterSpacing: 0.5,
                  transition: "color 0.2s",
                }}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      <style>{`
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: #0a1a0f; width: 100%; overflow-x: hidden; }
      `}</style>
    </div>
  );
}
