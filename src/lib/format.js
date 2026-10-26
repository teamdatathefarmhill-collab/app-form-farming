// Format tampilan sesuai PRD: "26 Okt 2026", "26 Okt 2026 · 06.47 WIB", "1.200".
const BULAN = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

export function formatTanggal(d = new Date()) {
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatWaktu(d = new Date()) {
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${formatTanggal(d)} · ${hh}.${mi} WIB`;
}

export function formatAngka(n) {
  return (n || 0).toLocaleString("id-ID");
}

// "+12" / "-3" / "0"
export function formatSelisih(n) {
  return `${n > 0 ? "+" : ""}${formatAngka(n)}`;
}
