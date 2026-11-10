# Panduan Bola Live

## Struktur repositori
Di akar repositori ada dua hal: folder `.github/workflows/` (berisi `update.yml` dan `test.yml`) dan folder `bola-live/`
(berisi `scripts/`, `site/`, `PANDUAN.md`, `README.md`). Semua path di workflow sudah memakai awalan `bola-live/`.

## Isi (mode Rp0, semua gratis)
- Liga Eropa dan Brasil (football-data.org, paket gratis): Premier League, Serie A, Bundesliga, La Liga, Ligue 1, Champions League,
  Eredivisie, Primeira Liga, Championship, Brasileirão. Yang di luar paket akun Anda (HTTP 403) dilewati otomatis.
- Liga lain (TheSportsDB, data komunitas): daftar di `bola-live/scripts/world-leagues.json`, ditulis sebagai ID, contoh
  `{"id":4790,"name":"Liga 1 Indonesia"}`. Katalog gratis TheSportsDB hanya memuat 10 liga, jadi **memakai ID jauh lebih andal daripada nama**.
  Untuk liga baru, buka halaman liganya di thesportsdb.com; angka di akhir alamat (mis. `/league/4790`) adalah ID-nya.
- Liga yang jumlah lakanya diduga terpotong batas paket gratis diberi tanda "terbatas" di kartu; klasemen dan peluangnya kasar.
- Model: Poisson dari hasil laga musim ini digabung Elo (70/30), lalu ditarik ke frekuensi hasil liga (kalibrasi).
- Tab Evaluasi: uji mundur (tanpa mengintip) dan uji langsung (prediksi dikunci sebelum kick-off).

## Secret yang dipakai
- `FOOTBALL_DATA_KEY` (wajib): token football-data.org.
- `TSDB_KEY` (opsional): kosongkan untuk paket gratis (otomatis memakai kunci `123`). Isi hanya jika kelak berlangganan premium TheSportsDB.

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
