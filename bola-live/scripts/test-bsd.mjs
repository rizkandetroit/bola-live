// Tes BSD: pemetaan data NYATA (cuplikan respons BSD di fixtures/bsd-sample.json) + jalan sungguhan lewat HTTP ke server tiruan.
import http from "node:http";
import {spawn} from "node:child_process";
import {mkdtempSync,readFileSync,existsSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import assert from "node:assert";
import {stOf,pickOf,h2hOf,toRecord,buildAll,isDup,backtestEntries,backtestSummary,pinOf,devig,evalMove,updateHistory} from "./bsd.mjs";

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

// V13.1: event hantu (Jordan-Australia: FT 17 Nov + sisa event NS 19 Nov di liga sama)
const ev=(id,st,d,lg,h,a,hn,an)=>({...ns,id,status:st,event_date:d,league_id:lg,home_team_id:h,away_team_id:a,home_team:hn,away_team:an,home_score:st==="finished"?2:null,away_score:st==="finished"?0:null});
const g=buildAll({events:[
  ev(655369,"finished","2026-11-17T16:00:00Z",31,484,459,"Jordan","Australia"),
  ev(654421,"notstarted","2026-11-19T16:00:00Z",31,484,459,"Jordan","Australia"),     // hantu -> dibuang
  ev(654044,"finished","2026-11-17T23:30:00Z",70,10,11,"Atlético Nacional","Once Caldas"),
  ev(655420,"notstarted","2026-11-22T01:15:00Z",71,10,11,"Atlético Nacional","Once Caldas"), // liga lain -> tetap
  ev(700001,"finished","2026-11-17T19:00:00Z",50,20,21,"Tim A","Tim B"),
  ev(700002,"notstarted","2026-11-19T19:00:00Z",50,21,20,"Tim B","Tim A"),            // tuan rumah tertukar (leg 2 / playoff) -> tetap
  ev(700003,"notstarted","2026-11-25T19:00:00Z",50,20,21,"Tim A","Tim B")             // lebih dari 3,5 hari -> tetap
],preds:[],leagues:[],now:Date.parse("2026-11-19T11:00:00Z")});
assert.equal(g.ghost,1);
assert(!g.matches.some(m=>m.eid===654421),"event hantu harus dibuang");
for(const id of [655369,654044,655420,700001,700002,700003])assert(g.matches.some(m=>m.eid===id),"laga sah "+id+" tidak boleh terbuang");
const g2=buildAll({events:[ev(654421,"notstarted","2026-11-19T16:00:00Z",31,484,459,"Jordan","Australia"),ev(1,"notstarted","2026-11-20T10:00:00Z",31,1,2,"X","Y")],preds:[],leagues:[],now:Date.parse("2026-11-20T12:00:00Z")});
assert.equal(g2.ghost,1);assert.deepEqual(g2.matches.map(m=>m.eid),[1]);   // basi > 3 jam dibuang, baru lewat 2 jam tetap
console.log("event hantu ok: dibuang",g.ghost,"+ basi",g2.ghost);

// V13.3: uji mundur dari riwayat BSD
{const lg=[{id:1,name:"Premier League",country:{name:"England"}},{id:2,name:"Liga 1",country:"Peru"}];
 const E=[],P=[];let k=0;
 const add=(lid,st,h,a,ph,pd,pa,ou,bt)=>{k++;E.push({id:k,league_id:lid,status:st,home_score:h,away_score:a,event_date:new Date(Date.UTC(2026,9,1)+k*36e5).toISOString()});
   P.push({event:{id:k},markets:{match_result:{prob_home:ph,prob_draw:pd,prob_away:pa},over_under:{prob_over_25:ou},btts:{prob_yes:bt}}})};
 for(let i=0;i<30;i++)add(1,"finished",i%3===2?0:2,i%3===2?1:0,60,25,15,60,40);   // tuan rumah favorit, 20 dari 30 benar
 for(let i=0;i<10;i++)add(2,"finished",1,1,30,40,30,30,70);                       // seri favorit, semua benar
 add(1,"notstarted",null,null,50,25,25,50,50);                                     // belum selesai -> dilewati
 add(1,"finished",1,0,null,25,25,50,50);                                           // prediksi rusak -> dilewati
 P.push(P[0]);                                                                     // prediksi dobel -> sekali saja
 const ent=backtestEntries(P,E,lg);
 assert.equal(ent.length,40);
 const bs=backtestSummary(ent,Date.parse("2026-11-20T02:00:00Z"),90);
 assert.equal(bs.n,40);assert.equal(Math.round(bs.acc),75);              // 20 + 10 benar dari 40
 assert.equal(Math.round(bs.byLeague["Premier League"].acc),67);assert.equal(bs.byLeague["Liga 1"].acc,100);
 assert.equal(bs.countries["Liga 1"],"Peru");assert.equal(bs.countries["Premier League"],"England");
 assert.equal(bs.pending,0);assert.equal(bs.days,90);assert(bs.from&&bs.to&&bs.from<bs.to);
 assert.equal(bs.ou.n,40);assert(bs.calib.reduce((t,b)=>t+b.n,0)===40);
 console.log("uji mundur ok:",bs.n,"laga, akurasi",bs.acc.toFixed(1)+"%")}

// V13.4: harga buka/tutup Pinnacle
{const R=(id,o,op,c,live)=>({event_id:id,outcome:o,bookmaker_slug:"pinnacle",opening_decimal_odds:op,decimal_odds:c,is_live:live||false});
 const P=pinOf([R(1,"HOME",2.0,1.8),R(1,"DRAW",3.4,3.6),R(1,"AWAY",3.8,4.4),
   R(2,"HOME",2.0,1.9),R(2,"DRAW",3.4,3.4),                         // tidak lengkap -> dibuang
   {event:{id:3},outcome:"HOME",opening_decimal_odds:2.5,decimal_odds:2.5},{event:{id:3},outcome:"DRAW",opening_decimal_odds:3.2,decimal_odds:3.2},{event:{id:3},outcome:"AWAY",opening_decimal_odds:2.9,decimal_odds:2.9},
   R(4,"HOME",2,9,true),R(4,"DRAW",3,9,true),R(4,"AWAY",3,9,true)]);   // in-play -> diabaikan
 assert.deepEqual([...P.keys()].sort(),[1,3]);assert.deepEqual(P.get(1),{o:[2,3.4,3.8],c:[1.8,3.6,4.4]});
 const dv=devig([2,3.4,3.8]);assert(Math.abs(dv[0]+dv[1]+dv[2]-100)<1e-9&&dv[0]>dv[2]);assert.equal(devig([2,null,3]),null);
 // riwayat: harga buka disimpan sekali, harga tutup ikut diperbarui sampai kickoff, lalu terkunci
 const t0=Date.parse("2026-11-20T00:00:00Z"),m={eid:9,league:"L",utc:"2026-11-20T12:00:00Z",status:"NS",home:{name:"A"},away:{name:"B"},p:{h:50,d:25,a:25},odds:null,score:[null,null]};
 let H=updateHistory([],[{...m,pin:{o:[2,3.4,3.8],c:[1.9,3.5,4]}}],t0);
 H=updateHistory(H,[{...m,pin:{o:[2.1,3.3,3.7],c:[1.8,3.6,4.4]}}],t0+36e5);
 H=updateHistory(H,[{...m}],t0+2*36e5);                                     // run ringan tanpa harga: catatan lama tetap
 assert.deepEqual(H[0].po,[2,3.4,3.8]);assert.deepEqual(H[0].pc,[1.8,3.6,4.4]);
 H=updateHistory(H,[{...m,status:"FT",score:[2,0],pin:{o:[9,9,9],c:[9,9,9]}}],t0+15*36e5);
 assert.deepEqual(H[0].pc,[1.8,3.6,4.4]);assert.deepEqual(H[0].r,[2,0]);   // setelah kickoff tidak berubah lagi
 // penilaian: pasar bergerak ke tuan rumah dan tuan rumah menang
 const h=[];for(let i=0;i<10;i++)h.push({r:i<7?[1,0]:[0,1],p:[55,25,20],po:[2.2,3.4,3.3],pc:[1.8,3.7,4.5]});h.push({p:[50,25,25],po:[2,3,4],pc:[2,3,4]});
 const ev=evalMove(h);assert.equal(ev.n,10);assert.equal(ev.pending,1);assert.equal(ev.moved.n,10);assert.equal(ev.moved.hit,70);
 assert(ev.close.brier<ev.open.brier,"harga tutup lebih tepat");assert(ev.moved.closeImp>ev.moved.openImp);assert.equal(ev.bsd.n,10);
 console.log("pinnacle ok: buka",ev.open.brier.toFixed(3),"tutup",ev.close.brier.toFixed(3))}

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
  if(u.pathname==="/api/v2/odds/"){const e=S.events.find(x=>x.status==="notstarted");cfg.pinQs=u.search;
    return send(200,{count:3,next:null,results:[["HOME",2.1,1.95],["DRAW",3.3,3.4],["AWAY",3.6,4.0]].map(([o,op,c])=>({event_id:e.id,outcome:o,bookmaker_slug:"pinnacle",opening_decimal_odds:op,decimal_odds:c,is_live:false}))})}
  if(u.pathname==="/api/v2/predictions/")return send(200,{count:S.predictions.length,next:null,results:S.predictions});
  if(u.pathname==="/api/v2/leagues/")return send(200,{count:S.leagues.length,next:null,results:S.leagues});
  // V12 deep
  if(u.pathname==="/api/v2/odds/best/"){const mk=u.searchParams.get("market"),e=S.events[0];
    return send(200,{count:1,next:null,results:[{event_id:e.id,market:mk,best_odds:mk==="1x2"?[{outcome:"HOME",decimal_odds:2.1,bookmaker_name:"Pinnacle"},{outcome:"DRAW",decimal_odds:3.3,bookmaker_name:"Bet365"},{outcome:"AWAY",decimal_odds:3.9,bookmaker_name:"1xBet"}]:[{outcome:mk==="btts"?"yes":"over",decimal_odds:1.8,bookmaker_name:"Unibet"}]}]})}
  let mm;
  if((mm=u.pathname.match(/^\/api\/v2\/leagues\/(\d+)\/standings\/$/)))return send(200,{league_id:+mm[1],season:{id:1,name:"S"},grouped:false,standings:[{position:1,team_id:1,team_name:"A",played:1,won:1,drawn:0,lost:0,gf:2,ga:0,gd:2,pts:3,form:"W",zone:null}],zones:[]});
  if(/^\/api\/v2\/leagues\/\d+\/top\/\w+\/$/.test(u.pathname))return send(200,{leaders:[{rank:1,player_id:5,player_name:"P",team_name:"A",value:3}]});
  if((mm=u.pathname.match(/^\/api\/v2\/events\/(\d+)\/(\w[\w-]*)\/(\w+\/)?$/))){const k=mm[2]+(mm[3]?"/"+mm[3]:"");
    if(k==="polymarket")return send(404,{error:true,status:404,detail:"Not found."});
    if(k==="odds/comparison/")return send(200,{bookmakers_count:2,markets:{"1x2":[{bookmaker_name:"Pinnacle",outcome:"HOME",decimal_odds:2.1}],corners:[]},main_lines:{}});
    return send(200,{event_id:+mm[1],kind:k,stats:{home:{ball_possession:55},away:{ball_possession:45}},lineup_status:"predicted",incidents:[{type:"goal",minute:10,is_home:true}],commentary:[{id:"a",text:"x"}],player_stats:[{player_id:1,minutes_played:90,rating:7}],results:[]})}
  if(/^\/api\/v2\/teams\/\d+\/form\/$/.test(u.pathname))return send(200,{overall:{matches:5,won:3,drawn:1,lost:1,form:"WWDLW"}});
  send(404,{error:true,status:404,detail:"Not found."});
});
await new Promise(r=>srv.listen(0,"127.0.0.1",r));
const base="http://127.0.0.1:"+srv.address().port+"/api/v2";
const run=(env)=>new Promise(res=>{
  const out=mkdtempSync(join(tmpdir(),"bsd-"));
  const p=spawn(process.execPath,[join(here,"bsd.mjs")],{env:{PATH:process.env.PATH,OUT_DIR:out,BSD_API:base,GAP_MS:"0",RETRY_MS:"0",FETCH_TIMEOUT_MS:"2000",BSD_NOW:"2026-11-17T15:00:00Z",...env}});
  let o="",e="";p.stdout.on("data",d=>o+=d);p.stderr.on("data",d=>e+=d);
  p.on("close",code=>res({code,o,e,all:existsSync(out+"/all.json")?JSON.parse(readFileSync(out+"/all.json","utf8")):null,out}));
});
const T=[];const sc=(n,f)=>T.push([n,f]);
const reset=(m="ok")=>{cfg.mode=m;cfg.hits=[]};
sc("1. jalur normal: dua halaman events, header Token, filter tanggal, hasil digabung",async()=>{reset();
  const r=await run({BSD_API_KEY:' "tok123"\n',BSD_DEEP:"0"});assert.equal(r.code,0,r.e);
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
sc("6. mode lengkap (Unlimited): odds terbaik, klasemen + top skor, Match Center per laga",async()=>{reset();
  const r=await run({BSD_API_KEY:"k",BSD_DEEP:"1",BSD_CONCURRENCY:"3"});assert.equal(r.code,0,r.e);
  assert.equal(r.all.errors.length,0,JSON.stringify(r.all.errors));assert.equal(r.all.bsd.mode,"heavy");
  const m=r.all.matches.find(x=>x.eid===S.events[0].id);assert(m.odds&&m.odds.h.o===2.1&&m.odds.h.b==="Pinnacle"&&m.odds.by.o===1.8,"harga terbaik");
  const idx=JSON.parse(readFileSync(r.out+"/leagues.json","utf8"));assert(idx.leagues.length>=1);
  const lg=JSON.parse(readFileSync(r.out+"/lg/"+idx.leagues[0].id+".json","utf8"));assert(lg.standings.length===1&&lg.top.scorers.length===1);
  const mi=JSON.parse(readFileSync(r.out+"/m/index.json","utf8"));assert(mi.ids.length>=1);
  const live=r.all.matches.find(x=>x.status==="LIVE");assert(live.dx===1,"laga live wajib punya Match Center");
  const d=JSON.parse(readFileSync(r.out+"/m/"+live.eid+".json","utf8"));assert(d.stats&&d.incidents.length===1&&d.commentary.length===1&&d.player_stats.length===1);
  assert(cfg.hits.every(h=>h.auth==="Token k"));
  // V13.3: uji mundur 90 hari dicoba (13 potongan 7 hari) tanpa galat; data tiruan < 50 laga -> file tidak ditulis
  const bt=cfg.hits.filter(h=>h.path==="/api/v2/events/"&&h.qs.includes("status=finished"));assert(bt.length>=13,"uji mundur laga: "+bt.length);
  assert(!existsSync(r.out+"/bsd-backtest.json"));
  // V13.4: harga Pinnacle tersimpan ke pin.json, ke laga, dan ke riwayat
  assert(/bookmaker_slug=pinnacle/.test(cfg.pinQs)&&/market=1x2/.test(cfg.pinQs)&&/updated_after=/.test(cfg.pinQs),cfg.pinQs);
  const ns=S.events.find(x=>x.status==="notstarted"),pj=JSON.parse(readFileSync(r.out+"/pin.json","utf8"));
  assert.deepEqual(pj.ev[ns.id],{o:[2.1,3.3,3.6],c:[1.95,3.4,4]});assert.equal(r.all.bsd.pin,1);
  assert.deepEqual(r.all.matches.find(x=>x.eid===ns.id).pin.c,[1.95,3.4,4]);
  const hj=JSON.parse(readFileSync(r.out+"/bsd-history.json","utf8")).find(x=>x.id===ns.id);assert(hj&&hj.po&&hj.pc,"riwayat menyimpan harga Pinnacle");
  assert(JSON.parse(readFileSync(r.out+"/bsd-eval.json","utf8")).move.pending>=1);
  return r.all.bsd.details+" Match Center, "+r.all.bsd.leagues+" liga, "+cfg.hits.length+" permintaan"});
let bad=0;
for(const [n,f] of T){try{const m=await f();console.log("OK    "+n+(m?"  ["+m+"]":""))}catch(e){bad++;console.log("GAGAL "+n+"\n      "+String(e.message).split("\n").slice(0,4).join("\n      "))}}
srv.close();console.log(bad?`\n${bad} GAGAL`:"\ntest-bsd ok");process.exit(bad?1:0);
