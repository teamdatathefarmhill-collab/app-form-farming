import Icon from "./Icon";

// Daftar pilihan satu jawaban (radio card).
//   options — [{ value, label, icon?, meta? }]
//   value   — value yang terpilih
//   columns — 1 = daftar ke bawah; 2/3 = grid kartu (ikon di atas label)
export default function OptionList({ name, options, value, onChange, disabled = false, columns = 1 }) {
  const grid = columns > 1;
  return (
    <div
      className={`fh-options${grid ? " is-grid" : ""}`}
      style={grid ? { gridTemplateColumns: `repeat(${columns}, 1fr)` } : undefined}
      role="radiogroup"
      aria-label={name}
    >
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            className={`fh-option${active ? " is-active" : ""}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.icon && <Icon name={opt.icon} size={24} className="fh-option-icon" />}
            <span className="fh-option-label">{opt.label}</span>
            {opt.meta && <span className="fh-option-meta">{opt.meta}</span>}
            {!grid && <span className="fh-option-radio" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
