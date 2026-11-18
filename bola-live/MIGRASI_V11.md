# Migrasi V10 → V11 (rombak sumber data)

Prinsip: BSD menjadi sumber utama untuk jadwal, skor, live, H2H, prediksi, dan logo semua liga.
Model sendiri (Poisson + Elo + backtest) dan lapisan V10 tetap ada.

## Dihapus
| Berkas | Alasan |
|---|---|
| `scripts/all.mjs`, `test-all.mjs`, `test-pred.mjs` | API-Football (jadwal). Kuota 100/hari, kini digantikan `/events/` BSD. |
| `scripts/sportapi.mjs`, `test-sportapi.mjs` | SportAPI (jadwal + riwayat 120 hari untuk model per liga). Digantikan prediksi BSD yang tersedia untuk semua liga. |
| `scripts/h2h.mjs`, `scripts/fotmob-h2h.mjs`, dependensi `@max-xoo/fotmob` | H2H kini tertanam di tiap laga dari BSD (tanpa permintaan tambahan). Pustaka FotMob tak resmi dibuang. |
| `scripts/world.mjs`, `world-leagues.json`, `test-world.mjs` | TheSportsDB, sudah dimatikan (`if: false`) di workflow. |
| `scripts/leagues-filter.mjs`, `bsd-leagues.json` | Daftar putih liga hanya perlu saat banyak sumber. Dengan satu sumber, liga ditentukan BSD. |
| `.github/workflows/cek-api.yml` | Pemeriksaan kunci API-Football. |
| Langkah `npm install` di workflow | Tidak ada dependensi lagi. |

## Dipertahankan
- `update.mjs`, `lib.mjs`: model Poisson + Elo, kalibrasi, backtest (`data.json`, `eval.json`) untuk 10 kompetisi football-data.org.
- `understat.mjs`, `pitch.mjs`, `intelligence.mjs`: xG dan lapisan V10 (opsional, dilewati bila kunci kosong).
- `net.mjs`, `preflight.mjs`, workflow `test.yml`, dan dasbor `site/index.html`.

## Diubah
- `scripts/bsd.mjs` ditulis ulang sebagai sumber utama. Perbaikan atas versi lama:
  1. Status `2nd_half`/`1st_half` ikut dikenali sebagai LIVE (sebelumnya laga babak kedua terbuang).
  2. Nama liga diambil dari `/leagues/` (laga hanya membawa `league_id`, sebelumnya tampil "Liga 65").
  3. Prediksi memakai `date_from/date_to` + `limit=200` (sebelumnya 200 prediksi pertama tanpa filter).
  4. Jadwal 1–2 permintaan (`date_from/date_to`), bukan satu permintaan per hari.
  5. `xg` berbentuk array `[tuan rumah, tamu]` sesuai yang dibaca dasbor.
  6. 401/402/403 dan 429 `taster_exhausted` berhenti cepat dengan pesan jelas; 429 `rate_limited` menunggu 1 detik.
  7. Laga tanpa prediksi BSD tampil sebagai jadwal saja (bukan tebakan keuntungan tuan rumah 45/28/27).
- `site/index.html`: tag "BSD" (bukan "komunitas"), laga BSD ikut masuk 14 kartu teratas, menit live / turun minum, logo liga dan klub dari `/img/`, tabel H2H dari data BSD, tidak lagi memanggil `world.json`.
- `update.yml`: tinggal preflight → update → bsd → understat → pitch → deploy.

## Perkiraan pemakaian kuota BSD
Sekitar 4–6 permintaan per putaran (events 1–2, prediksi 1–2, liga 1). Dengan cron tiap jam: kurang dari 150 per hari dari 7.500.

## Belum disentuh (keputusan di tangan kamu)
- Tab "Skor Live" memakai CDN StatsHub SBOBET lewat proxy publik allorigins. Rapuh dan bergantung pada situs taruhan; data live BSD (status LIVE di `all.json`) bisa menggantikannya.
- Akurasi prediksi BSD belum diukur. Tab Evaluasi hanya menilai model sendiri.
