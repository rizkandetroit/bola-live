import {readFileSync,writeFileSync,rmSync} from "node:fs";
import assert from "node:assert";
process.env.GAP_MS="0";process.env.RETRY_MS="0";
process.env.WORLD_LEAGUES=JSON.stringify(["Indonesian Super League","eredivisie","Liga Antah Berantah"]);
const now=Date.now(),D=864e5,iso=t=>new Date(t).toISOString().slice(0,19);
const nm={1:"Alpha",2:"Beta",3:"Gamma",4:"Delta",5:"Eps",6:"Zeta"};
const E=(id,t,h,a,gh,ga,st,pst)=>({idEvent:String(id),strTimestamp:iso(t),idHomeTeam:String(h),idAwayTeam:String(a),strHomeTeam:nm[h],strAwayTeam:nm[a],intHomeScore:gh==null?null:String(gh),intAwayScore:ga==null?null:String(ga),strStatus:st,strPostponed:pst||"no",intRound:"3",strVenue:"Stadion"});
const ev=[],fins=[];let k=0,id=1;
for(let h=1;h<=6;h++)for(let a=1;a<=6;a++)if(h!==a){const gh=(h+a)%4,ga=(h*a)%3,t=now-(31-k)*.9*D;ev.push(E(id++,t,h,a,gh,ga,"FT"));fins.push({h,a,gh,ga});k++}
ev.push(E(900,now+1*D,1,2,null,null,"NS"),E(901,now+3*D,3,4,null,null,"NS"),E(902,now+20*D,5,6,null,null,"NS"),E(903,now+2*D,2,5,null,null,"PST","yes"));
const old=E(777,now-200*D,1,2,1,0,"FT");
const res=j=>({ok:true,status:200,text:async()=>JSON.stringify(j)});
let first=true,seasonCalls={4790:0,4001:0};
globalThis.fetch=async u=>{
  if(u.includes("/all_leagues.php")){if(first){first=false;return{ok:false,status:429,text:async()=>""}}
    return res({leagues:[{idLeague:"4790",strLeague:"Indonesian Super League",strSport:"Soccer"},{idLeague:"4001",strLeague:"Dutch Eredivisie",strSport:"Soccer"},{idLeague:"9",strLeague:"NBA",strSport:"Basketball"}]})}
  if(u.includes("eventsseason.php?id=4790")){seasonCalls[4790]++;return res({events:ev})}
  if(u.includes("eventsseason.php?id=4001")){seasonCalls[4001]++;return res({events:[old]})}
  return{ok:false,status:404,text:async()=>""};
};
const dir=new URL("../site/",import.meta.url);
await import("./world.mjs");
let w=JSON.parse(readFileSync(new URL("world.json",dir)));
assert.equal(seasonCalls[4790],1);assert.equal(seasonCalls[4001],3);
assert.equal(w.leagues.length,2);assert(w.leagues.find(l=>l.id==="4001").note);assert.deepEqual(w.unresolved,["Liga Antah Berantah"]);assert.equal(w.errors.length,0);
const ids=w.matches.map(m=>m.id);
assert(ids.includes("t900")&&ids.includes("t901")&&!ids.includes("t902")&&!ids.includes("t903"),"jendela dan postponed");
assert(w.matches.every(m=>m.src==="TheSportsDB"&&Math.abs(m.p.h+m.p.d+m.p.a-100)<.11&&m.edge>=0&&m.home.pos>=1&&m.home.pos<=6&&m.p.raw&&m.p.sc5.length===5));
assert(w.matches.some(m=>m.status==="FT"&&typeof m.score[0]==="number"),"skor laga selesai");
const m900=w.matches.find(m=>m.id==="t900"),exp=(t)=>{let g=0,wn=0,d=0,gf=0;for(const f of fins){if(f.h===t){g++;gf+=f.gh;f.gh>f.ga?wn++:f.gh===f.ga&&d++}if(f.a===t){g++;gf+=f.ga;f.ga>f.gh?wn++:f.ga===f.gh&&d++}}return{g,pts:wn*3+d,gf}};
const e1=exp(1);assert.equal(m900.home.gp,e1.g);assert.equal(m900.home.pts,e1.pts);assert.equal(m900.home.gf,e1.gf);
assert.equal(m900.status,"NS");assert.deepEqual(m900.score,[null,null]);assert(w.cal.lam>=0);
const cat=JSON.parse(readFileSync(new URL("catalog.json",dir)));assert.equal(cat.length,2);
// putaran 2: semua permintaan gagal -> pakai data lama
const pf=new URL("world.json",dir).pathname.replace(/^\/([A-Za-z]:)/,"$1");process.env.PREV_FILE=pf;
globalThis.fetch=async()=>{throw new Error("offline")};
await import("./world.mjs?run2");
w=JSON.parse(readFileSync(new URL("world.json",dir)));
assert(w.stale&&w.matches.length===ids.length&&w.errors.length>0,"cadangan data lama");
console.log("world ok");
if(!process.env.KEEP)for(const n of["world.json","catalog.json"])rmSync(new URL(n,dir));
