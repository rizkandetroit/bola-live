# Laporan Audit Bola Live V10

Tanggal audit: 11 November 2026

## Ringkasan

Audit statis dan pengujian lokal dilakukan pada seluruh paket V10 yang diunggah. Semua tes bawaan awal lulus. Audit menemukan beberapa cacat logika yang tidak tertangkap oleh tes awal; perbaikannya diterapkan pada paket ini.

## Temuan dan perbaikan

1. **xG dari feed tembakan parsial dapat dianggap nol untuk tim yang tidak muncul di feed.**
   - Dampak: xG/xGA rolling dan prediksi bisa bias ke bawah jika endpoint tembakan hanya mengembalikan tembakan satu tim.
   - Perbaikan: jika tembakan untuk sisi tertentu tidak ada, sistem mencoba memakai xG statistik pertandingan penuh. xG periode 1H tidak lagi dipakai sebagai xG satu pertandingan.
   - Jika provider tidak menyediakan periode `All`, nilai xG statistik dibiarkan kosong.

2. **Statistik advanced berpotensi tertukar antar tim.**
   - Dampak: bila ID tim pada payload tidak cocok, kode lama mengambil elemen array berdasarkan urutan dan dapat mengatribusikan PPDA/xT/VAEP ke tim yang salah.
   - Perbaikan: pencocokan berdasarkan ID tim; fallback posisi hanya dipakai jika semua objek advanced tidak memiliki ID tim.
   - Dashboard juga mencocokkan urutan metrik kandang/tandang berdasarkan ID, bukan asumsi urutan array.

3. **Kekuatan line-up sebelumnya memberi nilai netral 50 kepada pemain tanpa data historis.**
   - Dampak: komponen line-up dapat masuk ke ensemble seolah-olah punya bukti statistik, padahal data pemain belum ada.
   - Perbaikan: skor pemain yang tidak dikenal tidak diisi angka 50. Skor XI hanya tersedia bila minimal 5 pemain inti punya data historis; skor bangku cadangan hanya tersedia bila minimal 2 pemain punya data. Jika skor tidak tersedia, bobot line-up dikeluarkan dan bobot komponen lain dinormalisasi.

4. **Metrik progresi gabungan sebelumnya memperlakukan metrik yang hilang sebagai nol.**
   - Dampak: progressive pass yang tersedia tanpa progressive carry (atau sebaliknya) dapat menghasilkan skor progresi yang bias.
   - Perbaikan: skor progresi gabungan hanya dihitung jika kedua metrik tersedia.

5. **Tab analitik PitchAPI sebelumnya hanya merender fixture dari jendela tanggal pendek, padahal jadwal prediksi sebulan sudah diambil.**
   - Dampak: pertandingan setelah jendela pendek tidak muncul di tab analitik.
   - Perbaikan: tab menggabungkan `schedule` dan `fixtures`, lalu menghapus duplikasi berdasarkan ID pertandingan.

6. **Volume permintaan riwayat PitchAPI terlalu tinggi untuk workflow per jam.**
   - Perbaikan operasional: batas riwayat workflow diturunkan dari 80 menjadi 24 pertandingan dan riwayat per tim dari 5 menjadi 4. Ini membatasi beban API, tetapi dapat mengurangi jumlah sampel backtest dan cakupan profil tim. Sesuaikan kembali hanya setelah memastikan kuota paket API mencukupi.

## Pengujian

- `test-all.mjs`: lulus
- `test-ci.mjs`: lulus
- `test-intelligence.mjs`: lulus, termasuk regresi xG parsial, periode 1H, ID tim advanced yang tidak cocok, dan line-up tanpa data pemain
- `test-pitch.mjs`: lulus
- `test-pred.mjs`: lulus
- `test-world.mjs`: lulus
- `test.mjs`: lulus
- Sintaks JavaScript dashboard: lulus

## Batas audit

- API key pengguna tidak tersedia di arsip; tidak ada permintaan live yang dilakukan ke akun Football-Data.org, API-Football, atau PitchAPI.
- Karena itu status paket/kuota, cakupan kompetisi, bentuk payload aktual akun, dan validitas data real-time harus diverifikasi melalui workflow GitHub Actions setelah deployment.
- V8 asli tidak ada di arsip V9 sumber; baseline V8 pada backtest tetap proxy Poisson-only, bukan replay V8 asli.
- ROI tetap simulasi dengan odds asumsi, bukan hasil taruhan atau odds historis.
- Skor taktik dan performa masih heuristik berbobot tetap, belum bobot hasil training/optimasi historis.
- Probabilitas 1X2 V10 adalah ensemble beberapa komponen, sedangkan skor/OU/BTTS dihitung dari distribusi Poisson dengan lambda yang disesuaikan. Keduanya merupakan estimasi berbeda dan tidak harus identik secara matematis.
