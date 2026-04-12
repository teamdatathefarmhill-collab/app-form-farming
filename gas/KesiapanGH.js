// ============================================================
//  FarmTrack Pro — Database Kesiapan Tanam (v2)
//  Google Apps Script (Code.gs)
// ============================================================

const SHEET_DB   = "Kesiapan Dutch Bucket";
const SHEET_DRIP = "Kesiapan Drip";
const SHEET_P1   = "Kesiapan Kolam P1";
const SHEET_P2   = "Kesiapan Kolam P2";

// ── Cache global spreadsheet (hidup selama instance GAS warm) ─
let _ss = null;
function getSS() {
  if (!_ss) _ss = SpreadsheetApp.getActiveSpreadsheet();
  return _ss;
}

const MATRIKS = {
  "Dutch Bucket": {
    sheetName: SHEET_DB,
    aspek: [
      {
        key: "tandon", label: "Tandon", bobotAspek: 20,
        items: [
          { code: "DB_T1",  label: "Tandon dalam keadaan bersih",           bobotVariabel: 3  },
          { code: "DB_T2",  label: "Tidak ada kebocoran tandon",            bobotVariabel: 10 },
          { code: "DB_T3",  label: "Pompa utama berfungsi normal",          bobotVariabel: 15 },
          { code: "DB_T4",  label: "Pressure gauge berfungsi normal",       bobotVariabel: 5  },
          { code: "DB_T5",  label: "Filter air berfungsi normal",           bobotVariabel: 5  },
          { code: "DB_T6",  label: "Filter air dalam kondisi bersih",       bobotVariabel: 5  },
          { code: "DB_T7",  label: "Pompa DO berfungsi normal",             bobotVariabel: 15 },
          { code: "DB_T8",  label: "Nilai DO tandon >5 mg/L",               bobotVariabel: 15 },
          { code: "DB_T9",  label: "Jumlah lampu UV sesuai (1 lampu)",      bobotVariabel: 2  },
          { code: "DB_T10", label: "Lampu UV menyala normal",               bobotVariabel: 10 },
          { code: "DB_T11", label: "Instalasi kelistrikan berjalan normal", bobotVariabel: 15 },
        ],
      },
      {
        key: "inst_input", label: "Instalasi Input", bobotAspek: 20,
        items: [
          { code: "DB_II1",  label: "Stop kran input berfungsi normal",                   bobotVariabel: 5  },
          { code: "DB_II2",  label: "Tidak ada sumbatan dan kebocoran pipa input",        bobotVariabel: 10 },
          { code: "DB_II3",  label: "Tekanan air mengalir sesuai standar (1.2 bar)",      bobotVariabel: 10 },
          { code: "DB_II4",  label: "Stop kran PE 16 mm berfungsi normal",                bobotVariabel: 10 },
          { code: "DB_II5",  label: "Tidak ada kebocoran stop kran PE 16 mm",             bobotVariabel: 5  },
          { code: "DB_II6",  label: "Tidak ada kebocoran selang PE 16 mm",                bobotVariabel: 10 },
          { code: "DB_II7",  label: "Tekanan air pipa PE 16 mm sesuai (≥ 0.3 bar)",      bobotVariabel: 10 },
          { code: "DB_II8",  label: "Seluruh PCJ berfungsi normal (8 L/H)",               bobotVariabel: 15 },
          { code: "DB_II9",  label: "Selang PE 5 mm berfungsi normal",                    bobotVariabel: 15 },
          { code: "DB_II10", label: "Debit input yang masuk ke dalam bucket rata",        bobotVariabel: 10 },
        ],
      },
      {
        key: "inst_penyiraman", label: "Instalasi Penyiraman", bobotAspek: 20,
        items: [
          { code: "DB_IP1", label: "Bucket dalam kondisi layak pakai",           bobotVariabel: 25 },
          { code: "DB_IP2", label: "Tutup bucket dalam kondisi layak pakai",     bobotVariabel: 20 },
          { code: "DB_IP3", label: "Elbow berfungsi normal tidak ada kebocoran", bobotVariabel: 25 },
          { code: "DB_IP4", label: "Nilai DO bucket >5 mg/L",                    bobotVariabel: 30 },
        ],
      },
      {
        key: "inst_output", label: "Instalasi Output", bobotAspek: 20,
        items: [
          { code: "DB_IO1", label: "Pipa output 2 inch tidak ada kerusakan/kebocoran", bobotVariabel: 25 },
          { code: "DB_IO2", label: "Aliran output berjalan normal/tidak ada luapan",   bobotVariabel: 25 },
          { code: "DB_IO3", label: "Pipa output 3 inch tidak ada kerusakan/kebocoran", bobotVariabel: 25 },
          { code: "DB_IO4", label: "Stop kran output berfungsi normal",                bobotVariabel: 25 },
        ],
      },
      {
        key: "inst_gh", label: "Instalasi Greenhouse", bobotAspek: 20,
        items: [
          { code: "DB_IG1", label: "Bangunan GH dalam kondisi baik",            bobotVariabel: 15 },
          { code: "DB_IG2", label: "Plastik UV & insectnet dalam kondisi baik", bobotVariabel: 20 },
          { code: "DB_IG3", label: "Tidak ada kebocoran talang",                bobotVariabel: 20 },
          { code: "DB_IG4", label: "Weedmat dalam kondisi baik",                bobotVariabel: 15 },
          { code: "DB_IG5", label: "Jumlah tali rambat sesuai kebutuhan",       bobotVariabel: 15 },
          { code: "DB_IG6", label: "Kawat seling dalam kondisi baik",           bobotVariabel: 15 },
        ],
      },
    ],
  },

  "Drip": {
    sheetName: SHEET_DRIP,
    aspek: [
      {
        key: "tandon", label: "Tandon", bobotAspek: 25,
        items: [
          { code: "DR_T1", label: "Tandon dalam keadaan bersih",            bobotVariabel: 5  },
          { code: "DR_T2", label: "Tidak ada kebocoran tandon",             bobotVariabel: 15 },
          { code: "DR_T3", label: "Pompa utama berfungsi normal",           bobotVariabel: 15 },
          { code: "DR_T4", label: "Pompa air baku berfungsi normal",        bobotVariabel: 15 },
          { code: "DR_T5", label: "Pressure gauge berfungsi normal",        bobotVariabel: 10 },
          { code: "DR_T6", label: "Filter air berfungsi normal",            bobotVariabel: 5  },
          { code: "DR_T7", label: "Filter air dalam kondisi bersih",        bobotVariabel: 10 },
          { code: "DR_T8", label: "Instalasi kelistrikan berfungsi normal", bobotVariabel: 15 },
          { code: "DR_T9", label: "Seluruh stop kran berfungsi normal",     bobotVariabel: 10 },
        ],
      },
      {
        key: "inst_input", label: "Instalasi Input", bobotAspek: 40,
        items: [
          { code: "DR_II0",  label: "Tidak ada sumbatan dan kebocoran pipa input",        bobotVariabel: 10 },
          { code: "DR_II1",  label: "Tekanan air mengalir sesuai standar (1.2 bar)",      bobotVariabel: 5  },
          { code: "DR_II2",  label: "Stop kran PE 16 mm berfungsi normal",                bobotVariabel: 5  },
          { code: "DR_II3",  label: "Tidak ada kebocoran stop kran PE 16 mm",             bobotVariabel: 5  },
          { code: "DR_II4",  label: "Tidak ada kebocoran selang PE 16 mm",                bobotVariabel: 10 },
          { code: "DR_II5",  label: "Tekanan air pipa PE 16 mm sesuai (≥ 0.3 bar)",      bobotVariabel: 10 },
          { code: "DR_II6",  label: "Seluruh PCJ berfungsi normal (4 L/H)",               bobotVariabel: 15 },
          { code: "DR_II7",  label: "Selang PE 5 mm berfungsi normal",                    bobotVariabel: 10 },
          { code: "DR_II8",  label: "Dripper berfungsi normal",                            bobotVariabel: 15 },
          { code: "DR_II9",  label: "Debit air dripper rata (toleransi 10 ml)",            bobotVariabel: 15 },
        ],
      },
      {
        key: "inst_gh", label: "Instalasi Greenhouse", bobotAspek: 35,
        items: [
          { code: "DR_IG1", label: "Bangunan GH dalam kondisi baik",            bobotVariabel: 15 },
          { code: "DR_IG2", label: "Plastik UV & insectnet dalam kondisi baik", bobotVariabel: 20 },
          { code: "DR_IG3", label: "Tidak ada kebocoran talang",                bobotVariabel: 20 },
          { code: "DR_IG4", label: "Weedmat dalam kondisi baik",                bobotVariabel: 15 },
          { code: "DR_IG5", label: "Jumlah tali rambat sesuai kebutuhan",       bobotVariabel: 15 },
          { code: "DR_IG6", label: "Kawat seling dalam kondisi baik",           bobotVariabel: 15 },
        ],
      },
    ],
  },

  "Kolam P1": {
    sheetName: SHEET_P1,
    aspek: [
      {
        key: "tandon_air_baku", label: "Tandon Air Baku", bobotAspek: 10,
        items: [
          { code: "P1_TAB1", label: "Tandon air baku dalam keadaan bersih", bobotVariabel: 25 },
          { code: "P1_TAB2", label: "Tidak ada kebocoran kolam tandon",     bobotVariabel: 35 },
          { code: "P1_TAB3", label: "Sumber air baku berjalan normal",      bobotVariabel: 40 },
        ],
      },
      {
        key: "tandon_nutrisi", label: "Tandon Nutrisi", bobotAspek: 10,
        items: [
          { code: "P1_TN1", label: "Tandon dalam keadaan bersih",               bobotVariabel: 15 },
          { code: "P1_TN2", label: "Tidak ada kebocoran tandon",                bobotVariabel: 20 },
          { code: "P1_TN3", label: "Jumlah lampu UV sesuai (1 lampu) / tandon", bobotVariabel: 10 },
          { code: "P1_TN4", label: "Lampu UV menyala normal",                   bobotVariabel: 15 },
          { code: "P1_TN5", label: "Sumber air baku berjalan normal",           bobotVariabel: 15 },
          { code: "P1_TN6", label: "Instalasi kelistrikan berjalan normal",     bobotVariabel: 25 },
        ],
      },
      {
        key: "pompa", label: "Pompa", bobotAspek: 15,
        items: [
          { code: "P1_PM1", label: "Pompa utama berfungsi normal",           bobotVariabel: 20 },
          { code: "P1_PM2", label: "Tusen klep berfungsi normal",            bobotVariabel: 15 },
          { code: "P1_PM3", label: "Pressure gauge berfungsi normal",        bobotVariabel: 10 },
          { code: "P1_PM4", label: "Stop kran pada pompa berfungsi normal",  bobotVariabel: 10 },
          { code: "P1_PM5", label: "Filter air berfungsi normal",            bobotVariabel: 10 },
          { code: "P1_PM6", label: "Instalasi kelistrikan berjalan normal",  bobotVariabel: 20 },
          { code: "P1_PM7", label: "Tombol kelistrikan berjalan normal",     bobotVariabel: 15 },
        ],
      },
      {
        key: "inst_input", label: "Instalasi Input", bobotAspek: 15,
        items: [
          { code: "P1_II1", label: "Stop kran 1½ inch input berfungsi normal",    bobotVariabel: 25 },
          { code: "P1_II2", label: "Tidak ada sumbatan dan kebocoran pipa input", bobotVariabel: 35 },
          { code: "P1_II3", label: "Aliran pipa input berjalan normal",           bobotVariabel: 40 },
        ],
      },
      {
        key: "inst_kolam", label: "Instalasi Kolam", bobotAspek: 25,
        items: [
          { code: "P1_IK1", label: "Selang T-Tape terpasang dengan lurus & rata",   bobotVariabel: 25 },
          { code: "P1_IK2", label: "Lubang emitter menghadap ke atas",              bobotVariabel: 10 },
          { code: "P1_IK3", label: "Kolam dalam kondisi bersih",                    bobotVariabel: 10 },
          { code: "P1_IK4", label: "Valve Drat ½ inch to T-Tape berfungsi normal",  bobotVariabel: 15 },
          { code: "P1_IK5", label: "Debit air yang keluar seragam",                 bobotVariabel: 40 },
        ],
      },
      {
        key: "inst_gh", label: "Instalasi Greenhouse", bobotAspek: 25,
        items: [
          { code: "P1_IG0",  label: "Bangunan GH dalam kondisi baik",            bobotVariabel: 15 },
          { code: "P1_IG01", label: "Plastik UV & insectnet dalam kondisi baik", bobotVariabel: 20 },
          { code: "P1_IG02", label: "Tidak ada kebocoran talang",                bobotVariabel: 20 },
          { code: "P1_IG1",  label: "Weedmat dalam kondisi baik",                bobotVariabel: 10 },
          { code: "P1_IG2",  label: "Jumlah tali rambat sesuai kebutuhan",       bobotVariabel: 10 },
          { code: "P1_IG3",  label: "Kawat seling dalam kondisi baik",           bobotVariabel: 15 },
          { code: "P1_IG4",  label: "Termohigrometer berfungsi normal",          bobotVariabel: 10 },
        ],
      },
    ],
  },

  "Kolam P2": {
    sheetName: SHEET_P2,
    aspek: [
      {
        key: "tandon_air_baku", label: "Tandon Air Baku", bobotAspek: 10,
        items: [
          { code: "P2_TAB1", label: "Tandon air baku dalam keadaan bersih", bobotVariabel: 25 },
          { code: "P2_TAB2", label: "Tidak ada kebocoran kolam tandon",     bobotVariabel: 35 },
          { code: "P2_TAB3", label: "Sumber air baku berjalan normal",      bobotVariabel: 40 },
        ],
      },
      {
        key: "tandon_nutrisi", label: "Tandon Nutrisi", bobotAspek: 10,
        items: [
          { code: "P2_TN1", label: "Kolam tandon dalam keadaan bersih",          bobotVariabel: 15 },
          { code: "P2_TN2", label: "Tidak ada kebocoran kolam tandon",           bobotVariabel: 20 },
          { code: "P2_TN3", label: "Jumlah lampu UV sesuai (1 lampu) / tandon",  bobotVariabel: 10 },
          { code: "P2_TN4", label: "Lampu UV menyala normal",                    bobotVariabel: 15 },
          { code: "P2_TN5", label: "Sumber air baku berjalan normal",            bobotVariabel: 15 },
          { code: "P2_TN6", label: "Instalasi kelistrikan berjalan normal",      bobotVariabel: 25 },
        ],
      },
      {
        key: "pompa", label: "Pompa", bobotAspek: 20,
        items: [
          { code: "P2_PM1", label: "Pompa utama berfungsi normal",           bobotVariabel: 20 },
          { code: "P2_PM2", label: "Tusen klep berfungsi normal",            bobotVariabel: 15 },
          { code: "P2_PM3", label: "Pressure gauge berfungsi normal",        bobotVariabel: 10 },
          { code: "P2_PM4", label: "Stop kran pada pompa berfungsi normal",  bobotVariabel: 10 },
          { code: "P2_PM5", label: "Filter air berfungsi normal",            bobotVariabel: 10 },
          { code: "P2_PM6", label: "Instalasi kelistrikan berjalan normal",  bobotVariabel: 20 },
          { code: "P2_PM7", label: "Tombol kelistrikan berjalan normal",     bobotVariabel: 15 },
        ],
      },
      {
        key: "inst_input", label: "Instalasi Input", bobotAspek: 10,
        items: [
          { code: "P2_II1", label: "Stop kran 1½ inch input berfungsi normal",    bobotVariabel: 25 },
          { code: "P2_II2", label: "Tidak ada sumbatan dan kebocoran pipa input", bobotVariabel: 35 },
          { code: "P2_II3", label: "Aliran pipa input berjalan normal",           bobotVariabel: 40 },
        ],
      },
      {
        key: "inst_kolam", label: "Instalasi Kolam", bobotAspek: 25,
        items: [
          { code: "P2_IK1", label: "Kolam dalam kondisi baik (Dinding dan Alas)", bobotVariabel: 5  },
          { code: "P2_IK2", label: "Plastik kolam dalam kondisi baik",            bobotVariabel: 5  },
          { code: "P2_IK3", label: "Lubang drainase berfungsi dengan baik",       bobotVariabel: 5  },
          { code: "P2_IK4", label: "Selang T-Tape terpasang dengan lurus & rata", bobotVariabel: 20 },
          { code: "P2_IK5", label: "Lubang emitter menghadap ke atas",            bobotVariabel: 10 },
          { code: "P2_IK6", label: "Kolam dalam kondisi bersih",                  bobotVariabel: 10 },
          { code: "P2_IK7", label: "Valve Drat ½ inch to T-Tape berfungsi normal",bobotVariabel: 15 },
          { code: "P2_IK8", label: "Debit air yang keluar seragam",               bobotVariabel: 30 },
        ],
      },
      {
        key: "inst_gh", label: "Instalasi Greenhouse", bobotAspek: 25,
        items: [
          { code: "P2_IG1", label: "Bangunan GH dalam kondisi baik",            bobotVariabel: 15 },
          { code: "P2_IG2", label: "Plastik UV & insectnet dalam kondisi baik", bobotVariabel: 20 },
          { code: "P2_IG3", label: "Tidak ada kebocoran talang",                bobotVariabel: 20 },
          { code: "P2_IG4", label: "Weedmat dalam kondisi baik",                bobotVariabel: 10 },
          { code: "P2_IG5", label: "Jumlah tali rambat sesuai kebutuhan",       bobotVariabel: 10 },
          { code: "P2_IG6", label: "Kawat seling dalam kondisi baik",           bobotVariabel: 15 },
          { code: "P2_IG7", label: "Termohigrometer berfungsi normal",          bobotVariabel: 10 },
        ],
      },
    ],
  },
};

