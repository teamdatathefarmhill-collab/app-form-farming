import Icon from "./Icon";

// Layar setelah kirim.
//   offline — true bila data tersimpan di antrean, belum terkirim
//   summary — [[label, nilai], ...]
export default function SuccessState({ title, description, offline = false, summary = [] }) {
  return (
    <div className="fh-success">
      <div className={`fh-success-icon${offline ? " is-offline" : ""}`}>
        <Icon name={offline ? "CloudOff" : "Check"} size={28} strokeWidth={2} />
      </div>
      <h2 className="fh-success-title">{title}</h2>
      {description && <p className="fh-success-desc">{description}</p>}
      {summary.length > 0 && (
        <dl className="fh-summary">
          {summary.map(([label, value]) => (
            <div key={label} className="fh-summary-row">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
