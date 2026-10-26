import Icon from "./Icon";

// Field angka bulat dengan tombol − / + 44px. Nilai disimpan sebagai string
// ("" = kosong) supaya cocok dengan state form yang sudah ada.
//   onChange — (string) => void; validasi tetap di pemanggil
export default function Stepper({ value, onChange, label, min = 0 }) {
  const n = parseInt(value) || 0;
  const step = (d) => {
    const next = Math.max(min, n + d);
    onChange(String(next));
  };
  return (
    <div className="fh-stepper">
      <button type="button" className="fh-stepper-btn" onClick={() => step(-1)} disabled={n <= min} aria-label={`Kurangi ${label}`}>
        <Icon name="Minus" size={18} />
      </button>
      <input
        className="fh-input is-number"
        type="text"
        inputMode="numeric"
        value={value}
        placeholder="0"
        aria-label={label}
        onChange={e => onChange(e.target.value)}
      />
      <button type="button" className="fh-stepper-btn" onClick={() => step(1)} aria-label={`Tambah ${label}`}>
        <Icon name="Plus" size={18} />
      </button>
    </div>
  );
}
