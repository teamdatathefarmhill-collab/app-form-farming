// ─── KoorGHHome ──────────────────────────────────────────────────────────────
// Home khusus untuk role "KOOR_GH" — cuma 2 hal: Profil & Kegiatan Harian.
// Aktif HANYA kalau kolom ROLE di sheet REF OPERATOR diisi "KOOR_GH" untuk
// user tersebut. User lain (ROLE kosong) tidak terpengaruh sama sekali —
// App.jsx tetap render menu normal seperti biasa untuk mereka.
//
// Sumber data kegiatan harian: sheet "DAILY TASK", dibaca live lewat action
// "getDailyTask" di GAS GHRef.js (reuse VITE_GAS_GHREF_URL yang sudah ada —
// tidak perlu publish-to-web atau env var baru).

import { useState, useEffect } from "react";
import Gramasi      from "../pages/Gramasi";
import Vigor        from "../pages/Vigor";
import KesiapanGH   from "../pages/KesiapanGH";
import Penyiraman   from "../pages/Penyiraman";
import SO           from "../pages/SO";
import Penyemprotan from "../pages/Penyemprotan";
import Sanitasi     from "../pages/Sanitasi";
import HPT          from "../pages/HPT";
import Cuaca        from "../pages/Cuaca";

const GHREF_URL = import.meta.env.VITE_GAS_GHREF_URL;

// Menu di sheet "DAILY TASK" dicocokkan ke sini (case-insensitive, tanpa spasi)
const MENU_MAP = {
  penyiraman:   { label: "Penyiraman",   icon: "💧", color: "#0277bd", component: Penyiraman },
  vigor:        { label: "Vigor",        icon: "🌿", color: "#43A047", component: Vigor },
  gramasi:      { label: "Gramasi",      icon: "⚖️", color: "#1E88E5", component: Gramasi },
  kesiapan:     { label: "Kesiapan GH",  icon: "✅", color: "#00897B", component: KesiapanGH },
  so:           { label: "SO",           icon: "📑", color: "#FF7043", component: SO },
  penyemprotan: { label: "Penyemprotan", icon: "🧴", color: "#FF7043", component: Penyemprotan },
  sanitasi:     { label: "Sanitasi",     icon: "🛡️", color: "#FF7043", component: Sanitasi },
  hpt:          { label: "HPT",          icon: "🐛", color: "#FF7043", component: HPT },
  cuaca:        { label: "Cuaca",        icon: "🌤️", color: "#0d47a1", component: Cuaca },
};

function normalizeMenuKey(menu) {
  return (menu || "").trim().toLowerCase().replace(/\s+/g, "");
}

export default function KoorGHHome({ user, logout }) {
  const [tasks, setTasks]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activeTask, setActiveTask] = useState(null);

  useEffect(() => {
    if (!GHREF_URL || !user?.nama) { setLoading(false); setLoadError(true); return; }
    fetch(`${GHREF_URL}?action=getDailyTask&operator=${encodeURIComponent(user.nama)}`)
      .then(r => r.json())
      .then(json => {
        if (json.success) setTasks(json.tasks || []);
        else setLoadError(true);
        setLoading(false);
      })
      .catch(() => { setLoading(false); setLoadError(true); });
  }, [user]);

  // ── Render form aktif (kalau ada kegiatan yang sedang dikerjakan) ──────────
  if (activeTask) {
    const menuKey = normalizeMenuKey(activeTask.menu);
    const menuDef = MENU_MAP[menuKey];

    if (!menuDef) {
      return (
        <div style={{ minHeight: "100vh", background: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, padding: 32 }}>
          <span style={{ fontSize: 40 }}>🚧</span>
          <div style={{ fontSize: 14, color: "#666", textAlign: "center" }}>Menu "{activeTask.menu}" belum didukung di tampilan ini.</div>
          <button onClick={() => setActiveTask(null)} style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid #ccc", background: "#fff", cursor: "pointer" }}>← Kembali ke Home</button>
        </div>
      );
    }

    const ActiveForm = menuDef.component;
    return <ActiveForm initialGH={activeTask.gh} onDone={() => setActiveTask(null)} />;
  }

  // ── Home: Profil + Kegiatan Harian ─────────────────────────────────────────
  const todayLabel = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5", fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg,#1b5e20,#2e7d32)", color: "#fff", padding: "20px 18px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.7, letterSpacing: 1.5, textTransform: "uppercase" }}>Koordinator GH</div>
            <div style={{ fontSize: 13, opacity: 0.6, marginTop: 2 }}>{todayLabel}</div>
          </div>
          <button onClick={logout} style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: "rgba(255,255,255,0.8)", fontSize: 11, cursor: "pointer" }}>
            Logout
          </button>
        </div>

        {/* Profil */}
        <div style={{ marginTop: 18, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>👤</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{user?.nama}</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>ID {user?.id} · Koordinator GH</div>
          </div>
        </div>
      </div>

      {/* Kegiatan Harian */}
      <div style={{ padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1b5e20", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
          📋 Kegiatan Hari Ini
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: "32px 0", color: "#aaa", fontSize: 13 }}>🔄 Memuat jadwal...</div>
        )}

        {!loading && loadError && (
          <div style={{ fontSize: 12, color: "#e65100", background: "#fff3e0", border: "1px solid #ffb74d", borderRadius: 10, padding: "12px 14px" }}>
            ⚠️ Gagal memuat jadwal harian. Cek koneksi atau hubungi admin.
          </div>
        )}

        {!loading && !loadError && tasks.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 16px", color: "#aaa" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🌤️</div>
            <div style={{ fontSize: 13 }}>Tidak ada kegiatan terjadwal hari ini.</div>
          </div>
        )}

        {!loading && tasks.map((t, i) => {
          const menuDef = MENU_MAP[normalizeMenuKey(t.menu)];
          const color   = menuDef?.color || "#666";
          const icon    = menuDef?.icon  || "📌";
          return (
            <button key={i} onClick={() => setActiveTask(t)}
              style={{ width: "100%", textAlign: "left", background: "#fff", border: "1px solid #e0e0e0", borderRadius: 14, padding: "14px 16px", marginBottom: 10, display: "flex", alignItems: "center", gap: 14, cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: `${color}1a`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#333" }}>{menuDef?.label || t.menu}</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{t.gh}</div>
                {(t.jamMulai || t.jamSelesai) && (
                  <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>{t.jamMulai} – {t.jamSelesai}</div>
                )}
              </div>
              <span style={{ fontSize: 14, color: "#ccc" }}>›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
