const SPREADSHEET_ID  = '1ur46yOLs-K_C4HUTFf2CkXBbivY-v8XHWRZFNd7mpEA';
const DRIVE_FOLDER_ID = '1CTE2GAWuyxuCnzhgMp1VyUCE_I2OHWyj';

// Spreadsheet Data sprout (New) — untuk referensi ruang semai aktif
const SS_SEMAI_ID    = '1WPHh2-wVLgMBFmV847jSmg-syJgfY_YPTbC5b0Rniuo';
const SHEET_REF_SEMAI = 'Data sprout (New)';

const SHEET_PRODUKSI = 'Data Coba';
const SHEET_SEMAI    = 'Semai';

const HEADER_PRODUKSI = [
  'Tanggal', 'GH', 'Periode', 'HST', 'Varian',
  'Fisik', 'Hama', 'Keriting', 'Mozaik', 'DM', 'GSB', 'Semai', 'Buah', 'Layu',
  'Keterangan', 'Foto URL', 'Timestamp', 'Operator', 'Selfie URL',
];

const HEADER_SEMAI = [
  'Tanggal', 'GH', 'Periode', 'HSS', 'Varian',
  'Keriting', 'Mozaik', 'GSB', 'Hama', 'Fisik',
  'Keterangan', 'Foto URL', 'Timestamp', 'Operator', 'Selfie URL',
];

function doGet(e) {
  const action     = e.parameter.action;
  const sessionKey = e.parameter.sessionKey || '';

  let result;
  if (action === 'getGH')
    result = getGHData();
  else if (action === 'getSemaiRef')
    result = getSemaiRef();
  else if (action === 'getLastFotoUrl')
    result = getLastFotoUrl(sessionKey);
  else
    result = { error: 'Invalid action' };

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === 'submitSanitasi') return submitSanitasi(data);
    if (data.action === 'uploadFoto')     return uploadFoto(data);
    return jsonResponse({ error: 'Invalid action' });
  } catch(err) {
    return jsonResponse({ error: err.message });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSanitasiFolder() {
  return DriveApp.getFolderById(DRIVE_FOLDER_ID);
}

// ─── GET: Data GH aktif ───────────────────────────────────────────────────────
function getGHData() {
  const ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet   = ss.getSheetByName('Mapping2');
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];

  const idxGH      = headers.indexOf('Greenhouse');
  const idxPeriode = headers.indexOf('Periode');
  const idxVarian  = headers.indexOf('Varian');
  const idxTanam   = headers.indexOf('Tanam');
  const idxAkhir   = headers.indexOf('Akhir');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const ghMap = {};
  for (let i = 1; i < data.length; i++) {
    const gh      = data[i][idxGH];
    const periode = data[i][idxPeriode];
    const varian  = data[i][idxVarian];
    const tanam   = new Date(data[i][idxTanam]);
    const akhir   = new Date(data[i][idxAkhir]);
    tanam.setHours(0, 0, 0, 0);
    akhir.setHours(0, 0, 0, 0);

    if (gh && varian && today >= tanam && today <= akhir) {
      if (!ghMap[gh]) {
        ghMap[gh] = {
          periode: String(periode),
          tanam: Utilities.formatDate(tanam, 'Asia/Jakarta', 'yyyy-MM-dd'),
          varian: []
        };
      }
      if (!ghMap[gh].varian.includes(varian)) ghMap[gh].varian.push(varian);
    }
  }
  return { success: true, data: ghMap };
}

