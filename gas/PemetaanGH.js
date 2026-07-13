// ============================================================
// Google Apps Script — Pemetaan GH Produksi
// Output spreadsheet :
//   https://docs.google.com/spreadsheets/d/1BdmHTbxtzEu3PKRJ607Tm4fDJehKAPw1Pbo5mEEqNi8
//   Sheet "Data"        — dibaca oleh pipeline R (jangan ubah urutan kolom A-D)
//   Sheet "Selisih Log" — catatan selisih realisasi vs referensi semai
//
// Referensi ruang semai : Data sprout (New)
//   https://docs.google.com/spreadsheets/d/1WPHh2-wVLgMBFmV847jSmg-syJgfY_YPTbC5b0Rniuo
//
// ENDPOINT:
//   GET  ?action=getSemaiRef   → { semai: { [ghTujuan]: { periode, tanam, varian:[{nama,populasi}] } } }
//   POST { action:"submitPemetaan", tanggal, gh, periode, operator, rows:[{baris,text}], selisih:[{varian,referensi,realisasi,selisih,keterangan}] }
// ============================================================

const SS_OUTPUT_ID  = '1BdmHTbxtzEu3PKRJ607Tm4fDJehKAPw1Pbo5mEEqNi8';
const SHEET_DATA     = 'Data';
const SHEET_SELISIH  = 'Selisih Log';

// Kolom sheet "Data" — HARUS tetap A:Tanggal Tanam, B:GH, C:Periode, D:Text
// karena dibaca langsung by-position oleh pipeline R. Operator ditambah di kolom E
// (aman, pipeline R cuma baca 4 kolom itu by name).
const HEADER_DATA    = ['Tanggal Tanam', 'GH', 'Periode', 'Text', 'Operator'];
const HEADER_SELISIH = ['Tanggal', 'GH', 'Periode', 'Varian', 'Referensi', 'Realisasi', 'Selisih', 'Keterangan', 'Operator'];

const SS_SEMAI_ID   = '1WPHh2-wVLgMBFmV847jSmg-syJgfY_YPTbC5b0Rniuo'; // Data sprout (New)
const SHEET_SEMAI    = 'Data sprout (New)';

