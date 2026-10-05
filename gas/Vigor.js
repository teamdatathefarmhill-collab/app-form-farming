// ============================================================
// Google Apps Script — Vigor Form
// Spreadsheet: https://docs.google.com/spreadsheets/d/1t0hmb0AlqbfJ4KOK47LKkoRpJ-Jgl3fF6Ru8FZzSI0Y
// Sheet      : DATABASE (gid=1832506765)
// Drive Foto : https://drive.google.com/drive/folders/1rPK95IpxuThMGV9UOJCLi-l_Es4j8YL2
//
// CARA DEPLOY:
//   1. Buka script.google.com → buka project yang ada → replace semua kode ini
//   2. Jalankan fixHeaders() dulu dari editor (sekali saja) untuk betulkan kolom sheet
//   3. Klik Deploy → New deployment → Web app
//      Execute as: Me | Who has access: Anyone
//   4. Copy URL → tambahkan ke Vercel Env: VITE_GAS_VIGOR_URL=<url>
//
// ENDPOINT:
//   POST body JSON { action: "submitVigor", ... }  → simpan ke sheet
//   POST body JSON { action: "submitVigorSemaiBatch", rows: [...] } → Vigor Semai HST 11 → sheet For Vigor
//   POST body JSON { action: "uploadFoto", ... }   → upload foto selfie ke Drive
//   GET  ?action=test                               → cek koneksi
//
// URUTAN KOLOM SHEET:
//   A  Timestamp        B  Tanggal          C  GH
//   D  Periode          E  HST Aktual       F  HST Checkpoint
//   G  Varian           H  Operator
//   I  Lebar Daun       J  Diameter Batang  K  Warna Daun
//   L  Warna Akar       M  Volume Akar
//   N  Simetri Buah     O  Cabang Buah
//   P  Buah Bajang      Q  Panjang Tunas Air
//   R  Kesegaran
//   S  Netting Buah     T  Netting 50%
//   U  Bercak Hitam
//   V  Foto Selfie
// ============================================================

const SS_ID            = "1t0hmb0AlqbfJ4KOK47LKkoRpJ-Jgl3fF6Ru8FZzSI0Y";
const SHEET_NAME       = "DATABASE";
const SEMAI_SHEET_NAME = "For Vigor"; // sheet terpisah untuk Vigor Semai (HST 11) — dibuat otomatis kalau belum ada
const SELFIE_FOLDER_ID = "1MGdDXFwpwIersJigv4zOXWCPBsqi0GIv";

// ── Cache global (hidup selama instance GAS warm) ─────────────────────────────
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
  "Timestamp",         // A — waktu data masuk (auto)
  "Tanggal",           // B — tanggal input (dd/mm/yyyy)
  "GH",                // C
  "Periode",           // D
  "HST Aktual",        // E
  "HST Checkpoint",    // F
  "Varian",            // G
  "Operator",          // H
  // Aspek Vigor
  "Lebar Daun",        // I
  "Diameter Batang",   // J
  "Warna Daun",        // K
  // Aspek Perakaran
  "Warna Akar",        // L
  "Volume Akar",       // M
  // Aspek Kualitas Buah (HST > 30)
  "Simetri Buah",      // N — terisi jika HST checkpoint 33 atau 38
  "Cabang Buah",       // O — terisi jika HST checkpoint 33
  // Aspek Polinasi (HST 18)
  "Buah Bajang",       // P — terisi jika HST checkpoint 18
  "Panjang Tunas Air", // Q — terisi jika HST checkpoint 18
  // Aspek Vigor Tambahan (HST 38, 45, 54)
  "Kesegaran",         // R
  // Aspek Kualitas Buah Tambahan (HST 45, 54)
  "Netting Buah",      // S — crack basah (HST 54) / progress netting (HST 45)
  // Pencapaian Netting 50% (HST 54)
  "Netting 50%",       // T
  // Pendataan Buah Net/Bercak Hitam (HST 54)
  "Bercak Hitam",      // U
  // Foto Selfie Operator
  "Foto Selfie",       // V
];

// Header sheet For Vigor (HST 11). Skor 1–4 per variabel, bobot masing-masing 25%.
const SEMAI_HEADERS = [
  "Timestamp", "Tanggal", "GH", "Periode", "HST Aktual", "HST Checkpoint", "Varian", "Operator",
  "Skor Akar", "Skor Batang", "Skor Daun", "Skor Warna Daun",
  "Skor Total (bobot 25% x4)", "Foto Selfie",
];