// ─── POST: Upload foto ke Google Drive ───────────────────────────────────────
function uploadFoto(data) {
  try {
    const folder  = getSanitasiFolder();
    const decoded = Utilities.base64Decode(data.base64Data);
    const blob    = Utilities.newBlob(decoded, data.mimeType, data.fileName);
    const file    = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const fileId  = file.getId();
    const viewUrl = 'https://drive.google.com/file/d/' + fileId + '/view';

    const key = data.sessionKey || 'LAST';
    PropertiesService.getScriptProperties().setProperty('FOTO_URL_' + key, viewUrl);
    PropertiesService.getScriptProperties().setProperty('FOTO_ID_'  + key, fileId);

    return jsonResponse({ success: true, url: viewUrl, fileId });
  } catch(err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ─── GET: Ambil URL foto berdasarkan sessionKey ───────────────────────────────
function getLastFotoUrl(sessionKey) {
  const key    = sessionKey || 'LAST';
  const props  = PropertiesService.getScriptProperties();
  const url    = props.getProperty('FOTO_URL_' + key) || '';
  const fileId = props.getProperty('FOTO_ID_'  + key) || '';
  return { success: true, url, fileId };
}

// ─── GET: Ruang semai aktif dari Data sprout (New) ───────────────────────────
function getSemaiRef() {
  try {
    const ss    = SpreadsheetApp.openById(SS_SEMAI_ID);
    const sheet = ss.getSheetByName(SHEET_REF_SEMAI);
    if (!sheet) return { error: "Sheet '" + SHEET_REF_SEMAI + "' tidak ditemukan" };

    const rows = sheet.getDataRange().getValues();

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
    const colSemai    = header.indexOf("SEMAI");
    const colTanam    = header.indexOf("TANAM");
    const colVarian   = header.findIndex(function(h) { return h.indexOf("VARIAN") >= 0; });

    Logger.log("getSemaiRef Sanitasi kolom -> GhTujuan:" + colGhTujuan + " Periode:" + colPeriode + " GhSemai:" + colGhSemai + " Semai:" + colSemai + " Tanam:" + colTanam + " Varian:" + colVarian);

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
      const varian   = colVarian >= 0 ? String(row[colVarian] || "").trim() : "";

      if (!ghTujuan || !ghSemai) continue;
      if (tglTanam) continue; // sudah tanam → tidak aktif lagi

      if (!semai[ghTujuan]) {
        semai[ghTujuan] = {
          periode: String(periode || ""),
          tanam: parseISO(tglSemai),
          status: "SEDANG_SEMAI",
          varian: [],
        };
      }
      if (varian && semai[ghTujuan].varian.indexOf(varian) < 0) {
        semai[ghTujuan].varian.push(varian);
      }
    }

    Logger.log("Semai aktif (Data sprout New): " + JSON.stringify(Object.keys(semai)));
    return { semai: semai };

  } catch(err) {
    return { error: err.message };
  }
}

// ─── POST: Simpan data sanitasi — SEMUA VARIAN dalam 1 request (data.rows[]) ──
function submitSanitasi(data) {
  const ss   = SpreadsheetApp.openById(SPREADSHEET_ID);
  const tipe = (data.tipe || 'produksi').toLowerCase();

  // ── FIX: Parse tanggal dari DD/MM/YYYY ke Date object ──
  const parts = (data.tanggal || '').split('/');
  const tglDate = parts.length === 3
    ? new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]))
    : new Date();

  const rows      = data.rows || [];
  const timestamp = new Date().toISOString();

  if (tipe === 'semai') {
    const sheet = getOrCreateSheet(ss, SHEET_SEMAI, HEADER_SEMAI);
    rows.forEach(function (row) {
      sheet.appendRow([
        tglDate,
        data.gh                || '',
        data.periode           || '',
        data.hst               || '',
        row.varian              || '',
        Number(row.keriting)   || 0,
        Number(row.mozaik)     || 0,
        Number(row.gsb)        || 0,
        Number(row.hama)       || 0,
        Number(row.fisik)      || 0,
        row.keterangan          || '',
        data.fotoUrl           || '',
        timestamp,
        data.operator           || '',
        data.selfieUrl          || '',
      ]);
    });

  } else {
    const sheet = getOrCreateSheet(ss, SHEET_PRODUKSI, HEADER_PRODUKSI);
    rows.forEach(function (row) {
      sheet.appendRow([
        tglDate,
        data.gh                || '',
        data.periode           || '',
        data.hst               || '',
        row.varian              || '',
        Number(row.fisik)      || 0,
        Number(row.hama)       || 0,
        Number(row.keriting)   || 0,
        Number(row.mozaik)     || 0,
        Number(row.dm)         || 0,
        Number(row.gsb)        || 0,
        Number(row.semai)      || 0,
        Number(row.buah)       || 0,
        Number(row.layu)       || 0,
        row.keterangan          || '',
        data.fotoUrl           || '',
        timestamp,
        data.operator           || '',
        data.selfieUrl          || '',
      ]);
    });
  }

  return jsonResponse({ success: true, tipe: tipe, rows: rows.length });
}

