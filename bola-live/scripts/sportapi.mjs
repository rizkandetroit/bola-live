import {mkdirSync,writeFileSync,readFileSync} from "node:fs";
import {sleep,tfetch,cleanKey,siteBase,outDir,overDeadline,ghWarn} from "./net.mjs";
import {fit,predictM,formOf,finalP,level,r1} from "./lib.mjs";
// SEMUA liga dari SportAPI (sportapi.ai, paket Free: 2.000 permintaan per hari, 14.000 per bulan).
// Satu permintaan fixtures/date/{tanggal} = semua liga pada tanggal itu, jadi seminggu jadwal hanya sekitar 10 permintaan.
// Langkah ini berjalan SETELAH all.mjs dan menggabungkan hasilnya ke all.json (format sama, halaman tidak perlu diubah):
//  - laga yang sama dengan yang sudah ada (football-data.org atau API-Football) dilewati, kecuali SportAPI punya prediksi tingkat lebih baik;
//  - riwayat hasil (sa-history.json) dikumpulkan dari tanggal-tanggal lampau (isi ulang bertahap) dan dipakai untuk Poisson + Elo per liga;
//  - tingkat prediksi sama seperti all.mjs: 2 = model liga sendiri, 3 = Elo lintas liga, 4 = tebakan dasar.
// Tidak pernah menggagalkan deploy (di workflow: continue-on-error).
const KEY=cleanKey(process.env.SPORTAPI_KEY);
if(!KEY){console.log("SPORTAPI_KEY kosong: langkah SportAPI dilewati.");process.exit(0)}
const API=(process.env.SPORTAPI_API||"https://sportapi.ai/api").replace(/\/+$/,"");
const GAP=Number(process.env.GAP_MS??1000),RETRY=Number(process.env.RETRY_MS??20000);
const MAXC=Number(process.env.MAX_CALLS??30),BACK=Number(process.env.BACKFILL_DAYS??45),BF=Number(process.env.BACKFILL_PER_RUN??12);
const DAY_CAP=Number(process.env.DAY_CAP??300),MONTH_CAP=Number(process.env.MONTH_CAP??12000);
const MINL=Number(process.env.MIN_LEAGUE_MATCHES??20),MINT=Number(process.env.MIN_TEAM_MATCHES??3);
const WITA=8*3600e3,DAY=864e5,now=Date.now();
const wday=t=>new Date(t+WITA).toISOString().slice(0,10),uday=t=>new Date(t).toISOString().slice(0,10);
const addD=(s,n)=>new Date(Date.parse(s+"T00:00:00Z")+n*DAY).toISOString().slice(0,10);
const wkA=wday(now-2*DAY),wkB=wday(now+7*DAY),today=uday(now);
const off=d=>Math.round((Date.parse(d+"T00:00:00Z")-Date.parse(today+"T00:00:00Z"))/DAY);
const R0={min:-BACK,max:7};

async function loadJ(envVar,file){
  try{
    const f=process.env[envVar];if(f)return JSON.parse(readFileSync(f,"utf8"));
    const base=siteBase();if(!base)return null;
    const r=await tfetch(base+file+"?t="+Date.now());return r.ok?await r.json():null;
  }catch(e){return null}
}
const prev=await loadJ("PREV_SA_FILE","sa-cache.json"),hist0=await loadJ("PREV_SA_HIST","sa-history.json");
const days=(prev&&prev.days)||{};
let range=prev&&prev.range&&now-prev.range.t<7*DAY?{...prev.range}:{...R0,t:now};
const month=today.slice(0,7);
const usage=prev&&prev.usage?{...prev.usage}:{day:today,n:0,month,mn:0};
if(usage.day!==today){usage.day=today;usage.n=0}
if(usage.month!==month){usage.month=month;usage.mn=0}

// ---------- status dan rekaman ----------
const stOf=r=>{const s=String(r.s||"").trim();
  if(/^(FT|AET|PEN|Finished|Full ?time|After)/i.test(s))return"FT";
  if(/^(LIVE|1H|2H|HT|ET|BT|P|INT|Half)/i.test(s))return"LIVE";
  if(/^(Scheduled|NS|Not ?started|TBD|Fixture)/i.test(s))return"NS";
  return null};                                       // Cancelled, Postponed, Abandoned, dll.
const recs=resp=>{const m=[];
  for(const x of resp||[]){
    if(!x||x.id==null||x.home_id==null||x.away_id==null)continue;
    const t=Date.parse(x.kickoff_utc||"");if(!t||Number.isNaN(t))continue;
    m.push({id:x.id,t,s:x.status,min:x.minute??null,li:x.league_id,ln:x.league_name,lz:x.league_zone,hi:x.home_id,ai:x.away_id,h:x.home_team,a:x.away_team,
      gh:x.home_score==null?null:Number(x.home_score),ga:x.away_score==null?null:Number(x.away_score)});
  }
  return m};

