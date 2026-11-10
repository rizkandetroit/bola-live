import {readFileSync,writeFileSync,mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import assert from "node:assert";
// Tes langkah semua-liga (API-Football) dengan server tiruan; keluaran ke folder sementara.
const tmp=mkdtempSync(tmpdir()+"/all-");
delete process.env.GITHUB_REPOSITORY;delete process.env.SITE_URL; // di GitHub Actions variabel ini terisi sehingga skrip ikut mengunduh cache dari situs asli lewat fetch tiruan dan menambah hitungan permintaan
process.env.OUT_DIR=tmp;process.env.BOOT_MAX="0";process.env.GAP_MS="0";process.env.RETRY_MS="0";process.env.API_FOOTBALL_KEY='"kunci-uji"';
const now=Date.now(),H=36e5,uday=t=>new Date(t).toISOString().slice(0,10);
const YEST=Date.parse(uday(now)+"T06:00:00Z")-864e5,TOMO=Date.parse(uday(now)+"T12:00:00Z")+864e5; // waktu tetap agar tes tidak bergantung jam berjalan
const fx=(id,t,lid,lname,ctry,h,a,st,gh,ga)=>({fixture:{id,timestamp:Math.floor(t/1000),status:{short:st,elapsed:st==="NS"?null:90}},league:{id:lid,name:lname,country:ctry},teams:{home:{name:h},away:{name:a}},goals:{home:gh,away:ga}});
const ALL=[
  fx(1,YEST,274,"Liga 1","Indonesia","Persib","Persija","FT",2,1),
  fx(2,now+2*H,274,"Liga 1","Indonesia","Arema","Persebaya","NS",null,null),
  fx(3,now-.5*H,144,"Jupiler Pro League","Belgium","Genk","Anderlecht","1H",1,0),
  fx(4,now+1*H,39,"Premier League","England","Arsenal","Chelsea","NS",null,null),   // sudah dicakup football-data: harus tidak muncul
  fx(5,now+3*H,203,"Süper Lig","Turkey","Fener","Gala","PST",null,null),            // ditunda: tidak muncul
  fx(6,TOMO,179,"Premiership","Scotland","Celtic","Rangers","NS",null,null),
  fx(7,now+2*H,1,"Friendlies","World","Aaa","Bbb","NS",null,null),
];
let calls=0,mode="plan",seen=[],keyHeader=null;
const ok=j=>({ok:true,status:200,headers:{get:h=>h==="x-ratelimit-requests-remaining"?"90":null},json:async()=>j});
globalThis.fetch=async(u,o)=>{
  const d=new URL(u).searchParams.get("date");calls++;seen.push(d);keyHeader=o&&o.headers&&o.headers["x-apisports-key"];
  const off=Math.round((Date.parse(d+"T00:00:00Z")-Date.parse(uday(now)+"T00:00:00Z"))/864e5);
  if(mode==="quota")return ok({errors:{requests:"You have reached the request limit for the day"},response:[]});
  if(Math.abs(off)>1)return ok({errors:{plan:"Free plans do not have access to this date"},response:[]});
  return ok({errors:[],response:ALL.filter(x=>uday(x.fixture.timestamp*1000)===d)});
};
const run=async tag=>{calls=0;seen=[];await import("./all.mjs?"+tag);return JSON.parse(readFileSync(tmp+"/all.json","utf8"))};
// 1. putaran pertama: belajar rentang, mengecualikan liga yang sudah dicakup dan laga ditunda
let a=await run("r1");
assert.equal(keyHeader,"kunci-uji","kunci dikirim di header tanpa tanda kutip");
const names=a.matches.map(m=>m.home.name).sort();
assert.deepEqual(names,["Aaa","Arema","Celtic","Genk","Persib"].sort(),"hanya laga yang pantas tampil: "+names);
assert(a.matches.every(m=>m.np===true));
assert.equal(a.matches.find(m=>m.home.name==="Genk").status,"LIVE");
assert.equal(a.matches.find(m=>m.home.name==="Persib").status,"FT");
assert.deepEqual(a.matches.find(m=>m.home.name==="Persib").score,[2,1]);
assert.equal(a.matches.find(m=>m.home.name==="Arema").league,"Liga 1 (Indonesia)");
assert.equal(a.matches.find(m=>m.home.name==="Aaa").league,"Friendlies","liga 'World' tanpa nama negara");
assert.deepEqual([a.range.min,a.range.max],[-1,1],"rentang yang diizinkan dipelajari");
assert(calls<=6&&calls>=3,"permintaan terbatas: "+calls);assert.equal(a.remaining,90);
console.log("OK 1. semua-liga:",a.matches.length,"laga;",calls,"permintaan; rentang",a.range.min,"..",a.range.max);
// 2. putaran kedua tepat setelahnya memakai cache: nol permintaan
process.env.PREV_FILE=tmp+"/all-cache.json";
a=await run("r2");assert.equal(calls,0,"cache baru tidak diambil ulang");assert.equal(a.matches.length,5);
console.log("OK 2. cache segar: 0 permintaan");
// 3. cache sudah tua 1 jam: hanya hari ini dan kemarin yang diambil ulang (besok belum 6 jam, rentang sudah dipelajari)
const c=JSON.parse(readFileSync(tmp+"/all-cache.json","utf8"));for(const d of Object.keys(c.days))c.days[d].t=now-H;
writeFileSync(tmp+"/old-cache.json",JSON.stringify(c));process.env.PREV_FILE=tmp+"/old-cache.json";
a=await run("r3");assert.equal(calls,2,"hanya 2 permintaan: "+seen);assert(!seen.some(d=>Math.abs(Math.round((Date.parse(d+"T00:00:00Z")-Date.parse(uday(now)+"T00:00:00Z"))/864e5))>0&&Math.abs(Math.round((Date.parse(d+"T00:00:00Z")-Date.parse(uday(now)+"T00:00:00Z"))/864e5))!==1));
assert.equal(a.matches.length,5);
console.log("OK 3. cache tua 1 jam: 2 permintaan (hari ini dan kemarin)");
// 4. kuota harian habis: tetap selesai dan memakai cache, galat tercatat
mode="quota";for(const d of Object.keys(c.days))c.days[d].t=now-13*H;writeFileSync(tmp+"/old-cache.json",JSON.stringify(c));
a=await run("r4");assert.equal(calls,1,"berhenti setelah kuota habis");assert(a.errors.some(e=>/kuota/.test(e)));assert.equal(a.matches.length,5);
console.log("OK 4. kuota habis: berhenti, cache dipakai");
rmSync(tmp,{recursive:true,force:true});console.log("all ok");
