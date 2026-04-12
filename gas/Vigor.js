// ============================================================
// Google Apps Script — Vigor Form
// Spreadsheet: https://docs.google.com/spreadsheets/d/1t0hmb0AlqbfJ4KOK47LKkoRpJ-Jgl3fF6Ru8FZzSI0Y
// Sheet      : DATABASE (gid=1832506765)
//
// CARA DEPLOY:
//   1. Buka script.google.com → New project → paste kode ini
//   2. Klik Deploy → New deployment → Web app
//      Execute as: Me | Who has access: Anyone
//   3. Copy URL → tambahkan ke Vercel Env: VITE_GAS_VIGOR_URL=<url>
//
// ENDPOINT:
//   POST body JSON { action: "submitVigor", ... }  → simpan ke sheet
//   GET  ?action=test                               → cek koneksi
// ============================================================

const SS_ID      = "1t0hmb0AlqbfJ4KOK47LKkoRpJ-Jgl3fF6Ru8FZzSI0Y";
const SHEET_NAME = "DATABASE";

// ── Cache global (hidup selama instance GAS warm) ─────────
let _ss    = null;
let _sheet = null;

function getSheet() {
  if (_sheet) return _sheet;
  if (!_ss) _ss = SpreadsheetApp.openById(SS_ID);
  _sheet = _ss.getSheetByName(SHEET_NAME);
  if (!_sheet) throw new Error("Sheet '" + SHEET_NAME + "' tidak ditemukan");
  return _sheet;
}

// Urutan kolom di sheet — JANGAN DIUBAH urutannya setelah ada data
const HEADERS = [
  "Timestamp",        // A — waktu data masuk (auto)
  "Tanggal",          // B — tanggal input (dd/mm/yyyy)
  "GH",               // C
  "Periode",          // D
  "HST Aktual",       // E
  "HST Checkpoint",   // F
  "Varian",           // G
  "Operator",         // H
  // Aspek Vigor
  "Lebar Daun",       // I
  "Diameter Batang",  // J
  "Warna Daun",       // K
  // Aspek Perakaran
  "Warna Akar",       // L
  "Volume Akar",      // M
];

// ============================================================
// doPost — terima data dari Vigor.jsx
// ============================================================
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    if (body.action !== "submitVigor") {
      return jsonResponse({ success: false, error: "Action tidak dikenal: " + body.action });
    }

    var sheet = getSheet();
    ensureHeaders(sheet);

    // Pakai waktu submit operator jika ada (penting untuk data offline)
    var tsDate = body.client_timestamp ? new Date(body.client_timestamp) : new Date();
    var row = [
      Utilities.formatDate(tsDate, "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss"), // Timestamp
      body.tanggal         || "",
      body.gh              || "",
      body.periode         || "",
      body.hst_aktual      || "",
      body.hst_checkpoint  || "",
      body.varian          || "",
      body.operator        || "",
      body.lebar_daun      || "",
      body.diameter_batang || "",
      body.warna_daun      || "",
      body.warna_akar      || "",
      body.volume_akar     || "",
    ];

    // setValues() ~30-50% lebih cepat dari appendRow()
    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, 1, row.length).setValues([row]);

    return jsonResponse({ success: true, message: "Data berhasil disimpan", varian: body.varian });

  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ============================================================
// doGet — test koneksi atau ping
// ============================================================
function doGet(e) {
  var action = (e.parameter || {}).action;

  if (action === "test") {
    var sheet = getSheet();
    var rowCount = Math.max(0, sheet.getLastRow() - 1);
    return jsonResponse({
      success: true,
      app: "Vigor GAS",
      status: "active",
      sheet: SHEET_NAME,
      totalRows: rowCount,
    });
  }

  return jsonResponse({ success: true, app: "Vigor GAS", status: "active" });
}

// ============================================================
// ensureHeaders — buat header di baris 1 kalau belum ada
// ============================================================
function ensureHeaders(sheet) {
  if (sheet.getLastRow() === 0) {
    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, 1, HEADERS.length).setValues([HEADERS]);
    var headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#1b5e20");
    headerRange.setFontColor("#ffffff");
    headerRange.setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
  }
}

// ============================================================
// testSubmitVigor — jalankan dari editor untuk uji coba
// ============================================================
function testSubmitVigor() {
  var contohData = [
    {
      action:          "submitVigor",
      tanggal:         "11/04/2026",
      gh:              "BERGAS 2",
      periode:         "26.2",
      hst_aktual:      9,
      hst_checkpoint:  7,
      varian:          "Greeniegal",
      operator:        "Dedy",
      lebar_daun:      "7–9,9",
      diameter_batang: "Batang besar, antar ruas panjang",
      warna_daun:      "Tidak ada menguning",
      warna_akar:      "Akar Putih Bersih",
      volume_akar:     "Volume Akar Banyak",
      client_timestamp: new Date().toISOString(),
    },
  ];

  var sheet = getSheet();
  ensureHeaders(sheet);

  contohData.forEach(function(data) {
    var tsDate = data.client_timestamp ? new Date(data.client_timestamp) : new Date();
    var row = [
      Utilities.formatDate(tsDate, "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss"),
      data.tanggal, data.gh, data.periode, data.hst_aktual, data.hst_checkpoint,
      data.varian, data.operator, data.lebar_daun, data.diameter_batang,
      data.warna_daun, data.warna_akar, data.volume_akar,
    ];
    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, 1, row.length).setValues([row]);
  });

  Logger.log("✅ Test selesai — " + contohData.length + " baris ditambahkan ke sheet DATABASE");
}

// ── Helper ─────────────────────────────────────────────────
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
