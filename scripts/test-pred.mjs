import {readFileSync,writeFileSync,mkdtempSync,rmSync,existsSync} from "node:fs";
import {tmpdir} from "node:os";
import assert from "node:assert";
// Tes prediksi untuk liga lain: musim penuh (bootstrap), diblokir paket, dan hanya dari hasil yang terkumpul.
const tmp=mkdtempSync(tmpdir()+"/pred-");
process.env.OUT_DIR=tmp;process.env.GAP_MS="0";process.env.RETRY_MS="0";process.env.API_FOOTBALL_KEY="k";process.env.UTC_HOUR="1";process.env.BOOT_MAX="5";
const now=Date.now(),D=864e5,H=36e5,uday=t=>new Date(t).toISOString().slice(0,10);
const names={1:"Alpha",2:"Beta",3:"Gamma",4:"Delta",5:"Eps",6:"Zeta",9:"Baru"};
const fx=(id,t,lid,ln,c,h,a,st,gh,ga,season=2026)=>({fixture:{id,timestamp:Math.floor(t/1000),status:{short:st}},league:{id:lid,name:ln,country:c,season},teams:{home:{id:h,name:names[h]||"T"+h},away:{id:a,name:names[a]||"T"+a}},goals:{home:gh,away:ga}});
const season=[];let k=0,id=1000;
for(let h=1;h<=6;h++)for(let a=1;a<=6;a++)if(h!==a){season.push(fx(id++,now-(31-k)*.9*D,274,"Liga 1","Indonesia",h,a,"FT",(h+a)%4,(h*a)%3));k++}
const TOD=fx(5001,now+2*H,274,"Liga 1","Indonesia",1,2,"NS",null,null);
const NEW=fx(5002,now+2*H,274,"Liga 1","Indonesia",9,3,"NS",null,null);          // tim baru tanpa riwayat -> tanpa prediksi
const BEL=fx(5003,now+2*H,144,"Jupiler Pro League","Belgium",7,8,"NS",null,null); // liga tanpa riwayat -> tanpa prediksi
let mode="ok",seasonCalls=0,dateCalls=0;
const ok=j=>({ok:true,status:200,headers:{get:h=>h==="x-ratelimit-requests-remaining"?"90":null},json:async()=>j});
globalThis.fetch=async u=>{
  const q=new URL(u).searchParams;
  if(q.get("league")){seasonCalls++;
    if(mode==="blocked")return ok({errors:{plan:"Free plans do not have access to this season, try from 2022 to 2024."},response:[]});
    return ok({errors:[],response:q.get("league")==="274"?season:[]})}
  dateCalls++;const d=q.get("date"),off=Math.round((Date.parse(d+"T00:00:00Z")-Date.parse(uday(now)+"T00:00:00Z"))/D);
  if(Math.abs(off)>1)return ok({errors:{plan:"Free plans do not have access to this date"},response:[]});
  return ok({errors:[],response:[TOD,NEW,BEL].filter(x=>uday(x.fixture.timestamp*1000)===d)});
};
const run=async tag=>{seasonCalls=0;dateCalls=0;await import("./all.mjs?"+tag);return JSON.parse(readFileSync(tmp+"/all.json","utf8"))};
// 1. musim penuh berhasil diambil: prediksi muncul untuk laga yang timnya punya cukup riwayat
let a=await run("p1");
const m=a.matches.find(x=>x.home.name==="Alpha");
assert(m&&m.est===true&&!m.np,"Alpha vs Beta berprediksi");
assert(Math.abs(m.p.h+m.p.d+m.p.a-100)<.2,"peluang berjumlah 100");
assert(m.home.pos>=1&&m.home.gp>=10&&m.home.f&&m.home.f.l5.length>0,"tabel dan form terisi");
assert(["h","a"].includes(m.pick)&&m.edge>=0&&m.level);
assert(a.matches.find(x=>x.home.name==="Baru").np===true,"tim tanpa riwayat tidak diprediksi");
assert(a.matches.find(x=>x.home.name==="T7").np===true,"liga tanpa riwayat tidak diprediksi");
assert(seasonCalls===2&&a.boot.done===2,"musim penuh diambil untuk 2 liga: "+seasonCalls);
assert(a.nPred===1&&a.boot.blocked===false);
console.log("OK 1. musim penuh:",a.nPred,"laga berprediksi;",seasonCalls,"permintaan musim");
// 2. paket menolak musim penuh: berhenti, ditandai, dan tidak dicoba lagi 7 hari
rmSync(tmp+"/all-history.json",{force:true});delete process.env.PREV_HIST;mode="blocked";
a=await run("p2");
assert(a.boot.blocked===true&&seasonCalls===1,"berhenti di penolakan pertama: "+seasonCalls);
assert(a.matches.every(x=>x.np),"tanpa riwayat, semua tanpa prediksi");
assert(a.errors.some(e=>/musim penuh/.test(e)));
const h2=JSON.parse(readFileSync(tmp+"/all-history.json","utf8"));assert(h2.bootBlocked);
process.env.PREV_HIST=tmp+"/all-history.json";process.env.PREV_FILE=tmp+"/all-cache.json";
const c=JSON.parse(readFileSync(tmp+"/all-cache.json","utf8"));for(const d of Object.keys(c.days))c.days[d].t=now-H;writeFileSync(tmp+"/all-cache.json",JSON.stringify(c));
a=await run("p2b");assert.equal(seasonCalls,0,"tidak mencoba lagi saat masih diblokir");
console.log("OK 2. musim penuh diblokir: berhenti dan tidak dicoba lagi");
// 3. hanya dari hasil yang terkumpul (riwayat sudah punya cukup laga)
const lm=season.map(x=>[x.fixture.id,x.fixture.timestamp*1000,x.teams.home.id,x.teams.away.id,x.goals.home,x.goals.away]);
const tm={};for(const i of[1,2,3,4,5,6])tm[i]=names[i];
writeFileSync(tmp+"/seed-hist.json",JSON.stringify({v:1,bootBlocked:now,leagues:{274:{n:"Liga 1 (Indonesia)",se:2026,tm,m:lm,boot:null}}}));
process.env.PREV_HIST=tmp+"/seed-hist.json";process.env.BOOT_MAX="0";delete process.env.PREV_FILE;
a=await run("p3");assert(a.matches.find(x=>x.home.name==="Alpha").est===true&&seasonCalls===0);
console.log("OK 3. dari hasil yang terkumpul saja: prediksi tetap muncul");
// 4. musim baru: riwayat musim lama dibuang
const old=JSON.parse(readFileSync(tmp+"/seed-hist.json","utf8"));old.leagues[274].se=2025;writeFileSync(tmp+"/seed-hist.json",JSON.stringify(old));
a=await run("p4");const h4=JSON.parse(readFileSync(tmp+"/all-history.json","utf8"));
assert.equal(h4.leagues[274].se,2026);assert(h4.leagues[274].m.length<5,"riwayat musim 2025 dibuang saat musim 2026 muncul");
assert(a.matches.find(x=>x.home.name==="Alpha").np===true);
console.log("OK 4. musim baru: riwayat lama dibuang, kembali tanpa prediksi sampai data terkumpul");
rmSync(tmp,{recursive:true,force:true});console.log("pred ok");
