# Catatan V11: model ringkas (gol 60 + xG 25 + Elo 15)

Dibuat di atas V10 (audit) tanpa menimpa mesin V10. Isi V10 yang sudah ada (xG 15%, performa, line-up, taktik) tetap dihitung
dan dipakai sebagai pembanding. Yang ditambahkan:

## 1. Model ringkas (`predictLite` di `intelligence.mjs`)
- Poisson-gol 60%, Poisson-xG 25%, Elo 15%, lalu dikalibrasi seperti sebelumnya.
- **Syarat xG aktif:** tiap tim punya minimal `V10_MIN_XG_GAMES` laga yang berdata xG (untuk dan lawan sekaligus).
  Bila tidak terpenuhi, komponen xG dilewati otomatis dan bobot kembali ke **gol 70% + Elo 30%**.
- **Bawaan 3, bukan 5.** Workflow V10 mengambil riwayat hanya 4 laga per tim (`PITCH_HISTORY_PER_TEAM: 4`, diturunkan audit demi kuota),
  jadi ambang 5 tidak akan pernah terpenuhi. Mau 5? Ubah `V10_MIN_XG_GAMES: 5` DAN naikkan `PITCH_HISTORY_PER_TEAM` ke 6,
  tetapi pastikan kuota PitchAPI Anda cukup.
- xG yang hilang tetap `null`, tidak pernah dianggap 0. Tanpa data, tidak ada pembagian dengan nol (dicek di `test-lite.mjs`).
- Line-up, performa, dan taktik **tidak** menjadi pengali di model ringkas; line-up hanya catatan teks.

## 2. Tampilan utama
- `V10_HEADLINE: lite` (bawaan) memakai model ringkas untuk persentase yang tampil. Isi `v10` untuk kembali ke V10 penuh.
  Keduanya selalu tersimpan di `p.lite` dan `p.v10`.
- Kartu menyebut "V10 penuh" pada baris kecil di bawahnya sebagai pembanding.

## 3. Narasi "Kenapa X?"
- Tiga baris komponen beserta bobot dan angka 1X2-nya, lalu "Hasil gabungan".
- Angka xG mentah: xG rata-rata tim dan xG yang kebobolan lawan. Kalimat "pertahanan mungkin lebih rapuh dari yang terlihat di papan skor"
  hanya muncul bila xG kebobolan setidaknya 0,3 di atas rata-rata gol kebobolan musim ini.
- Bila xG kurang data: kalimat otomatis "xG belum cukup data (...); prediksi memakai gol + Elo saja."
- Catatan skuad (teks saja): pemain reguler yang tidak tercantum di line-up **terkonfirmasi**, disebut sebagai indikasi rotasi atau
  ketidaktersediaan, bukan konfirmasi cedera. Hanya muncul bila line-up sudah terkonfirmasi.
- Kalimat lama "Elo (bagian dari gabungan 70/30)" dihapus karena sudah tidak benar untuk V10.

## 4. Tab Evaluasi
- Baris baru "V10-ringkas" di tabel perbandingan (V8, V9, V10 penuh, ringkas) pada sampel yang sama.
- Tabel terpisah **hanya laga saat xG aktif**: V9 (gol + Elo saja) vs ringkas vs V10 penuh. Inilah jawaban apakah xG benar-benar membantu.
- Sampel di bawah 30 laga diberi peringatan agar tidak disimpulkan terlalu cepat.

## Yang sengaja tidak dikerjakan
Pembanding odds dan penyesuaian line-up ke angka, sesuai keputusan Anda.

## Tes
`test-lite.mjs` (model, ambang xG, data kosong, pilihan tampilan utama, evaluasi) dan `test-ui.mjs` (narasi dan tabel Evaluasi)
ditambahkan ke workflow Tes. Seluruh tes V10 sebelumnya tetap lulus.
