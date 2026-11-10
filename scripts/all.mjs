import {mkdirSync,writeFileSync,readFileSync} from "node:fs";
import {sleep,tfetch,cleanKey,siteBase,outDir,overDeadline,ghWarn} from "./net.mjs";
import {fit,predictM,formOf,finalP,level,r1} from "./lib.mjs";
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
// Prediksi untuk liga lain: model yang sama dengan 10 liga utama, tetapi dari hasil laga yang berhasil dikumpulkan
// (hasil harian + satu musim penuh per liga bila paket mengizinkan). Ditandai "data terbatas" dan belum diuji akurasinya.
const BOOT_MAX=Number(process.env.BOOT_MAX??10),MINL=Number(process.env.MIN_LEAGUE_MATCHES??20),MINT=Number(process.env.MIN_TEAM_MATCHES??3);
const UTC_HOUR=process.env.UTC_HOUR!=null?Number(process.env.UTC_HOUR):new Date().getUTCHours();
const COVERED=new Set((process.env.COVERED_IDS?JSON.parse(process.env.COVERED_IDS):[39,135,78,140,61,2,88,94,40,71]).map(Number));
const WITA=8*3600e3,DAY=864e5,now=Date.now();
const wday=t=>new Date(t+WITA).toISOString().slice(0,10),uday=t=>new Date(t).toISOString().slice(0,10);
const addD=(s,n)=>new Date(Date.parse(s+"T00:00:00Z")+n*DAY).toISOString().slice(0,10);
const wkA=wday(now-2*DAY),wkB=wday(now+7*DAY),today=uday(now);
const off=d=>Math.round((Date.parse(d+"T00:00:00Z")-Date.parse(today+"T00:00:00Z"))/DAY);
const R0={min:-3,max:7};
async function loadJ(envVar,file){
  try{
    const f=process.env[envVar];if(f)return JSON.parse(readFileSync(f,"utf8"));
    const base=siteBase();if(!base)return null;
    const r=await tfetch(base+file+"?t="+Date.now());return r.ok?await r.json():null;
  }catch(e){return null}
}
const prev=await loadJ("PREV_FILE","all-cache.json"),hist0=await loadJ("PREV_HIST","all-history.json");
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
const recs=resp=>{const m=[];
  for(const x of resp||[]){
    const f=x.fixture,l=x.league,t=x.teams,g=x.goals||{};
    if(!f||!l||!t||!t.home||!t.away)continue;
    const ts=f.timestamp?f.timestamp*1000:Date.parse(f.date);if(!ts||Number.isNaN(ts))continue;
    m.push({id:f.id,t:ts,s:f.status&&f.status.short,e:f.status&&f.status.elapsed,li:l.id,ln:l.name,lc:l.country,se:l.season,h:t.home.name,a:t.away.name,hi:t.home.id,ai:t.away.id,gh:g.home,ga:g.away});
  }
  return m};
const errors=[];let calls=0,remaining=null,quota=false,fatal=false;
const txt=er=>Array.isArray(er)?er.map(String):Object.entries(er||{}).map(([k,v])=>k+": "+v);
async function call(q){
  for(let i=0;i<2;i++){
    if(overDeadline())throw new Error("batas waktu run habis");
    let r;
    try{r=await tfetch(`${API}/fixtures?${q}`,{headers:{"x-apisports-key":KEY}})}catch(e){if(i)throw e;await sleep(RETRY);continue}
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
    const {j,em,all}=await call("date="+d);
    if(em.length){
      if(/request limit|requests? per day|quota|limit for the day/.test(all)){quota=true;errors.push("kuota harian API-Football habis; memakai cache");break}
      if(/access|plan|subscription|not available|free plans/.test(all)){
        if(o>0)range.max=Math.min(range.max,o-1);else if(o<0)range.min=Math.max(range.min,o+1);else errors.push(d+": "+em.join("; "));
        range.t=now;continue}
      errors.push(d+": "+em.join("; "));continue;
    }
    days[d]={t:now,m:recs(j.response)};
  }catch(e){
    if(e.fatal){fatal=true;errors.push(e.message+". Periksa secret API_FOOTBALL_KEY.")}
    else errors.push(d+": "+e.message);
  }
  if(remaining!=null&&remaining<RESERVE){errors.push("sisa kuota harian tinggal "+remaining+"; berhenti memanggil");break}
}
// buang cache di luar jendela
for(const d of Object.keys(days))if(d<lo||d>hi)delete days[d];
const LIVE=["1H","HT","2H","ET","BT","P","LIVE","INT"],FT=["FT","AET","PEN"],NS=["NS","TBD"];
const stOf=r=>LIVE.includes(r.s)?"LIVE":FT.includes(r.s)?"FT":NS.includes(r.s)?"NS":null;
const label=r=>r.lc&&r.lc!=="World"?`${r.ln} (${r.lc})`:r.ln;
const byId=new Map();
for(const [d,c] of Object.entries(days).sort((a,b)=>a[1].t-b[1].t))for(const r of c.m)byId.set(r.id,r);

