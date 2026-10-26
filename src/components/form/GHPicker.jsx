import { useState } from "react";
import Icon from "./Icon";

// Daftar GH dengan pencarian.
//   items    — [{ gh, meta?, badges?: [{ label, tone }] }]
//   selected — gh terpilih
// Pencarian muncul otomatis bila GH lebih dari 6.
export default function GHPicker({ items, selected, onSelect, loading = false, emptyText = "Tidak ada GH." }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = q ? items.filter(it => it.gh.toLowerCase().includes(q)) : items;

  if (loading) return <p className="fh-empty">Memuat daftar GH…</p>;
  if (items.length === 0) return <p className="fh-empty">{emptyText}</p>;

  return (
    <div className="fh-section">
      {items.length > 6 && (
        <div className="fh-search">
          <Icon name="Search" size={18} />
          <input
            className="fh-input"
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Cari GH"
            aria-label="Cari GH"
          />
        </div>
      )}
      <div className="fh-gh-list">
        {filtered.map(it => (
          <button
            key={it.gh}
            type="button"
            className={`fh-gh-item${selected === it.gh ? " is-active" : ""}`}
            onClick={() => onSelect(it.gh)}
          >
            <span className="fh-gh-main">
              <span className="fh-gh-name">{it.gh}</span>
              {it.meta && <span className="fh-gh-meta"><br />{it.meta}</span>}
            </span>
            {it.badges?.length > 0 && (
              <span className="fh-gh-badges">
                {it.badges.map(b => (
                  <span key={b.label} className={`fh-badge fh-badge-${b.tone || "success"}`}>{b.label}</span>
                ))}
              </span>
            )}
          </button>
        ))}
        {filtered.length === 0 && <p className="fh-empty">Tidak ada GH dengan nama "{query}".</p>}
      </div>
    </div>
  );
}
