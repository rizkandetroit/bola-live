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
    let r;
    try{r=await fetch(API+path,{headers:{"X-Auth-Token":KEY}})}catch(e){await sleep(Number(process.env.RETRY_MS??30000));continue}
    if(r.status===429){await sleep(Number(process.env.RETRY_MS??30000));continue}
    if(!r.ok)throw new Error(path+" HTTP "+r.status);
    return r.json();
  }
  throw new Error(path+" terlalu banyak permintaan");
}
const WITA=8*3600e3,now=Date.now();
const day=t=>new Date(t+WITA).toISOString().slice(0,10);
const back=(new Date(now+WITA).getUTCDay()+6)%7,w0=now-back*864e5,wkA=day(w0),wkB=day(w0+6*864e5),from=day(w0-864e5),to=day(w0+7*864e5);
const nm=t=>(t.name||t.shortName||"?").replace(/\s+(FC|AFC|CF|SC)$/,"");
const rec=r=>r?{gp:r.playedGames,w:r.won,d:r.draw,l:r.lost,gf:r.goalsFor,ga:r.goalsAgainst}:null;
const side=(t,r,sp)=>({name:nm(t),pos:r.position,pts:r.points,gp:r.playedGames,gf:r.goalsFor,ga:r.goalsAgainst,w:r.won,d:r.draw,l:r.lost,form:r.form||null,sp:rec(sp)});
const out=[],errors=[];
for(const [code,name] of LEAGUES){
  try{
    const st=await get(`/competitions/${code}/standings`);
    const tb=(st.standings.find(s=>s.type==="TOTAL")||st.standings[0]).table;
    const base=league(tb),byId=new Map(tb.map(t=>[t.team.id,t]));
    const mp=ty=>new Map((((st.standings.find(s=>s.type===ty))||{}).table||[]).map(t=>[t.team.id,t])),hm=mp("HOME"),am=mp("AWAY");
    await sleep(GAP);
    const ms=await get(`/competitions/${code}/matches?dateFrom=${from}&dateTo=${to}`);
    for(const m of ms.matches){
      const d=day(Date.parse(m.utcDate));
      if(d<wkA||d>wkB)continue;
      const h=byId.get(m.homeTeam.id),a=byId.get(m.awayTeam.id);
      if(!h||!a)continue;
      const p=predict(h,a,base),e=r1(Math.abs(p.h-p.a));
      if(m.status==="POSTPONED"||m.status==="CANCELLED"||m.status==="SUSPENDED")continue;
      const live=["IN_PLAY","PAUSED","EXTRA_TIME","PENALTY_SHOOTOUT"].includes(m.status);
      out.push({id:m.id,league:name,utc:m.utcDate,status:live?"LIVE":(m.status==="FINISHED"||m.status==="AWARDED")?"FT":"NS",
        score:[m.score?.fullTime?.home??null,m.score?.fullTime?.away??null],
        home:side(m.homeTeam,h,hm.get(m.homeTeam.id)),away:side(m.awayTeam,a,am.get(m.awayTeam.id)),p,pick:p.h>=p.a?"h":"a",edge:e,level:level(e)});
    }
  }catch(e){errors.push(code+": "+e.message)}
  await sleep(GAP);
}
if(!out.length&&errors.length){console.error("Gagal mengambil data:\n"+errors.join("\n"));process.exit(1)}
out.sort((a,b)=>a.utc.localeCompare(b.utc));
const file=fileURLToPath(new URL("../site/data.json",import.meta.url));
mkdirSync(dirname(file),{recursive:true});
writeFileSync(file,JSON.stringify({updated:new Date().toISOString(),week:[wkA,wkB],matches:out,errors}));
console.log("OK:",out.length,"pertandingan;",errors.length,"liga gagal");
if(errors.length)console.log(errors.join("\n"));