// ---------- riwayat hasil per liga (dikumpulkan dari tiap run + satu musim penuh bila diizinkan) ----------
const H=hist0&&hist0.leagues?{leagues:hist0.leagues,bootBlocked:hist0.bootBlocked||null}:{leagues:{},bootBlocked:null};
const ELIG=n=>!/friendl|cup|copa|qualif|olymp|nations|international|trophy|super ?cup|play-?off|world/i.test(n||"");
const ids=L=>L._s||(L._s=new Set(L.m.map(x=>x[0])));
function absorb(list){
  for(const r of list){
    if(!r.hi||!r.ai||COVERED.has(Number(r.li))||!ELIG(r.ln))continue;
    let L=H.leagues[r.li];
    const newer=L&&r.se!=null&&L.se!=null&&Number(r.se)>Number(L.se);
    if(!L||newer)L=H.leagues[r.li]={n:label(r),se:r.se??null,tm:{},m:[],boot:null};
    if(r.se!=null&&L.se!=null&&Number(r.se)<Number(L.se))continue;   // musim lama
    if(L.se==null&&r.se!=null)L.se=r.se;
    L.n=label(r);L.tm[r.hi]=r.h;L.tm[r.ai]=r.a;
    if(FT.includes(r.s)&&r.gh!=null&&r.ga!=null&&!ids(L).has(r.id)){L.m.push([r.id,r.t,r.hi,r.ai,r.gh,r.ga]);ids(L).add(r.id)}
  }
  for(const L of Object.values(H.leagues))if(L.m.length>700){L.m.sort((a,b)=>a[1]-b[1]);L.m=L.m.slice(-700);L._s=null}
}
absorb([...byId.values()]);

// ---------- satu musim penuh per liga memakai SISA kuota harian (bila paket gratis mengizinkan) ----------
const bootInfo={done:0,total:0,blocked:false};
async function bootstrap(){
  const wcount=new Map();
  for(const r of byId.values()){const dd=wday(r.t);if(dd>=wkA&&dd<=wkB&&H.leagues[r.li])wcount.set(String(r.li),(wcount.get(String(r.li))||0)+1)}
  const el=Object.entries(H.leagues).filter(([li,L])=>L.se!=null);
  bootInfo.total=el.length;bootInfo.done=el.filter(([li,L])=>L.boot).length;
  const blocked=H.bootBlocked&&now-H.bootBlocked<7*DAY;bootInfo.blocked=!!blocked;
  if(blocked||BOOT_MAX<=0||remaining==null||quota||fatal)return;
  // cadangkan kuota untuk sisa run hari ini (sekitar 2 permintaan per jam) sebelum memakai sisanya untuk musim penuh
  const spare=()=>remaining-(2*(24-UTC_HOUR)+6);
  const targets=el.filter(([li,L])=>wcount.get(li)&&(!L.boot||now-L.boot>14*DAY)).sort((a,b)=>(wcount.get(b[0])-wcount.get(a[0])));
  let n=Math.min(BOOT_MAX,spare());
  for(const [li,L] of targets){
    if(n<=0||overDeadline())break;
    if(calls>0)await sleep(GAP);
    try{
      const {j,em,all}=await call(`league=${li}&season=${L.se}`);
      if(em.length){
        if(/request limit|requests? per day|quota|limit for the day/.test(all)){quota=true;errors.push("kuota harian habis saat mengambil musim penuh");break}
        if(/access|plan|subscription|not available|free plans/.test(all)){H.bootBlocked=now;bootInfo.blocked=true;errors.push("musim penuh tidak tersedia di paket ini; prediksi liga lain hanya dari hasil yang terkumpul");break}
        errors.push("musim "+li+": "+em.join("; "));L.boot=now;n--;continue;
      }
      absorb(recs(j.response));L.boot=now;bootInfo.done++;n--;
    }catch(e){
      if(e.fatal){fatal=true;errors.push(e.message);break}
      errors.push("musim "+li+": "+e.message);L.boot=now;n--;
    }
    if(remaining!=null)n=Math.min(n,spare());
  }
}
await bootstrap();

