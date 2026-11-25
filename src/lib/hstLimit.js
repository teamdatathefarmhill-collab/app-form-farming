// Batas HST maksimal khusus per GH (override sementara).
// Dipakai saat panen mundur: GH tertentu tetap tampil di semua menu walau HST
// sudah melewati batas standar menu. Begitu ada pemetaan/tanam baru, HST dihitung
// dari tanggal tanam baru sehingga otomatis kembali kecil — override ini tidak
// perlu diubah. Hapus entri kalau sudah tidak diperlukan.
const HST_MAKS_OVERRIDE = {
  "TOHUDAN 13": 75,
  "TOHUDAN 4": 75,
};

// Batas HST efektif untuk sebuah GH: nilai terbesar antara batas standar menu
// dan override GH tersebut.
export function hstMaksGH(gh, batasStandar) {
  const key = String(gh || "").toUpperCase().trim();
  const ov = HST_MAKS_OVERRIDE[key];
  return ov != null ? Math.max(batasStandar, ov) : batasStandar;
}
