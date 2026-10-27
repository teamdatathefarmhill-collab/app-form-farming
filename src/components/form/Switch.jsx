// Saklar on/off dengan label di kiri (satu-satunya bentuk pill yang dipakai).
export default function Switch({ checked, onChange, label, hint }) {
  return (
    <label className="fh-switch-row">
      <span className="fh-switch-text">
        <span className="fh-label">{label}</span>
        {hint && <span className="fh-hint">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`fh-switch${checked ? " is-on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </label>
  );
}
