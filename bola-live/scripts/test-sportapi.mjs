import {readFileSync,writeFileSync,mkdtempSync,rmSync,existsSync} from "node:fs";
import {tmpdir} from "node:os";
import assert from "node:assert";
// Tes langkah SportAPI dengan server tiruan (bentuk respons sama seperti sportapi.ai/api/fixtures/date/{tanggal}).
const tmp=mkdtempSync(tmpdir()+"/sa-");
delete process.env.GITHUB_REPOSITORY;delete process.env.SITE_URL;
process.env.OUT_DIR=tmp;process.env.GAP_MS="0";process.env.RETRY_MS="0";process.env.SPORTAPI_KEY='"kunci-sa"';
process.env.BACKFILL_DAYS="30";process.env.BACKFILL_PER_RUN="40";process.env.MAX_CALLS="60";
const now=Date.now(),D=864e5,H=36e5,uday=t=>new Date(t).toISOString().slice(0,10);
const iso=t=>new Date(t).toISOString().replace(/\.\d+Z$/,"Z");
const T={1:"Linfield",2:"Coleraine",3:"Larne",4:"Glentoran",5:"Cliftonville",6:"Carrick Rangers"};
const fx=(id,t,lid,ln,hid,aid,hn,an,st,gh,ga,min=null)=>({id,home_id:hid,away_id:aid,date:uday(t),datetime:"x",kickoff_utc:iso(t),status:st,minute:min,league_id:lid,league_name:ln,league_zone:"Northern Ireland",
  home_team:hn,away_team:an,home_score:gh,away_score:ga,result:null,winner:null});
