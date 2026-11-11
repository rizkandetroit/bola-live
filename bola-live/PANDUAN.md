# Panduan Bola Live V10

## 1. Gambaran sistem

Bola Live V10 berjalan di GitHub Actions dan diterbitkan melalui GitHub Pages. Prediksi dasar tetap memakai model Poisson + Elo dari V9, kemudian disesuaikan dengan data line-up, xG/xGA, performa tim, dan taktik yang tersedia dari PitchAPI.

Folder utama:
- `.github/workflows/update.yml`: ambil data, jalankan V10, dan deploy.
- `.github/workflows/test.yml`: tes otomatis.
- `bola-live/scripts/`: model, pengambilan data, backtest, dan tes.
- `bola-live/site/`: dashboard dan file JSON hasil pemrosesan.

## 2. API dan GitHub Secrets

Buka repository GitHub → **Settings → Secrets and variables → Actions → New repository secret**. Buat secret berikut:

| Secret | Kegunaan | Status |
|---|---|---|
| `FOOTBALL_DATA_KEY` | Jadwal, klasemen, dan hasil 10 kompetisi utama | Wajib |
| `PITCHAPI_KEY` | Line-up, formasi, xG, shot map, PPDA, field tilt, xT, VAEP, pemain, dan backtest V10 | Wajib untuk fitur V10 penuh |
| `API_FOOTBALL_KEY` | Tambahan jadwal/skor kompetisi lain sesuai cakupan akun | Opsional |

API key harus disimpan sebagai GitHub Secret. Jangan memasukkannya ke `index.html`, file JSON publik, atau chat. PitchAPI menggunakan header server-side `X-API-KEY`; key tidak dikirim ke browser.

Jika `PITCHAPI_KEY` belum tersedia, workflow masih dapat menerbitkan data dasar V9, tetapi fitur Intelligence V10 akan dilewati.

## 3. Cara kerja intelligence V10

### Line-up dan kekuatan pemain
V10 membaca starting XI, cadangan, formasi, pelatih, dan status `confirmed` dari PitchAPI. Nilai performa pemain dibentuk dari kontribusi VAEP, xT, dan creation per 90 menit pada pertandingan sebelumnya. Kekuatan skuad menggabungkan nilai XI efektif dan cadangan (82% XI, 18% bangku cadangan). Bila data pemain historis belum ada, pemain diberi nilai netral dan tidak dianggap sebagai pemain buruk.

V10 membandingkan susunan terbaru dengan line-up historis. Pemain yang rutin menjadi starter tetapi tidak berada di XI utama dicatat sebagai indikasi. Statusnya dibedakan menjadi **Cadangan** atau **Tidak tercantum di XI/cadangan**. Ini tidak membuktikan pemain cedera, terkena sanksi, atau dicoret pelatih; pastikan melalui sumber berita/klub sebelum mengambil keputusan.

### Formasi dan taktik
Analisis formasi membaca struktur bek, gelandang, dan penyerang. Catatan matchup mempertimbangkan potensi kelebihan jumlah pemain di tengah, struktur tiga/empat bek, dan intensitas pressing. PPDA yang lebih rendah berarti tindakan pressing lebih rapat/agresif menurut definisi penyedia data. Catatan taktik sengaja diberi bobot kecil agar tidak mengalahkan data hasil dan peluang.

### xG dan shot map
xG utama dihitung dari nilai `expected_goals` setiap tembakan. Jika shot data tidak tersedia, sistem mencoba memakai statistik xG tim dari endpoint pertandingan. xGA merupakan xG lawan pada pertandingan yang sama. Shot map menggunakan koordinat PitchAPI pada lapangan 105 × 68 meter.

### Metrik performa tim
Profil rolling tim memakai hingga enam pertandingan terdahulu yang berhasil dikumpulkan, antara lain:
- xG for / xG against;
- PPDA;
- field tilt dan penguasaan wilayah;
- xT dan VAEP;
- progressive passes, progressive carries;
- final-third entries dan box entries.

Hanya laga yang waktunya lebih awal daripada waktu prediksi yang masuk ke profil historis. Bila jumlah sampel atau field tidak cukup, fitur tersebut tidak dipaksa menjadi nol.

### Bobot mesin prediksi
Bobot awal komponen V10:

| Komponen | Bobot |
|---|---:|
| Poisson berbasis hasil gol | 45% |
| Elo | 20% |
| xG/xGA | 15% |
| Performa tim (PPDA, field tilt, xT, VAEP, progresi) | 10% |
| Line-up (XI dan cadangan) | 7% |
| Kecocokan taktik | 3% |

Jika komponen tidak tersedia, bobot komponen yang tersedia dinormalisasi kembali agar total tetap 100%. Karena itu pertandingan tanpa line-up terkonfirmasi tetap dapat memperoleh prediksi, tetapi kontribusi line-up akan dikeluarkan. Di dashboard, lihat rincian bobot dan alasan untuk mengetahui fitur mana yang benar-benar digunakan.

## 4. Backtesting V8 vs V9 vs V10

