import { useState, useEffect, useRef } from "react";
import Sanitasi from "./pages/Sanitasi";
import HPT from "./pages/HPT";
import Gramasi from "./pages/Gramasi";
import Vigor from "./pages/Vigor";
import KesiapanGH from "./pages/KesiapanGH";
import Penyiraman from "./pages/Penyiraman";
import SO from "./pages/SO";
import FarmhillLogin from "./components/FarmhillLogin";
import { useAuth } from "./hooks/useAuth";

// Sub-menu HPT — key harus match kolom di REF OPERATOR
const HPT_SUBMENU = [
  { key: "so",           label: "SO",           icon: "📋", component: SO        },
  { key: "penyemprotan", label: "Penyemprotan", icon: "💦"                       },
  { key: "sanitasi",     label: "Sanitasi",     icon: "🌿", component: Sanitasi  },
  { key: "hpt",          label: "HPT",          icon: "🐛", component: HPT       },
];

// Menu standalone (bukan bagian HPT)
const STANDALONE_TABS = [
  { key: "gramasi",    label: "Gramasi",    icon: "⚖️",  color: "#1E88E5", component: Gramasi    },
  { key: "penyiraman", label: "Penyiraman", icon: "💧",  color: "#0277bd", component: Penyiraman },
  { key: "vigor",      label: "Vigor",      icon: "🌱",  color: "#43A047", component: Vigor      },
  { key: "kesiapan",   label: "Kesiapan",   icon: "🏗️",  color: "#00897B", component: KesiapanGH },
];

const HPT_COLOR = "#FF7043";

