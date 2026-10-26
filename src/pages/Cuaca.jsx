import { useState, useEffect, useCallback } from "react";
import { FormShell, FieldAlert, SuccessState, OptionList, Icon } from "../components/form";

const WEBHOOK = "https://script.google.com/macros/s/AKfycbzBndG0bEIxKN2RJ7zvI571vRk9EOq5iuN-OzObBU6LHZDvG2GKb6ptXRqHdMj1Z7K2Dw/exec";

const JAM_OPTIONS = [
  "07.00","08.00","09.00","10.00","11.00",
  "12.00","13.00","14.00","15.00","16.00",
];

// label & skor dikirim apa adanya ke sheet — jangan diubah
const CUACA_OPTIONS = [
  { label: "Cerah",         icon: "Sun",       skor: 100 },
  { label: "Cerah Berawan", icon: "CloudSun",  skor: 80  },
  { label: "Berawan",       icon: "Cloud",     skor: 50  },
  { label: "Mendung",       icon: "Cloudy",    skor: 25  },
  { label: "Hujan",         icon: "CloudRain", skor: 0   },
];

const BULAN = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

function getTodayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const dd   = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// "26 Okt 2026"
function formatTanggal(d) {
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

// "26 Okt 2026 · 06.47 WIB"
function formatWaktu(d) {
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${formatTanggal(d)} · ${hh}.${mi} WIB`;
}

function jamToString(jamStr) {
  const h = jamStr.split(".")[0].padStart(2, "0");
  return `${h}:00`;
}

function timeToJamOption(timeStr) {
  if (!timeStr) return null;
  const h = String(timeStr).split(":")[0].padStart(2, "0");
  return `${h}.00`;
}

// Ambil jam yang sudah diisi hari ini lewat JSONP (GAS tidak kirim header CORS)
function fetchFilledJams(tanggal) {
  return new Promise((resolve, reject) => {
    // suffix acak: StrictMode memanggil efek dua kali dalam milidetik yang sama
    const callbackName = `cb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const script = document.createElement("script");
    const cleanup = () => { delete window[callbackName]; script.remove(); };

    window[callbackName] = (data) => {
      cleanup();
      if (!Array.isArray(data)) return reject(new Error("format"));
      const filled = new Set();
      data.forEach(row => {
        const jamOpt = timeToJamOption(row.jam || "");
        if (jamOpt) filled.add(jamOpt);
      });
      resolve(filled);
    };
    script.onerror = () => { cleanup(); reject(new Error("script load error")); };
    script.src = `${WEBHOOK}?tanggal=${tanggal}&callback=${callbackName}`;
    document.head.appendChild(script);

    setTimeout(() => {
      if (window[callbackName]) { cleanup(); reject(new Error("timeout")); }
    }, 10000);
  });
}

export const CHANGELOG = [
  "Form pengukuran cuaca harian",
  "Tanggal otomatis hari ini",
  "Data langsung terkirim ke Google Sheets Log Cuaca",
  "Tampilan baru Farmhill: grid jam 5 × 2, kondisi cuaca sebagai daftar",
  "Jam yang sudah diisi tidak bisa dipilih lagi",
];

