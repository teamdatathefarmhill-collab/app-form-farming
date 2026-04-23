// WAButton.jsx
// Tombol WhatsApp untuk laporan kesalahan input
// Taruh di: src/components/WAButton.jsx

const WA_NUMBER = import.meta.env.VITE_WA_ADMIN;

export default function WAButton({ operatorName = "", gh = "", tanggal = "" }) {
  const handleClick = () => {
    const nama    = operatorName || "(nama operator)";
    const ghText  = gh           || "(nama GH)";
    const tglText = tanggal      || new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });

    const pesan = `Halo Team Data, saya ${nama} ingin melaporkan kesalahan input pada (kendala).\nGreenhouse: ${ghText}\nTanggal: ${tglText}\nMohon dibantu revisikan. Terima kasih.`;

    const url = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(pesan)}`;
    window.open(url, "_blank");
  };

  return (
    <button
      onClick={handleClick}
      title="Laporkan kesalahan input via WhatsApp"
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        border: "1px solid rgba(37,211,102,0.35)",
        background: "rgba(37,211,102,0.12)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        padding: 0,
        flexShrink: 0,
      }}
    >
      {/* WA icon SVG */}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.978-1.42A9.953 9.953 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"
          fill="rgba(37,211,102,0.85)"
        />
        <path
          d="M8.5 8.5c.2-.5.7-.8 1.1-.8.3 0 .5.1.7.3l1.2 1.5c.2.3.2.7 0 1l-.5.7c.4.7 1 1.3 1.7 1.7l.7-.5c.3-.2.7-.2 1 0l1.5 1.2c.2.2.3.4.3.7 0 .4-.3.9-.8 1.1-.5.2-2.3.6-4.2-1.3-1.9-1.9-1.5-3.7-1.3-4.2z"
          fill="white"
        />
      </svg>
    </button>
  );
}