function getSemaiSheet() {
  var ss    = SpreadsheetApp.openById(SS_ID);
  var sheet = ss.getSheetByName(SEMAI_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SEMAI_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    var h = sheet.getRange(1, 1, 1, SEMAI_HEADERS.length);
    h.setValues([SEMAI_HEADERS]);
    h.setFontWeight("bold");
    h.setBackground("#1b5e20");
    h.setFontColor("#ffffff");
    h.setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function buildSemaiRow(body) {
  var tsDate = body.client_timestamp ? new Date(body.client_timestamp) : new Date();
  var akar = Number(body.skor_akar) || 0, batang = Number(body.skor_batang) || 0;
  var daun = Number(body.skor_daun) || 0, warna  = Number(body.skor_warna_daun) || 0;
  var total = akar * 0.25 + batang * 0.25 + daun * 0.25 + warna * 0.25; // skala 1–4
  return [
    Utilities.formatDate(tsDate, "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss"),
    body.tanggal        || "",
    body.gh             || "",
    body.periode        || "",
    body.hst_aktual     || "",
    body.hst_checkpoint || "",
    body.varian         || "",
    body.operator       || "",
    akar || "", batang || "", daun || "", warna || "",
    total,
    body.selfie_url     || "",
  ];
}

// ============================================================
//  doPost — terima data dari Vigor.jsx
// ============================================================
// ─── Proteksi endpoint ────────────────────────────────────────────────────
// Token disimpan di Script Properties (Project Settings > Script Properties),
// BUKAN di kode ini — supaya tidak ikut ke-share/ke-commit ke git.
// Klien kirim token yang sama (VITE_APP_TOKEN) di tiap request.
// Kalau APP_TOKEN belum di-set di Script Properties, cek ini dilewati dulu
// (supaya tidak lockout diri sendiri saat baru deploy kode ini).
function checkAppToken(token) {
  var expected = PropertiesService.getScriptProperties().getProperty('APP_TOKEN');
  if (!expected) return true;
  return token === expected;
}

// Rate limit sederhana — batasi ~60 request/menit per script (semua caller
// digabung). Bukan proteksi kuat, tapi cukup untuk redam spam/bot otomatis.
function checkRateLimit() {
  var cache = CacheService.getScriptCache();
  var key   = 'rl_' + Math.floor(Date.now() / 60000);
  var count = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(count), 90);
  return count <= 60;
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    if (!checkRateLimit()) return jsonResponse({ success: false, error: "Terlalu banyak request, coba lagi sebentar." });
    if (!checkAppToken(body.token)) return jsonResponse({ success: false, error: "Unauthorized" });

    if (body.action === "uploadFoto") {
      return jsonResponse(uploadFoto(body));
    }

    if (body.action === "submitVigorSemaiBatch" || body.action === "submitVigorSemai") {
      var semaiRows = (body.action === "submitVigorSemai" ? [body] : (body.rows || [])).map(buildSemaiRow);
      if (semaiRows.length === 0) return jsonResponse({ success: false, error: "Tidak ada data yang dikirim" });
      var semaiSheet = getSemaiSheet();
      semaiSheet.getRange(semaiSheet.getLastRow() + 1, 1, semaiRows.length, semaiRows[0].length).setValues(semaiRows);
      return jsonResponse({ success: true, count: semaiRows.length });
    }

    if (body.action === "submitVigorBatch") {
      var sheetBatch = getSheet();
      ensureHeaders(sheetBatch);
      var rows = (body.rows || []).map(buildVigorRow);
      if (rows.length === 0) return jsonResponse({ success: false, error: "Tidak ada data yang dikirim" });
      var lastRowBatch = sheetBatch.getLastRow();
      sheetBatch.getRange(lastRowBatch + 1, 1, rows.length, rows[0].length).setValues(rows);
      return jsonResponse({ success: true, count: rows.length });
    }

    if (body.action !== "submitVigor") {
      return jsonResponse({ success: false, error: "Action tidak dikenal: " + body.action });
    }

    var sheet = getSheet();
    ensureHeaders(sheet);

    var row = buildVigorRow(body);

    // setValues() ~30-50% lebih cepat dari appendRow()
    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, 1, row.length).setValues([row]);

    return jsonResponse({ success: true, message: "Data berhasil disimpan", varian: body.varian });

  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ============================================================
//  buildVigorRow — bangun satu array row dari payload (dipakai
//  submitVigor tunggal maupun tiap item di submitVigorBatch)
// ============================================================
function buildVigorRow(body) {
  // Pakai waktu submit operator jika ada (penting untuk data offline)
  var tsDate = body.client_timestamp ? new Date(body.client_timestamp) : new Date();
  return [
    Utilities.formatDate(tsDate, "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss"), // A Timestamp
    body.tanggal           || "",  // B
    body.gh                || "",  // C
    body.periode           || "",  // D
    body.hst_aktual        || "",  // E
    body.hst_checkpoint    || "",  // F
    body.varian            || "",  // G
    body.operator          || "",  // H
    body.lebar_daun        || "",  // I
    body.diameter_batang   || "",  // J
    body.warna_daun        || "",  // K
    body.warna_akar        || "",  // L
    body.volume_akar       || "",  // M
    body.simetri_buah      || "",  // N
    body.cabang_buah       || "",  // O
    body.buah_bajang       || "",  // P
    body.panjang_tunas_air || "",  // Q
    body.kesegaran         || "",  // R
    body.netting_buah      || "",  // S
    body.netting_50        || "",  // T
    body.net_bercak_hitam  || "",  // U
    body.selfie_url        || "",  // V
  ];
}

// ============================================================
//  uploadFoto — upload base64 image ke Google Drive, return URL
// ============================================================
function uploadFoto(body) {
  try {
    if (!body.base64Data || !body.fileName) {
      return { success: false, error: "base64Data atau fileName kosong" };
    }

    var folder  = DriveApp.getFolderById(SELFIE_FOLDER_ID);
    var decoded = Utilities.base64Decode(body.base64Data);
    var blob    = Utilities.newBlob(decoded, body.mimeType || "image/jpeg", body.fileName);

    // Cek duplikat — kalau file dengan nama & ukuran sama sudah ada, return URL langsung
    var existing = folder.getFilesByName(body.fileName);
    while (existing.hasNext()) {
      var existingFile = existing.next();
      if (existingFile.getSize() === blob.getBytes().length) {
        existingFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        return { success: true, url: "https://drive.google.com/file/d/" + existingFile.getId() + "/view?usp=sharing" };
      }
    }

    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return { success: true, url: "https://drive.google.com/file/d/" + file.getId() + "/view?usp=sharing" };

  } catch (err) {
    return { success: false, error: "Upload foto gagal: " + err.message };
  }
}

// ============================================================
//  doGet — test koneksi atau ping
// ============================================================
function doGet(e) {
  var action = (e.parameter || {}).action;

  if (action === "test") {
    var sheet    = getSheet();
    var rowCount = Math.max(0, sheet.getLastRow() - 1);
    return jsonResponse({
      success:   true,
      app:       "Vigor GAS",
      status:    "active",
      sheet:     SHEET_NAME,
      totalRows: rowCount,
    });
  }

  return jsonResponse({ success: true, app: "Vigor GAS", status: "active" });
}

// ============================================================
//  ensureHeaders — buat header di baris 1 kalau belum ada
// ============================================================
function ensureHeaders(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    var headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#1b5e20");
    headerRange.setFontColor("#ffffff");
    headerRange.setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
  }
}

