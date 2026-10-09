// ─── KONFIGURASI ─────────────────────────────────────────────────────────────
const SS      = SpreadsheetApp.getActiveSpreadsheet();           // DATABASE HPT (output)
const SS_SEMAI = SpreadsheetApp.openById("1WPHh2-wVLgMBFmV847jSmg-syJgfY_YPTbC5b0Rniuo"); // Data sprout (New) — ref

const SHEET_REF_SEMAI    = "Data sprout (New)";
const SHEET_OUT_PRODUKSI = "HPT Produksi";
const SHEET_OUT_SEMAI    = "HPT Semai";

const HEADER_PRODUKSI = [
  "Timestamp", "GH",
  "Kutu Kebul", "Thrips", "Ulat/Kupu-kupu", "Tungau (per daun)",
  "Tikus", "Aphids", "Ulat Kompos", "Kutu Putih",
  "PM (Insidensi)", "PM Skor 1", "PM Skor 2", "PM Skor 3", "PM Skor 4",
  "DM (Insidensi)", "DM Skor 1", "DM Skor 2", "DM Skor 3", "DM Skor 4",
  "GSB", "Operator", "Keterangan"
];

const HEADER_SEMAI = [
  "Timestamp", "GH", "Periode", "HSS",
  "Kutu Kebul", "Thrips", "Ulat/Kupu-kupu", "Tungau (per daun)",
  "Tikus", "Aphids", "Ulat Kompos", "Kutu Putih",
  "PM (Insidensi)", "PM Skor 1", "PM Skor 2", "PM Skor 3", "PM Skor 4",
  "DM (Insidensi)", "DM Skor 1", "DM Skor 2", "DM Skor 3", "DM Skor 4",
  "GSB", "Operator", "Keterangan"
];

// ─── CORS Helper ──────────────────────────────────────────────────────────────
function makeResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

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
function doGet(e) {
  try {
    const action = e.parameter.action;
    if (!checkRateLimit()) return makeResponse({ error: "Terlalu banyak request, coba lagi sebentar." });
    if (!checkAppToken(e.parameter.token)) return makeResponse({ error: "Unauthorized" });
    if (action === "getSemaiRef") return makeResponse(getSemaiRef());
    if (action === "submitHPT")   return makeResponse(submitHPT(e.parameter));
    return makeResponse({ error: "Unknown action: " + action });
  } catch (err) {
    return makeResponse({ error: err.message });
  }
}

// ─── GET SEMAI REF ────────────────────────────────────────────────────────────
// Baca sheet "Data sprout (New)", grup per (GH Semai + Periode); GH tujuan disimpan sbg info,
// hanya ambil baris yang kolom "Tanam" masih kosong (belum pindah tanam).
function getSemaiRef() {
  const sheet = SS_SEMAI.getSheetByName(SHEET_REF_SEMAI);
  if (!sheet) {
    return { error: "Sheet '" + SHEET_REF_SEMAI + "' tidak ditemukan di Data sprout (New)" };
  }

  const rows = sheet.getDataRange().getValues();

  // Cari baris header (bisa row 1 atau row 2 karena ada baris judul gabungan di atas)
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const rowUpper = rows[i].map(function(c) { return String(c).trim().toUpperCase(); });
    if (rowUpper.indexOf("GH SEMAI") >= 0) { headerRowIdx = i; break; }
  }
  if (headerRowIdx < 0) return { error: "Header 'GH Semai' tidak ditemukan" };

  const header = rows[headerRowIdx].map(function(h) { return String(h).trim().toUpperCase(); });

  const colGhTujuan = header.findIndex(function(h) { return h.indexOf("TUJUAN") >= 0; });
  const colPeriode  = header.indexOf("PERIODE");
  const colGhSemai  = header.indexOf("GH SEMAI");
  const colSemai    = header.indexOf("SEMAI"); // kolom tanggal semai (bukan "GH SEMAI")
  const colTanam    = header.indexOf("TANAM");

  Logger.log("getSemaiRef HPT kolom -> GhTujuan:" + colGhTujuan + " Periode:" + colPeriode + " GhSemai:" + colGhSemai + " Semai:" + colSemai + " Tanam:" + colTanam);

  const parseISO = function(val) {
    if (!val) return "";
    if (val instanceof Date && !isNaN(val)) {
      return Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
    }
    if (typeof val === "string" && val.trim()) {
      const d = new Date(val.trim());
      if (!isNaN(d)) return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
    }
    return "";
  };

  const semai = {};

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row      = rows[r];
    const ghTujuan = String(row[colGhTujuan] || "").trim();
    const periode  = row[colPeriode];
    const ghSemai  = String(row[colGhSemai]  || "").trim();
    const tglSemai = row[colSemai];
    const tglTanam = row[colTanam];

    if (!ghTujuan || !ghSemai) continue;
    if (tglTanam) continue; // sudah tanam → tidak aktif lagi

    // Key unik = GH Semai + GH tujuan + periode (1 GH Semai bisa dipakai banyak batch).
    // Nama yang tampil/disimpan ke sheet = ghSemai (field "nama").
    const periodeStr = String(periode || "");
    const key = ghSemai + "|" + ghTujuan + "|" + periodeStr;
    if (!semai[key]) {
      semai[key] = {
        nama: ghSemai,
        periode: periodeStr,
        ghTujuan: ghTujuan,
        tanam: parseISO(tglSemai), // dipakai FE utk hitung HSS (Today - Semai)
        status: "SEDANG_SEMAI",
      };
    }
  }

  Logger.log("Semai aktif (Data sprout New): " + JSON.stringify(Object.keys(semai)));
  return { semai: semai };
}

