# Bola Live

Dasbor jadwal, skor live, dan analisis prediksi sepak bola. Berjalan otomatis di GitHub Actions dan tayang di GitHub Pages: <https://rizkandetroit.github.io/bola-live/>

## Cara kerja singkat

1. Workflow **Update dan deploy** (`.github/workflows/update.yml`) jalan tiap ±5 menit.
   - Mode **ringan**: skor live dan jadwal.
   - Mode **berat** (±1 jam sekali, atau tiap ada upload): klasemen, detail laga (Match Center), Model BL, uji mundur 90 hari.
2. Data diambil dari **BSD** (sumber utama, semua liga) dan **Highlightly** (liga Asia Tenggara: Liga 1/2 Indonesia, Thailand, Malaysia, dll.).
3. Hasil ditulis sebagai file JSON di `bola-live/site/` lalu diterbitkan ke GitHub Pages. Data run sebelumnya dibawa lewat cache agar riwayat tidak hilang.
4. Sebelum tayang, `guard.mjs` memeriksa data tidak menyusut drastis. Tes otomatis wajib lulus atau deploy dibatalkan.

## Isi folder `bola-live/scripts`

| File | Fungsi |
|---|---|
| `bsd.mjs` | Ambil semua liga dari BSD, Match Center, klasemen, Model BL, riwayat & evaluasi prediksi, uji mundur |
| `highlightly.mjs` | Liga Asia Tenggara dari Highlightly (dengan batas kuota harian) |
| `model.mjs`, `stack.mjs`, `factors.mjs`, `players.mjs`, `xgc.mjs` | Model BL (Dixon-Coles), koreksi bertumpuk, uji faktor, kekuatan pemain, uji xG vs peluang |
| `rekam.mjs` | Arsip rekam jejak prediksi per laga (`rekam-index.json`, `rekam-YYYY-MM.json`): angka dikunci saat kickoff, hanya hasil yang diisi sesudahnya |
| `laporan.mjs`, `trap.mjs` | Laporan pagi (rekap hari bola kemarin) dan uji "tim penipu" |
| `lib.mjs` | Fungsi model dasar (Poisson + Elo) yang dipakai bersama |
| `net.mjs` | Utilitas jaringan & penyimpanan state |
| `carry.mjs` | Menentukan mode ringan/berat |
| `preflight.mjs` | Cek awal: langganan BSD, GitHub Pages, cabang |
| `guard.mjs` | Penjaga sebelum tayang; juga menulis `health.json` (Data Health Center) |
| `health.mjs` | Pemeriksaan kesehatan data: API, umur data, kelengkapan per laga, anomali, versi (hanya membaca) |
| `check-bsd-history.mjs`, `check-highlightly.mjs` | Alat cek manual (workflow "sekali jalan") |
| `test*.mjs`, `fixtures/` | Tes otomatis |

Tampilan web seluruhnya ada di `bola-live/site/index.html`.

## Pengaturan (Settings › Secrets and variables › Actions)

- **Secrets:** `BSD_API_KEY`, `HIGHLIGHTLY_KEY`, `BACKUP_KEY`.
- **Variables:** `BSD_EXPIRES` (tanggal akhir langganan BSD, mis. `2026-12-19`), `BL_NEUTRAL` (mode netral), `BL_NOINDEX`, `FORCE_HEAVY` (paksa mode berat), `GUARD_ALLOW_SHRINK` (izinkan data menyusut sekali).

## Tes

```
for t in test.mjs test-bsd.mjs test-ui.mjs test-ci.mjs test-guard.mjs; do node bola-live/scripts/$t; done
```

## Aturan penting

- Prediksi di kartu = angka BSD apa adanya. Faktor tambahan hanya dipakai bila lolos uji mundur tanpa kebocoran data.
- Mode netral: tidak menampilkan angka odds atau promosi taruhan.
