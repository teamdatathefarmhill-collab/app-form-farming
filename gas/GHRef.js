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
//   GET ?action=getGH  → { success, data, produksi, semai }
// ============================================================

const SS_ID   = "1tIJzuTBXcM7Wks03pgsyVicJUCtDs9Ak0N89K9GlKe4";
const REF_GID = 1769062373;

// ============================================================
// doGet
// ============================================================
function doGet(e) {
  const action = (e.parameter || {}).action;
  if (action === "getGH") return jsonResponse(getGHData());
  return jsonResponse({ success: true, app: "GHRef GAS", status: "active" });
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

    return { success: true, data: data, produksi: produksi, semai: semai };
  } catch (err) {
    return { success: false, error: err.message };
  }
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
