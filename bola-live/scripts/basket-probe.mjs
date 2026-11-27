// Cek sekali jalan: apakah API basket BSD sudah bisa dipakai, liga apa saja, dan berapa kuota hariannya.
// Hanya MEMBACA. Tidak menulis file web, tidak menyentuh data produksi. Paling banyak ±8 permintaan.
// Kunci dibaca dari env BSD_API_KEY (secret GitHub) dan tidak pernah dicetak.
const KEY = (process.env.BSD_API_KEY || "").trim();
const ROOT = (process.env.BSD_ROOT || "https://sports.bzzoiro.com").replace(/\/+$/, "");
const BB = ROOT + "/basketball/api/v2";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hide = s => (KEY ? String(s).split(KEY).join("***") : String(s));

async function get(url, auth = true) {
  const r = await fetch(url, { headers: { Accept: "application/json", ...(auth && KEY ? { Authorization: "Token " + KEY } : {}) }, signal: AbortSignal.timeout(20000) });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t) } catch {}
  return { s: r.status, j, t: t.slice(0, 300), pol: r.headers.get("ratelimit-policy"), rl: r.headers.get("ratelimit") };
}
const list = j => (Array.isArray(j) ? j : (j && (j.results || j.data)) || []);

console.log("== 1. Status musim semua olahraga (tanpa kunci)");
const cov = await get(ROOT + "/api/v2/coverage/", false);
if (cov.s !== 200) console.log("coverage HTTP", cov.s, hide(cov.t));
else for (const c of (Array.isArray(cov.j) ? cov.j : cov.j.results || cov.j.sports || [cov.j]))
  console.log(" ", c.sport, "·", c.status, "· 7 hari:", c.events_next_7d, "· 30 hari:", c.events_next_30d, "· ada harga 7 hari:", c.priced_next_7d, "· live:", c.live_now, "· berikutnya:", c.next_event_at);

if (!KEY) { console.log("\nBSD_API_KEY tidak ada: berhenti di sini."); process.exit(0); }

console.log("\n== 2. Akses API basket");
const lg = await get(BB + "/leagues/?include_inactive=true&limit=200");
console.log("HTTP", lg.s, "· RateLimit-Policy:", lg.pol || "-", "· RateLimit:", lg.rl || "-");
if (lg.s === 402) { console.log("Add-on Sports belum aktif di akun ini (402)."); process.exit(0); }
if (lg.s === 401) { console.log("Kunci ditolak (401)."); process.exit(0); }
if (lg.s !== 200) { console.log("Gagal:", hide(lg.t)); process.exit(0); }

const L = list(lg.j);
console.log("\n== 3. Liga basket:", lg.j.count ?? L.length);
for (const x of L) console.log(" ", x.id, "·", x.name, "·", x.country || x.country_code || "-", "·", x.is_active === false ? "tidak aktif" : "aktif", x.current_season ? "· musim " + (x.current_season.name || x.current_season.year) : "");
if (L[0]) console.log("contoh kunci liga:", Object.keys(L[0]).join(", "));
await sleep(500);

console.log("\n== 4. Pertandingan 7 hari ke depan (bawaan API)");
const ev = await get(BB + "/events/?limit=200");
const E = list(ev.j), per = {};
for (const e of E) { const k = (e.league && e.league.name) || "?"; per[k] = (per[k] || 0) + 1 }
console.log("HTTP", ev.s, "· total:", ev.j && ev.j.count, "· di halaman ini:", E.length, "· RateLimit:", ev.rl || "-");
for (const [k, n] of Object.entries(per).sort((a, b) => b[1] - a[1])) console.log(" ", n, "×", k);
if (E[0]) console.log("contoh laga:", JSON.stringify(E[0]).slice(0, 500));
await sleep(500);

console.log("\n== 5. Prediksi BSD (7 hari)");
const pr = await get(BB + "/predictions/?days=7&limit=200");
const P = list(pr.j);
console.log("HTTP", pr.s, "· total:", pr.j && pr.j.count, "· RateLimit:", pr.rl || "-");
if (P[0]) console.log("contoh:", JSON.stringify(P[0]).slice(0, 400));
const cover = E.length ? Math.round(100 * E.filter(e => P.some(p => p.event_id === e.id)).length / E.length) : 0;
console.log("laga di halaman 4 yang punya prediksi:", cover + "%");
await sleep(500);

// Satu laga selesai untuk melihat isi pregame, team-stats, dan box score (nama field tidak ada di dokumen)
const done = await get(BB + "/events/?status=finished&limit=1");
const g = list(done.j)[0];
if (g) {
  console.log("\n== 6. Isi detail satu laga selesai:", g.id, (g.home_team || {}).name, g.home_score, "-", g.away_score, (g.away_team || {}).name);
  for (const p of ["team-stats", "pregame", "box-score"]) {
    await sleep(500);
    const d = await get(BB + "/events/" + g.id + "/" + p + "/");
    console.log(" ", p, "HTTP", d.s, "· kunci:", d.j ? Object.keys(d.j).join(", ") : "-", "·", d.j ? JSON.stringify(d.j).slice(0, 600) : hide(d.t));
  }
}
console.log("\nSelesai. Sisa kuota terakhir (RateLimit):", (done.rl || pr.rl || "-"));
