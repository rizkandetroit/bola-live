import {mkdirSync,writeFileSync,readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {fit,predictM,formOf,backtest,calibrate,shrink,level,r1} from "./lib.mjs";
import {tfetch,siteBase,outDir,overDeadline} from "./net.mjs";
// Liga di luar football-data.org, dari TheSportsDB (data komunitas). Tidak pernah menggagalkan deploy.
const KEY=process.env.TSDB_KEY||"123",API=process.env.TSDB_API||`https://www.thesportsdb.com/api/v1/json/${KEY}`;
const GAP=Number(process.env.GAP_MS??2200),sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(path){
  const nm=path.split("?")[0];
  for(let i=0;i<3;i++){
    let r;
    if(overDeadline())throw new Error(nm+" dilewati: batas waktu run habis");
    try{r=await tfetch(API+path)}catch(e){await sleep(Number(process.env.RETRY_MS??20000));continue}
    if(r.status===429){await sleep(Number(process.env.RETRY_MS??20000));continue}
    if(!r.ok)throw new Error(nm+" HTTP "+r.status);
    try{return JSON.parse(await r.text())}catch(e){throw new Error(nm+" bukan JSON")}
  }
  throw new Error(nm+" gagal setelah 3 percobaan");
}
async function loadPrev(){
  try{const f=process.env.PREV_FILE;if(f)return JSON.parse(readFileSync(f,"utf8"));
    const base=siteBase();if(!base)return null;
    const r=await tfetch(base+"world.json?t="+Date.now());return r.ok?await r.json():null}catch(e){return null}
}
const WITA=8*3600e3,now=Date.now(),day=t=>new Date(t+WITA).toISOString().slice(0,10);
const wkA=day(now-2*864e5),wkB=day(now+7*864e5),Y=Number(day(now).slice(0,4)),MO=Number(day(now).slice(5,7));
const cands=MO>=7?[`${Y}-${Y+1}`,`${Y}`,`${Y-1}-${Y}`]:[`${Y-1}-${Y}`,`${Y}`,`${Y}-${Y+1}`];
const cfg=process.env.WORLD_LEAGUES?JSON.parse(process.env.WORLD_LEAGUES):JSON.parse(readFileSync(new URL("./world-leagues.json",import.meta.url),"utf8"));
const ts=e=>{const s=e.strTimestamp||(e.dateEvent?e.dateEvent+"T"+(e.strTime||"00:00:00"):"");if(!s)return null;const v=Date.parse(/Z$|[+-]\d\d:\d\d$/.test(s)?s:s+"Z");return Number.isNaN(v)?null:v};
const num=v=>v==null||v===""||Number.isNaN(Number(v))?null:Number(v);
const FT=["FT","AET","PEN","AOT","FINISHED","MATCH FINISHED"],PST=["PST","CANC","ABD","SUSP","POSTPONED","CANCELLED"];
const rec=r=>({gp:r.gp,w:r.w,d:r.d,l:r.l,gf:r.gf,ga:r.ga});
const z=()=>({gp:0,w:0,d:0,l:0,gf:0,ga:0});
const add=(r,gf,ga)=>{r.gp++;r.gf+=gf;r.ga+=ga;if(gf>ga)r.w++;else if(gf===ga)r.d++;else r.l++};
const out=[],leagues=[],errors=[],warn=[],unresolved=[],rows=[];
let catalog=[];
try{catalog=((await get("/all_leagues.php")).leagues||[]).filter(l=>l.strSport==="Soccer");await sleep(GAP)}catch(e){errors.push("katalog: "+e.message)}
const resolve=p=>{
  if(typeof p==="number"||/^\d+$/.test(String(p))){const c=catalog.find(l=>String(l.idLeague)===String(p));return{id:String(p),name:c?c.strLeague:"Liga "+p}}
  const q=String(p).toLowerCase(),ex=catalog.find(l=>l.strLeague.toLowerCase()===q);if(ex)return{id:ex.idLeague,name:ex.strLeague};
  const m=catalog.filter(l=>l.strLeague.toLowerCase().includes(q)).sort((a,b)=>a.strLeague.length-b.strLeague.length);
  return m[0]?{id:m[0].idLeague,name:m[0].strLeague}:null;
};
for(const p of cfg){
  const lg=resolve(p);if(!lg){unresolved.push(String(p));continue}
  try{
    let ev=null,season=null;
    for(const s of cands){
      const r=await get(`/eventsseason.php?id=${lg.id}&s=${s}`);await sleep(GAP);
      const e=r.events||[];
      if(e.some(x=>{const t=ts(x);return t&&t>now-45*864e5&&t<now+120*864e5})){ev=e;season=s;break}
    }
    if(!ev){leagues.push({id:lg.id,name:lg.name,season:null,note:"tidak ada jadwal aktif"});continue}
    if(ev.length>=200)warn.push(lg.name+": jadwal dipotong batas paket gratis (200 laga), klasemen bisa tidak lengkap");
    const T=new Map(),all=[],fin=[];
    const tm=(id,name)=>{let x=T.get(id);if(!x){x={id,name,...z(),pts:0,h:z(),a:z()};T.set(id,x)}return x};
    for(const e of ev){
      const t=ts(e);if(!t||!e.idHomeTeam||!e.idAwayTeam)continue;
      const H=tm(e.idHomeTeam,e.strHomeTeam),A=tm(e.idAwayTeam,e.strAwayTeam);
      const gh=num(e.intHomeScore),ga=num(e.intAwayScore),st=String(e.strStatus||"").toUpperCase();
      const post=String(e.strPostponed).toLowerCase()==="yes"||PST.includes(st);
      const done=!post&&gh!=null&&ga!=null&&(FT.includes(st)||(!st&&t<now-4*36e5));
      all.push({e,t,H,A,gh,ga,post,done});
      if(done){fin.push({t,h:e.idHomeTeam,a:e.idAwayTeam,gh,ga});add(H,gh,ga);add(H.h,gh,ga);add(A,ga,gh);add(A.a,ga,gh)}
    }
    fin.sort((a,b)=>a.t-b.t);
    [...T.values()].forEach(x=>{x.pts=x.w*3+x.d});
    [...T.values()].sort((a,b)=>b.pts-a.pts||(b.gf-b.ga)-(a.gf-a.ga)||b.gf-a.gf||a.name.localeCompare(b.name)).forEach((x,i)=>{x.pos=i+1});
    const mNow=fit(fin,now);for(const r of backtest(fin))rows.push({...r,lg:lg.name});
    const sd=(x,r)=>({name:x.name,pos:x.pos,pts:x.pts,gp:x.gp,gf:x.gf,ga:x.ga,w:x.w,d:x.d,l:x.l,sp:rec(r)});
    for(const x of all){
      if(x.post)continue;const d=day(x.t);if(d<wkA||d>wkB)continue;
      const hid=x.e.idHomeTeam,aid=x.e.idAwayTeam,mdl=x.t>now?mNow:fit(fin,x.t),p=predictM(mdl,hid,aid),ed=r1(Math.abs(p.h-p.a));
      out.push({id:"t"+x.e.idEvent,league:lg.name,src:"TheSportsDB",round:num(x.e.intRound),utc:new Date(x.t).toISOString(),status:x.done?"FT":"NS",score:x.done?[x.gh,x.ga]:[null,null],
        home:{...sd(x.H,x.H.h),elo:p.el[0],f:formOf(mdl,hid,"h")},away:{...sd(x.A,x.A.a),elo:p.el[1],f:formOf(mdl,aid,"a")},p,pick:p.h>=p.a?"h":"a",edge:ed,level:level(ed)});
    }
    leagues.push({id:lg.id,name:lg.name,season,events:ev.length,finished:fin.length});
  }catch(e){errors.push(lg.name+": "+e.message)}
}
const cal=calibrate(rows);
for(const x of out){const k=shrink([x.p.h,x.p.d,x.p.a],x.p.fr,cal.lam);x.p.raw={h:x.p.h,d:x.p.d,a:x.p.a};x.p.h=k[0];x.p.d=k[1];x.p.a=k[2];x.edge=r1(Math.abs(k[0]-k[2]));x.pick=k[0]>=k[2]?"h":"a";x.level=level(x.edge)}
out.sort((a,b)=>a.utc.localeCompare(b.utc));
let res={updated:new Date(now).toISOString(),cal:{lam:cal.lam},leagues,unresolved,warn,errors,matches:out};
if(!leagues.length&&errors.length){const prev=await loadPrev();if(prev&&prev.matches)res={...prev,stale:true,errors:errors.concat(prev.errors||[])}}
const dir=outDir(import.meta.url);mkdirSync(dir,{recursive:true});
writeFileSync(dir+"world.json",JSON.stringify(res));
if(catalog.length)writeFileSync(dir+"catalog.json",JSON.stringify(catalog.map(l=>({id:l.idLeague,n:l.strLeague}))));
console.log("OK dunia:",res.matches.length,"pertandingan;",res.leagues.length,"liga;",res.unresolved.length,"tidak ditemukan;",res.errors.length,"error",res.stale?"(data lama)":"");
if(res.errors.length)console.log(res.errors.join("\n"));
