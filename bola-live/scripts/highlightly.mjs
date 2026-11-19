// V14: Liga Indonesia (Liga 1 + Liga 2) dari Highlightly (paket gratis, 100 permintaan/hari).
// Berjalan SETELAH bsd.mjs: menggabungkan laga Indonesia ke all.json, klasemen ke leagues.json + lg/hl<id>.json,
// detail laga ke m/hl<id>.json, dan prediksi ke catatan evaluasi (bsd-history.json / bsd-eval.json).
// Hemat kuota: setiap tugas punya jadwal sendiri; status terakhir disimpan di hl.json (dibawa dari situs tayang).
// Tidak pernah menggagalkan deploy.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {tfetch,cleanKey,outDir,siteBase,ghWarn,sleep} from "./net.mjs";
import {fit,predictM,level,r1} from "./lib.mjs";
import {updateHistory,evalHistory} from "./bsd.mjs";

export const HL_LEAGUES=[{id:233958,name:"Liga 1 Indonesia",short:"Liga 1"},{id:234809,name:"Liga 2 Indonesia",short:"Liga 2"}];
const H=36e5,DAY=864e5,WITA=8*H;
const LIVE=new Set(["First half","Second half","Half time","Extra time","Break time","Penalties","In progress"]);
const FT=/^Finished/;
export function stOf(s){s=String(s||"");return LIVE.has(s)?"LIVE":FT.test(s)?"FT":s==="Not started"?"NS":null}
export function scoreOf(st){const c=st&&st.score&&(st.score.current||st.score.fulltime||st.score.ft);const m=String(c||"").match(/(\d+)\s*-\s*(\d+)/);return m?[+m[1],+m[2]]:[null,null]}
const pct=v=>{const n=parseFloat(String(v??"").replace("%",""));return Number.isFinite(n)?n:null};
export function predOf(det){ // prediksi prematch terbaru Highlightly -> {h,d,a,desc,at}
  const L=((det&&det.predictions&&det.predictions.prematch)||[]).filter(p=>p&&p.probabilities);
  if(!L.length)return null;L.sort((a,b)=>String(a.generatedAt).localeCompare(String(b.generatedAt)));
  const p=L[L.length-1],h=pct(p.probabilities.home),a=pct(p.probabilities.away);let d=pct(p.probabilities.draw);
  if(h==null||a==null)return null;if(d==null)d=Math.max(0,100-h-a);const s=h+d+a||1;
  return{h:r1(h/s*100),d:r1(d/s*100),a:r1(a/s*100),desc:p.description||"",at:p.generatedAt||null};
}
export function toRec(x,lg,pred,model){
  const st=stOf(x.state&&x.state.description);if(!st)return null;
  const t=Date.parse(x.date);if(Number.isNaN(t))return null;
  const r={id:"hl"+x.id,eid:"hl"+x.id,lid:"hl"+lg.id,league:lg.name,lgc:(x.league&&x.league.logo)||null,utc:new Date(t).toISOString(),status:st,
    score:st==="NS"?[null,null]:scoreOf(x.state),home:{name:x.homeTeam&&x.homeTeam.name||"?",crest:x.homeTeam&&x.homeTeam.logo||null},
    away:{name:x.awayTeam&&x.awayTeam.name||"?",crest:x.awayTeam&&x.awayTeam.logo||null},hid:x.homeTeam&&x.homeTeam.id,aid:x.awayTeam&&x.awayTeam.id,src:"HL"};
  if(x.round)r.rl=String(x.round);
  if(st==="LIVE"){if(/Half time/.test(x.state.description))r.ht=true;else{const c=parseInt(x.state.clock,10);if(Number.isFinite(c))r.min=c}}
  let p=null,eng=null,note="";
  if(pred){p={h:pred.h,d:pred.d,a:pred.a};eng="hl";note="Prediksi model Highlightly."}
  else if(model&&r.hid!=null&&r.aid!=null&&model.n>=20){const q=predictM(model.m,r.hid,r.aid),gp=id=>((model.m.T&&model.m.T.get(id))||{}).gp||0;
    // sedikit data = peluang ditarik ke rata-rata liga (46/27/27), supaya tidak muncul angka ekstrem seperti 97%
    const w=Math.max(.15,Math.min(.8,Math.min(gp(r.hid),gp(r.aid))/12)),sh=(v,b)=>w*v+(1-w)*b;let h=sh(q.h,46),d=sh(q.d,27),a=sh(q.a,27);const t=h+d+a;h=h/t*100;d=d/t*100;a=a/t*100;
    p={h:r1(h),d:r1(d),a:r1(100-r1(h)-r1(d)),ou:q.ou,bt:q.bt,xg:q.xg,ms:q.ms};eng="poisson";note="Prediksi model Poisson + Elo Bola Live dari hasil laga musim ini (Highlightly tidak memberi prediksi untuk laga ini)."}
  if(!p)return{...r,np:true};
  const edge=r1(Math.abs(p.h-p.a));
  return{...r,p:{...p,engine:eng},pick:p.h>=p.a?"h":"a",edge,level:level(edge),est:true,tier:2,note};
}
function mapStandings(j,lg){
  const g=(j&&j.groups)||[];const rows=[];
  for(const grp of g)for(const s of (grp.standings||[])){
    const tot=s.total||{},hm=s.home||{},aw=s.away||{},add=k=>(tot[k]??((hm[k]||0)+(aw[k]||0)));
    const gf=add("scoredGoals"),ga=add("receivedGoals");
    rows.push({position:s.position??s.rank??rows.length+1,team_id:"hl"+(s.team&&s.team.id),logo:s.team&&s.team.logo,team_name:s.team&&s.team.name||"?",played:add("games"),won:add("wins"),drawn:add("draws"),lost:add("loses"),gf,ga,gd:gf-ga,pts:s.points??(add("wins")*3+add("draws")),xgd:null,form:"",zone:null,grp:grp.name});
  }
  rows.sort((a,b)=>a.position-b.position);
  return rows;
}
function mapDetail(det,rec){ // ke bentuk m/{id}.json yang dibaca Match Center
  const ev=(det.events||[]).map(e=>{const ty=String(e.type||"").toLowerCase(),home=e.team&&rec.hid!=null?String(e.team.id)===String(rec.hid):null,mn=String(e.time||"").match(/(\d+)(?:\+(\d+))?/);
    const base={minute:mn?+mn[1]:null,added_time:mn&&mn[2]?+mn[2]:null,is_home:home,player:e.player||e.playerName||"",assist:e.assist||null};
    if(/goal/.test(ty))return{...base,type:"goal",goal_type:/own/.test(ty)?"ownGoal":/penalty/.test(ty)?"penalty":"regular"};
    if(/card/.test(ty))return{...base,type:"card",card_type:/red/.test(ty)?"red":"yellow"};
    if(/subst/.test(ty))return{...base,type:"substitution",player_in:e.player||"",player_out:e.substituted||e.assist||""};
    if(/var/.test(ty))return{...base,type:"varDecision",decision:e.type};
    return null}).filter(Boolean);
  let stats=null;const S=det.statistics||[];
  if(Array.isArray(S)&&S.length>=2){const side=i=>{const o={};for(const s of (S[i].statistics||[])){const k=String(s.displayName||"").toLowerCase(),v=typeof s.value==="number"?s.value:parseFloat(s.value);
      if(/possession/.test(k))o.ball_possession=v;else if(/^shots on target|on target/.test(k))o.shots_on_target=v;else if(/total shots|^shots$/.test(k))o.total_shots=v;else if(/corner/.test(k))o.corner_kicks=v;else if(/foul/.test(k))o.fouls=v;else if(/offside/.test(k))o.offsides=v;else if(/yellow/.test(k))o.yellow_cards=v;else if(/red/.test(k))o.red_cards=v;else if(/expected goals|xg/.test(k))o.xg={actual:v};else if(/pass/.test(k)&&/accura|%/.test(k))o.pass_accuracy_pct=v;else if(/save/.test(k))o.saves=v}return o};
    const hi=S.findIndex(s=>s.team&&String(s.team.id)===String(rec.hid));const h=hi>=0?hi:0;stats={stats:{home:side(h),away:side(h?0:1)}}}
  const pr=predOf(det),fc=det.forecast||{};
  return{id:rec.eid,updated:new Date().toISOString(),status:rec.status,src:"HL",
    info:{weather:fc.status||fc.temperature?{description:fc.status||"",temperature_c:parseFloat(fc.temperature)}:null,round:det.round||null,venue_name:det.venue&&det.venue.name,referee_name:det.referee&&det.referee.name},
    pred:pr?{updated_at:pr.at,markets:{match_result:{prob_home:pr.h,prob_draw:pr.d,prob_away:pr.a}}}:null,
    stats,incidents:ev.length?ev:null,meta:pr&&pr.desc?{ai_preview:{text:pr.desc}}:null,h2h:null,lineups:null,commentary:null,player_stats:null,odds:null,tv:null,form:null};
}