// ── Helper: normalisasi nilai sel tanggal dari sheet ─────────
function normTanggal(val) {
  if (val instanceof Date) {
    const d = String(val.getDate()).padStart(2, "0");
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const y = val.getFullYear();
    return d + "/" + m + "/" + y;
  }
  return String(val || "").trim();
}

// ── Hitung bobot terpenuhi per aspek ─────────────────────────
function hitungBobotAspek(aspek, data) {
  return aspek.items.reduce((sum, item) => {
    if (data[item.code] === "good") {
      return sum + item.bobotVariabel * (aspek.bobotAspek / 100);
    }
    return sum;
  }, 0);
}

// ── Entry point POST ─────────────────────────────────────────
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action !== "submitKesiapan") return jsonError("Action tidak dikenal: " + data.action);

    const tipeConfig = MATRIKS[data.tipe];
    if (!tipeConfig) return jsonError("Tipe GH tidak dikenal: " + data.tipe);

    const ss  = getSS();
    let sheet = ss.getSheetByName(tipeConfig.sheetName);
    if (!sheet) { sheet = ss.insertSheet(tipeConfig.sheetName); setupHeader(sheet, tipeConfig); }
    if (sheet.getLastRow() === 0) setupHeader(sheet, tipeConfig);

    const newRow       = buildRow(data, tipeConfig);
    const dataTanggal  = String(data.tanggal).trim();
    const dataTipe     = String(data.tipe).trim();
    const dataGH       = String(data.gh).trim();

    // Cari baris existing → overwrite jika ada
    let existingRowNum = -1;
    if (sheet.getLastRow() > 1) {
      const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
      for (let i = 0; i < rows.length; i++) {
        const rowTanggal = normTanggal(rows[i][1]);
        const rowTipe    = String(rows[i][2] || "").trim();
        const rowGH      = String(rows[i][3] || "").trim();
        if (rowTanggal === dataTanggal && rowTipe === dataTipe && rowGH === dataGH) {
          existingRowNum = i + 2;
          break;
        }
      }
    }

    if (existingRowNum > 0) {
      sheet.getRange(existingRowNum, 1, 1, newRow.length).setValues([newRow]);
      formatLastRow(sheet, tipeConfig, existingRowNum);
    } else {
      // setValues() lebih cepat dari appendRow()
      const lastRow = sheet.getLastRow();
      sheet.getRange(lastRow + 1, 1, 1, newRow.length).setValues([newRow]);
      formatLastRow(sheet, tipeConfig);
    }

    return jsonOk();
  } catch (err) {
    return jsonError(err.toString());
  }
}

