// Cek sekali: apakah paket GRATIS Highlightly punya Super League Indonesia musim berjalan?
// Tidak menulis apa pun ke situs. Hanya mencetak hasil ke log Actions. Memakai maksimal ~8 permintaan.
const KEY=String(process.env.HIGHLIGHTLY_KEY||"").trim();
if(!KEY){console.log("HIGHLIGHTLY_KEY kosong.");process.exit(1)}
const BASES=["https://sports.highlightly.net","https://football-highlights-api.p.rapidapi.com"];
const HDRS=[{"x-rapidapi-key":KEY},{"x-api-key":KEY},{Authorization:"Bearer "+KEY}];
let base=null,hdr=null;
async function get(path){const r=await fetch(base+path,{headers:{...hdr,Accept:"application/json"},signal:AbortSignal.timeout(20000)});let j=null;try{j=await r.json()}catch(e){}return{status:r.status,j,lim:r.headers.get("x-ratelimit-requests-remaining")||r.headers.get("x-ratelimit-remaining")}}
// 1) cari kombinasi alamat + header yang diterima
outer:for(const b of BASES)for(const h of HDRS){base=b;hdr=h;const r=await get("/football/leagues?countryName=Indonesia&limit=50");console.log("coba",b,Object.keys(h)[0],"→ HTTP",r.status);if(r.status===200){var L=r.j;break outer}}
if(!L){console.log("\nGAGAL: key ditolak atau alamat API berbeda. Kirim log ini ke Claude.");process.exit(0)}
const arr=Array.isArray(L)?L:(L.data||L.leagues||[]);
console.log("\nLiga Indonesia yang ditemukan:");for(const x of arr)console.log(" -",x.id,"|",x.name,"|",JSON.stringify(x.seasons||x.season||"").slice(0,120));
const top=arr.find(x=>/super league|liga 1|bri/i.test(x.name||""));
if(!top){console.log("\nHASIL: Super League Indonesia TIDAK ditemukan di paket ini.");process.exit(0)}
// 2) laga musim berjalan (tanggal hari ini s.d. 7 hari) dan klasemen
const d=new Date(),ymd=t=>new Date(t).toISOString().slice(0,10);
let found=0;
for(let i=0;i<7&&found<1;i++){const r=await get(`/football/matches?leagueId=${top.id}&date=${ymd(d.getTime()+i*864e5)}&limit=20`);const m=r.j&&(r.j.data||r.j)||[];if(Array.isArray(m)&&m.length){found=m.length;console.log(`\nLaga ${ymd(d.getTime()+i*864e5)} (HTTP ${r.status}, sisa kuota ${r.lim}):`);for(const x of m.slice(0,5))console.log(" -",(x.homeTeam&&x.homeTeam.name)||"?","vs",(x.awayTeam&&x.awayTeam.name)||"?","|",x.date||x.startTime,"|",x.state&&x.state.description||"")}else if(r.status!==200)console.log("matches HTTP",r.status,JSON.stringify(r.j).slice(0,200))}
const yr=d.getUTCFullYear();
for(const s of [yr,yr-1]){const r=await get(`/football/standings?leagueId=${top.id}&season=${s}`);const ok=r.status===200&&JSON.stringify(r.j).length>200;console.log(`klasemen musim ${s}: HTTP ${r.status}`,ok?"ADA":"tidak ada",JSON.stringify(r.j).slice(0,160));if(ok)break}
console.log("\nHASIL:",found?"✅ ADA laga musim berjalan untuk Super League Indonesia di paket gratis.":"⚠️ Liga ada, tapi tidak ditemukan laga dalam 7 hari ke depan (bisa jeda kompetisi / dibatasi paket).");
