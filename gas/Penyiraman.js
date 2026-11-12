// ============================================================
//  FarmTrack Pro — Form Penyiraman
//  Google Apps Script (Code.gs)
//
//  Cara pasang:
//  1. Buka Spreadsheet:
//     https://docs.google.com/spreadsheets/d/1koqehMQj7g9SrIvwmUt7qCXVq2skYCWVPQ0IYBgVgCQ
//  2. Extensions > Apps Script
//  3. Hapus semua isi default, paste file ini
//  4. Save → Deploy > New deployment > Web app
//     - Execute as: Me
//     - Who has access: Anyone
//  5. Copy URL deploy → taruh di VITE_GAS_PENYIRAMAN_URL di Vercel
// ============================================================

const SHEET_PENYIRAMAN = "Form Penyiraman";
const NUTRISI_SCAN_ROWS = 1500;
const REF_CACHE_KEY     = "getREF_v1";
const REF_CACHE_TTL     = 30; // detik — singkat supaya GH yang baru tanam cepat muncul
const SS_REF_ID        = "1tIJzuTBXcM7Wks03pgsyVicJUCtDs9Ak0N89K9GlKe4"; // Spreadsheet REF

// GH tertentu (mis. TOHUDAN 18) kirim isian Drip per varian SEKALIGUS 1 baris Dutch Bucket
// tambahan — baris DB ditandai lewat kolom varian, bukan lewat GH/tipe (keduanya sama
// dengan baris varian drip di GH yang sama). Harus sinkron dengan buildPayloads() di
// src/pages/Penyiraman.jsx.
function isDbRow(d) { return String(d.varian || "").trim() === "Dutch Bucket"; }

// ── Cache global (hidup selama instance GAS warm) ────────────
let _ss     = null;
let _ssRef  = null;

function getSS()    { if (!_ss)    _ss    = SpreadsheetApp.getActiveSpreadsheet(); return _ss; }
function getSSRef() { if (!_ssRef) _ssRef = SpreadsheetApp.openById(SS_REF_ID);   return _ssRef; }

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

// ── Entry point POST ─────────────────────────────────────────
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (!checkRateLimit()) return jsonError("Terlalu banyak request, coba lagi sebentar.");
    if (!checkAppToken(data.token)) return jsonError("Unauthorized");
    if (data.action === "submitPenyiraman")      return handlePenyiraman(data);
    if (data.action === "submitPenyiramanBatch") return handlePenyiramanBatch(data);
    return jsonError("Action tidak dikenal: " + data.action);
  } catch (err) {
    return jsonError(err.toString());
  }
}

