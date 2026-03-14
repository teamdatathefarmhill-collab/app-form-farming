import { useState, useEffect } from "react";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Ganti dengan URL Google Sheets yang sudah di-publish as CSV
// File > Share > Publish to web > Sheet1 > CSV > Publish
const SHEET_CSV_URL = import.meta.env.VITE_SHEET_URL;

// Nomor WA admin untuk "Lupa Password" (format internasional tanpa +)
const WA_ADMIN_NUMBER = "62895410418937";
const WA_MESSAGE = encodeURIComponent(
  "Halo Admin Farmhill, saya lupa password akun saya. Mohon bantuan ya 🙏"
);
const WA_URL = `https://wa.me/${WA_ADMIN_NUMBER}?text=${WA_MESSAGE}`;

// ─── PARSE CSV ───────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const vals = line.split(",").map((v) => v.trim());
    const obj = {};
    headers.forEach((h, i) => (obj[h] = vals[i] ?? ""));
    return obj;
  });
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const styles = {
  wrapper: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(150deg, #1a3a2a 0%, #2d5a3d 60%, #1e4a2e 100%)",
    padding: "1.5rem",
    fontFamily: "'Segoe UI', system-ui, sans-serif",
  },
  card: {
    background: "#fff",
    borderRadius: "20px",
    padding: "2.5rem 2rem",
    width: "100%",
    maxWidth: "380px",
    boxShadow: "0 24px 64px rgba(0,0,0,0.28)",
  },
  logoArea: { textAlign: "center", marginBottom: "2rem" },
  logoIcon: {
    width: 56, height: 56,
    background: "linear-gradient(135deg, #2d7a4a, #4aaa6e)",
    borderRadius: 14,
    display: "flex", alignItems: "center", justifyContent: "center",
    margin: "0 auto 12px",
  },
  logoName: { fontSize: 22, fontWeight: 700, color: "#1a3a2a", letterSpacing: "-0.5px" },
  logoSub: { fontSize: 11, color: "#6a8a6a", marginTop: 2, letterSpacing: "1.5px", textTransform: "uppercase" },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#3a5a3a", marginBottom: 6 },
  input: {
    width: "100%", padding: "11px 14px",
    border: "1.5px solid #d0e0d0", borderRadius: 10,
    fontSize: 14, color: "#1a3a2a", background: "#f8fbf8",
    outline: "none", boxSizing: "border-box",
    transition: "border-color 0.2s",
  },
  inputFocus: { borderColor: "#2d7a4a", background: "#fff", boxShadow: "0 0 0 3px rgba(45,122,74,0.12)" },
  pwWrap: { position: "relative" },
  togglePw: {
    position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
    background: "none", border: "none", cursor: "pointer", color: "#7a9a7a",
    display: "flex", alignItems: "center", padding: 4,
  },
  rememberRow: { display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0.8rem 0 1.4rem" },
  forgotBtn: { fontSize: 13, color: "#2d7a4a", background: "none", border: "none", cursor: "pointer", fontWeight: 500, padding: 0 },
  btnLogin: {
    width: "100%", padding: 13,
    background: "linear-gradient(135deg, #2d7a4a, #3d9a5e)",
    border: "none", borderRadius: 10,
    color: "#fff", fontSize: 15, fontWeight: 600,
    cursor: "pointer", letterSpacing: "0.3px",
    transition: "opacity 0.2s",
  },
  btnDisabled: { opacity: 0.7, cursor: "not-allowed" },
  alert: (type) => ({
    borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: "1rem",
    background: type === "error" ? "#fef2f2" : "#f0fdf4",
    border: `1px solid ${type === "error" ? "#fecaca" : "#86efac"}`,
    color: type === "error" ? "#dc2626" : "#16a34a",
  }),
  divider: { textAlign: "center", margin: "1.2rem 0", color: "#a0b8a0", fontSize: 12 },
  footer: { textAlign: "center", fontSize: 12, color: "#8aaa8a", marginTop: "1rem" },
  accessBadges: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: "1rem", justifyContent: "center" },
  badge: (active) => ({
    fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 600,
    background: active ? "#dcfce7" : "#f3f4f6",
    color: active ? "#15803d" : "#9ca3af",
    border: `1px solid ${active ? "#bbf7d0" : "#e5e7eb"}`,
  }),
  waBtn: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    width: "100%", padding: "11px",
    background: "#f0fdf4", border: "1.5px solid #86efac",
    borderRadius: 10, color: "#15803d", fontSize: 14, fontWeight: 600,
    cursor: "pointer", textDecoration: "none", marginTop: "1rem",
  },
};

