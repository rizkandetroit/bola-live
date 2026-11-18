// Tes BSD: pemetaan data NYATA (cuplikan respons BSD di fixtures/bsd-sample.json) + jalan sungguhan lewat HTTP ke server tiruan.
import http from "node:http";
import {spawn} from "node:child_process";
import {mkdtempSync,readFileSync,existsSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import assert from "node:assert";
import {stOf,pickOf,h2hOf,toRecord,buildAll,isDup} from "./bsd.mjs";

const here=fileURLToPath(new URL(".",import.meta.url));
const S=JSON.parse(readFileSync(join(here,"fixtures/bsd-sample.json"),"utf8"));
const L=new Map(S.leagues.map(l=>[l.id,l]));

// ---- unit ----
for(const [raw,st] of [["notstarted","NS"],["upcoming","NS"],["inprogress","LIVE"],["live","LIVE"],["halftime","LIVE"],["2nd_half","LIVE"],["1st_half","LIVE"],["finished","FT"],["postponed",null],["cancelled",null],["unresolved",null],[undefined,null]])
  assert.equal(stOf(raw),st,"status "+raw);
assert.equal(pickOf("H"),"h");assert.equal(pickOf("away"),"a");assert.equal(pickOf("D"),null);assert.equal(pickOf(null),null);
console.log("status & pick ok");

const live2=S.events.find(e=>e.status==="2nd_half"),ht=S.events.find(e=>e.status==="halftime"),ns=S.events.find(e=>e.status==="notstarted");
const r2=toRecord(live2,null,L);
assert.equal(r2.status,"LIVE");assert.equal(r2.min,live2.current_minute);assert(!r2.ht);   // babak kedua tidak boleh terbuang
assert.equal(toRecord(ht,null,L).ht,true);
assert.equal(r2.lgc,"https://sports.bzzoiro.com/img/league/"+live2.league_id+"/");
assert.equal(r2.home.crest,"https://sports.bzzoiro.com/img/team/"+live2.home_team_id+"/");
assert(r2.np===true&&r2.src==="BSD");                                                    // tanpa prediksi -> jadwal saja
console.log("record live/np ok:",r2.home.name,r2.score.join("-"),r2.min+"'");

const withPred=S.predictions.map(p=>({p,e:S.events.find(e=>e.id===p.event.id)})).filter(x=>x.e);
assert(withPred.length>=1,"fixture harus punya laga berprediksi");
for(const {p,e} of withPred){
  const r=toRecord(e,p,L),mr=p.markets.match_result;
  assert.equal(r.tier,2);assert.equal(r.p.h,mr.prob_home);assert.equal(r.p.a,mr.prob_away);assert.equal(r.p.engine,"bsd");
  assert(Array.isArray(r.p.xg)&&r.p.xg.length===2,"xg harus array [tuan rumah, tamu]");
  assert(["h","a"].includes(r.pick));assert.equal(r.pick,mr.predicted==="H"?"h":mr.predicted==="A"?"a":(mr.prob_home>=mr.prob_away?"h":"a"));
  assert.equal(r.edge,Math.round(Math.abs(mr.prob_home-mr.prob_away)*10)/10);
}
console.log("prediksi ok:",withPred.length,"laga");

const eh=S.events.find(e=>e.head_to_head&&e.head_to_head.total_matches);
const h=h2hOf(eh.head_to_head);
assert.equal(h.n,eh.head_to_head.total_matches);assert.equal(h.hW,eh.head_to_head.home_wins);assert.equal(h.aW,eh.head_to_head.away_wins);
assert(h.last.length>0&&h.last.length<=5);assert(h.last.every(x=>/^\d{4}-\d\d-\d\d$/.test(x.t)&&x.s.length===2&&typeof x.l==="string"));
assert.equal(h2hOf(null),null);assert.equal(h2hOf({total_matches:0}),null);
console.log("h2h ok:",h.n,"laga,",h.last.length,"terbaru");

// nama liga: laga tidak membawa league_name -> harus dari /leagues/, bukan "Liga <id>"
const anyNamed=S.events.map(e=>toRecord(e,null,L)).filter(Boolean).some(r=>!/^Liga \d+$/.test(r.league));
assert(anyNamed,"minimal sebagian liga harus punya nama dari /leagues/");

// dedupe terhadap data.json (model sendiri) & penyaringan status tak dikenal
const first=toRecord(ns,null,L);
const own=[{utc:first.utc,home:{name:first.home.name},away:{name:first.away.name}}];
const b=buildAll({events:S.events,preds:S.predictions,leagues:S.leagues,own});
assert.equal(b.dup,1);assert(!b.matches.some(m=>isDup(m,own[0])));
assert.deepEqual(b.matches.map(m=>m.utc),[...b.matches.map(m=>m.utc)].sort());
const b2=buildAll({events:[{...ns,id:9,status:"cancelled"},{...ns,id:10,event_date:"bukan tanggal"}],preds:[],leagues:[]});
assert.equal(b2.matches.length,0);assert.equal(b2.skipped,2);
console.log("buildAll ok:",b.matches.length,"laga,",b.dup,"duplikat");

// ---- e2e: bsd.mjs dijalankan sungguhan ke server tiruan ----
const cfg={mode:"ok",hits:[]};
const srv=http.createServer((q,s)=>{
  const u=new URL(q.url,"http://x"),send=(c,o,hd={})=>{s.writeHead(c,{"content-type":"application/json",...hd});s.end(JSON.stringify(o))};
  cfg.hits.push({path:u.pathname,qs:u.search,auth:q.headers.authorization});
  if(cfg.mode==="badtoken")return send(401,{error:true,status:401,detail:"Invalid token."});
  if(cfg.mode==="quota")return send(429,{code:"taster_exhausted"},{"retry-after":"3600"});
  const base="http://127.0.0.1:"+srv.address().port;
  if(u.pathname==="/api/v2/events/"){
    const off=Number(u.searchParams.get("offset")||0),a=S.events.slice(0,6),bb=S.events.slice(6);
    return off===0?send(200,{count:S.events.length,next:base+"/api/v2/events/?date_from="+u.searchParams.get("date_from")+"&date_to="+u.searchParams.get("date_to")+"&limit=200&offset=200",results:a}):send(200,{count:S.events.length,next:null,results:bb});
  }
  if(u.pathname==="/api/v2/predictions/")return send(200,{count:S.predictions.length,next:null,results:S.predictions});
  if(u.pathname==="/api/v2/leagues/")return send(200,{count:S.leagues.length,next:null,results:S.leagues});
  send(404,{error:true,status:404,detail:"Not found."});
});
await new Promise(r=>srv.listen(0,"127.0.0.1",r));
const base="http://127.0.0.1:"+srv.address().port+"/api/v2";
const run=(env)=>new Promise(res=>{
  const out=mkdtempSync(join(tmpdir(),"bsd-"));
  const p=spawn(process.execPath,[join(here,"bsd.mjs")],{env:{PATH:process.env.PATH,OUT_DIR:out,BSD_API:base,GAP_MS:"0",RETRY_MS:"0",FETCH_TIMEOUT_MS:"2000",...env}});
  let o="",e="";p.stdout.on("data",d=>o+=d);p.stderr.on("data",d=>e+=d);
  p.on("close",code=>res({code,o,e,all:existsSync(out+"/all.json")?JSON.parse(readFileSync(out+"/all.json","utf8")):null,out}));
});
const T=[];const sc=(n,f)=>T.push([n,f]);
const reset=(m="ok")=>{cfg.mode=m;cfg.hits=[]};
sc("1. jalur normal: dua halaman events, header Token, filter tanggal, hasil digabung",async()=>{reset();
  const r=await run({BSD_API_KEY:' "tok123"\n'});assert.equal(r.code,0,r.e);
  assert(r.all.matches.length>=8);assert.equal(r.all.errors.length,0);
  assert(cfg.hits.every(h=>h.auth==="Token tok123"),"semua permintaan harus memakai Authorization: Token <key> bersih");
  const ev=cfg.hits.filter(h=>h.path.endsWith("/events/"));assert.equal(ev.length,2);assert(/date_from=/.test(ev[0].qs)&&/date_to=/.test(ev[0].qs)&&/limit=200/.test(ev[0].qs));
  const pr=cfg.hits.find(h=>h.path.endsWith("/predictions/"));assert(/date_from=/.test(pr.qs)&&/limit=200/.test(pr.qs),"prediksi harus difilter tanggal");
  assert(r.all.matches.some(m=>m.status==="LIVE"&&m.min!=null),"laga babak kedua harus tampil live");
  assert(r.all.matches.some(m=>m.tier===2&&m.p.engine==="bsd"));assert(cfg.hits.length<=8);
  return r.all.matches.length+" laga, "+cfg.hits.length+" permintaan"});
sc("2. key kosong: dilewati, exit 0, tidak memanggil API",async()=>{reset();
  const r=await run({BSD_API_KEY:"  "});assert.equal(r.code,0);assert.equal(cfg.hits.length,0);assert.equal(r.all,null)});
sc("3. token ditolak (401): berhenti cepat, pesan jelas, all.json kosong tapi ada",async()=>{reset("badtoken");
  const r=await run({BSD_API_KEY:"salah"});assert.equal(r.code,0);assert.equal(r.all.matches.length,0);
  assert(r.all.errors.some(e=>/BSD_API_KEY/.test(e)));assert.equal(cfg.hits.length,1,"jangan lanjut memanggil endpoint lain setelah ditolak");return r.all.errors[0].slice(0,60)});
sc("4. kuota harian habis (429 taster_exhausted): tidak menunggu/ulang, pesan jelas",async()=>{reset("quota");
  const t=Date.now(),r=await run({BSD_API_KEY:"k"});assert.equal(r.code,0);assert(Date.now()-t<5000);
  assert(r.all.errors.some(e=>/kuota harian/.test(e)));assert.equal(cfg.hits.length,1);});
sc("5. data.json (model sendiri) ada: laga yang sama tidak digandakan",async()=>{reset();
  const out=mkdtempSync(join(tmpdir(),"bsd-")),first=S.events.find(e=>e.status==="notstarted");
  writeFileSync(out+"/data.json",JSON.stringify({matches:[{utc:new Date(first.event_date).toISOString(),home:{name:first.home_team},away:{name:first.away_team}}]}));
  const r=await new Promise(res=>{const p=spawn(process.execPath,[join(here,"bsd.mjs")],{env:{PATH:process.env.PATH,OUT_DIR:out,BSD_API:base,GAP_MS:"0",RETRY_MS:"0",BSD_API_KEY:"k"}});p.on("close",c=>res({c,all:JSON.parse(readFileSync(out+"/all.json","utf8"))}))});
  assert.equal(r.all.bsd.dup,1);assert(!r.all.matches.some(m=>m.home.name===first.home_team&&m.away.name===first.away_team))});
let bad=0;
for(const [n,f] of T){try{const m=await f();console.log("OK    "+n+(m?"  ["+m+"]":""))}catch(e){bad++;console.log("GAGAL "+n+"\n      "+String(e.message).split("\n").slice(0,4).join("\n      "))}}
srv.close();console.log(bad?`\n${bad} GAGAL`:"\ntest-bsd ok");process.exit(bad?1:0);
