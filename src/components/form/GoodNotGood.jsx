// Dua tombol 44px: Good / Not good. Nilai "good" | "notgood" | null.
export default function GoodNotGood({ value, onChange, label }) {
  return (
    <div className="fh-gng" role="radiogroup" aria-label={label}>
      <button
        type="button"
        role="radio"
        aria-checked={value === "good"}
        className={`fh-gng-btn${value === "good" ? " is-good" : ""}`}
        onClick={() => onChange("good")}
      >
        Good
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === "notgood"}
        className={`fh-gng-btn${value === "notgood" ? " is-bad" : ""}`}
        onClick={() => onChange("notgood")}
      >
        Not good
      </button>
    </div>
  );
}