// ── Entry point GET ──────────────────────────────────────────
function doGet(e) {
  const action = e?.parameter?.action;
  if (!checkRateLimit()) return jsonError("Terlalu banyak request, coba lagi sebentar.");
  if (!checkAppToken(e?.parameter?.token)) return jsonError("Unauthorized");
  if (action === "getREF") return handleGetREF();
  return ContentService
    .createTextOutput(JSON.stringify({ status: "ok", message: "GAS Penyiraman aktif." }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Helper: bangun ghMap dari rows mentah + index kolom ──────
function buildGhMapFromRows(rows, colIdx) {
  const ghMap = {};

  for (let i = 1; i < rows.length; i++) {
    const gh      = String(rows[i][colIdx.gh] || "").trim();
    const periode = parseFloat(rows[i][colIdx.periode]);
    const varian  = String(rows[i][colIdx.varian] || "").trim();
    const tanamRaw = rows[i][colIdx.tanam];

    if (!gh || isNaN(periode)) continue;

    let tanamDate = null;
    if (tanamRaw instanceof Date) {
      tanamDate = tanamRaw;
    } else if (tanamRaw) {
      tanamDate = new Date(tanamRaw);
    }

    if (!ghMap[gh]) {
      ghMap[gh] = { maxPeriode: periode, maxTanam: tanamDate, varianSet: new Set() };
    }

    const entry = ghMap[gh];

    if (periode > entry.maxPeriode) {
      entry.maxPeriode = periode;
      entry.maxTanam   = tanamDate;
      entry.varianSet  = new Set();
    }

    if (periode === entry.maxPeriode) {
      if (tanamDate && (!entry.maxTanam || tanamDate > entry.maxTanam)) {
        entry.maxTanam = tanamDate;
      }
      if (varian) entry.varianSet.add(varian);
    }
  }

  return ghMap;
}

// ── Helper: ubah ghMap jadi struktur data final (hst, varian, dst) ──
function ghMapToData(ghMap) {
  const data = {};
  const tz   = Session.getScriptTimeZone();
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  for (const [gh, entry] of Object.entries(ghMap)) {
    const tanamStr = entry.maxTanam
      ? Utilities.formatDate(entry.maxTanam, tz, "yyyy-MM-dd")
      : null;

    let hst = null;
    if (entry.maxTanam) {
      const tanamMidnight = new Date(
        entry.maxTanam.getFullYear(),
        entry.maxTanam.getMonth(),
        entry.maxTanam.getDate()
      );
      hst = Math.floor((todayMidnight - tanamMidnight) / 86400000);
    }

    if (hst !== null && hst >= 70) continue;

    data[gh] = {
      periode: entry.maxPeriode,
      tanam:   tanamStr,
      hst:     hst,
      varian:  Array.from(entry.varianSet).sort(),
    };
  }

  return data;
}

// ── Helper: cari Nutrisi terakhir per GH dari sheet Form Penyiraman ──
// Dibaca dari bawah ke atas (data terbaru duluan), ambil nilai pertama yang ketemu per GH.
function getLastNutrisiPerGh() {
  const result = {};
  const ss     = getSS();
  const sheet  = ss.getSheetByName(SHEET_PENYIRAMAN);
  if (!sheet) return result;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return result;

  // Hanya baca NUTRISI_SCAN_ROWS baris terakhir — sheet ini tumbuh terus tiap hari,
  // membaca semua baris bikin getREF makin lambat. Nutrisi GH aktif pasti ada di baris-baris terbaru.
  const startRow = Math.max(2, lastRow - NUTRISI_SCAN_ROWS + 1);

  // Kolom: Nama GH = E (5), Nutrisi = U (21)
  const rows = sheet.getRange(startRow, 5, lastRow - startRow + 1, 17).getValues(); // E..U relatif terhadap kolom 5
  for (let i = rows.length - 1; i >= 0; i--) {
    const gh      = String(rows[i][0] || "").trim();   // kolom E
    const nutrisi = String(rows[i][16] || "").trim();  // kolom U (5 + 16 = 21)
    if (!gh || !nutrisi || result[gh]) continue;
    result[gh] = nutrisi;
  }
  return result;
}

// ── Handler: Get REF Data (REF biasa + REF RND) ──────────────
function handleGetREF() {
  const cache = CacheService.getScriptCache();
  const hit   = cache.get(REF_CACHE_KEY);
  if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);

  const payload = buildRefPayload();
  if (payload.success) {
    try { cache.put(REF_CACHE_KEY, JSON.stringify(payload), REF_CACHE_TTL); } catch (e) { /* >100KB, lewati cache */ }
  }
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function buildRefPayload() {
  try {
    const ss    = getSSRef();
    const sheet = ss.getSheetByName("REF");
    if (!sheet) return { success: false, error: "Sheet 'REF' tidak ditemukan." };

    const rows = sheet.getRange("A:L").getValues();
    if (rows.length < 2) return { success: false, error: "Sheet REF kosong." };

    const ghMap = buildGhMapFromRows(rows, { gh: 0, periode: 1, varian: 8, tanam: 11 });
    const data  = ghMapToData(ghMap);

    // Sheet REF RND — kolom: Greenhouse(A), Periode(B), GH Code(C), Sample Code(D),
    // Var Code(E), Baris(F), Varian(G), True Var(H), Tanam(I)
    let dataRnd = {};
    const sheetRnd = ss.getSheetByName("REF RND");
    if (sheetRnd) {
      const rowsRnd = sheetRnd.getRange("A:I").getValues();
      if (rowsRnd.length >= 2) {
        const ghMapRnd = buildGhMapFromRows(rowsRnd, { gh: 0, periode: 1, varian: 7, tanam: 8 });
        dataRnd = ghMapToData(ghMapRnd);
      }
    }

    // Sisipkan Nutrisi terakhir (per GH) ke masing-masing entry data/dataRnd
    const lastNutrisi = getLastNutrisiPerGh();
    Object.keys(data).forEach(gh    => { data[gh].nutrisi    = lastNutrisi[gh] || ""; });
    Object.keys(dataRnd).forEach(gh => { dataRnd[gh].nutrisi = lastNutrisi[gh] || ""; });

    return { success: true, data, dataRnd };

  } catch (err) {
    return { success: false, error: "getREF error: " + err.toString() };
  }
}

// ── Handler: Submit Penyiraman ───────────────────────────────
function handlePenyiraman(data) {
  const ss  = getSS();
  let sheet = ss.getSheetByName(SHEET_PENYIRAMAN);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_PENYIRAMAN);
    setupHeaderPenyiraman(sheet);
  }
  if (sheet.getLastRow() === 0) setupHeaderPenyiraman(sheet);

  // setValues() ~30-50% lebih cepat dari appendRow()
  const row     = buildRowPenyiraman(data);
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, 1, row.length).setValues([row]);
  formatLastRowPenyiraman(sheet, data);
  CacheService.getScriptCache().remove(REF_CACHE_KEY); // nutrisi terakhir berubah

  return jsonOk();
}

