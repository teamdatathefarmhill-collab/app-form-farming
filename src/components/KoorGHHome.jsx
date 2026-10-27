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
import VigorReminder from "./VigorReminder";
import { useGHData } from "../hooks/useGHData";
import { gasFetch } from "../utils/idb";
import { Icon } from "./form";

const GHREF_URL = import.meta.env.VITE_GAS_GHREF_URL;

// Sama persis dengan key yang dipakai Vigor.jsx untuk tandai "GH sudah diisi
// hari ini" (LS_PREFIX di Vigor.jsx) — dibaca di sini juga, tidak perlu GAS baru.
const VIGOR_LS_PREFIX = "vigor_submitted_";
function getVigorSubmittedToday() {
  try {
    const d   = new Date();
    const key = `${VIGOR_LS_PREFIX}${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

// Nama GH di sheet DAILY TASK bisa beda kapitalisasi dari key di ghData
// (misal "Tohudan 9" vs "TOHUDAN 9"), jadi cari case-insensitive.
function findGHInfo(ghData, ghName) {
  if (!ghName) return null;
  if (ghData[ghName]) return ghData[ghName];
  const target = ghName.trim().toUpperCase();
  const matchedKey = Object.keys(ghData).find(k => k.toUpperCase() === target);
  return matchedKey ? ghData[matchedKey] : null;
}

function hitungHST(tgl) {
  if (!tgl) return null;
  const [y, m, d] = tgl.split("-").map(Number);
  const tanam = new Date(y, m - 1, d);
  const now = new Date();
  const nowLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((nowLocal - tanam) / 86400000);
}

// Sama persis dengan checkpoint & window "due" di Vigor.jsx (HST_CHECKPOINTS +
// getCheckpointStatus) — biar Home Koor GH dan form Vigor selalu sepakat soal
// kapan suatu GH "due" untuk diisi Vigor.
const VIGOR_CHECKPOINTS = [7, 11, 14, 18, 33, 38, 45, 54];
const VIGOR_DUE_RANGE   = 3;
function isVigorDue(hst) {
  if (hst === null) return false;
  return VIGOR_CHECKPOINTS.some(cp => hst >= cp && hst <= cp + VIGOR_DUE_RANGE);
}

// Dari baris DAILY TASK (Tanggal, Operator, GH [, Menu opsional]) → daftar kartu
// kegiatan. Penyiraman selalu muncul (aktivitas harian). Vigor cuma muncul kalau
// HST GH itu sedang due checkpoint. Kalau kolom Menu di sheet diisi manual,
// itu dipakai sebagai override (tidak di-generate otomatis).
function expandTasks(rows, ghData) {
  const result = [];
  rows.forEach(t => {
    if (t.menu) { result.push(t); return; }
    const hst = hitungHST(findGHInfo(ghData, t.gh)?.tanam);
    result.push({ ...t, menu: "Penyiraman" });
    if (isVigorDue(hst)) result.push({ ...t, menu: "Vigor" });
  });
  return result;
}

function hstBadgeColor(hst) {
  if (hst === null) return { bg: "#f5f5f5", text: "#aaa", border: "#e0e0e0" };
  if (hst <= 21) return { bg: "#e8f5e9", text: "#2e7d32", border: "#a5d6a7" };
  if (hst <= 40) return { bg: "#fff8e1", text: "#f57f17", border: "#ffe082" };
  return            { bg: "#fbe9e7", text: "#bf360c", border: "#ffab91" };
}

// Menu di sheet "DAILY TASK" dicocokkan ke sini (case-insensitive, tanpa spasi)
const MENU_MAP = {
  penyiraman:   { label: "Penyiraman",   icon: "Droplets", color: "#0277bd", component: Penyiraman },
  vigor:        { label: "Vigor",        icon: "Sprout", color: "#43A047", component: Vigor },
  gramasi:      { label: "Gramasi",      icon: "Scale", color: "#1E88E5", component: Gramasi },
  kesiapan:     { label: "Kesiapan GH",  icon: "ClipboardCheck", color: "#00897B", component: KesiapanGH },
  so:           { label: "SO",           icon: "ClipboardList", color: "#FF7043", component: SO },
  penyemprotan: { label: "Penyemprotan", icon: "SprayCan", color: "#FF7043", component: Penyemprotan },
  sanitasi:     { label: "Sanitasi",     icon: "ShieldCheck", color: "#FF7043", component: Sanitasi },
  hpt:          { label: "HPT",          icon: "Bug", color: "#FF7043", component: HPT },
  cuaca:        { label: "Cuaca",        icon: "CloudSun", color: "#0d47a1", component: Cuaca },
};

function normalizeMenuKey(menu) {
  return (menu || "").trim().toLowerCase().replace(/\s+/g, "");
}

export default function KoorGHHome({ user, logout }) {
  const [tasks, setTasks]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activeTask, setActiveTask] = useState(null);
  const { ghData, loading: loadingGH } = useGHData();
  const vigorSubmittedToday = getVigorSubmittedToday();
  const displayedTasks = loadingGH ? [] : expandTasks(tasks, ghData);

  useEffect(() => {
    if (!GHREF_URL || !user?.nama) { setLoading(false); setLoadError(true); return; }
    gasFetch(`${GHREF_URL}?action=getDailyTask&operator=${encodeURIComponent(user.nama)}`)
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
    // fh-embed: form tampil tanpa header & bottom bar app → footer form menempel di bawah layar
    return <div className="fh-embed"><ActiveForm initialGH={activeTask.gh} onDone={() => setActiveTask(null)} /></div>;
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

      <VigorReminder onOpenVigor={(gh) => setActiveTask({ gh, menu: "Vigor" })} />

      {/* Kegiatan Harian */}
      <div style={{ padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1b5e20", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
          📋 Kegiatan Hari Ini
        </div>

        {(loading || loadingGH) && (
          <div style={{ textAlign: "center", padding: "32px 0", color: "#aaa", fontSize: 13 }}>🔄 Memuat jadwal...</div>
        )}

        {!loading && loadError && (
          <div style={{ fontSize: 12, color: "#e65100", background: "#fff3e0", border: "1px solid #ffb74d", borderRadius: 10, padding: "12px 14px" }}>
            ⚠️ Gagal memuat jadwal harian. Cek koneksi atau hubungi admin.
          </div>
        )}

        {!loading && !loadingGH && !loadError && displayedTasks.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 16px", color: "#aaa" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🌤️</div>
            <div style={{ fontSize: 13 }}>Tidak ada kegiatan terjadwal hari ini.</div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {!loading && !loadingGH && displayedTasks.map((t, i) => {
            const menuKey = normalizeMenuKey(t.menu);
            const menuDef = MENU_MAP[menuKey];
            const color   = menuDef?.color || "#666";
            const icon    = menuDef?.icon  || "ClipboardList";
            const hst     = hitungHST(findGHInfo(ghData, t.gh)?.tanam);
            const hstC    = hstBadgeColor(hst);
            const isVigor = menuKey === "vigor";
            const sudahIsi = isVigor && vigorSubmittedToday.includes(t.gh);

            return (
              <button key={i} onClick={() => setActiveTask(t)}
                style={{ textAlign: "left", background: "#fff", border: `1.5px solid ${sudahIsi ? "#ffb74d" : "#e0e0e0"}`, borderRadius: 14, padding: "14px 12px", cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: `${color}1a`, display: "flex", alignItems: "center", justifyContent: "center", color }}><Icon name={icon} size={20} /></div>
                  <span style={{ fontSize: 13, color: "#ccc" }}>›</span>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#333" }}>{menuDef?.label || t.menu}</div>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{t.gh}</div>
                </div>
                {hst !== null && (
                  <div style={{ background: hstC.bg, border: `1px solid ${hstC.border}`, borderRadius: 8, padding: "3px 8px", display: "inline-block", alignSelf: "flex-start" }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: hstC.text }}>{hst}</span>
                    <span style={{ fontSize: 9, color: hstC.text, marginLeft: 2 }}>HST</span>
                  </div>
                )}
                {(t.jamMulai || t.jamSelesai) && (
                  <div style={{ fontSize: 10, color: "#aaa" }}>{t.jamMulai} – {t.jamSelesai}</div>
                )}
                {sudahIsi && (
                  <div style={{ fontSize: 10, background: "#fff3e0", border: "1px solid #ffb74d", borderRadius: 20, padding: "2px 8px", color: "#e65100", fontWeight: 600, alignSelf: "flex-start" }}>
                    ✓ Sudah diisi hari ini
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
