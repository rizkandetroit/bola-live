import {mkdirSync,writeFileSync,readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname} from "node:path";
import {LEAGUES,fit,predictM,formOf,pcts,backtest,evaluate,level,r1} from "./lib.mjs";
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
// Riwayat prediksi disimpan di situs Pages itu sendiri (history.json), diambil dari versi yang sedang tayang.
// 404 = belum ada riwayat (mulai kosong). Kegagalan lain = hentikan, supaya riwayat lama tidak tertimpa kosong.
async function loadHistory(){
  const f=process.env.HISTORY_FILE;
  if(f){try{return JSON.parse(readFileSync(f,"utf8"))}catch(e){return[]}}
  const repo=process.env.GITHUB_REPOSITORY;if(!repo)return[];
  const [o,n]=repo.split("/"),url=`https://${o.toLowerCase()}.github.io/${n}/history.json?t=${Date.now()}`;
  for(let i=0;i<3;i++){
    try{const r=await fetch(url);if(r.status===404)return[];if(r.ok){const j=await r.json();if(Array.isArray(j))return j}}catch(e){}
    await sleep(Number(process.env.RETRY_MS??5000));
  }
  throw new Error("Riwayat prediksi (history.json) tidak bisa dimuat; run dihentikan agar riwayat tidak hilang.");
}
const WITA=8*3600e3,now=Date.now();
const day=t=>new Date(t+WITA).toISOString().slice(0,10);
const back=(new Date(now+WITA).getUTCDay()+6)%7,w0=now-back*864e5,wkA=day(w0),wkB=day(w0+6*864e5);
const nm=t=>(t.name||t.shortName||"?").replace(/\s+(FC|AFC|CF|SC)$/,"");
const rec=r=>r?{gp:r.playedGames,w:r.won,d:r.draw,l:r.lost,gf:r.goalsFor,ga:r.goalsAgainst}:null;
const side=(t,r,sp)=>({name:nm(t),pos:r.position,pts:r.points,gp:r.playedGames,gf:r.goalsFor,ga:r.goalsAgainst,w:r.won,d:r.draw,l:r.lost,sp:rec(sp)});
const FIN=s=>s==="FINISHED"||s==="AWARDED",BAD=["POSTPONED","CANCELLED","SUSPENDED"];
const hist=new Map((await loadHistory()).map(x=>[x.id,x]));
const out=[],errors=[],btRows=[];
for(const [code,name] of LEAGUES){
  try{
    const st=await get(`/competitions/${code}/standings`);
    const tb=(st.standings.find(s=>s.type==="TOTAL")||st.standings[0]).table,byId=new Map(tb.map(t=>[t.team.id,t]));
    const mp=ty=>new Map((((st.standings.find(s=>s.type===ty))||{}).table||[]).map(t=>[t.team.id,t])),hm=mp("HOME"),am=mp("AWAY");
    await sleep(GAP);
    const ms=await get(`/competitions/${code}/matches`);
    const fin=[];
    for(const m of ms.matches){const h=m.score?.fullTime?.home,a=m.score?.fullTime?.away;if(FIN(m.status)&&h!=null&&a!=null)fin.push({t:Date.parse(m.utcDate),h:m.homeTeam.id,a:m.awayTeam.id,gh:h,ga:a})}
    fin.sort((x,y)=>x.t-y.t);
    const mNow=fit(fin,now);
    for(const r of backtest(fin))btRows.push({...r,lg:name});
    for(const m of ms.matches){
      const t=Date.parse(m.utcDate),hid=m.homeTeam.id,aid=m.awayTeam.id,h=byId.get(hid),a=byId.get(aid);
      if(!h||!a)continue;
      // log prediksi sebelum kickoff (diperbarui terus sampai laga mulai, lalu dikunci)
      if(t>now&&t<now+8*864e5&&(m.status==="SCHEDULED"||m.status==="TIMED"))hist.set(m.id,{id:m.id,lg:name,u:m.utcDate,h:nm(m.homeTeam),a:nm(m.awayTeam),...pcts(predictM(mNow,hid,aid)),r:null});
      const he=hist.get(m.id),sc=m.score?.fullTime;
      if(he&&he.r==null&&FIN(m.status)&&sc?.home!=null&&sc?.away!=null)he.r=[sc.home,sc.away];
      const d=day(t);
      if(d<wkA||d>wkB||BAD.includes(m.status))continue;
      const mdl=t>now?mNow:fit(fin,t),p=predictM(mdl,hid,aid),e=r1(Math.abs(p.h-p.a));
      const live=["IN_PLAY","PAUSED","EXTRA_TIME","PENALTY_SHOOTOUT"].includes(m.status);
      out.push({id:m.id,league:name,utc:m.utcDate,status:live?"LIVE":FIN(m.status)?"FT":"NS",score:[sc?.home??null,sc?.away??null],
        home:{...side(m.homeTeam,h,hm.get(hid)),elo:p.el[0],f:formOf(mdl,hid,"h")},away:{...side(m.awayTeam,a,am.get(aid)),elo:p.el[1],f:formOf(mdl,aid,"a")},
        p,pick:p.h>=p.a?"h":"a",edge:e,level:level(e)});
    }
  }catch(e){errors.push(code+": "+e.message)}
  await sleep(GAP);
}
if(!out.length&&errors.length){console.error("Gagal mengambil data:\n"+errors.join("\n"));process.exit(1)}
for(const [id,e] of hist)if(e.r==null&&Date.parse(e.u)<now-5*864e5)hist.delete(id);
const grp=rows=>{const by={},o={};for(const r of rows)(by[r.lg]=by[r.lg]||[]).push(r);for(const k in by)o[k]=evaluate(by[k]);return o};
const hv=[...hist.values()],liveRows=hv.filter(e=>e.r).map(e=>({lg:e.lg,o:e.r[0]>e.r[1]?0:e.r[0]===e.r[1]?1:2,pp:e.pp,pe:e.pe,pb:e.pb}));
const ev={updated:new Date(now).toISOString(),backtest:{...evaluate(btRows),byLeague:grp(btRows)},live:{...evaluate(liveRows),byLeague:grp(liveRows),pending:hv.filter(e=>e.r==null).length}};
out.sort((a,b)=>a.utc.localeCompare(b.utc));
const dir=fileURLToPath(new URL("../site/",import.meta.url));
mkdirSync(dir,{recursive:true});
writeFileSync(dir+"data.json",JSON.stringify({updated:new Date(now).toISOString(),week:[wkA,wkB],matches:out,errors}));
writeFileSync(dir+"history.json",JSON.stringify(hv));
writeFileSync(dir+"eval.json",JSON.stringify(ev));
console.log("OK:",out.length,"pertandingan;",errors.length,"liga gagal; riwayat",hv.length,"prediksi; uji mundur",btRows.length,"laga");
if(errors.length)console.log(errors.join("\n"));
