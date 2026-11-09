# Panduan Bola Live

## Struktur repositori
Di akar repositori ada dua hal: folder `.github/workflows/` (berisi `update.yml` dan `test.yml`) dan folder `bola-live/`
(berisi `scripts/`, `site/`, `PANDUAN.md`, `README.md`). Semua path di workflow sudah memakai awalan `bola-live/`.

## Isi
- Liga Eropa (football-data.org, paket gratis): Premier League, Serie A, Bundesliga, La Liga, Ligue 1.
- Liga dunia (TheSportsDB, data komunitas): daftar di `bola-live/scripts/world-leagues.json`. Ubah daftar itu untuk
  menambah atau mengurangi liga (tulis nama liga, atau nomor ID dari tab Evaluasi bagian katalog).
- Model: Poisson dari hasil laga musim ini digabung Elo (70/30), lalu ditarik ke frekuensi hasil liga (kalibrasi).
- Tab Evaluasi: uji mundur (tanpa mengintip) dan uji langsung (prediksi dikunci sebelum kick-off).

## Bila merah
1. Buka tab **Actions**, klik run yang gagal, lihat **langkah yang bertanda silang merah**.
2. Buka halaman **Summary** run itu: bagian **Pemeriksaan awal** menjelaskan masalah token / Pages / cabang.
3. Kalau masih bingung, kirim nama langkah yang merah dan sekitar 20 baris terakhir lognya.

## Catatan
- Repositori privat memakai sekitar 300 menit Actions per hari untuk jadwal 15 menit (jatah gratis 2.000 menit per bulan).
  Gunakan repositori publik, atau ubah `*/15` di `update.yml` menjadi `0 * * * *` (tiap jam).
- Paket gratis football-data.org: 10 permintaan per menit. Skrip sudah menyesuaikan.
- Liga dunia memakai data komunitas: bisa telat atau kurang lengkap, dan kegagalannya tidak menggagalkan deploy.
- Riwayat prediksi disimpan di situs itu sendiri (`history.json`). Jangan hapus deployment Pages tanpa perlu.
- Cabang utama harus `main` atau `master`.
- Tes lokal: `node bola-live/scripts/test.mjs`, `test-world.mjs`, `test-ci.mjs`.
