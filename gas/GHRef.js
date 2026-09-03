// ============================================================
// Google Apps Script — GH Reference Data
// Spreadsheet: https://docs.google.com/spreadsheets/d/1tIJzuTBXcM7Wks03pgsyVicJUCtDs9Ak0N89K9GlKe4
// Sheet tab  : gid=385669064
//
// CARA DEPLOY:
//   1. Buka script.google.com → New project → paste kode ini
//   2. Klik Deploy → New deployment → Web app
//      Execute as: Me | Who has access: Anyone
//   3. Klik Deploy → copy URL
//   4. Tambahkan ke Vercel Env: VITE_GAS_GHREF_URL=<url>
//
// ENDPOINT:
//   GET  ?action=getGH            → { success, data, produksi, semai }
//   GET  ?action=getGHRestartLog  → { success, data: [{timestamp,gh,periode,aksi,alasan}, ...] }
//   POST { action:"submitGHRestart", gh, periode, aksi, alasan, client_timestamp }
//        → tulis ke sheet "GH Restart" (dipakai tombol emergency shutdown/restart
//          di app operator, juga jadi sumber data dashboard monitoring terpisah)
// ============================================================

const SS_ID   = "1tIJzuTBXcM7Wks03pgsyVicJUCtDs9Ak0N89K9GlKe4";
const REF_GID = 1769062373;

// Sheet "GH Restart" — log all-time shutdown/restart GH, dibuat otomatis di
// spreadsheet SS_ID yang sama kalau belum ada. Dipakai juga sebagai sumber
// data untuk dashboard monitoring project lain.
const RESTART_SHEET = "GH Restart";

// Spreadsheet "REF OPERATOR" — beda file dari SS_ID di atas. Dibaca langsung
// pakai openById (tidak perlu di-bind / publish-to-web), khusus untuk jadwal
// harian Koor GH.
const DAILY_TASK_SS_ID    = "16DLPD-_Zsl1g4FJ4jFsWUYHVCdZvgonO9qf1b5qS3D4";
const DAILY_TASK_SHEET    = "DAILY TASK";

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

// ============================================================
// doGet
// ============================================================
function doGet(e) {
  const action = (e.parameter || {}).action;
  if (!checkRateLimit()) return jsonResponse({ success: false, error: "Terlalu banyak request, coba lagi sebentar." });
  if (!checkAppToken((e.parameter || {}).token)) return jsonResponse({ success: false, error: "Unauthorized" });
  if (action === "getGH")            return jsonResponse(getGHData());
  if (action === "getDailyTask")     return jsonResponse(getDailyTaskData(e));
  if (action === "getGHRestartLog")  return jsonResponse(getGHRestartLog());
  return jsonResponse({ success: true, app: "GHRef GAS", status: "active" });
}

// ============================================================
// doPost
// ============================================================
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (!checkRateLimit()) return jsonResponse({ success: false, error: "Terlalu banyak request, coba lagi sebentar." });
    if (!checkAppToken(data.token)) return jsonResponse({ success: false, error: "Unauthorized" });
    if (data.action === "submitGHRestart") return jsonResponse(handleSubmitGHRestart(data));
    return jsonResponse({ success: false, error: "Action tidak dikenal: " + data.action });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

// ============================================================
// handleSubmitGHRestart — tulis baris ke sheet "GH Restart"
// ============================================================
function handleSubmitGHRestart(d) {
  if (!d.gh)     return { success: false, error: "GH wajib diisi" };
  if (!d.aksi)   return { success: false, error: "Aksi wajib diisi" };
  if (!d.alasan) return { success: false, error: "Alasan wajib diisi" };

  const ss    = SpreadsheetApp.openById(SS_ID);
  let sheet   = ss.getSheetByName(RESTART_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(RESTART_SHEET);
    setupHeaderGHRestart(sheet);
  }
  if (sheet.getLastRow() === 0) setupHeaderGHRestart(sheet);

  const tsDate = d.client_timestamp ? new Date(d.client_timestamp) : new Date();
  const tz     = "Asia/Jakarta";
  const row = [
    Utilities.formatDate(tsDate, tz, "yyyy-MM-dd HH:mm:ss"),
    d.gh || "",
    d.periode || "",
    d.aksi || "",
    d.alasan || "",
  ];

  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, 1, row.length).setValues([row]);

  const aksiCell = sheet.getRange(lastRow + 1, 4);
  if (String(d.aksi).toUpperCase() === "SHUTDOWN") {
    aksiCell.setBackground("#ffcdd2").setFontColor("#b71c1c").setFontWeight("bold");
  } else {
    aksiCell.setBackground("#c8e6c9").setFontColor("#1b5e20").setFontWeight("bold");
  }

  return { success: true };
}

