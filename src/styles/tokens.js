// ─── Token style bersama — dipetik dari warna/radius/spacing yang sudah
// dipakai berulang di src/pages/*.jsx (inline style). Belum diterapkan ke
// halaman manapun; pakai ini untuk halaman baru atau saat mengedit halaman
// lama, biar warna & radius nggak lagi ditulis ulang manual tiap file. ───

export const color = {
  // brand hijau
  brand900: "#1b5e20",
  brand700: "#2e7d32",
  brand400: "#81c784",
  brand300: "#a5d6a7",
  brandBg:  "#e8f5e9",

  // ungu (dipakai utk baris "Sulaman")
  purple700: "#6A1B9A",
  purple300: "#ce93d8",
  purpleBg:  "#f3e5f5",

  // status
  warning:   "#e65100",
  warningBg: "#fff3e0",
  warningBorder: "#ffb74d",
  danger:    "#e53935",
  dangerDeep:"#c62828",
  dangerBg:  "#ffebee",
  dangerBorder: "#ef9a9a",
  info:      "#1565C0",
  infoDark:  "#0d47a1",
  infoBg:    "#e3f2fd",
  infoBorder:"#90CAF9",

  // netral
  bg:       "#f5f5f5",
  card:     "#ffffff",
  border:   "#e0e0e0",
  text:     "#333333",
  textMuted:"#666666",
  textSoft: "#888888",
  textFaint:"#999999",
  textGhost:"#aaaaaa",
};

export const radius = {
  sm: 8,
  md: 10,
  lg: 12,
  xl: 13,
  pill: 20,
  full: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

export const shadow = {
  header: "0 2px 8px rgba(0,0,0,0.15)",
};

export const font = {
  family: "'DM Sans','Segoe UI',sans-serif",
  mono: "ui-monospace, SFMono-Regular, Consolas, monospace",
};
