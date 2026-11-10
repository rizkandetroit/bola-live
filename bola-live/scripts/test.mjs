import {readFileSync,rmSync,writeFileSync} from "node:fs";
import {fit,predictM,pcts,backtest,evaluate,formOf,shrink,calibrate,LEAGUES} from "./lib.mjs";
import assert from "node:assert";
process.env.WINDOW="week"; // tes jendela 7 hari tetap memakai mode pekan; jendela bulan diuji di bawah lewat monthWindow
// data tiruan: 6 tim, tim 1 terkuat, tim 6 terlemah, hasil deterministik
const t0=Date.now(),D=864e5,S={1:3,2:2.2,3:1.6,4:1.2,5:.9,6:.5};
let seed=11;const rnd=()=>(seed=seed*16807%2147483647)/2147483647;
const po=l=>{let k=0,e=Math.exp(-l),c=e;const u=rnd();while(u>c){k++;e*=l/k;c+=e}return k};
const fin=[];let t=t0-60*D,id=1000;
for(let r=0;r<8;r++)for(let h=1;h<=6;h++)for(let a=1;a<=6;a++)if(h!==a&&rnd()<.5){t+=.3*D;fin.push({id:id++,t,h,a,gh:po(1.4*S[h]/Math.sqrt(S[a])),ga:po(1.1*S[a]/Math.sqrt(S[h]))})}
fin.sort((x,y)=>x.t-y.t);
const m=fit(fin,t0),p1=predictM(m,1,6),p2=predictM(m,6,1),p3=predictM(m,2,3);
assert(Math.abs(p1.h+p1.d+p1.a-100)<.11&&Math.abs(p1.pe.h+p1.pe.d+p1.pe.a-100)<.11,"jumlah harus 100");
assert(p1.h>p1.a&&p2.a>p2.h,"tim kuat harus unggul");assert(p1.h>p2.a,"keuntungan kandang");
assert(p1.el[0]>p1.el[1]&&p1.pe.h>p1.pe.a,"Elo sejalan");
const pb=pcts(p1);assert(Math.abs(pb.pb[0]+pb.pb[1]+pb.pb[2]-100)<.31);
assert(p1.sc5.length===5&&p1.sc5[0][2]>=p1.sc5[4][2]&&p1.ou>0&&p1.ou<100&&p1.bt>0&&p1.bt<100&&p1.fr.length===3,"skor, over/under, btts");
const s0=shrink([70,20,10],[45,26,29],0),s1=shrink([70,20,10],[45,26,29],1);assert.deepEqual(s0,[70,20,10]);assert(Math.abs(s1[0]-45)<.11&&Math.abs(s1[0]+s1[1]+s1[2]-100)<.11,"shrink");
// tanpa mengintip: hasil laga ke-k tidak boleh memengaruhi prediksinya sendiri
const k=fin[40],mk=fit(fin,k.t);assert(mk.n===fin.filter(x=>x.t<k.t).length);
const f=formOf(m,1,"h");assert(f.l5.length===5&&f.t.n===10);
const rows=backtest(fin),cal=calibrate(rows),ev=evaluate(rows);
assert(cal.lam>=0&&cal.lam<=.5&&rows.every((r,i)=>r.pk&&Math.abs(r.pk[0]+r.pk[1]+r.pk[2]-100)<.11&&(i===0||rows[i-1].t<=r.t))&&ev.pk&&ev.pk.n===ev.n&&ev.calibK&&ev.ou&&ev.bt,"kalibrasi");
assert(rows.length>20&&ev.n===rows.length&&ev.pp.acc>ev.homeAcc-1&&ev.pp.brier>0&&ev.pp.brier<1.5);
assert.equal(ev.calib.reduce((s,c)=>s+c.n,0),ev.n);assert.equal(evaluate([]).n,0);
console.log("model ok",p1,"| uji mundur",ev.n,"laga, akurasi",ev.pp.acc,"vs tuan rumah",ev.homeAcc,"brier",ev.pp.brier,"vs patokan",ev.fr.brier);
// integrasi update.mjs dengan API tiruan
process.env.FOOTBALL_DATA_KEY="x";process.env.GAP_MS="0";process.env.RETRY_MS="0";
const tbl=[1,2,3,4,5,6].map((i,ix)=>({position:ix+1,team:{id:i,name:"Tim"+i+" FC"},playedGames:10,points:30-ix*5,goalsFor:20-ix*2,goalsAgainst:5+ix*2}));
const ok=j=>({ok:true,status:200,json:async()=>j});
const iso=x=>new Date(x).toISOString(),fut=t0+10*60e3;
const tm=i=>({id:i,name:"Tim"+i+" FC"});
const mk2=(id,h,a,u,status,sc)=>({id,utcDate:iso(u),status,homeTeam:tm(h),awayTeam:tm(a),score:{fullTime:{home:sc?sc[0]:null,away:sc?sc[1]:null}}});
const apiM=[...fin.map(x=>mk2(x.id,x.h,x.a,x.t,"FINISHED",[x.gh,x.ga])),mk2(1,1,6,fut,"TIMED"),mk2(2,2,3,t0-60e3,"IN_PLAY",[1,0]),mk2(3,1,2,t0+12*D,"TIMED"),mk2(4,1,99,fut,"TIMED"),mk2(5,3,4,fut,"POSTPONED"),mk2(6,2,4,t0+5*D,"TIMED")];
globalThis.fetch=async u=>{
  if(u.includes("/PL/standings"))return ok({standings:[{type:"TOTAL",table:tbl}]});
  if(u.includes("/PL/matches"))return ok({matches:apiM});
  return {ok:false,status:403,json:async()=>({})};
};
const dir=new URL("../site/",import.meta.url);
await import("./update.mjs");
let d=JSON.parse(readFileSync(new URL("data.json",dir)));
assert.equal(d.errors.length,LEAGUES.length-1);assert(d.week[1]>=d.week[0]);
const a1=d.matches.find(x=>x.id===1),a2=d.matches.find(x=>x.id===2);
assert(a1&&a2&&!d.matches.find(x=>x.id===3||x.id===4||x.id===5),"jendela pekan dan filter");
assert(d.matches.find(x=>x.id===6)&&!d.extra,"jendela 7 hari");
assert(a1.p.raw&&a1.p.fr.length===3&&Math.abs(a1.p.h+a1.p.d+a1.p.a-100)<.11&&d.cal&&d.cal.lam>=0&&Math.abs(a1.p.h-a1.p.a)<=Math.abs(a1.p.raw.h-a1.p.raw.a)+.11,"kalibrasi terpasang");
assert.equal(a2.status,"LIVE");assert.deepEqual(a2.score,[1,0]);assert.equal(a1.pick,"h");
assert.equal(a1.home.name,"Tim1");assert(a1.home.f.l5.length===5&&a1.home.elo>a1.away.elo&&a1.p.pe&&a1.p.xg[0]>a1.p.xg[1]);
let h=JSON.parse(readFileSync(new URL("history.json",dir)));
const h1=h.find(x=>x.id===1);assert.equal(h.length,2);assert.equal(h1.r,null);assert(Math.abs(h1.pp[0]+h1.pp[1]+h1.pp[2]-100)<.11&&h1.pk&&Math.abs(h1.pk[0]+h1.pk[1]+h1.pk[2]-100)<.11);
let e=JSON.parse(readFileSync(new URL("eval.json",dir)));
assert(e.backtest.n>20&&e.live.n===0&&e.live.pending===2&&e.cal&&e.backtest.pk&&e.backtest.ou&&e.backtest.bt);
// putaran kedua: laga 1 selesai -> hasil masuk riwayat dan dinilai
const hf=new URL("history.json",dir).pathname.replace(/^\/([A-Za-z]:)/,"$1");
process.env.HISTORY_FILE=hf;
apiM.splice(apiM.findIndex(x=>x.id===6),1);apiM.find(x=>x.id===1).status="FINISHED";apiM.find(x=>x.id===1).score.fullTime={home:2,away:0};apiM.find(x=>x.id===1).utcDate=iso(t0-3600e3);
await import("./update.mjs?run2");
h=JSON.parse(readFileSync(new URL("history.json",dir)));e=JSON.parse(readFileSync(new URL("eval.json",dir)));
assert.deepEqual(h.find(x=>x.id===1).r,[2,0]);assert.equal(e.live.n,1);assert.equal(e.live.pending,1);
d=JSON.parse(readFileSync(new URL("data.json",dir)));
assert(d.extra&&d.matches.some(x=>x.id===3&&x.status==="NS")&&!d.matches.some(x=>x.id===6),"hari laga berikutnya");
{const {monthWindow:mw}=await import("./lib.mjs");
assert.deepEqual(mw(Date.parse("2026-11-10T00:00:00Z")),["2026-11-01","2026-11-30"],"November 30 hari");
assert.deepEqual(mw(Date.parse("2028-02-15T00:00:00Z")),["2028-02-01","2028-02-29"],"Februari kabisat");
assert.deepEqual(mw(Date.parse("2026-12-31T20:00:00Z")),["2027-01-01","2027-01-31"],"lewat tengah malam WITA masuk bulan berikutnya");
assert.deepEqual(mw(Date.parse("2026-10-31T15:59:00Z")),["2026-10-01","2026-10-31"],"31 Oktober 23.59 WITA masih Oktober");}
console.log("update ok");
for(const n of["data.json","history.json","eval.json"])rmSync(new URL(n,dir));