// ---------- pengambilan per tanggal ----------
const errors=[];let calls=0,quota=false,fatal=false,bfDone=0;
async function call(d){
  for(let i=0;i<2;i++){
    if(overDeadline())throw new Error("batas waktu run habis");
    let r;
    try{r=await tfetch(`${API}/fixtures/date/${d}`,{headers:{"X-Api-Key":KEY,"Accept":"application/json"}})}catch(e){if(i)throw e;await sleep(RETRY);continue}
    calls++;usage.n++;usage.mn++;
    let j=null;try{j=await r.json()}catch(e){}
    const msg=(j&&(j.error&&(j.error.message||j.error)||j.message))||"";
    if(r.status===429){if(i){const e=new Error("HTTP 429 (batas permintaan)");e.limit=true;throw e}await sleep(RETRY);continue}
    if(r.status===401){const e=new Error("kunci ditolak (HTTP 401)");e.fatal=true;throw e}
    if(!r.ok||!j||j.success===false||!Array.isArray(j.data)){
      const e=new Error("HTTP "+r.status+(msg?": "+String(msg).slice(0,120):""));
      e.plan=/plan|upgrade|not available|range|date|access|forbidden/i.test(String(msg))||r.status===403;
      throw e}
    return j;
  }
  throw new Error("gagal setelah 2 percobaan");
}
const stale=(d,c)=>{const o=off(d);if(!c)return true;const age=now-c.t;
  if(o===0)return age>20*60e3;
  if(o===-1)return age>45*60e3;
  if(o===1)return age>6*36e5;
  if(o>1)return age>12*36e5;
  return c.m.some(x=>{const s=stOf(x);return(s==="NS"||s==="LIVE")&&c.t<x.t+4*36e5})&&age>6*36e5};  // hari lampau: final bila sudah diambil setelah laga selesai
const lo=addD(today,-BACK),hi=addD(today,7),dates=[];
for(let d=lo;d<=hi;d=addD(d,1))dates.push(d);
dates.sort((a,b)=>Math.abs(off(a))-Math.abs(off(b))||off(b)-off(a));   // terdekat dulu; untuk masa lalu yang terbaru dulu
for(const d of dates){
  const o=off(d);
  if(o<range.min||o>range.max)continue;
  if(!stale(d,days[d]))continue;
  if(o<=-2&&bfDone>=BF)continue;                       // isi ulang riwayat dibatasi per run
  if(calls>=MAXC){errors.push("batas permintaan per run ("+MAXC+") tercapai; sisanya memakai cache");break}
  if(usage.n>=DAY_CAP){errors.push("batas harian sendiri ("+DAY_CAP+" permintaan) tercapai; memakai cache");break}
  if(usage.mn>=MONTH_CAP){errors.push("batas bulanan sendiri ("+MONTH_CAP+" permintaan) tercapai; memakai cache");break}
  if(quota||fatal)break;
  if(calls>0)await sleep(GAP);
  if(o<=-2)bfDone++;
  try{
    const j=await call(d);
    days[d]={t:now,m:recs(j.data)};
  }catch(e){
    if(e.fatal){fatal=true;errors.push(e.message+". Periksa secret SPORTAPI_KEY.")}
    else if(e.limit){quota=true;errors.push(e.message+"; berhenti, memakai cache")}
    else if(e.plan&&o!==0){if(o>0)range.max=Math.min(range.max,o-1);else range.min=Math.max(range.min,o+1);range.t=now;errors.push(d+": di luar paket ("+e.message+"); rentang dipersempit")}
    else errors.push(d+": "+e.message);
  }
}
for(const d of Object.keys(days))if(d<lo||d>hi)delete days[d];
const byId=new Map();
for(const [d,c] of Object.entries(days).sort((a,b)=>a[1].t-b[1].t))for(const r of c.m)byId.set(r.id,r);

