// ============================================================
// Google Apps Script — Form Penyemprotan
// Spreadsheet: https://docs.google.com/spreadsheets/d/1ljx-BFRjZX7VRZIWyHVRfjTNMiCKODtBmptmfc15Fc4
//
// CARA DEPLOY:
//   1. Buka script.google.com → New project → paste kode ini
//   2. Klik Deploy → New deployment → Web app
//      Execute as: Me | Who has access: Anyone
//   3. Klik Deploy → copy URL
//   4. Tambahkan ke Vercel Env: VITE_GAS_PENYEMPROTAN_URL=<url>
//   5. Jalankan fungsi initSheets() SATU KALI untuk buat sheet + header
// ============================================================

const SS_ID = "1ljx-BFRjZX7VRZIWyHVRfjTNMiCKODtBmptmfc15Fc4";

// ── Cache spreadsheet & sheet di level global (hidup selama instance GAS warm) ─
// Ini menghilangkan overhead openById() & getSheetByName() tiap request.
let _ss    = null;
let _cache = {}; // { sheetKey: sheetObject }

function getSpreadsheet() {
  if (!_ss) _ss = SpreadsheetApp.openById(SS_ID);
  return _ss;
}

function getCachedSheet(sheetKey) {
  if (_cache[sheetKey]) return _cache[sheetKey];
  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEET[sheetKey]);
  if (sheet) _cache[sheetKey] = sheet;
  return sheet || null;
}

// ── Nama sheet ────────────────────────────────────────────────
const SHEET = {
  OLES_GSB:    "Penyemprotan_OlesGSB",
  PENGAMBILAN: "Penyemprotan_Pengambilan",
  PENGGUNAAN:  "Penyemprotan_Penggunaan",
};

// ── Header kolom per sheet ────────────────────────────────────
const HEADER = {
  OLES_GSB: [
    "Timestamp", "Tanggal", "GH",
    "Pestisida", "Konsentrasi", "Penggunaan (gram)", "Operator",
  ],

  PENGAMBILAN: [
    "Timestamp", "Tanggal", "GH",
    "Nama Pestisida", "Jumlah",
    "Suhu Mulai (°C)", "RH Mulai (%)", "Suhu Selesai (°C)", "RH Selesai (%)",
    "Waktu Mulai", "Waktu Selesai",
    "Varian Tidak Disemprot", "Keterangan", "Operator",
  ],

  PENGGUNAAN: [
    "Timestamp", "Tanggal", "GH",
    "Nama Pestisida", "Konsentrasi", "Jumlah Pemakaian", "Sterilisasi", "Operator",
  ],
};

// ── Warna header per sheet ────────────────────────────────────
const HEADER_COLOR = {
  OLES_GSB:    "#BF360C", // merah tua (Oles GSB orange theme)
  PENGAMBILAN: "#0D47A1", // biru tua (Pengambilan)
  PENGGUNAAN:  "#1B5E20", // hijau tua (Penggunaan)
};

// ============================================================
// doPost — menerima submit dari form
// ============================================================
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const result = processSubmission(data);
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ============================================================
// doGet — health check
// ============================================================
function doGet(e) {
  return jsonResponse({
    success: true,
    app: "Penyemprotan GAS",
    status: "active",
    sheets: Object.values(SHEET),
  });
}

// ============================================================
// processSubmission — routing berdasarkan type
// ============================================================
function processSubmission(data) {
  if (data.action !== "submitPenyemprotan") {
    throw new Error("Unknown action: " + data.action);
  }

  // Gunakan cached spreadsheet — tidak openById() ulang tiap request
  const ss = getSpreadsheet();

  // Pakai waktu submit dari client jika ada (penting untuk data offline),
  // fallback ke waktu server jika tidak tersedia.
  const tsDate = data.client_timestamp ? new Date(data.client_timestamp) : new Date();
  const ts     = Utilities.formatDate(tsDate, "Asia/Jakarta", "dd/MM/yyyy HH:mm:ss");

  // ── OLES GSB ──────────────────────────────────────────────
  if (data.type === "oles_gsb") {
    appendRowFast(ss, "OLES_GSB", [
      ts,
      data.tanggal         || "",
      data.gh              || "",
      data.pestisida       || "",
      data.konsentrasi     || "",
      data.penggunaan_gram || "",
      data.operator        || "",
    ]);
    return { success: true, sheet: SHEET.OLES_GSB, timestamp: ts };
  }

  // ── PENGGUNAAN & PENGAMBILAN ──────────────────────────────
  if (data.type === "penggunaan_ambil") {
    const written = [];

    // Tulis ke sheet Pengambilan jika ada pengambilan
    if (data.ada_pengambilan) {
      appendRowFast(ss, "PENGAMBILAN", [
        ts,
        data.tanggal                || "",
        data.gh                     || "",
        data.ambil_nama_pestisida   || "",
        data.ambil_jumlah           || "",
        data.ambil_suhu_mulai       || "",
        data.ambil_rh_mulai         || "",
        data.ambil_suhu_selesai     || "",
        data.ambil_rh_selesai       || "",
        data.ambil_waktu_mulai      || "",
        data.ambil_waktu_selesai    || "",
        data.ambil_varian_skip      || "",
        data.ambil_keterangan       || "",
        data.operator               || "",
      ]);
      written.push(SHEET.PENGAMBILAN);
    }

    // Tulis ke sheet Penggunaan jika ada data penggunaan
    if (data.guna_nama_pestisida) {
      appendRowFast(ss, "PENGGUNAAN", [
        ts,
        data.tanggal                 || "",
        data.gh                      || "",
        data.guna_nama_pestisida     || "",
        data.guna_konsentrasi        || "",
        data.guna_jumlah_pemakaian   || "",
        data.guna_sterilisasi        || "",
        data.operator                || "",
      ]);
      written.push(SHEET.PENGGUNAAN);
    }

    return { success: true, sheets: written, timestamp: ts };
  }

  throw new Error("Unknown type: " + data.type);
}

