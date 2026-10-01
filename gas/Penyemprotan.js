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
  PEMAKAIAN_GAS: "Penyemprotan_PemakaianGas",
};

// ── Header kolom per sheet ────────────────────────────────────
const HEADER = {
  OLES_GSB: [
    "Timestamp", "Tanggal", "GH",
    "Pestisida", "Konsentrasi", "Penggunaan (gram)", "Operator",
  ],

  PENGAMBILAN: [
    "Timestamp", "Tanggal", "GH",
    "Nama Pestisida", "Jumlah", "Operator",
  ],

  PENGGUNAAN: [
    "Timestamp", "Tanggal", "GH",
    "Nama Pestisida", "Konsentrasi", "Jumlah Pemakaian",
    "Suhu Mulai (°C)", "RH Mulai (%)", "Suhu Selesai (°C)", "RH Selesai (%)",
    "Waktu Mulai", "Waktu Selesai", "Waktu (Periode)",
    "Varian Tidak Disemprot", "Sterilisasi",
    "Nomor Gas", "Gas Baru", "Peruntukan", "Keterangan", "Operator",
  ],

  PEMAKAIAN_GAS: [
    "Timestamp", "Tanggal", "GH",
    "Waktu Mulai", "Waktu Selesai", "Nomor Gas", "Gas Baru", "Peruntukan", "Operator",
  ],
};

// ── Warna header per sheet ────────────────────────────────────
const HEADER_COLOR = {
  OLES_GSB:      "#BF360C", // merah tua (Oles GSB orange theme)
  PENGAMBILAN:   "#0D47A1", // biru tua (Pengambilan)
  PENGGUNAAN:    "#1B5E20", // hijau tua (Penggunaan)
  PEMAKAIAN_GAS: "#6A1B9A", // ungu tua (Pemakaian Gas)
};

// ============================================================
// doPost — menerima submit dari form
// ============================================================
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

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (!checkRateLimit()) return jsonResponse({ success: false, error: "Terlalu banyak request, coba lagi sebentar." });
    if (!checkAppToken(data.token)) return jsonResponse({ success: false, error: "Unauthorized" });
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

    // Tulis ke sheet Pengambilan jika ada pengambilan pestisida
    if (data.ada_pengambilan) {
      appendRowFast(ss, "PENGAMBILAN", [
        ts,
        data.tanggal                || "",
        data.gh                     || "",
        data.ambil_nama_pestisida   || "",
        data.ambil_jumlah           || "",
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
        data.guna_suhu_mulai         || "",
        data.guna_rh_mulai           || "",
        data.guna_suhu_selesai       || "",
        data.guna_rh_selesai         || "",
        data.guna_waktu_mulai        || "",
        data.guna_waktu_selesai      || "",
        data.guna_waktu_periode      || "",
        data.guna_varian_skip        || "",
        data.guna_sterilisasi        || "",
        data.guna_nomor_gas          || "",
        typeof data.guna_gas_baru === "boolean" ? (data.guna_gas_baru ? "Ya" : "Tidak") : "",
        data.guna_peruntukan         || "",
        data.guna_keterangan         || "",
        data.operator                || "",
      ]);
      written.push(SHEET.PENGGUNAAN);
    }

    return { success: true, sheets: written, timestamp: ts };
  }

  // ── PEMAKAIAN GAS ──────────────────────────────────────────
  if (data.type === "pemakaian_gas") {
    appendRowFast(ss, "PEMAKAIAN_GAS", [
      ts,
      data.tanggal          || "",
      data.gh               || "",
      data.gas_waktu_mulai   || "",
      data.gas_waktu_selesai || "",
      data.gas_nomor         || "",
      typeof data.gas_baru === "boolean" ? (data.gas_baru ? "Ya" : "Tidak") : "",
      data.gas_peruntukan    || "",
      data.operator          || "",
    ]);
    return { success: true, sheet: SHEET.PEMAKAIAN_GAS, timestamp: ts };
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
    "• " + SHEET.PENGGUNAAN + "\n" +
    "• " + SHEET.PEMAKAIAN_GAS
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
        guna_nama_pestisida: "ENDURE",
        guna_konsentrasi: "0.5 Gr/L",
        guna_jumlah_pemakaian: "100 L",
        guna_suhu_mulai: "28",
        guna_rh_mulai: "75",
        guna_suhu_selesai: "30",
        guna_rh_selesai: "72",
        guna_waktu_mulai: "07:00",
        guna_waktu_selesai: "09:30",
        guna_waktu_periode: "Pagi",
        guna_varian_skip: "",
        guna_sterilisasi: "Steril Ke-1",
        guna_nomor_gas: "G-01",
        guna_gas_baru: true,
        guna_peruntukan: "Penyemprotan Pestisida",
        guna_keterangan: "Test penggunaan",
        operator: "Test Operator",
      }),
    },
  };
  const result = JSON.parse(doPost(fakePost).getContent());
  Logger.log("Test PenggunaanAmbil: " + JSON.stringify(result));
}

// ============================================================
// testSubmitPemakaianGas — test dari editor (jalankan manual)
// ============================================================
function testSubmitPemakaianGas() {
  const fakePost = {
    postData: {
      contents: JSON.stringify({
        action: "submitPenyemprotan",
        type: "pemakaian_gas",
        tanggal: "11/04/2026",
        gh: "SAWAHAN 1",
        gas_waktu_mulai: "07:00",
        gas_waktu_selesai: "08:00",
        gas_nomor: "G-02",
        gas_baru: false,
        gas_peruntukan: "Kocor Media",
        operator: "Test Operator",
      }),
    },
  };
  const result = JSON.parse(doPost(fakePost).getContent());
  Logger.log("Test PemakaianGas: " + JSON.stringify(result));
}

// ── Helper ────────────────────────────────────────────────────
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