// ── Handler: Submit Penyiraman Batch (semua varian sekaligus) ─
function handlePenyiramanBatch(data) {
  const rows = data.rows || [];
  if (rows.length === 0) return jsonError("Tidak ada data yang dikirim");

  const ss  = getSS();
  let sheet = ss.getSheetByName(SHEET_PENYIRAMAN);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_PENYIRAMAN);
    setupHeaderPenyiraman(sheet);
  }
  if (sheet.getLastRow() === 0) setupHeaderPenyiraman(sheet);

  const builtRows = rows.map(buildRowPenyiraman);
  const lastRow   = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, builtRows.length, builtRows[0].length).setValues(builtRows);

  formatBatchPenyiraman(sheet, rows, lastRow + 1, builtRows[0].length);
  CacheService.getScriptCache().remove(REF_CACHE_KEY); // nutrisi terakhir berubah

  return ContentService
    .createTextOutput(JSON.stringify({ success: true, count: builtRows.length }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Build baris ──────────────────────────────────────────────
function buildRowPenyiraman(d) {
  // Pakai waktu submit operator jika ada (penting untuk data offline)
  const tsDate = d.client_timestamp ? new Date(d.client_timestamp) : new Date();
  const isDB = isDbRow(d);
  return [
    Utilities.formatDate(tsDate, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss"),
    d.tanggal   || "",
    d.operator  || "",
    d.tipe      || "",
    d.gh        || "",
    d.varian || "",

    // Drip / Kolam
    isDB ? "" : (d.ecIn      || ""),
    isDB ? "" : (d.ecOut     || ""),
    isDB ? "" : (d.phIn      || ""),
    isDB ? "" : (d.phOut     || ""),
    isDB ? "" : (d.volume    || ""),

    d.volNutrisi || "",
    d.suhu || "",
    d.rh   || "",

    // Dutch Bucket
    isDB ? (d.ecTandon  || "") : "",
    isDB ? (d.ecBucket  || "") : "",
    isDB ? (d.phTandon  || "") : "",
    isDB ? (d.phBucket  || "") : "",
    isDB ? (d.doTandon  || "") : "",
    isDB ? (d.doBucket  || "") : "",

    d.nutrisi || "",
  ];
}

// ── Setup header ─────────────────────────────────────────────
function setupHeaderPenyiraman(sheet) {
  const headers = [
    "Timestamp", "Tanggal", "Operator", "Tipe GH", "Nama GH", "Varian",
    "EC In (mS/cm)", "EC Out (mS/cm)", "pH In", "pH Out",
    "Volume (ml/tanaman)", "Volume Nutrisi (L)",
    "Suhu (°C)", "RH (%)",
    "EC Tandon (mS/cm)", "EC Bucket (mS/cm)",
    "pH Tandon", "pH Bucket",
    "DO Tandon (mg/L)", "DO Bucket (mg/L)",
    "Nutrisi",
  ];

  sheet.appendRow(headers);
  sheet.setFrozenRows(1);

  const hRange = sheet.getRange(1, 1, 1, headers.length);
  hRange.setBackground("#0277bd").setFontColor("#ffffff").setFontWeight("bold").setFontSize(10);

  sheet.setColumnWidth(1, 155);
  sheet.setColumnWidth(2, 95);
  sheet.setColumnWidth(3, 140);
  sheet.setColumnWidth(4, 150);
  sheet.setColumnWidth(5, 120);
  for (let c = 6; c <= 21; c++) sheet.setColumnWidth(c, 110);
}

// ── Format banyak baris sekaligus (batch) — hindari getRange per baris ──
// Dulu format 5 varian = 10 panggilan Range API (lambat, ~200-500ms/panggilan
// di Apps Script). Sekarang cuma 2 panggilan berapapun jumlah barisnya.
function formatBatchPenyiraman(sheet, rows, startRow, numCols) {
  const n = rows.length;

  const bgArr = [];
  const sizeArr = [];
  for (let i = 0; i < n; i++) {
    const rowBg = (startRow + i) % 2 === 0 ? "#e1f5fe" : "#ffffff";
    bgArr.push(new Array(numCols).fill(rowBg));
    sizeArr.push(new Array(numCols).fill(10));
  }
  sheet.getRange(startRow, 1, n, numCols).setBackgrounds(bgArr).setFontSizes(sizeArr);

  const tipeBg = [], tipeColor = [], tipeWeight = [];
  for (let i = 0; i < n; i++) {
    if (isDbRow(rows[i])) {
      tipeBg.push(["#fff3e0"]); tipeColor.push(["#e65100"]); tipeWeight.push(["bold"]);
    } else if (rows[i].tipe === "Kolam (Sawahan)") {
      tipeBg.push(["#e8f5e9"]); tipeColor.push(["#2e7d32"]); tipeWeight.push(["bold"]);
    } else {
      tipeBg.push(["#e3f2fd"]); tipeColor.push(["#0D47A1"]); tipeWeight.push(["bold"]);
    }
  }
  sheet.getRange(startRow, 4, n, 1).setBackgrounds(tipeBg).setFontColors(tipeColor).setFontWeights(tipeWeight);
}

// ── Format baris baru ─────────────────────────────────────────
function formatLastRowPenyiraman(sheet, d, rowNum) {
  const lastRow = rowNum || sheet.getLastRow();
  const numCols = sheet.getLastColumn();

  const bg = lastRow % 2 === 0 ? "#e1f5fe" : "#ffffff";
  sheet.getRange(lastRow, 1, 1, numCols).setBackground(bg).setFontSize(10);

  const tipeCell = sheet.getRange(lastRow, 4);
  if (isDbRow(d)) {
    tipeCell.setBackground("#fff3e0").setFontColor("#e65100").setFontWeight("bold");
  } else if (d.tipe === "Kolam (Sawahan)") {
    tipeCell.setBackground("#e8f5e9").setFontColor("#2e7d32").setFontWeight("bold");
  } else {
    tipeCell.setBackground("#e3f2fd").setFontColor("#0D47A1").setFontWeight("bold");
  }
}

// ── Response helpers ─────────────────────────────────────────
function jsonOk() {
  return ContentService
    .createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonError(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Test manual ──────────────────────────────────────────────
function testInsertPenyiraman() {
  const dummy = {
    action: "submitPenyiraman",
    tanggal: "08/04/2026",
    operator: "Dedy",
    tipe: "Drip/Kolam (Tohudan)",
    gh: "TOHUDAN 2",
    ecIn: "2.1", ecOut: "3.2", phIn: "6.1", phOut: "6.5",
    volume: "250", volNutrisi: "100", suhu: "28.5", rh: "75",
    ecTandon: "", ecBucket: "", phTandon: "", phBucket: "", doTandon: "", doBucket: "",
    client_timestamp: new Date().toISOString(),
  };
  const ss    = getSS();
  let sheet   = ss.getSheetByName(SHEET_PENYIRAMAN);
  if (!sheet) { sheet = ss.insertSheet(SHEET_PENYIRAMAN); setupHeaderPenyiraman(sheet); }
  if (sheet.getLastRow() === 0) setupHeaderPenyiraman(sheet);
  const row = buildRowPenyiraman(dummy);
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
  formatLastRowPenyiraman(sheet, dummy);
  Logger.log("✅ Test insert Penyiraman berhasil.");
}

// TOHUDAN 18: instalasi Drip biasa (per varian) DITAMBAH 1 instalasi Dutch Bucket —
// baris drip dan baris DB dikirim sekaligus dalam satu submit, dibedakan via kolom varian.
function testInsertDB() {
  const ss    = getSS();
  let sheet   = ss.getSheetByName(SHEET_PENYIRAMAN);
  if (!sheet) { sheet = ss.insertSheet(SHEET_PENYIRAMAN); setupHeaderPenyiraman(sheet); }
  if (sheet.getLastRow() === 0) setupHeaderPenyiraman(sheet);

  const common = {
    action: "submitPenyiraman",
    tanggal: "08/04/2026",
    operator: "Dedy",
    tipe: "Drip (Tohudan/Bergas)",
    gh: "TOHUDAN 18",
    nutrisi: "AB Mix",
    client_timestamp: new Date().toISOString(),
  };

  const dripRow = {
    ...common,
    varian: "Elysia",
    ecIn: "2.1", ecOut: "3.2", phIn: "6.1", phOut: "6.5",
    volume: "250", volNutrisi: "100", suhu: "28.5", rh: "75",
    ecTandon: "", ecBucket: "", phTandon: "", phBucket: "", doTandon: "", doBucket: "",
  };
  const dbRow = {
    ...common,
    varian: "Dutch Bucket",
    ecIn: "", ecOut: "", phIn: "", phOut: "", volume: "",
    volNutrisi: "50", suhu: "29.0", rh: "72",
    ecTandon: "2.5", ecBucket: "2.8",
    phTandon: "6.0", phBucket: "6.3",
    doTandon: "7.1", doBucket: "6.9",
  };

  [dripRow, dbRow].forEach(dummy => {
    const row = buildRowPenyiraman(dummy);
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
    formatLastRowPenyiraman(sheet, dummy);
  });
  Logger.log("✅ Test insert TOHUDAN 18 (Drip + Dutch Bucket) berhasil.");
}

function testInsertSawahan() {
  const dummy = {
    action: "submitPenyiraman",
    tanggal: "08/04/2026",
    operator: "Dedy",
    tipe: "Kolam (Sawahan)",
    gh: "SAWAHAN 3",
    ecIn: "1.8", ecOut: "2.5", phIn: "6.2", phOut: "6.7",
    volume: "300", volNutrisi: "80",
    suhu: "28.5, 29.0, 28.8, 29.1", rh: "74, 75, 76, 74",
    ecTandon: "", ecBucket: "", phTandon: "", phBucket: "", doTandon: "", doBucket: "",
    client_timestamp: new Date().toISOString(),
  };
  const ss    = getSS();
  let sheet   = ss.getSheetByName(SHEET_PENYIRAMAN);
  if (!sheet) { sheet = ss.insertSheet(SHEET_PENYIRAMAN); setupHeaderPenyiraman(sheet); }
  if (sheet.getLastRow() === 0) setupHeaderPenyiraman(sheet);
  const row = buildRowPenyiraman(dummy);
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
  formatLastRowPenyiraman(sheet, dummy);
  Logger.log("✅ Test insert Sawahan berhasil.");
}
