import {mkdirSync,writeFileSync,readFileSync} from "node:fs";
import {sleep,tfetch,cleanKey,siteBase,outDir,overDeadline,ghWarn} from "./net.mjs";
// SEMUA liga sepak bola dari API-Football (paket gratis: 100 permintaan per hari, 10 per menit).
// Cara hemat: diambil per TANGGAL (satu permintaan = semua liga pada hari itu), bukan per liga.
// Hasilnya hanya jadwal dan skor (tanpa prediksi). 10 liga football-data.org tidak diulang (sudah punya prediksi).
// Cache per tanggal disimpan di situs sendiri (all-cache.json) supaya permintaan tidak terbuang.
const KEY=cleanKey(process.env.API_FOOTBALL_KEY);
if(!KEY){console.log("API_FOOTBALL_KEY kosong: langkah semua-liga dilewati.");process.exit(0)}
const API=(process.env.APIF_API||"https://v3.football.api-sports.io").replace(/\/+$/,"");
const GAP=Number(process.env.GAP_MS??7000),RETRY=Number(process.env.RETRY_MS??30000);
const MAXC=Number(process.env.MAX_CALLS??6),RESERVE=Number(process.env.RESERVE??8);
// ID liga API-Football untuk 10 liga yang sudah dicakup football-data.org (PL, SA, BL1, PD, FL1, CL, DED, PPL, ELC, BSA)
const COVERED=new Set((process.env.COVERED_IDS?JSON.parse(process.env.COVERED_IDS):[39,135,78,140,61,2,88,94,40,71]).map(Number));
const WITA=8*3600e3,DAY=864e5,now=Date.now();
const wday=t=>new Date(t+WITA).toISOString().slice(0,10),uday=t=>new Date(t).toISOString().slice(0,10);
const addD=(s,n)=>new Date(Date.parse(s+"T00:00:00Z")+n*DAY).toISOString().slice(0,10);
const wkA=wday(now-2*DAY),wkB=wday(now+7*DAY),today=uday(now);
const off=d=>Math.round((Date.parse(d+"T00:00:00Z")-Date.parse(today+"T00:00:00Z"))/DAY);
const R0={min:-3,max:7};
async function loadPrev(){
  try{
    const f=process.env.PREV_FILE;if(f)return JSON.parse(readFileSync(f,"utf8"));
    const base=siteBase();if(!base)return null;
    const r=await tfetch(base+"all-cache.json?t="+Date.now());return r.ok?await r.json():null;
  }catch(e){return null}
}
const prev=await loadPrev();
const days=(prev&&prev.days)||{};
let range=prev&&prev.range&&now-prev.range.t<DAY?{...prev.range}:{...R0,t:now};
// tanggal UTC yang menyentuh jendela WITA, diurutkan dari yang terdekat dengan hari ini: 0, -1, +1, -2, +2, ...
const lo=addD(wkA,-1),hi=wkB,dates=[];
for(let d=lo;d<=hi;d=addD(d,1))dates.push(d);
dates.sort((a,b)=>Math.abs(off(a))-Math.abs(off(b))||off(a)-off(b));
// seberapa tua cache boleh sebelum diambil ulang
const stale=(d,c)=>{const o=off(d);if(!c)return true;const age=now-c.t;
  if(o===0||o===-1)return age>20*60e3;   // hari ini dan kemarin: tiap run (kecuali baru saja)
  if(o===1)return age>6*36e5;             // besok: tiap 6 jam
  if(o>1)return age>12*36e5;              // lebih jauh: tiap 12 jam
  return false};                          // hari lampau yang sudah dicache: sudah final
