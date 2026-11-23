// Tes BSD: pemetaan data NYATA (cuplikan respons BSD di fixtures/bsd-sample.json) + jalan sungguhan lewat HTTP ke server tiruan.
import http from "node:http";
import {spawn} from "node:child_process";
import {mkdtempSync,readFileSync,existsSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import assert from "node:assert";
import {stOf,pickOf,h2hOf,toRecord,buildAll,isDup,backtestEntries,backtestSummary,pinOf,devig,evalMove,updateHistory,absOf,mixP,riskFlags,evalRisk} from "./bsd.mjs";
import {missFacts,missWhy,evalMiss,fillMissFacts,evalHistory,dcCalib,favOf,recapOf} from "./bsd.mjs";
import {kickModels,toRec as hlRec,hotOf,witaDate,HL_LEAGUES,pickLeague} from "./highlightly.mjs";
import {lineupFeatures,lineupExp,drawExp,drawShift,luckOf} from "./model.mjs";
import {applyStack} from "./stack.mjs";
import {ACT} from "./bsd.mjs";
import {factorTests as facT} from "./factors.mjs";
import {trainLean} from "./stack.mjs";
import {disagree,experiments,YOUTH} from "./model.mjs";
import {startersOf,statRow,statBack,ingest as psIngestT,teamSummary as tsT} from "./players.mjs";

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
// V22c: skor di riwayat = skor 90 menit dari BSD; koreksi BSD (mis. skor sempat termasuk perpanjangan waktu) diikuti 48 jam, lalu terkunci
{const t0=Date.parse("2026-11-20T00:00:00Z"),m={eid:77,league:"Cup",utc:"2026-11-20T12:00:00Z",status:"NS",home:{name:"A"},away:{name:"B"},p:{h:45,d:28,a:27},odds:null,score:[null,null]};
 let H=updateHistory([],[m],t0);assert.equal(H[0].r,null);
 H=updateHistory(H,[{...m,status:"FT",score:[2,2]}],t0+16*36e5);assert.deepEqual(H[0].r,[2,2]);
 H=updateHistory(H,[{...m,status:"FT",score:[1,1],et:[1,1]}],t0+20*36e5);assert.deepEqual(H[0].r,[1,1],"skor yang dikoreksi BSD ikut diperbarui");
 H=updateHistory(H,[{...m,status:"FT",score:[null,null]}],t0+21*36e5);assert.deepEqual(H[0].r,[1,1],"skor kosong tidak menimpa");
 H=updateHistory(H,[{...m,status:"LIVE",score:[3,3]}],t0+22*36e5);assert.deepEqual(H[0].r,[1,1],"status bukan FT tidak menimpa");
 H=updateHistory(H,[{...m,status:"FT",score:[9,0]}],t0+(12+49)*36e5);assert.deepEqual(H[0].r,[1,1],"lewat 48 jam setelah kickoff: terkunci");
 assert.deepEqual(H[0].p,[45,28,27],"prediksi sebelum kickoff tidak berubah");
 console.log("riwayat skor 90 menit ok")}
// V22c: model cadangan Highlightly untuk laga yang sudah selesai hanya memakai laga sebelum kickoff (tidak "tahu" hasilnya)
{const D=864e5,T0=Date.parse("2026-08-01T12:00:00Z"),fin=[];let s=7;const rnd=()=>{s=(s*16807)%2147483647;return s/2147483647};
 for(let k=0;k<60;k++)fin.push({t:T0+k*2*D,h:1+(k%6),a:1+((k+2)%6),gh:Math.floor(rnd()*3),ga:Math.floor(rnd()*3)});
 const tx=T0+40*2*D,now=T0+70*2*D;fin[40]={t:tx,h:1,a:2,gh:9,ga:0};   // laga yang dinilai: hasil ekstrem
 const K=kickModels(fin,now),mk=n=>({id:1,date:new Date(tx).toISOString(),state:{description:"Finished",score:{current:"9 - 0"}},homeTeam:{id:1,name:"A"},awayTeam:{id:2,name:"B"}});
 const lg={id:5,name:"L"},A=K.at(tx);assert.equal(A.n,40,"hanya 40 laga sebelum kickoff");assert.equal(K.at(now+D),K.model,"laga mendatang memakai model terbaru");
 const before=hlRec(mk(),lg,null,A),leak=hlRec(mk(),lg,null,K.model);
 const fin2=fin.slice();fin2[40]={...fin[40],gh:0,ga:3};const other=hlRec(mk(),lg,null,kickModels(fin2,now).at(tx));
 assert.deepEqual(before.p,other.p,"peluang laga selesai tidak bergantung pada hasil laga itu sendiri");
 assert.notDeepEqual(leak.p,before.p,"cara lama (model sekarang) memang terpengaruh hasilnya");
 console.log("Highlightly kickoff ok:",before.p.h,"/",before.p.d,"/",before.p.a,"vs bocor",leak.p.h)}
// V22d: hemat kuota Highlightly — skor "hari ini" hanya untuk laga yang sedang berjalan, atau yang mestinya sudah selesai (maks 3 kali)
{const now=Date.parse("2026-11-21T12:40:00Z"),m=(id,kick,desc)=>({id,date:new Date(now+kick*6e4).toISOString(),state:{description:desc}});
 const M=[m(1,90,"Not started"),m(2,5,"Not started"),m(3,-30,"First half"),m(4,-140,"Second half"),m(5,-200,"Not started"),m(6,-60,"Finished"),m(7,-300,"Postponed"),m(8,-50*60,"Not started")];
 const {live,late}=hotOf(M,now,{});assert.deepEqual(live.map(x=>x.id),[2,3,4],"belum mulai >10 menit lagi / selesai / ditunda: tidak");
 assert.deepEqual(late.map(x=>x.id),[5],"lewat 150 menit tanpa hasil: ambil hasil; >36 jam: tidak");
 assert.deepEqual(hotOf(M,now,{5:3}).late,[],"maksimal 3 kali per laga");
 assert.equal(witaDate(Date.parse("2026-11-21T17:00:00Z")),"2026-11-22","laga Eropa 01.00 WITA = tanggal WITA besok");assert.equal(witaDate(Date.parse("2026-11-21T07:30:00Z")),"2026-11-21");
 console.log("Highlightly hemat kuota: pemilihan laga ok")}
// V22d: BSD vs Model BL berbeda arah
{const r=(b,p,o)=>({b,p,o}),R=[r([50,30,20],[55,25,20],0),r([50,30,20],[30,25,45],0),r([50,30,20],[30,25,45],2),r([50,30,20],[30,25,45],1),r([20,30,50],[60,20,20],0),r([45,30,25],null,0)];
 const D=disagree(R);assert.deepEqual({n:D.n,of:D.of,bsd:D.bsd,bl:D.bl,none:D.none},{n:4,of:5,bsd:1,bl:2,none:1});assert.deepEqual(D.bl50,{n:1,bsd:0,bl:1});
 assert.equal(disagree([r([50,30,20],[50,30,20],0)]),null);console.log("beda arah ok")}
// V23a: line-up resmi + baris statistik ringkas per laga (bisa dibaca ulang oleh ingest dengan hasil sama)
{const xi=t=>({team_id:t,players:Array.from({length:11},(_,k)=>({id:t*100+k}))});
 assert.deepEqual(startersOf({lineup_status:"confirmed",lineups:{home:xi(1),away:xi(2)}}),[xi(1).players.map(p=>p.id),xi(2).players.map(p=>p.id)]);
 assert.equal(startersOf({lineup_status:"predicted",lineups:{home:xi(1),away:xi(2)}}),0,"line-up perkiraan bukan starter asli");assert.equal(startersOf(null),0);
 assert.equal(startersOf({lineup_status:"confirmed",lineups:{home:{players:[{id:1}]},away:xi(2)}}),0,"line-up tidak lengkap");
 const raw=[{player_id:7,team_id:1,minutes_played:90,rating:7.3,goals:1,goal_assist:0,expected_goals:.62,expected_assists:.11,key_pass:2,big_chance_created:1,goals_prevented:0,saves:0},
   {player_id:8,team_id:1,minutes_played:30,rating:null,goals:0,goal_assist:1,expected_goals:0,expected_assists:.3,key_pass:1,big_chance_created:0,goals_prevented:0,saves:0},
   {player_id:9,team_id:2,minutes_played:90,rating:6.8,goals:0,goal_assist:0,expected_goals:0,expected_assists:0,key_pass:0,big_chance_created:0,goals_prevented:.45,saves:4},
   {player_id:10,team_id:2,minutes_played:0,rating:null},{player_id:null,team_id:2,minutes_played:90}];
 const rows=raw.map(statRow).filter(Boolean);assert.equal(rows.length,3,"pemain tanpa menit / tanpa id dibuang");assert.deepEqual(rows[0],[7,1,90,73,1,0,62,11,3,0,0]);assert.equal(rows[1][3],-1);
 const A={},B2={};psIngestT(A,5,Date.parse("2026-11-01"),raw);psIngestT(B2,5,Date.parse("2026-11-01"),rows.map(statBack));
 for(const t of [1,2]){const x=tsT(A.t[t],{}),y=tsT(B2.t[t],{});assert.deepEqual(JSON.parse(JSON.stringify(x)),JSON.parse(JSON.stringify(y)),"ringkasan sama setelah dibaca ulang (tim "+t+")")}
 console.log("xi2 (line-up + statistik per laga) ok")}
// V24: bedah meleset
{const G=(min,h,hs,as,add)=>({type:"goal",minute:min,added_time:add||null,is_home:h,home_score:hs,away_score:as});
 const o={status:"FT",stats:{stats:{home:{expected_goals:2.1},away:{expected_goals:.7}}},incidents:[G(20,true,1,0),{type:"card",card_type:"red",is_home:false,minute:60},{type:"card",card_type:"red",is_home:false,minute:30},G(88,false,1,1),{type:"card",card_type:"yellow",is_home:true,minute:10}]};
 const f=missFacts(o);assert.deepEqual(f,{x:[2.1,.7],rd:[null,30],lt:[1,0]});
 assert.equal(missWhy(0,[1,1],f),"telat","unggul 1-0 lalu disamakan menit 88");
 assert.equal(missWhy(2,[1,1],f),"merah","tamu kena merah menit 30");
 assert.equal(missWhy(0,[1,1],{x:[2.1,.7],rd:[null,null],lt:null}),"apes");assert.equal(missWhy(0,[0,1],{x:[.6,1.9],rd:[null,null],lt:null}),"salah");
 assert.equal(missWhy(0,[1,1],{x:[1.2,1.0],rd:[null,null],lt:null}),"tipis");assert.equal(missWhy(1,[2,0],{x:[2.5,.4],rd:[null,null],lt:null}),"salah");
 assert.equal(missWhy(0,[2,0],f),null,"tebakan benar");assert.equal(missWhy(0,[0,0],null),"nodata");assert.equal(missWhy(0,[0,0],{x:null,rd:[null,null],lt:null}),"nodata");
 assert.equal(missFacts({status:"FT"}),null);assert.deepEqual(missFacts({stats:{home:{expected_goals:1},away:{expected_goals:2}}}),{x:[1,2],rd:[null,null],lt:null},"bentuk statistik datar");
 const now=Date.parse("2026-11-22T12:00:00Z"),E=(id,h,r,p,bl)=>({id,u:new Date(now-h*36e5).toISOString(),r,p,bl});
 const H=[E(1,10,[1,1],[60,25,15],[55,25,20]),E(2,10,[2,0],[60,25,15],[30,30,40]),E(3,2,[0,1],[50,30,20],null),E(4,120,[0,1],[50,30,20],null),E(5,10,null,[50,30,20],null)];
 const n=fillMissFacts(H,now,id=>id===1?o:id===2?{status:"LIVE"}:null);assert.equal(n,1);assert.deepEqual(H[0].f,f);assert.equal(H[1].f,undefined,"belum FT: coba lagi nanti");
 assert.equal(H[2].f,undefined,"baru 2 jam: tunggu statistik final");assert.equal(H[3].f,null,"lewat 4 hari tanpa data: berhenti mencoba");
 const M=evalMiss(H,now);assert.equal(M.bsd.n,4,"hanya yang ada hasil");assert.equal(M.bsd.miss,3);assert.equal(M.bsd.c.telat,1);assert.equal(M.bsd.c.nodata,2);assert.equal(M.bsd.draw,1);assert.equal(evalMiss(H,now,3).bsd.n,3,"jendela hari");
 assert.equal(M.bl.n,2);assert.equal(M.bl.miss,2);assert.equal(M.bl.c.telat,1);assert.equal(evalMiss([],now),null);
 // V24c: rentang sebenarnya dari laga yang dinilai
 assert.equal(M.from,H[3].u);assert.equal(M.to,H[2].u);assert.equal(evalMiss(H,now,3).from,H[0].u,"jendela 3 hari: laga 120 jam lalu tidak dihitung");
 {const ev=evalHistory(H);assert.deepEqual(ev.span,{from:H[3].u,to:H[2].u});assert.equal(evalHistory([]).span,null)}
 console.log("bedah meleset ok")}
// V25: kalibrasi "tidak kalah" untuk tab Favorit
{const E=(p,r)=>({p,r,u:"2026-11-20T10:00:00Z"});
 const R=[E([70,20,10],[1,1]),E([70,20,10],[0,1]),E([10,10,80],[0,2]),E([5,10,85],[1,1]),E([50,25,25],[0,3]),E([60,30,10],[2,0]),E([30,40,30],[0,0]),E([45,40,15],null)];
 const c=dcCalib(R);assert.equal(c.all.n,5,"hanya >=80% yang sudah selesai");assert.equal(c.all.hit,80);
 assert.deepEqual(c.b.map(b=>b.n),[0,0,4,1]);assert.equal(c.b[2].hit,75,"90-95: 3 dari 4 tidak kalah (tamu seri dihitung aman)");assert.equal(c.b[3].hit,100);
 assert.equal(c.all.avg,(90+90+90+95+90)/5);assert.equal(evalHistory(R.filter(e=>e.r)).dc.all.n,5,"ikut di evalHistory/backtest")}
{assert.deepEqual(favOf([70,20,10]),{s:0,v:90});assert.deepEqual(favOf([5,10,85]),{s:2,v:95});assert.equal(favOf([50,25,25]),null);assert.equal(favOf([50,25,25],70).v,75);assert.equal(favOf(null),null);
 const now=Date.parse("2026-11-22T12:00:00Z"),o=[1.5,4,6],bl=[60,25,15],H=[{id:1,lg:"L1",h:"A",a:"B",u:"2026-11-21T10:00:00Z",p:[70,20,10],r:[1,1],o,bl,xq:1},{id:2,lg:"L2",h:"C",a:"D",u:"2026-11-21T11:00:00Z",p:[5,10,85],r:[2,1],o,bl},{id:3,lg:"L1",h:"E",a:"F",u:"2026-11-21T12:00:00Z",p:[45,30,25],r:[0,0],o,bl},
   {id:4,lg:"L3",h:"G",a:"H",u:"2026-11-21T13:00:00Z",p:[88,8,4],r:[0,1],o:null,bl,xq:1},{id:5,lg:"L3",h:"I",a:"J",u:"2026-11-21T14:00:00Z",p:[88,8,4],r:[0,1],o,bl:null},{id:6,lg:"L4",h:"K",a:"L",u:"2026-11-21T15:00:00Z",p:[88,8,4],r:[0,1],o,bl,xq:0}];
 const d=recapOf(H,now).days[0];assert.equal(d.fv.n,2,"tanpa odds / tanpa Model BL / tanpa xG: tidak ikut");assert.equal(d.fv.hit,1,"tamu kalah 2-1: meleset");
 assert.deepEqual(d.fv.m[0],["L2","C","D",2,1,2,95,0],"urut peluang tertinggi");assert.deepEqual(d.fv.m[1],["L1","A","B",1,1,0,90,0]);
 assert.equal(recapOf([H[2]],now).days[0].fv,null,"tanpa favorit");
 {const ev=evalHistory(H);assert.equal(ev.dc.all.n,5,"semua >=80%");assert.equal(ev.dcF.all.n,2,"hanya data lengkap");assert.equal(ev.dcF.all.hit,50)}
 const U=updateHistory([],[{eid:9,status:"NS",utc:"2026-11-23T10:00:00Z",league:"L",home:{name:"A"},away:{name:"B"},p:{h:80,d:12,a:8,xg:null}}],now);assert.equal(U[0].xq,0,"catat xq")}
{const T=HL_LEAGUES.find(l=>l.name==="Thai League 1"),M=HL_LEAGUES.find(l=>l.name==="Malaysia Super League");
 assert(T&&T.id===252680&&T.extra,"Thailand: extra");assert(M&&M.id===null&&M.extra&&M.find,"Malaysia: dicari");assert(HL_LEAGUES.filter(l=>!l.extra).every(l=>l.country==="Indonesia"),"hanya Indonesia yang prioritas");
 const L=[{id:1,name:"Malaysia Super League Women"},{id:2,name:"Malaysia FA Cup"},{id:3,name:"Super League"},{id:4,name:"Malaysia Super League"}];
 assert.equal(pickLeague(L,M),3,"lewati wanita & piala, ambil Super League pertama");assert.equal(pickLeague([{id:9,name:"Malaysia Cup"}],M),null);assert.equal(pickLeague(null,M),null)}
{// V28: koreksi line-up tahap 2 — tanpa bocor + mendeteksi efek yang ditanam
 const E={};let id=1,rnd=(()=>{let x=7;return()=>(x=(x*16807)%2147483647)/2147483647})();
 const pl=(team,k)=>team*100+k,good=k=>k<11?7.5:6.4;   // pemain 0-10 = utama (bagus), 11-21 = cadangan (lemah)
 const R=[];
 for(let i=0;i<900;i++){const h=1+(i%10),a=1+((i+3)%10);if(h===a)continue;const subH=rnd()<.35,subA=rnd()<.35;
   const xi=(t,sub)=>Array.from({length:11},(_,k)=>pl(t,sub&&k<6?k+11:k));const sh=xi(h,subH),sa=xi(a,subA);
   const row=(t,ids)=>ids.map(p=>[p,t,90,Math.round(good(p%100)*10),0,0,0,0,0,0,0]);
   const st=(subA?.6:0)-(subH?.6:0),u=rnd(),o=u<.36+st*.5?0:u<.64+st*.3?1:2;   // line-up lemah -> peluang turun
   E[id]={t:1e9+i*3600,h,a,s:[sh,sa],r:[...row(h,sh),...row(a,sa)]};R.push({id,b:[40,28,32],p:[40,28,32],o,t:1e9+i*3600});id++}
 const F=lineupFeatures(E);assert(F.size>500,"fitur terbentuk: "+F.size);
 const first=Object.keys(E)[0];assert(!F.has(first)||F.get(first).only,"laga pertama: belum ada riwayat pemain");
 // tanpa bocor: mengubah rating laga X sendiri tidak mengubah fitur laga X
 const k=String(600),f0=F.get(k);const E2=JSON.parse(JSON.stringify(E));E2[k].r=E2[k].r.map(r=>(r[3]=10,r));const f1=lineupFeatures(E2).get(k);
 assert(f0&&f1&&Math.abs(f0.dh-f1.dh)<1e-12&&Math.abs(f0.da-f1.da)<1e-12,"rating laga itu sendiri tidak dipakai");
 const X=lineupExp(R,E);assert(X.n>=400&&X.bsd&&X.bsd.beta>0&&X.bsd.gain>0,"efek line-up tertangkap: "+JSON.stringify(X.bsd));
 assert.equal(lineupExp(R.slice(0,50),E).note,"belum cukup laga");assert.equal(lineupExp(R,{}),null)}
console.log("OK    V28: koreksi line-up tahap 2 (uji coba, tanpa bocor)");
{// V31: kiper cadangan & beban menit
 const E={},R=[];let id=1;const D=86400;
 for(let i=0;i<30;i++){const t=1e9+i*7*D,gk=i>=20&&i%2===0?199:101;   // tim 1: kiper utama 101, sesekali cadangan 199 setelah laga ke-20
   const sh=[gk,...Array.from({length:10},(_,k)=>102+k)],sa=[301,...Array.from({length:10},(_,k)=>302+k)];
   const row=(ids,team)=>ids.map(p=>[p,team,90,70,0,0,0,0,0,0,(p===101||p===199||p===301)?3:0]);
   E[id]={t,h:1,a:2,s:[sh,sa],r:[...row(sh,1),...row(sa,2)]};R.push({id,b:[50,25,25],o:gk===199?2:0,t});
   if(i===5){E[id+100]={t:t+2*D,h:1,a:3,s:[sh,sa.map(p=>p+500)],r:[...row(sh,1)]};E[id+101]={t:t+4*D,h:1,a:4,s:[sh,sa.map(p=>p+600)],r:[...row(sh,1)]}}
   id++}
 const F=lineupFeatures(E);const lateBackup=[...F.entries()].filter(([k,f])=>f.gk&&f.gk[0]===1).map(([k])=>+k);
 assert(lateBackup.length>=2&&lateBackup.every(k=>k>20),"kiper cadangan terdeteksi setelah kiper utama mapan: "+lateBackup);
 assert(F.get("107")&&F.get("107").fat[0]>=150,"beban menit: 2 laga dalam 8 hari -> tinggi: "+JSON.stringify(F.get("107")));
 const X=lineupExp(R,E);assert(X.fac&&X.fac.kiperCadangan&&X.fac.kiperCadangan.win===0&&X.fac.kiperUtama.n>10,"uji faktor kiper: "+JSON.stringify(X.fac))}
console.log("OK    V31: kiper cadangan & beban menit");
{// V29: koreksi terarah menemukan bias pelatih baru & habis Eropa yang ditanam
 let x=11;const rnd=()=>(x=(x*16807)%2147483647)/2147483647,R=[];
 for(let i=0;i<3000;i++){const nc=[rnd()<.15?1:0,rnd()<.15?1:0],eu=[rnd()<.1?1:0,rnd()<.1?1:0],b=[45,27,28];
   const z=-.5*(nc[0]-nc[1])+.5*(eu[0]-eu[1]),e=[Math.exp(Math.log(.45)+z),.27,Math.exp(Math.log(.28)-z)],t=e[0]+e[1]+e[2],u=rnd()*t,o=u<e[0]?0:u<e[0]+e[1]?1:2;
   R.push({o,b,p:[60,20,20],l:1+(i%5),t:i,tb:null,nc,eu})}
 const L=trainLean(R);assert(L.m.th[1]<-.2&&L.m.th[2]>.2,"arah koreksi benar: "+JSON.stringify(L.m.th));assert(L.on,"lolos pada data yang biasnya nyata");
 assert(L.test.lean.ll<L.test.bsd.ll);const N=trainLean(R.map(r=>({...r,nc:[0,0],eu:[0,0]})));assert(!N.on,"tanpa bias: tidak lolos");
 assert.equal(trainLean(R.slice(0,100)).on,false)}
console.log("OK    V29: koreksi terarah BSD");
{// V29b: RPS & kelompok liga & pembanding pasar di evaluasi
 const H=[{lg:"Premier League",u:"2026-11-20T10:00:00Z",p:[60,25,15],r:[1,0],o:[1.6,4,6]},{lg:"Coupe de France",u:"2026-11-20T11:00:00Z",p:[60,25,15],r:[0,0]},{lg:"Liga X",u:"2026-11-20T12:00:00Z",p:[40,30,30],r:[0,2]}];
 const ev=evalHistory(H);assert(Math.abs(ev.rps-((.4**2+.15**2)/2+(.6**2+.15**2)/2+(.4**2+.7**2)/2)/3)<1e-9,"RPS benar: "+ev.rps);
 assert.equal(ev.seg.top5.n,1);assert.equal(ev.seg.piala.n,1);assert.equal(ev.seg.lain.n,1);assert(ev.market&&ev.market.n===1&&ev.market.bsdRps!=null&&ev.market.bsdAcc===100)}
console.log("OK    V29b: RPS, kelompok liga, pembanding pasar");
{// V30: analisis seri — laga berimbang lebih sering seri (ditanam), liga 2 punya seri lebih tinggi dari perkiraan BSD
 let x=5;const rnd=()=>(x=(x*16807)%2147483647)/2147483647,R=[];
 for(let i=0;i<3000;i++){const bal=rnd()<.25,l=1+(i%3),b=bal?[36,31,33]:[55,24,21],pd=(bal?.40:.20)+(l===2?.15:0),u=rnd(),o=u<pd?1:u<pd+(1-pd)*.6?0:2;
   R.push({o,b,p:bal?[35,31,34]:[56,23,21],l,t:i})}
 const D=drawExp(R);assert(D.rule&&D.rule.pass&&D.rule.test.draw>D.rule.test.base+5,"rawan seri tertangkap: "+JSON.stringify(D.rule));
 assert(D.corr.pass&&D.corr.gain>0,"koreksi seri per liga membaik: "+JSON.stringify(D.corr));assert.equal(D.lg[0][0],2,"liga dengan selisih seri terbesar di atas");
 assert.equal(drawExp(R.slice(0,100)),null)}
console.log("OK    V30: analisis seri");
{// V30b: faktor rotasi — sebelum laga Eropa & unggulan di piala
 const D=864e5,ms=[],J=[];let id=1;
 for(let w=0;w<40;w++){const t0=Date.UTC(2026,0,1)+w*7*D;
   ms.push({id:id,t:t0,l:1,h:10,a:20+w,gh:1,gh2:0,ga:1,hc:null,ac:null,tr:null});J.push({id:id,o:1,b:[65,20,15],p:[60,22,18]});id++;   // liga: tim 10 diunggulkan, seri (rotasi)
   ms.push({id:id,t:t0+3*D,l:99,h:10,a:90+w,gh:2,ga:0,hc:null,ac:null,tr:null});id++;                                             // laga Eropa 3 hari kemudian
   ms.push({id:id,t:t0+5*D,l:7,h:10,a:60+w,gh:0,ga:1,hc:null,ac:null,tr:null});J.push({id:id,o:2,b:[70,18,12],p:[68,19,13]});id++}   // piala: unggulan kalah
 const F=facT(ms,J,new Set([99]),new Set([7]));assert(F.sebelumEropa&&F.sebelumEropa.n===40&&F.sebelumEropa.win===0&&F.sebelumEropa.gapBsd<-60,"sebelum Eropa: "+JSON.stringify(F.sebelumEropa));
 assert(F.pialaUnggulan&&F.pialaUnggulan.n===40&&F.pialaUnggulan.win===0,"unggulan piala: "+JSON.stringify(F.pialaUnggulan));assert(F.habisEropa&&F.habisEropa.n===40,"habis Eropa tetap jalan")}
console.log("OK    V30b: faktor rotasi");
{// V32: jalur pemasangan — sakelar mati, model terarah & geseran seri siap dipakai
 assert.deepEqual(ACT,{lean:false,drawCorr:false},"sakelar default mati");
 const q=drawShift([50,25,25],Math.log(1.2));assert(Math.abs(q[0]+q[1]+q[2]-100)<1e-9&&q[1]>25&&q[0]/q[2]===2,"geser seri: "+q);assert.deepEqual(drawShift([50,25,25],null),[50,25,25]);
 let x=3;const rnd=()=>(x=(x*16807)%2147483647)/2147483647,R=[];for(let i=0;i<1500;i++){const nc=[rnd()<.2?1:0,0];const z=-.6*nc[0],e=[.45*Math.exp(z),.27,.28*Math.exp(-z)],t=e[0]+e[1]+e[2],u=rnd()*t;R.push({o:u<e[0]?0:u<e[0]+e[1]?1:2,b:[45,27,28],p:null,l:1,t:i,nc,eu:[0,0],tb:null})}
 const L=trainLean(R),p=applyStack(L.m,{b:[45,27,28],p:null,l:1,nc:[1,0],eu:[0,0],tb:null});assert(p&&p.every(Number.isFinite)&&p[0]<45,"model terarah langsung bisa dipakai: "+p);
 const D=drawExp(Array.from({length:600},(_,i)=>({o:i%3===0?1:0,b:[50,25,25],l:1+(i%2),t:i})));assert(D.corr.dl&&D.corr.dl[1]>0,"geseran seri per liga tersimpan: "+JSON.stringify(D.corr.dl))}
console.log("OK    V32: jalur pemasangan (sakelar mati)");
{// V34d: keberuntungan hanya dari liga rumah tim; hasil laga berjadwal di masa depan tidak dicatat
 const now=Date.parse("2026-11-20T00:00:00Z"),d=864e5,ms=[{id:1,l:1,h:10,a:11,gh:2,ga:0,xh:1,xa:1,t:now-10*d,se:5},{id:2,l:9,h:10,a:12,gh:3,ga:0,xh:2,xa:.5,t:now-5*d,se:7},{id:3,l:1,h:11,a:10,gh:1,ga:1,xh:1,xa:1,t:now-3*d,se:5}];
 const A=luckOf(ms,now),B=luckOf(ms,now,200,new Map([[10,1],[11,1],[12,9]]));assert.equal(A[10].n,3);assert.equal(B[10].n,2,"laga piala/Eropa tidak ikut");
 const H=updateHistory([{id:5,u:"2026-11-28T15:00:00Z",p:[40,30,30]}],[{eid:5,utc:"2026-11-28T15:00:00Z",status:"FT",score:[2,1],home:{name:"A"},away:{name:"B"}}],now);assert(!H.find(e=>e.id===5).r,"skor laga yang belum jadwalnya tidak dicatat")}
console.log("OK    V34d: keberuntungan per liga & hasil janggal");
console.log("OK    V25: kalibrasi tidak kalah (Favorit)");
// V24b: uji coba tim muda/cadangan + aturan tebak seri (data sintetis dengan pola yang diketahui)
{let sd=11;const rnd=()=>{sd=(sd*16807)%2147483647;return sd/2147483647};const R=[],nm=id=>id>=900?"Jong Team "+id:"Team "+id;
 for(let k=0;k<1200;k++){const y=k%5===0,h=y?900+k%7:k%40,a=y?950+k%5:40+k%30;
   // laga biasa: BSD cukup tepat; laga tim muda: BSD terlalu yakin (hasil acak); laga berimbang (k%3==1): seri lebih sering dari perkiraan
   let b,o;if(y){b=[65,20,15];o=rnd()<.4?0:rnd()<.5?1:2}else if(k%3===1){b=[37,34,29];o=rnd()<.45?1:rnd()<.5?0:2}else{b=[55,25,20];const u=rnd();o=u<.55?0:u<.8?1:2}
   R.push({t:k*36e5,h,a,o,b,p:b})}
 const X=experiments(R,nm);assert(X&&X.youth.n===240&&X.youth.of===1200,JSON.stringify(X&&X.youth));
 assert(X.youth.accB<X.youth.accBo,"tim muda lebih sulit");assert(X.youth.T>1&&X.youth.gain>0,"melunakkan peluang membantu: "+JSON.stringify(X.youth));
 assert(X.draw.th&&X.draw.gain>0&&X.draw.hold.nDraw>0,"aturan seri membantu pada data ini: "+JSON.stringify(X.draw));
 assert.equal(experiments(R.slice(0,100),nm),null,"data terlalu sedikit");
 for(const n of ["Jong Ajax","Club NXT U23","Real Madrid Castilla","Juventus Next Gen U23"])assert(YOUTH.test(n),n);for(const n of ["Ajax","Bilbao","Club Brugge KV"])assert(!YOUTH.test(n),n);
 console.log("uji coba ok:",JSON.stringify(X.draw))}

// V13.5: pemain absen, prediksi gabungan, indikator risiko
{const lu={unavailable_players:{home:[{name:"Alex Roldán",short_name:"A. Roldán",status:"injured",reason:"Calf"},{name:"Y Gómez",status:"suspended"}],away:[{short_name:"D. Luna",status:"doubtful"}]}};
 assert.deepEqual(absOf(lu),{h:[["A. Roldán","i"],["Y Gómez","s"]],a:[["D. Luna","d"]],nh:2,na:1});
 assert.deepEqual(absOf({unavailable_players:{home:[],away:[]}}),{h:[],a:[],nh:0,na:0});assert.equal(absOf(null),null);
 const big={unavailable_players:{home:Array.from({length:9},(_,i)=>({short_name:"P"+i,status:"injured"})),away:[]}};const b=absOf(big);assert.equal(b.h.length,6);assert.equal(b.nh,9);
 const mx=mixP([60,25,15],[40,30,30],.5);assert(Math.abs(mx[0]-50)<1e-9&&Math.abs(mx[0]+mx[1]+mx[2]-100)<1e-9);assert.equal(mixP(null,[1,1,1],.5),null);
 assert.deepEqual(riskFlags({p:[38,32,30]}),["tipis"]);assert.deepEqual(riskFlags({p:[41,30,29]}),[]);
 assert.deepEqual(riskFlags({p:[55,25,20],pc:[3.5,3.4,2.0]}),["beda"]);                 // pasar mengunggulkan tim tamu
 assert.deepEqual(riskFlags({p:[55,25,20],ab:[3,2]}),["absen"]);assert.deepEqual(riskFlags({p:[55,25,20],ab:[1,1]}),[]);
 const H=[];for(let i=0;i<10;i++)H.push({p:[38,32,30],r:i<3?[1,0]:[0,1]});for(let i=0;i<10;i++)H.push({p:[60,25,15],r:i<8?[1,0]:[0,0],ab:[0,0]});H.push({p:[60,25,15]});
 const R=evalRisk(H);assert.equal(R.semua.n,20);assert.equal(R.tipis.acc,30);assert.equal(R.aman.acc,80);assert.equal(R.adaAbsen.n,10);
 // gabungan: pasar lebih tepat -> bobot terbaik condong ke pasar; riwayat menyimpan jumlah absen
 const h=[];for(let i=0;i<400;i++)h.push({r:i%10<7?[1,0]:[0,1],p:[34,33,33],po:[2,3.4,3.8],pc:[1.45,4.4,6.5]});
 const ev=evalMove(h);assert(ev.mix&&ev.mix.w<.5,"bobot BSD kecil: "+ev.mix.w);assert(ev.mix.best.brier<=ev.bsd.brier);assert.equal(ev.mix.ok,true);
 const ev2=evalMove(h.slice(0,50));assert.equal(ev2.mix.ok,false,"data sedikit -> belum dipakai");
 const t0=Date.parse("2026-11-20T00:00:00Z"),m={eid:5,league:"L",utc:"2026-11-20T12:00:00Z",status:"NS",home:{name:"A"},away:{name:"B"},p:{h:50,d:25,a:25},score:[null,null]};
 let HH=updateHistory([],[{...m,ab:{h:[],a:[],nh:3,na:1}}],t0);HH=updateHistory(HH,[{...m}],t0+36e5);assert.deepEqual(HH[0].ab,[3,1]);
 console.log("absen + gabungan + risiko ok: bobot BSD terbaik",ev.mix.w)}

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
// V14.1: Highlightly — liga Indonesia + 2 liga tambahan (Denmark, Algeria), prioritas kuota, musim lintas tahun
sc("Highlightly: liga tambahan ikut tampil, Indonesia diprioritaskan, musim tahun lalu dipakai bila tahun ini kosong",async()=>{
  const hits=[],now=Date.now(),iso=h=>new Date(now+h*36e5).toISOString(),yr=new Date(now).getUTCFullYear();
  const mk=(lid,n)=>[0,1,2,3].map(i=>({id:lid*10+i,date:iso(i<2?-30-i:3+i),round:"R1",state:{description:i<2?"Finished":"Not started",score:{current:i<2?"2 - 1":null}},
    homeTeam:{id:lid*100+i,name:n+" A"+i,logo:null},awayTeam:{id:lid*100+50+i,name:n+" B"+i,logo:null},league:{logo:null}}));
  const H=http.createServer((q,s)=>{const u=new URL(q.url,"http://x");hits.push(u.pathname+u.search);const send=o=>{s.writeHead(200,{"content-type":"application/json","x-ratelimit-requests-remaining":"60"});s.end(JSON.stringify(o))};
    if(u.pathname==="/football/matches"){const lid=+u.searchParams.get("leagueId"),se=+u.searchParams.get("season");
      if(lid===159070&&se===yr)return send({data:[],pagination:{totalCount:0}});               // Algeria: musim tahun ini kosong -> tahun lalu
      return send({data:mk(lid,{233958:"Persib",234809:"PSS",102904:"Kolding",159070:"Setif",252680:"Buriram",777:"JDT"}[lid]),pagination:{totalCount:4}})}
    if(u.pathname==="/football/leagues")return send({data:[{id:776,name:"Malaysia Super League Women"},{id:777,name:"Super League"},{id:778,name:"Malaysia Cup"}]});   // V27: cari id Malaysia
    if(u.pathname==="/football/standings")return send({groups:[{name:"G",standings:[{position:1,team:{id:1,name:"X"},total:{games:1,wins:1,draws:0,loses:0,scoredGoals:2,receivedGoals:1},points:3}]}]});
    if(u.pathname.startsWith("/football/matches/"))return send([{id:+u.pathname.split("/").pop(),state:{description:"Not started"},predictions:{prematch:[{generatedAt:"2026-01-01",probabilities:{home:"50%",draw:"25%",away:"25%"}}]}}]);
    s.writeHead(404);s.end("{}")});
  await new Promise(r=>H.listen(0,"127.0.0.1",r));
  const run=(extraEnv,stateFile)=>new Promise(res=>{const out=mkdtempSync(join(tmpdir(),"hl-"));
    writeFileSync(out+"/all.json",JSON.stringify({matches:[],errors:[]}));writeFileSync(out+"/leagues.json",JSON.stringify({leagues:[{id:1,name:"Premier League"}]}));
    const sf=stateFile||join(out,"state.json");if(!stateFile)writeFileSync(sf,"{}");
    const p=spawn(process.execPath,[join(here,"highlightly.mjs")],{env:{PATH:process.env.PATH,OUT_DIR:out,HL_API:"http://127.0.0.1:"+H.address().port,HIGHLIGHTLY_KEY:"k",HL_STATE_FILE:sf,...extraEnv}});
    let e="";p.stderr.on("data",d=>e+=d);p.stdout.on("data",d=>e+=d);p.on("close",c=>res({c,e,out}))});
  try{
    const r=await run({});assert.equal(r.c,0,r.e);
    const all=JSON.parse(readFileSync(r.out+"/all.json","utf8")),L=new Set(all.matches.map(m=>m.league));
    for(const n of ["Liga 1 Indonesia","Liga 2 Indonesia","1st Division Denmark","Ligue 1 Algeria","Thai League 1","Malaysia Super League"])assert(L.has(n),"liga hilang: "+n+" "+[...L]);
    assert.equal(hits.filter(h=>h.startsWith("/football/leagues")).length,1,"id Malaysia dicari sekali");assert(hits.some(h=>h.includes("leagueId=777")),"id Malaysia terpakai");
    const li=JSON.parse(readFileSync(r.out+"/leagues.json","utf8")).leagues;
    assert.deepEqual(li.slice(0,6).map(l=>l.country),["Indonesia","Indonesia","Denmark","Algeria","Thailand","Malaysia"]);assert.equal(li[6].name,"Premier League");
    const dk=JSON.parse(readFileSync(r.out+"/lg/hl102904.json","utf8"));assert.equal(dk.country,"Denmark");assert(dk.standings.length===1);
    const dz=JSON.parse(readFileSync(r.out+"/lg/hl159070.json","utf8"));assert.equal(dz.season.name,String(yr-1),"Algeria pakai musim tahun lalu");
    assert(hits.some(h=>h.includes("standings?leagueId=159070&season="+(yr-1))),"klasemen Algeria memakai musim tahun lalu");
    assert(all.matches.some(m=>m.league==="1st Division Denmark"&&m.p&&m.p.engine==="hl"),"prediksi Highlightly untuk liga tambahan");
    // detail: Indonesia lebih dulu
    const det=hits.filter(h=>/^\/football\/matches\/\d+/.test(h)).map(h=>+h.split("/")[3].split("?")[0]);
    const ext=id=>!/^2(33958|34809)/.test(String(id)),firstX=det.findIndex(ext);assert(firstX<0||det.slice(firstX).every(ext),"detail Indonesia lebih dulu: "+det);
    // kuota sudah dipakai banyak hari ini -> liga tambahan dilewati, Indonesia tetap jalan, laga tambahan lama tetap tampil
    const st=JSON.parse(readFileSync(join(r.out,"hl.json"),"utf8"));const day=st.calls.day;
    st.calls={day,n:70,v:2};st.season={};st.stand={};hits.length=0;writeFileSync(join(r.out,"state2.json"),JSON.stringify(st));
    const r2=await run({},join(r.out,"state2.json"));assert.equal(r2.c,0,r2.e);
    assert(hits.some(h=>h.includes("leagueId=233958")),"Indonesia tetap disegarkan");assert(!hits.some(h=>/leagueId=(102904|159070)/.test(h)),"liga tambahan dilewati: "+hits.join(" "));
    const a2=JSON.parse(readFileSync(r2.out+"/all.json","utf8"));assert(a2.matches.some(m=>m.league==="1st Division Denmark"),"laga tambahan dari catatan lama tetap tampil");
    assert(!(a2.errors||[]).some(e=>/tambahan/.test(e)),"melewati liga tambahan bukan galat");
    // V19.1: hitungan hari mengikuti 00.00 UTC; catatan hari lain (mis. tanggal WITA lama) direset
    {const st3=JSON.parse(readFileSync(join(r.out,"hl.json"),"utf8"));assert.equal(st3.calls.day,new Date().toISOString().slice(0,10),"hari kuota = tanggal UTC");
     st3.calls={day:"2000-01-01",n:90};st3.season={};st3.stand={};writeFileSync(join(r.out,"state3.json"),JSON.stringify(st3));hits.length=0;
     const r3=await run({},join(r.out,"state3.json"));assert.equal(r3.c,0,r3.e);assert(hits.some(h=>h.includes("leagueId=233958")),"hitungan hari lain tidak memblokir")}
    // V22d: laga Indonesia sedang berjalan -> skor dari "hari ini" (tanggal WITA laga), TANPA detail tiap 40 menit; klasemen tidak diambil ulang tanpa laga baru selesai
    {const st4=JSON.parse(readFileSync(join(r.out,"hl.json"),"utf8"));const ts=Date.now();for(const k of Object.keys(st4.season))st4.season[k].at=ts;for(const k of Object.keys(st4.stand))st4.stand[k]=ts;st4.today={};st4.calls.n=0;
     const kick=ts-30*6e4,lv={id:999001,date:new Date(kick).toISOString(),round:"R1",state:{description:"First half",score:{current:"1 - 0"}},homeTeam:{id:1,name:"Live A",logo:null},awayTeam:{id:2,name:"Live B",logo:null},league:{logo:null}};
     st4.matches["233958"].push(lv);writeFileSync(join(r.out,"state4.json"),JSON.stringify(st4));hits.length=0;
     const r4=await run({},join(r.out,"state4.json"));assert.equal(r4.c,0,r4.e);
     const wd=new Date(kick+8*36e5).toISOString().slice(0,10);
     assert(hits.some(h=>h.startsWith("/football/matches?leagueId=233958&date="+wd)),"skor live dari daftar hari ini (tanggal WITA): "+hits.join(" "));
     assert(!hits.some(h=>h.startsWith("/football/matches/999001")),"tidak ada detail selama live");assert(!hits.some(h=>h.startsWith("/football/standings")),"klasemen tidak diambil ulang: "+hits.join(" "));
     assert(!hits.some(h=>h.includes("leagueId=234809&date=")),"liga tanpa laga berjalan tidak ikut diambil")}
    return all.matches.length+" laga, "+hits.length+" permintaan saat kuota dihemat";
  }finally{H.close()}
});
// V15: Model BL ujung ke ujung — setahun laga simulasi lewat server BSD tiruan: unduh riwayat (bertahap), latih, uji mundur,
// pilih bobot gabungan, tempel ke laga, catat line-up resmi, dan koreksi pemain inti absen.
sc("Model BL: riwayat setahun, uji mundur vs BSD, bobot gabungan, koreksi pemain inti",async()=>{
  let seed=11;const rnd=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648};
  const gs=()=>{let u=0;while(!u)u=rnd();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rnd())};
  const pz=l=>{let L=Math.exp(-l),k=0,q=1;do{k++;q*=rnd()}while(q>L);return k-1};
  const NOW=Date.parse("2026-11-20T02:00:00Z"),DAYm=864e5,T=[];for(const l of [1,2])for(let i=0;i<14;i++)T.push({id:l*1000+i,l,a:gs()*.3,d:gs()*.3});
  const E=[],P=[];let id=1;const PO=l=>{const a=[Math.exp(-l)];for(let i=1;i<=10;i++)a.push(a[i-1]*l/i);return a};
  for(let d=380;d>-3;d-=3.5)for(const l of [1,2]){const X=T.filter(t=>t.l===l).sort(()=>rnd()-.5);for(let i=0;i<X.length;i+=2){const h=X[i],a=X[i+1],t=NOW-d*DAYm+rnd()*36e5*6;
    const lh=Math.exp(.15+.25+h.a-a.d),la=Math.exp(.15+a.a-h.d),fin=t<NOW-3*36e5;const e={id:id++,league_id:l,league_name:"L"+l,season_id:1,home_team_id:h.id,home_team:"T"+h.id,away_team_id:a.id,away_team:"T"+a.id,
      event_date:new Date(t).toISOString(),status:fin?"finished":"notstarted",home_score:fin?pz(lh):null,away_score:fin?pz(la):null,is_neutral_ground:false,has_xg:id%7!==1};E.push(e);
    const ph=PO(lh),pa=PO(la),q=[0,0,0];for(let x=0;x<=10;x++)for(let y=0;y<=10;y++)q[x>y?0:x===y?1:2]+=ph[x]*pa[y];const nz=q.map(v=>Math.max(.01,v*Math.exp(gs()*.35))),s=nz[0]+nz[1]+nz[2];
    P.push({event:{id:e.id},markets:{match_result:{prob_home:nz[0]/s*100,prob_draw:nz[1]/s*100,prob_away:nz[2]/s*100,predicted:nz[0]>=nz[2]?"H":"A"},over_under:{prob_over_25:50},btts:{prob_yes:50}}})}}
  const up=E.filter(e=>e.status==="notstarted");const U=up[0];
  const hits=[],base=()=>"http://127.0.0.1:"+H.address().port+"/api/v2";
  const H=http.createServer((q,r)=>{const u=new URL(q.url,"http://x"),send=o=>{r.writeHead(200,{"content-type":"application/json"});r.end(JSON.stringify(o))};hits.push(u.pathname+u.search);
    const f=u.searchParams.get("date_from"),t=u.searchParams.get("date_to"),inR=e=>{const d=new Date(Date.parse(e.event_date)+8*36e5).toISOString().slice(0,10);return(!f||d>=f)&&(!t||d<=t)};
    const pg=(L,path)=>{const off=+(u.searchParams.get("offset")||0),lim=+(u.searchParams.get("limit")||200),sl=L.slice(off,off+lim);const nx=off+lim<L.length?base()+path+"?"+(()=>{const s2=new URLSearchParams(u.search);s2.set("offset",off+lim);return s2})():null;return send({count:L.length,next:nx,results:sl})};
    if(u.pathname==="/api/v2/events/"){let L=E.filter(inR);if(u.searchParams.get("status")==="finished")L=L.filter(e=>e.status==="finished");return pg(L,"/events/")}
    if(u.pathname==="/api/v2/predictions/")return pg(P.filter(p=>inR(E[p.event.id-1])),"/predictions/");
    if(u.pathname==="/api/v2/leagues/")return send({count:2,next:null,results:[{id:1,name:"L1",country:{name:"A"}},{id:2,name:"L2",country:{name:"B"}}]});
    let mm;if((mm=u.pathname.match(/^\/api\/v2\/events\/(\d+)\/lineups\/$/))){const e=E[+mm[1]-1],xi=tid=>({team_id:tid,players:Array.from({length:11},(_,k)=>({id:tid*100+k})),substitutes:[]});
      if(e.status==="finished")return send({event_id:e.id,lineup_status:"confirmed",lineups:{home:xi(e.home_team_id),away:xi(e.away_team_id)},unavailable_players:{home:[],away:[]}});
      return send({event_id:e.id,lineup_status:"predicted",lineups:{home:xi(e.home_team_id),away:xi(e.away_team_id)},unavailable_players:{home:e.id===U.id?[0,1,2].map(k=>({id:e.home_team_id*100+k,short_name:"P"+k,status:"injured"})):[],away:[]}})}
    if((mm=u.pathname.match(/^\/api\/v2\/events\/(\d+)\/player-stats\/$/))){const e=E[+mm[1]-1];if(e.status!=="finished")return send({event_id:e.id,count:0,player_stats:[]});
      const pr=tid=>Array.from({length:14},(_,k)=>({player_id:tid*100+k,team_id:tid,minutes_played:k<11?90:k===11?20:0,rating:k<12?6.5+(k%3)*.4:null,goals:k===9&&e.id%3===0?1:0,goal_assist:0,expected_goals:k>=8&&k<11?.3:0,expected_assists:.1,key_pass:1,big_chance_created:0,goals_prevented:k===0?.2:null,saves:k===0?3:0}));
      return send({event_id:e.id,count:28,player_stats:pr(e.home_team_id).concat(pr(e.away_team_id))})}
    if((mm=u.pathname.match(/^\/api\/v2\/players\/(\d+)\/$/))){const pid=+mm[1];return send({id:pid,short_name:"P"+pid,position:pid%100===0?"G":pid%100<5?"D":pid%100<8?"M":"F",market_value_eur:(pid%100<11?1e6:2e5)*(1+(Math.floor(pid/100)%5))})}
    if((mm=u.pathname.match(/^\/api\/v2\/events\/(\d+)\/stats\/$/))){const e=E[+mm[1]-1];if(e.status!=="finished"||e.id%7===0)return send({event_id:e.id,stats:null});
      return send({event_id:e.id,xg_estimated:false,stats:{home:{expected_goals:Math.round((e.home_score*.6+1.4*.4+gs()*.2)*100)/100},away:{expected_goals:Math.round((e.away_score*.6+1.1*.4+gs()*.2)*100)/100}}})}
    if(/^\/api\/v2\/events\/\d+\/\w/.test(u.pathname)||/^\/api\/v2\/(teams|leagues)\//.test(u.pathname)||u.pathname.startsWith("/api/v2/odds/"))return send({});
    r.writeHead(404);r.end("{}")});
  await new Promise(z=>H.listen(0,"127.0.0.1",z));
  const st=mkdtempSync(join(tmpdir(),"bls-"));
  const go=(x={})=>new Promise(res=>{const out=mkdtempSync(join(tmpdir(),"bl-"));const p=spawn(process.execPath,[join(here,"bsd.mjs")],{env:{PATH:process.env.PATH,OUT_DIR:out,BSD_API:base(),BSD_API_KEY:"k",BSD_DEEP:"1",GAP_MS:"0",RETRY_MS:"0",
    BSD_NOW:new Date(NOW).toISOString(),BL_STATE_DIR:st,BSD_HISTORY_FILE:join(st,"bsd-history.json"),BL_BACKFILL_WEEKS:"30",BSD_PIN:"0",BSD_CONCURRENCY:"4",...x}});let e="";p.stderr.on("data",d=>e+=d);p.stdout.on("data",d=>e+=d);p.on("close",c=>res({c,e,out}))});
  const cp=(o,f)=>{try{writeFileSync(join(st,f),readFileSync(join(o,f)))}catch(e){}};
  try{
    // run 1: riwayat baru sebagian (90 hari + 30 minggu) -> model ditandai "partial"
    const r1=await go();assert.equal(r1.c,0,r1.e);for(const f of ["results.json","starters.json","model-bl.json","bsd-backtest.json","bsd-history.json","xg.json","players.json","values.json","teams.json","xi.json"])cp(r1.out,f);
    const res1=JSON.parse(readFileSync(join(st,"results.json"),"utf8"));assert(res1.rows.length>900,"riwayat: "+res1.rows.length);
    const m1=JSON.parse(readFileSync(join(r1.out,"model-bl.json"),"utf8"));assert.equal(m1.partial,true);
    // run 2: lanjut isi mundur sampai setahun -> model lengkap
    {const f=join(st,"results.json"),J=JSON.parse(readFileSync(f,"utf8"));J.rows=J.rows.map(r=>r.slice(0,8));writeFileSync(f,JSON.stringify(J))}   // seperti cache lama di situs: tanpa tanda has_xg
    const r2=await go({BL_XR_HIST:"1"});assert.equal(r2.c,0,r2.e);   // V22c: cara lama (line-up historis) dinyalakan untuk menguji mekanismenya
    {const A=JSON.parse(readFileSync(join(r2.out,"all.json"),"utf8")).bsd,Rw=JSON.parse(readFileSync(join(st,"results.json"),"utf8")).rows,old=Rw.filter(r=>r[1]*1000<NOW-100*DAYm);
     assert(A.xgScan>0,"pindai ulang tanda xG untuk baris lama");assert(old.some(r=>r[8]!=null),"baris lama mendapat tanda");
     // V23a: line-up resmi + statistik per laga terkumpul untuk laga lama (data internal, tidak tayang)
     const X2=JSON.parse(readFileSync(join(st,"xi2.json"),"utf8")),E2=Object.values(X2.e),full=E2.filter(e=>Array.isArray(e.s)&&Array.isArray(e.r));
     assert(full.length>=50,"xi2 terkumpul: "+full.length+" / "+E2.length+" "+JSON.stringify({xi2:A.xi2,N:A.xi2N}));assert.equal(A.xi2N,full.length);
     const e0=full[0];assert(e0.s[0].length===11&&e0.s[1].length===11&&e0.r.length>=20&&e0.r[0].length===11&&e0.h!=null&&e0.a!=null&&e0.t>0,JSON.stringify(e0).slice(0,200));
     assert(!existsSync(join(r2.out,"xi2.json")),"xi2 tidak ikut tayang");assert(E2.every(e=>e.t*1000>NOW-165*DAYm),"hanya jendela 160 hari")}
    const res2=JSON.parse(readFileSync(join(st,"results.json"),"utf8")),M=JSON.parse(readFileSync(join(r2.out,"model-bl.json"),"utf8"));
    assert(res2.rows.length>res1.rows.length,"isi mundur berlanjut");
    const X=JSON.parse(readFileSync(join(st,"xg.json"),"utf8")).e,xv=Object.values(X);assert(xv.filter(v=>v&&v.length).length>=300,"xG terisi bertahap: "+xv.length);
    assert(xv.every(v=>v===0||(Array.isArray(v)&&v.length===3)),"tiap laga yang sudah dicek tercatat (xG atau 0)");assert(M.xgCov>=20,"cakupan xG "+M.xgCov);
    // laga bertanda punya xG didahulukan: selama masih ada yang bertanda 1 dan belum diambil, laga bertanda 0 belum diminta
    const XJ=JSON.parse(readFileSync(join(st,"xg.json"),"utf8")),RW=JSON.parse(readFileSync(join(st,"results.json"),"utf8")).rows;assert.equal(XJ.v,2);
    const pend1=RW.filter(r=>r[8]===1&&XJ.e[r[0]]==null).length,got0=RW.filter(r=>r[8]===0&&XJ.e[r[0]]!=null).length;
    assert(pend1===0||got0===0,"bertanda punya xG didahulukan: sisa "+pend1+", bertanda tidak sudah diambil "+got0);assert.equal(M.partial,false,"span "+M.span);
    assert(M.bt&&M.bt.joined>=150,"uji mundur tergabung dengan BSD: "+(M.bt&&M.bt.joined));
    assert(M.bt.modelJ.ll<1.1&&M.bt.bsd.ll<1.1,"log loss wajar");assert(M.hfa>.1&&M.hfa<.45,"keunggulan kandang "+M.hfa);
    assert(M.bt.holdout&&M.bt.holdout.blend.ll<=M.bt.holdout.bsd.ll+.01,"gabungan tidak lebih buruk dari BSD");
    const all=JSON.parse(readFileSync(join(r2.out,"all.json"),"utf8")),mU=all.matches.find(x=>x.eid===U.id);
    assert(mU&&mU.bl&&Math.abs(mU.bl.h+mU.bl.d+mU.bl.a-100)<.5,"prediksi Model BL di laga");
    // V20: koreksi klasemen & pelatih baru diuji mundur (on/off) dan tercatat; tebakan skor di catatan kartu dari Model BL
    assert(M.v20&&typeof M.v20.on==="boolean"&&M.v20.llOff!=null,"uji on/off V20: "+JSON.stringify(M.v20));assert("tb" in M.cov&&"nc" in M.cov&&(M.v20.on?M.cov.nTb>0:M.cov.tb===0),"kovariat klasemen tercatat: "+JSON.stringify(M.cov)+JSON.stringify(M.v20));
    // V22: akurasi per liga (BSD vs Model BL) & rekap harian
    assert(M.blLg&&Object.values(M.blLg).every(v=>v.length===3&&v[0]>=20),"akurasi per liga: "+JSON.stringify(M.blLg).slice(0,200));
    {const EVj=JSON.parse(readFileSync(join(r2.out,"bsd-eval.json"),"utf8"));assert(EVj.rk&&Array.isArray(EVj.rk.days),"rekap harian di bsd-eval.json")}
    // V21: lapisan koreksi terlatih & teruji, peluang koreksi + label + alasan di laga, tercatat di riwayat
    assert(M.stk&&M.stk.n>=300&&typeof M.stk.on==="boolean"&&M.stk.m&&M.stk.lab,"lapisan koreksi: "+JSON.stringify(M.stk&&{n:M.stk.n,on:M.stk.on,why:M.stk.why}));
    assert(M.stk.test.stack&&M.stk.test.bsd&&M.stk.mk&&M.stk.mk.on===false,"uji koreksi tercatat; odds pasar belum aktif (data riwayat belum cukup)");
    assert(mU.sk&&Math.abs(mU.sk.h+mU.sk.d+mU.sk.a-100)<.5&&(mU.sk.u===1)===M.stk.on,"peluang koreksi di laga: "+JSON.stringify(mU.sk));
    assert(mU.cf&&["jelas","cukup","terbuka"].includes(mU.cf.k),"label keyakinan");assert(Array.isArray(mU.why),"alasan");
    {const H2=JSON.parse(readFileSync(join(st,"bsd-history.json"),"utf8"));const e=H2.find(x=>x.id===U.id);assert(e&&e.sk&&e.sk.length===3,"peluang koreksi tercatat sebelum kickoff")}
    if(mU.note&&/Skor paling mungkin/.test(mU.note))assert(/Skor paling mungkin \d+-\d+ \(Model BL\)/.test(mU.note),"skor dari Model BL: "+mU.note);
    const S=JSON.parse(readFileSync(join(st,"starters.json"),"utf8"));assert((S.t[U.home_team_id]||[]).length>=3,"line-up resmi tercatat");
    assert.equal(mU.bl.k[0],3,"3 pemain inti tuan rumah absen: "+JSON.stringify(mU.bl));assert.equal(mU.bl.k[1],0);
    const q=M.pred[U.id];assert(mU.bl.xg[0]<q.x[0]&&mU.bl.xg[1]>q.x[1],"koreksi menurunkan serangan tuan rumah");
    if(M.useful)assert(mU.bg&&Math.abs(mU.bg.h+mU.bg.d+mU.bg.a-100)<.5);else assert(!mU.bg);
    // Tahap 1: data pemain, nilai pasar, ringkasan tim, uji klasemen
    const PJ=JSON.parse(readFileSync(join(st,"players.json"),"utf8")).t,VJ=JSON.parse(readFileSync(join(st,"values.json"),"utf8")).p;
    assert(PJ[U.home_team_id]&&PJ[U.home_team_id].ev.length>=3,"statistik pemain tim yang akan main terkumpul");
    const vv=Object.values(VJ).filter(v=>v[0]!=null);assert(vv.length>=50,"nilai pasar terkumpul: "+vv.length);assert(vv.some(v=>v[1]==="G"));
    const TJ=JSON.parse(readFileSync(join(r2.out,"teams.json"),"utf8")).t,tu=TJ[U.home_team_id];assert(tu&&tu.sr>=1&&tu.sr<=14,"peringkat kekuatan");
    assert(tu.luck&&tu.luck.n>0,"keberuntungan musim ini");assert(tu.ps&&tu.ps.key.length===5&&tu.ps.key[0][1],"pemain kunci + nama");
    assert(M.bt&&M.tbl&&M.tbl.g5&&M.tbl.g5.semua.n>0,"uji klasemen menipu berjalan: "+JSON.stringify(M.tbl&&M.tbl.g5));
    assert(M.fac&&M.fac.cov&&M.fac.formPanas&&M.fac.formPanas.n>0,"uji faktor tambahan berjalan: "+JSON.stringify(M.fac&&Object.keys(M.fac)));
    const XJ2=JSON.parse(readFileSync(join(st,"xi.json"),"utf8")).e;assert(Object.keys(XJ2).length>=100,"kekuatan line-up per laga tercatat: "+Object.keys(XJ2).length);
    assert(M.cov&&M.cov.nXr>0&&Number.isFinite(M.cov.gA),"model mengukur efek line-up: "+JSON.stringify(M.cov));
    assert(mU.bl.lu&&mU.bl.lu[1]<.98,"3 pemain belakang absen: lini bertahan tuan rumah turun "+JSON.stringify(mU.bl.lu));
    const h2=JSON.parse(readFileSync(join(st,"bsd-history.json"),"utf8")).find(e=>e.id===U.id);assert(h2&&h2.bl,"riwayat menyimpan prediksi Model BL");
    // run 3 (ringan): model dibawa, tidak dilatih ulang, prediksi tetap menempel
    for(const f of ["results.json","starters.json","model-bl.json","bsd-backtest.json","bsd-history.json","xg.json","players.json","values.json","teams.json","xi.json"])cp(r2.out,f);hits.length=0;
    const r3=await new Promise(res=>{const out=mkdtempSync(join(tmpdir(),"bl-"));const p=spawn(process.execPath,[join(here,"bsd.mjs")],{env:{PATH:process.env.PATH,OUT_DIR:out,BSD_API:base(),BSD_API_KEY:"k",BSD_DEEP:"1",BSD_MODE:"light",GAP_MS:"0",RETRY_MS:"0",BSD_NOW:new Date(NOW+36e5).toISOString(),BL_STATE_DIR:st,BSD_HISTORY_FILE:join(st,"bsd-history.json"),PREV_DIR:r2.out}});let e="";p.stderr.on("data",d=>e+=d);p.stdout.on("data",d=>e+=d);p.on("close",c=>res({c,e,out}))});
    assert.equal(r3.c,0,r3.e);assert(!hits.some(h=>/status=finished|\/stats\/|player-stats|\/players\//.test(h)),"run ringan tidak mengunduh riwayat / xG / data pemain");
    assert(existsSync(join(r3.out,"teams.json")),"file turunan tetap tayang");
    {const {readdirSync}=await import("node:fs");const m2=readdirSync(join(r2.out,"m")).length,m3=existsSync(join(r3.out,"m"))?readdirSync(join(r3.out,"m")).length:0;
     assert(m2>1&&m3>=m2-1,"Match Center dibawa dari salinan run sebelumnya tanpa unduh ulang: "+m2+" -> "+m3)}
    for(const f of ["results.json","xg.json","players.json","values.json","xi.json","starters.json","bsd-history.json","pin.json"]){assert(!existsSync(join(r3.out,f)),"data internal tidak tayang: "+f);assert(f==="pin.json"||existsSync(join(st,f)),"data internal tersimpan: "+f)}
    const a3=JSON.parse(readFileSync(join(r3.out,"all.json"),"utf8"));assert(a3.matches.find(x=>x.eid===U.id).bl,"prediksi dibawa di run ringan");
    const M3=JSON.parse(readFileSync(join(r3.out,"model-bl.json"),"utf8"));assert.equal(M3.updated,M.updated,"run ringan tidak melatih ulang");assert(M.temp>=.8&&M.temp<=1.4,"suhu kalibrasi "+M.temp);
    // V22c: bawaan = line-up historis TIDAK dipakai melatih (bocor); koreksi pemain absen tetap jalan lewat hitungan pemain inti
    {const {unlinkSync}=await import("node:fs");try{unlinkSync(join(st,"model-bl.json"))}catch(e){}
     const r4=await go();assert.equal(r4.c,0,r4.e);const M4=JSON.parse(readFileSync(join(r4.out,"model-bl.json"),"utf8")),u4=JSON.parse(readFileSync(join(r4.out,"all.json"),"utf8")).matches.find(x=>x.eid===U.id);
     assert.equal(M4.xrHist,0);assert.equal(M.xrHist,1);assert.equal(M4.cov.nXr,0,"tanpa line-up historis: "+JSON.stringify(M4.cov));assert.equal(M4.cov.gA,0);assert.equal(M4.cov.gD,0);
     assert(u4&&u4.bl&&u4.bl.ux===0,"koreksi line-up berbobot tidak dipakai: "+JSON.stringify(u4&&u4.bl));assert.equal(u4.bl.k[0],3,"3 pemain inti absen tetap terhitung");
     assert(u4.bl.xg[0]<M4.pred[U.id].x[0],"serangan tuan rumah tetap dikoreksi turun (cara pemain inti)");assert(M4.stk&&M4.bt&&M4.bt.joined>=150,"latihan & uji mundur tetap jalan");
     assert(M4.dis&&M4.dis.of===M4.bt.joined&&M4.dis.n>0&&M4.dis.bsd+M4.dis.bl+M4.dis.none===M4.dis.n,"statistik beda arah: "+JSON.stringify(M4.dis))}
    // V22b: pengisian xG berhenti lebih awal bila waktu run menipis (latihan model tidak boleh terpotong)
    {const {unlinkSync}=await import("node:fs");try{unlinkSync(join(st,"model-bl.json"))}catch(e){}
     const xs=JSON.parse(readFileSync(join(st,"xg.json"),"utf8"));let k=0;for(const id of Object.keys(xs.e)){if(k++>=40)break;delete xs.e[id]}writeFileSync(join(st,"xg.json"),JSON.stringify(xs));
     const r5=await go({MAX_RUN_MS:"200000"});assert.equal(r5.c,0,r5.e);const a5=JSON.parse(readFileSync(join(r5.out,"all.json"),"utf8")).bsd;
     assert(a5.xgCut>=1&&!a5.xg,"xG dilewati karena waktu: "+JSON.stringify({cut:a5.xgCut,xg:a5.xg}));
     const M5=JSON.parse(readFileSync(join(r5.out,"model-bl.json"),"utf8"));assert(M5.bt&&M5.bt.joined>=150,"model tetap dilatih")}
    return `${res2.rows.length} laga, xG ${M.xgCov}%, cfg ${JSON.stringify(M.cfg.xga)}, uji mundur ${M.bt.joined} laga: model ll ${M.bt.modelJ.ll.toFixed(3)} vs BSD ${M.bt.bsd.ll.toFixed(3)}, bobot BSD ${M.w}, berguna ${M.useful}`;
  }finally{H.close()}
});
// V16 (Tahap 1): ringkasan statistik pemain, klasemen saat kickoff, uji klasemen menipu
sc("Tahap 1: data pemain, klasemen saat kickoff, uji klasemen menipu",async()=>{
  const {ingest,compact,teamSummary,valueOf,C}=await import("./players.mjs"),{tablesAt,tableTest,seasonKeys}=await import("./model.mjs");
  const P={t:{}},row=(pid,team,min,rt,g=0,a=0)=>({player_id:pid,team_id:team,minutes_played:min,rating:rt,goals:g,goal_assist:a,expected_goals:null,expected_assists:null,key_pass:1,big_chance_created:0,goals_prevented:null,saves:0});
  const D=864e5,t0=Date.parse("2026-10-01T12:00:00Z");
  // tim 1: pemain 10 main penuh tiap laga, pemain 11 hanya 2 laga terakhir, pemain 12 cadangan tak dipakai (0 menit)
  for(let k=0;k<5;k++)ingest(P,100+k,t0+k*7*D,[row(10,1,90,7.5,k%2),row(11,1,k>=3?90:0,6.5),row(12,1,0,null),row(20,2,90,6.8)]);
  assert.equal(ingest(P,104,t0+4*7*D,[row(10,1,90,7.5)]),0,"laga yang sama tidak dihitung dua kali");
  const T=P.t[1];assert.equal(T.ev.length,5);assert(!T.p[12],"pemain 0 menit tidak dicatat");
  assert(Math.abs(T.p[10][C.min]/T.mt-1)<1e-9,"porsi menit pemain inti = 100%");assert(T.p[11][C.min]/T.mt<.5&&T.p[11][C.min]/T.mt>.3,"pemain baru: porsi naik dari laga terbaru");
  // laga lama yang baru diambil belakangan diberi bobot kecil, bobot laga terbaru tidak turun
  const before=T.mt;ingest(P,99,t0-7*D,[row(10,1,90,7.5)]);assert(T.mt>before&&T.mt-before<90*.6,"laga lama berbobot kecil");
  const S=teamSummary(T,{10:[2e6,"F",0,"A. Star"],11:[5e5,"M",0,"B. Muda"]});assert.equal(S.players[0].pid,10);assert.equal(S.players[0].nm,"A. Star");assert(S.squad===25e5,"nilai skuad pemain reguler");
  assert(Math.abs(S.avgRt-((7.5*1+6.5*(T.p[11][C.min]/T.mt))/(1+T.p[11][C.min]/T.mt)))<1e-6);
  compact(P,t0+30*D);assert(P.t[1]);compact(P,t0+400*D);assert(!P.t[1],"tim lama dibuang");
  assert.deepEqual(valueOf({id:5,market_value_eur:640000,position:"F",short_name:"B. B"},1e12),[640000,"F",1e9,"B. B"]);assert.equal(valueOf(null,1),null);
  // klasemen: liga 4 tim, musim dipisah oleh libur panjang; peringkat dihitung SEBELUM laga
  const ms=[];let id=1;const add=(t,h,a,gh,ga,se)=>ms.push({id:id++,t,l:7,h,a,gh,ga,se});
  add(t0,1,2,3,0);add(t0,3,4,1,1);add(t0+7*D,1,3,2,0);add(t0+7*D,2,4,0,1);add(t0+14*D,4,1,0,0);
  add(t0+120*D,1,2,0,1);                                   // musim baru (libur > 40 hari) -> klasemen kosong lagi
  const tab=tablesAt(ms);assert.deepEqual(tab.get(1).h,[null,0,0],"laga pertama: belum ada klasemen");
  assert.deepEqual(tab.get(3).h,[1,1,3],"tim 1 memimpin setelah laga 1");assert.deepEqual(tab.get(5).a,[1,2,6],"tim 1: 2 laga, 6 poin, peringkat 1");
  assert.deepEqual(tab.get(6).h,[null,0,0],"musim baru mulai dari nol");const sk=seasonKeys(ms);assert.notEqual(sk.get(1),sk.get(6));
  // uji: klasemen unggulkan tuan rumah, kekuatan asli unggulkan tamu; tuan rumah jarang menang padahal BSD memberi 55%
  const rows=[],tb=new Map();for(let k=0;k<200;k++){rows.push({id:k,o:k%4===0?0:2,p:[30,25,45],b:[55,25,20],sr:[9,2,18]});tb.set(k,{h:[2,10,25],a:[12,10,10],n:18})}
  for(let k=200;k<300;k++){rows.push({id:k,o:0,p:[60,25,15],b:[60,25,15],sr:[1,10,18]});tb.set(k,{h:[1,10,25],a:[10,10,10],n:18})}
  const R=tableTest(rows,tb,{gap:5});assert.equal(R.beda.n,200);assert.equal(R.beda.win,25);assert(Math.abs(R.beda.bsd-55)<1e-9);assert(Math.abs(R.beda.gapBsd+30)<1e-9,"BSD terlalu tinggi 30 poin");
  assert.equal(R.sama.n,100);assert.equal(R.semua.n,300);
  const R2=tableTest(rows.map(r=>({...r})),new Map([...tb].map(([k,v])=>[k,{...v,h:[v.h[0],3,v.h[2]]}])),{gap:5,minN:6});assert.equal(R2.semua.n,0,"tim yang baru main < 6 laga tidak dihitung");
  // Tahap 2: mutu pemain + kekuatan line-up per unit
  {const {playerQuality,xiRatio,xiFromStats,UNIT}=await import("./players.mjs");const P2={t:{}},t1=Date.parse("2026-10-01T12:00:00Z");
   const pos=k=>k===0?"G":k<5?"D":k<8?"M":"F",V2={};for(let k=0;k<14;k++)V2[500+k]=[k===10?8e6:1e6,pos(k),0,"P"+k];
   for(let e=0;e<6;e++)ingest(P2,900+e,t1+e*7*D,Array.from({length:14},(_,k)=>row(500+k,5,k<11?90:k===11?20:0,k===10?8.2:6.8,k===10&&e%2?1:0)));
   const Q=playerQuality(P2.t[5],V2);assert(Q.get(510).q>Q.get(509).q+.2,"bintang (rating, gol, nilai pasar) lebih bernilai");assert.equal(Q.get(500).pos,"G");
   const full=xiRatio(Q,Array.from({length:11},(_,k)=>500+k));assert(Math.abs(full.r[0]-1)<.08&&Math.abs(full.r[1]-1)<.08,"susunan biasa ~100%: "+full.r);
   const noStar=xiRatio(Q,[500,501,502,503,504,505,506,507,508,509,599]);assert(noStar.r[0]<full.r[0]-.05,"tanpa bintang: lini serang turun");assert(Math.abs(noStar.r[1]-full.r[1])<.05,"lini bertahan hampir sama");
   assert.equal(noStar.miss[0][1],"P10","pemain kunci yang hilang tercatat");
   const noGk=xiRatio(Q,[599,501,502,503,504,505,506,507,508,509,510]);assert(noGk.r[1]<full.r[1]-.05,"tanpa kiper utama: lini bertahan turun");
   assert.deepEqual(xiFromStats([{player_id:1,minutes_played:90},{player_id:2,minutes_played:30},{player_id:3,minutes_played:60}]),[1,3]);}
  return "beda unggulan: menang "+R.beda.win+"% vs BSD "+R.beda.bsd+"%";
});
// V18 (Tahap 3): uji faktor tambahan dihitung hanya dari data sebelum laga
sc("Tahap 3: faktor form, H2H, derby, habis laga Eropa, perjalanan jauh, pelatih baru",async()=>{
  const {factorTests}=await import("./factors.mjs"),D=864e5,t0=Date.parse("2026-06-01T12:00:00Z"),ms=[],J=[];let id=1;
  const add=(t,l,h,a,gh,ga,x={})=>{const m={id:id++,t,l,h,a,gh,ga,hc:x.hc??null,ac:x.ac??null,tr:x.tr??null,dby:x.dby||0};ms.push(m);if(x.j)J.push({id:m.id,o:gh>ga?0:gh===ga?1:2,b:x.b||[45,27,28],p:x.p||[44,28,28]});return m};
  // tim 1 menang 5 laga beruntun -> laga ke-6 tercatat "form panas" untuk tim 1
  for(let k=0;k<5;k++)add(t0+k*7*D,1,1,10+k,2,0,{hc:100});
  add(t0+35*D,1,1,20,0,1,{hc:100,j:1});
  // tim 2 pelatih baru (200 -> 201) di laga ke-3 dan ke-4
  add(t0,1,2,30,1,1,{hc:200});add(t0+7*D,1,2,31,1,1,{hc:200});add(t0+14*D,1,2,32,3,0,{hc:201,j:1});add(t0+21*D,1,2,33,0,0,{hc:201,j:1});
  // tim 3 main di Eropa (liga 99) lalu 3 hari kemudian di liga domestik
  add(t0,99,3,40,1,0);add(t0+3*D,1,3,41,0,2,{j:1});
  // H2H: tim 4 mengalahkan tim 5 dua kali, laga ketiga tercatat "H2H dominan"
  add(t0,1,4,5,2,0);add(t0+60*D,1,5,4,0,1);add(t0+120*D,1,4,5,1,1,{j:1});
  // derby dan tamu jauh
  add(t0+130*D,1,6,7,1,1,{dby:1,j:1,b:[40,30,30]});add(t0+131*D,1,8,9,2,1,{tr:2400,j:1});
  const F=factorTests(ms,J,new Set([99]));
  assert.equal(F.formPanas.n,1);assert.equal(F.formPanas.win,0);assert(Math.abs(F.formPanas.bsd-45)<1e-9);
  assert.equal(F.pelatihBaru.n,2,"2 laga pertama pelatih baru");assert.equal(F.pelatihBaru.win,50);
  assert.equal(F.habisEropa.n,1);assert.equal(F.habisEropa.win,0);
  assert.equal(F.h2hDominan.n,1);assert.equal(F.h2hDominan.win,0,"tim 4 tidak menang di pertemuan ketiga");
  assert.equal(F.derbySeri.n,1);assert.equal(F.derbySeri.win,100);assert(Math.abs(F.derbySeri.bsd-30)<1e-9);
  assert.equal(F.tamuJauh.n,1);assert.equal(F.tamuJauh.win,0);
  return Object.keys(F).join(", ");
});
sc("V19: ringkasan grid bookmaker & form tim",async()=>{
 const {trimCmp,slimForm}=await import("./bsd.mjs");
 const raw={bookmakers_count:24,main_lines:{asian_handicap:-0.75,over_under_25:2.5,total_corners:9.5},markets:{
  "1x2":{HOME:{outcome:"HOME",outcome_name:"FC A",bookmakers:{x:{decimal_odds:2.1,movement:"S",updated_at:"t"}}},DRAW:{outcome:"DRAW",bookmakers:{x:{decimal_odds:3.3}}},AWAY:{outcome:"AWAY",bookmakers:{x:{decimal_odds:3.6}}}},
  asian_handicap:{"HOME@-0.25":{outcome:"HOME",outcome_name:"FC A -0.25",line:-0.25,bookmakers:{x:{decimal_odds:1.5}}},"HOME@-0.75":{outcome:"HOME",outcome_name:"FC A -0.75",line:-0.75,bookmakers:{x:{decimal_odds:1.9}}},"AWAY@-0.75":{outcome:"AWAY",outcome_name:"FC B +0.75",line:-0.75,bookmakers:{x:{decimal_odds:1.95}}}},
  draw_no_bet:{HOME:{bookmakers:{x:{decimal_odds:1.4}}}}}};
 const c=trimCmp(raw);assert.deepEqual(Object.keys(c.markets),["1X2","Asian handicap"]);assert.deepEqual(c.markets["1X2"].x,{"Tuan rumah":2.1,"Seri":3.3,"Tamu":3.6});
 assert.deepEqual(c.markets["Asian handicap"].x,{"Tuan rumah -0.75":1.9,"Tamu +0.75":1.95},"hanya garis utama");
 assert.equal(trimCmp(null),null);assert.equal(trimCmp({markets:{}}),null);
 const f=slimForm({team_id:1,team_name:"A",overall:{matches:10,won:5,drawn:3,lost:2,goals_for:15,goals_against:9,form:"WWDLW",points_per_match:1.8,stats:{ball_possession:{average:55,total:550},expected_goals:{average:1.4},fouls:{average:12}}}});
 assert.equal(f.overall.won,5);assert.equal(f.overall.stats.ball_possession.average,55);assert.equal(f.overall.stats.fouls,undefined);assert.equal(slimForm({}),null);
 return Math.round(JSON.stringify(c).length/JSON.stringify(raw).length*100)+"% ukuran";
});
sc("V20: fitur klasemen & pelatih baru, efek pelatih baru terbaca model",async()=>{
 const {matchFeatures,fitModel,predictModel}=await import("./model.mjs");
 // fitur: klasemen baru dihitung setelah 6 laga; pelatih baru = 4 laga pertama; laga mendatang ikut
 const D=864e5,B=Date.parse("2026-01-01"),L=[];for(let i=0;i<10;i++)L.push({id:i,t:B+i*7*D,l:1,h:1,a:2,gh:2,ga:0,se:5,hc:i<7?100:200,ac:300});
 L.push({id:"u1",t:B+10*7*D,l:1,h:1,a:2,gh:null,ga:null,se:5,hc:200,ac:301});
 const F=matchFeatures(L);assert.equal(F.get(5).tb,null);assert.deepEqual(F.get(6).tb,[3,0]);
 assert.deepEqual([7,8,9].map(i=>F.get(i).nc[0]),[1,1,1]);assert.equal(F.get(6).nc[0],0);assert.equal(F.get("u1").nc[0],1,"laga ke-4 pelatih baru");assert.equal(F.get("u1").nc[1],1,"tamu ganti pelatih");
 // efek yang ditanam: tim berpelatih baru mencetak lebih sedikit gol -> koefisien nc negatif
 let sd=7;const rnd=()=>{sd=(sd*16807)%2147483647;return sd/2147483647},pois=l=>{let k=0,p=Math.exp(-l),c=p,u=rnd();while(u>c&&k<10){k++;p*=l/k;c+=p}return k};
 const ms=[];let id=0;for(let w=0;w<60;w++)for(let i=0;i<10;i++){const h=(i*2+w)%20,a=(i*2+1+w*3)%20;if(h===a)continue;const nh=rnd()<.15?1:0,na=rnd()<.15?1:0;
   ms.push({id:id++,t:B+w*5*D,l:1,h,a,gh:pois(1.5*Math.exp(-.4*nh+.4*na)),ga:pois(1.1*Math.exp(-.4*na+.4*nh)),n:0,nc:[nh,na],tb:null})}
 const M=fitModel(ms,B+61*5*D,{sweeps:30});assert(M.cov.nc<-.15,"efek pelatih baru terbaca: "+M.cov.nc);
 const p0=predictModel(M,{h:1,a:2,l:1,t:B+61*5*D}).p[0],p1=predictModel(M,{h:1,a:2,l:1,t:B+61*5*D,nc:[1,0]}).p[0];assert(p1<p0,"pelatih baru menurunkan peluang tuan rumah");
 const Moff=fitModel(ms,B+61*5*D,{sweeps:30,nc:0});assert.equal(Moff.cov.nc,0,"bisa dimatikan");
 return "nc "+M.cov.nc.toFixed(2)+", peluang tuan rumah "+p0.toFixed(1)+"% -> "+p1.toFixed(1)+"%";
});
sc("V21: lapisan koreksi BSD menemukan bias yang ditanam, label & odds pasar",async()=>{
 const {trainStack,applyStack,trainMarket,marketP,poolMarket,labelOf}=await import("./stack.mjs");const {whyOf}=await import("./bsd.mjs");
 let sd=11;const rnd=()=>{sd=(sd*16807)%2147483647;return sd/2147483647},sm=v=>{const m=Math.max(...v),e=v.map(x=>Math.exp(x-m)),t=e.reduce((a,b)=>a+b);return e.map(x=>x/t)};
 const R=[];for(let i=0;i<5000;i++){const g=(rnd()-.5)*2.4,l=i%8,tb=[1+rnd()*1.5,1+rnd()*1.5],nc=[rnd()<.1?1:0,rnd()<.1?1:0];
   const tru=sm([.25+g-.35*(nc[0]-nc[1]),.1,-g+.35*(nc[0]-nc[1])]);
   const bs=sm([(.25+g+.5*(tb[0]-tb[1]))*(l<2?1.8:1),.1,(-g-.5*(tb[0]-tb[1]))*(l<2?1.8:1)]),bl=sm([.25+g*.8,.1,-g*.8]);
   const u=rnd(),o=u<tru[0]?0:u<tru[0]+tru[1]?1:2;R.push({o,b:bs.map(x=>x*100),p:bl.map(x=>x*100),l,t:i,tb,nc,eu:[0,0]})}
 const T=trainStack(R);assert(T.on,"koreksi lolos uji: "+JSON.stringify(T.test));assert(T.test.stack.ll<T.test.bsd.ll-.01&&T.test.stack.ll<T.test.blend.ll);
 assert(T.m.th[0]<-.05,"bias klasemen BSD terbaca: "+T.m.th[0]);assert(T.m.th[1]<-.1,"efek pelatih baru terbaca: "+T.m.th[1]);
 assert(T.m.lg[0][0]<T.m.lg[5][0],"liga tempat BSD terlalu yakin diberi suhu lebih rendah");
 assert(T.lab.jelas.hit>T.lab.cukup.hit&&T.lab.cukup.hit>T.lab.terbuka.hit,"label berurutan: "+JSON.stringify(T.lab));
 const q=applyStack(T.m,R[0]);assert(Math.abs(q[0]+q[1]+q[2]-100)<1e-6);
 // BSD sudah tepat (hasil diundi dari peluang BSD sendiri): koreksi tidak lolos (tidak memaksa)
 const R0=R.map(r=>{const u=rnd(),b=r.b;return{...r,o:u<b[0]/100?0:u<(b[0]+b[1])/100?1:2}});const T0=trainStack(R0);assert.equal(T0.on,false,"BSD sudah tepat: tidak aktif "+JSON.stringify(T0.test));
 // odds pasar: aktif hanya bila menambah informasi
 const truM=R.slice(0,1200).map(r=>({o:r.o,t:r.t,q:r.b,m:r.p}));assert(trainMarket(truM).on,"pasar yang lebih tepat dari dasar: aktif");
 assert.equal(trainMarket(truM.slice(0,100)).on,false,"data pasar sedikit: belum aktif");
 const sameM=R0.slice(0,1200).map(r=>({o:r.o,t:r.t,q:r.b,m:r.p}));assert.equal(trainMarket(sameM).on,false,"pasar tidak menambah informasi: tidak aktif");
 assert.deepEqual(marketP([2,3.4,3.8]).map(Math.round),[47,28,25]);assert.equal(marketP([2,null,3]),null);
 assert.equal(labelOf([60,25,15],[58,25,17],[55,26,19]),"jelas");assert.equal(labelOf([60,25,15],[58,25,17],[30,26,44]),"terbuka");assert.equal(labelOf([48,27,25],[48,27,25],null),"cukup");
 const W=whyOf({home:{name:"A"},away:{name:"B"},p:{h:50,d:25,a:25}},{sr:[9,3,12],tr:[2,8,12],nc:[0,1],eu:[1,0]},[30,25,45]);
 assert(/Klasemen menipu: A peringkat 2 klasemen, tapi kekuatan aslinya #9/.test(W[0])&&W.length===3,"alasan: "+W.join(" | "));
 return "uji "+T.nTest+" laga: koreksi "+T.test.stack.ll.toFixed(3)+" vs BSD "+T.test.bsd.ll.toFixed(3)+" vs gabungan lama "+T.test.blend.ll.toFixed(3);
});
sc("V22: rekap harian per tanggal WITA, per liga, siapa yang benar",async()=>{
 const {recapOf}=await import("./bsd.mjs");const now=Date.parse("2026-11-21T03:00:00Z");
 const H=[{id:1,lg:"Eerste Divisie",u:"2026-11-20T19:00:00Z",h:"Heracles",a:"Jong PSV",p:[80,13,7],bl:[74,16,10],r:[2,1]},   // 21 Nov WITA
   {id:2,lg:"Eerste Divisie",u:"2026-11-20T19:00:00Z",h:"Volendam",a:"Jong Ajax",p:[49,22,29],bl:[72,16,12],sk:[60,20,20],r:[1,2]},
   {id:3,lg:"Ligue 2",u:"2026-11-20T14:00:00Z",h:"A",a:"B",p:[30,30,40],bl:[30,40,30],r:[0,0]},                                   // 20 Nov WITA 22.00
   {id:4,lg:"Ligue 2",u:"2026-11-22T14:00:00Z",h:"C",a:"D",p:[50,25,25],r:null}];
 const R=recapOf(H,now);assert.deepEqual(R.days.map(d=>d.d),["2026-11-21","2026-11-20"]);
 const d0=R.days[0];assert.deepEqual(d0.bsd,[2,1]);assert.deepEqual(d0.bl,[2,1]);assert.deepEqual(d0.sk,[1,0]);
 assert.deepEqual(d0.lg[0],["Eerste Divisie",2,1,2,1,1,0]);assert.deepEqual(d0.m[1],["Eerste Divisie","Volendam","Jong Ajax",1,2,0,0,0]);
 assert.deepEqual(R.days[1].bl,[1,1],"seri ditebak Model BL");assert.equal(recapOf(H,now,{days:1}).days.length,1);
 return d0.d+": BSD "+d0.bsd[1]+"/"+d0.bsd[0];
});
let bad=0;
for(const [n,f] of T){try{const m=await f();console.log("OK    "+n+(m?"  ["+m+"]":""))}catch(e){bad++;console.log("GAGAL "+n+"\n      "+String(e.message).split("\n").slice(0,4).join("\n      "))}}
srv.close();console.log(bad?`\n${bad} GAGAL`:"\ntest-bsd ok");process.exit(bad?1:0);