export default function Cuaca() {
  const [jam,           setJam]           = useState("");
  const [cuacaLabel,    setCuacaLabel]    = useState(null);
  const [submitting,    setSubmitting]    = useState(false);
  const [step,          setStep]          = useState(1);
  const [submitError,   setSubmitError]   = useState(null);
  const [filledJams,    setFilledJams]    = useState(new Set());
  const [fetchStatus,   setFetchStatus]   = useState("loading"); // loading | ok | error
  const [sentAt,        setSentAt]        = useState(null);

  const today        = new Date();
  const todayISO     = getTodayISO();
  const selectedCuaca = CUACA_OPTIONS.find(c => c.label === cuacaLabel) ?? null;

  const loadFilled = useCallback(() => {
    setFetchStatus("loading");
    fetchFilledJams(todayISO)
      .then(filled => {
        setFilledJams(filled);
        setFetchStatus("ok");
        // jam yang dipilih ternyata sudah diisi orang lain → batalkan pilihan
        setJam(prev => (filled.has(prev) ? "" : prev));
      })
      .catch(() => setFetchStatus("error"));
  }, [todayISO]);

  useEffect(() => { loadFilled(); }, [loadFilled]);

  const loading     = fetchStatus === "loading";
  const totalFilled = filledJams.size;
  const canSubmit   = jam && selectedCuaca && !filledJams.has(jam) && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await fetch(WEBHOOK, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tanggal: todayISO,
          jam: jamToString(jam),
          cuaca: selectedCuaca.label,
          skoring: selectedCuaca.skor,
        }),
      });
      setFilledJams(prev => new Set([...prev, jam]));
      setSentAt(new Date());
      setStep(2);
    } catch {
      setSubmitError("Data belum terkirim karena koneksi terputus. Cek sinyal lalu tekan Kirim lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setJam("");
    setCuacaLabel(null);
    setSubmitError(null);
    setSentAt(null);
    setStep(1);
  }

  const subtitle = loading
    ? `${formatTanggal(today)} · memuat jam terisi`
    : `${formatTanggal(today)} · ${totalFilled} dari ${JAM_OPTIONS.length} jam terisi`;

  if (step === 2) {
    return (
      <FormShell
        title="Cuaca harian"
        subtitle={subtitle}
        footer={
          <button type="button" className="fh-btn fh-btn-secondary" onClick={resetForm}>
            Isi jam lain
          </button>
        }
      >
        <SuccessState
          title={`Cuaca jam ${jam} terkirim`}
          description="Data masuk ke sheet Log Cuaca."
          summary={[
            ["Tanggal", formatTanggal(today)],
            ["Jam", `${jam} WIB`],
            ["Kondisi", selectedCuaca?.label],
            ["Dikirim", sentAt ? formatWaktu(sentAt) : "-"],
          ]}
        />
      </FormShell>
    );
  }

  let footerLabel = "Pilih jam dan kondisi cuaca";
  if (submitting)      footerLabel = "Mengirim…";
  else if (jam && selectedCuaca) footerLabel = `Kirim jam ${jam}`;
  else if (jam)        footerLabel = "Pilih kondisi cuaca";
  else if (selectedCuaca) footerLabel = "Pilih jam pengukuran";

  return (
    <FormShell
      title="Cuaca harian"
      subtitle={subtitle}
      footer={
        <button type="button" className="fh-btn fh-btn-primary" disabled={!canSubmit} onClick={handleSubmit}>
          {footerLabel}
        </button>
      }
    >
      {fetchStatus === "ok" && totalFilled === JAM_OPTIONS.length && (
        <FieldAlert tone="success">
          Semua jam hari ini sudah diisi. Pengukuran berikutnya besok jam 07.00.
        </FieldAlert>
      )}

      {fetchStatus === "error" && (
        <FieldAlert tone="warning" action={{ label: "Coba lagi", onClick: loadFilled }}>
          Jam yang sudah diisi tidak bisa dicek karena koneksi. Pastikan jam yang kamu pilih belum diisi rekan lain.
        </FieldAlert>
      )}

      <section className="fh-section">
        <div className="fh-section-head">
          <span className="fh-label">Jam pengukuran</span>
          {!loading && <span className="fh-meta">{totalFilled}/{JAM_OPTIONS.length} terisi</span>}
        </div>
        <div className="fh-slots">
          {JAM_OPTIONS.map(j => {
            const isFilled = filledJams.has(j);
            const active   = jam === j;
            return (
              <button
                key={j}
                type="button"
                className={`fh-slot${active ? " is-active" : ""}${isFilled ? " is-filled" : ""}`}
                disabled={isFilled || loading}
                aria-pressed={active}
                aria-label={isFilled ? `Jam ${j}, sudah diisi` : `Jam ${j}`}
                onClick={() => setJam(j)}
              >
                {j}
                {isFilled && <small><Icon name="Check" size={12} strokeWidth={2.5} />terisi</small>}
              </button>
            );
          })}
        </div>
        <div className="fh-legend">
          <span><i className="is-filled" />Sudah diisi</span>
          <span><i />Belum diisi</span>
        </div>
      </section>

      <section className="fh-section">
        <span className="fh-label">Kondisi cuaca</span>
        <OptionList
          name="Kondisi cuaca"
          value={cuacaLabel}
          onChange={setCuacaLabel}
          columns={3}
          options={CUACA_OPTIONS.map(c => ({
            value: c.label,
            label: c.label.charAt(0) + c.label.slice(1).toLowerCase(),
            icon: c.icon,
          }))}
        />
      </section>

      {submitError && <FieldAlert tone="danger">{submitError}</FieldAlert>}
    </FormShell>
  );
}