async function main(){
  const KEY=cleanKey(process.env.HIGHLIGHTLY_KEY);
  if(!KEY){console.log("HIGHLIGHTLY_KEY kosong: liga Indonesia dilewati.");return}
  const BASE=(process.env.HL_API||"https://sports.highlightly.net").replace(/\/+$/,"");
  const dir=outDir(import.meta.url),site=siteBase(),now=Date.now(),MIN_LEFT=Number(process.env.HL_MIN_LEFT??8);
  mkdirSync(dir+"m",{recursive:true});mkdirSync(dir+"lg",{recursive:true});
  const pull=async f=>{if(process.env.HL_STATE_FILE&&f==="hl.json"){try{return JSON.parse(readFileSync(process.env.HL_STATE_FILE,"utf8"))}catch(e){return null}}if(!site)return null;try{const r=await tfetch(site+f+"?t="+now);return r.ok?await r.json():null}catch(e){return null}};
  const S=(await pull("hl.json"))||{};S.season=S.season||{};S.stand=S.stand||{};S.det=S.det||{};S.matches=S.matches||{};S.tables=S.tables||{};S.calls=S.calls||{};S.today=S.today||{};
  const today=new Date(now+WITA).toISOString().slice(0,10);if(S.calls.day!==today)S.calls={day:today,n:0};
  let left=null,calls=0;const errors=[];
  async function get(path){
    if(S.calls.n>=Number(process.env.HL_DAY_CAP??90))throw Object.assign(new Error("batas harian run ini tercapai"),{quota:true});
    if(left!=null&&left<=MIN_LEFT)throw Object.assign(new Error("kuota harian Highlightly hampir habis"),{quota:true});
    const r=await tfetch(BASE+path,{headers:{"x-rapidapi-key":KEY,Accept:"application/json"}});calls++;S.calls.n++;
    const rem=r.headers.get("x-ratelimit-requests-remaining");if(rem!=null)left=Number(rem);
    if(r.status===401||r.status===403)throw Object.assign(new Error("Highlightly menolak key (HTTP "+r.status+")"),{fatal:true});
    if(r.status===429)throw Object.assign(new Error("kuota Highlightly habis (429)"),{quota:true});
    if(!r.ok)throw new Error("HTTP "+r.status+" "+path);
    return r.json();
  }
  const list=j=>Array.isArray(j)?j:(j&&j.data)||[];
  const yr=new Date(now).getUTCFullYear();
  let stop=false;const task=async(name,fn)=>{if(stop)return;try{await fn()}catch(e){errors.push(name+": "+e.message);if(e.fatal||e.quota)stop=true}};

  for(const lg of HL_LEAGUES){
    const key=String(lg.id);
    // 1) seluruh laga musim (jadwal + hasil): tiap 12 jam
    if(!S.season[key]||now-S.season[key].at>12*H)await task("musim "+lg.short,async()=>{
      let all=[];for(let off=0;off<1000;off+=100){const j=await get(`/football/matches?leagueId=${lg.id}&season=${yr}&limit=100&offset=${off}`);const L=list(j);all=all.concat(L);const tc=j&&j.pagination&&j.pagination.totalCount;if(L.length<100||(tc&&all.length>=tc))break}
      if(all.length){S.matches[key]=all.map(x=>({id:x.id,date:x.date,round:x.round,state:x.state,homeTeam:x.homeTeam&&{id:x.homeTeam.id,name:x.homeTeam.name,logo:x.homeTeam.logo},awayTeam:x.awayTeam&&{id:x.awayTeam.id,name:x.awayTeam.name,logo:x.awayTeam.logo},league:x.league&&{logo:x.league.logo}}));S.season[key]={at:now,n:all.length}}
    });
    // 2) laga hari ini (skor live): tiap run bila ada laga Indonesia antara 2 jam sebelum dan 3 jam sesudah kickoff
    const M=S.matches[key]||[],hot=M.some(x=>{const t=Date.parse(x.date);return t-now<2*H&&now-t<3*H&&!FT.test(x.state&&x.state.description||"")});
    if(hot&&(!S.today[key]||now-S.today[key]>20*60e3))await task("hari ini "+lg.short,async()=>{S.today[key]=now;const j=await get(`/football/matches?leagueId=${lg.id}&date=${today}&timezone=Asia/Makassar&limit=50`);const byId=new Map(M.map(x=>[x.id,x]));for(const x of list(j)){const o=byId.get(x.id);if(o){o.state=x.state;o.date=x.date}else M.push(x)}});
    // 3) klasemen: tiap 6 jam
    if(!S.stand[key]||now-S.stand[key]>6*H)await task("klasemen "+lg.short,async()=>{const j=await get(`/football/standings?leagueId=${lg.id}&season=${yr}`);const rows=mapStandings(j,lg);if(rows.length){S.tables[key]=rows;S.stand[key]=now}});
  }
  // 4) detail (prediksi, kejadian, statistik): laga 48 jam ke depan sekali per 12 jam; laga live tiap run; laga selesai sekali
  const recsRaw=[];for(const lg of HL_LEAGUES)for(const x of (S.matches[String(lg.id)]||[]))recsRaw.push([x,lg]);
  const want=recsRaw.filter(([x])=>{const t=Date.parse(x.date),st=stOf(x.state&&x.state.description),d=S.det[x.id];
    if(st==="LIVE")return!d||now-d.at>40*60e3;if(st==="NS"&&t-now<48*H&&t>now-3*H)return!d||now-d.at>12*H;if(st==="FT"&&now-t<36*H)return!d||d.st!=="FT";return false})
    .sort((a,b)=>Math.abs(Date.parse(a[0].date)-now)-Math.abs(Date.parse(b[0].date)-now)).slice(0,Number(process.env.HL_MAX_DETAIL??12));
  for(const [x] of want)await task("detail "+x.id,async()=>{const j=await get(`/football/matches/${x.id}`);const det=Array.isArray(j)?j[0]:(j&&j.data?(Array.isArray(j.data)?j.data[0]:j.data):j);if(det){S.det[x.id]={at:now,st:stOf(det.state&&det.state.description),pred:predOf(det),raw:mapDetail(det,{hid:x.homeTeam&&x.homeTeam.id,eid:"hl"+x.id,status:stOf(det.state&&det.state.description)})}}});
  for(const k of Object.keys(S.det)){const x=recsRaw.find(([m])=>String(m.id)===k);if(!x||now-Date.parse(x[0].date)>10*DAY)delete S.det[k]}

  // ---- susun keluaran ----
  const allPath=dir+"all.json";let all={matches:[],errors:[]};try{all=JSON.parse(readFileSync(allPath,"utf8"))}catch(e){}
  all.matches=(all.matches||[]).filter(m=>m.src!=="HL");
  const W=all.week||[new Date(now-2*DAY+WITA).toISOString().slice(0,10),new Date(now+7*DAY+WITA).toISOString().slice(0,10)];
  const out=[];
  for(const lg of HL_LEAGUES){
    const M=S.matches[String(lg.id)]||[];
    const fin=M.map(x=>({t:Date.parse(x.date),h:x.homeTeam&&x.homeTeam.id,a:x.awayTeam&&x.awayTeam.id,s:scoreOf(x.state),st:stOf(x.state&&x.state.description)})).filter(m=>m.st==="FT"&&m.s[0]!=null).map(m=>({t:m.t,h:m.h,a:m.a,gh:m.s[0],ga:m.s[1]})).sort((a,b)=>a.t-b.t);
    const model=fin.length?{m:fit(fin,now),n:fin.length}:null;
    for(const x of M){const d=new Date(Date.parse(x.date)+WITA).toISOString().slice(0,10);if(d<W[0]||d>W[1])continue;
      const det=S.det[x.id],r=toRec(x,lg,det&&det.pred,model);if(!r)continue;if(det&&det.raw){r.dx=1;const raw={...det.raw,status:r.status};writeFileSync(dir+"m/"+r.eid+".json",JSON.stringify(raw))}out.push(r)}
    const rows=S.tables[String(lg.id)];
    if(rows&&rows.length){writeFileSync(dir+"lg/hl"+lg.id+".json",JSON.stringify({id:"hl"+lg.id,name:lg.name,country:"Indonesia",season:{name:String(yr)},grouped:false,standings:rows,groups:null,zones:null,top:{},updated:new Date(S.stand[String(lg.id)]).toISOString(),src:"Highlightly"}))}
  }
  all.matches=all.matches.concat(out).sort((a,b)=>a.utc.localeCompare(b.utc));
  all.hl={calls,left,leagues:HL_LEAGUES.length,matches:out.length,withPred:out.filter(m=>!m.np).length,errors};
  if(errors.length)all.errors=(all.errors||[]).concat(errors.slice(0,5).map(e=>"Highlightly: "+e));
  writeFileSync(allPath,JSON.stringify(all));
  // leagues.json: tambahkan liga Indonesia di urutan teratas
  let li={leagues:[]};try{li=JSON.parse(readFileSync(dir+"leagues.json","utf8"))}catch(e){}
  li.leagues=(li.leagues||[]).filter(l=>!String(l.id).startsWith("hl"));
  for(const lg of HL_LEAGUES.slice().reverse())if(existsSync(dir+"lg/hl"+lg.id+".json"))li.leagues.unshift({id:"hl"+lg.id,name:lg.name,country:"Indonesia",n:(S.tables[String(lg.id)]||[]).length});
  li.updated=new Date(now).toISOString();writeFileSync(dir+"leagues.json",JSON.stringify(li));
  // m/index.json: tambahkan id detail Indonesia
  let mi={ids:[]};try{mi=JSON.parse(readFileSync(dir+"m/index.json","utf8"))}catch(e){}
  mi.ids=(mi.ids||[]).filter(i=>!String(i).startsWith("hl")).concat(out.filter(m=>m.dx).map(m=>m.eid));writeFileSync(dir+"m/index.json",JSON.stringify(mi));
  // evaluasi: catat juga prediksi liga Indonesia
  try{let hist=[];try{hist=JSON.parse(readFileSync(dir+"bsd-history.json","utf8"))}catch(e){}
    hist=updateHistory(hist,out,now);writeFileSync(dir+"bsd-history.json",JSON.stringify(hist));writeFileSync(dir+"bsd-eval.json",JSON.stringify({updated:new Date(now).toISOString(),...evalHistory(hist)}))}catch(e){errors.push("evaluasi: "+e.message)}
  // simpan status (tanpa data mentah yang besar)
  writeFileSync(dir+"hl.json",JSON.stringify(S));
  if(errors.length)ghWarn("highlightly: "+errors.join(" ; "));
  console.log("OK highlightly:",out.length,"laga Indonesia,",all.hl.withPred,"berprediksi;",calls,"permintaan run ini; sisa kuota",left,"; hari ini",S.calls.n,"; error",errors.length);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
