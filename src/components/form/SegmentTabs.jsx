import { useEffect, useRef } from "react";

// Tab horizontal (produksi/semai, varian, aspek, kategori).
//   tabs  — [{ key, label, count? }]   count opsional tampil sebagai angka kecil
//   value — key tab aktif
// Bila tab lebih lebar dari layar, tab aktif digulir otomatis ke tampilan.
export default function SegmentTabs({ tabs, value, onChange, label }) {
  const activeRef = useRef(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [value]);

  return (
    <div className="fh-tabs" role="tablist" aria-label={label}>
      {tabs.map(t => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            ref={active ? activeRef : undefined}
            type="button"
            role="tab"
            aria-selected={active}
            className={`fh-tab${active ? " is-active" : ""}`}
            onClick={() => onChange(t.key)}
          >
            {t.label}
            {t.count !== undefined && <span className="fh-tab-count">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