// ---------- riwayat hasil per liga ----------
const H=hist0&&hist0.leagues?{leagues:hist0.leagues}:{leagues:{}};
const ELIG=n=>!/friendl|cup|copa|coupe|pokal|ta[cç]a|qualif|olymp|nations|international|under ?\d|u-?\d\d|youth|trophy|super ?cup|play-?off|world/i.test(n||"");
const ids=L=>L._s||(L._s=new Set(L.m.map(x=>x[0])));
const label=r=>r.lz&&r.lz!=="World"&&!String(r.ln).includes(r.lz)?`${r.ln} (${r.lz})`:r.ln;
function absorb(list){
  for(const r of list){
    if(stOf(r)!=="FT"||r.gh==null||r.ga==null||r.hi==null||r.ai==null)continue;
    let L=H.leagues[r.li];if(!L)L=H.leagues[r.li]={n:label(r),m:[]};
    L.n=label(r);
    if(!ids(L).has(r.id)){L.m.push([r.id,r.t,r.hi,r.ai,r.gh,r.ga]);ids(L).add(r.id)}
  }
  for(const L of Object.values(H.leagues)){
    const before=L.m.length;
    L.m=L.m.filter(x=>x[1]>now-400*DAY);
    if(L.m.length>700){L.m.sort((a,b)=>a[1]-b[1]);L.m=L.m.slice(-700)}
    if(L.m.length!==before)L._s=null;
  }
}
absorb([...byId.values()]);

// ---------- model per liga (tingkat 2) dan cadangan (tingkat 3 dan 4), sama seperti all.mjs ----------
const MC=new Map();
function modelOf(li){
  if(MC.has(li))return MC.get(li);
  const L=H.leagues[li];let o=null;
  if(L&&L.m.length>=MINL){
    const ms=L.m.map(x=>({t:x[1],h:x[2],a:x[3],gh:x[4],ga:x[5]})).sort((a,b)=>a.t-b.t);
    o={ms,mNow:fit(ms,now)};
  }
  MC.set(li,o);return o;
}
const BASE=[45,28,27];
let GM=null;
function globalModel(){
  if(GM)return GM;
  const ms=[];
  for(const L of Object.values(H.leagues))for(const x of L.m)ms.push({t:x[1],h:x[2],a:x[3],gh:x[4],ga:x[5]});
  ms.sort((a,b)=>a.t-b.t);
  GM=fit(ms,now);return GM;
}
// Klasemen resmi tidak dipakai (riwayat hanya beberapa pekan terakhir), jadi posisi dan poin dikosongkan; halaman menyembunyikannya.
const side=(name,gp,elo,f)=>({name,pos:0,pts:0,gp,gf:null,ga:null,w:0,d:0,l:0,sp:null,elo,f:f||null});
function fallback(r,base){
  const G=globalModel(),gh=((G.T.get(r.hi)||{}).gp)||0,ga=((G.T.get(r.ai)||{}).gp)||0;
  if(gh===0&&ga===0){
    return {...base,home:side(r.h,0,null),away:side(r.a,0,null),p:{h:BASE[0],d:BASE[1],a:BASE[2],pe:{h:BASE[0],d:BASE[1],a:BASE[2]},el:[null,null],gp:[0,0],fr:[45,26,29],engine:"dasar"},
      pick:"h",edge:0,level:"Tipis",est:true,tier:4,
      note:"Belum ada riwayat laga untuk kedua tim, jadi ini hanya tebakan dasar keuntungan tuan rumah ("+BASE[0]+"% tuan rumah, "+BASE[1]+"% seri, "+BASE[2]+"% tamu), bukan analisis."};
  }
  const p0=predictM(G,r.hi,r.ai),w=Math.min(1,(gh+ga)/20);
  const h=r1(w*p0.pe.h+(1-w)*BASE[0]),a=r1(w*p0.pe.a+(1-w)*BASE[2]),d=r1(100-h-a),e=r1(Math.abs(h-a)),lv=level(e);
  return {...base,home:side(r.h,gh,p0.el[0]),away:side(r.a,ga,p0.el[1]),p:{h,d,a,pe:p0.pe,el:p0.el,gp:[gh,ga],fr:p0.fr,engine:"elo"},
    pick:h>=a?"h":"a",edge:e,level:lv==="Sangat kuat"||lv==="Kuat"?"Sedang":lv,est:true,tier:3,
    note:"Perkiraan kasar dari peringkat Elo lintas liga (Elo "+p0.el[0]+" lawan "+p0.el[1]+", dari "+gh+" dan "+ga+" laga tersimpan), dicampur peluang dasar karena datanya masih sedikit. Tidak memakai klasemen, xG, atau Poisson."};
}
const mine=[],tiers={2:0,3:0,4:0};
for(const r of byId.values()){
  const dd=wday(r.t);if(dd<wkA||dd>wkB)continue;
  const st=stOf(r);if(!st)continue;
  if(st==="NS"&&r.t<now-3*36e5)continue;
  if(st==="LIVE"&&r.t<now-4*36e5)continue;
  const base={id:"s"+r.id,league:label(r),utc:new Date(r.t).toISOString(),status:st,score:st==="NS"?[null,null]:[r.gh,r.ga],home:{name:r.h},away:{name:r.a}};
  const M=ELIG(r.ln)?modelOf(r.li):null;
  if(M){
    const model=r.t>now?M.mNow:fit(M.ms,r.t),gH=(model.T.get(r.hi)||{}).gp||0,gA=(model.T.get(r.ai)||{}).gp||0;
    if(gH>=MINT&&gA>=MINT){
      const p=predictM(model,r.hi,r.ai),lam=Math.max(.15,.5-.04*Math.min(gH,gA)),k=finalP(p,lam);
      p.raw={h:p.h,d:p.d,a:p.a};p.h=k[0];p.d=k[1];p.a=k[2];
      const e=r1(Math.abs(k[0]-k[2]));
      mine.push({...base,home:side(r.h,gH,p.el[0],formOf(model,r.hi,"h")),away:side(r.a,gA,p.el[1],formOf(model,r.ai,"a")),p,pick:k[0]>=k[2]?"h":"a",edge:e,level:level(e),est:true,tier:2,t:r.t,_h:r.h,_a:r.a});
      continue;
    }
  }
  mine.push({...fallback(r,base),t:r.t,_h:r.h,_a:r.a});
}

