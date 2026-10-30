// Isian "Operator" di langkah rekap. Akun biasa: input teks (terisi dari akun login).
// Akun role KOOR_GH atau bernama "Koor GH": dropdown daftar Koor GH + opsi "Tulis sendiri…" untuk nama lain.
import { useState, useEffect } from "react";

export const KOOR_GH_LIST = [
  "Ahmad Qomaruzzaman",
  "Alihpan H",
  "Eko Nur Widiyanto",
  "Erwin Dwi Saputra",
  "M Ziyad Fahmi",
  "Muhamad Lutfi Ghozali",
  "Roghib Al Ashfahany",
  "Sahman Simbolon",
  "Wahyu Sulistyo",
];
const TULIS_SENDIRI = "__tulis_sendiri__";

export default function OperatorField({ user, value, onChange, minLength = 1 }) {
  const isKoor = user?.role?.trim().toUpperCase() === "KOOR_GH" || /^koor\s*gh$/i.test(user?.nama?.trim() || "");
  const [manual, setManual] = useState(false);
  const invalid = value.trim().length < minLength;

  // Nama akun Koor GH sendiri bukan salah satu pilihan → kosongkan supaya wajib pilih
  useEffect(() => {
    if (isKoor && !manual && value && !KOOR_GH_LIST.includes(value)) onChange("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isKoor]);

  if (!isKoor) {
    return (
      <label className="fh-section">
        <span className="fh-label">Operator</span>
        <input className={`fh-input${invalid ? " is-error" : ""}`} value={value} onChange={e => onChange(e.target.value)} placeholder="Nama operator" />
        <p className="fh-hint">Terisi dari akun login. Ubah bila yang mengisi orang lain.</p>
      </label>
    );
  }

  const selectValue = manual ? TULIS_SENDIRI : (KOOR_GH_LIST.includes(value) ? value : "");
  return (
    <div className="fh-section">
      <label className="fh-section">
        <span className="fh-label">Operator</span>
        <select
          className={`fh-select${selectValue ? "" : " is-empty"}${!manual && invalid ? " is-error" : ""}`}
          value={selectValue}
          onChange={e => {
            if (e.target.value === TULIS_SENDIRI) { setManual(true); onChange(""); }
            else { setManual(false); onChange(e.target.value); }
          }}
        >
          <option value="">Pilih Koor GH</option>
          {KOOR_GH_LIST.map(n => <option key={n} value={n}>{n}</option>)}
          <option value={TULIS_SENDIRI}>Tulis sendiri…</option>
        </select>
      </label>
      {manual && (
        <input className={`fh-input${invalid ? " is-error" : ""}`} value={value} onChange={e => onChange(e.target.value)} placeholder="Nama operator" autoFocus />
      )}
    </div>
  );
}
