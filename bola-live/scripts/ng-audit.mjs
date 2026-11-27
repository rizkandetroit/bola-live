// Audit sekali jalan: rekam jejak "Next to Score" BSD (/api/v2/next-goal/calls/).
// Hanya MEMBACA data dan menulis ringkasan ke log. Tidak menulis file web, tidak menyentuh data produksi.
// Kunci dibaca dari env BSD_API_KEY (secret GitHub) dan tidak pernah dicetak.
const KEY = process.env.BSD_API_KEY;
const BASE = (process.env.BSD_API || "https://sports.bzzoiro.com/api/v2").replace(/\/+$/, "");
if (!KEY) { console.error("BSD_API_KEY tidak ada"); process.exit(1); }
const MAX_PAGES = +(process.env.NG_MAX_PAGES || 200);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: { Authorization: "Token " + KEY, Accept: "application/json" } });
    if (r.status === 429 || r.status >= 500) { await sleep(2000 * (i + 1)); continue; }
    const t = await r.text();
    if (!r.ok) throw new Error("HTTP " + r.status + " " + t.slice(0, 200));
    return JSON.parse(t);
  }
  throw new Error("gagal setelah 4 kali: " + url.replace(KEY, "***"));
}

// Ambil semua halaman (format DRF {count,next,results} atau array, atau {calls:[...]})
const rows = [];
let url = BASE + "/next-goal/calls/", page = 0, first = null;
while (url && page < MAX_PAGES) {
  const j = await get(url); page++;
  if (!first) first = j;
  const list = Array.isArray(j) ? j : j.results || j.calls || j.data || j.items || [];
  rows.push(...list);
  url = Array.isArray(j) ? null : j.next || null;
  if (url && !/^https?:/.test(url)) url = new URL(url, BASE).toString();
  await sleep(300);
}
console.log("== Struktur");
console.log("kunci tingkat atas:", Array.isArray(first) ? "(array)" : Object.keys(first || {}).join(", "));
if (first && !Array.isArray(first)) for (const k of Object.keys(first)) if (!Array.isArray(first[k]) && typeof first[k] !== "object") console.log("  ", k, "=", JSON.stringify(first[k]).slice(0, 120));
console.log("halaman:", page, "· entri:", rows.length);
for (const e of rows.slice(0, 3)) console.log("contoh:", JSON.stringify(e).slice(0, 900));

// Cari nama field secara otomatis
const keys = new Set(rows.flatMap(e => Object.keys(flat(e))));   // panggil flat(e) saja (bukan flat sebagai callback map)
function flat(o, p = "", out = {}) { for (const [k, v] of Object.entries(o || {})) { const q = p ? p + "." + k : k; if (v && typeof v === "object" && !Array.isArray(v)) flat(v, q, out); else out[q] = v; } return out; }
const pick = re => [...keys].find(k => re.test(k));
const fConf = pick(/(^|\.)(confidence|probability|prob|p_call|pct|percent)$/i) || pick(/conf|prob/i);
const fRes = keys.has("outcome") ? "outcome" : pick(/(^|\.)(result|outcome|graded|verdict)$/i);
const fOk = pick(/(^|\.)(correct|is_correct|hit|won|success)$/i);
const fSide = pick(/(^|\.)(side|team_side|called_side|pick)$/i);
const fMin = pick(/(^|\.)(minute|min|called_minute)$/i);
const fLg = pick(/league.*name|competition.*name|(^|\.)league$/i);
const fAt = pick(/(created|called)_?at|timestamp|(^|\.)time$/i);
console.log("\n== Field yang dipakai:", JSON.stringify({ fConf, fRes, fOk, fSide, fMin, fLg, fAt }));
console.log("semua field:", [...keys].sort().join(", "));

const F = rows.map(e => flat(e));
const vals = f => { const m = new Map(); for (const e of F) { const v = String(e[f]); m.set(v, (m.get(v) || 0) + 1); } return [...m].sort((a, b) => b[1] - a[1]).slice(0, 12); };
if (fRes) console.log("nilai", fRes, ":", JSON.stringify(vals(fRes)));
if (fSide) console.log("nilai", fSide, ":", JSON.stringify(vals(fSide)));

