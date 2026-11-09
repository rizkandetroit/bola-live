// Tes integrasi: menjalankan update.mjs / world.mjs SUNGGUHAN lewat HTTP ke server tiruan,
// dengan skenario kegagalan yang umum terjadi di GitHub Actions.
import http from "node:http";
import {spawn} from "node:child_process";
import {mkdtempSync,readFileSync,existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import assert from "node:assert";
import {siteBase,cleanKey,outDir} from "./net.mjs";
import {checkKey,checkPages,checkBranch} from "./preflight.mjs";

// ---- unit: util & preflight ----
assert.equal(siteBase({GITHUB_REPOSITORY:"Rizkan/Bola-Live"}),"https://rizkan.github.io/Bola-Live/");
assert.equal(siteBase({GITHUB_REPOSITORY:"rizkan/rizkan.github.io"}),"https://rizkan.github.io/");
assert.equal(siteBase({SITE_URL:"http://x/y"}),"http://x/y/");assert.equal(siteBase({}),null);
assert.equal(cleanKey(' "abc"\n'),"abc");assert.equal(cleanKey(undefined),"");
assert.equal(outDir("file:///a/b/scripts/x.mjs",{OUT_DIR:"/tmp/o"}),"/tmp/o/");
assert.equal(checkKey("").level,"error");assert.equal(checkKey("   \n").level,"error");
assert.equal(checkKey("0123456789abcdef0123456789abcdef").level,"ok");assert.equal(checkKey("pendek").level,"warn");
assert.equal(checkKey('"0123456789abcdef0123456789abcdef"').level,"warn");assert.equal(checkKey("abc def").level,"error");
assert.equal(checkPages(404,null).level,"error");assert.equal(checkPages(200,{build_type:"legacy"}).level,"error");
assert.equal(checkPages(200,{build_type:"workflow"}).level,"ok");assert.equal(checkPages(403,null).level,"warn");
assert.equal(checkBranch("main","main").level,"ok");assert.equal(checkBranch("dev","main").level,"warn");
console.log("util & preflight ok");

// ---- server tiruan football-data.org (bentuk respons v4) + TheSportsDB + situs Pages ----
const TOKEN="0123456789abcdef0123456789abcdef",now=Date.now(),D=864e5;
const tm=i=>({id:i,name:"Tim"+i+" FC"});
const fin=[];let k=0;
for(let r=0;r<13;r++)for(let h=1;h<=6;h++)for(let a=1;a<=6;a++)if(h!==a){k++;fin.push({id:1000+k,t:now-(391-k)*.4*D,h,a,gh:(h*7+a*3+k)%4,ga:(h+a*5+k)%3})}
const mm=(id,h,a,t,st,sc)=>({id,utcDate:new Date(t).toISOString(),status:st,homeTeam:tm(h),awayTeam:tm(a),score:{fullTime:{home:sc?sc[0]:null,away:sc?sc[1]:null}}});
const matches=[...fin.map(x=>mm(x.id,x.h,x.a,x.t,"FINISHED",[x.gh,x.ga])),mm(1,1,2,now+1*D,"TIMED"),mm(2,3,4,now+3*D,"SCHEDULED")];
const table=[1,2,3,4,5,6].map((i,ix)=>({position:ix+1,team:tm(i),playedGames:65,won:30-ix*4,draw:10,lost:25-ix*2,points:100-ix*12,goalsFor:90-ix*8,goalsAgainst:40+ix*6}));
const cfg={mode:"ok",hits:[],site:(q,s)=>{s.writeHead(404);s.end("")},tsdb:null};
const srv=http.createServer((q,s)=>{
  cfg.hits.push({url:q.url,token:q.headers["x-auth-token"]});
  const u=new URL(q.url,"http://x"),send=(c,o)=>{s.writeHead(c,{"content-type":"application/json"});s.end(typeof o==="string"?o:JSON.stringify(o))};
  if(u.pathname.startsWith("/site/"))return cfg.site(q,s,send);
  if(u.pathname.startsWith("/tsdb/")){return cfg.tsdb?cfg.tsdb(q,s,send):send(404,{})}
  const m=u.pathname.match(/^\/v4\/competitions\/(\w+)\/(standings|matches)$/);if(!m)return send(404,{});
  const [,code,kind]=m;
  if(cfg.mode==="down")return send(503,{});
  if(q.headers["x-auth-token"]!==TOKEN||cfg.mode==="badtoken")return send(400,{message:"Your API token is invalid.",errorCode:400});
  if(cfg.mode==="restricted"&&code!=="PL")return send(403,{message:"The resource you are looking for is restricted and apparently not within your permissions. Please check your subscription.",errorCode:403});
  if(cfg.mode==="hang"&&code==="PL"&&kind==="standings")return;
  if(kind==="standings")return send(200,{standings:[{type:"TOTAL",table},{type:"HOME",table},{type:"AWAY",table}]});
  return send(200,{matches});
});
await new Promise(r=>srv.listen(0,"127.0.0.1",r));
const base="http://127.0.0.1:"+srv.address().port,here=fileURLToPath(new URL(".",import.meta.url));
const run=(env,script="update.mjs")=>new Promise(res=>{
  const out=mkdtempSync(join(tmpdir(),"bola-")),t0=Date.now();
  const p=spawn(process.execPath,[join(here,script)],{env:{PATH:process.env.PATH,GAP_MS:"0",RETRY_MS:"0",FETCH_TIMEOUT_MS:"2000",OUT_DIR:out,FOOTBALL_DATA_API:base+"/v4",SITE_URL:base+"/site/",TSDB_API:base+"/tsdb",WORLD_LEAGUES:"[]",...env}});
  let so="",se="";p.stdout.on("data",d=>so+=d);p.stderr.on("data",d=>se+=d);
  p.on("close",c=>res({code:c,out:so,err:se,dir:out,ms:Date.now()-t0}));
});
const J=(r,f)=>JSON.parse(readFileSync(join(r.dir,f),"utf8"));
const reset=(mode="ok")=>{cfg.mode=mode;cfg.hits=[];cfg.site=(q,s)=>{s.writeHead(404);s.end("")};cfg.tsdb=null};
const T=[];const sc=(n,f)=>T.push([n,f]);

sc("1. jalur normal, secret diapit kutip + baris baru (salah tempel umum)",async()=>{reset();
  const r=await run({FOOTBALL_DATA_KEY:'"'+TOKEN+'"\n'});
  assert.equal(r.code,0,r.err);const d=J(r,"data.json");
  assert(d.matches.length>=2&&d.errors.length===0,"semua liga berhasil");assert(cfg.hits.every(h=>!h.url.startsWith("/v4")||h.token===TOKEN),"token terkirim bersih");
  assert(J(r,"history.json").length>=2&&J(r,"eval.json").backtest.n>100,"riwayat dan uji mundur terisi");
  return `${d.matches.length} laga, uji mundur ${J(r,"eval.json").backtest.n} laga, ${r.ms} ms (skala 1 musim penuh x 5 liga)`});
sc("2. secret kosong: gagal cepat, pesan jelas, tanpa memanggil API",async()=>{reset();
  const r=await run({FOOTBALL_DATA_KEY:""});assert.equal(r.code,1);assert(/FOOTBALL_DATA_KEY/.test(r.err)&&/Secrets/.test(r.err));
  assert.equal(cfg.hits.length,0);assert(!existsSync(join(r.dir,"data.json")));return r.err.trim().slice(0,70)+"…"});
sc("3. token ditolak (HTTP 400): berhenti pada permintaan pertama",async()=>{reset("badtoken");
  const r=await run({FOOTBALL_DATA_KEY:TOKEN});assert.equal(r.code,1);assert(/ditolak/.test(r.err)&&/tanpa tanda kutip/.test(r.err));
  assert.equal(cfg.hits.filter(h=>h.url.startsWith("/v4")).length,1,"tidak membuang waktu mencoba 5 liga");return `${r.ms} ms`});
sc("4. 4 dari 5 liga di luar paket gratis (403): sisanya tetap tayang",async()=>{reset("restricted");
  const r=await run({FOOTBALL_DATA_KEY:TOKEN});assert.equal(r.code,0,r.err);const d=J(r,"data.json");
  assert.equal(d.errors.length,4);assert(d.errors[0].includes("HTTP 403")&&d.matches.length>=2);return d.errors[0].slice(0,60)});
sc("5. satu endpoint menggantung: timeout, liga lain tetap jalan",async()=>{reset("hang");
  const r=await run({FOOTBALL_DATA_KEY:TOKEN,FETCH_TIMEOUT_MS:"300"});assert.equal(r.code,0,r.err);const d=J(r,"data.json");
  assert.equal(d.errors.length,1);assert(/PL/.test(d.errors[0])&&/3 percobaan/.test(d.errors[0]));assert(r.ms<15000);return `${r.ms} ms, ${d.errors[0].slice(0,70)}`});
sc("6. API mati (503): 3 percobaan/liga, lalu gagal dengan pesan jelas",async()=>{reset("down");
  const r=await run({FOOTBALL_DATA_KEY:TOKEN});assert.equal(r.code,1);assert(/semua liga/.test(r.err));
  assert.equal(cfg.hits.filter(h=>h.url.startsWith("/v4")).length,15);return "15 permintaan = 5 liga x 3 percobaan"});
sc("7. batas waktu run habis: berhenti, tidak menggantung sampai timeout job",async()=>{reset("down");
  const r=await run({FOOTBALL_DATA_KEY:TOKEN,MAX_RUN_MS:"0"});assert.equal(r.code,1);assert(/batas waktu/.test(r.err));
  assert.equal(cfg.hits.filter(h=>h.url.startsWith("/v4")).length,0);return `${r.ms} ms`});
for(const [nama,site,kode,cek] of [
  ["8a. history.json belum ada (404): mulai kosong",(q,s)=>{s.writeHead(404);s.end("")},0],
  ["8b. situs mengembalikan HTML (200): mulai kosong + peringatan",(q,s)=>{s.writeHead(200,{"content-type":"text/html"});s.end("<html>bukan json</html>")},0,r=>assert(/bukan JSON/.test(r.err))],
  ["8c. akses ditolak (403): mulai kosong",(q,s)=>{s.writeHead(403);s.end("")},0],
  ["8d. server Pages galat 503 menetap: run dihentikan agar riwayat tidak tertimpa",(q,s)=>{s.writeHead(503);s.end("")},1,r=>assert(/Riwayat prediksi/.test(r.err))],
]) sc(nama,async()=>{reset();cfg.site=site;const r=await run({FOOTBALL_DATA_KEY:TOKEN});assert.equal(r.code,kode,r.err);if(cek)cek(r);return "exit "+r.code});
sc("9. riwayat lama dipertahankan dan dinilai",async()=>{reset();
  const old=[{id:999,lg:"PL",u:new Date(now-9*D).toISOString(),h:"A",a:"B",pp:[50,25,25],pe:[50,25,25],pb:[50,25,25],r:[2,0]}];
  cfg.site=(q,s,send)=>send(200,old);const r=await run({FOOTBALL_DATA_KEY:TOKEN});assert.equal(r.code,0,r.err);
  const h=J(r,"history.json");assert(h.some(x=>x.id===999&&x.r[0]===2),"hasil lama tidak hilang");assert(J(r,"eval.json").live.n>=1);return `${h.length} entri riwayat`});
sc("10. world.mjs: katalog menggantung -> tetap selesai (exit 0) dan mencatat galat",async()=>{reset();cfg.tsdb=()=>{};
  const r=await run({FETCH_TIMEOUT_MS:"300",WORLD_LEAGUES:JSON.stringify(["eredivisie"])},"world.mjs");assert.equal(r.code,0,r.err);
  const w=J(r,"world.json");assert(w.errors.some(e=>/katalog/.test(e)));assert.deepEqual(w.unresolved,["eredivisie"]);return w.errors[0].slice(0,70)});
let bad=0;
for(const [n,f] of T){try{const m=await f();console.log("OK    "+n+(m?"  ["+m+"]":""))}catch(e){bad++;console.log("GAGAL "+n+"\n      "+String(e.message).split("\n").slice(0,4).join("\n      "))}}
srv.close();console.log(bad?`\n${bad} GAGAL`:"\ntest-ci ok");process.exit(bad?1:0);
