// ============================================================
//  FARMHILL — GAS Script: Gramasi
//
//  Sheet Referensi: (sesuai kolom yang ada)
//  GH | PERIODE | BARIS | BARIS REAL | VARIAN | AWAL TANAM | HST
//
//  Sheet Output: "Data Coba"
//  Tanggal | GH | Periode | HST | Baris | Varian | S1 | S2 | S3 | Avg | Operator | Keterangan
// ============================================================

const SPREADSHEET_ID = "1RgwLEH-0AVpBWTwyoDwStz2DbBrq2VNi5j66vtX4PhA";
const SHEET_OUTPUT   = "Data Coba";

// ── CORS helper ─────────────────────────────────────────────
function makeResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
//  GET — ?action=getGH | ?action=getSubmittedToday&tanggal=20/05/2026
//       | ?action=getLastGramasi&gh=TOHUDAN%201&tanggal=20/05/2026
// ============================================================
function doGet(e) {
  const action = e.parameter.action;
  if (action === "getGH")             return handleGetGH();
  // ✅ FIX: teruskan e supaya handleGetSubmittedToday bisa baca parameter tanggal
  if (action === "getSubmittedToday") return handleGetSubmittedToday(e);
  if (action === "getLastGramasi")    return handleGetLastGramasi(e);
  return makeResponse({ success: false, message: "Action tidak dikenal" });
}

// ============================================================
//  POST — action: submitGramasiBatch | submitGramasi (fallback)
// ============================================================
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    if (payload.action === "submitGramasiBatch") return handleSubmitGramasiBatch(payload);
    if (payload.action === "submitGramasi")      return handleSubmitGramasi(payload);
    return makeResponse({ success: false, message: "Action tidak dikenal" });
  } catch (err) {
    return makeResponse({ success: false, message: err.toString() });
  }
}

// ============================================================
//  handleGetSubmittedToday
//  Return daftar GH yang sudah disubmit hari ini
//
//  ✅ FIX: Terima e sebagai parameter supaya bisa pakai tanggal dari client.
//  Kalau client kirim ?tanggal=20/05/2026, pakai itu.
//  Kalau tidak ada, fallback ke tanggal server (Jakarta timezone).
//  Selalu kembalikan field "tanggal" di response supaya client bisa validasi.
// ============================================================
function handleGetSubmittedToday(e) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_OUTPUT);

    // ✅ FIX: Ambil tanggal dari parameter client, fallback ke server date
    const serverToday = Utilities.formatDate(new Date(), "Asia/Jakarta", "dd/MM/yyyy");
    const clientDate  = e && e.parameter && e.parameter.tanggal
      ? e.parameter.tanggal.trim()
      : null;

    // Prioritaskan tanggal dari client (sudah di-format dd/MM/yyyy dari todayISO)
    // tapi kalau tidak cocok dengan server (beda hari), pakai server sebagai safety net
    const today = clientDate || serverToday;

    // Log untuk debugging kalau ada mismatch
    if (clientDate && clientDate !== serverToday) {
      Logger.log(`[WARN] Tanggal client (${clientDate}) beda dengan server (${serverToday}). Pakai: ${today}`);
    }

    if (!sheet || sheet.getLastRow() < 2) {
      return makeResponse({ success: true, submitted: [], tanggal: today });
    }

    const data    = sheet.getDataRange().getValues();
    const headers = data[0].map(h => h.toString().trim().toLowerCase());

    const iTanggal = headers.indexOf("tanggal");
    const iGH      = headers.indexOf("gh");

    if (iTanggal === -1 || iGH === -1) {
      return makeResponse({ success: true, submitted: [], tanggal: today });
    }

    const submitted = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const tgl = row[iTanggal];
      const gh  = row[iGH]?.toString().trim();

      if (!gh) continue;

      // ✅ FIX: Normalisasi tanggal dari sheet
      // Sheets kadang simpan sebagai Date object (kalau auto-detected),
      // kadang string. Handle keduanya dengan konsisten.
      const formattedTgl = normalizeTanggal(tgl);

      if (formattedTgl === today && !submitted.includes(gh)) {
        submitted.push(gh);
      }
    }

    // ✅ FIX: Selalu kembalikan tanggal yang dipakai, supaya client bisa validasi
    return makeResponse({ success: true, submitted, tanggal: today });

  } catch (err) {
    return makeResponse({ success: false, message: err.toString(), submitted: [] });
  }
}