// ============================================================
// appendRowFast — tulis baris pakai setValues() bukan appendRow()
//
// Kenapa lebih cepat:
//   • appendRow() pakai internal lock + re-fetch last row setiap kali
//   • setValues() langsung ke range tertentu — ~30-50% lebih cepat
//   • Sheet di-cache di _cache[] → tidak getSheetByName() ulang
// ============================================================
function appendRowFast(ss, sheetKey, rowData) {
  let sheet = getCachedSheet(sheetKey);

  if (!sheet) {
    sheet = createSheet(ss, sheetKey);
    _cache[sheetKey] = sheet; // cache sheet baru
  }

  const lastRow  = sheet.getLastRow();
  const newRow   = lastRow + 1;
  sheet.getRange(newRow, 1, 1, rowData.length).setValues([rowData]);
}

// Alias lama tetap ada supaya testSubmit* fungsi tidak error
function appendRow(ss, sheetKey, rowData) {
  appendRowFast(ss, sheetKey, rowData);
}

// ============================================================
// createSheet — buat sheet baru dengan header + formatting
// ============================================================
function createSheet(ss, sheetKey) {
  const sheetName = SHEET[sheetKey];
  const headers   = HEADER[sheetKey];
  const bgColor   = HEADER_COLOR[sheetKey];

  const sheet = ss.insertSheet(sheetName);

  // Header
  const hRange = sheet.getRange(1, 1, 1, headers.length);
  hRange.setValues([headers]);
  hRange.setBackground(bgColor);
  hRange.setFontColor("#ffffff");
  hRange.setFontWeight("bold");
  hRange.setHorizontalAlignment("center");
  hRange.setVerticalAlignment("middle");
  sheet.getRange(1, 1, 1, headers.length).setWrap(true);

  // Row height header
  sheet.setRowHeight(1, 40);

  // Freeze header
  sheet.setFrozenRows(1);

  // Auto-resize
  sheet.autoResizeColumns(1, headers.length);

  Logger.log("✅ Sheet dibuat: " + sheetName);
  return sheet;
}

// ============================================================
// initSheets — jalankan SATU KALI dari editor untuk setup awal
// ============================================================
function initSheets() {
  const ss = SpreadsheetApp.openById(SS_ID);

  Object.keys(SHEET).forEach(function(key) {
    if (!ss.getSheetByName(SHEET[key])) {
      createSheet(ss, key);
    } else {
      Logger.log("ℹ️  Sheet sudah ada: " + SHEET[key]);
    }
  });

  Logger.log("✅ initSheets selesai.");
  SpreadsheetApp.getUi().alert("Sheet berhasil dibuat!\n\n" +
    "• " + SHEET.OLES_GSB + "\n" +
    "• " + SHEET.PENGAMBILAN + "\n" +
    "• " + SHEET.PENGGUNAAN
  );
}

// ============================================================
// testSubmitOlesGSB — test dari editor (jalankan manual)
// ============================================================
function testSubmitOlesGSB() {
  const fakePost = {
    postData: {
      contents: JSON.stringify({
        action: "submitPenyemprotan",
        type: "oles_gsb",
        tanggal: "11/04/2026",
        gh: "COLOMADU 1",
        pestisida: "Ridomil",
        konsentrasi: "50 g/L",
        penggunaan_gram: "200",
        operator: "Test Operator",
      }),
    },
  };
  const result = JSON.parse(doPost(fakePost).getContent());
  Logger.log("Test OlesGSB: " + JSON.stringify(result));
}

// ============================================================
// testSubmitPenggunaan — test dari editor (jalankan manual)
// ============================================================
function testSubmitPenggunaan() {
  const fakePost = {
    postData: {
      contents: JSON.stringify({
        action: "submitPenyemprotan",
        type: "penggunaan_ambil",
        tanggal: "11/04/2026",
        gh: "BERGAS 2",
        ada_pengambilan: true,
        ambil_nama_pestisida: "ENDURE",
        ambil_jumlah: "500 ml",
        ambil_suhu_mulai: "28",
        ambil_rh_mulai: "75",
        ambil_suhu_selesai: "30",
        ambil_rh_selesai: "72",
        ambil_waktu_mulai: "07:00",
        ambil_waktu_selesai: "09:30",
        ambil_varian_skip: "",
        ambil_keterangan: "Test pengambilan",
        guna_nama_pestisida: "ENDURE",
        guna_konsentrasi: "0.5 Gr/L",
        guna_jumlah_pemakaian: "100 L",
        guna_sterilisasi: "Steril Ke-1",
        operator: "Test Operator",
      }),
    },
  };
  const result = JSON.parse(doPost(fakePost).getContent());
  Logger.log("Test PenggunaanAmbil: " + JSON.stringify(result));
}

// ── Helper ────────────────────────────────────────────────────
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
