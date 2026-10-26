import { useState } from "react";
import Icon from "./Icon";

// Lokasi utama tampil lebih dulu dengan urutan tetap; lokasi lain menyusul urut abjad.
const AREA_ORDER = ["Bergas", "Colomadu", "Sawahan", "Tohudan"];

// Lokasi = kata pertama nama GH ("TOHUDAN 2" → "Tohudan", "Semai Sawahan 1" → "Semai")
function areaOf(gh) {
  const first = gh.trim().split(/\s+/)[0] || gh;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

// Lokasi yang terakhir dibuka diingat (bersama untuk semua menu) — operator biasanya
// bekerja di lokasi yang sama, jadi besoknya langsung terbuka.
const LS_OPEN_KEY = "farmhill_ghpicker_open";
function loadOpen() {
  try { return new Set(JSON.parse(localStorage.getItem(LS_OPEN_KEY) || "[]")); }
  catch { return new Set(); }
}
function saveOpen(set) {
  try { localStorage.setItem(LS_OPEN_KEY, JSON.stringify([...set])); } catch { /* ignore */ }
}

// HST tertinggi dulu (paling mendesak); GH tanpa nilai di akhir; seri → per nomor GH
function compareItem(a, b) {
  const va = a.sortValue ?? -Infinity, vb = b.sortValue ?? -Infinity;
  if (va !== vb) return vb - va;
  return (a.label || a.gh).localeCompare(b.label || b.gh, "id", { numeric: true });
}

function compareArea(a, b) {
  const ia = AREA_ORDER.indexOf(a), ib = AREA_ORDER.indexOf(b);
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  return a.localeCompare(b);
}

// Daftar GH dikelompokkan per lokasi yang bisa dibuka/tutup, dengan pencarian.
// Saat mencari, atau bila hanya ada satu lokasi, semua grup terbuka.
//   items    — [{ gh, label?, meta?, badges?: [{ label, tone }], done?, urgent? }]
//              `label` (opsional) nama tampilan bila beda dari key `gh` (mis. semai)
//              `done` (opsional) dipakai untuk hitungan "n/m sudah diisi" di judul lokasi
//              `urgent` (opsional) dihitung jadi badge "n perlu aksi" di judul lokasi
//              `sortValue` (opsional, angka) — bila ada, GH dalam lokasi diurutkan dari
//              nilai tertinggi (mis. HST); tanpa itu diurutkan per nomor GH
//   selected — gh terpilih
// Pencarian muncul otomatis bila GH lebih dari 6.
export default function GHPicker({ items, selected, onSelect, loading = false, emptyText = "Tidak ada GH." }) {
  const [query, setQuery] = useState("");
  const [openAreas, setOpenAreas] = useState(loadOpen);

  const toggleArea = (area) => {
    setOpenAreas(prev => {
      const next = new Set(prev);
      if (next.has(area)) next.delete(area); else next.add(area);
      saveOpen(next);
      return next;
    });
  };
  const q = query.trim().toLowerCase();
  const nameOf = it => it.label || it.gh;
  const filtered = q ? items.filter(it => nameOf(it).toLowerCase().includes(q)) : items;

  if (loading) return <p className="fh-empty">Memuat daftar GH…</p>;
  if (items.length === 0) return <p className="fh-empty">{emptyText}</p>;

  const groups = {};
  filtered.forEach(it => { (groups[areaOf(nameOf(it))] ??= []).push(it); });
  const areas = Object.keys(groups).sort(compareArea);
  const tracksDone = items.some(it => it.done !== undefined);
  const forceOpen = q !== "" || areas.length <= 1;

  return (
    <div className="fh-section" style={{ gap: 8 }}>
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

      {areas.map(area => {
        const list = groups[area].sort(compareItem);
        const doneCount = list.filter(it => it.done).length;
        const urgentCount = list.filter(it => it.urgent).length;
        const isOpen = forceOpen || openAreas.has(area);
        return (
          <section key={area} className="fh-section" aria-label={`GH ${area}`}>
            <button
              type="button"
              className="fh-group-head"
              onClick={() => toggleArea(area)}
              aria-expanded={isOpen}
              disabled={forceOpen}
            >
              <span className="fh-group-title">{area}</span>
              {urgentCount > 0 && <span className="fh-badge fh-badge-due">{urgentCount} perlu aksi</span>}
              <span className="fh-meta">
                {tracksDone ? `${doneCount}/${list.length} sudah diisi` : `${list.length} GH`}
              </span>
              {!forceOpen && <Icon name={isOpen ? "ChevronUp" : "ChevronDown"} />}
            </button>
            {isOpen && (
              <div className="fh-gh-list">
                {list.map(it => (
                  <button
                    key={it.gh}
                    type="button"
                    className={`fh-gh-item${selected === it.gh ? " is-active" : ""}`}
                    onClick={() => onSelect(it.gh)}
                  >
                    <span className="fh-gh-main">
                      <span className="fh-gh-name">{nameOf(it)}</span>
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
              </div>
            )}
          </section>
        );
      })}

      {filtered.length === 0 && <p className="fh-empty">Tidak ada GH dengan nama "{query}".</p>}
    </div>
  );
}