// ============================================================
//  handleGetLastGramasi
//  Ambil data submission TERAKHIR (sebelum tanggal hari ini) per baris,
//  dipakai client untuk bandingkan kenaikan/penurunan ekstrem dibanding
//  pengukuran sebelumnya (boleh beda berapa hari pun, tetap dibandingkan
//  ke yang paling baru sebelum hari ini).
//
//  ?action=getLastGramasi&gh=TOHUDAN%201&tanggal=20/05/2026
// ============================================================
function handleGetLastGramasi(e) {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_OUTPUT);

    const gh = (e && e.parameter && e.parameter.gh) ? e.parameter.gh.trim() : "";
    if (!gh) return makeResponse({ success: false, message: "Parameter gh wajib diisi" });

    const today = (e && e.parameter && e.parameter.tanggal)
      ? e.parameter.tanggal.trim()
      : Utilities.formatDate(new Date(), "Asia/Jakarta", "dd/MM/yyyy");

    if (!sheet || sheet.getLastRow() < 2) {
      return makeResponse({ success: true, data: {} });
    }

    const data    = sheet.getDataRange().getValues();
    const headers = data[0].map(h => h.toString().trim().toLowerCase());

    const iTanggal = headers.indexOf("tanggal");
    const iGH      = headers.indexOf("gh");
    const iBaris   = headers.indexOf("baris");
    const iVarian  = headers.indexOf("varian");
    const iS1      = headers.indexOf("sampel 1");
    const iS2      = headers.indexOf("sampel 2");
    const iS3      = headers.indexOf("sampel 3");
    const iAvg     = headers.indexOf("avg");

    if ([iTanggal, iGH, iBaris, iAvg].includes(-1)) {
      return makeResponse({ success: true, data: {} });
    }

    // latest[baris] = { varian, s1, s2, s3, avg, tanggal, _sortDate }
    const latest = {};

    for (let i = 1; i < data.length; i++) {
      const row   = data[i];
      const rowGh = (row[iGH] || "").toString().trim();
      if (rowGh.toUpperCase() !== gh.toUpperCase()) continue;

      const baris = (row[iBaris] || "").toString().trim();
      if (!baris) continue;

      const tglFormatted = normalizeTanggal(row[iTanggal]);
      if (!tglFormatted || tglFormatted === today) continue; // skip data hari ini

      const tglDate = parseDDMMYYYY(tglFormatted);
      if (!tglDate) continue;

      const existing = latest[baris];
      if (!existing || tglDate.getTime() > existing._sortDate.getTime()) {
        latest[baris] = {
          varian:    iVarian !== -1 ? (row[iVarian] || "").toString().trim() : "",
          s1:        iS1 !== -1 ? toNumberSafe(row[iS1]) : null,
          s2:        iS2 !== -1 ? toNumberSafe(row[iS2]) : null,
          s3:        iS3 !== -1 ? toNumberSafe(row[iS3]) : null,
          avg:       toNumberSafe(row[iAvg]),
          tanggal:   tglFormatted,
          _sortDate: tglDate,
        };
      }
    }

    // Bersihkan field internal (_sortDate) sebelum dikirim ke client
    const result = {};
    Object.keys(latest).forEach(b => {
      const { _sortDate, ...rest } = latest[b];
      result[b] = rest;
    });

    return makeResponse({ success: true, data: result });

  } catch (err) {
    return makeResponse({ success: false, message: err.toString() });
  }
}

