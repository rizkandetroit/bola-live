# Bola live

Dashboard pribadi: pertandingan 5 liga Eropa hari ini dan besok, klasemen, peluang menang, dan 8 tim teratas. Diperbarui otomatis tiap 15 menit lewat GitHub Actions, tampil di GitHub Pages.

## Pasang (sekali saja)
1. Daftar di football-data.org, ambil API token gratis dari email atau halaman akun.
2. Di GitHub, buat repositori PUBLIK baru, misalnya `bola-live`.
3. Upload semua isi folder ini. Folder `.github/workflows/update.yml` harus ikut. Kalau folder tersembunyi tidak terbawa: Add file > Create new file, ketik path `.github/workflows/update.yml`, lalu tempel isinya.
4. Settings > Secrets and variables > Actions > New repository secret. Nama `FOOTBALL_DATA_KEY`, isi token tadi.
5. Settings > Pages > Source: pilih **GitHub Actions**.
6. Tab Actions > "Update dan deploy" > Run workflow. Tunggu sekitar 2 menit sampai hijau.
7. Buka `https://NAMA-GITHUB.github.io/bola-live/`

## Catatan
- Repositori harus publik agar Pages dan Actions gratis tanpa batas menit. Token API tetap aman di Secrets.
- GitHub bisa menonaktifkan jadwal otomatis kalau repositori tidak ada aktivitas 60 hari. Tinggal klik Run workflow lagi.
- Jadwal GitHub kadang telat beberapa menit. Skor di paket gratis football-data.org bisa terlambat.
- Tes lokal: `node scripts/test.mjs`