// ---------- model per liga ----------
const MC=new Map();
function modelOf(li){
  if(MC.has(li))return MC.get(li);
  const L=H.leagues[li];let o=null;
  if(L&&L.m.length>=MINL){
    const ms=L.m.map(x=>({t:x[1],h:x[2],a:x[3],gh:x[4],ga:x[5]})).sort((a,b)=>a.t-b.t);
    const T=new Map(),g=id=>{let x=T.get(id);if(!x){x={pts:0,gp:0,gf:0,ga:0,w:0,d:0,l:0};T.set(id,x)}return x};
    for(const m of ms){const A=g(m.h),B=g(m.a);A.gp++;B.gp++;A.gf+=m.gh;A.ga+=m.ga;B.gf+=m.ga;B.ga+=m.gh;
      if(m.gh>m.ga){A.pts+=3;A.w++;B.l++}else if(m.gh<m.ga){B.pts+=3;B.w++;A.l++}else{A.pts++;B.pts++;A.d++;B.d++}}
    const order=[...T.entries()].sort((a,b)=>b[1].pts-a[1].pts||(b[1].gf-b[1].ga)-(a[1].gf-a[1].ga)||b[1].gf-a[1].gf);
    order.forEach(([id,x],i)=>{x.pos=i+1});
    o={ms,T,mNow:fit(ms,now)};
  }
  MC.set(li,o);return o;
}
const out=[],lg=new Set();let nPred=0;
for(const r of byId.values()){
  if(COVERED.has(Number(r.li)))continue;
  const dd=wday(r.t);if(dd<wkA||dd>wkB)continue;
  const st=stOf(r);
  if(!st)continue;                                  // ditunda, dibatalkan, dll.
  if(st==="NS"&&r.t<now-3*36e5)continue;           // belum mulai tapi sudah lewat jauh: data basi
  if(st==="LIVE"&&r.t<now-4*36e5)continue;
  const name=label(r);lg.add(name);
  const base={id:"f"+r.id,league:name,utc:new Date(r.t).toISOString(),status:st,score:st==="NS"?[null,null]:[r.gh,r.ga],home:{name:r.h},away:{name:r.a}};
  const M=r.hi&&r.ai&&ELIG(r.ln)?modelOf(r.li):null;
  if(M){
    const model=r.t>now?M.mNow:fit(M.ms,r.t),gH=(model.T.get(r.hi)||{}).gp||0,gA=(model.T.get(r.ai)||{}).gp||0;
    if(gH>=MINT&&gA>=MINT){
      const p=predictM(model,r.hi,r.ai),lam=Math.max(.15,.5-.04*Math.min(gH,gA)),k=finalP(p,lam);
      p.raw={h:p.h,d:p.d,a:p.a};p.h=k[0];p.d=k[1];p.a=k[2];
      const e=r1(Math.abs(k[0]-k[2])),th=M.T.get(r.hi)||{},ta=M.T.get(r.ai)||{};
      const side=(nm,t,id,v,el)=>({name:nm,pos:t.pos||0,pts:t.pts||0,gp:t.gp||0,gf:t.gf||0,ga:t.ga||0,w:t.w||0,d:t.d||0,l:t.l||0,sp:null,elo:el,f:formOf(model,id,v)});
      out.push({...base,home:side(r.h,th,r.hi,"h",p.el[0]),away:side(r.a,ta,r.ai,"a",p.el[1]),p,pick:k[0]>=k[2]?"h":"a",edge:e,level:level(e),est:true});
      nPred++;continue;
    }
  }
  out.push({...base,np:true});
}
out.sort((a,b)=>a.utc.localeCompare(b.utc));
const dir=outDir(import.meta.url);mkdirSync(dir,{recursive:true});
writeFileSync(dir+"all.json",JSON.stringify({updated:new Date(now).toISOString(),week:[wkA,wkB],nLeagues:lg.size,nPred,boot:bootInfo,calls,remaining,range:{min:range.min,max:range.max},errors,matches:out}));
writeFileSync(dir+"all-cache.json",JSON.stringify({range,days}));
writeFileSync(dir+"all-history.json",JSON.stringify({v:1,bootBlocked:H.bootBlocked,leagues:H.leagues},(k,v)=>k[0]==="_"?undefined:v));
if(errors.length)ghWarn("semua-liga: "+errors.join(" ; "));
console.log("OK semua-liga:",out.length,"laga;",lg.size,"liga;",nPred,"berprediksi;",calls,"permintaan; sisa kuota",remaining==null?"?":remaining,"; musim penuh",bootInfo.done+"/"+bootInfo.total+(bootInfo.blocked?" (diblokir paket)":""),"; rentang tanggal",range.min,"sampai",range.max);