function doGet(e) {
  try {
    const action = (e.parameter || {}).action;
    if (action === 'getSemaiRef') return jsonResponse(getSemaiRef());
    return jsonResponse({ error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === 'submitPemetaan') return jsonResponse(submitPemetaan(data));
    return jsonResponse({ error: 'Unknown action: ' + data.action });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// GET SEMAI REF — GH tujuan yang kolom Tanam-nya masih kosong,
// lengkap dengan Populasi (akhir) per varian sebagai referensi.
// ============================================================
function getSemaiRef() {
  const ss    = SpreadsheetApp.openById(SS_SEMAI_ID);
  const sheet = ss.getSheetByName(SHEET_SEMAI);
  if (!sheet) return { error: "Sheet '" + SHEET_SEMAI + "' tidak ditemukan" };

  const rows = sheet.getDataRange().getValues();

  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const rowUpper = rows[i].map(function (c) { return String(c).trim().toUpperCase(); });
    if (rowUpper.indexOf('GH SEMAI') >= 0) { headerRowIdx = i; break; }
  }
  if (headerRowIdx < 0) return { error: "Header 'GH Semai' tidak ditemukan" };

  const header = rows[headerRowIdx].map(function (h) { return String(h).trim().toUpperCase(); });

  const colGhTujuan = header.findIndex(function (h) { return h.indexOf('TUJUAN') >= 0; });
  const colPeriode  = header.indexOf('PERIODE');
  const colGhSemai  = header.indexOf('GH SEMAI');
  const colSemai    = header.indexOf('SEMAI');
  const colTanam    = header.indexOf('TANAM');
  const colVarian   = header.findIndex(function (h) { return h.indexOf('VARIAN') >= 0; });
  const colPopulasi = header.indexOf('POPULASI');

  const parseISO = function (val) {
    if (!val) return '';
    if (val instanceof Date && !isNaN(val)) {
      return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    if (typeof val === 'string' && val.trim()) {
      const d = new Date(val.trim());
      if (!isNaN(d)) return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    return '';
  };

  const semai = {};

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row      = rows[r];
    const ghTujuan = String(row[colGhTujuan] || '').trim();
    const periode  = row[colPeriode];
    const ghSemai  = String(row[colGhSemai]  || '').trim();
    const tglSemai = row[colSemai];
    const tglTanam = row[colTanam];
    const varian   = colVarian   >= 0 ? String(row[colVarian] || '').trim() : '';
    const populasi = colPopulasi >= 0 ? Number(row[colPopulasi]) || 0 : 0;

    if (!ghTujuan || !ghSemai) continue;
    if (tglTanam) continue; // sudah tanam → tidak aktif lagi

    if (!semai[ghTujuan]) {
      semai[ghTujuan] = {
        periode: String(periode || ''),
        tanam: parseISO(tglSemai),
        varian: [],
        _varMap: {},
      };
    }
    if (varian) {
      if (semai[ghTujuan]._varMap[varian] === undefined) {
        semai[ghTujuan]._varMap[varian] = semai[ghTujuan].varian.length;
        semai[ghTujuan].varian.push({ nama: varian, populasi: populasi });
      } else {
        semai[ghTujuan].varian[semai[ghTujuan]._varMap[varian]].populasi += populasi;
      }
    }
  }

  Object.keys(semai).forEach(function (gh) { delete semai[gh]._varMap; });

  Logger.log('Semai aktif (Pemetaan): ' + JSON.stringify(Object.keys(semai)));
  return { semai: semai };
}

// ============================================================
// SUBMIT PEMETAAN
// ============================================================
function submitPemetaan(data) {
  const ss = SpreadsheetApp.openById(SS_OUTPUT_ID);

  const parts = (data.tanggal || '').split('/');
  const tglDate = parts.length === 3
    ? new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]))
    : new Date();

  const gh        = (data.gh || '').trim();
  const periode   = data.periode || '';
  const operator  = data.operator || '';

  const sheetData = getOrCreateSheet(ss, SHEET_DATA, HEADER_DATA);
  (data.rows || []).forEach(function (row) {
    sheetData.appendRow([tglDate, gh.toUpperCase(), periode, row.text || '', operator]);
  });

  const selisih = data.selisih || [];
  if (selisih.length > 0) {
    const sheetSelisih = getOrCreateSheet(ss, SHEET_SELISIH, HEADER_SELISIH);
    selisih.forEach(function (s) {
      sheetSelisih.appendRow([
        tglDate, gh.toUpperCase(), periode,
        s.varian || '', s.referensi || 0, s.realisasi || 0, s.selisih || 0,
        s.keterangan || '', operator,
      ]);
    });
  }

  return { success: true, gh: gh, rows: (data.rows || []).length, selisih: selisih.length };
}

// ─── Helper: ambil sheet, buat + set header kalau belum ada ──────────────────
function getOrCreateSheet(ss, sheetName, header) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(header);
    const r = sheet.getRange(1, 1, 1, header.length);
    r.setFontWeight('bold');
    r.setBackground('#1b5e20');
    r.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// ============================================================
// TEST FUNCTIONS
// ============================================================
function testGetSemaiRef() {
  const result = getSemaiRef();
  if (result.error) { Logger.log('❌ ' + result.error); return; }
  Object.keys(result.semai).forEach(function (gh) {
    Logger.log(gh + ' → ' + JSON.stringify(result.semai[gh]));
  });
}

function testSubmitPemetaan() {
  const data = {
    action: 'submitPemetaan',
    tanggal: '12/07/2026',
    gh: 'Colomadu 4',
    periode: '26.3',
    operator: 'Test Operator',
    rows: [
      { baris: 'A', text: 'A Greeniegal 196' },
      { baris: 'M', text: 'M Sunray 161, Midori 39' },
      { baris: 'Sulaman', text: 'Sulaman Midori 121, Greeniegal 64' },
    ],
    selisih: [
      { varian: 'S7', referensi: 210, realisasi: 200, selisih: -10, keterangan: 'Test dari GAS - boleh dihapus' },
    ],
  };
  const result = submitPemetaan(data);
  Logger.log(JSON.stringify(result));
}
