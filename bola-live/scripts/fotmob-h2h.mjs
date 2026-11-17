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

// Filter pertandingan: Hanya ambil laga NS, belum punya H2H, dan BUKAN tim U17/U21/Wanita/Reserve
const matchesToProcess = allData.matches.filter(m => {
    if (m.status !== "NS" || m.h2h || !m.home?.name || !m.away?.name) return false;
    // Abaikan tim muda, wanita, dan tim cadangan (mengandung U17, U21, W, II, B)
    const isYouthOrReserve = /U\d{2}|W$|Women|II$|Reserve/i.test(m.home.name) || /U\d{2}|W$|Women|II$|Reserve/i.test(m.away.name);
    return !isYouthOrReserve;
}).slice(0, 5); // Maksimal 5 laga per run

const fotmob = new Fotmob();
let updated = 0;

for (const m of matchesToProcess) {
    const cacheKey = `${m.home.name}-${m.away.name}`;
    
    if (cache[cacheKey] && Date.now() - cache[cacheKey].t < 7 * 864e5) {
        m.h2h = cache[cacheKey].data;
        updated++;
        continue;
    }

    try {
        // 1. Cari ID pertandingan di FotMob
        const searchUrl = `https://www.fotmob.com/api/searchapi/suggest?term=${encodeURIComponent(m.home.name + " " + m.away.name)}`;
        const res = await fetch(searchUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } // Mencegah diblokir
        });
        
        // PENGAMAN: Jika server tidak membalas dengan baik (misal 429 / 403 / 500)
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const textData = await res.text();
        if (!textData) throw new Error("Respons kosong");
        
        const searchRes = JSON.parse(textData);
        const matchHit = searchRes?.match?.[0];
        
        if (!matchHit) {
            console.log(`[FotMob] Tidak ketemu: ${m.home.name} vs ${m.away.name}`);
            continue;
        }

        // 2. Ambil detail pertandingan (H2H)
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
        }
    } catch (e) {
        ghWarn(`[FotMob] Gagal untuk ${m.home.name}: ${e.message}`);
    }
    
    await sleep(2000); 
}

writeFileSync(allPath, JSON.stringify(allData));
writeFileSync(cachePath, JSON.stringify(cache));
console.log(`FotMob OK: ${updated} laga diperbarui.`);