// ── Entry point GET ──────────────────────────────────────────
function doGet(e) {
  const action = e?.parameter?.action;
  if (action === "getSubmitted") return handleGetSubmitted(e);
  return ContentService
    .createTextOutput(JSON.stringify({ status: "ok", message: "GAS Kesiapan Tanam v2 aktif." }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Handler: Get GH yang sudah disubmit hari ini ─────────────
function handleGetSubmitted(e) {
  try {
    const tipe    = e.parameter.tipe    || "";
    const tanggal = e.parameter.tanggal || "";
    const tipeConfig = MATRIKS[tipe];
    if (!tipeConfig) return jsonError("Tipe tidak dikenal: " + tipe);

    const ss    = getSS();
    const sheet = ss.getSheetByName(tipeConfig.sheetName);
    if (!sheet || sheet.getLastRow() < 2) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, submitted: [] }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const rows      = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
    const submitted = [];
    rows.forEach(r => {
      const rowTanggal = normTanggal(r[1]);
      const rowTipe    = String(r[2] || "").trim();
      const rowGH      = String(r[3] || "").trim();
      if (rowTanggal === tanggal && rowTipe === tipe && rowGH) {
        submitted.push(rowGH);
      }
    });

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, submitted }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return jsonError("getSubmitted error: " + err.toString());
  }
}

// ── Build baris data ─────────────────────────────────────────
function buildRow(d, tipeConfig) {
  // Pakai waktu submit operator jika ada (penting untuk data offline)
  const tsDate = d.client_timestamp ? new Date(d.client_timestamp) : new Date();
  const row = [
    Utilities.formatDate(tsDate, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss"),
    d.tanggal  || "",
    d.tipe     || "",
    d.gh       || "",
    d.operator || "",
  ];
  tipeConfig.aspek.forEach(aspek => {
    row.push(parseFloat(hitungBobotAspek(aspek, d).toFixed(2)));
    aspek.items.forEach(item => {
      row.push(d[item.code] === "notgood" ? "Not Good" : "Good");
    });
  });
  row.push(parseFloat(d.totalBobot) || 0);
  row.push(d.status || "");
  return row;
}

// ── Setup header ─────────────────────────────────────────────
function setupHeader(sheet, tipeConfig) {
  const headers = ["Timestamp", "Tanggal", "Tipe GH", "Greenhouse", "Operator"];
  tipeConfig.aspek.forEach(aspek => {
    headers.push("Bobot " + aspek.label + " (/" + aspek.bobotAspek + ")");
    aspek.items.forEach(item => { headers.push(item.label); });
  });
  headers.push("Total Bobot Terpenuhi", "Status");

  sheet.appendRow(headers);
  sheet.setFrozenRows(1);
  const hRange = sheet.getRange(1, 1, 1, headers.length);
  hRange.setBackground("#004D40").setFontColor("#ffffff").setFontWeight("bold").setFontSize(10);

  sheet.setColumnWidth(1, 155);
  sheet.setColumnWidth(2, 95);
  sheet.setColumnWidth(3, 120);
  sheet.setColumnWidth(4, 110);
  sheet.setColumnWidth(5, 140);
  let col = 6;
  tipeConfig.aspek.forEach(aspek => {
    sheet.setColumnWidth(col, 100); col++;
    aspek.items.forEach(() => { sheet.setColumnWidth(col, 80); col++; });
  });
  sheet.setColumnWidth(col, 120);
  sheet.setColumnWidth(col + 1, 130);
}

// ── Format baris ─────────────────────────────────────────────
function formatLastRow(sheet, tipeConfig, rowNum) {
  const lastRow = rowNum || sheet.getLastRow();
  const numCols = sheet.getLastColumn();
  const bg = lastRow % 2 === 0 ? "#f0f9f7" : "#ffffff";
  sheet.getRange(lastRow, 1, 1, numCols).setBackground(bg).setFontSize(10);

  let col = 6;
  tipeConfig.aspek.forEach(aspek => {
    const cell = sheet.getRange(lastRow, col);
    const val  = parseFloat(cell.getValue());
    if (!isNaN(val)) colorBobotCell(cell, val, aspek.bobotAspek);
    col += aspek.items.length + 1;
  });
  const totalCell = sheet.getRange(lastRow, col);
  const totalVal  = parseFloat(totalCell.getValue());
  if (!isNaN(totalVal)) colorBobotCell(totalCell, totalVal, 100);
  totalCell.setFontWeight("bold").setFontSize(11);
  colorStatusCell(sheet.getRange(lastRow, col + 1), sheet.getRange(lastRow, col + 1).getValue());
}

function colorBobotCell(cell, val, maxBobot) {
  const pct = maxBobot > 0 ? val / maxBobot : 0;
  if (pct >= 0.7)      cell.setBackground("#e0f2f1").setFontColor("#004D40").setFontWeight("bold");
  else if (pct >= 0.5) cell.setBackground("#fff3e0").setFontColor("#E65100").setFontWeight("bold");
  else                 cell.setBackground("#ffebee").setFontColor("#B71C1C").setFontWeight("bold");
}

function colorStatusCell(cell, status) {
  if (status === "Siap Tanam")
    cell.setBackground("#e0f2f1").setFontColor("#004D40").setFontWeight("bold");
  else if (status === "Perlu Perbaikan")
    cell.setBackground("#fff3e0").setFontColor("#E65100").setFontWeight("bold");
  else if (status === "Tidak Layak")
    cell.setBackground("#ffebee").setFontColor("#B71C1C").setFontWeight("bold");
}

// ── Response helpers ─────────────────────────────────────────
function jsonOk() {
  return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
}
function jsonError(msg) {
  return ContentService.createTextOutput(JSON.stringify({ success: false, error: msg })).setMimeType(ContentService.MimeType.JSON);
}

// ── Debug: cek format tanggal di sheet ───────────────────────
function debugTanggal() {
  const sheet = getSS().getSheetByName("Kesiapan Kolam P1");
  if (!sheet || sheet.getLastRow() < 2) { Logger.log("Sheet kosong"); return; }
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
  rows.forEach((r, i) => {
    Logger.log("Row " + (i+2) + ": tanggal=[" + normTanggal(r[1]) + "] tipe=[" + r[2] + "] gh=[" + r[3] + "]");
  });
}

// ── Test manual ──────────────────────────────────────────────
function testInsertP1() {
  const dummy = {
    action:"submitKesiapan", tanggal:"09/04/2026", tipe:"Kolam P1", gh:"TOHUDAN 1", operator:"Dedy",
    client_timestamp: new Date().toISOString(),
    P1_TAB1:"good", P1_TAB2:"notgood", P1_TAB3:"good",
    P1_TN1:"good", P1_TN2:"good", P1_TN3:"good", P1_TN4:"notgood", P1_TN5:"good", P1_TN6:"good",
    P1_PM1:"good", P1_PM2:"good", P1_PM3:"good", P1_PM4:"good", P1_PM5:"good", P1_PM6:"notgood", P1_PM7:"good",
    P1_II1:"good", P1_II2:"good", P1_II3:"good",
    P1_IK1:"good", P1_IK2:"good", P1_IK3:"good", P1_IK4:"notgood", P1_IK5:"good",
    P1_IG0:"good", P1_IG01:"good", P1_IG02:"good", P1_IG1:"good", P1_IG2:"good", P1_IG3:"good", P1_IG4:"good",
    totalBobot: 75.5, status:"Siap Tanam",
  };
  const tipeConfig = MATRIKS[dummy.tipe];
  const ss = getSS();
  let sheet = ss.getSheetByName(tipeConfig.sheetName);
  if (!sheet) { sheet = ss.insertSheet(tipeConfig.sheetName); setupHeader(sheet, tipeConfig); }
  if (sheet.getLastRow() === 0) setupHeader(sheet, tipeConfig);
  const newRow = buildRow(dummy, tipeConfig);
  let existingRowNum = -1;
  if (sheet.getLastRow() > 1) {
    const rows = sheet.getRange(2, 1, sheet.getLastRow()-1, 5).getValues();
    for (let i = 0; i < rows.length; i++) {
      if (normTanggal(rows[i][1]) === dummy.tanggal && String(rows[i][2]).trim() === dummy.tipe && String(rows[i][3]).trim() === dummy.gh) {
        existingRowNum = i + 2; break;
      }
    }
  }
  if (existingRowNum > 0) {
    sheet.getRange(existingRowNum, 1, 1, newRow.length).setValues([newRow]);
    formatLastRow(sheet, tipeConfig, existingRowNum);
    Logger.log("✅ Overwrite baris " + existingRowNum);
  } else {
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, 1, newRow.length).setValues([newRow]);
    formatLastRow(sheet, tipeConfig);
    Logger.log("✅ Append baris baru");
  }
}