Tab **Evaluasi** menampilkan akurasi 1X2, Brier Score, Log Loss, dan simulasi ROI untuk tiga baseline pada sampel PitchAPI yang sama.

- **V8 benchmark proxy:** Poisson-only. Arsip kode V8 tidak ada di ZIP V9 yang diberikan, jadi angka ini bukan replay V8 asli.
- **V9:** Poisson + Elo 70/30 dengan kalibrasi peluang.
- **V10:** komponen V9 ditambah xG, performa tim, line-up, dan matchup taktik.

Backtest membatasi data historis pada laga yang berlangsung sebelum pertandingan yang sedang dinilai. Line-up historis diasumsikan tersedia saat mendekati kick-off (ketika susunan pemain diumumkan), bukan beberapa hari sebelum kick-off.

**Simulasi profitabilitas bukan profit aktual.** API yang digunakan tidak menyediakan odds historis bookmaker. Default simulasi memakai odds desimal asumsi 2,00, stake 1 unit, dan hanya memasang taruhan jika probabilitas tertinggi minimal 55%. Pengaturan ada pada environment `V10_SIM_ODDS` dan `V10_SIM_MIN_PROB` di workflow. Ubah angka tersebut untuk menguji sensitivitas; jangan menganggapnya sebagai hasil betting sungguhan.

Agar perbandingan V8 benar-benar sama dengan versi historis yang pernah digunakan, arsip kode/model V8 perlu ditambahkan. Tanpa itu, baseline Poisson-only proxy adalah perbandingan yang transparan, bukan klaim kesetaraan kode.

## 5. Jadwal pembaruan dan batas data

Workflow dijalankan setiap jam dan dapat dijalankan manual melalui tab **Actions → Update dan deploy → Run workflow**.

Parameter default di workflow:
- `PITCH_MAX_LINEUPS=48`: batas fixture yang dimintakan line-up.
- `PITCH_HISTORY_PER_TEAM=5`: pertandingan terdahulu yang dicari untuk setiap tim.
- `PITCH_MAX_HISTORY_MATCHES=80`: batas keseluruhan pertandingan historis untuk membangun profil tim.
- `PITCH_FUTURE_DAYS=31`: horizon jadwal yang disinkronkan untuk kompetisi aktif.
- `PITCH_MAX_ANALYTICS=12`: jumlah pertandingan terbaru yang ditampilkan pada bagian analitik tanggal.

Kompetisi aktif dikenali dari fixture PitchAPI yang muncul pada jendela tanggal harian. Karena itu cakupan V10 dapat bertambah saat kompetisi tersebut memasuki jendela jadwal. Jika penyedia tidak memiliki analitik untuk pertandingan tertentu, kartu tetap muncul dengan catatan data belum tersedia.

## 6. Menjalankan dan menguji secara lokal

Persyaratan Node.js 24 (workflow menggunakan Node 24). Di folder repository jalankan:

```bash
node bola-live/scripts/test.mjs
node bola-live/scripts/test-world.mjs
node bola-live/scripts/test-all.mjs
node bola-live/scripts/test-pred.mjs
node bola-live/scripts/test-ci.mjs
node bola-live/scripts/test-pitch.mjs
node bola-live/scripts/test-intelligence.mjs
```

Tes `test-intelligence.mjs` memeriksa pembentukan profil rolling, line-up, indikasi pemain kunci, bobot model, prediksi 1X2, dan backtest tiga versi dengan data tiruan.

## 7. Jika fitur V10 tidak muncul

1. Pastikan secret `PITCHAPI_KEY` tersedia dan tidak memiliki tanda kutip/spasi tambahan.
2. Buka **Actions**, jalankan workflow secara manual, lalu periksa langkah **Ambil line-up dan analitik (PitchAPI)**.
3. Buka situs Pages dan periksa tab **Skuad & Analitik**. Jika line-up belum tersedia, periksa apakah pertandingan berada dalam rentang 48 jam dan apakah PitchAPI telah menerbitkan susunannya.
4. Jika prediksi utama masih berlabel fallback, pastikan data tim dan waktu pertandingan dapat dipasangkan antara penyedia jadwal dan PitchAPI. Pencocokan memakai nama kandang/tandang dan toleransi waktu enam jam.

## 8. Catatan keselamatan interpretasi

Prediksi statistik bukan kepastian hasil. Metrik xG dari satu penyedia jangan dicampur dengan xG dari model penyedia lain. Line-up prediksi berbeda dari line-up terkonfirmasi. Indikasi pemain tidak tercantum bukan bukti cedera. ROI memakai odds asumsi dan bukan rekomendasi taruhan atau klaim profit.

## Model ringkas (V11)
Persentase yang tampil memakai Poisson-gol 60%, Poisson-xG 25%, Elo 15%; tanpa xG yang cukup otomatis gol 70% + Elo 30%.
V10 penuh tetap dihitung sebagai pembanding, dan tab Evaluasi menilai keduanya. Pengaturan ada di `update.yml`:
`V10_HEADLINE` (`lite` atau `v10`) dan `V10_MIN_XG_GAMES`. Rincian di `CATATAN_V11.md`.
