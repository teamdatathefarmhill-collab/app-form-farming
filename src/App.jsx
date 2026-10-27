import { useState, useEffect } from "react";
import Sanitasi     from "./pages/Sanitasi";
import HPT          from "./pages/HPT";
import Gramasi      from "./pages/Gramasi";
import Vigor        from "./pages/Vigor";
import KesiapanGH   from "./pages/KesiapanGH";
import Penyiraman   from "./pages/Penyiraman";
import SO           from "./pages/SO";
import Penyemprotan from "./pages/Penyemprotan";
import Cuaca from "./pages/Cuaca";
import PemetaanGH from "./pages/PemetaanGH";
import FarmhillLogin from "./components/FarmhillLogin";
import KoorGHHome from "./components/KoorGHHome";
import SOPModal, { isMenuSeen } from "./components/SOPModal";
import InfoButton from "./components/InfoButton";
import WAButton from "./components/WAButton";
import EmergencyGHButton from "./components/EmergencyGHButton";
import GHBlockedModal from "./components/GHBlockedModal";
import VigorReminder from "./components/VigorReminder";
import InstallPWA from "./components/InstallPWA";
import PWAUpdatePrompt from "./components/PWAUpdatePrompt";
import { useAuth } from "./hooks/useAuth";
import { Icon } from "./components/form";

// ─── Build ID — di-inject otomatis oleh Vite saat build ──────────────────────
// Setiap ada file yang berubah dan di-build ulang, BUILD_ID otomatis berubah.
// Operator akan dapat notif "ada pembaruan" tanpa perlu nulis apapun manual.
const BUILD_ID        = import.meta.env.VITE_APP_BUILD_ID ?? "dev";
const APP_VERSION_KEY = "farmhill_build_id";

// Sub-menu HPT — key harus match kolom di REF OPERATOR
const HPT_SUBMENU = [
  { key: "so",           label: "SO",           icon: "ClipboardList", component: SO           },
  { key: "penyemprotan", label: "Penyemprotan", icon: "SprayCan", component: Penyemprotan },
  { key: "sanitasi",     label: "Sanitasi",     icon: "ShieldCheck", component: Sanitasi     },
  { key: "hpt",          label: "HPT",          icon: "Bug", component: HPT          },
];

// Menu standalone (bukan bagian HPT)
const STANDALONE_TABS = [
  { key: "gramasi",    label: "Gramasi",    icon: "Scale",  color: "#1E88E5", component: Gramasi    },
  { key: "penyiraman", label: "Penyiraman", icon: "Droplets",  color: "#0277bd", component: Penyiraman },
  { key: "vigor",      label: "Vigor",      icon: "Sprout",  color: "#43A047", component: Vigor      },
  { key: "kesiapan",   label: "Kesiapan",   icon: "ClipboardCheck",  color: "#00897B", component: KesiapanGH },
  { key: "cuaca", label: "Cuaca", icon: "CloudSun", color: "#0d47a1", component: Cuaca },
  { key: "pemetaan", label: "Pemetaan", icon: "Map", color: "#1b5e20", component: PemetaanGH },
];

// Bottom bar maksimal 5 tab; lebih dari itu → 4 tab + "Lainnya" (PRD 6.0)
const MAX_TABS = 5;