// ---------- gabung ke all.json tanpa laga ganda ----------
const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\b(fc|cf|afc|sc|ac|club|the)\b/g," ").replace(/[^a-z0-9]/g,"");
const same=(a,b)=>{a=norm(a);b=norm(b);return!!a&&!!b&&(a===b||(Math.min(a.length,b.length)>=4&&(a.includes(b)||b.includes(a))))};
const isDup=(m,x)=>Math.abs(Date.parse(x.utc)-m.t)<3*36e5&&same(x.home&&x.home.name,m._h)&&same(x.away&&x.away.name,m._a);
const dir=outDir(import.meta.url);mkdirSync(dir,{recursive:true});
const rd=f=>{try{return JSON.parse(readFileSync(dir+f,"utf8"))}catch(e){return null}};
let all=rd("all.json");
if(!all||!Array.isArray(all.matches))all={updated:new Date(now).toISOString(),week:[wkA,wkB],errors:[],matches:[]};
all.matches=all.matches.filter(x=>!String(x.id).startsWith("s"));   // jalan ulang tidak menggandakan
const fd=rd("data.json"),fdm=(fd&&fd.matches)||[];
let added=0,replaced=0,dup=0;
for(const m of mine){
  if(fdm.some(x=>isDup(m,x))){dup++;continue}
  const i=all.matches.findIndex(x=>isDup(m,x));
  const out={...m};delete out.t;delete out._h;delete out._a;
  if(i<0){all.matches.push(out);added++;continue}
  const ex=all.matches[i],rank=x=>x.np?9:(x.tier||1);
  if(rank(out)<rank(ex)){all.matches[i]=out;replaced++}else dup++;
}
all.matches.sort((a,b)=>a.utc.localeCompare(b.utc));
const T2={2:0,3:0,4:0};for(const x of all.matches)if(x.tier>=2&&x.tier<=4)T2[x.tier]++;
all.tiers=T2;all.nPred=T2[2];all.nLeagues=new Set(all.matches.map(x=>x.league)).size;
all.errors=(all.errors||[]).concat(errors.map(e=>"SportAPI: "+e));
all.sa={updated:new Date(now).toISOString(),calls,added,replaced,dup,range:{min:range.min,max:range.max},usage:{hari:usage.n,bulan:usage.mn},leagues:Object.keys(H.leagues).length,
  history:Object.values(H.leagues).reduce((a,L)=>a+L.m.length,0)};
writeFileSync(dir+"all.json",JSON.stringify(all));
writeFileSync(dir+"sa-cache.json",JSON.stringify({range,days,usage}));
writeFileSync(dir+"sa-history.json",JSON.stringify({v:1,leagues:H.leagues},(k,v)=>k[0]==="_"?undefined:v));
if(errors.length)ghWarn("sportapi: "+errors.join(" ; "));
console.log("OK sportapi:",mine.length,"laga SportAPI;",added,"ditambah;",replaced,"menggantikan;",dup,"sudah ada;",calls,"permintaan (hari ini",usage.n+", bulan ini",usage.mn+"); riwayat",all.sa.history,"laga di",all.sa.leagues,"liga; tingkat 2/3/4:",T2[2]+"/"+T2[3]+"/"+T2[4]+"; rentang",range.min,"sampai",range.max);