// Tentukan benar/salah/belum/tanpa gol
function verdict(e) {
  if (fOk && e[fOk] != null) return e[fOk] === true || e[fOk] === 1 || e[fOk] === "true" ? "benar" : e[fOk] === false || e[fOk] === 0 || e[fOk] === "false" ? "salah" : "lain";
  const v = String(e[fRes] ?? "").toLowerCase();
  if (/pending|open|live|waiting|null|undefined|^$/.test(v)) return "belum";
  if (v === "hit") return "benar"; if (v === "miss") return "salah";
  if (/no.?goal|void|none|expired|no_more/.test(v)) return "tanpa gol";
  if (/(^|_)(hit|correct|won|win|success|scored|yes|true)/.test(v)) return "benar";
  if (/(miss|wrong|lost|lose|fail|other|no|false)/.test(v)) return "salah";
  return "lain";
}
const conf = e => { let c = +e[fConf]; if (!isFinite(c)) return null; return c <= 1 ? c * 100 : c; };
const V = F.map(e => ({ v: verdict(e), c: conf(e), side: e[fSide], lg: e[fLg], min: +e[fMin], at: e[fAt] }));
const cnt = k => V.filter(x => x.v === k).length;
console.log("\n== Ringkasan");
console.log(JSON.stringify({ total: V.length, benar: cnt("benar"), salah: cnt("salah"), belum: cnt("belum"), tanpaGol: cnt("tanpa gol"), lain: cnt("lain") }));
const G = V.filter(x => x.v === "benar" || x.v === "salah");
const se = (h, n) => Math.sqrt(h / n * (1 - h / n) / n) * 100;
if (G.length) {
  const h = G.filter(x => x.v === "benar").length;
  console.log(`akurasi (tanpa 'tanpa gol' & belum): ${h}/${G.length} = ${(h / G.length * 100).toFixed(1)}% ± ${(1.96 * se(h, G.length)).toFixed(1)}`);
  const G2 = V.filter(x => ["benar", "salah", "tanpa gol"].includes(x.v)), h2 = G2.filter(x => x.v === "benar").length;
  console.log(`akurasi bila 'tanpa gol' dihitung salah: ${h2}/${G2.length} = ${(h2 / G2.length * 100).toFixed(1)}%`);
  const wc = G.filter(x => x.c != null);
  if (wc.length) {
    console.log("\n== Kalibrasi per keyakinan (keyakinan rata-rata vs benar nyata)");
    for (const [a, b] of [[0, 60], [60, 65], [65, 70], [70, 75], [75, 80], [80, 85], [85, 90], [90, 101]]) {
      const B = wc.filter(x => x.c >= a && x.c < b); if (!B.length) continue;
      const hb = B.filter(x => x.v === "benar").length, mc = B.reduce((s, x) => s + x.c, 0) / B.length;
      console.log(`  ${a}-${b === 101 ? 100 : b}%: n=${B.length} · keyakinan ${mc.toFixed(1)}% · benar ${(hb / B.length * 100).toFixed(1)}% ± ${(1.96 * se(hb, B.length)).toFixed(1)}`);
    }
    const mc = wc.reduce((s, x) => s + x.c, 0) / wc.length, br = wc.reduce((s, x) => s + (x.c / 100 - (x.v === "benar" ? 1 : 0)) ** 2, 0) / wc.length;
    const ll = wc.reduce((s, x) => s - Math.log(Math.max(1e-6, x.v === "benar" ? x.c / 100 : 1 - x.c / 100)), 0) / wc.length;
    console.log(`  keseluruhan: keyakinan rata-rata ${mc.toFixed(1)}% · Brier ${br.toFixed(4)} · log loss ${ll.toFixed(4)}`);
  }
  if (fSide) {
    console.log("\n== Per sisi yang dipilih");
    const sides = [...new Set(G.map(x => String(x.side)))];
    for (const s of sides) { const B = G.filter(x => String(x.side) === s), hb = B.filter(x => x.v === "benar").length; console.log(`  ${s}: n=${B.length} · benar ${(hb / B.length * 100).toFixed(1)}%`); }
  }
  if (fMin) {
    console.log("\n== Per menit call");
    for (const [a, b] of [[0, 30], [30, 60], [60, 75], [75, 200]]) { const B = G.filter(x => x.min >= a && x.min < b); if (!B.length) continue; const hb = B.filter(x => x.v === "benar").length; console.log(`  ${a}-${b === 200 ? "akhir" : b}': n=${B.length} · benar ${(hb / B.length * 100).toFixed(1)}%`); }
  }
  if (fAt) {
    const ts = G.map(x => Date.parse(x.at)).filter(isFinite).sort((a, b) => a - b);
    if (ts.length) console.log("\nrentang waktu:", new Date(ts[0]).toISOString(), "→", new Date(ts[ts.length - 1]).toISOString());
    // Stabilitas: separuh awal vs separuh akhir
    const S = G.filter(x => isFinite(Date.parse(x.at))).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)), m = Math.floor(S.length / 2);
    if (m > 20) for (const [nm, B] of [["separuh awal", S.slice(0, m)], ["separuh akhir", S.slice(m)]]) { const hb = B.filter(x => x.v === "benar").length; console.log(`  ${nm}: n=${B.length} · benar ${(hb / B.length * 100).toFixed(1)}%`); }
  }
  if (fLg) {
    console.log("\n== 10 kompetisi terbanyak");
    const m = new Map(); for (const x of G) { const k = String(x.lg); const o = m.get(k) || [0, 0]; o[0]++; if (x.v === "benar") o[1]++; m.set(k, o); }
    for (const [k, [n, hb]] of [...m].sort((a, b) => b[1][0] - a[1][0]).slice(0, 10)) console.log(`  ${k}: n=${n} · benar ${(hb / n * 100).toFixed(1)}%`);
  }
}

