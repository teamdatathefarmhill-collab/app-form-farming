# PRD — Rebuild UI/UX semua menu (Form Farming)

**Produk:** app-form-farming (PWA input data greenhouse, PT Kebun Bumi Lestari / The Farmhill)
**Versi dokumen:** 1.0 · 26 Okt 2026
**Acuan visual:** The Farmhill Design System (token warna, tipografi, komponen)
**Acuan mockup:** `Farmhill Form Redesign.dc.html` (bagian 1, 2, 4)

---

## 1. Latar belakang

Aplikasi sekarang punya 10 menu form (Penyiraman, Gramasi, Vigor, Kesiapan GH, SO, Penyemprotan, Sanitasi, HPT, Cuaca, Pemetaan). Setiap file `src/pages/*.jsx` ditulis dengan gaya sendiri:

- Warna per modul berbeda (#0277bd, #1E88E5, #FF7043, #00897B, #004D40…), banyak gradien dan emoji sebagai ikon.
- HPT dan Penyemprotan memakai tema gelap; menu lain terang.
- Label field 9–11px, input 32–38px, placeholder #bbb. Sulit dibaca di greenhouse terang dan sulit ditekan dengan sarung tangan.
- Nama operator diketik ulang di setiap form padahal user sudah login.
- Pola langkah (pilih GH → input → rekap → sukses) ada di semua menu, tapi komponennya ditulis ulang di tiap file (±800–1.100 baris per file).
- `src/styles/tokens.js` ada tapi belum dipakai; `src/index.css` masih sisa template Vite.

## 2. Tujuan

1. Semua menu terlihat dan terasa sebagai **satu aplikasi**: satu warna aksi, satu tipografi, satu pola langkah.
2. Input lebih cepat dan lebih sedikit salah ketik di lapangan.
3. Rebuild dilakukan **satu menu per rilis**, tanpa mengubah logika data (endpoint GAS, payload, draft, antrian offline).
4. Komponen bersama dibuat sekali di tahap 0, lalu dipakai ulang, supaya tiap menu berikutnya makin cepat dikerjakan.

### Ukuran keberhasilan

| Metrik | Cara ukur | Target |
| --- | --- | --- |
| Waktu isi 1 form | stopwatch saat uji lapangan, 3 operator | turun ≥ 25% vs sekarang |
| Laporan salah input via WA | jumlah per minggu per menu | turun ≥ 50% setelah 4 minggu |
| Baris kode per page | `wc -l src/pages/*.jsx` | turun ≥ 40% |
| Keluhan "tombol kecil / tidak terbaca" | WA tim data | 0 |

## 3. Di luar cakupan (fase ini)

- Flow login, pilih pengisi akun bersama, beranda per akun (mockup 3a, 3b, 4a–4d) — fase berikutnya.
- Penjadwalan harian (DAILY TASK) dan tugas per orang (mockup 2b).
- Perubahan sheet, kolom REF OPERATOR, atau script GAS.
- Bottom navigation baru. Selama fase ini bottom bar lama tetap dipakai, hanya tampilannya diselaraskan (lihat 6.0).

## 4. Prinsip desain (berlaku untuk semua menu)

| Aspek | Aturan |
| --- | --- |
| Warna | Aksi utama `--leaf-600`, hover `--leaf-700`. Aksen `--melon-*` hanya untuk status "due / perlu aksi". Latar `--cream-100`, kartu putih. Tidak ada warna per modul, tidak ada gradien. |
| Tipografi | Source Sans 3. Judul 17px semibold, label 13px semibold, isi 15px, angka input 18px tabular. **Minimum 13px.** Overline 12px uppercase tracking 0.07em. |
| Ikon | Lucide lewat komponen `Icon`. Tidak ada emoji di UI. |
| Ukuran sentuh | Input dan tombol tinggi 48px (minimum 44px). Jarak antar tombol ≥ 6px. |
| Radius | Input 4px, kartu 6px, badge 3px. Tidak ada pill selain Switch. |
| Angka | Format Indonesia: `2,6` desimal, `1.200` ribuan. Satuan di dalam input (mS/cm, °C, %, g, L). |
| Waktu | `26 Okt 2026 · 06.47 WIB`. |
| Copy | Sentence case. Nada laporan, tanpa tanda seru dan tanpa emoji. Error menyebut kondisi + langkah berikutnya ("EC out 32 kemungkinan typo — batas wajar ≤ 8 mS/cm"). |
| Validasi | Peringatan typo/delta ekstrem tampil langsung di bawah field, field berwarna `--status-danger-*`. Tombol lanjut nonaktif sampai beres. |
| Operator | Diisi otomatis dari `user.nama`. Hanya bisa diubah di langkah rekap. |

## 5. Tahap 0 — Fondasi (dikerjakan sekali, sebelum menu pertama)

### 5.1 Token & reset
- Ganti isi `src/index.css` dengan import token Farmhill (`colors.css`, `typography.css`, `spacing.css`, `radius.css`, `elevation.css`, `base.css`) dan font Google (Source Sans 3, Source Serif 4, IBM Plex Mono).
- Hapus `#root` 1126px, `text-align:center`, aksen ungu, dark mode bawaan Vite.
- `src/styles/tokens.js` diganti referensi ke CSS variable (atau dihapus setelah semua menu migrasi).

### 5.2 Komponen bersama (`src/components/form/`)

| Komponen | Fungsi | Dipakai di |
| --- | --- | --- |
| `FormShell` | Header putih (kembali, judul "Modul · GH", subjudul "HST · P · Langkah n dari 3", tombol SOP), progress 3 segmen, area konten scroll, footer sticky | Semua |
| `GHPicker` | Pilihan tipe irigasi (grid 2 kolom), pencarian, daftar GH 52px dengan badge HST, periode, status Shutdown/Restart, sudah diisi hari ini | Semua kecuali Cuaca |
| `NumberField` | Label 13px, input 48px, satuan di kanan, state kosong / terisi / fokus / error, pesan error di bawah, `inputMode="decimal"`, terima koma sebagai desimal | Penyiraman, Gramasi, SO, Sanitasi, HPT, Pemetaan, Penyemprotan |
| `Stepper` | NumberField + tombol − / + 44px | Sanitasi, HPT |
| `OptionList` | Daftar pilihan satu jawaban (radio card) atau skor 1–4 dengan nomor | Vigor, Pemetaan (kualitas bibit) |
| `GoodNotGood` | Dua tombol 44px Good / Not good, catatan wajib bila Not good | Kesiapan |
| `SegmentTabs` | Tab horizontal (varian / aspek / kategori) dengan hitungan terisi | Penyiraman, Vigor, Kesiapan, Sanitasi |
| `EntryTable` | Tabel input per baris (Baris, Varian, kolom angka), header sunken, tambah baris manual | Gramasi, SO |
| `ReviewTable` | Rekap langkah 3: info umum + tabel parameter × varian | Semua |
| `SuccessState` | Status terkirim / tersimpan offline, ringkasan, tombol "Isi GH lain" atau "Kembali" | Semua |
| `FieldAlert` | Peringatan typo / delta ekstrem / terlambat memakai `Alert` design system | Semua |

### 5.3 Perilaku yang wajib dipertahankan
`useDraft`, `useGHBlockedList`, `useGHData`, `offlineQueue`, `gasFetch/gasPost`, `ConfirmSubmitModal` (boleh diganti `ReviewTable` + tombol Kirim, tetapi payload tetap sama), cache REF di localStorage, dan props `initialGH`/`onDone` untuk Home Koor GH.

### 5.4 Kriteria selesai tahap 0
- Halaman contoh (storybook sederhana / route `/dev/components`) menampilkan semua komponen di atas dengan semua state.
- Tidak ada perubahan perilaku di menu lama.

## 6. Urutan rebuild per menu

Urutan dipilih dari menu dengan **section paling sedikit ke paling banyak** (diputuskan 26 Okt 2026), supaya komponen bersama tumbuh bertahap: menu kecil menguji fondasi dulu, menu besar tinggal memakai ulang. Komponen bersama dibuat saat pertama kali dibutuhkan, bukan semuanya di depan. Setiap menu = 1 rilis, lalu 3–5 hari pakai di lapangan sebelum lanjut.

Jumlah section = blok isian di layar input (estimasi dari kode sekarang + spesifikasi bagian 7).

| # | Menu | Section | Isi section | Komponen baru yang ikut dibuat | Mockup |
| --- | --- | --- | --- | --- | --- |
| 1 | Cuaca | 2 | jam, kondisi cuaca | token + `FormShell`, `FieldAlert`, `SuccessState`, `Icon` | 4l |
| 2 | Gramasi | 3 | pilih GH, tabel S1–S3, keterangan | `GHPicker`, `EntryTable`, `NumberField`, `ReviewTable` | 4e |
| 3 | SO | 4 | pilih GH, tabel populasi, baris manual, ringkasan + alasan terlambat | (pakai ulang `EntryTable`) | 4h |
| 4 | HPT | 5 | pilih GH, hama, DM, PM, GSB + keterangan | `Stepper` | 4k |
| 5 | Kesiapan GH | 5 | pilih GH, tab aspek, item Good/Not good, catatan, rekap | `SegmentTabs`, `GoodNotGood` | 4g |
| 6 | Pemetaan | 5 | pilih GH, kartu baris, sulaman, tabel referensi + alasan, kualitas bibit | `OptionList` | 4m |
| 7 | Penyiraman | 6 | pilih GH, nutrisi, tab varian, nutrisi in/out, volume, iklim (+ Dutch Bucket) | Switch salin varian | 2c, 2d, 2e |
| 8 | Penyemprotan | 6 | pilih GH, waktu, campuran, picker pestisida, sterilisasi, oles GSB/gas | picker pencarian, segmented | 4i |
| 9 | Vigor | 7 | pilih GH, status checkpoint, chip HST, tab varian, variabel, foto selfie, keterangan | (pakai ulang `OptionList`, `SegmentTabs`) | 4f |
| 10 | Sanitasi | 8 | pilih GH, tab kategori, subkategori per varian, total, foto papan, selfie, keterangan | foto/selfie 72px | 4j |

Bottom bar sementara (6.0) dikerjakan terpisah setelah beberapa menu selesai.

### 6.0 Bottom bar sementara (rilis bersama tahap 0)
- Latar putih, border atas `--border-default`, ikon Lucide 20px, label 13px tanpa `nowrap` terpotong.
- Hanya menu dengan akses YES (logika sekarang tetap).
- Tab aktif: teks `--leaf-700` + garis atas 2px `--melon-400`.
- Header app gelap diganti header putih tipis; tombol SOP pindah ke `FormShell`, tombol WA & Logout tetap di header app sampai fase login.

---

## 7. Spesifikasi per menu

Format tiap menu: masalah sekarang → perubahan → kriteria terima. Langkah 1 (pilih GH) memakai `GHPicker` dan langkah 3 memakai `ReviewTable` kecuali disebut lain.

### 7.1 Penyiraman (`Penyiraman.jsx`)
**Masalah:** dua header bertumpuk; kartu varian 2 kolom × 8 field sempit; auto-fill varian tersembunyi (debounce 400ms); nama operator diketik manual; rekap + modal konfirmasi dobel.
**Perubahan:**
- Langkah 2: tab per varian (`SegmentTabs`) dengan jumlah field terisi; Switch "Salin ke varian lain" (default ON) menggantikan auto-fill tersembunyi.
- Field dikelompokkan: Nutrisi masuk/keluar (EC in, EC out, pH in, pH out), Volume (per tanaman ml, nutrisi L), Iklim (suhu °C, RH %). Sawahan 3/4: 4 alat suhu/RH dalam kartu "Iklim · 4 alat".
- Tohudan 18: kartu tambahan "Dutch Bucket" (EC/pH/DO tandon & bucket, suhu, RH, vol nutrisi).
- Nutrisi (opsional) di atas tab varian, auto-fill dari isian terakhir GH.
- Langkah 3: tabel parameter × varian, tombol "Kirim n varian".
**Kriteria terima:** semua kombinasi (Kolam, Drip, Sawahan multi-alat, DB) menghasilkan payload identik dengan versi lama; validasi typo EC > 8 dan pH > 12 tetap memblokir.

### 7.2 Gramasi (`Gramasi.jsx`)
**Masalah:** input 52×32px; varian di kolom sempit; warning delta berupa daftar panjang di atas tabel.
**Perubahan:** `EntryTable` kolom Baris (varian sebagai sub-label), S1/S2/S3 64px, Rata² dihitung otomatis; sel dengan delta ekstrem berwarna danger + pesan di bawah tabel per sel; progress "n/8 baris"; keterangan opsional di bawah.
**Kriteria terima:** perhitungan avg dan `getDeltaWarning` sama; GH yang sudah diisi hari ini tetap ditandai di langkah 1.

### 7.3 SO (`SO.jsx`)
**Masalah:** baris manual berwarna ungu (di luar palet); banner terlambat pink.
**Perubahan:** `EntryTable` Baris/Varian/Populasi (100px); baris manual memakai tombol "+ Baris / varian tidak terdaftar" garis putus-putus, baris manual ditandai `Tag` "manual"; ringkasan total per varian sebagai kartu sunken; terlambat → `Alert` danger + field alasan wajib.
**Kriteria terima:** fitur salin ringkasan (clipboard) tetap ada; alasan terlambat wajib sebelum lanjut.

### 7.4 Kesiapan GH (`KesiapanGH.jsx`)
**Masalah:** warna teal sendiri; tab aspek pill 11px; kartu item 2 kolom dengan teks terpotong.
**Perubahan:** tab aspek (`SegmentTabs`) dengan tanda selesai; item satu kolom penuh, teks wrap, `GoodNotGood` 44px; catatan wajib untuk tiap Not good; progress "n/32 variabel".
**Kriteria terima:** skor dan payload per kode item tidak berubah.

### 7.5 Vigor (`Vigor.jsx`)
**Masalah:** accordion varian panjang; opsi teks 12px; chip checkpoint pill.
**Perubahan:** `Alert` status checkpoint (due / sudah lewat); chip checkpoint 36px; tab per varian dengan "n/5 variabel"; tiap variabel satu kartu `OptionList`; semai HST 11 memakai mode skor 1–4. Tombol footer "Varian berikut" lalu "Lihat rekap".
**Kriteria terima:** variabel yang tampil per HST (`showKualitas`, `showNetting`, dll.) sama persis; RnD GH tetap memakai opsi lebar daun RnD.

### 7.6 Sanitasi (`Sanitasi.jsx`)
**Masalah:** 10 kategori × subkategori × varian dalam satu scroll panjang.
**Perubahan:** tab kategori dengan subtotal; di dalamnya per varian, subkategori sebagai `Stepper`; total semua varian di kartu sunken; foto papan (opsional) dan selfie (wajib) berdampingan sebagai kotak 72px. GH Semai memakai `KATEGORI_SEMAI` dan label HSS.
**Kriteria terima:** `keteranganFinal` dan upload foto/selfie offline tetap berjalan.

### 7.7 HPT (`HPT.jsx`)
**Masalah:** tema gelap, warna per hama, emoji.
**Perubahan:** tema terang; grid 2 kolom kartu hama (nama, satuan, input 48px), kartu yang > 0 diberi border aksen; penyakit DM/PM satu kartu masing-masing (insidensi + skor 1–4); GSB satu field; keterangan opsional.
**Kriteria terima:** tab semai (HSS) tetap ada; payload hama/penyakit sama.

### 7.8 Penyemprotan (`Penyemprotan.jsx`)
**Masalah:** tema gelap; daftar pestisida panjang; warna per area.
**Perubahan:** tema terang; waktu (Pagi/Siang/Sore) segmented 44px; campuran sebagai daftar bahan (nama + konsentrasi) dengan tombol ubah; picker pestisida berpencarian + opsi "Lainnya"; sterilisasi `Select`; oles GSB dan peruntukan gas sebagai kartu terpisah. GH dikelompokkan per area tanpa warna area.
**Kriteria terima:** IndexedDB `PenyemprotanOfflineDB` tetap dipakai; daftar Nursery tetap tampil.
**Catatan:** layout langkah 2 versi sekarang perlu dibaca detail sebelum mulai (mockup 4i masih perkiraan).

### 7.9 Pemetaan (`PemetaanGH.jsx`)
**Masalah:** kartu baris dengan select 12px; ungu untuk sulaman; tabel referensi 9–11px di bawah.
**Perubahan:** kartu per baris (subtotal di kanan), tiap entri = select varian 48px + jumlah 84px + hapus; "Tambah varian" sebagai link; sulaman memakai `Tag` "sulaman · di luar total"; tabel referensi vs realisasi dengan badge selisih; alasan selisih wajib muncul inline di bawah baris tabel; kualitas bibit per varian memakai `OptionList` (opsional).
**Kriteria terima:** validasi `allBarisNamed`, `allRegulerFilled`, `keteranganOK` tetap sama.

### 7.10 Cuaca (`Cuaca.jsx`)
**Masalah:** ikon animasi framer-motion besar; tidak jelas jam mana yang sudah diisi.
**Perubahan:** grid jam 5 × 2 (44px) — hijau = terisi, outline brand = dipilih, pudar = belum; 5 kondisi cuaca sebagai baris 56px dengan ikon Lucide (sun, cloud-sun, cloud, cloudy, cloud-rain); satu langkah, tombol "Kirim jam 08.00". Hapus animasi (sesuai aturan motion design system).
**Kriteria terima:** jam yang sudah terisi tidak bisa ditimpa; skor cuaca tetap.

---

## 8. Alur kerja per rilis

1. Baca ulang page lama, catat semua state & validasi.
2. Rebuild dengan komponen bersama; logika (hooks, payload) dipindah apa adanya.
3. Uji payload: bandingkan JSON kiriman lama vs baru untuk 3 GH berbeda.
4. Uji lapangan 1 operator × 2 hari (HP Android kelas bawah, siang hari).
5. Rilis; pantau laporan WA 3–5 hari.
6. Lanjut menu berikutnya.

## 9. Risiko

| Risiko | Mitigasi |
| --- | --- |
| Payload berubah tanpa sengaja → data sheet rusak | Uji perbandingan JSON di langkah 8.3; jangan ubah `buildPayloads` |
| Operator bingung dengan tampilan baru | Rilis satu menu per minggu; SOP modal tampil sekali setelah update |
| Draft lama tidak cocok struktur baru | Validasi draft seperti `draftTipeValid` di Penyiraman; buang draft yang tidak valid |
| Font Google tidak termuat saat offline | Cache font lewat service worker PWA; fallback `system-ui` |

## 10. Pertanyaan terbuka

1. Apakah bottom bar sementara (6.0) boleh dirilis bersama tahap 0, atau tunggu fase login?
2. Siapa operator penguji per menu (minimal 1 per akun: Hidroponik, Koor GH, HPT, Supporting)?
3. Apakah ada ambang wajar resmi untuk EC/pH/suhu/RH per HST yang bisa dipakai sebagai hint di field?
4. Penyemprotan: perlu konfirmasi tim HPT soal daftar perekat/surfaktan (ditandai "SEMENTARA" di kode).