// ============================================================
//  fixHeaders — jalankan SEKALI dari editor untuk betulkan
//  sheet yang sudah ada datanya.
//
//  Yang dilakukan:
//  - Cek header yang ada sekarang
//  - Kalau kolom N-V belum ada (versi lama hanya sampai M),
//    tambahkan semua kolom baru sekaligus
//  - Kalau Bercak Hitam belum ada tapi Foto Selfie sudah ada,
//    sisipkan Bercak Hitam sebelum Foto Selfie
//
//  Aman dijalankan berulang — tidak akan duplikat kolom.
// ============================================================
function fixHeaders() {
  var sheet = getSheet();
  var lastCol = sheet.getLastColumn();

  var currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(function(h) { return h.toString().trim(); });

  Logger.log("Header sekarang (" + lastCol + " kolom): " + JSON.stringify(currentHeaders));

  // Cek posisi kolom kunci
  var idxBercak   = currentHeaders.indexOf("Bercak Hitam");
  var idxSelfie   = currentHeaders.indexOf("Foto Selfie");
  var idxVolAkar  = currentHeaders.indexOf("Volume Akar"); // kolom M — ujung versi lama

  // Kasus 1: Versi lama — kolom hanya sampai M (Volume Akar), belum ada N-V
  if (idxVolAkar !== -1 && idxSelfie === -1 && idxBercak === -1) {
    Logger.log("Versi lama terdeteksi — menambahkan kolom N sampai V...");
    var newHeaders = [
      "Simetri Buah",      // N
      "Cabang Buah",       // O
      "Buah Bajang",       // P
      "Panjang Tunas Air", // Q
      "Kesegaran",         // R
      "Netting Buah",      // S
      "Netting 50%",       // T
      "Bercak Hitam",      // U
      "Foto Selfie",       // V
    ];
    var startCol = idxVolAkar + 2; // kolom setelah Volume Akar (1-based)
    newHeaders.forEach(function(header, i) {
      var col  = startCol + i;
      var cell = sheet.getRange(1, col);
      cell.setValue(header);
      cell.setFontWeight("bold");
      cell.setBackground("#1b5e20");
      cell.setFontColor("#ffffff");
      cell.setHorizontalAlignment("center");
    });
    Logger.log("Selesai — " + newHeaders.length + " kolom baru ditambahkan mulai kolom " + startCol);
    return;
  }

  // Kasus 2: Sudah ada Foto Selfie tapi Bercak Hitam belum ada
  // (versi tengah — sudah ada N-T dan V, tapi belum ada U)
  if (idxSelfie !== -1 && idxBercak === -1) {
    Logger.log("Foto Selfie ada di kolom " + (idxSelfie + 1) + " — menyisipkan Bercak Hitam sebelumnya...");
    var selfieCol = idxSelfie + 1; // 1-based
    sheet.insertColumnBefore(selfieCol);
    var newCell = sheet.getRange(1, selfieCol);
    newCell.setValue("Bercak Hitam");
    newCell.setFontWeight("bold");
    newCell.setBackground("#1b5e20");
    newCell.setFontColor("#ffffff");
    newCell.setHorizontalAlignment("center");
    Logger.log("Selesai — Bercak Hitam di kolom " + selfieCol + ", Foto Selfie geser ke kolom " + (selfieCol + 1));
    return;
  }

  // Kasus 3: Sudah lengkap
  if (idxBercak !== -1 && idxSelfie !== -1) {
    Logger.log("Header sudah lengkap — tidak perlu fix.");
    Logger.log("Bercak Hitam: kolom " + (idxBercak + 1) + " | Foto Selfie: kolom " + (idxSelfie + 1));
    return;
  }

  Logger.log("Kondisi tidak terduga — cek manual header sheet-nya.");
}

