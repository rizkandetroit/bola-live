// Cek sekali (20 Nov 2026): apakah paket GRATIS Highlightly punya 6 liga yang tidak ada di BSD?
// Denmark 1st Division, Egypt Cup, UEFA Women's Champions League, Algeria Ligue 1, Uruguay Primera, Colombia Primera B.
// Tidak menulis apa pun ke situs; hanya mencetak hasil ke log Actions.
// Hemat kuota: berhenti di 30 permintaan (jatah gratis 100/hari dipakai juga oleh liga Indonesia di situs).
const KEY=String(process.env.HIGHLIGHTLY_KEY||"").trim().replace(/^["']|["']$/g,"");
if(!KEY){console.log("HIGHLIGHTLY_KEY kosong.");process.exit(1)}
const BASE=(process.env.HL_API||"https://sports.highlightly.net").replace(/\/+$/,""),MAX=Number(process.env.HL_MAX||30);
let calls=0,left=null;
async function get(path){
  if(calls>=MAX)throw new Error("batas "+MAX+" permintaan tercapai");
  calls++;const r=await fetch(BASE+path,{headers:{"x-rapidapi-key":KEY,Accept:"application/json"},signal:AbortSignal.timeout(20000)});
  const rem=r.headers.get("x-ratelimit-requests-remaining");if(rem!=null)left=Number(rem);
  let j=null;try{j=await r.json()}catch(e){}
  if(r.status===429)throw new Error("kuota harian Highlightly habis (HTTP 429)");
  return{status:r.status,j};
}
const list=j=>Array.isArray(j)?j:(j&&(Array.isArray(j.data)?j.data:j.leagues||j.matches))||[];
const T=[
  {nama:"Denmark 1st Division",negara:["Denmark"],pola:/1st division|1\. division|first division|nordicbet/i,tolak:/women|kvinde|u\d\d|2nd/i},
  {nama:"Egypt Cup",negara:["Egypt"],pola:/cup|kas/i,tolak:/super cup|league cup|women|u\d\d/i},
  {nama:"UEFA Women's Champions League",cari:"Champions League Women",negara:["Europe","World"],pola:/women.*champions|champions.*women|uwcl/i,tolak:/qualif/i},
  {nama:"Algeria Ligue 1",negara:["Algeria"],pola:/ligue 1|ligue professionnelle 1|league 1/i,tolak:/women|u\d\d/i},
  {nama:"Uruguay Primera",negara:["Uruguay"],pola:/primera|liga auf|uruguayo/i,tolak:/segunda|women|femenin|u\d\d|division b/i},
  {nama:"Colombia Primera B",negara:["Colombia"],pola:/primera b|torneo betplay|torneo dimayor|ascenso/i,tolak:/women|femenin|u\d\d/i},
];
const now=Date.now(),yr=new Date().getUTCFullYear(),hasil=[];
console.log("Highlightly:",BASE,"| batas",MAX,"permintaan\n");
try{
  for(const t of T){
    console.log("=== "+t.nama+" ===");let L=[],seen=new Set();
    if(t.cari){const r=await get(`/football/leagues?leagueName=${encodeURIComponent(t.cari)}&limit=100`);const all=list(r.j);
      console.log(`  cari "${t.cari}": HTTP ${r.status}, ${all.length} liga ->`,all.map(x=>x.name+" ("+(x.country&&x.country.name||"")+")").join(" | ").slice(0,300));
      for(const x of all)if(t.pola.test(x.name||"")&&!t.tolak.test(x.name||"")&&!seen.has(x.id)){seen.add(x.id);L.push(x)}}
    for(const c of t.negara){if(L.length)break;
      const r=await get(`/football/leagues?countryName=${encodeURIComponent(c)}&limit=100`);
      if(r.status!==200){console.log(`  daftar liga ${c}: HTTP ${r.status}`,JSON.stringify(r.j).slice(0,160));continue}
      const all=list(r.j);console.log(`  ${c}: ${all.length} liga ->`,all.map(x=>x.name).join(" | ").slice(0,400));
      for(const x of all)if(t.pola.test(x.name||"")&&!t.tolak.test(x.name||"")&&!seen.has(x.id)){seen.add(x.id);L.push(x)}}
    if(!L.length){console.log("  HASIL: tidak ditemukan di paket ini.\n");hasil.push([t.nama,"tidak ada"]);continue}
    const lg=L[0];console.log(`  dipakai: id ${lg.id} "${lg.name}"`,L.length>1?"(calon lain: "+L.slice(1).map(x=>x.id+" "+x.name).join(", ")+")":"","| musim:",JSON.stringify(lg.seasons||"").slice(0,160));
    let M=[],sz=null,tot=null;
    for(const s of [yr,yr-1]){const r=await get(`/football/matches?leagueId=${lg.id}&season=${s}&limit=100`);const m=list(r.j);
      tot=r.j&&r.j.pagination&&r.j.pagination.totalCount;console.log(`  laga musim ${s}: HTTP ${r.status}, ${m.length} baris${tot!=null?" (total "+tot+")":""}`,r.status!==200?JSON.stringify(r.j).slice(0,160):"");
      if(m.length){M=m;sz=s;break}}
    if(!M.length){console.log("  HASIL: liga ada, tapi laga tidak tersedia di paket gratis.\n");hasil.push([t.nama,"liga ada, laga tidak tersedia"]);continue}
    const st=x=>String(x.state&&x.state.description||""),ns=M.filter(x=>st(x)==="Not started"&&Date.parse(x.date)>now).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
    const ft=M.filter(x=>/^Finished/.test(st(x))).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
    console.log(`  selesai ${ft.length}, akan datang ${ns.length}`+(ft[0]?` | terakhir: ${ft[0].homeTeam&&ft[0].homeTeam.name} vs ${ft[0].awayTeam&&ft[0].awayTeam.name} ${String(ft[0].date).slice(0,10)} (${ft[0].state&&ft[0].state.score&&ft[0].state.score.current})`:"")+(ns[0]?` | berikutnya: ${ns[0].homeTeam&&ns[0].homeTeam.name} vs ${ns[0].awayTeam&&ns[0].awayTeam.name} ${String(ns[0].date).slice(0,10)}`:""));
    let pred="-";const pick=ns[0]||ft[0];
    if(pick){const r=await get(`/football/matches/${pick.id}`);const d=Array.isArray(r.j)?r.j[0]:(r.j&&r.j.data?(Array.isArray(r.j.data)?r.j.data[0]:r.j.data):r.j);
      const pm=d&&d.predictions&&d.predictions.prematch;pred=pm&&pm.length?"ADA ("+JSON.stringify(pm[pm.length-1].probabilities)+")":"tidak ada";
      console.log(`  detail laga ${pick.id}: HTTP ${r.status}, prediksi: ${pred}`)}
    const k=await get(`/football/standings?leagueId=${lg.id}&season=${sz}`);const kl=k.status===200&&JSON.stringify(k.j).includes('"team"');
    console.log(`  klasemen: HTTP ${k.status}, ${kl?"ADA":"tidak ada"}\n`);
    hasil.push([t.nama,`ADA (id ${lg.id}, musim ${sz}): ${ft.length} selesai, ${ns.length} akan datang, prediksi ${pred.startsWith("ADA")?"ada":"tidak"}, klasemen ${kl?"ada":"tidak"}`]);
  }
}catch(e){console.log("\nBERHENTI:",e.message)}
console.log("\n===== RINGKASAN =====");for(const [a,b] of hasil)console.log("- "+a+": "+b);
console.log(`\nPermintaan dipakai: ${calls}${left!=null?" | sisa kuota hari ini: "+left:""}`);
