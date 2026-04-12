// ─── SOP Content per Menu ─────────────────────────────────────────────────────
// Setiap entry berisi: title, icon, color, description, steps[], notes[]

const SOP = {
  so: {
    title: "Stock Opname (SO)",
    icon: "📋",
    color: "#FF7043",
    description: "Form pencatatan populasi dan kondisi tanaman di tiap Greenhouse.",
    steps: [
      {
        step: 1,
        title: "Pilih Greenhouse",
        detail: "Pilih GH yang akan dicatat. Pastikan kamu berada di dalam GH yang dipilih sebelum mengisi data.",
      },
      {
        step: 2,
        title: "Isi Data Populasi",
        detail: "Masukkan jumlah tanaman sesuai kondisi aktual: tanaman hidup, mati, afkir, dan pindah tanam.",
      },
      {
        step: 3,
        title: "Tambahkan Keterangan",
        detail: "Jika ada kondisi khusus (serangan hama, kelainan, dll), tulis di kolom Keterangan.",
      },
      {
        step: 4,
        title: "Isi Nama Operator",
        detail: "Tulis nama lengkap kamu sebagai operator yang bertanggung jawab atas data ini.",
      },
      {
        step: 5,
        title: "Review & Submit",
        detail: "Periksa kembali semua data di halaman Konfirmasi sebelum menekan tombol Submit.",
      },
    ],
    notes: [
      "Data SO hanya bisa diisi SATU KALI per GH per hari.",
      "Pastikan menghitung tanaman secara teliti sebelum input.",
      "Jika salah input, hubungi admin untuk koreksi.",
    ],
  },

  penyemprotan: {
    title: "Penyemprotan",
    icon: "💦",
    color: "#1E88E5",
    description: "Form pencatatan kegiatan penyemprotan pestisida dan oles GSB di Greenhouse.",
    steps: [
      {
        step: 1,
        title: "Pilih Jenis Kegiatan",
        detail: "Pilih antara 'Penggunaan & Pengambilan Obat' (untuk semprotan rutin) atau 'Oles GSB' (pengolesan untuk pengendalian GSB).",
      },
      {
        step: 2,
        title: "Pilih Greenhouse",
        detail: "Pilih GH yang sedang/akan dilakukan penyemprotan. Scroll ke area yang sesuai (Bergas, Tohudan, dll).",
      },
      {
        step: 3,
        title: "Isi Data Penyemprotan",
        detail: "Untuk Oles GSB: pilih pestisida, konsentrasi, dan isi jumlah penggunaan dalam gram. Untuk Penggunaan: pilih nama pestisida, konsentrasi, jumlah, dan data suhu/RH mulai-selesai.",
      },
      {
        step: 4,
        title: "Pengambilan (jika ada)",
        detail: "Jika mengambil stok pestisida baru dari gudang, aktifkan 'Ada Pengambilan' dan isi detail pengambilan.",
      },
      {
        step: 5,
        title: "Review & Submit",
        detail: "Di halaman Konfirmasi, periksa semua data sudah benar. Isi nama operator, lalu tekan Submit.",
      },
    ],
    notes: [
      "Suhu dan RH diisi sesuai alat ukur yang ada di GH.",
      "Waktu mulai dan selesai wajib diisi untuk pengambilan.",
      "Jika offline, data tersimpan lokal dan otomatis terkirim saat online kembali.",
    ],
  },

  sanitasi: {
    title: "Sanitasi",
    icon: "🌿",
    color: "#43A047",
    description: "Form pencatatan kegiatan sanitasi dan kebersihan Greenhouse.",
    steps: [
      {
        step: 1,
        title: "Pilih Greenhouse",
        detail: "Pilih GH yang sedang dilakukan kegiatan sanitasi.",
      },
      {
        step: 2,
        title: "Pilih Jenis Sanitasi",
        detail: "Pilih jenis kegiatan sanitasi yang dilakukan: pembersihan gulma, pembuangan daun kering, sterilisasi media, dll.",
      },
      {
        step: 3,
        title: "Isi Detail Kegiatan",
        detail: "Masukkan informasi detail seperti luas area yang disanitasi, bahan yang digunakan (jika ada), dan kondisi setelah sanitasi.",
      },
      {
        step: 4,
        title: "Isi Nama Operator",
        detail: "Tulis nama lengkap operator yang melakukan kegiatan sanitasi.",
      },
      {
        step: 5,
        title: "Review & Submit",
        detail: "Periksa kembali data di halaman Konfirmasi, lalu tekan Submit.",
      },
    ],
    notes: [
      "Sanitasi harus dicatat setiap kali kegiatan dilakukan.",
      "Jika ada temuan kondisi GH yang perlu perhatian khusus, tulis di Keterangan.",
      "Pastikan semua field wajib (bertanda *) sudah terisi.",
    ],
  },

  hpt: {
    title: "HPT (Hama Penyakit Tanaman)",
    icon: "🐛",
    color: "#FF7043",
    description: "Form monitoring dan pencatatan serangan hama, penyakit, dan tanda-tanda pada tanaman.",
    steps: [
      {
        step: 1,
        title: "Pilih Greenhouse",
        detail: "Pilih GH yang akan dimonitor. Lakukan pengamatan menyeluruh sebelum mengisi form.",
      },
      {
        step: 2,
        title: "Pilih Jenis HPT",
        detail: "Pilih jenis hama atau penyakit yang ditemukan. Gunakan daftar referensi jika tidak yakin dengan nama HPT.",
      },
      {
        step: 3,
        title: "Isi Tingkat Serangan",
        detail: "Masukkan persentase atau jumlah tanaman yang terserang. Isi dengan angka yang dihitung secara sampling.",
      },
      {
        step: 4,
        title: "Dokumentasi (jika ada)",
        detail: "Tambahkan catatan detail tentang lokasi serangan di dalam GH, bagian tanaman yang terserang, dan kondisi lingkungan.",
      },
      {
        step: 5,
        title: "Isi Nama Operator & Submit",
        detail: "Isi nama operator pengamat, review data di halaman Konfirmasi, lalu Submit.",
      },
    ],
    notes: [
      "HPT dicatat minimal 2x seminggu per GH.",
      "Jika tidak ada serangan, tetap isi dengan nilai 0 atau 'Tidak ada'.",
      "Data ini digunakan untuk penentuan jadwal penyemprotan.",
    ],
  },

  gramasi: {
    title: "Gramasi",
    icon: "⚖️",
    color: "#1E88E5",
    description: "Form pencatatan berat buah (gramasi) per baris sebagai indikator produktivitas tanaman.",
    steps: [
      {
        step: 1,
        title: "Pilih Greenhouse",
        detail: "Pilih GH yang akan diukur gramasinya. Pastikan data HST GH tersebut sudah sesuai.",
      },
      {
        step: 2,
        title: "Isi Berat Buah per Baris",
        detail: "Untuk setiap baris, timbang buah dan masukkan hasil timbangan (S1, S2, S3) dalam satuan gram. Semua baris wajib diisi.",
      },
      {
        step: 3,
        title: "Pastikan Semua Baris Terisi",
        detail: "Seluruh baris yang tampil harus diisi sebelum bisa submit. Jika ada baris yang belum, tombol Submit tidak akan aktif.",
      },
      {
        step: 4,
        title: "Isi Nama Operator",
        detail: "Tulis nama lengkap operator yang melakukan penimbangan buah.",
      },
      {
        step: 5,
        title: "Review & Submit",
        detail: "Periksa kembali semua data timbangan di halaman review, lalu tekan Submit.",
      },
    ],
    notes: [
      "Gramasi mengukur berat buah per baris, bukan berat daun atau tanaman.",
      "Gunakan timbangan digital yang sudah dikalibrasi sebelum mulai.",
      "Semua baris dalam satu GH harus diisi dalam satu sesi pengisian.",
    ],
  },

  penyiraman: {
    title: "Penyiraman",
    icon: "💧",
    color: "#0277bd",
    description: "Form pencatatan kegiatan penyiraman tanaman di Greenhouse.",
    steps: [
      {
        step: 1,
        title: "Pilih Greenhouse",
        detail: "Pilih GH yang sedang/akan disiram.",
      },
      {
        step: 2,
        title: "Pilih Jenis Penyiraman",
        detail: "Pilih jenis penyiraman: irigasi tetes, manual, atau fertigasi. Sesuaikan dengan kegiatan aktual.",
      },
      {
        step: 3,
        title: "Isi Waktu & Volume",
        detail: "Masukkan waktu mulai dan selesai penyiraman. Isi volume air yang digunakan jika tersedia data flow meter.",
      },
      {
        step: 4,
        title: "Catat Kondisi Tanaman",
        detail: "Jika ada kondisi khusus tanaman saat penyiraman (layu, overcapacity media, dll), tulis di Keterangan.",
      },
      {
        step: 5,
        title: "Isi Operator & Submit",
        detail: "Isi nama operator, review data, lalu Submit.",
      },
    ],
    notes: [
      "Penyiraman dicatat setiap sesi penyiraman.",
      "Waktu penyiraman berpengaruh pada jadwal fertigasi — isi dengan tepat.",
      "Jika ada masalah pada sistem irigasi, tambahkan keterangan.",
    ],
  },

  vigor: {
    title: "Vigor Tanaman",
    icon: "🌱",
    color: "#43A047",
    description: "Form penilaian vigor (kesehatan dan kekuatan tumbuh) tanaman di Greenhouse.",
    steps: [
      {
        step: 1,
        title: "Pilih Greenhouse & Varian",
        detail: "Pilih GH dan varian tanaman yang akan dinilai vigornya.",
      },
      {
        step: 2,
        title: "Amati Kondisi Tanaman",
        detail: "Lakukan pengamatan visual: warna daun, tinggi tanaman, kondisi akar (jika terlihat), dan tanda-tanda stress.",
      },
      {
        step: 3,
        title: "Isi Nilai Vigor",
        detail: "Masukkan skor atau kategori vigor sesuai skala yang ditetapkan (1-5 atau Baik/Cukup/Kurang).",
      },
      {
        step: 4,
        title: "Ukur Parameter Tambahan",
        detail: "Isi tinggi tanaman rata-rata dan jumlah daun (jika diminta). Lakukan sampling minimal 5 tanaman.",
      },
      {
        step: 5,
        title: "Isi Operator & Submit",
        detail: "Isi nama operator, review data di halaman Konfirmasi, lalu Submit.",
      },
    ],
    notes: [
      "Pengamatan vigor dilakukan di bawah kondisi pencahayaan yang cukup.",
      "Bandingkan dengan data minggu sebelumnya untuk melihat tren.",
      "Nilai 1 = sangat lemah, 5 = sangat vigor (sesuai standar internal).",
    ],
  },

  kesiapan: {
    title: "Kesiapan Greenhouse",
    icon: "🏗️",
    color: "#00897B",
    description: "Form checklist kesiapan Greenhouse sebelum tanam atau saat operasional.",
    steps: [
      {
        step: 1,
        title: "Pilih Greenhouse",
        detail: "Pilih GH yang akan dicek kesiapannya.",
      },
      {
        step: 2,
        title: "Checklist Infrastruktur",
        detail: "Centang semua item infrastruktur: atap, dinding, ventilasi, drainase, dan sistem irigasi. Pastikan semuanya dalam kondisi baik.",
      },
      {
        step: 3,
        title: "Checklist Media & Sarana",
        detail: "Periksa ketersediaan dan kondisi media tanam, pot/tray, pupuk, dan sarana produksi lainnya.",
      },
      {
        step: 4,
        title: "Catat Temuan",
        detail: "Jika ada item yang belum siap atau butuh perbaikan, tulis di kolom Keterangan dengan detail.",
      },
      {
        step: 5,
        title: "Isi Operator & Submit",
        detail: "Isi nama operator yang melakukan pengecekan, review semua item, lalu Submit.",
      },
    ],
    notes: [
      "Checklist kesiapan wajib diisi sebelum memulai tanam.",
      "Semua item harus dalam kondisi OK sebelum GH dinyatakan siap.",
      "Temuan kerusakan harus dilaporkan ke mandor/supervisor segera.",
    ],
  },
};

export default SOP;