// ─── COMPONENT ───────────────────────────────────────────────────────────────
export default function FarmhillLogin({ onLoginSuccess }) {
  const [users, setUsers] = useState([]);
  const [loadingSheet, setLoadingSheet] = useState(true);
  const [sheetError, setSheetError] = useState(false);

  const [nama, setNama] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState(null); // { type, msg }
  const [showForgot, setShowForgot] = useState(false);
  const [focusNama, setFocusNama] = useState(false);
  const [focusPw, setFocusPw] = useState(false);
  const [loggedUser, setLoggedUser] = useState(null);

  // Fetch user list from Google Sheets
  useEffect(() => {
    fetch(SHEET_CSV_URL)
      .then((r) => r.text())
      .then((text) => {
        setUsers(parseCSV(text));
        setLoadingSheet(false);
      })
      .catch(() => {
        // Fallback demo data jika sheet belum dikonfigurasi
        setUsers([
          { id: "001", nama: "Budi",  sanitasi: "YES", hpt: "YES", gramasi: "NO" },
          { id: "002", nama: "Siti",  sanitasi: "YES", hpt: "NO",  gramasi: "YES" },
          { id: "003", nama: "Admin", sanitasi: "YES", hpt: "YES", gramasi: "YES" },
        ]);
        setLoadingSheet(false);
        setSheetError(true);
      });
  }, []);

  const handleLogin = () => {
    setAlert(null);
    if (!nama.trim() || !password.trim()) {
      setAlert({ type: "error", msg: "Nama dan password wajib diisi." });
      return;
    }
    setLoading(true);
    setTimeout(() => {
      const found = users.find(
        (u) =>
          u.nama?.toLowerCase() === nama.trim().toLowerCase() &&
          u.id?.trim() === password.trim()
      );
      if (found) {
        setLoggedUser(found);
        setAlert({ type: "success", msg: `Selamat datang, ${found.nama}!` });
        if (onLoginSuccess) onLoginSuccess(found);
      } else {
        setAlert({ type: "error", msg: "Nama atau password salah. Coba lagi ya." });
      }
      setLoading(false);
    }, 1000);
  };

  const handleKeyDown = (e) => { if (e.key === "Enter") handleLogin(); };

  // ── POST-LOGIN VIEW ──
  if (loggedUser) {
    const modules = ["sanitasi", "hpt", "gramasi"];
    return (
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <div style={styles.logoArea}>
            <div style={styles.logoIcon}>
              <LeafIcon />
            </div>
            <div style={styles.logoName}>The Farmhill</div>
            <div style={styles.logoSub}>Data Management System</div>
          </div>
          <div style={styles.alert("success")}>
            Login berhasil! Selamat datang, <strong>{loggedUser.nama}</strong>.
          </div>
          <p style={{ fontSize: 13, color: "#5a7a5a", marginBottom: 6, textAlign: "center" }}>
            Akses modul Anda:
          </p>
          <div style={styles.accessBadges}>
            {modules.map((m) => (
              <span key={m} style={styles.badge(loggedUser[m]?.toUpperCase() === "YES")}>
                {m.toUpperCase()} {loggedUser[m]?.toUpperCase() === "YES" ? "✓" : "✗"}
              </span>
            ))}
          </div>
          <button
            style={{ ...styles.btnLogin, marginTop: "1.5rem" }}
            onClick={() => { setLoggedUser(null); setNama(""); setPassword(""); setAlert(null); }}
          >
            Logout
          </button>
        </div>
      </div>
    );
  }

  // ── FORGOT PASSWORD VIEW ──
  if (showForgot) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <div style={styles.logoArea}>
            <div style={styles.logoIcon}><LeafIcon /></div>
            <div style={styles.logoName}>Lupa Password?</div>
            <div style={styles.logoSub}>Hubungi Admin via WhatsApp</div>
          </div>
          <p style={{ fontSize: 13, color: "#5a7a5a", textAlign: "center", lineHeight: 1.7, marginBottom: "1.5rem" }}>
            Sampaikan nama dan ID Anda kepada admin untuk mendapatkan bantuan reset password.
          </p>
          <a href={WA_URL} target="_blank" rel="noreferrer" style={styles.waBtn}>
            <WAIcon /> Chat Admin di WhatsApp
          </a>
          <button
            style={{ ...styles.forgotBtn, display: "block", margin: "1rem auto 0", fontSize: 13 }}
            onClick={() => setShowForgot(false)}
          >
            ← Kembali ke Login
          </button>
        </div>
      </div>
    );
  }

  // ── MAIN LOGIN VIEW ──
  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <div style={styles.logoArea}>
          <div style={styles.logoIcon}><LeafIcon /></div>
          <div style={styles.logoName}>The Farmhill</div>
          <div style={styles.logoSub}>Data Management System</div>
        </div>

        {sheetError && (
          <div style={{ ...styles.alert("error"), fontSize: 11, marginBottom: "0.8rem" }}>
            ⚠ Mode demo — Google Sheets belum dikonfigurasi.
          </div>
        )}

        {alert && <div style={styles.alert(alert.type)}>{alert.msg}</div>}

        <div style={{ marginBottom: "1.2rem" }}>
          <label style={styles.label}>Nama Operator</label>
          <input
            style={{ ...styles.input, ...(focusNama ? styles.inputFocus : {}) }}
            type="text"
            placeholder="Masukkan nama Anda"
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            onFocus={() => setFocusNama(true)}
            onBlur={() => setFocusNama(false)}
            onKeyDown={handleKeyDown}
            disabled={loadingSheet}
          />
        </div>

        <div style={{ marginBottom: "0.5rem" }}>
          <label style={styles.label}>Password (ID Operator)</label>
          <div style={styles.pwWrap}>
            <input
              style={{ ...styles.input, paddingRight: 42, ...(focusPw ? styles.inputFocus : {}) }}
              type={showPw ? "text" : "password"}
              placeholder="Contoh: 001"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setFocusPw(true)}
              onBlur={() => setFocusPw(false)}
              onKeyDown={handleKeyDown}
              disabled={loadingSheet}
            />
            <button style={styles.togglePw} onClick={() => setShowPw(!showPw)}>
              {showPw ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </div>

        <div style={styles.rememberRow}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#5a7a5a", cursor: "pointer" }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
              style={{ accentColor: "#2d7a4a", width: 15, height: 15 }} />
            Ingat saya
          </label>
          <button style={styles.forgotBtn} onClick={() => setShowForgot(true)}>
            Lupa password?
          </button>
        </div>

        <button
          style={{ ...styles.btnLogin, ...(loading || loadingSheet ? styles.btnDisabled : {}) }}
          onClick={handleLogin}
          disabled={loading || loadingSheet}
        >
          {loadingSheet ? "Memuat data..." : loading ? "Memeriksa..." : "Masuk"}
        </button>

        <div style={styles.divider}>PT. Kebun Bumi Lestari</div>
        <div style={styles.footer}>Akses terbatas untuk <span style={{ color: "#2d7a4a", fontWeight: 600 }}>tim internal</span> Farmhill</div>
      </div>
    </div>
  );
}

// ─── ICONS ───────────────────────────────────────────────────────────────────
function LeafIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
      <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20c4 0 4-2 8-2s4 2 8 2v-2c-4 0-4-2-8-2-.7 0-1.28.05-1.8.13C14.84 12.3 16.6 9.82 17 8z"/>
    </svg>
  );
}
function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}
function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}
function WAIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/>
    </svg>
  );
}
