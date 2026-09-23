import { Component } from "react";

// Tanpa error boundary, error render apapun (mis. .filter/.map di undefined)
// bikin React unmount SELURUH tree → layar putih/abu-abu kosong tanpa jejak.
// Boundary ini nangkep error itu, nampilin pesannya (biar bisa di-screenshot),
// dan kasih tombol reload — draft form (localStorage) tetap aman jadi data
// yang sudah diisi tidak hilang.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary] Uncaught render error:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", padding: 24,
        fontFamily: "'DM Sans','Segoe UI',sans-serif", background: "#fff3e0", textAlign: "center",
      }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 17, fontWeight: 800, color: "#e65100", marginBottom: 8 }}>
          Ada error tak terduga
        </div>
        <div style={{ fontSize: 12, color: "#8d6e63", marginBottom: 16, maxWidth: 340 }}>
          Screenshot pesan di bawah ini dan kirim ke admin — data isian di form biasanya masih aman.
        </div>
        <div style={{
          fontSize: 11, color: "#5d4037", background: "#fff", border: "1px solid #ffcc80",
          borderRadius: 8, padding: "10px 14px", marginBottom: 20, maxWidth: 340,
          textAlign: "left", fontFamily: "monospace", overflowWrap: "break-word",
        }}>
          {this.state.error?.message || String(this.state.error)}
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "12px 24px", background: "#e65100", border: "none", borderRadius: 10,
            color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}
        >
          🔄 Reload Halaman
        </button>
      </div>
    );
  }
}