export default function App() {
  const { user, login, logout, isLoggedIn } = useAuth();
  const [activeTab, setActiveTab]     = useState(null);
  const [sheet, setSheet]             = useState(null); // null | "hpt" | "lainnya"
  const [sopMenuKey, setSopMenuKey]   = useState(null);
  const [isOnline, setIsOnline]       = useState(navigator.onLine);
  const [showUpdateNotif, setShowUpdateNotif] = useState(false);

  useEffect(() => {
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // Tampilkan SOP saat tab berganti, hanya jika belum pernah dibaca
  function switchTab(key) {
    setActiveTab(key);
    setSheet(null);
    if (!isMenuSeen(key)) {
      setSopMenuKey(key);
    }
  }

  // Tampilkan SOP untuk tab awal saat pertama login
  useEffect(() => {
    if (!isLoggedIn) return;
    const allTabs = [
      ...STANDALONE_TABS.filter(t => user[t.key]?.toUpperCase() === "YES"),
      ...HPT_SUBMENU.filter(t => user[t.key]?.toUpperCase() === "YES"),
    ];
    const firstTab = allTabs[0]?.key ?? null;
    if (firstTab && !isMenuSeen(firstTab)) {
      setSopMenuKey(firstTab);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);

  // Cek build ID setelah login — tampilkan notif kalau ada update sejak terakhir buka
  useEffect(() => {
    if (!isLoggedIn) return;
    const savedBuildId = localStorage.getItem(APP_VERSION_KEY);
    if (savedBuildId !== BUILD_ID) {
      setShowUpdateNotif(true);
    }
  }, [isLoggedIn]);

  if (!isLoggedIn) {
    return (
      <FarmhillLogin
        onLoginSuccess={(userData, remember) => login(userData, remember)}
      />
    );
  }

  // Role "KOOR_GH" (kolom ROLE di sheet REF OPERATOR) dapat tampilan tersendiri —
  // cuma Profil + Kegiatan Harian, bukan menu grid biasa. User lain (ROLE kosong)
  // tidak terpengaruh sama sekali, tetap lanjut ke logic menu di bawah.
  if (user?.role?.trim().toUpperCase() === "KOOR_GH") {
    return <KoorGHHome user={user} logout={logout} />;
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

  // Default ke tab pertama standalone jika ada, atau HPT submenu pertama
  const defaultTab         = accessibleStandalone[0]?.key ?? accessibleHPT[0]?.key ?? null;
  const resolvedTab        = activeTab ?? defaultTab;
  const resolvedHPT        = accessibleHPT.find(t => t.key === resolvedTab);
  const resolvedStandalone = accessibleStandalone.find(t => t.key === resolvedTab);
  const ActivePage         = resolvedHPT?.component ?? resolvedStandalone?.component ?? null;
  const isHPTActive        = accessibleHPT.some(t => t.key === resolvedTab);

  if (totalAccess === 0) {
    return (
      <div className="fh-root" style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 14, padding: 32, margin: 0, minHeight: "100vh", textAlign: "center" }}>
        <Icon name="Lock" size={32} />
        <p style={{ margin: 0, fontSize: 15, color: "var(--ink-700)" }}>
          Akun <strong>{user.nama}</strong> belum memiliki akses modul apapun.
          <br />Hubungi admin untuk pengaturan akses.
        </p>
        <button type="button" className="fh-btn fh-btn-secondary" style={{ width: "auto", padding: "0 24px" }} onClick={logout}>Logout</button>
      </div>
    );
  }

  // Halaman placeholder untuk menu yang belum ada form
  const PlaceholderPage = ({ label }) => (
    <div className="fh-root" style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, padding: 32 }}>
      <div className="fh-card-title">Form {label}</div>
      <p className="fh-hint">Sedang dalam pengembangan.</p>
    </div>
  );

  // ── Tab bottom bar: grup HPT (bila ada akses) lalu menu standalone, urutan tetap ──
  const hptEntry = hasHPTAccess
    ? (accessibleHPT.length === 1
        ? { ...accessibleHPT[0] }
        : { key: "__hpt", label: "HPT", icon: "Bug", group: accessibleHPT })
    : null;
  const entries   = [...(hptEntry ? [hptEntry] : []), ...accessibleStandalone];
  const overflow  = entries.length > MAX_TABS;
  const visible   = overflow ? entries.slice(0, MAX_TABS - 1) : entries;
  const lainnya   = overflow ? entries.slice(MAX_TABS - 1) : [];
  const isEntryActive = (e) => (e.group ? isHPTActive : resolvedTab === e.key);
  const lainnyaActive = lainnya.some(isEntryActive);
  const openEntry = (e) => (e.group ? setSheet("hpt") : switchTab(e.key));

  // Isi sheet: submenu HPT, atau sisa menu (submenu HPT dibuka rata bila grup HPT ada di "Lainnya")
  const sheetItems = sheet === "hpt"
    ? accessibleHPT
    : lainnya.flatMap(e => (e.group ? e.group : [e]));

  const topOffset = isOnline ? 48 : 76;

  return (
    <div style={{ minHeight: "100vh", width: "100%", display: "flex", flexDirection: "column", position: "relative" }}>

      {/* ── Header app — putih tipis (PRD 6.0) ── */}
      <header className="fh-appbar">
        <div className="fh-appbar-row">
          <div className="fh-appbar-logo"><Icon name="Sprout" size={18} /></div>
          <div className="fh-appbar-user">
            <div className="fh-appbar-name">{user.nama}</div>
            <div className="fh-appbar-id">ID {user.id}</div>
          </div>
          <div className="fh-appbar-actions">
            {/* Tombol "i" — panduan menu aktif */}
            {resolvedTab && <InfoButton menuKey={resolvedTab} />}
            {/* Tombol WA — laporan kesalahan input */}
            <WAButton />
            {/* Tombol Emergency — shutdown/restart GH karena kondisi tidak baik.
                Sengaja dibatasi hanya untuk operator "Sugma" (belum untuk semua operator). */}
            {user?.nama?.trim().toLowerCase() === "sugma" && <EmergencyGHButton />}
            <button type="button" className="fh-appbar-btn" onClick={logout} aria-label="Logout" title="Logout">
              <Icon name="LogOut" size={18} />
            </button>
          </div>
        </div>
        {!isOnline && (
          <div className="fh-appbar-offline">
            <Icon name="CloudOff" size={16} /> Offline. Isian tersimpan di HP dan terkirim saat online.
          </div>
        )}
      </header>

      {/* Halaman aktif */}
      <div style={{ flex: 1, paddingTop: topOffset, paddingBottom: 64, width: "100%", "--fh-top": `${topOffset}px` }}>
        {/* Pengingat Vigor — popup yang muncul setelah menu Vigor dibuka (bukan banner di atas menu lain) */}
        {resolvedTab === "vigor" && accessibleStandalone.some(t => t.key === "vigor") && (
          <VigorReminder popup />
        )}
        {ActivePage
          ? <ActivePage />
          : <PlaceholderPage label={resolvedHPT?.label ?? resolvedStandalone?.label ?? ""} />
        }
      </div>

      {/* ── Bottom bar — putih, maks 5 tab (PRD 6.0) ── */}
      <nav className="fh-tabbar" aria-label="Menu">
        {visible.map(e => {
          const active = isEntryActive(e);
          return (
            <button key={e.key} type="button" className={`fh-tabbar-btn${active ? " is-active" : ""}`}
              aria-current={active ? "page" : undefined} onClick={() => openEntry(e)}>
              <Icon name={e.icon} size={20} />
              <span>{e.label}</span>
            </button>
          );
        })}
        {overflow && (
          <button type="button" className={`fh-tabbar-btn${lainnyaActive ? " is-active" : ""}`} onClick={() => setSheet("lainnya")}>
            <Icon name="Ellipsis" size={20} />
            <span>Lainnya</span>
          </button>
        )}
      </nav>

      {/* ── Sheet pilihan menu: grup HPT / Lainnya ── */}
      {sheet && (
        <div className="fh-root fh-overlay is-sheet" onClick={(e) => { if (e.target === e.currentTarget) setSheet(null); }}>
          <div className="fh-sheet" role="dialog" aria-modal="true" aria-label={sheet === "hpt" ? "Menu HPT" : "Menu lainnya"}>
            <div className="fh-sheet-head">
              <h2 className="fh-dialog-title" style={{ flex: 1, margin: 0, alignSelf: "center" }}>{sheet === "hpt" ? "Menu HPT" : "Menu lainnya"}</h2>
              <button type="button" className="fh-icon-btn" onClick={() => setSheet(null)} aria-label="Tutup"><Icon name="X" /></button>
            </div>
            <div className="fh-sheet-body" style={{ gap: 6, paddingBottom: 24 }}>
              {sheetItems.map(item => (
                <button key={item.key} type="button" className={`fh-menu-item${resolvedTab === item.key ? " is-active" : ""}`} onClick={() => switchTab(item.key)}>
                  <Icon name={item.icon} size={20} />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Update Notification Modal */}
      {showUpdateNotif && (
        <div className="fh-root fh-overlay" style={{ zIndex: 300 }}>
          <div className="fh-dialog" role="dialog" aria-modal="true" aria-label="Ada pembaruan aplikasi">
            <h2 className="fh-dialog-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="RefreshCw" size={20} /> Ada pembaruan aplikasi
            </h2>
            <p className="fh-dialog-body" style={{ margin: 0 }}>Ada perubahan sejak terakhir kamu buka. Aplikasi akan dimuat ulang untuk menerapkannya.</p>
            <p className="fh-hint" style={{ margin: 0 }}>Bila setelah dimuat ulang tidak ada perubahan, hubungi tim lewat tombol WhatsApp di kanan atas.</p>
            <div className="fh-dialog-actions">
              <button
                type="button"
                className="fh-btn fh-btn-primary"
                onClick={() => {
                  localStorage.setItem(APP_VERSION_KEY, BUILD_ID);
                  window.location.reload();
                }}
              >
                Muat ulang sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SOP Modal — muncul otomatis pertama kali buka menu */}
      {sopMenuKey && (
        <SOPModal
          menuKey={sopMenuKey}
          onClose={() => setSopMenuKey(null)}
        />
      )}

      {/* PWA Install Banner */}
      <InstallPWA />

      {/* PWA Update Prompt — muncul otomatis saat ada versi baru */}
      <PWAUpdatePrompt />

      {/* Popup GH diblokir — muncul otomatis saat operator pilih GH yang lagi Shutdown/Restart */}
      <GHBlockedModal />

      <style>{`
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: var(--cream-100); width: 100%; overflow-x: hidden; }
      `}</style>
    </div>
  );
}
