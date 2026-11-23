// V14: Liga Indonesia (Liga 1 + Liga 2) dari Highlightly (paket gratis, 100 permintaan/hari).
// Berjalan SETELAH bsd.mjs: menggabungkan laga Indonesia ke all.json, klasemen ke leagues.json + lg/hl<id>.json,
// detail laga ke m/hl<id>.json, dan prediksi ke catatan evaluasi (bsd-history.json / bsd-eval.json).
// Hemat kuota: setiap tugas punya jadwal sendiri; status terakhir disimpan di hl.json (dibawa dari situs tayang).
// Tidak pernah menggagalkan deploy.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {tfetch,cleanKey,outDir,siteBase,ghWarn,sleep,readPrev,readState,writeState,stateDir} from "./net.mjs";
import {fit,predictM,level,r1} from "./lib.mjs";
import {updateHistory,evalHistory,evalMove,evalRisk,evalBL,recapOf,evalMiss} from "./bsd.mjs";

// V14.1 (20 Nov 2026): + 2 liga yang tidak ada di BSD (dicek di paket gratis: laga, prediksi, klasemen tersedia).
// Liga tambahan (extra) memakai sisa kuota: disegarkan lebih jarang dan berhenti bila pemakaian hari ini sudah >= HL_EXTRA_CAP,
// supaya liga Indonesia selalu kebagian.
export const HL_LEAGUES=[{id:233958,name:"Liga 1 Indonesia",short:"Liga 1",country:"Indonesia"},{id:234809,name:"Liga 2 Indonesia",short:"Liga 2",noTable:true,country:"Indonesia"},
  {id:102904,name:"1st Division Denmark",short:"Denmark 1",country:"Denmark",extra:true},{id:159070,name:"Ligue 1 Algeria",short:"Algeria 1",country:"Algeria",extra:true},
  // V27 (23 Nov 2026): Asia Tenggara. Kuota Minggu (hari tersibuk Liga 1/2) 55/100, jadi ada ruang. Tetap "extra": berhenti bila hari ini >= HL_EXTRA_CAP.
  {id:252680,name:"Thai League 1",short:"Thailand 1",country:"Thailand",extra:true},
  {id:null,name:"Malaysia Super League",short:"Malaysia 1",country:"Malaysia",extra:true,find:/super\s*league/i,avoid:/women|wanita|u-?2\d|cup|piala|fa\b|charity/i}];
