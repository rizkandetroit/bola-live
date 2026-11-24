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
{const {monthWindow:mw}=await import("./lib.mjs");
assert.deepEqual(mw(Date.parse("2026-11-10T00:00:00Z")),["2026-11-01","2026-11-30"],"November 30 hari");
assert.deepEqual(mw(Date.parse("2028-02-15T00:00:00Z")),["2028-02-01","2028-02-29"],"Februari kabisat");
assert.deepEqual(mw(Date.parse("2026-12-31T20:00:00Z")),["2027-01-01","2027-01-31"],"lewat tengah malam WITA masuk bulan berikutnya");
assert.deepEqual(mw(Date.parse("2026-10-31T15:59:00Z")),["2026-10-01","2026-10-31"],"31 Oktober 23.59 WITA masih Oktober");}
console.log("lib ok");
