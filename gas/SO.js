// ─── CONFIG ───────────────────────────────────────────────────────────────────
const SPREADSHEET_ID = "1Ci5RijEN3eTPxAlpI50P52T3ypNdAE0VsR2ISA7IPrc";
const SHEET_NAME     = "DATA SO";

const COLUMNS = [
  "timestamp",
  "tanggal",
  "operator",
  "greenhouse",
  "periode",
  "hst",
  "baris",
  "varian",
  "populasi",
];

// ─── Proteksi endpoint ────────────────────────────────────────────────────
// Token disimpan di Script Properties (Project Settings > Script Properties),
// BUKAN di kode ini — supaya tidak ikut ke-share/ke-commit ke git.
// Klien kirim token yang sama (VITE_APP_TOKEN) di tiap request.
// Kalau APP_TOKEN belum di-set di Script Properties, cek ini dilewati dulu
// (supaya tidak lockout diri sendiri saat baru deploy kode ini).
function checkAppToken(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('APP_TOKEN');
  if (!expected) return true;
  return token === expected;
}

// Rate limit sederhana — batasi ~60 request/menit per script (semua caller
// digabung). Bukan proteksi kuat, tapi cukup untuk redam spam/bot otomatis.
function checkRateLimit() {
  const cache = CacheService.getScriptCache();
  const key   = 'rl_' + Math.floor(Date.now() / 60000);
  const count = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(count), 90);
  return count <= 60;
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(30000);

  try {
    const raw     = e.postData?.contents || "{}";
    const payload = JSON.parse(raw);

    if (!checkRateLimit()) return jsonResponse({ success: false, error: "Terlalu banyak request, coba lagi sebentar." });
    if (!checkAppToken(payload.token)) return jsonResponse({ success: false, error: "Unauthorized" });

    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      return jsonResponse({ success: false, error: `Sheet "${SHEET_NAME}" tidak ditemukan` });
    }

    ensureHeader(sheet);

    // ── Batch submit (banyak baris sekaligus) ──
    if (payload.action === "submitSOBatch") {
      const rows = payload.rows || [];
      if (rows.length === 0) {
        return jsonResponse({ success: false, error: "Tidak ada data yang dikirim" });
      }

      const allRows = rows.map(rowData => buildRow(rowData));
      sheet.getRange(sheet.getLastRow() + 1, 1, allRows.length, COLUMNS.length).setValues(allRows);

      return jsonResponse({ success: true, count: allRows.length });
    }

    // ── Single submit (fallback, tetap didukung) ──
    if (payload.action === "submitSO") {
      sheet.appendRow(buildRow(payload));
      return jsonResponse({ success: true });
    }

    return jsonResponse({ success: false, error: "Invalid action" });

  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  } finally {
    lock.releaseLock();
  }
}

// ─── GET HANDLER ──────────────────────────────────────────────────────────────
function doGet(e) {
  const sheet_param = (e.parameter && e.parameter.sheet) || '';

  if (!checkRateLimit()) return jsonResponse({ error: 'Terlalu banyak request, coba lagi sebentar.' });
  if (!checkAppToken((e.parameter || {}).token)) return jsonResponse({ error: 'Unauthorized' });

  if (sheet_param === 'so') {
    try {
      const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
      const sheet = ss.getSheetByName(SHEET_NAME);
      if (!sheet) return jsonResponse({ error: 'Sheet tidak ditemukan' });

      const rows    = sheet.getDataRange().getValues();
      const headers = rows[0].map(h => String(h).trim().toLowerCase());

      const data = rows.slice(1)
        .filter(r => r.some(c => c !== ''))
        .map(r => {
          const obj = {};
          headers.forEach((h, i) => { obj[h] = r[i]; });
          return {
            tanggal  : fmtDateSO(obj['tanggal']),
            gh       : String(obj['greenhouse'] || '').trim(),
            periode  : formatPeriode(obj['periode']),
            hst      : +obj['hst']      || 0,
            baris    : String(obj['baris']   || '').trim(),
            varian   : String(obj['varian']  || '').trim(),
            populasi : +obj['populasi'] || 0,
          };
        })
        .filter(r => r.gh && r.tanggal);

      return jsonResponse({ data, count: data.length, lastUpdated: new Date().toISOString() });

    } catch(err) {
      return jsonResponse({ error: err.message });
    }
  }

  return jsonResponse({ status: 'SO GAS aktif', timestamp: new Date().toISOString() });
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

// Bangun satu array row dari sebuah objek payload
function buildRow(data) {
  return COLUMNS.map(col => {
    if (col === "timestamp") {
      const tsDate = data.client_timestamp ? new Date(data.client_timestamp) : new Date();
      return Utilities.formatDate(tsDate, "Asia/Jakarta", "dd/MM/yyyy HH:mm:ss");
    }
    const val = data[col];
    return val !== undefined && val !== null ? val : "";
  });
}

function formatPeriode(val) {
  if (!val && val !== 0) return '';
  // Cek Date pakai Object.prototype.toString, lebih reliable di GAS
  if (Object.prototype.toString.call(val) === '[object Date]') {
    const yy = String(val.getFullYear()).slice(-2);
    const m  = val.getMonth() + 1;
    return `${yy}.${m}`;
  }
  if (typeof val === 'number') return val.toFixed(1);
  const s = String(val).trim();
  if (/^\d+\.\d+$/.test(s)) return s;
  const n = parseFloat(s);
  return !isNaN(n) ? n.toFixed(1) : s;
}

function ensureHeader(sheet) {
  const firstRow = sheet.getRange(1, 1, 1, COLUMNS.length).getValues()[0];
  const isEmpty  = firstRow.every(cell => cell === "" || cell === null);

  if (isEmpty) {
    const headers = [
      "Timestamp", "Tanggal", "Operator", "Greenhouse",
      "Periode", "HST", "Baris", "Varian", "Populasi",
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight("bold")
               .setBackground("#1b5e20")
               .setFontColor("#ffffff")
               .setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
  }
}

function fmtDateSO(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(val).trim();
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function testFormatPeriode() {
  const sheet = SpreadsheetApp.openById("1Ci5RijEN3eTPxAlpI50P52T3ypNdAE0VsR2ISA7IPrc").getSheetByName("DATA SO");
  const val = sheet.getRange(2, 5).getValue(); // kolom E = periode
  console.log("raw val:", val, typeof val, val instanceof Date);
  console.log("formatted:", formatPeriode(val));
}