const errors=[];let calls=0,remaining=null,quota=false,fatal=false;
const txt=er=>Array.isArray(er)?er.map(String):Object.entries(er||{}).map(([k,v])=>k+": "+v);
async function call(d){
  for(let i=0;i<2;i++){
    if(overDeadline())throw new Error("batas waktu run habis");
    let r;
    try{r=await tfetch(`${API}/fixtures?date=${d}`,{headers:{"x-apisports-key":KEY}})}catch(e){if(i)throw e;await sleep(RETRY);continue}
    calls++;
    const rem=r.headers&&r.headers.get?r.headers.get("x-ratelimit-requests-remaining"):null;if(rem!=null&&rem!=="")remaining=Number(rem);
    if(r.status===429){if(i)throw new Error("HTTP 429");await sleep(RETRY);continue}
    if(r.status===401||r.status===403){const e=new Error("kunci ditolak (HTTP "+r.status+")");e.fatal=true;throw e}
    if(!r.ok)throw new Error("HTTP "+r.status);
    const j=await r.json(),em=txt(j.errors),all=em.join(" | ").toLowerCase();
    if(em.length&&/rate ?limit|too many requests/.test(all)&&!i){await sleep(RETRY);continue}
    return {j,em,all};
  }
  throw new Error("gagal setelah 2 percobaan");
}
for(const d of dates){
  const o=off(d);
  if(o<range.min||o>range.max)continue;           // di luar rentang yang diizinkan paket (dipelajari otomatis)
  if(!stale(d,days[d]))continue;
  if(calls>=MAXC){errors.push("batas permintaan per run ("+MAXC+") tercapai; sisanya memakai cache");break}
  if(quota||fatal)break;
  if(calls>0)await sleep(GAP);
  try{
    const {j,em,all}=await call(d);
    if(em.length){
      if(/request limit|requests? per day|quota|limit for the day/.test(all)){quota=true;errors.push("kuota harian API-Football habis; memakai cache");break}
      if(/access|plan|subscription|not available|free plans/.test(all)){
        if(o>0)range.max=Math.min(range.max,o-1);else if(o<0)range.min=Math.max(range.min,o+1);else errors.push(d+": "+em.join("; "));
        range.t=now;continue}
      errors.push(d+": "+em.join("; "));continue;
    }
    const m=[];
    for(const x of j.response||[]){
      const f=x.fixture,l=x.league,t=x.teams,g=x.goals||{};
      if(!f||!l||!t||!t.home||!t.away)continue;
      const ts=f.timestamp?f.timestamp*1000:Date.parse(f.date);if(!ts||Number.isNaN(ts))continue;
      m.push({id:f.id,t:ts,s:f.status&&f.status.short,e:f.status&&f.status.elapsed,li:l.id,ln:l.name,lc:l.country,h:t.home.name,a:t.away.name,gh:g.home,ga:g.away});
    }
    days[d]={t:now,m};
  }catch(e){
    if(e.fatal){fatal=true;errors.push(e.message+". Periksa secret API_FOOTBALL_KEY.")}
    else errors.push(d+": "+e.message);
  }
  if(remaining!=null&&remaining<RESERVE){errors.push("sisa kuota harian tinggal "+remaining+"; berhenti memanggil");break}
}
// buang cache di luar jendela
for(const d of Object.keys(days))if(d<lo||d>hi)delete days[d];
const LIVE=["1H","HT","2H","ET","BT","P","LIVE","INT"],FT=["FT","AET","PEN"],NS=["NS","TBD"];
const byId=new Map();
for(const [d,c] of Object.entries(days).sort((a,b)=>a[1].t-b[1].t))for(const r of c.m)byId.set(r.id,r);
const out=[],lg=new Set();
for(const r of byId.values()){
  if(COVERED.has(Number(r.li)))continue;
  const dd=wday(r.t);if(dd<wkA||dd>wkB)continue;
  const st=LIVE.includes(r.s)?"LIVE":FT.includes(r.s)?"FT":NS.includes(r.s)?"NS":null;
  if(!st)continue;                                  // ditunda, dibatalkan, dll.
  if(st==="NS"&&r.t<now-3*36e5)continue;           // belum mulai tapi sudah lewat jauh: data basi
  if(st==="LIVE"&&r.t<now-4*36e5)continue;
  const name=r.lc&&r.lc!=="World"?`${r.ln} (${r.lc})`:r.ln;lg.add(name);
  out.push({id:"f"+r.id,league:name,utc:new Date(r.t).toISOString(),status:st,score:st==="NS"?[null,null]:[r.gh,r.ga],home:{name:r.h},away:{name:r.a},np:true});
}
out.sort((a,b)=>a.utc.localeCompare(b.utc));
const dir=outDir(import.meta.url);mkdirSync(dir,{recursive:true});
writeFileSync(dir+"all.json",JSON.stringify({updated:new Date(now).toISOString(),week:[wkA,wkB],nLeagues:lg.size,calls,remaining,range:{min:range.min,max:range.max},errors,matches:out}));
writeFileSync(dir+"all-cache.json",JSON.stringify({range,days}));
if(errors.length)ghWarn("semua-liga: "+errors.join(" ; "));
console.log("OK semua-liga:",out.length,"laga;",lg.size,"liga;",calls,"permintaan; sisa kuota",remaining==null?"?":remaining,"; rentang tanggal",range.min,"sampai",range.max);