// ─── SUBMIT HPT ───────────────────────────────────────────────────────────────
function submitHPT(p) {
  const tipe      = p.tipe || "produksi";
  const timestamp = new Date();
  const gh        = p.gh       || "";
  const operator  = p.operator || "";

  const dataHPT = [
    p.hama_kutu_kebul       || "0",
    p.hama_thrips           || "0",
    p.hama_ulat_kupu        || "0",
    p.hama_tungau           || "0",
    p.hama_tikus            || "0",
    p.hama_aphids           || "0",
    p.hama_ulat_kompos      || "0",
    p.hama_kutu_putih       || "0",
    p.penyakit_pm_insidensi || "0",
    p.penyakit_pm_skor1     || "0",
    p.penyakit_pm_skor2     || "0",
    p.penyakit_pm_skor3     || "0",
    p.penyakit_pm_skor4     || "0",
    p.penyakit_dm_insidensi || "0",
    p.penyakit_dm_skor1     || "0",
    p.penyakit_dm_skor2     || "0",
    p.penyakit_dm_skor3     || "0",
    p.penyakit_dm_skor4     || "0",
    p.penyakit_gsb          || "0",
    operator,
    p.keterangan            || "",
  ];

  if (tipe === "semai") {
    const row = [timestamp, gh, p.periode || "", p.hst || ""].concat(dataHPT);
    appendToSheet(SHEET_OUT_SEMAI, HEADER_SEMAI, row);
  } else {
    const row = [timestamp, gh].concat(dataHPT);
    appendToSheet(SHEET_OUT_PRODUKSI, HEADER_PRODUKSI, row);
  }

  return { status: "ok", tipe, gh, timestamp: timestamp.toISOString() };
}

// ─── APPEND TO SHEET ──────────────────────────────────────────────────────────
function appendToSheet(sheetName, header, row) {
  let sheet = SS.getSheetByName(sheetName);

  if (!sheet) {
    sheet = SS.insertSheet(sheetName);
    sheet.appendRow(header);
    const headerRange = sheet.getRange(1, 1, 1, header.length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#1b5e20");
    headerRange.setFontColor("#ffffff");
    sheet.setFrozenRows(1);
    sheet.appendRow(row);
    return;
  }

  const firstRow = sheet.getRange(1, 1).getValue();
  if (!firstRow) {
    sheet.appendRow(header);
    const headerRange = sheet.getRange(1, 1, 1, header.length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#1b5e20");
    headerRange.setFontColor("#ffffff");
    sheet.setFrozenRows(1);
  }

  sheet.appendRow(row);
}

// ─── TEST FUNCTIONS ───────────────────────────────────────────────────────────

// TEST 1 — Cek sheet yang tersedia di kedua spreadsheet
function testListSheets() {
  Logger.log("=== DATABASE HPT (output) ===");
  SS.getSheets().forEach(function(s, i) {
    Logger.log((i + 1) + ". \"" + s.getName() + "\"");
  });

  Logger.log("=== Data sprout (New) (ref) ===");
  SS_SEMAI.getSheets().forEach(function(s, i) {
    Logger.log((i + 1) + ". \"" + s.getName() + "\"");
  });
}

// TEST 2 — Cek header kolom di Data sprout (New)
function testSemaiHeader() {
  const sheet = SS_SEMAI.getSheetByName(SHEET_REF_SEMAI);
  if (!sheet) {
    Logger.log("❌ Sheet \"" + SHEET_REF_SEMAI + "\" tidak ditemukan!");
    return;
  }
  const rows = sheet.getDataRange().getValues();
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    Logger.log("=== Row " + (i + 1) + " ===");
    rows[i].forEach(function(h, j) {
      Logger.log("Kolom " + (j + 1) + " (index " + j + "): \"" + h + "\"");
    });
  }
}

// TEST 3 — Simulasi getSemaiRef, lihat GH yang akan tampil di app
function testGetSemaiRef() {
  const result = getSemaiRef();
  if (result.error) {
    Logger.log("❌ Error: " + result.error);
    return;
  }
  const keys = Object.keys(result.semai);
  Logger.log("=== GH Semai Aktif (" + keys.length + ") ===");
  keys.forEach(function(gh) {
    Logger.log(gh + " → " + JSON.stringify(result.semai[gh]));
  });
}

// TEST 4 — Tulis baris test ke sheet HPT Semai (beneran nulis!)
function testSubmitSemaiReal() {
  const row = [
    new Date(), "TEST - Colomadu 1", "26.1", "42",
    "2", "0", "1", "0", "0", "0", "0", "0",   // hama
    "0", "0", "0", "0", "0",                  // PM
    "0", "0", "0", "0", "0",                  // DM
    "0",                                      // GSB
    "Test Operator", "Test dari GAS - boleh dihapus",
  ];

  appendToSheet(SHEET_OUT_SEMAI, HEADER_SEMAI, row);
  Logger.log("✅ Baris test berhasil ditulis ke sheet: " + SHEET_OUT_SEMAI);
  Logger.log("Row: " + JSON.stringify(row));
}