export default function App() {
  const { user, login, logout, isLoggedIn } = useAuth();
  const [activeTab, setActiveTab]     = useState(null);
  const [hptOpen, setHptOpen]         = useState(false);
  const hptRef                        = useRef(null);

  // Tutup dropdown HPT saat klik di luar
  useEffect(() => {
    const handler = (e) => {
      if (hptRef.current && !hptRef.current.contains(e.target)) {
        setHptOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!isLoggedIn) {
    return (
      <FarmhillLogin
        onLoginSuccess={(userData, remember) => login(userData, remember)}
      />
    );
  }

  // Filter submenu HPT yang punya akses
  const accessibleHPT = HPT_SUBMENU.filter(
    t => user[t.key]?.toUpperCase() === "YES"
  );

  // Filter standalone tabs yang punya akses
  const accessibleStandalone = STANDALONE_TABS.filter(
    t => user[t.key]?.toUpperCase() === "YES"
  );

  const hasHPTAccess = accessibleHPT.length > 0;

  // Semua tab yang bisa diakses (untuk cek apakah ada akses sama sekali)
  const totalAccess = accessibleHPT.length + accessibleStandalone.length;

  // Cari komponen aktif
  const activeHPTItem        = accessibleHPT.find(t => t.key === activeTab);
  const activeStandaloneItem = accessibleStandalone.find(t => t.key === activeTab);

  // Default ke tab pertama standalone jika ada, atau HPT submenu pertama
  const defaultTab         = accessibleStandalone[0]?.key ?? accessibleHPT[0]?.key ?? null;
  const resolvedTab        = activeTab ?? defaultTab;
  const resolvedHPT        = accessibleHPT.find(t => t.key === resolvedTab);
  const resolvedStandalone = accessibleStandalone.find(t => t.key === resolvedTab);
  const ActivePage         = resolvedHPT?.component ?? resolvedStandalone?.component ?? null;
  const isHPTActive        = accessibleHPT.some(t => t.key === resolvedTab);

  if (totalAccess === 0) {
    return (
      <div style={{
        minHeight: "100vh", background: "#0a1a0f",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", gap: 16, padding: "2rem",
        fontFamily: "'Segoe UI', system-ui, sans-serif",
      }}>
        <span style={{ fontSize: 40 }}>🔒</span>
        <p style={{ color: "rgba(255,255,255,0.6)", textAlign: "center", fontSize: 14 }}>
          Akun <strong style={{ color: "#fff" }}>{user.nama}</strong> belum memiliki akses modul apapun.
          <br />Hubungi admin untuk pengaturan akses.
        </p>
        <button onClick={logout} style={{ padding: "10px 24px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer" }}>
          Logout
        </button>
      </div>
    );
  }

  // Halaman placeholder untuk menu yang belum ada form
  const PlaceholderPage = ({ label }) => (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, padding: 32 }}>
      <span style={{ fontSize: 48 }}>🚧</span>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#333" }}>Form {label}</div>
      <div style={{ fontSize: 13, color: "#888", textAlign: "center" }}>Sedang dalam pengembangan</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", width: "100%", display: "flex", flexDirection: "column", position: "relative" }}>

      {/* Header */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 101,
        background: "rgba(10,20,15,0.97)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 16px",
        backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg, #2d7a4a, #4aaa6e)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🌿</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#fff", lineHeight: 1.2 }}>{user.nama}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", lineHeight: 1.2 }}>ID {user.id}</div>
          </div>
        </div>
        <button onClick={logout} style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.45)", fontSize: 11, cursor: "pointer" }}>
          Logout
        </button>
      </div>

      {/* Halaman aktif */}
      <div style={{ flex: 1, paddingTop: 48, paddingBottom: 64, width: "100%" }}>
        {ActivePage
          ? <ActivePage />
          : <PlaceholderPage label={resolvedHPT?.label ?? resolvedStandalone?.label ?? ""} />
        }
      </div>

      {/* Bottom Tab Navigation */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, width: "100%",
        background: "rgba(10,20,15,0.97)",
        borderTop: "1px solid rgba(255,255,255,0.1)",
        display: "flex", zIndex: 100,
        backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
      }}>

        {/* HPT Dropdown (jika ada akses) */}
        {hasHPTAccess && (
          <div ref={hptRef} style={{ flex: 1, position: "relative" }}>

            {/* Dropdown menu — muncul ke atas */}
            {hptOpen && (
              <div style={{
                position: "absolute", bottom: "100%", left: 0, right: 0,
                background: "rgba(10,20,15,0.98)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderBottom: "none",
                borderRadius: "12px 12px 0 0",
                overflow: "hidden",
              }}>
                {accessibleHPT.map(item => {
                  const isActive = resolvedTab === item.key;
                  return (
                    <button key={item.key} onClick={() => { setActiveTab(item.key); setHptOpen(false); }}
                      style={{
                        width: "100%", padding: "12px 16px",
                        background: isActive ? "rgba(255,112,67,0.15)" : "transparent",
                        border: "none", borderBottom: "1px solid rgba(255,255,255,0.06)",
                        color: isActive ? HPT_COLOR : "rgba(255,255,255,0.7)",
                        fontSize: 13, fontWeight: isActive ? 700 : 500,
                        cursor: "pointer", textAlign: "left",
                        display: "flex", alignItems: "center", gap: 10,
                      }}>
                      <span style={{ fontSize: 16 }}>{item.icon}</span>
                      <span>{item.label}</span>
                      {isActive && <span style={{ marginLeft: "auto", fontSize: 11, color: HPT_COLOR }}>●</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {/* HPT Tab Button */}
            <button onClick={() => {
                if (accessibleHPT.length === 1) {
                  setActiveTab(accessibleHPT[0].key);
                } else {
                  setHptOpen(o => !o);
                }
              }}
              style={{
                width: "100%", padding: "10px 4px 14px",
                background: "transparent", border: "none", cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                borderTop: isHPTActive ? `2px solid ${HPT_COLOR}` : "2px solid transparent",
              }}>
              <span style={{ fontSize: 20, lineHeight: 1 }}>🐛</span>
              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span style={{ fontSize: 10, fontWeight: isHPTActive ? 700 : 500, color: isHPTActive ? HPT_COLOR : "rgba(255,255,255,0.35)", letterSpacing: 0.5, whiteSpace: "nowrap" }}>
                  {accessibleHPT.length === 1 ? accessibleHPT[0].label : "HPT"}
                </span>
                {accessibleHPT.length > 1 && (
                  <span style={{ fontSize: 8, color: isHPTActive ? HPT_COLOR : "rgba(255,255,255,0.35)", transition: "transform 0.2s", display: "inline-block", transform: hptOpen ? "rotate(180deg)" : "rotate(0deg)" }}>▲</span>
                )}
              </div>
            </button>
          </div>
        )}

        {/* Standalone tabs */}
        {accessibleStandalone.map((tab) => {
          const isActive = resolvedTab === tab.key;
          return (
            <button key={tab.key} onClick={() => { setActiveTab(tab.key); setHptOpen(false); }}
              style={{
                flex: 1, minWidth: 60, padding: "10px 4px 14px",
                background: "transparent", border: "none", cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center",
                gap: 4, transition: "all 0.2s",
                borderTop: isActive ? `2px solid ${tab.color}` : "2px solid transparent",
              }}>
              <span style={{ fontSize: 20, lineHeight: 1 }}>{tab.icon}</span>
              <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, color: isActive ? tab.color : "rgba(255,255,255,0.35)", letterSpacing: 0.5, whiteSpace: "nowrap" }}>
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