// ============================================================
//  handleGetGH
// ============================================================
function handleGetGH() {
  try {
    const ss     = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheets = ss.getSheets();

    let refSheet = null;

    for (const sh of sheets) {
      if (sh.getName() === SHEET_OUTPUT) continue;
      const firstRow = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
      const headers  = firstRow.map(h => h.toString().trim().toUpperCase());
      if (headers.includes("GH") && headers.includes("REAL BARIS")) {
        refSheet = sh;
        break;
      }
    }

    if (!refSheet) {
      return makeResponse({
        success: false,
        message: "Sheet referensi tidak ditemukan. Pastikan ada sheet dengan kolom GH dan BARIS REAL."
      });
    }

    const data    = refSheet.getDataRange().getValues();
    const headers = data[0].map(h => h.toString().trim().toUpperCase());

    const iGH        = headers.indexOf("GH");
    const iPeriode   = headers.indexOf("PERIODE");
    const iBaris     = headers.indexOf("BARIS");
    const iBarisReal = headers.indexOf("REAL BARIS");
    const iVarian    = headers.indexOf("VARIAN");
    const iTanam     = headers.indexOf("AWAL TANAM");

    if ([iGH, iPeriode, iBarisReal, iVarian, iTanam].includes(-1)) {
      return makeResponse({
        success: false,
        message: `Header tidak lengkap di sheet "${refSheet.getName()}". Kolom wajib: GH, PERIODE, REAL BARIS, VARIAN, AWAL TANAM`
      });
    }

    const result = {};

    for (let i = 1; i < data.length; i++) {
      const row       = data[i];
      const gh        = row[iGH]?.toString().trim();
      const barisReal = row[iBarisReal]?.toString().trim();
      const baris     = iBaris !== -1 ? row[iBaris]?.toString().trim() : barisReal;
      const varian    = row[iVarian]?.toString().trim();

      if (!gh || !barisReal) continue;

      if (!result[gh]) {
        result[gh] = {
          periode: row[iPeriode]?.toString().trim() || "",
          tanam:   formatTanggal(row[iTanam]),
          baris:   []
        };
      }

      result[gh].baris.push({
        baris:  barisReal,
        urut:   baris,
        varian: varian || ""
      });
    }

    return makeResponse({ success: true, data: result });

  } catch (err) {
    return makeResponse({ success: false, message: err.toString() });
  }
}

