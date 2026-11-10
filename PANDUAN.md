# Panduan Bola Live

## Struktur repositori
Di akar repositori ada dua hal: folder `.github/workflows/` (berisi `update.yml` dan `test.yml`) dan folder `bola-live/`
(berisi `scripts/`, `site/`, `PANDUAN.md`, `README.md`). Semua path di workflow sudah memakai awalan `bola-live/`.

## Isi (semua gratis)
- **Jadwal liga football-data.org: satu bulan penuh.** Skrip menampilkan seluruh laga bulan berjalan (tanggal 1 sampai akhir bulan, waktu WITA), baik yang sudah selesai maupun yang akan tayang. Tidak ada permintaan tambahan ke API karena satu permintaan sudah memuat satu musim. Ganti bulan terjadi otomatis. Liga API-Football tetap dibatasi paket gratisnya (kemarin sampai besok).
- **10 liga dengan prediksi** (football-data.org): Premier League, Serie A, Bundesliga, La Liga, Ligue 1, Champions League, Eredivisie,
  Primeira Liga, Championship, Brasileirão. Yang di luar paket akun Anda (HTTP 403) dilewati otomatis.
- **Semua liga lainnya** (API-Football, paket gratis 100 permintaan per hari): jadwal dan skor. Diambil per tanggal (satu permintaan =
  semua liga hari itu) dan disimpan di cache `all-cache.json`. Paket gratis hanya mengizinkan kemarin sampai besok (dipelajari otomatis).
- **Prediksi untuk liga lain** memakai model yang sama, tetapi dari hasil laga yang berhasil dikumpulkan, jadi diberi tanda **"data terbatas"**
  dan belum diuji akurasinya. Sumber datanya ada dua:
  1. Hasil laga yang selesai dikumpulkan dari panggilan harian dan disimpan di `all-history.json` (bertambah tiap hari, tanpa permintaan tambahan).
  2. Satu musim penuh per liga (1 permintaan per liga) memakai SISA kuota harian, bila paket mengizinkan. Bila paket menolak, otomatis berhenti
     dan dicoba lagi seminggu kemudian; prediksi lalu hanya tumbuh dari poin 1.
  Syarat prediksi: liga punya minimal 20 laga selesai dan kedua tim minimal 3 laga. Laga yang tidak memenuhi tetap tampil sebagai "tanpa prediksi".
  Laga berprediksi terbatas tidak ikut "8 pilihan teratas" dan angka ringkasan, serta tidak dinilai di tab Evaluasi.
  Liga persahabatan, piala, kualifikasi, dan turnamen internasional tidak diprediksi.
- TheSportsDB gratis dimatikan (hanya mengirim potongan kecil musim). Baris `if: false` di `update.yml` bisa dihapus untuk menyalakannya lagi.
- Model: Poisson dari hasil laga musim ini digabung Elo (70/30), lalu ditarik ke frekuensi hasil liga (kalibrasi).
- Tab Evaluasi: uji mundur (tanpa mengintip) dan uji langsung (prediksi dikunci sebelum kick-off).

## Secret yang dipakai
- `FOOTBALL_DATA_KEY` (wajib): token football-data.org.
- `API_FOOTBALL_KEY` (untuk semua liga): kunci dari dashboard.api-football.com. Jangan pernah menempel kunci ini di chat atau tangkapan layar; kalau pernah, buat ulang kuncinya.
- `TSDB_KEY` (opsional, hanya bila TheSportsDB diaktifkan lagi).

## Bila merah
1. Buka tab **Actions**, klik run yang gagal, lihat **langkah yang bertanda silang merah**.
2. Buka halaman **Summary** run itu: bagian **Pemeriksaan awal** menjelaskan masalah token / Pages / cabang.
3. Kalau masih bingung, kirim nama langkah yang merah dan sekitar 20 baris terakhir lognya.

## Catatan
- Repositori privat memakai sekitar 300 menit Actions per hari untuk jadwal 15 menit (jatah gratis 2.000 menit per bulan).
  Gunakan repositori publik, atau ubah `*/15` di `update.yml` menjadi `0 * * * *` (tiap jam).
- Paket gratis football-data.org: 10 permintaan per menit. Skrip sudah menyesuaikan.
- Waktu satu run kira-kira 3 sampai 5 menit (10 liga football-data.org x 2 permintaan, jeda 6,5 detik demi batas 10 permintaan per menit).
- Liga dunia memakai data komunitas: bisa telat atau kurang lengkap, dan kegagalannya tidak menggagalkan deploy.
- Riwayat prediksi disimpan di situs itu sendiri (`history.json`). Jangan hapus deployment Pages tanpa perlu.
- Cabang utama harus `main` atau `master`.
- Tes lokal: `node bola-live/scripts/test.mjs`, `test-world.mjs`, `test-ci.mjs`.
