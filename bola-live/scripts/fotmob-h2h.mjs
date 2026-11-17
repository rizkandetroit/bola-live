import { outDir, ghWarn, sleep } from "./net.mjs";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import Fotmob from "@max-xoo/fotmob";

const dir = outDir(import.meta.url);
const allPath = dir + "all.json";
const cachePath = dir + "fotmob-cache.json";

if (!existsSync(allPath)) {
    console.log("all.json tidak ada, FotMob dilewati.");
    process.exit(0);
}

const allData = JSON.parse(readFileSync(allPath, "utf8"));
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : {};

// Filter pertandingan yang belum punya data H2H (dari API-Football)
const matchesToProcess = allData.matches.filter(m => 
    m.status === "NS" && !m.h2h && m.home?.name && m.away?.name
).slice(0, 5); // Batasi 5 pertandingan per run agar aman

const fotmob = new Fotmob();
let updated = 0;

for (const m of matchesToProcess) {
    const cacheKey = `${m.home.name}-${m.away.name}`;
    
    // Gunakan cache jika sudah pernah diambil dalam 7 hari terakhir
    if (cache[cacheKey] && Date.now() - cache[cacheKey].t < 7 * 864e5) {
        m.h2h = cache[cacheKey].data;
        updated++;
        continue;
    }

    try {
        // 1. Cari ID pertandingan di FotMob menggunakan raw API (lebih stabil daripada method bawaan library)
        const searchUrl = `https://www.fotmob.com/api/searchapi/suggest?term=${encodeURIComponent(m.home.name + " " + m.away.name)}`;
        const searchRes = await fetch(searchUrl).then(r => r.json());
        
        // Ambil hasil pertama yang tipenya adalah pertandingan (match)
        const matchHit = searchRes?.match?.[0];
        
        if (!matchHit) {
            console.log(`[FotMob] Tidak ketemu: ${m.home.name} vs ${m.away.name}`);
            continue;
        }

        // 2. Ambil detail pertandingan untuk H2H dari library
        const details = await fotmob.getMatchDetails(matchHit.id);
        const h2hData = details.headToHead || details.h2h;

        if (h2hData) {
            const normH2H = {
                n: h2hData.totalMatches || 0,
                hW: h2hData.homeWins || 0,
                d: h2hData.draws || 0,
                aW: h2hData.awayWins || 0,
                gf: h2hData.goalsHome || 0,
                ga: h2hData.goalsAway || 0,
                last: (h2hData.matches || []).slice(0, 5).map(match => ({
                    t: match.date?.slice(0, 10) || "2024-01-01",
                    s: [match.homeScore, match.awayScore],
                    l: match.leagueName || "Kompetisi"
                }))
            };
            m.h2h = normH2H;
            cache[cacheKey] = { t: Date.now(), data: normH2H };
            updated++;
            console.log(`[FotMob] H2H ditemukan: ${m.home.name} vs ${m.away.name}`);
        } else {
            console.log(`[FotMob] Data H2H kosong untuk: ${m.home.name} vs ${m.away.name}`);
        }
    } catch (e) {
        ghWarn(`[FotMob] Gagal untuk ${m.home.name}: ${e.message}`);
    }
    
    await sleep(2000); // Jeda 2 detik agar tidak diblokir FotMob
}

writeFileSync(allPath, JSON.stringify(allData));
writeFileSync(cachePath, JSON.stringify(cache));
console.log(`FotMob OK: ${updated} laga diperbarui.`);