// ============================================================
//  testSubmitVigor — jalankan dari editor untuk uji coba submit
// ============================================================
function testSubmitVigor() {
  var contohData = [
    {
      action: "submitVigor", tanggal: "22/04/2026", gh: "BERGAS 2", periode: "26.2",
      hst_aktual: 7, hst_checkpoint: 7, varian: "Greeniegal", operator: "Dedy",
      lebar_daun: "7–9,9", diameter_batang: "Batang besar, antar ruas panjang",
      warna_daun: "Tidak ada menguning", warna_akar: "Akar Putih Bersih / Akar Coklat Sehat",
      volume_akar: "Volume Akar Banyak",
      simetri_buah: "", cabang_buah: "", buah_bajang: "", panjang_tunas_air: "",
      kesegaran: "", netting_buah: "", netting_50: "", net_bercak_hitam: "", selfie_url: "",
      client_timestamp: new Date().toISOString(),
    },
    {
      action: "submitVigor", tanggal: "22/04/2026", gh: "BERGAS 2", periode: "26.2",
      hst_aktual: 18, hst_checkpoint: 18, varian: "Greeniegal", operator: "Dedy",
      lebar_daun: "18 - 20 cm", diameter_batang: "Batang besar, antar ruas panjang",
      warna_daun: "Tidak ada menguning", warna_akar: "Akar Putih Bersih / Akar Coklat Sehat",
      volume_akar: "Volume Akar Banyak",
      simetri_buah: "", cabang_buah: "",
      buah_bajang: "Tidak ada bunga bajang/menguning", panjang_tunas_air: "2 Ruas",
      kesegaran: "", netting_buah: "", netting_50: "", net_bercak_hitam: "", selfie_url: "",
      client_timestamp: new Date().toISOString(),
    },
    {
      action: "submitVigor", tanggal: "22/04/2026", gh: "BERGAS 2", periode: "26.2",
      hst_aktual: 33, hst_checkpoint: 33, varian: "Greeniegal", operator: "Dedy",
      lebar_daun: "Lebar daun atas sama dengan daun tengah", diameter_batang: "Diameter batang besar",
      warna_daun: "Tidak ada menguning", warna_akar: "Akar Putih Bersih / Akar Coklat Sehat",
      volume_akar: "Volume Akar Banyak",
      simetri_buah: "Buah asimetris/peyang < 20 tanaman", cabang_buah: "Buah jadi pada cabang 12 - 13",
      buah_bajang: "", panjang_tunas_air: "", kesegaran: "", netting_buah: "", netting_50: "",
      net_bercak_hitam: "", selfie_url: "",
      client_timestamp: new Date().toISOString(),
    },
    {
      action: "submitVigor", tanggal: "22/04/2026", gh: "BERGAS 2", periode: "26.2",
      hst_aktual: 38, hst_checkpoint: 38, varian: "Greeniegal", operator: "Dedy",
      lebar_daun: "", diameter_batang: "",
      warna_daun: "Tidak ada menguning", warna_akar: "Akar Putih Bersih / Akar Coklat Sehat",
      volume_akar: "Volume Akar Banyak",
      simetri_buah: "Buah asimetris/peyang < 20 tanaman", cabang_buah: "",
      buah_bajang: "", panjang_tunas_air: "", kesegaran: "Segar",
      netting_buah: "", netting_50: "", net_bercak_hitam: "", selfie_url: "",
      client_timestamp: new Date().toISOString(),
    },
    {
      action: "submitVigor", tanggal: "22/04/2026", gh: "BERGAS 2", periode: "26.2",
      hst_aktual: 45, hst_checkpoint: 45, varian: "Greeniegal", operator: "Dedy",
      lebar_daun: "", diameter_batang: "",
      warna_daun: "Tidak ada menguning", warna_akar: "Akar Putih Bersih / Akar Coklat Sehat",
      volume_akar: "Volume Akar Banyak",
      simetri_buah: "", cabang_buah: "", buah_bajang: "", panjang_tunas_air: "",
      kesegaran: "Segar",
      netting_buah: "Varian MD, EL, SS 10% tanaman sudah mulai netting ; SG, GR, dll 80% - 100% netting",
      netting_50: "", net_bercak_hitam: "", selfie_url: "",
      client_timestamp: new Date().toISOString(),
    },
    {
      action: "submitVigor", tanggal: "22/04/2026", gh: "BERGAS 2", periode: "26.2",
      hst_aktual: 54, hst_checkpoint: 54, varian: "Greeniegal", operator: "Dedy",
      lebar_daun: "", diameter_batang: "",
      warna_daun: "Tidak ada menguning", warna_akar: "Akar Putih Bersih / Akar Coklat Sehat",
      volume_akar: "Volume Akar Banyak",
      simetri_buah: "", cabang_buah: "", buah_bajang: "", panjang_tunas_air: "",
      kesegaran: "Segar",
      netting_buah: "Varian bernet crack terbuka (crack basah) < 20 tanaman",
      netting_50: "Varian MD, EL, SS 80% atau 150 tanaman sudah mencapai netting 50%",
      net_bercak_hitam: "Tidak ada net/bercak hitam pada Greeniegal dan/atau Daegoji",
      selfie_url: "",
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
      data.simetri_buah, data.cabang_buah,
      data.buah_bajang, data.panjang_tunas_air,
      data.kesegaran, data.netting_buah, data.netting_50,
      data.net_bercak_hitam, data.selfie_url,
    ];
    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, 1, row.length).setValues([row]);
  });

  Logger.log("✅ Test selesai — " + contohData.length + " baris ditambahkan ke sheet DATABASE");
}

// ============================================================
//  testUploadFoto — jalankan dari editor untuk uji coba upload
// ============================================================
function testUploadFoto() {
  var testBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  var result = uploadFoto({
    action:     "uploadFoto",
    fileName:   "test_selfie_" + Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyyMMdd_HHmmss") + ".png",
    mimeType:   "image/png",
    base64Data: testBase64,
    sessionKey: "test_" + Date.now(),
  });

  Logger.log("Hasil upload: " + JSON.stringify(result));
  if (result.success) {
    Logger.log("URL foto: " + result.url);
  } else {
    Logger.log("Error: " + result.error);
  }
}

// ── Helper ────────────────────────────────────────────────────────────────────
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
