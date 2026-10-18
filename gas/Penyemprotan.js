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
    // Kolom pencampuran — ditaruh PALING AKHIR supaya data lama tidak bergeser
    "Pencampuran", "Nama Pestisida 2", "Konsentrasi 2", "Jumlah Pemakaian 2",
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

  // Rapikan spasi di semua isian teks (mis. "Kiki Triansyah " vs "Kiki Triansyah")
  Object.keys(data).forEach(function(k) {
    if (typeof data[k] === "string") data[k] = data[k].trim();
  });

  // Tolak submit yang tidak berisi data inti — supaya tidak ada baris kosong di sheet
  if (data.type === "oles_gsb" && !(data.gh && data.pestisida && data.penggunaan_gram)) {
    throw new Error("Data Oles GSB tidak lengkap");
  }
  if (data.type === "pemakaian_gas" && !(data.gh && data.gas_nomor && data.gas_peruntukan)) {
    throw new Error("Data Pemakaian Gas tidak lengkap (GH, Nomor Gas, Peruntukan wajib)");
  }
  if (data.type === "penggunaan_ambil" && !data.guna_nama_pestisida && !(data.ada_pengambilan && data.ambil_nama_pestisida)) {
    throw new Error("Data Penggunaan/Pengambilan tidak lengkap");
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
        data.guna_jenis_campuran     || "Tanpa Campuran",
        data.guna_nama_pestisida_2   || "",
        data.guna_konsentrasi_2      || "",
        data.guna_jumlah_pemakaian_2 || "",
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
// migratePenggunaanCampuran — DEPRECATED, pakai rapikanSheets() di bawah.
// Menambah 4 header kolom pencampuran ke sheet Penggunaan yang sudah ada
// (data lama tidak diubah; baris lama kolom barunya kosong).
// ============================================================
function migratePenggunaanCampuran() {
  const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName(SHEET.PENGGUNAAN);
  if (!sheet) throw new Error("Sheet Penggunaan belum ada — jalankan initSheets() dulu.");
  const headers = HEADER.PENGGUNAAN;
  const start   = headers.indexOf("Pencampuran") + 1;
  const newCols = headers.slice(start - 1);
  const range   = sheet.getRange(1, start, 1, newCols.length);
  range.setValues([newCols]);
  range.setBackground(HEADER_COLOR.PENGGUNAAN);
  range.setFontColor("#ffffff");
  range.setFontWeight("bold");
  range.setHorizontalAlignment("center");
  range.setWrap(true);
  Logger.log("✅ Header campuran ditambahkan mulai kolom " + start);
}

// ============================================================
// rapikanSheets — jalankan SATU KALI dari editor (menggantikan
// migratePenggunaanCampuran). Header sheet lama sudah ketinggalan dari kode,
// sedangkan baris data ditulis dengan beberapa layout berbeda sehingga kolom
// bergeser. Fungsi ini:
//   1. Backup tiap sheet → "bak_<waktu>_<nama>" (hapus manual kalau sudah yakin)
//   2. Petakan semua baris lama ke layout HEADER terbaru
//   3. Pindahkan isian gas yang nyasar di sheet Pengambilan → Pemakaian Gas
//   4. Buang baris kosong/duplikat persis/baris test, urutkan per Timestamp
//   5. Rapikan format: header, freeze, filter, lebar kolom, kolom sisa dihapus
// ============================================================
const _TZ = "Asia/Jakarta";

function _s(v) {
  if (v instanceof Date) return Utilities.formatDate(v, _TZ, "dd/MM/yyyy HH:mm:ss");
  return v === null || v === undefined ? "" : String(v).trim();
}
function _d(v) {
  return v instanceof Date ? Utilities.formatDate(v, _TZ, "dd/MM/yyyy") : _s(v);
}
function _t(v) {
  return v instanceof Date ? Utilities.formatDate(v, _TZ, "H:mm") : _s(v);
}
function _tsKey(ts) {
  const m = String(ts).match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return "";
  const p = function(x) { return ("0" + (x || "0")).slice(-2); };
  return m[3] + m[2] + m[1] + p(m[4]) + p(m[5]) + p(m[6]);
}
function _isTest(op) { return /^test/i.test(op || ""); }

// Layout sheet Penggunaan: baru = 24 kolom (Operator di kolom T);
// lama = 9 kolom + 4 kolom campuran (Operator di kolom I).
function _normPenggunaan(r) {
  if (_s(r[19])) {
    const out = [];
    for (let i = 0; i < 24; i++) out.push(i === 1 ? _d(r[i]) : (i === 10 || i === 11) ? _t(r[i]) : _s(r[i]));
    if (!out[20]) out[20] = "Tanpa Campuran";
    return out;
  }
  let steril = _s(r[7]), operator = _s(r[8]), periode = _s(r[6]);
  if (!operator && steril && /steril|tidak ada/i.test(periode)) { // layout 8 kolom (tanpa Waktu)
    operator = steril; steril = periode; periode = "";
  }
  return [
    _s(r[0]), _d(r[1]), _s(r[2]), _s(r[3]), _s(r[4]), _s(r[5]),
    "", "", "", "", "", "", periode, "", steril,
    "", "", "", "", operator,
    _s(r[9]) || "Tanpa Campuran", _s(r[10]), _s(r[11]), _s(r[12]),
  ];
}

// Layout sheet Pengambilan: 6 kolom (Operator di F) sekarang; versi lama punya
// kolom suhu/waktu/gas dan Operator di N, Q atau R. Mengembalikan baris
// Pengambilan + (jika ada) baris Pemakaian Gas yang nyasar di situ.
function _normPengambilan(r) {
  const c = function(i) { return _s(r[i - 1]); };
  let op = "", gas = null;
  if (c(18))      { op = c(18); gas = { nomor: c(14), baru: c(15), per: c(16) }; }
  else if (c(17)) { op = c(17); gas = { nomor: c(13), baru: c(14), per: c(15) }; }
  else if (c(14) && !/^(ya|tidak)$/i.test(c(14))) { op = c(14); }
  else            { op = c(6); }
  const ts = _s(r[0]), tgl = _d(r[1]), gh = _s(r[2]);
  const pengambilan = (c(4) || c(5)) ? [ts, tgl, gh, c(4), c(5), op] : null;
  const gasRow = (gas && (gas.nomor || gas.per))
    ? [ts, tgl, gh, _t(r[9]), _t(r[10]), gas.nomor, gas.baru, gas.per, op] : null;
  return { pengambilan: pengambilan, gas: gasRow };
}

function _normGas(r) {
  return [_s(r[0]), _d(r[1]), _s(r[2]), _t(r[3]), _t(r[4]), _s(r[5]), _s(r[6]), _s(r[7]), _s(r[8])];
}
function _normOles(r) {
  return [_s(r[0]), _d(r[1]), _s(r[2]), _s(r[3]), _s(r[4]), _s(r[5]), _s(r[6])];
}

// Buang baris kosong/test/duplikat persis, lalu urutkan per Timestamp (stabil)
function _finalisasi(rows, opIdx) {
  const seen = {};
  const out = [];
  rows.forEach(function(row, i) {
    if (!row[2] || _isTest(row[opIdx])) return;                 // tanpa GH / data test
    const k = JSON.stringify(row);
    if (seen[k]) return;
    seen[k] = true;
    out.push({ row: row, key: _tsKey(row[0]), i: i });
  });
  out.sort(function(a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : a.i - b.i; });
  return out.map(function(o) { return o.row; });
}

// Baris gas kosong dibuang kalau GH+tanggal yang sama sudah punya baris gas berisi
function _bersihkanGasKosong(rows) {
  const adaIsi = {};
  rows.forEach(function(r) { if (r[3] || r[5] || r[7]) adaIsi[r[1] + "|" + r[2]] = true; });
  return rows.filter(function(r) { return r[3] || r[5] || r[7] || !adaIsi[r[1] + "|" + r[2]]; });
}

function _tulisSheet(ss, key, rows) {
  const headers = HEADER[key];
  const n  = headers.length;
  const sh = ss.getSheetByName(SHEET[key]) || createSheet(ss, key);

  sh.getFilter() && sh.getFilter().remove();
  sh.getBandings().forEach(function(b) { b.remove(); });
  sh.clear();
  if (sh.getMaxColumns() > n) sh.deleteColumns(n + 1, sh.getMaxColumns() - n);
  if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());
  if (sh.getMaxRows() < rows.length + 2) sh.insertRowsAfter(sh.getMaxRows(), rows.length + 2 - sh.getMaxRows());

  // Kolom teks (tanggal/waktu) dikunci "@" supaya Sheets tidak mengubah 05/10 jadi tanggal lain
  headers.forEach(function(h, i) {
    if (/^(Timestamp|Tanggal|Waktu Mulai|Waktu Selesai)$/.test(h)) {
      sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1).setNumberFormat("@");
    }
  });
  if (rows.length) sh.getRange(2, 1, rows.length, n).setValues(rows);

  const hRange = sh.getRange(1, 1, 1, n);
  hRange.setValues([headers]).setBackground(HEADER_COLOR[key]).setFontColor("#ffffff")
    .setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true);
  sh.setRowHeight(1, 40);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, Math.max(rows.length + 1, 2), n).createFilter();
  sh.getRange(2, 1, Math.max(rows.length, 1), n).setVerticalAlignment("middle").setWrap(false);
  sh.autoResizeColumns(1, n);
  for (let c = 1; c <= n; c++) if (sh.getColumnWidth(c) < 70) sh.setColumnWidth(c, 70);
}