// V27: liga tanpa id dicari sekali lewat /football/leagues?countryName=... (1 permintaan), hasilnya disimpan di hl.json (S.lid).
export function pickLeague(list,lg){const L=(list||[]).filter(x=>x&&x.id&&lg.find.test(x.name||"")&&!(lg.avoid&&lg.avoid.test(x.name||"")));return L.length?L[0].id:null}
// V22d (hemat kuota): musim 24 jam (skor/hasil sudah dari "hari ini"); skor live Indonesia tiap 20 menit HANYA selama laga berjalan
// (bukan lagi sejak 2 jam sebelum kickoff); liga tambahan tiap 60 menit; hasil laga yang belum tercatat diambil setelah laga mestinya selesai;
// klasemen saat ada laga yang baru selesai (atau 24 jam sekali); detail laga tidak lagi diambil tiap 40 menit selama live.
const EVERY={season:24,today:20,stand:24},EVERY_X={season:24,today:60,stand:24};
const LATE_EVERY=45,LATE_TRIES=3;
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
// V22c: model Poisson + Elo cadangan. model = dari semua hasil sampai sekarang (untuk laga yang belum mulai);
// at(t) = dari laga SEBELUM kickoff t saja, untuk laga yang sudah mulai/selesai (sebelumnya kartu laga selesai ikut "tahu" hasilnya).
export function kickModels(fin,now){
  const model=fin.length?{m:fit(fin,now),n:fin.length}:null,C=new Map();
  return{model,at:t=>{if(!fin.length||!(t<now))return model;const k=Math.floor(t/6e4);if(!C.has(k)){const mm=fit(fin,t);C.set(k,{m:mm,n:mm.n})}return C.get(k)}};
}
// V22d: laga yang perlu skor "hari ini". live = jam mulai lewat (sejak 10 menit sebelumnya) s.d. 150 menit setelah kickoff, belum selesai;
// late = lewat 150 menit s.d. 36 jam tapi belum tercatat selesai (mis. kuota sempat habis), maksimal LATE_TRIES kali per laga.
export const witaDate=t=>new Date(t+WITA).toISOString().slice(0,10);
export function hotOf(M,now,lt={}){const live=[],late=[];
  for(const x of M||[]){const t=Date.parse(x.date);if(Number.isNaN(t)||FT.test(x.state&&x.state.description||"")||/postpon|cancel|abandon/i.test(x.state&&x.state.description||""))continue;
    if(now>=t-10*60e3&&now-t<150*60e3)live.push(x);else if(now-t>=150*60e3&&now-t<36*H&&(lt[x.id]||0)<LATE_TRIES)late.push(x)}
  return{live,late}}
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
  // cari semua baris klasemen (objek ber-"team") di mana pun letaknya; nama grup dari induk terdekat yang punya "name"
  const g=[];(function walk(o,name){if(!o||typeof o!=="object")return;if(Array.isArray(o)){const rows=o.filter(x=>x&&typeof x==="object"&&x.team&&(x.points!=null||x.position!=null||x.home||x.total));if(rows.length)g.push({name,standings:rows});else o.forEach(x=>walk(x,name));return}
    for(const k of Object.keys(o))walk(o[k],typeof o.name==="string"?o.name:name)})(j,lg.name);
  const rows=[];
  for(const grp of g)for(const s of (grp.standings||[])){
    const tot=s.total||{},hm=s.home||{},aw=s.away||{},add=k=>(tot[k]??((hm[k]||0)+(aw[k]||0)));
    const gf=add("scoredGoals"),ga=add("receivedGoals");
    rows.push({position:s.position??s.rank??rows.length+1,team_id:"hl"+(s.team&&s.team.id),logo:s.team&&s.team.logo,team_name:s.team&&s.team.name||"?",played:add("games"),won:add("wins"),drawn:add("draws"),lost:add("loses"),gf,ga,gd:gf-ga,pts:s.points??(add("wins")*3+add("draws")),xgd:null,form:"",zone:null,grp:grp.name});
  }
  const multi=new Set(rows.map(r=>r.grp)).size>1;rows.sort((a,b)=>multi?String(a.grp).localeCompare(String(b.grp))||a.position-b.position:a.position-b.position);
  return rows;
}
// Klasemen dihitung sendiri dari hasil laga (dipakai bila Highlightly tidak memberi klasemen, mis. Liga 2).
// Grup = kelompok tim yang saling bertanding (Liga 2 dibagi 2 grup); poin 3/1/0; urut poin, selisih gol, gol.
export function tableFromResults(M){
  const fin=M.filter(x=>stOf(x.state&&x.state.description)==="FT").map(x=>({t:Date.parse(x.date),h:x.homeTeam,a:x.awayTeam,s:scoreOf(x.state)})).filter(x=>x.h&&x.a&&x.s[0]!=null).sort((a,b)=>a.t-b.t);
  const T=new Map(),par=new Map(),find=k=>{while(par.get(k)!==k)k=par.get(k);return k};
  const row=t=>{if(!T.has(t.id)){T.set(t.id,{team_id:"hl"+t.id,logo:t.logo,team_name:t.name,played:0,won:0,drawn:0,lost:0,gf:0,ga:0,res:[]});par.set(t.id,t.id)}return T.get(t.id)};
  for(const m of fin){const H=row(m.h),A=row(m.a),[g1,g2]=m.s;H.played++;A.played++;H.gf+=g1;H.ga+=g2;A.gf+=g2;A.ga+=g1;
    if(g1>g2){H.won++;A.lost++;H.res.push("W");A.res.push("L")}else if(g1<g2){A.won++;H.lost++;A.res.push("W");H.res.push("L")}else{H.drawn++;A.drawn++;H.res.push("D");A.res.push("D")}
    const ra=find(m.h.id),rb=find(m.a.id);if(ra!==rb)par.set(ra,rb)}
  const groups={};for(const [id,r] of T){const g=find(id);(groups[g]=groups[g]||[]).push(r)}
  const keys=Object.keys(groups).sort((a,b)=>groups[b].length-groups[a].length),out=[];
  keys.forEach((k,gi)=>{const L=groups[k].map(r=>({...r,gd:r.gf-r.ga,pts:r.won*3+r.drawn,form:r.res.slice(-5).reverse().join(""),xgd:null,zone:null,grp:keys.length>1?"Grup "+String.fromCharCode(65+gi):null}));
    L.sort((a,b)=>b.pts-a.pts||b.gd-a.gd||b.gf-a.gf||a.team_name.localeCompare(b.team_name));L.forEach((r,i)=>{r.position=i+1;delete r.res;out.push(r)})});
  return out;
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
  // V19: status Highlightly = data internal (STATE_DIR, tidak tayang); file tayang lain dari keluaran run sebelumnya
  const pull=async f=>{if(process.env.HL_STATE_FILE&&f==="hl.json"){try{return JSON.parse(readFileSync(process.env.HL_STATE_FILE,"utf8"))}catch(e){return null}}return f==="hl.json"?readState(f):readPrev(f)};
  const S0=await pull("hl.json"),S=S0||{};S.season=S.season||{};S.stand=S.stand||{};S.det=S.det||{};S.matches=S.matches||{};S.tables=S.tables||{};S.calls=S.calls||{};S.today=S.today||{};S.lt=S.lt||{};
  // V19.1: hitungan harian mengikuti reset kuota Highlightly (00.00 UTC = 08.00 WITA), bukan tengah malam WITA.
  // Sebelumnya permintaan yang ditolak 429 antara 00.00-08.00 WITA ikut terhitung untuk "hari ini" sehingga setelah kuota pulih skrip mengira jatah sudah habis.
  const today=new Date(now).toISOString().slice(0,10);if(S.calls.day!==today||S.calls.v!==2)S.calls={day:today,n:0,v:2};   // v2: hitungan lama (salah zona waktu) dibuang sekali
  let left=null,calls=0;const errors=[];
  async function get(path){
    if(S.calls.n>=Number(process.env.HL_DAY_CAP??90))throw Object.assign(new Error("batas harian run ini tercapai"),{quota:true});
    if(left!=null&&left<=MIN_LEFT)throw Object.assign(new Error("kuota harian Highlightly hampir habis"),{quota:true});
    const r=await tfetch(BASE+path,{headers:{"x-rapidapi-key":KEY,Accept:"application/json"}});calls++;S.calls.n++;
    const rem=r.headers.get("x-ratelimit-requests-remaining");if(rem!=null)left=Number(rem);
    if(r.status===401||r.status===403)throw Object.assign(new Error("Highlightly menolak key (HTTP "+r.status+")"),{fatal:true});
    if(r.status===429){S.calls.n--;throw Object.assign(new Error("kuota Highlightly habis (429)"),{quota:true})}   // ditolak = tidak memakai kuota
    if(!r.ok)throw new Error("HTTP "+r.status+" "+path);
    return r.json();
  }
  const list=j=>Array.isArray(j)?j:(j&&j.data)||[];
  const yr=new Date(now).getUTCFullYear();
  let stop=false;const task=async(name,fn)=>{if(stop)return;try{await fn()}catch(e){errors.push(name+": "+e.message);if(e.fatal||e.quota)stop=true}};

  const XCAP=Number(process.env.HL_EXTRA_CAP??60),only=(process.env.HL_ONLY||"").split(",").filter(Boolean);
  S.lid=S.lid||{};
  for(const lg of HL_LEAGUES)if(!lg.id&&lg.find&&!S.lid[lg.name]&&!(S.lidMiss&&S.lidMiss[lg.name]&&now-S.lidMiss[lg.name]<7*DAY))await task("cari id "+lg.short,async()=>{
    const j=await get(`/football/leagues?countryName=${encodeURIComponent(lg.country)}&limit=100`);const id=pickLeague(list(j),lg);
    if(id)S.lid[lg.name]=id;else{S.lidMiss=S.lidMiss||{};S.lidMiss[lg.name]=now;console.log("liga "+lg.name+" tidak ditemukan di Highlightly; dicoba lagi 7 hari lagi")}});
  const LGS=HL_LEAGUES.map(lg=>lg.id?lg:{...lg,id:S.lid[lg.name]||null}).filter(lg=>lg.id&&(!only.length||only.includes(String(lg.id))));
  for(const lg of LGS){
    const key=String(lg.id),E=lg.extra?EVERY_X:EVERY;
    if(lg.extra&&S.calls.n>=XCAP){console.log("liga tambahan "+lg.short+" dilewati run ini: kuota hari ini dihemat untuk liga Indonesia");continue}
    // 1) seluruh laga musim (jadwal + hasil): tiap 12 jam
    // musim yang melewati pergantian tahun (mis. 2026/27): bila musim tahun ini kosong, pakai musim tahun sebelumnya
    if(!S.season[key]||now-S.season[key].at>E.season*H)await task("musim "+lg.short,async()=>{
      let all=[],sy=yr;for(const y of [yr,yr-1]){all=[];for(let off=0;off<1000;off+=100){const j=await get(`/football/matches?leagueId=${lg.id}&season=${y}&limit=100&offset=${off}`);const L=list(j);all=all.concat(L);const tc=j&&j.pagination&&j.pagination.totalCount;if(L.length<100||(tc&&all.length>=tc))break}
        if(all.length){sy=y;break}}
      if(all.length){S.matches[key]=all.map(x=>({id:x.id,date:x.date,round:x.round,state:x.state,homeTeam:x.homeTeam&&{id:x.homeTeam.id,name:x.homeTeam.name,logo:x.homeTeam.logo},awayTeam:x.awayTeam&&{id:x.awayTeam.id,name:x.awayTeam.name,logo:x.awayTeam.logo},league:x.league&&{logo:x.league.logo}}));S.season[key]={at:now,n:all.length,yr:sy}}
    });
    // 2) laga hari ini (skor live): selama laga berjalan (Indonesia tiap 20 menit, tambahan tiap 60 menit) + hasil yang belum tercatat
    const M=S.matches[key]||[],{live,late}=hotOf(M,now,S.lt),last=S.today[key]||0;
    const needLive=live.length&&now-last>E.today*60e3,needLate=late.length&&now-last>LATE_EVERY*60e3;
    if(needLive||needLate)await task("hari ini "+lg.short,async()=>{S.today[key]=now;const use=[...live,...late];
      for(const x of late)S.lt[x.id]=(S.lt[x.id]||0)+1;   // laga yang mestinya sudah selesai: maksimal LATE_TRIES kali (mis. ditunda)
      const byId=new Map(M.map(x=>[x.id,x]));
      for(const d of [...new Set(use.map(x=>witaDate(Date.parse(x.date))))]){const j=await get(`/football/matches?leagueId=${lg.id}&date=${d}&timezone=Asia/Makassar&limit=50`);
        for(const x of list(j)){const o=byId.get(x.id);if(o){o.state=x.state;o.date=x.date}else{M.push(x);byId.set(x.id,x)}}}});
    // 3) klasemen: setelah ada laga yang selesai, atau 24 jam sekali
    if(!lg.noTable&&(!S.stand[key]||now-S.stand[key]>E.stand*H||M.some(x=>{const e=Date.parse(x.date)+105*60e3;return FT.test(x.state&&x.state.description||"")&&e>S.stand[key]&&e<now})))await task("klasemen "+lg.short,async()=>{const j=await get(`/football/standings?leagueId=${lg.id}&season=${(S.season[key]&&S.season[key].yr)||yr}`);const rows=mapStandings(j,lg);if(rows.length){S.tables[key]=rows;S.stand[key]=now;S.calc=S.calc||{};delete S.calc[key]}else{S.stand[key]=now+18*H;S.calc=S.calc||{};S.calc[key]=1;console.log("klasemen "+lg.short+" tidak disediakan Highlightly; dihitung sendiri dari hasil laga.")}});
  }
  // 4) detail (prediksi, kejadian, statistik): laga 48 jam ke depan (lebih sering <6 jam sebelum kickoff); laga selesai sekali; tidak selama live
  const recsRaw=[];for(const lg of LGS)for(const x of (S.matches[String(lg.id)]||[]))recsRaw.push([x,lg]);
  const want=recsRaw.filter(([x,lg])=>{const t=Date.parse(x.date),st=stOf(x.state&&x.state.description),d=S.det[x.id];
    if(lg.extra&&(S.calls.n>=XCAP||(st==="NS"&&t-now>24*H)))return false;
    if(st==="LIVE")return false;   // V22d: skor live dari "hari ini"; statistik lengkap diambil sekali setelah selesai
    if(st==="NS"&&t-now<48*H&&t>now-3*H)return!d||now-d.at>(t-now<6*H?6*H:24*H);if(st==="FT"&&now-t<36*H)return!d||d.st!=="FT";return false})
    .sort((a,b)=>(a[1].extra?1:0)-(b[1].extra?1:0)||Math.abs(Date.parse(a[0].date)-now)-Math.abs(Date.parse(b[0].date)-now)).slice(0,Number(process.env.HL_MAX_DETAIL??12));
  for(const [x] of want)await task("detail "+x.id,async()=>{const j=await get(`/football/matches/${x.id}`);const det=Array.isArray(j)?j[0]:(j&&j.data?(Array.isArray(j.data)?j.data[0]:j.data):j);if(det){S.det[x.id]={at:now,st:stOf(det.state&&det.state.description),pred:predOf(det),raw:mapDetail(det,{hid:x.homeTeam&&x.homeTeam.id,eid:"hl"+x.id,status:stOf(det.state&&det.state.description)})}}});
  for(const k of Object.keys(S.det)){const x=recsRaw.find(([m])=>String(m.id)===k);if(!x||now-Date.parse(x[0].date)>10*DAY)delete S.det[k]}
  for(const k of Object.keys(S.lt)){const x=recsRaw.find(([m])=>String(m.id)===k);if(!x||now-Date.parse(x[0].date)>2*DAY||FT.test(x[0].state&&x[0].state.description||""))delete S.lt[k]}

  // ---- susun keluaran ----
  const allPath=dir+"all.json";let all={matches:[],errors:[]};try{all=JSON.parse(readFileSync(allPath,"utf8"))}catch(e){}
  all.matches=(all.matches||[]).filter(m=>m.src!=="HL");
  const W=all.week||[new Date(now-2*DAY+WITA).toISOString().slice(0,10),new Date(now+7*DAY+WITA).toISOString().slice(0,10)];
  const out=[];
  for(const lg of LGS){
    const M=S.matches[String(lg.id)]||[];
    const fin=M.map(x=>({t:Date.parse(x.date),h:x.homeTeam&&x.homeTeam.id,a:x.awayTeam&&x.awayTeam.id,s:scoreOf(x.state),st:stOf(x.state&&x.state.description)})).filter(m=>m.st==="FT"&&m.s[0]!=null).map(m=>({t:m.t,h:m.h,a:m.a,gh:m.s[0],ga:m.s[1]})).sort((a,b)=>a.t-b.t);
    const {model,at:modelAt}=kickModels(fin,now);
    for(const x of M){const d=new Date(Date.parse(x.date)+WITA).toISOString().slice(0,10);if(d<W[0]||d>W[1])continue;
      const started=stOf(x.state&&x.state.description)!=="NS";
      const det=S.det[x.id],r=toRec(x,lg,det&&det.pred,started?modelAt(Date.parse(x.date)):model);if(!r)continue;if(det&&det.raw){r.dx=1;const raw={...det.raw,status:r.status};writeFileSync(dir+"m/"+r.eid+".json",JSON.stringify(raw))}out.push(r)}
    // klasemen dari Highlightly; bila tidak tersedia (mis. Liga 2) dihitung sendiri dari hasil laga
    const api=S.tables[String(lg.id)],calc=(S.calc&&S.calc[String(lg.id)])||!(api&&api.length);const rows=calc?tableFromResults(M):api;
    if(rows&&rows.length){writeFileSync(dir+"lg/hl"+lg.id+".json",JSON.stringify({id:"hl"+lg.id,name:lg.name,country:lg.country,season:{name:String((S.season[String(lg.id)]&&S.season[String(lg.id)].yr)||yr)},grouped:new Set(rows.map(r=>r.grp)).size>1,standings:new Set(rows.map(r=>r.grp)).size>1?[]:rows,groups:new Set(rows.map(r=>r.grp)).size>1?rows.reduce((o,r)=>{(o[r.grp]=o[r.grp]||[]).push(r);return o},{}):null,zones:null,top:{},updated:new Date(calc?now:(S.stand[String(lg.id)]||now)).toISOString(),src:calc?"dihitung Bola Live dari hasil laga Highlightly":"Highlightly"}))}
  }
  all.matches=all.matches.concat(out).sort((a,b)=>a.utc.localeCompare(b.utc));
  all.hl={calls,left,leagues:LGS.length,matches:out.length,withPred:out.filter(m=>!m.np).length,errors};
  if(errors.length)all.errors=(all.errors||[]).concat(errors.slice(0,5).map(e=>"Highlightly: "+e));
  writeFileSync(allPath,JSON.stringify(all));
  // leagues.json: tambahkan liga Indonesia di urutan teratas
  let li={leagues:[]};try{li=JSON.parse(readFileSync(dir+"leagues.json","utf8"))}catch(e){}
  li.leagues=(li.leagues||[]).filter(l=>!String(l.id).startsWith("hl"));
  for(const lg of LGS.slice().reverse())if(existsSync(dir+"lg/hl"+lg.id+".json"))li.leagues.unshift({id:"hl"+lg.id,name:lg.name,country:lg.country,n:(S.tables[String(lg.id)]||[]).length});
  li.updated=new Date(now).toISOString();writeFileSync(dir+"leagues.json",JSON.stringify(li));
  // m/index.json: tambahkan id detail Indonesia
  let mi={ids:[]};try{mi=JSON.parse(readFileSync(dir+"m/index.json","utf8"))}catch(e){}
  mi.ids=(mi.ids||[]).filter(i=>!String(i).startsWith("hl")).concat(out.filter(m=>m.dx).map(m=>m.eid));writeFileSync(dir+"m/index.json",JSON.stringify(mi));
  // evaluasi: catat juga prediksi liga Indonesia
  try{let hist=null;const SD=stateDir();try{hist=JSON.parse(readFileSync((SD||dir)+"bsd-history.json","utf8"))}catch(e){}
    if(!Array.isArray(hist)){const h=await readState("bsd-history.json");hist=Array.isArray(h)?h:null}   // V19: jangan mulai dari kosong bila skrip BSD gagal lebih dulu
    if(!hist)throw new Error("riwayat prediksi tidak terbaca; dilewati supaya riwayat lama tidak tertimpa");
    hist=updateHistory(hist,out,now);writeState("bsd-history.json",hist,{dir});writeFileSync(dir+"bsd-eval.json",JSON.stringify({updated:new Date(now).toISOString(),...evalHistory(hist),move:evalMove(hist),risk:evalRisk(hist),bl:evalBL(hist),rk:recapOf(hist,now),miss:evalMiss(hist,now)}))}catch(e){errors.push("evaluasi: "+e.message)}
  // simpan status (tanpa data mentah yang besar)
  // V19 (audit): status lama yang gagal dibaca tidak ditimpa status kosong (penyebab hl.json hilang 20 Nov: baca gagal + kuota habis)
  if(!S0&&!Object.keys(S.matches).length)errors.push("status hl.json tidak terbaca dan tidak ada data baru; status lama tidak ditimpa");
  else if(process.env.HL_STATE_FILE||!stateDir())writeFileSync(dir+"hl.json",JSON.stringify(S));else writeState("hl.json",S,{dir});
  if(errors.length)ghWarn("highlightly: "+errors.join(" ; "));
  console.log("OK highlightly:",out.length,"laga Indonesia,",all.hl.withPred,"berprediksi;",calls,"permintaan run ini; sisa kuota",left,"; hari ini",S.calls.n,"; error",errors.length);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