// ============================================================
// getGHRestartLog — baca sheet "GH Restart", kembalikan semua baris (terbaru duluan)
// ============================================================
function getGHRestartLog() {
  try {
    const ss    = SpreadsheetApp.openById(SS_ID);
    const sheet = ss.getSheetByName(RESTART_SHEET);
    if (!sheet || sheet.getLastRow() < 2) return { success: true, data: [] };

    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
    const data = rows.map(function (r) {
      return {
        timestamp: String(r[0] || ""),
        gh:        String(r[1] || ""),
        periode:   String(r[2] || ""),
        aksi:      String(r[3] || ""),
        alasan:    String(r[4] || ""),
      };
    }).reverse();

    return { success: true, data: data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Setup header sheet "GH Restart" ───────────────────────────
function setupHeaderGHRestart(sheet) {
  const headers = ["Timestamp", "Nama GH", "Periode", "Aksi", "Alasan"];
  sheet.appendRow(headers);
  sheet.setFrozenRows(1);

  const hRange = sheet.getRange(1, 1, 1, headers.length);
  hRange.setBackground("#c62828").setFontColor("#ffffff").setFontWeight("bold").setFontSize(10);

  sheet.setColumnWidth(1, 155);
  sheet.setColumnWidth(2, 130);
  sheet.setColumnWidth(3, 90);
  sheet.setColumnWidth(4, 100);
  sheet.setColumnWidth(5, 300);
}

// ============================================================
// getDailyTaskData — baca sheet "DAILY TASK", filter operator + hari ini
// ?action=getDailyTask&operator=Zaman
// ============================================================
function getDailyTaskData(e) {
  try {
    const operator = ((e && e.parameter && e.parameter.operator) || "").trim().toLowerCase();
    if (!operator) return { success: false, error: "Parameter operator wajib diisi" };

    const ss    = SpreadsheetApp.openById(DAILY_TASK_SS_ID);
    const sheet = ss.getSheetByName(DAILY_TASK_SHEET);
    if (!sheet) return { success: false, error: "Sheet '" + DAILY_TASK_SHEET + "' tidak ditemukan" };

    const rows = sheet.getDataRange().getValues();
    if (rows.length < 2) return { success: true, tasks: [] };

    const headers = rows[0].map(function(h) { return String(h).trim().toLowerCase(); });
    const iTanggal = headers.indexOf("tanggal");
    const iOperator = headers.indexOf("operator");
    const iGH = headers.indexOf("gh");
    const iMenu = headers.indexOf("menu");
    const iJamMulai = headers.indexOf("jam mulai");
    const iJamSelesai = headers.indexOf("jam selesai");

    const tz = "Asia/Jakarta";
    const todayStr = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");

    const tasks = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowOperator = String(row[iOperator] || "").trim().toLowerCase();
      if (rowOperator !== operator) continue;

      const tglRaw = row[iTanggal];
      if (!(tglRaw instanceof Date)) continue; // kolom Tanggal harus Date asli
      const tglStr = Utilities.formatDate(tglRaw, tz, "yyyy-MM-dd");
      if (tglStr !== todayStr) continue;

      tasks.push({
        gh:          iGH >= 0 ? String(row[iGH] || "").trim() : "",
        menu:        iMenu >= 0 ? String(row[iMenu] || "").trim() : "",
        jamMulai:    iJamMulai >= 0 ? formatJam(row[iJamMulai]) : "",
        jamSelesai:  iJamSelesai >= 0 ? formatJam(row[iJamSelesai]) : "",
      });
    }

    return { success: true, tasks: tasks };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Kolom Jam Mulai/Selesai biasanya kebaca sebagai Date (jam) oleh Sheets
function formatJam(val) {
  if (!val) return "";
  if (val instanceof Date) return Utilities.formatDate(val, "Asia/Jakarta", "HH.mm");
  return String(val).trim();
}

// ============================================================
// getGHData — baca REF sheet, kembalikan data GH terstruktur
// ============================================================
function getGHData() {
  try {
    const ss    = SpreadsheetApp.openById(SS_ID);
    const sheet = getSheetByGid(ss, REF_GID);
    if (!sheet) throw new Error("Sheet tidak ditemukan (gid=" + REF_GID + ")");

    const rows = sheet.getDataRange().getValues();
    if (rows.length < 2) return { success: true, data: {}, produksi: {}, semai: {} };

    // ── Cari indeks kolom dari baris header ──
    const headers  = rows[0].map(function(h) { return String(h).trim().toLowerCase(); });
    const iGH      = findCol(headers, ["greenhouse", "gh", "nama gh"]);
    const iPeriode = findCol(headers, ["periode", "period"]);
    const iBaris   = findCol(headers, ["baris"]);
    const iVarian  = findCol(headers, ["varian", "true var", "varietas"]);
    const iTanam   = findCol(headers, ["tanam", "bulan tanam", "tgl tanam"]);

    if (iGH < 0) throw new Error("Kolom Greenhouse tidak ditemukan. Header: " + headers.join(", "));

    // ── Pass 1: cari periode terbaru per GH ──
    var latestPeriode = {};
    var latestTanam   = {};
    for (var r = 1; r < rows.length; r++) {
      var gh      = String(rows[r][iGH]      || "").trim();
      var periode = String(rows[r][iPeriode] || "").trim();
      var tanam   = iTanam >= 0 ? formatDateISO(rows[r][iTanam]) : "";
      if (!gh || !periode) continue;
      var pNew = parseFloat(periode);
      var pOld = parseFloat(latestPeriode[gh] !== undefined ? latestPeriode[gh] : "-1");
      if (!isNaN(pNew) && pNew > pOld) {
        latestPeriode[gh] = periode;
        latestTanam[gh]   = tanam;
      }
    }

    // ── Pass 2: kumpulkan baris per GH (periode terbaru saja) ──
    var map = {};
    for (var r2 = 1; r2 < rows.length; r2++) {
      var gh2      = String(rows[r2][iGH]       || "").trim();
      var periode2 = String(rows[r2][iPeriode]  || "").trim();
      var baris2   = iBaris  >= 0 ? String(rows[r2][iBaris]  || "").trim() : "";
      var varian2  = iVarian >= 0 ? String(rows[r2][iVarian] || "").trim() : "";
      if (!gh2 || !periode2) continue;
      if (periode2 !== latestPeriode[gh2]) continue;

      if (!map[gh2]) {
        map[gh2] = {
          periode: latestPeriode[gh2],
          tanam:   latestTanam[gh2] || "",
          baris:   [],
          _varSet: {},
        };
      }
      if (baris2 && !map[gh2].baris.find(function(b) { return b.baris === baris2; })) {
        map[gh2].baris.push({ baris: baris2, varian: varian2 });
        if (varian2) map[gh2]._varSet[varian2] = true;
      }
    }

    // ── Susun output final ──
    var data     = {};
    var produksi = {};
    var semai    = {};

    Object.keys(map).forEach(function(gh) {
      var entry = {
        periode: map[gh].periode,
        tanam:   map[gh].tanam,
        baris:   map[gh].baris,
        varian:  Object.keys(map[gh]._varSet),
      };
      data[gh] = entry;

      var upper = gh.toUpperCase();
      if (upper.indexOf("SEMAI") === 0 || upper.indexOf("NURSERY") === 0) {
        semai[gh] = entry;
      } else {
        produksi[gh] = entry;
      }
    });

    // ── Tambahan: GH yang HANYA ada di sheet "REF RND" (mis. Sawahan Tunnel,
    // Open Field 1) — kalau GH-nya sudah ada dari REF utama (mis. Tohudan 22),
    // tidak ditimpa supaya tidak ganggu yang sudah jalan.
    var rndSheet = ss.getSheetByName("REF RND");
    if (rndSheet) {
      var rndRows = rndSheet.getDataRange().getValues();
      var rndMap  = buildRndMap(rndRows);
      Object.keys(rndMap).forEach(function(gh) {
        if (data[gh]) return;
        data[gh]     = rndMap[gh];
        produksi[gh] = rndMap[gh];
      });
    }

    return { success: true, data: data, produksi: produksi, semai: semai };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ============================================================
// buildRndMap — baca sheet "REF RND", kolom:
// Greenhouse(A) Periode(B) GH Code(C) Sample Code(D) Var Code(E)
// Baris(F) Varian(G) True Var(H) Tanam(I)
// ============================================================
function buildRndMap(rows) {
  if (rows.length < 2) return {};

  var latestPeriode = {};
  var latestTanam   = {};
  for (var r = 1; r < rows.length; r++) {
    var gh      = String(rows[r][0] || "").trim();
    var periode = String(rows[r][1] || "").trim();
    var tanam   = formatDateISO(rows[r][8]);
    if (!gh || !periode) continue;
    var pNew = parseFloat(periode);
    var pOld = parseFloat(latestPeriode[gh] !== undefined ? latestPeriode[gh] : "-1");
    if (!isNaN(pNew) && pNew > pOld) {
      latestPeriode[gh] = periode;
      latestTanam[gh]   = tanam;
    }
  }

  var map = {};
  for (var r2 = 1; r2 < rows.length; r2++) {
    var gh2      = String(rows[r2][0] || "").trim();
    var periode2 = String(rows[r2][1] || "").trim();
    var baris2   = String(rows[r2][5] || "").trim();
    var varian2  = String(rows[r2][7] || "").trim(); // True Var
    if (!gh2 || !periode2) continue;
    if (periode2 !== latestPeriode[gh2]) continue;

    if (!map[gh2]) {
      map[gh2] = { periode: latestPeriode[gh2], tanam: latestTanam[gh2] || "", baris: [], _varSet: {} };
    }
    if (baris2 && !map[gh2].baris.find(function(b) { return b.baris === baris2; })) {
      map[gh2].baris.push({ baris: baris2, varian: varian2 });
      if (varian2) map[gh2]._varSet[varian2] = true;
    }
  }

  var result = {};
  Object.keys(map).forEach(function(gh) {
    result[gh] = {
      periode: map[gh].periode,
      tanam:   map[gh].tanam,
      baris:   map[gh].baris,
      varian:  Object.keys(map[gh]._varSet),
    };
  });
  return result;
}

// ── Helper: format nilai tanggal dari Sheets → "yyyy-MM-dd" ──
// getValues() mengembalikan JS Date untuk cell bertipe Date, bukan string.
function formatDateISO(val) {
  if (!val) return "";
  if (val instanceof Date && !isNaN(val.getTime())) {
    return Utilities.formatDate(val, "Asia/Jakarta", "yyyy-MM-dd");
  }
  // Sudah berupa string (sel teks)
  return String(val).trim();
}

// ── Helper: cari kolom pertama yang cocok dari daftar kandidat ──
function findCol(headers, candidates) {
  for (var i = 0; i < candidates.length; i++) {
    var idx = headers.indexOf(candidates[i]);
    if (idx >= 0) return idx;
  }
  // Coba partial match
  for (var j = 0; j < candidates.length; j++) {
    for (var k = 0; k < headers.length; k++) {
      if (headers[k].indexOf(candidates[j]) >= 0) return k;
    }
  }
  return -1;
}

// ── Helper: cari sheet berdasarkan gid ──
function getSheetByGid(ss, gid) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === gid) return sheets[i];
  }
  return null;
}

// ── Helper: JSON response ──
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// testGetGH — jalankan dari editor untuk uji coba
// ============================================================
function testGetGH() {
  const result = getGHData();
  Logger.log("GH count: " + Object.keys(result.data || {}).length);
  Logger.log("Produksi: " + Object.keys(result.produksi || {}).join(", "));
  Logger.log("Semai   : " + Object.keys(result.semai    || {}).join(", "));
  if (result.error) Logger.log("Error: " + result.error);
}
