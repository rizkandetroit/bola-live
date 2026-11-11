# Bola Live V10 (Audit & Fix)

Paket ini telah melalui audit kode dan perbaikan regresi. Lihat `../AUDIT_V10.md` untuk temuan, perubahan, hasil tes, dan batas audit.

Dasbor analisis sepak bola berbasis GitHub Actions + GitHub Pages. V10 mempertahankan jadwal/skor dan prediksi Poisson + Elo V9, lalu menambahkan intelligence line-up, kekuatan pemain inti/cadangan, indikasi pemain reguler yang tidak tercantum, formasi dan matchup taktik, xG/xGA dari shot data, PPDA, field tilt, xT, VAEP, progresi serangan, peta tembakan, mesin prediksi berbobot, serta backtest V8-proxy vs V9 vs V10.

## Fitur V10
- **Line-up intelligence:** skor XI, skor bangku cadangan, status prediksi/terkonfirmasi, dan deteksi pemain reguler yang tidak masuk XI. Deteksi tersebut bukan konfirmasi cedera.
- **Tactical analysis:** struktur formasi, jumlah pemain lini tengah, pressing berbasis PPDA, dan catatan matchup.
- **xG engine:** xG/xGA rolling dari tembakan, kualitas peluang, skor paling mungkin, over/under 2,5, dan BTTS.
- **Team performance:** PPDA, field tilt, xT, VAEP, progresive passes/carries, final-third entries, dan box entries.
- **Dynamic prediction:** Poisson, Elo, xG, performa tim, line-up, dan taktik dengan bobot dinormalisasi saat sumber data tidak lengkap.
- **Evaluasi:** akurasi 1X2, Brier Score, Log Loss, dan simulasi ROI berbasis odds asumsi.
- **Dashboard:** jadwal, prediksi, alasan, line-up, formasi, metrik performa, peta tembakan, dan perbandingan model.

## Mulai
Lihat `PANDUAN.md` untuk menyiapkan repository, secret API, GitHub Pages, dan pengaturan cakupan data.

Catatan: arsip V8 asli tidak ada di paket V9 yang diterima. Karena itu kolom V8 pada backtest adalah **baseline Poisson-only proxy**, bukan replay kode V8 asli. Simulasi ROI memakai odds asumsi, bukan odds bookmaker historis.
