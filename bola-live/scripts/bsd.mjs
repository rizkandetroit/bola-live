import {mkdirSync,writeFileSync} from "node:fs";
import {sleep,tfetch,cleanKey,outDir,overDeadline,ghWarn} from "./net.mjs";
import {level,r1} from "./lib.mjs";
import {bsdAllows,bsdWhitelistReady} from "./leagues-filter.mjs";

// Sumber BSD (sports.bzzoiro.com, REST v2: /leagues /teams /events /players /predictions).
// Tujuan langkah ini BUKAN mengganti all.mjs/sportapi.mjs, tapi MELENGKAPI:
//  - menambal liga/pertandingan yang belum terjangkau sumber lain (format digabung ke all.json, sama seperti sportapi.mjs);
//  - memakai prediksi siap pakai dari BSD (match_result/expected_goals/btts/over_under) kalau laga itu belum
//    punya prediksi tingkat 2 (model liga sendiri) dari sumber lain — dipakai sebagai tingkat 2b ("bsd"), bukan menimpa.
//  - MEMBATASI liga yang tampil hanya ke daftar liga yang BENAR-BENAR ada di BSD (lihat bsd-leagues.json).
// Tidak pernah menggagalkan deploy (pasang continue-on-error: true di workflow, sama seperti sportapi.mjs).

// Token didapat dari dashboard BSD (sports.bzzoiro.com/dashboard) -> "Your API token".
// Simpan sebagai GitHub secret bernama BSD_API_KEY. Paket yang dipakai: Football API (FREE).
const KEY=cleanKey(process.env.BSD_API_KEY);
if(!KEY){console.log("BSD_API_KEY kosong: langkah BSD dilewati.");process.exit(0)}
const BASE=(process.env.BSD_API||"https://sports.bzzoiro.com/api/v2").replace(/\/+$/,"");
const GAP=Number(process.env.GAP_MS??1200),RETRY=Number(process.env.RETRY_MS??20000);
const MAXC=Number(process.env.MAX_CALLS??40);
const WITA=8*3600e3,DAY=864e5,now=Date.now();
const wday=t=>new Date(t+WITA).toISOString().slice(0,10),uday=t=>new Date(t).toISOString().slice(0,10);
const addD=(s,n)=>new Date(Date.parse(s+"T00:00:00Z")+n*DAY).toISOString().slice(0,10);
const wkA=wday(now-2*DAY),wkB=wday(now+7*DAY);

// Daftar liga yang diizinkan tampil (whitelist) datang dari ./leagues-filter.mjs, dibagi dengan
// all.mjs/sportapi.mjs/world.mjs supaya satu sumber kebenaran, bukan dicek sendiri-sendiri.
if(!bsdWhitelistReady)console.log("bsd: whitelist liga belum lengkap (bsd-leagues.json) — filter liga DIMATIKAN sampai lengkap.");

async function get(path){
  for(let i=0;i<3;i++){
    if(overDeadline())throw new Error(path+" dilewati: batas waktu run habis");
    let r;
    const headers=KEY?{Authorization:"Token "+KEY}:{};
    try{r=await tfetch(BASE+path,{headers})}catch(e){await sleep(RETRY);continue}
    if(r.status===429){await sleep(RETRY);continue}
    if(r.status===401||r.status===403){const e=new Error("BSD menolak kunci (HTTP "+r.status+")");e.fatal=true;throw e}
    if(!r.ok)throw new Error("BSD HTTP "+r.status+" ("+path+")");
    return r.json();
  }
  throw new Error(path+" gagal setelah 3 percobaan");
}
async function getAllPages(path,maxPages=10){
  let out=[],next=BASE+path,calls=0;
  while(next&&calls<maxPages){
    if(calls>0)await sleep(GAP);
    const url=next.startsWith("http")?next.replace(BASE,""):next;
    let j;
    try{j=await get(url)}catch(e){if(e.fatal)throw e;break}
    out=out.concat(j.results||[]);
    next=j.next?j.next.replace(BASE,""):null;
    calls++;
  }
  return out;
}

const errors=[],warn=[];
let calls=0,fatal=false;

// ---------- 1) ambil pertandingan (matches) untuk rentang minggu ini dari BSD ----------
const fixtures=[];
try{
  for(let d=wkA;d<=wkB&&calls<MAXC;d=addD(d,1)){
    if(overDeadline())break;
    if(calls>0)await sleep(GAP);
    const j=await get(`/events/?date=${d}&limit=200`);calls++;
    fixtures.push(...(j.results||[]));
  }
}catch(e){
  if(e.fatal){fatal=true;errors.push(e.message+". Periksa BSD_API_KEY.")}
  else errors.push("matches: "+e.message);
}

// ---------- 2) prediksi siap pakai BSD untuk laga-laga itu ----------
const predByEvent=new Map();
if(!fatal&&fixtures.length&&calls<MAXC){
  try{
    const j=await get(`/predictions/?limit=200`);calls++;
    for(const p of j.results||[])if(p.event&&p.event.id!=null)predByEvent.set(p.event.id,p);
  }catch(e){warn.push("predictions: "+e.message)}
}

// ---------- 3) ubah ke rekaman seragam, saring dengan whitelist ----------
const STMAP={notstarted:"NS",inprogress:"LIVE",finished:"FT",postponed:"NS",cancelled:null,abandoned:null};
const recs=[];
for(const f of fixtures){
  const name=f.league_name||(f.league&&f.league.name)||null;
  if(name&&!bsdAllows(name)){continue} // liga tidak ada di BSD -> buang dari output BSD
  const st=STMAP[f.status]??(f.status==="halftime"?"LIVE":null);
  if(!st)continue;
  const t=Date.parse(f.event_date);if(Number.isNaN(t))continue;
  recs.push({
    id:"b"+f.id,league:name||("Liga "+f.league_id),utc:new Date(t).toISOString(),status:st,
    score:st==="NS"?[null,null]:[f.home_score,f.away_score],
    home:{name:f.home_team,id:f.home_team_id},away:{name:f.away_team,id:f.away_team_id},
    _pred:predByEvent.get(f.id)||null
  });
}

// ---------- 4) pakai prediksi BSD langsung kalau tersedia (tingkat "bsd") ----------
const out=recs.map(r=>{
  if(!r._pred)return {...r,needFallback:true};
  const m=r._pred.markets||{};
  const mr=m.match_result||{};
  const h=mr.prob_home,d=mr.prob_draw,a=mr.prob_away;
  if(h==null||d==null||a==null)return {...r,needFallback:true};
  const pick=mr.predicted==="H"?"h":mr.predicted==="A"?"a":(h>=a?"h":"a");
  const edge=r1(Math.abs(h-a));
  return {...r,p:{h,d,a,xg:m.expected_goals||null,btts:(m.btts||{}).prob_yes??null,engine:"bsd"},
    pick,edge,level:level(edge),est:true,tier:2,src:"BSD",
    note:"Prediksi langsung dari BSD (pasar match_result)."};
}).map(({_pred,...r})=>r);

const dir=outDir(import.meta.url);mkdirSync(dir,{recursive:true});
writeFileSync(dir+"bsd.json",JSON.stringify({updated:new Date(now).toISOString(),week:[wkA,wkB],calls,fatal,errors,warn,matches:out}));
if(errors.length)ghWarn("bsd: "+errors.join(" ; "));
console.log("OK bsd:",out.length,"laga (",out.filter(x=>!x.needFallback).length,"berprediksi BSD langsung);",calls,"permintaan;",errors.length,"error");
