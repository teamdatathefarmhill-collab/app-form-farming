// Tabel input per baris (Gramasi, SO).
//   columns — [{ key, label, width?, input?: true, inputMode?, num?: true, placeholder? }]
//             kolom `input` dirender sebagai field angka; lainnya pakai row[key]
//   rows    — array baris data
//   rowKey  — (row, i) => key unik
//   renderCell   — (row, col, i) => isi sel non-input (opsional, default row[col.key])
//   onChange     — (i, key, value) => void untuk kolom input
//   cellError    — (i, key) => boolean, sel ditandai danger
//   rowDetail    — (row, i) => node opsional di bawah baris (mis. pesan peringatan)
//   isRowDone    — (row, i) => boolean, baris lengkap diberi latar hijau tipis
//   displayValue — (value) => string untuk tampilan input (mis. titik → koma)
export default function EntryTable({ columns, rows, rowKey, renderCell, onChange, cellError, rowDetail, isRowDone, displayValue }) {
  return (
    <div className="fh-card fh-entry-table">
      <table className="fh-table">
        <colgroup>
          {columns.map(c => <col key={c.key} style={c.width ? { width: c.width } : undefined} />)}
        </colgroup>
        <thead>
          <tr>{columns.map(c => <th key={c.key} className={c.num || c.input ? "is-num" : ""}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const detail = rowDetail?.(row, i);
            const done = isRowDone?.(row, i);
            return [
              <tr key={rowKey(row, i)} className={done ? "is-done" : ""}>
                {columns.map(c => {
                  if (!c.input) {
                    return (
                      <td key={c.key} className={c.num ? "is-num" : ""}>
                        {renderCell ? renderCell(row, c, i) : row[c.key]}
                      </td>
                    );
                  }
                  const err = cellError?.(i, c.key);
                  return (
                    <td key={c.key} className="fh-entry-cell">
                      <input
                        className={`fh-input is-number${err ? " is-error" : ""}`}
                        type="text"
                        inputMode={c.inputMode || "decimal"}
                        value={displayValue ? displayValue(row[c.key]) : row[c.key]}
                        placeholder={c.placeholder ?? ""}
                        aria-label={`${c.label} baris ${i + 1}`}
                        onChange={e => onChange(i, c.key, e.target.value)}
                      />
                    </td>
                  );
                })}
              </tr>,
              detail && (
                <tr key={`${rowKey(row, i)}-detail`} className="is-detail">
                  <td colSpan={columns.length}>{detail}</td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