// ─── Helper: ambil sheet, buat + set header kalau belum ada ──────────────────
function getOrCreateSheet(ss, sheetName, header) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(header);
    const r = sheet.getRange(1, 1, 1, header.length);
    r.setFontWeight('bold');
    r.setBackground('#1b5e20');
    r.setFontColor('#ffffff');
    r.setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// ─── TEST: Submit sanitasi produksi (2 varian sekaligus) ─────────────────────
function testSubmitProduksi() {
  const data = {
    action: 'submitSanitasi',
    tipe: 'produksi',
    tanggal: '23/04/2026',
    gh: 'TOHUDAN 1',
    periode: '26.2',
    hst: '14',
    operator: 'Test Operator',
    fotoUrl: '', selfieUrl: '',
    rows: [
      { varian: 'Greeniegal', fisik: 2, hama: 0, keriting: 1, mozaik: 0, dm: 0, gsb: 0, semai: 0, buah: 0, layu: 0, keterangan: 'Test produksi dari GAS' },
      { varian: 'Sunray', fisik: 0, hama: 1, keriting: 0, mozaik: 0, dm: 0, gsb: 0, semai: 0, buah: 0, layu: 0, keterangan: '' },
    ],
  };
  const result = submitSanitasi(data);
  Logger.log('Produksi result: ' + result.getContent());
}

// ─── TEST: Submit sanitasi semai ─────────────────────────────────────────────
function testSubmitSemai() {
  const data = {
    action: 'submitSanitasi',
    tipe: 'semai',
    tanggal: '23/04/2026',
    gh: 'Tohudan 4',
    periode: '26.2',
    hst: '7',   // HSS
    operator: 'Test Operator',
    fotoUrl: '', selfieUrl: '',
    rows: [
      { varian: 'Benih Greeniegal', keriting: 3, mozaik: 0, gsb: 0, hama: 1, fisik: 0, keterangan: 'Test semai dari GAS' },
    ],
  };
  const result = submitSanitasi(data);
  Logger.log('Semai result: ' + result.getContent());
}

// ─── TEST: Cek sheet yang tersedia ───────────────────────────────────────────
function testListSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  ss.getSheets().forEach(function(s, i) {
    Logger.log((i + 1) + '. "' + s.getName() + '"');
  });
}

function testDrive() {
  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  Logger.log(folder.getName());
}

// ─── TEST: Cek header & isi Data sprout (New) ────────────────────────────────
function testSemaiHeader() {
  const ss    = SpreadsheetApp.openById(SS_SEMAI_ID);
  const sheet = ss.getSheetByName(SHEET_REF_SEMAI);
  if (!sheet) {
    Logger.log('❌ Sheet "' + SHEET_REF_SEMAI + '" tidak ditemukan!');
    return;
  }
  const rows = sheet.getDataRange().getValues();
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    Logger.log('=== Row ' + (i + 1) + ' ===');
    rows[i].forEach(function(h, j) {
      Logger.log('Kolom ' + (j + 1) + ' (index ' + j + '): "' + h + '"');
    });
  }
}

// ─── TEST: Simulasi getSemaiRef ──────────────────────────────────────────────
function testGetSemaiRef() {
  const result = getSemaiRef();
  if (result.error) {
    Logger.log('❌ Error: ' + result.error);
    return;
  }
  const keys = Object.keys(result.semai);
  Logger.log('=== GH Semai Aktif (' + keys.length + ') ===');
  keys.forEach(function(gh) {
    Logger.log(gh + ' → ' + JSON.stringify(result.semai[gh]));
  });
}