// ============================================================
//  handleSubmitGramasiBatch
//  Tulis banyak baris sekaligus ke sheet "Data Coba"
// ============================================================
function handleSubmitGramasiBatch(payload) {
  const lock = LockService.getScriptLock();
  lock.tryLock(30000);

  try {
    const rows = payload.rows || [];
    if (rows.length === 0) {
      return makeResponse({ success: false, message: "Tidak ada data yang dikirim" });
    }

    const sheet = getOrCreateSheet();

    const allRows = rows.map(r => [
      r.tanggal    || "",
      r.gh         || "",
      r.periode    || "",
      toNumber(r.hst),
      r.baris      || "",
      r.varian     || "",
      toNumber(r.s1),
      toNumber(r.s2),
      toNumber(r.s3),
      toNumber(r.avg),
      r.operator   || "",
      r.keterangan || "",
    ]);

    sheet.getRange(sheet.getLastRow() + 1, 1, allRows.length, allRows[0].length).setValues(allRows);

    return makeResponse({ success: true, count: allRows.length });

  } catch (err) {
    return makeResponse({ success: false, message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
//  handleSubmitGramasi — single row (fallback)
// ============================================================
function handleSubmitGramasi(payload) {
  const lock = LockService.getScriptLock();
  lock.tryLock(30000);

  try {
    const sheet = getOrCreateSheet();

    sheet.appendRow([
      payload.tanggal    || "",
      payload.gh         || "",
      payload.periode    || "",
      toNumber(payload.hst),
      payload.baris      || "",
      payload.varian     || "",
      toNumber(payload.s1),
      toNumber(payload.s2),
      toNumber(payload.s3),
      toNumber(payload.avg),
      payload.operator   || "",
      payload.keterangan || "",
    ]);

    return makeResponse({ success: true, message: `Baris ${payload.baris} tersimpan` });

  } catch (err) {
    return makeResponse({ success: false, message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
//  getOrCreateSheet
//  Ambil sheet output, buat + header kalau belum ada
// ============================================================
function getOrCreateSheet() {
  const ss  = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_OUTPUT);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_OUTPUT);
    const headers = [
      "Tanggal", "GH", "Periode", "HST", "Baris", "Varian",
      "Sampel 1", "Sampel 2", "Sampel 3", "Avg", "Operator", "Keterangan"
    ];
    sheet.appendRow(headers);
    const hr = sheet.getRange(1, 1, 1, headers.length);
    hr.setFontWeight("bold").setBackground("#2e7d32").setFontColor("#ffffff");
    sheet.setFrozenRows(1);
    return sheet;
  }

  // Pastikan kolom Keterangan sudah ada
  const firstRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const headers  = firstRow.map(h => h.toString().trim().toLowerCase());
  if (!headers.includes("keterangan")) {
    const nextCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, nextCol).setValue("Keterangan")
      .setFontWeight("bold").setBackground("#2e7d32").setFontColor("#ffffff");
  }

  return sheet;
}

// ============================================================
//  Helpers
// ============================================================
function toNumber(val) {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

// Seperti toNumber, tapi balikin null kalau kosong/invalid (bukan 0) —
// supaya "tidak ada data sebelumnya" tidak ketuker sama "nilainya 0".
function toNumberSafe(val) {
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function formatTanggal(val) {
  if (!val) return "";
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return val.toString().trim();
}

// Normalisasi nilai tanggal dari sheet (Date object ATAU string) → "dd/MM/yyyy"
function normalizeTanggal(val) {
  if (!val) return "";
  if (val instanceof Date) {
    return Utilities.formatDate(val, "Asia/Jakarta", "dd/MM/yyyy");
  }
  const raw = val.toString().trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const parts = raw.substring(0, 10).split("-");
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return raw;
}

// Parse string "dd/MM/yyyy" → Date object (buat sorting/cari yang terbaru)
function parseDDMMYYYY(str) {
  const parts = str.split("/");
  if (parts.length !== 3) return null;
  const d = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const y = parseInt(parts[2], 10);
  if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
  const dt = new Date(y, m, d);
  return isNaN(dt.getTime()) ? null : dt;
}

// ============================================================
//  Test functions
// ============================================================
function testGetSubmittedToday() {
  // ✅ Simulate e object dengan tanggal hari ini
  const fakeE = { parameter: { tanggal: Utilities.formatDate(new Date(), "Asia/Jakarta", "dd/MM/yyyy") } };
  const result = handleGetSubmittedToday(fakeE);
  Logger.log(result.getContent());
}

function testGetSubmittedTodayNoParam() {
  // Test tanpa parameter (fallback ke server date)
  const result = handleGetSubmittedToday(null);
  Logger.log(result.getContent());
}

function testGetLastGramasi() {
  const fakeE = { parameter: { gh: "TOHUDAN 1", tanggal: Utilities.formatDate(new Date(), "Asia/Jakarta", "dd/MM/yyyy") } };
  const result = handleGetLastGramasi(fakeE);
  Logger.log(result.getContent());
}

function testSubmitDummy() {
  const dummy = {
    action:      "submitGramasi",
    tanggal:     "01/01/2025",
    gh:          "GH-TEST",
    periode:     "1",
    hst:         35,
    baris:       "A",
    varian:      "Sunray",
    s1:          120,
    s2:          130,
    s3:          125,
    avg:         125,
    operator:    "Test Operator",
    keterangan:  "ganti sampel dari kemarin",
  };
  const result = handleSubmitGramasi(dummy);
  Logger.log(result.getContent());
}

function testSubmitBatchDummy() {
  const dummy = {
    action: "submitGramasiBatch",
    rows: [
      { tanggal: "01/01/2025", gh: "GH-TEST", periode: "1", hst: 35, baris: "A", varian: "Sunray", s1: 120, s2: 130, s3: 125, avg: 125, operator: "Test", keterangan: "" },
      { tanggal: "01/01/2025", gh: "GH-TEST", periode: "1", hst: 35, baris: "B", varian: "Elysia", s1: 110, s2: 115, s3: 112, avg: 112.33, operator: "Test", keterangan: "" },
    ]
  };
  const result = handleSubmitGramasiBatch(dummy);
  Logger.log(result.getContent());
}