const DATA=[];
for(let k=1;k<=30;k++){const h=(k%6)+1,a=((k+2)%6)+1,t=Date.parse(uday(now-k*D)+"T15:00:00Z");DATA.push(fx(100+k,t,81,"Northern Irish Premiership",h,a,T[h],T[a],"FT",(k*7)%4,(k*3)%3))}
DATA.push(fx(9001,now+2*H,81,"Northern Irish Premiership",1,2,"Linfield","Coleraine","Scheduled",null,null));
DATA.push(fx(9002,now+3*H,28,"Coupe de France",1,777,"Linfield","Orléans Amateur","Scheduled",null,null));
DATA.push(fx(9003,now+3*H,500,"Liga Tak Dikenal",888,889,"Aaa United","Bbb Town","Scheduled",null,null));
DATA.push(fx(9004,now+3*H,81,"Northern Irish Premiership",3,4,"Larne","Glentoran","Cancelled",null,null));
DATA.push(fx(9005,now+1*H,81,"Northern Irish Premiership",3,5,"Larne","Cliftonville","Scheduled",null,null));
DATA.push(fx(9006,now-1*H,81,"Northern Irish Premiership",5,6,"Cliftonville","Carrick Rangers","LIVE",1,0,"60'"));
let mode="ok",seen=[],keyHeader=null;
const resp=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body});
globalThis.fetch=async(u,o)=>{
  const d=new URL(u).pathname.split("/").pop();seen.push(d);keyHeader=o&&o.headers&&o.headers["X-Api-Key"];
  const off=Math.round((Date.parse(d+"T00:00:00Z")-Date.parse(uday(now)+"T00:00:00Z"))/D);
  if(mode==="key")return resp(401,{success:false,error:{message:"Invalid API key"}});
  if(mode==="plan"&&off<-3)return resp(403,{success:false,error:{message:"Date is outside your plan range"}});
  return resp(200,{success:true,date:d,data:DATA.filter(x=>uday(Date.parse(x.kickoff_utc))===d)});
};
const run=async tag=>{seen=[];await import("./sportapi.mjs?"+tag);return JSON.parse(readFileSync(tmp+"/all.json","utf8"))};
const seed=()=>{
  const ex=(id,h,a,t)=>({id,league:"Northern Irish Premiership",utc:iso(t),status:"NS",score:[null,null],home:{name:h},away:{name:a},np:true});
  writeFileSync(tmp+"/all.json",JSON.stringify({updated:"x",errors:[],matches:[ex("f1","Linfield","Coleraine",now+2*H),{...ex("f2","Zzz","Yyy",now+5*H),league:"Lain"}]}));
  writeFileSync(tmp+"/data.json",JSON.stringify({matches:[{id:"d1",league:"Premier",utc:iso(now+1*H),status:"NS",home:{name:"Larne FC"},away:{name:"Cliftonville"}}]}));
};
const reset=()=>{for(const f of["sa-cache.json","sa-history.json"])rmSync(tmp+"/"+f,{force:true});delete process.env.PREV_SA_FILE;delete process.env.PREV_SA_HIST};
const by=(a,id)=>a.matches.find(x=>x.id===id);
// 1. putaran pertama: isi ulang riwayat, tingkat 2/3/4, penggabungan tanpa ganda
seed();let a=await run("s1");
assert.equal(keyHeader,"kunci-sa","kunci dikirim di header X-Api-Key tanpa tanda kutip");
assert(seen.length>=30&&seen.length<=60,"permintaan: "+seen.length);
const h=JSON.parse(readFileSync(tmp+"/sa-history.json","utf8"));assert(h.leagues[81].m.length>=20,"riwayat liga 81 terkumpul: "+h.leagues[81].m.length);
const m1=by(a,"s9001");assert(m1&&m1.tier===2&&m1.est===true&&Math.abs(m1.p.h+m1.p.d+m1.p.a-100)<.2&&m1.home.pos===0&&m1.home.f,"Linfield vs Coleraine: tingkat 2");
assert(!by(a,"f1"),"laga np dari API-Football digantikan prediksi SportAPI yang lebih baik");assert(by(a,"f2"),"laga lain tetap");
const c=by(a,"s9002"),u=by(a,"s9003");
assert(c&&c.tier===3&&c.est===true&&Math.abs(c.p.h+c.p.d+c.p.a-100)<.2&&["Tipis","Sedang"].includes(c.level),"piala dengan satu tim dikenal: tingkat 3");
assert(u&&u.tier===4&&u.p.h===45&&u.p.d===28&&u.p.a===27,"tim tak dikenal: tingkat 4");
assert(!by(a,"s9004"),"laga dibatalkan tidak tampil");assert(!by(a,"s9005"),"laga yang sudah ada di data.json dilewati");
const lv=by(a,"s9006");assert(lv&&lv.status==="LIVE"&&lv.score[0]===1&&lv.score[1]===0,"laga live membawa skor");
assert(a.tiers[2]>=2&&a.tiers[3]>=1&&a.tiers[4]>=1&&a.nPred===a.tiers[2]);assert(a.sa.added>=3&&a.sa.replaced===1&&a.sa.dup>=1);
const ids=a.matches.map(x=>x.id);assert.equal(new Set(ids).size,ids.length,"tidak ada id ganda");
console.log("OK 1. riwayat",a.sa.history,"laga; tingkat",JSON.stringify(a.tiers),"; ditambah",a.sa.added,"; menggantikan",a.sa.replaced,"; dilewati",a.sa.dup,"; permintaan",seen.length);
// 2. putaran kedua dengan cache segar: nol permintaan dan hasil sama (tanpa ganda)
process.env.PREV_SA_FILE=tmp+"/sa-cache.json";process.env.PREV_SA_HIST=tmp+"/sa-history.json";
const before=a.matches.length;a=await run("s2");assert.equal(seen.length,0,"cache segar: 0 permintaan");assert.equal(a.matches.length,before);
console.log("OK 2. cache segar: 0 permintaan, jalan ulang tidak menggandakan laga");
// 3. paket membatasi tanggal lampau: rentang dipelajari, tidak fatal
reset();seed();mode="plan";a=await run("s3");
const c3=JSON.parse(readFileSync(tmp+"/sa-cache.json","utf8"));assert.equal(c3.range.min,-3,"rentang dipersempit ke -3");
assert(a.errors.some(e=>/di luar paket/.test(e)));assert(by(a,"s9001"));
console.log("OK 3. tanggal di luar paket: rentang dipelajari ("+c3.range.min+".."+c3.range.max+"), tidak fatal");
// 4. kunci ditolak: berhenti di permintaan pertama, all.json tetap utuh
reset();seed();mode="key";a=await run("s4");assert.equal(seen.length,1);assert(a.errors.some(e=>/kunci ditolak/.test(e)&&/SPORTAPI_KEY/.test(e)));assert(by(a,"f1")&&by(a,"f2"),"data lama tidak rusak");
console.log("OK 4. kunci ditolak: 1 permintaan, data lama aman");
// 5. batas harian sendiri
reset();seed();mode="ok";process.env.DAY_CAP="2";a=await run("s5");assert.equal(seen.length,2);assert(a.errors.some(e=>/batas harian/.test(e)));delete process.env.DAY_CAP;
console.log("OK 5. batas harian sendiri: berhenti di 2 permintaan");
// 6. tanpa kunci: dilewati tanpa menyentuh berkas
reset();process.env.SPORTAPI_KEY="";seed();const raw=readFileSync(tmp+"/all.json","utf8");
const {spawnSync}=await import("node:child_process");const r=spawnSync(process.execPath,[new URL("./sportapi.mjs",import.meta.url).pathname],{env:{...process.env,SPORTAPI_KEY:""},encoding:"utf8"});
assert.equal(r.status,0);assert(/dilewati/.test(r.stdout));assert.equal(readFileSync(tmp+"/all.json","utf8"),raw);
console.log("OK 6. tanpa kunci: dilewati");
rmSync(tmp,{recursive:true,force:true});console.log("sportapi ok");
