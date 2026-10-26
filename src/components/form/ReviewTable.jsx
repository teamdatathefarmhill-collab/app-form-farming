// Rekap langkah 3: info umum (label → nilai) di atas, tabel opsional di bawah.
//   info    — [[label, nilai], ...]
//   columns — [{ key, label, num? }]   (opsional)
//   rows    — [{ key, ...nilai per kolom }]
//   footer  — { ...nilai per kolom } baris total (opsional)
export default function ReviewTable({ title, info = [], columns, rows = [], footer }) {
  return (
    <div className="fh-card">
      {title && (
        <div className="fh-card-head">
          <span className="fh-overline">{title}</span>
        </div>
      )}
      {info.length > 0 && (
        <dl className="fh-summary" style={{ marginTop: 0, border: "none" }}>
          {info.map(([label, value]) => (
            <div key={label} className="fh-summary-row">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {columns && rows.length > 0 && (
        <table className="fh-table">
          <thead>
            <tr>{columns.map(c => <th key={c.key} className={c.num ? "is-num" : ""}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key}>
                {columns.map(c => <td key={c.key} className={c.num ? "is-num" : ""}>{r[c.key]}</td>)}
              </tr>
            ))}
          </tbody>
          {footer && (
            <tfoot>
              <tr>{columns.map(c => <td key={c.key} className={c.num ? "is-num" : ""}>{footer[c.key]}</td>)}</tr>
            </tfoot>
          )}
        </table>
      )}
    </div>
  );
}
