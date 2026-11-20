# Bola Live V11 (BSD sebagai sumber utama)

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


## Perubahan V11 (rombak sumber data)
BSD (sports.bzzoiro.com, paket Football gratis, 7.500 permintaan/hari) kini menjadi sumber utama semua liga. Lihat `MIGRASI_V11.md` untuk daftar yang dihapus, dipertahankan, dan diubah.

## Perubahan V12 (integrasi penuh BSD Football Unlimited)
- **Live tiap ±5 menit**: workflow berjalan `*/5`. Mode *ringan* hanya menyegarkan laga live / dekat kickoff / baru selesai; mode *berat* (±tiap jam, atau saat dijalankan manual/push) mengambil semua sumber. Data run berat dibawa dari situs tayang (`scripts/carry.mjs`) sehingga tidak hilang.
- **football-data.org tidak lagi wajib**: bila token gagal, situs tetap tayang dengan data BSD.
- **Tab Live** memakai data BSD (menggantikan proxy SBOBET yang rapuh).
- **Tab Klasemen**: tabel dengan zona Liga Champions/degradasi, xG±, form, top skor, top assist, kartu (`leagues.json`, `lg/{id}.json`).
- **Match Center** (tombol di tiap kartu): ringkasan (cuaca, penonton, siaran TV termasuk Indonesia, preview AI, fakta, cuplikan, form 10 laga), prediksi BSD lengkap (1X2, skor, over/under, BTTS, pojok), statistik + momentum + peta tembakan, line-up resmi/prediksi AI + pemain absen, kejadian, komentar, rating pemain, odds konsensus + perbandingan bookmaker + Polymarket, H2H (`m/{id}.json`).
- **Odds terbaik antar bookmaker** (1X2, over/under 2,5, BTTS) tampil di kartu.
- Variabel: `BSD_MAX_DETAIL` (default 250 laga), `BSD_CONCURRENCY` (6), `BSD_DEEP=0` untuk mematikan mode lengkap, variabel repo `FORCE_HEAVY=1` untuk memaksa mode berat tiap run.

## Perubahan V19 (audit menyeluruh, 20 Nov 2026)
- **Data antar-run disimpan di cache GitHub Actions**, bukan diunduh ulang dari situs tayang. `bola-live/prev` = keluaran run sebelumnya, `bola-live/state` = data internal (riwayat hasil setahun, xG, data pemain, nilai pasar, line-up, riwayat prediksi, status Highlightly, odds Pinnacle). Data internal **tidak lagi tayang publik** (sesuai syarat BSD/Highlightly yang melarang data mentah disebar sebagai dataset).
- **Pemeriksa sebelum tayang** (`scripts/guard.mjs`): file data internal yang menyusut tidak wajar dikembalikan ke versi sebelum run (peringatan di Actions); `all.json` yang rusak/anjlok membatalkan deploy (situs lama tetap tayang). Ringkasan kesehatan (model basi, Highlightly kosong, waktu skrip, Model BL vs BSD) tampil di halaman run.
- **Cadangan harian terenkripsi** (artifact `state-backup`, 14 hari), dipulihkan otomatis bila cache hilang.
- **Saat upload kode (push)** semua tes dijalankan dulu; kode yang gagal tes tidak di-deploy.
- **Hemat bandwidth**: situs memakai revalidasi (jawaban 304 bila data belum berubah); file Match Center laga yang akan datang diringkas dari ±66KB ke ±17KB (form tim & grid bookmaker hanya angka yang ditampilkan).
- **Keamanan**: Content-Security-Policy, link cuplikan hanya http(s), escape tambahan.
- **Variabel repo** (Settings > Secrets and variables > Actions > *Variables*), tanpa upload kode:
  - `BL_NEUTRAL=1` — tampilan netral: tanpa tag "Value" dan tabel perbandingan bookmaker.
  - `BL_NOINDEX=1` — situs tidak diindeks mesin pencari.
  - `BSD_EXPIRES=YYYY-MM-DD` — tanggal akhir langganan BSD (default 2026-12-19); peringatan muncul 21 hari sebelumnya.
  - `GUARD_ALLOW_SHRINK=1` — izinkan data menyusut untuk satu run (mis. sengaja mengosongkan data), lalu hapus lagi.
- **Secret opsional** `BACKUP_KEY` — kata sandi enkripsi cadangan (bila tidak diisi, memakai `BSD_API_KEY`; bila token BSD diganti, cadangan lama tidak bisa dibuka, cukup tunggu cadangan baru).
- `scripts/check-bsd-history.mjs` (pemeriksaan sekali jalan) membaca `bsd-history.json` dari situs; sejak V19 file itu tidak tayang, jadi skrip ini perlu disesuaikan bila ingin dipakai lagi.
