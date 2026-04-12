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
const SS_REF_ID        = "1tIJzuTBXcM7Wks03pgsyVicJUCtDs9Ak0N89K9GlKe4"; // Spreadsheet REF

// ── Cache global (hidup selama instance GAS warm) ────────────
let _ss     = null;
let _ssRef  = null;

function getSS()    { if (!_ss)    _ss    = SpreadsheetApp.getActiveSpreadsheet(); return _ss; }
function getSSRef() { if (!_ssRef) _ssRef = SpreadsheetApp.openById(SS_REF_ID);   return _ssRef; }

// ── Entry point POST ─────────────────────────────────────────
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === "submitPenyiraman") return handlePenyiraman(data);
    return jsonError("Action tidak dikenal: " + data.action);
  } catch (err) {
    return jsonError(err.toString());
  }
}

// ── Entry point GET ──────────────────────────────────────────
function doGet(e) {
  const action = e?.parameter?.action;
  if (action === "getREF") return handleGetREF();
  return ContentService
    .createTextOutput(JSON.stringify({ status: "ok", message: "GAS Penyiraman aktif." }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Handler: Get REF Data ────────────────────────────────────
function handleGetREF() {
  try {
    const ss    = getSSRef();
    const sheet = ss.getSheetByName("REF");
    if (!sheet) return jsonError("Sheet 'REF' tidak ditemukan.");

    const rows = sheet.getRange("A:L").getValues();
    if (rows.length < 2) return jsonError("Sheet REF kosong.");

    const ghMap = {};

    for (let i = 1; i < rows.length; i++) {
      const gh      = String(rows[i][0] || "").trim();
      const periode = parseFloat(rows[i][1]);
      const varian  = String(rows[i][8] || "").trim();
      const tanamRaw = rows[i][11];

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

      if (hst !== null && hst > 65) continue;

      data[gh] = {
        periode: entry.maxPeriode,
        tanam:   tanamStr,
        hst:     hst,
        varian:  Array.from(entry.varianSet).sort(),
      };
    }

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, data }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return jsonError("getREF error: " + err.toString());
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
  formatLastRowPenyiraman(sheet, data.tipe);

  return jsonOk();
}

// ── Build baris ──────────────────────────────────────────────
function buildRowPenyiraman(d) {
  // Pakai waktu submit operator jika ada (penting untuk data offline)
  const tsDate = d.client_timestamp ? new Date(d.client_timestamp) : new Date();
  const isDB = d.tipe === "Dutch Bucket";
  return [
    Utilities.formatDate(tsDate, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss"),
    d.tanggal   || "",
    d.operator  || "",
    d.tipe      || "",
    d.gh        || "",
    isDB ? "" : (d.varian || ""),

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
  for (let c = 6; c <= 19; c++) sheet.setColumnWidth(c, 110);
}

// ── Format baris baru ─────────────────────────────────────────
function formatLastRowPenyiraman(sheet, tipe) {
  const lastRow = sheet.getLastRow();
  const numCols = sheet.getLastColumn();

  const bg = lastRow % 2 === 0 ? "#e1f5fe" : "#ffffff";
  sheet.getRange(lastRow, 1, 1, numCols).setBackground(bg).setFontSize(10);

  const tipeCell = sheet.getRange(lastRow, 4);
  if (tipe === "Dutch Bucket") {
    tipeCell.setBackground("#fff3e0").setFontColor("#e65100").setFontWeight("bold");
  } else if (tipe === "Kolam (Sawahan)") {
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
  formatLastRowPenyiraman(sheet, dummy.tipe);
  Logger.log("✅ Test insert Penyiraman berhasil.");
}

function testInsertDB() {
  const dummy = {
    action: "submitPenyiraman",
    tanggal: "08/04/2026",
    operator: "Dedy",
    tipe: "Dutch Bucket",
    gh: "TOHUDAN 13",
    ecIn: "", ecOut: "", phIn: "", phOut: "", volume: "",
    volNutrisi: "50", suhu: "29.0", rh: "72",
    ecTandon: "2.5", ecBucket: "2.8",
    phTandon: "6.0", phBucket: "6.3",
    doTandon: "7.1", doBucket: "6.9",
    client_timestamp: new Date().toISOString(),
  };
  const ss    = getSS();
  let sheet   = ss.getSheetByName(SHEET_PENYIRAMAN);
  if (!sheet) { sheet = ss.insertSheet(SHEET_PENYIRAMAN); setupHeaderPenyiraman(sheet); }
  if (sheet.getLastRow() === 0) setupHeaderPenyiraman(sheet);
  const row = buildRowPenyiraman(dummy);
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
  formatLastRowPenyiraman(sheet, dummy.tipe);
  Logger.log("✅ Test insert Dutch Bucket berhasil.");
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
  formatLastRowPenyiraman(sheet, dummy.tipe);
  Logger.log("✅ Test insert Sawahan berhasil.");
}
