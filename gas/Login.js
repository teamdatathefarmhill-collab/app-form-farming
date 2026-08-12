// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Ganti dengan Spreadsheet ID direktori user (yang sebelumnya di-publish as CSV)
const SPREADSHEET_ID = 'GANTI_DENGAN_SPREADSHEET_ID_USER_DIRECTORY';
const SHEET_NAME      = 'Users'; // ganti sesuai nama sheet/tab yang berisi data user

// Kolom yang dianggap sebagai "akses modul" — tambahkan di sini kalau ada modul baru
const MODULE_COLUMNS = ['sanitasi', 'hpt', 'gramasi'];

// Batas percobaan login gagal per nama (anti brute-force sederhana)
const MAX_ATTEMPTS   = 5;
const LOCKOUT_MS     = 5 * 60 * 1000; // 5 menit

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === 'login') return login(data);
    return jsonResponse({ success: false, error: 'Invalid action' });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── POST: Login ──────────────────────────────────────────────────────────────
function login(data) {
  const nama     = String(data.nama || '').trim();
  const password = String(data.password || '').trim();

  if (!nama || !password) {
    return jsonResponse({ success: false, error: 'Nama dan password wajib diisi.' });
  }

  const lockKey = 'LOGIN_LOCK_' + nama.toLowerCase();
  const props   = PropertiesService.getScriptProperties();
  const lock    = getLockState(props, lockKey);

  if (lock.blockedUntil && Date.now() < lock.blockedUntil) {
    const sisaMenit = Math.ceil((lock.blockedUntil - Date.now()) / 60000);
    return jsonResponse({
      success: false,
      error: 'Terlalu banyak percobaan gagal. Coba lagi dalam ' + sisaMenit + ' menit.',
    });
  }

  const rows = getUserRows();
  const found = rows.find(function (u) {
    return u.nama.toLowerCase() === nama.toLowerCase() && String(u.id) === password;
  });

  if (!found) {
    recordFailedAttempt(props, lockKey, lock);
    return jsonResponse({ success: false, error: 'Nama atau password salah.' });
  }

  // Login berhasil → reset counter gagal
  props.deleteProperty(lockKey);

  const access = {};
  MODULE_COLUMNS.forEach(function (m) {
    access[m] = String(found[m] || '').toUpperCase() === 'YES';
  });

  return jsonResponse({
    success: true,
    user: {
      nama: found.nama,
      access: access,
    },
  });
}

function getLockState(props, lockKey) {
  const raw = props.getProperty(lockKey);
  if (!raw) return { attempts: 0, blockedUntil: 0 };
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { attempts: 0, blockedUntil: 0 };
  }
}

function recordFailedAttempt(props, lockKey, lock) {
  const attempts = (lock.attempts || 0) + 1;
  const state = { attempts: attempts, blockedUntil: 0 };
  if (attempts >= MAX_ATTEMPTS) {
    state.blockedUntil = Date.now() + LOCKOUT_MS;
    state.attempts = 0;
  }
  props.setProperty(lockKey, JSON.stringify(state));
}

// ─── Ambil data user dari sheet ───────────────────────────────────────────────
function getUserRows() {
  const ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet   = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error("Sheet '" + SHEET_NAME + "' tidak ditemukan");

  const data    = sheet.getDataRange().getValues();
  const headers = data[0].map(function (h) { return String(h).trim().toLowerCase(); });

  const idxId   = headers.indexOf('id');
  const idxNama = headers.indexOf('nama');

  return data.slice(1).map(function (row) {
    const obj = { id: row[idxId], nama: String(row[idxNama] || '') };
    MODULE_COLUMNS.forEach(function (m) {
      const idx = headers.indexOf(m);
      obj[m] = idx >= 0 ? row[idx] : '';
    });
    return obj;
  });
}

// ─── TEST ──────────────────────────────────────────────────────────────────
function testLogin() {
  const result = login({ nama: 'Admin', password: '003' });
  Logger.log(result.getContent());
}
