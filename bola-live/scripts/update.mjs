import {mkdirSync,writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname} from "node:path";
import {LEAGUES,league,predict,level,r1} from "./lib.mjs";
const KEY=process.env.FOOTBALL_DATA_KEY;
if(!KEY){console.error("FOOTBALL_DATA_KEY belum diisi di Secrets.");process.exit(1)}
const API="https://api.football-data.org/v4";
const GAP=Number(process.env.GAP_MS??6500);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(path){
  for(let i=0;i<3;i++){
    const r=await fetch(API+path,{headers:{"X-Auth-Token":KEY}});
    if(r.status===429){await sleep(Number(process.env.RETRY_MS??30000));continue}
    if(!r.ok)throw new Error(path+" HTTP "+r.status);
    return r.json();
  }
  throw new Error(path+" terlalu banyak permintaan");
}
const WITA=8*3600e3,now=Date.now();
const day=t=>new Date(t+WITA).toISOString().slice(0,10);
const today=day(now),tomorrow=day(now+864e5),from=day(now-864e5),to=day(now+2*864e5);
const nm=t=>t.shortName||t.name;
const side=(t,r)=>({name:nm(t),pos:r.position,pts:r.points,gp:r.playedGames});
const out=[],errors=[];
for(const [code,name] of LEAGUES){
  try{
    const st=await get(`/competitions/${code}/standings`);
    const tb=(st.standings.find(s=>s.type==="TOTAL")||st.standings[0]).table;
    const base=league(tb),byId=new Map(tb.map(t=>[t.team.id,t]));
    await sleep(GAP);
    const ms=await get(`/competitions/${code}/matches?dateFrom=${from}&dateTo=${to}`);
    for(const m of ms.matches){
      const d=day(Date.parse(m.utcDate));
      if(d!==today&&d!==tomorrow)continue;
      const h=byId.get(m.homeTeam.id),a=byId.get(m.awayTeam.id);
      if(!h||!a)continue;
      const p=predict(h,a,base),e=r1(Math.abs(p.h-p.a));
      const live=m.status==="IN_PLAY"||m.status==="PAUSED";
      out.push({id:m.id,league:name,utc:m.utcDate,status:live?"LIVE":m.status==="FINISHED"?"FT":"NS",
        score:[m.score?.fullTime?.home??null,m.score?.fullTime?.away??null],
        home:side(m.homeTeam,h),away:side(m.awayTeam,a),p,pick:p.h>=p.a?"h":"a",edge:e,level:level(e)});
    }
  }catch(e){errors.push(code+": "+e.message)}
  await sleep(GAP);
}
if(!out.length&&errors.length){console.error("Gagal mengambil data:\n"+errors.join("\n"));process.exit(1)}
out.sort((a,b)=>a.utc.localeCompare(b.utc));
const file=fileURLToPath(new URL("../site/data.json",import.meta.url));
mkdirSync(dirname(file),{recursive:true});
writeFileSync(file,JSON.stringify({updated:new Date().toISOString(),matches:out,errors}));
console.log("OK:",out.length,"pertandingan;",errors.length,"liga gagal");
if(errors.length)console.log(errors.join("\n"));