// Pembanding sederhana pada call yang SAMA: "tim unggulan sebelum laga (peluang BSD pra-laga) mencetak gol berikutnya",
// dan "tuan rumah mencetak gol berikutnya". Dari outcome: bila tebakan sederhana = sisi yang dipanggil, benar = hit; bila beda, benar = miss.
try {
  const H = await (await fetch("https://rizkandetroit.github.io/bola-live/bsd-history.json?t=" + Date.now())).json();
  const list = Array.isArray(H) ? H : H.rows || H.items || H.h || [];
  const byId = new Map(list.map(e => [String(e.id ?? e.eid), e]));
  const R = F.filter(e => e.outcome === "hit" || e.outcome === "miss");
  let n = 0, nb = 0, nf = 0, same = 0, nh = 0;
  for (const e of R) {
    const hit = e.outcome === "hit";
    nh += (e.side === "home") === hit ? 1 : 0;   // tebak selalu tuan rumah
    const h = byId.get(String(e["event.id"])); const p = h && (h.p || h.p0); if (!p || p.length !== 3) continue;
    n++; const fav = p[0] >= p[2] ? "home" : "away"; if (fav === e.side) same++;
    if (hit) nb++; if ((fav === e.side) === hit) nf++;
  }
  console.log("\n== Pembanding sederhana (call yang sama)");
  console.log(`riwayat BSD publik: ${list.length} laga; cocok dengan call: ${n} dari ${R.length}`);
  console.log(`selalu tuan rumah: ${(nh / R.length * 100).toFixed(1)}% (n=${R.length}) vs Next to Score ${(R.filter(e => e.outcome === "hit").length / R.length * 100).toFixed(1)}%`);
  if (n) console.log(`unggulan pra-laga: ${(nf / n * 100).toFixed(1)}% vs Next to Score ${(nb / n * 100).toFixed(1)}% pada ${n} call yang sama · sisi call = unggulan pra-laga pada ${(same / n * 100).toFixed(1)}% call`);
  if (n) { const D = R.filter(e => { const h = byId.get(String(e["event.id"])); const p = h && (h.p || h.p0); return p && (p[0] >= p[2] ? "home" : "away") !== e.side }); const dh = D.filter(e => e.outcome === "hit").length; console.log(`saat call MELAWAN unggulan pra-laga: n=${D.length} · Next to Score benar ${D.length ? (dh / D.length * 100).toFixed(1) : "-"}%`) }
} catch (e) { console.log("pembanding gagal:", e.message) }
