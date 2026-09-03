// ============================================================
//  FarmTrack Pro — Login (validasi kredensial di server)
//  Google Apps Script (Code.gs)
//
//  Cara pasang:
//  1. Buka Spreadsheet "REF OPERATOR":
//     https://docs.google.com/spreadsheets/d/16DLPD-_Zsl1g4FJ4jFsWUYHVCdZvgonO9qf1b5qS3D4
//  2. Extensions > Apps Script
//  3. Hapus semua isi default, paste file ini
//  4. Save → Deploy > New deployment > Web app
//     - Execute as: Me
//     - Who has access: Anyone
//  5. Copy URL deploy → taruh di VITE_GAS_LOGIN_URL di Vercel
// ============================================================

// Spreadsheet "REF OPERATOR" — tab "REF" berisi daftar user & akses menu
const SPREADSHEET_ID = '16DLPD-_Zsl1g4FJ4jFsWUYHVCdZvgonO9qf1b5qS3D4';
const SHEET_NAME      = 'REF';

// Batas percobaan login gagal per nama (anti brute-force sederhana)
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS   = 5 * 60 * 1000; // 5 menit

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
    if (!checkRateLimit()) return jsonResponse({ success: false, error: 'Terlalu banyak percobaan, coba lagi sebentar.' });
    if (!checkAppToken(data.token)) return jsonResponse({ success: false, error: 'Unauthorized' });
    if (data.action === 'login') return login(data);
    return jsonResponse({ success: false, error: 'Invalid action' });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

function doGet() {
  return jsonResponse({ status: 'ok', message: 'GAS Login aktif.' });
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

  const rows  = getUserRows();
  const found = rows.find(function (u) {
    return u.nama.toLowerCase() === nama.toLowerCase() && parseInt(u.id, 10) === parseInt(password, 10);
  });

  if (!found) {
    recordFailedAttempt(props, lockKey, lock);
    return jsonResponse({ success: false, error: 'Nama atau password salah.' });
  }

  // Login berhasil → reset counter gagal
  props.deleteProperty(lockKey);

  return jsonResponse({ success: true, user: found });
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

// ─── Ambil data user dari sheet REF ────────────────────────────────────────────
// Semua kolom di-lowercase jadi key object (id, nama, sanitasi, gramasi, hpt,
// vigor, kesiapan, penyiraman, so, penyemprotan, cuaca, role, pemetaan) —
// bentuknya sama persis dengan CSV lama supaya App.jsx tidak perlu diubah.
function getUserRows() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error("Sheet '" + SHEET_NAME + "' tidak ditemukan");

  const data    = sheet.getDataRange().getValues();
  const headers = data[0].map(function (h) { return String(h).trim().toLowerCase(); });

  return data.slice(1)
    .filter(function (row) { return row.some(function (v) { return String(v).trim() !== ''; }); })
    .map(function (row) {
      const obj = {};
      headers.forEach(function (h, i) {
        obj[h] = row[i] === undefined || row[i] === null ? '' : String(row[i]).trim();
      });
      return obj;
    });
}

// ─── TEST ──────────────────────────────────────────────────────────────────
function testLogin() {
  const result = login({ nama: 'Adit', password: '003' });
  Logger.log(result.getContent());
}
