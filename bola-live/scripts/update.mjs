import {mkdirSync,writeFileSync,readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname} from "node:path";
import {LEAGUES,fit,predictM,formOf,pcts,backtest,evaluate,calibrate,shrink,finalP,level,r1} from "./lib.mjs";
import {sleep,tfetch,cleanKey,siteBase,outDir,overDeadline,ghError,ghWarn} from "./net.mjs";
const KEY=cleanKey(process.env.FOOTBALL_DATA_KEY);
if(!KEY){ghError("Secret FOOTBALL_DATA_KEY kosong atau belum dibuat. Buka repo > Settings > Secrets and variables > Actions > New repository secret. Nama harus persis FOOTBALL_DATA_KEY, isi dengan token dari email football-data.org.");process.exit(1)}
if(/[^\x21-\x7e]/.test(KEY)){ghError("Secret FOOTBALL_DATA_KEY mengandung spasi/karakter tak valid di tengah. Tempel ulang token-nya (hanya token, tanpa kata lain).");process.exit(1)}
const API=process.env.FOOTBALL_DATA_API||"https://api.football-data.org/v4";
const GAP=Number(process.env.GAP_MS??6500),RETRY=Number(process.env.RETRY_MS??30000);
// Hanya galat jaringan / 429 / 5xx yang dicoba ulang. 4xx lain langsung dilaporkan beserta isi pesan dari server.
async function get(path){
  let last="";
  for(let i=0;i<3;i++){
    if(overDeadline())throw new Error(path+" dilewati: batas waktu run habis");
    let r;
    try{r=await tfetch(API+path,{headers:{"X-Auth-Token":KEY}})}catch(e){last=e.message;await sleep(RETRY);continue}
    if(r.status===429||r.status>=500){last="HTTP "+r.status;await sleep(RETRY);continue}
    if(!r.ok){let b="";try{b=(await r.text?.())||""}catch(e){}const err=new Error(path+" HTTP "+r.status+(b?" "+b.slice(0,140):""));err.status=r.status;err.body=b;throw err}
    return r.json();
  }
  throw new Error(path+" gagal setelah 3 percobaan ("+last+")");
}
// Riwayat prediksi disimpan di situs Pages itu sendiri (history.json), diambil dari versi yang sedang tayang.
// Belum ada / tidak bisa diakses publik / bukan JSON = mulai kosong. Galat jaringan atau 5xx yang menetap = hentikan,
// supaya riwayat lama tidak tertimpa kosong (run berikutnya, 15 menit lagi, mencoba lagi).
async function loadHistory(){
  const f=process.env.HISTORY_FILE;
  if(f){try{return JSON.parse(readFileSync(f,"utf8"))}catch(e){return[]}}
  const base=siteBase();if(!base)return[];
  const url=base+"history.json?t="+Date.now();let last="";
  for(let i=0;i<3;i++){
    try{
      const r=await tfetch(url);
      if([401,403,404].includes(r.status))return[];
      if(r.ok){
        let j=null;try{j=JSON.parse(await r.text())}catch(e){}
        if(Array.isArray(j))return j;
        ghWarn("history.json di "+url+" bukan JSON larik; riwayat dimulai dari kosong.");return[];
      }
      last="HTTP "+r.status;
    }catch(e){last=e.message}
    await sleep(Number(process.env.RETRY_MS??5000));
  }
  throw new Error("Riwayat prediksi (history.json) tidak bisa dimuat ("+last+"); run dihentikan agar riwayat tidak hilang. Akan dicoba lagi pada run berikutnya.");
}
const WITA=8*3600e3,now=Date.now();
const day=t=>new Date(t+WITA).toISOString().slice(0,10);
const wkA=day(now-2*864e5),wkB=day(now+7*864e5); // jendela: 2 hari lalu sampai 7 hari ke depan
const nm=t=>(t.name||t.shortName||"?").replace(/\s+(FC|AFC|CF|SC)$/,"");
const rec=r=>r?{gp:r.playedGames,w:r.won,d:r.draw,l:r.lost,gf:r.goalsFor,ga:r.goalsAgainst}:null;
const side=(t,r,sp)=>({name:nm(t),pos:r.position,pts:r.points,gp:r.playedGames,gf:r.goalsFor,ga:r.goalsAgainst,w:r.won,d:r.draw,l:r.lost,sp:rec(sp)});
const FIN=s=>s==="FINISHED"||s==="AWARDED",BAD=["POSTPONED","CANCELLED","SUSPENDED"];
const hist=new Map((await loadHistory()).map(x=>[x.id,x]));
const out=[],later=[],errors=[],btRows=[];
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
      const d=day(t),inW=d>=wkA&&d<=wkB,fut=t>now&&t<now+30*864e5&&(m.status==="SCHEDULED"||m.status==="TIMED");
      if(BAD.includes(m.status)||(!inW&&!fut))continue;
      const mdl=t>now?mNow:fit(fin,t),p=predictM(mdl,hid,aid),e=r1(Math.abs(p.h-p.a));
      const live=["IN_PLAY","PAUSED","EXTRA_TIME","PENALTY_SHOOTOUT"].includes(m.status);
      (inW?out:later).push({id:m.id,league:name,utc:m.utcDate,status:live?"LIVE":FIN(m.status)?"FT":"NS",score:[sc?.home??null,sc?.away??null],
        home:{...side(m.homeTeam,h,hm.get(hid)),elo:p.el[0],f:formOf(mdl,hid,"h")},away:{...side(m.awayTeam,a,am.get(aid)),elo:p.el[1],f:formOf(mdl,aid,"a")},
        p,pick:p.h>=p.a?"h":"a",edge:e,level:level(e)});
    }
  }catch(e){
    if(e.status===401||(e.status===400&&/token/i.test(e.body||""))){ghError("Token football-data.org ditolak ("+e.message+"). Periksa secret FOOTBALL_DATA_KEY: harus token dari email pendaftaran, tanpa tanda kutip.");process.exit(1)}
    errors.push(code+": "+e.message)
  }
  await sleep(GAP);
}
if(!out.length&&!later.length&&errors.length){ghError("Gagal mengambil data dari semua liga:\n"+errors.join("\n"));process.exit(1)}
for(const [id,e] of hist)if(e.r==null&&Date.parse(e.u)<now-5*864e5)hist.delete(id);
// kalau tidak ada laga yang akan tayang dalam jendela, tampilkan hari laga berikutnya
let extra=null;
if(!out.some(x=>x.status==="NS")&&later.length){later.sort((a,b)=>a.utc.localeCompare(b.utc));extra=day(Date.parse(later[0].utc));for(const x of later)if(day(Date.parse(x.utc))===extra)out.push(x)}
// kalibrasi: lam dipelajari dari uji mundur, lalu dipakai ke semua prediksi
const cal=calibrate(btRows);
for(const x of out){const k=finalP(x.p,cal.lam);x.p.raw={h:x.p.h,d:x.p.d,a:x.p.a};x.p.h=k[0];x.p.d=k[1];x.p.a=k[2];x.edge=r1(Math.abs(k[0]-k[2]));x.pick=k[0]>=k[2]?"h":"a";x.level=level(x.edge)}
for(const e of hist.values())if(e.r==null&&e.fr&&Date.parse(e.u)>now)e.pk=shrink(e.pb,e.fr,cal.lam);
const grp=rows=>{const by={},o={};for(const r of rows)(by[r.lg]=by[r.lg]||[]).push(r);for(const k in by)o[k]=evaluate(by[k]);return o};
const hv=[...hist.values()],liveRows=hv.filter(e=>e.r).map(e=>({lg:e.lg,o:e.r[0]>e.r[1]?0:e.r[0]===e.r[1]?1:2,pp:e.pp,pe:e.pe,pb:e.pb,pk:e.pk}));
const ev={updated:new Date(now).toISOString(),cal:{lam:cal.lam},backtest:{...evaluate(btRows),byLeague:grp(btRows)},live:{...evaluate(liveRows),byLeague:grp(liveRows),pending:hv.filter(e=>e.r==null).length}};
out.sort((a,b)=>a.utc.localeCompare(b.utc));
const dir=outDir(import.meta.url);
mkdirSync(dir,{recursive:true});
writeFileSync(dir+"data.json",JSON.stringify({updated:new Date(now).toISOString(),week:[wkA,wkB],extra,cal:{lam:cal.lam},matches:out,errors}));
writeFileSync(dir+"history.json",JSON.stringify(hv));
writeFileSync(dir+"eval.json",JSON.stringify(ev));
console.log("OK:",out.length,"pertandingan;",errors.length,"liga gagal; riwayat",hv.length,"prediksi; uji mundur",btRows.length,"laga");
if(errors.length)console.log(errors.join("\n"));