function rapikanSheets() {
  const ss    = SpreadsheetApp.openById(SS_ID);
  const stamp = Utilities.formatDate(new Date(), _TZ, "yyMMdd_HHmm");
  const baca  = function(key) {
    const sh = ss.getSheetByName(SHEET[key]);
    if (!sh) return [];
    sh.copyTo(ss).setName("bak_" + stamp + "_" + key);
    return sh.getLastRow() < 2 ? [] : sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  };

  const rawOles = baca("OLES_GSB"), rawAmbil = baca("PENGAMBILAN"),
        rawGuna = baca("PENGGUNAAN"), rawGas = baca("PEMAKAIAN_GAS");

  const oles  = _finalisasi(rawOles.map(_normOles), 6);
  const guna  = _finalisasi(rawGuna.map(_normPenggunaan), 19);

  const ambil = [];
  let gas = rawGas.map(_normGas);
  const gasKey = {};
  gas.forEach(function(g) { gasKey[[g[1], g[2], g[5], g[7]].join("|")] = true; });
  let gasDipindah = 0;
  rawAmbil.forEach(function(r) {
    const x = _normPengambilan(r);
    if (x.pengambilan) ambil.push(x.pengambilan);
    if (x.gas) {
      const k = [x.gas[1], x.gas[2], x.gas[5], x.gas[7]].join("|");
      if (!gasKey[k]) { gasKey[k] = true; gas.push(x.gas); gasDipindah++; }
    }
  });
  const ambilOk = _finalisasi(ambil, 5);
  const gasOk   = _bersihkanGasKosong(_finalisasi(gas, 8));

  _tulisSheet(ss, "OLES_GSB",      oles);
  _tulisSheet(ss, "PENGAMBILAN",   ambilOk);
  _tulisSheet(ss, "PENGGUNAAN",    guna);
  _tulisSheet(ss, "PEMAKAIAN_GAS", gasOk);

  const msg = "Selesai.\n" +
    "• Oles GSB: " + rawOles.length + " → " + oles.length + "\n" +
    "• Pengambilan: " + rawAmbil.length + " → " + ambilOk.length + "\n" +
    "• Penggunaan: " + rawGuna.length + " → " + guna.length + "\n" +
    "• Pemakaian Gas: " + rawGas.length + " → " + gasOk.length + " (" + gasDipindah + " dipindah dari Pengambilan)\n" +
    "Backup: sheet bak_" + stamp + "_* — hapus manual kalau sudah yakin.";
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* dijalankan tanpa UI */ }
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
