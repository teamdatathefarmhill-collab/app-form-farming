# ============================================================
# Sync Rekap Pemetaan GH -> sheet "Data Pemetaan" (Data sprout (New))
#
# Ambil data dari sheet "Rekap" (baris reguler) dan "Sulaman" di
# spreadsheet output Pemetaan GH, digabung lalu ditotal per
# GH + Periode + Varian, kemudian ditulis ke sheet "Data Pemetaan"
# supaya bisa di-XLOOKUP pakai key GH + Periode + Varian.
#
# Sumber : https://docs.google.com/spreadsheets/d/1BdmHTbxtzEu3PKRJ607Tm4fDJehKAPw1Pbo5mEEqNi8
#          - sheet "Rekap"   : Tanggal Tanam, GH, Periode, Baris, Varian, Total
#          - sheet "Sulaman" : Tanggal Tanam, GH, Periode, Varian, Jumlah, Operator
# Tujuan : https://docs.google.com/spreadsheets/d/1WPHh2-wVLgMBFmV847jSmg-syJgfY_YPTbC5b0Rniuo
#          - sheet "Data Pemetaan" (ditimpa/replace tiap kali script ini jalan)
# ============================================================

library(googlesheets4)
library(dplyr)

SS_OUTPUT_ID <- "1BdmHTbxtzEu3PKRJ607Tm4fDJehKAPw1Pbo5mEEqNi8"
SS_SEMAI_ID  <- "1WPHh2-wVLgMBFmV847jSmg-syJgfY_YPTbC5b0Rniuo"
SHEET_TUJUAN <- "Data Pemetaan"

# Samakan dengan cara auth yang sudah dipakai pipeline R lain (service account
# atau OAuth cache yang sudah ada). Aktifkan salah satu baris di bawah kalau perlu:
# gs4_auth(email = "teamdatathefarmhill@gmail.com")
# gs4_auth(path = "service-account.json")

# ── R selalu format angka pakai titik ("26.3"), tapi sheet ini locale Indonesia
# (desimal pakai koma) — kalau ditulis "26.3" apa adanya, Sheets salah baca jadi
# TANGGAL, bukan angka. Parse dulu ke numeric (terima titik ATAU koma sebagai
# input), lalu format ulang selalu pakai koma supaya sesuai locale sheet. ──
normalize_periode <- function(x) {
  x <- trimws(as.character(x))
  x_num <- suppressWarnings(as.numeric(gsub(",", ".", x, fixed = TRUE)))
  ifelse(is.na(x_num), x, gsub(".", ",", format(x_num, trim = TRUE, scientific = FALSE), fixed = TRUE))
}

# ── Ambil Rekap (baris reguler, sudah dipecah per varian) ──
rekap_raw <- range_speedread(SS_OUTPUT_ID, sheet = "Rekap")
rekap <- rekap_raw %>%
  transmute(
    GH      = trimws(toupper(as.character(GH))),
    Periode = normalize_periode(Periode),
    Varian  = trimws(as.character(Varian)),
    Jumlah  = suppressWarnings(as.numeric(Total))
  )

# ── Ambil Sulaman (sudah dipecah per varian) ──
sulaman_raw <- range_speedread(SS_OUTPUT_ID, sheet = "Sulaman")
sulaman <- sulaman_raw %>%
  transmute(
    GH      = trimws(toupper(as.character(GH))),
    Periode = normalize_periode(Periode),
    Varian  = trimws(as.character(Varian)),
    Jumlah  = suppressWarnings(as.numeric(Jumlah))
  ) %>%
  mutate(Code = paste0(GH, "/", Periode, "/", Varian))

# ── Gabung Rekap + Sulaman, lalu total per GH + Periode + Varian ──
rekap_total <- bind_rows(rekap, sulaman) %>%
  filter(!is.na(Varian), Varian != "", !is.na(GH), GH != "") %>%
  group_by(GH, Periode, Varian) %>%
  summarise(Total = sum(Jumlah, na.rm = TRUE), .groups = "drop") %>%
  arrange(GH, Periode, Varian) %>%
  mutate(Code = paste0(GH, "/", Periode, "/", Varian)) # ubah 0 jadi NA supaya XLOOKUP bisa pakai IFNA

# ── Tulis ke sheet "Data Pemetaan" (replace isi lama) ──
range_write(rekap_total, ss = SS_SEMAI_ID, sheet = SHEET_TUJUAN,
            range = "A1", col_names = TRUE)

# ── Tulis rincian Sulaman ke kolom H (replace isi lama) ──
range_write(sulaman, ss = SS_SEMAI_ID, sheet = SHEET_TUJUAN,
            range = "H1", col_names = TRUE)

message(sprintf(
  "Selesai: %d baris total per GH+Periode+Varian ditulis ke sheet '%s'.",
  nrow(rekap_total), SHEET_TUJUAN
))
