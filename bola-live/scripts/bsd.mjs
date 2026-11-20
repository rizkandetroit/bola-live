import {mkdirSync,writeFileSync,readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {sleep,tfetch,cleanKey,outDir,overDeadline,ghWarn,siteBase,readPrev,readState,writeState,stateDir} from "./net.mjs";
import {fitModel,predictModel,rollingBacktest,score,bestBlend,addTimes,probs,regulars,missingCore,adjustL,CORE,DEF,temper,bestTemp,tablesAt,tableTest,luckOf,strengthRanks} from "./model.mjs";
import {factorTests,EU_RE} from "./factors.mjs";
import {ingest as psIngest,compact as psCompact,teamSummary,valueOf,playerQuality,xiRatio,xiFromStats} from "./players.mjs";
import {level,r1} from "./lib.mjs";

// SUMBER UTAMA SEMUA LIGA: BSD (sports.bzzoiro.com, Football API paket gratis, 7.500 permintaan/hari).
// Satu langkah ini menggantikan API-Football (jadwal), SportAPI (jadwal + riwayat), H2H API-Football, H2H FotMob
// dan TheSportsDB. Hasilnya ditulis ke site/all.json dengan format yang sama seperti sebelumnya, jadi dasbor tidak berubah bentuk.
//  - jadwal + skor + status live + H2H datang dari /events/ (H2H sudah tertanam di tiap laga, tanpa permintaan tambahan);
//  - peluang menang, xG, over 2,5, BTTS datang dari /predictions/ (model BSD);
//  - nama liga dari /leagues/ (laga dari /events/ hanya membawa league_id);
//  - logo liga dan klub: https://sports.bzzoiro.com/img/league|team/{id}/ (tanpa token, boleh di-hotlink).
// Laga yang sudah dimodelkan sendiri oleh update.mjs (football-data.org, data.json) tidak digandakan.
// Tidak pernah menggagalkan deploy (di workflow: continue-on-error).

const IMG="https://sports.bzzoiro.com/img";
// Dokumen BSD menulis upcoming/live/finished, tetapi data nyata memakai notstarted/inprogress/1st_half/halftime/2nd_half.
const LIVE=new Set(["live","inprogress","1st_half","2nd_half","halftime","extra_time","extratime","penalties","break","awaiting_extra_time","awaiting_penalties"]);
export const stOf=raw=>{const r=String(raw||"").toLowerCase();return LIVE.has(r)?"LIVE":(r==="notstarted"||r==="upcoming")?"NS":r==="finished"?"FT":null};
export const pickOf=v=>({h:"h",home:"h",a:"a",away:"a"})[String(v||"").toLowerCase()]||null;

// H2H tertanam di tiap laga: dipetakan ke bentuk yang dibaca dasbor ({n,hW,d,aW,gf,ga,last}). Orientasi mengikuti laga yang diminta.
export function h2hOf(h){
  if(!h||!h.total_matches)return null;
  const last=(h.recent_matches||[]).slice(0,5)
    .map(m=>({t:String(m.date||"").slice(0,10),l:(m.home||"?")+" vs "+(m.away||"?"),s:[m.home_score,m.away_score]}))
    .filter(x=>x.s[0]!=null&&x.s[1]!=null);
  return{n:h.total_matches,hW:h.home_wins,d:h.draws,aW:h.away_wins,gf:h.home_goals,ga:h.away_goals,last};
}

const num=v=>v==null||v===""||!Number.isFinite(Number(v))?null:Number(v);
export function toRecord(e,pred,leagues){
  const st=stOf(e.status);if(!st)return null;            // dibatalkan / ditunda / tak terselesaikan: tidak ditampilkan
  const t=Date.parse(e.event_date);if(Number.isNaN(t))return null;
  const lg=(leagues&&leagues.get(e.league_id))||{};
  const name=e.league_name||lg.name||("Liga "+e.league_id);
  const base={
    id:"b"+e.id,league:name,lgc:IMG+"/league/"+e.league_id+"/",lc:(lg.country&&(lg.country.name||lg.country))||undefined,utc:new Date(t).toISOString(),status:st,
    score:st==="NS"?[null,null]:[num(e.home_score),num(e.away_score)],
    home:{name:e.home_team,crest:IMG+"/team/"+e.home_team_id+"/"},
    away:{name:e.away_team,crest:IMG+"/team/"+e.away_team_id+"/"},
    src:"BSD"
  };
  if(st==="LIVE"){if(e.period==="halftime"||e.status==="halftime")base.ht=true;else if(num(e.current_minute)!=null)base.min=num(e.current_minute)}
  const h2h=h2hOf(e.head_to_head);if(h2h)base.h2h=h2h;
  // tambahan V12: babak/tahap, skor babak pertama, perpanjangan waktu, adu penalti, id tim & liga (untuk Match Center)
  base.eid=e.id;base.lid=e.league_id;base.hid=e.home_team_id;base.aid=e.away_team_id;
  if(e.round_label)base.rl=e.round_label;
  if(num(e.home_score_ht)!=null&&st!=="NS")base.hts=[num(e.home_score_ht),num(e.away_score_ht)];
  if(e.extra_time_score&&e.extra_time_score.home!=null)base.et=[e.extra_time_score.home,e.extra_time_score.away];
  if(e.penalty_shootout&&e.penalty_shootout.home!=null)base.pen=[e.penalty_shootout.home,e.penalty_shootout.away];
  const m=(pred&&pred.markets)||{},mr=m.match_result||{},h=num(mr.prob_home),d=num(mr.prob_draw),a=num(mr.prob_away);
  if(h==null||d==null||a==null)return{...base,np:true};   // tanpa prediksi BSD: tampil sebagai jadwal saja
  const xg=m.expected_goals||{},ou=num((m.over_under||{}).prob_over_25),bt=num((m.btts||{}).prob_yes);
  const pick=pickOf(mr.predicted)||(h>=a?"h":"a"),edge=r1(Math.abs(h-a)),ms=(m.score||{}).most_likely;
  const bits=["Prediksi model BSD (peluang menang, xG, over/under, BTTS)."];
  if(ms)bits.push("Skor paling mungkin "+ms+".");
  if(pred.model&&pred.model.confidence!=null)bits.push("Keyakinan model "+Math.round(pred.model.confidence*100)+"%.");
  return{...base,
    p:{h,d,a,xg:num(xg.home)!=null&&num(xg.away)!=null?[num(xg.home),num(xg.away)]:null,ou,bt,engine:"bsd"},
    pick,edge,level:level(edge),est:true,tier:2,note:bits.join(" ")};
}

const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\b(fc|cf|afc|sc|ac|club|the)\b/g," ").replace(/[^a-z0-9]/g,"");
const same=(a,b)=>{a=norm(a);b=norm(b);return!!a&&!!b&&(a===b||(Math.min(a.length,b.length)>=4&&(a.includes(b)||b.includes(a))))};
export const isDup=(r,x)=>Math.abs(Date.parse(x.utc)-Date.parse(r.utc))<3*36e5&&same(x.home&&x.home.name,r.home.name)&&same(x.away&&x.away.name,r.away.name);

export function buildAll({events,preds,leagues,own=[],now=Date.now()}){
  const L=new Map((leagues||[]).map(l=>[l.id,l])),P=new Map();
  for(const p of preds||[])if(p.event&&p.event.id!=null)P.set(p.event.id,p);
  const out=[],linked=[];let dup=0,skipped=0;
  for(const e of events||[]){
    const r=toRecord(e,P.get(e.id),L);
    if(!r){skipped++;continue}
    const o=own.find(x=>isDup(r,x));
    if(o){dup++;r.oid=o.id;linked.push(r);continue}   // V12.1: laga model sendiri tetap dapat odds + Match Center BSD
    out.push(r);
  }
  // V13.1: event "hantu" BSD -> laga yang sama (liga sama, tuan rumah & tamu sama) sudah selesai/live dalam 3,5 hari,
  // tapi BSD masih menyisakan event lama berstatus belum mulai. Event belum-mulai itu dibuang,
  // begitu juga event belum-mulai yang kickoff-nya sudah lewat > 3 jam (basi, tak pernah diperbarui BSD).
  const played=out.filter(x=>x.status!=="NS");let ghost=0;
  const isGhost=r=>r.status==="NS"&&(Date.parse(r.utc)<now-3*36e5||played.some(x=>x!==r&&(x.lid??x.league)===(r.lid??r.league)&&
    (x.hid!=null&&r.hid!=null?(x.hid===r.hid&&x.aid===r.aid):(same(x.home.name,r.home.name)&&same(x.away.name,r.away.name)))&&
    Math.abs(Date.parse(x.utc)-Date.parse(r.utc))<=84*36e5));
  const kept=out.filter(r=>isGhost(r)?(ghost++,false):true);
  kept.sort((a,b)=>a.utc.localeCompare(b.utc));
  return{matches:kept,dup,skipped,linked,ghost};
}

// ===================== V12: integrasi penuh BSD (paket Football Unlimited) =====================
// Selain jadwal + prediksi, tiap putaran kini juga mengambil:
//  - harga terbaik per bookmaker (/odds/best/, 1X2 + over/under 2,5 + BTTS) untuk semua laga dalam jendela;
//  - klasemen (dengan zona), top skor, top assist, kartu, untuk setiap liga yang punya laga di jendela -> lg/{id}.json;
//  - Match Center per laga fokus -> m/{id}.json: statistik + shotmap + momentum + xG per menit, line-up (terkonfirmasi/prediksi AI
//    + pemain absen), kejadian, komentar, statistik pemain, odds konsensus + perbandingan bookmaker, Polymarket, prediksi lengkap,
//    metadata (fakta, preview AI, warna kostum), siaran TV, dan form 10 laga kedua tim.
// Mode "light" (tiap 5 menit) hanya menyegarkan laga live / dekat kickoff / baru selesai; sisanya diambil dari situs yang sedang tayang.

export function pickBest(rows){ // /odds/best/ -> Map(event_id -> {h,d,a,o25,u25,by,bn,bt})
  const M=new Map();
  for(const r of rows||[]){
    const o=M.get(r.event_id)||{};
    for(const b of r.best_odds||[]){
      const k=r.market==="1x2"?({HOME:"h",DRAW:"d",AWAY:"a"})[b.outcome]
        :r.market==="over_under_25"?({over:"o25",under:"u25"})[b.outcome]
        :r.market==="btts"?({yes:"by",no:"bn"})[b.outcome]:null;
      if(k&&b.decimal_odds!=null)o[k]={o:b.decimal_odds,b:b.bookmaker_name||b.bookmaker_slug};
    }
    M.set(r.event_id,o);
  }
  return M;
}
export function focusOf(matches,now,light,aheadH=Number(process.env.BSD_FOCUS_H??96)){
  const H=36e5;
  return matches.filter(m=>{
    const t=Date.parse(m.utc);
    if(m.status==="LIVE")return true;
    if(light)return m.status==="NS"?t-now<2*H&&t-now>-3*H:now-t<4*H;
    return m.status==="NS"?t-now<aheadH*H:now-t<20*H;
  });
}
// V19 (audit): grid bookmaker diringkas ke bentuk {pasar:{bookmaker:{hasil:odds}}} yang langsung dibaca tabel Match Center.
// Sebelumnya pasar mentah (semua garis Asian handicap, waktu & arah gerak tiap bookmaker) ~23KB per laga, padahal yang tampil 3 pasar.
const CMP_LAB={HOME:"Tuan rumah",DRAW:"Seri",AWAY:"Tamu",yes:"Ya",no:"Tidak",over:"Over",under:"Under"};
export const trimCmp=c=>{ if(!c||!c.markets)return null;
  const ml=c.main_lines||{},ah=ml.asian_handicap,out={};
  const conv=(k,name,filter)=>{const v=c.markets[k];if(!v||typeof v!=="object"||Array.isArray(v))return;const rows={};let nb=0;
    for(const [ok,o] of Object.entries(v)){if(!o||typeof o!=="object"||(filter&&!filter(o)))continue;
      let lab=CMP_LAB[o.outcome]||o.outcome_name||ok;if(k==="asian_handicap"){const sg=String(o.outcome_name||"").match(/[+-]?\d+(\.\d+)?$/);if(sg)lab+=" "+sg[0]}
      for(const [b,q] of Object.entries(o.bookmakers||{})){const d=q&&(q.decimal_odds??q.odds);if(typeof d==="number"&&d>1){(rows[b]=rows[b]||{})[lab]=d;nb++}}}
    if(nb)out[name]=rows};
  conv("1x2","1X2");conv("over_under_25","Over/Under 2,5");conv("btts","Kedua tim cetak gol");
  if(ah!=null)conv("asian_handicap","Asian handicap",o=>o.line!=null&&Number(o.line)===Number(ah));
  return Object.keys(out).length?{bookmakers_count:c.bookmakers_count,main_lines:{asian_handicap:ah??null,over_under_25:ml.over_under_25??null},markets:out}:null};
// V19 (audit): form tim diringkas ke angka yang ditampilkan (sebelumnya ~25KB statistik mentah per laga)
const fSec=o=>o&&typeof o==="object"?{matches:o.matches,won:o.won,drawn:o.drawn,lost:o.lost,goals_for:o.goals_for,goals_against:o.goals_against,form:o.form,points_per_match:o.points_per_match,
  stats:o.stats?{ball_possession:o.stats.ball_possession?{average:o.stats.ball_possession.average}:undefined,expected_goals:o.stats.expected_goals?{average:o.stats.expected_goals.average}:undefined}:undefined}:null;
export const slimForm=f=>f&&f.overall?{team_id:f.team_id,team_name:f.team_name,overall:fSec(f.overall),home:fSec(f.home),away:fSec(f.away),vs_stronger:fSec(f.vs_stronger),vs_weaker:fSec(f.vs_weaker)}:null;
const slimPS=ps=>(ps&&ps.player_stats||[]).filter(p=>p.minutes_played>0).map(p=>({pid:p.player_id,tid:p.team_id,min:p.minutes_played,r:p.rating,g:p.goals,as:p.goal_assist,xg:p.expected_goals,xa:p.expected_assists,sh:p.total_shots,sot:p.shots_on_target,kp:p.key_pass,pa:p.total_pass,acc:p.accurate_pass,tk:p.won_tackle,int:p.interception,sv:p.saves,yc:p.yellow_card,rc:p.red_card}));

// Value hanya dihitung bila peluang model >= 20%, odds <= 5 dan value >= 2% (tim yang sangat tidak diunggulkan terlalu peka terhadap galat model).
// ===================== V12.2: catatan & evaluasi akurasi prediksi BSD =====================
// Prediksi dicatat (dan diperbarui) sampai kickoff, lalu dikunci. Setelah laga selesai, skor akhir diisi dan dinilai.
const LG=Math.log;
export function updateHistory(hist,matches,now){
  const H=new Map((hist||[]).map(e=>[e.id,e]));
  for(const m of matches){
    if(!m.eid)continue;const t=Date.parse(m.utc),e=H.get(m.eid);
    if(m.status==="NS"&&t>now&&m.p&&!m.np&&m.p.h!=null){
      const v=bestVal(m);
      H.set(m.eid,{id:m.eid,lg:m.league,u:m.utc,h:m.home.name,a:m.away.name,p:[m.p.h,m.p.d,m.p.a],ou:m.p.ou??null,bt:m.p.bt??null,
        o:m.odds?[m.odds.h&&m.odds.h.o,m.odds.d&&m.odds.d.o,m.odds.a&&m.odds.a.o]:(e&&e.o)||null,v:v,r:e&&e.r||null,
        po:(e&&e.po)||(m.pin&&m.pin.o)||null,pc:(m.pin&&m.pin.c)||(e&&e.pc)||null,ab:m.ab?[m.ab.nh,m.ab.na]:(e&&e.ab)||null,bl:m.bl?[m.bl.h,m.bl.d,m.bl.a]:(e&&e.bl)||null,lu:m.bl&&m.bl.lu?m.bl.lu:(e&&e.lu)||null});
    }
    if(e&&!e.r&&m.status==="FT"&&m.score[0]!=null&&m.score[1]!=null)e.r=[m.score[0],m.score[1]];
  }
  for(const [k,e] of H){const t=Date.parse(e.u);if((!e.r&&t<now-3*864e5)||t<now-120*864e5)H.delete(k)}   // tanpa hasil >3 hari / >120 hari: buang
  return [...H.values()].sort((a,b)=>a.u.localeCompare(b.u)).slice(-6000);
}
function bestVal(m){if(!m.odds||!m.p)return null;let b=null;[[0,m.p.h,m.odds.h],[1,m.p.d,m.odds.d],[2,m.p.a,m.odds.a]].forEach(([k,p,o])=>{if(p==null||!o||!o.o||p<20||o.o>5)return;const v=p/100*o.o-1;if(v<.02)return;if(!b||v>b[1])b=[k,Math.round(v*1000)/1000,o.o]});return b}
// V13.4: harga 1X2 Pinnacle (bandar paling tajam) dari /odds/: harga buka (opening_decimal_odds, dicatat BSD sejak pertama terlihat)
// dan harga pra-laga terakhir. Baris in-play (is_live) diabaikan. Hasil: Map(event_id -> {o:[h,d,a], c:[h,d,a]}).
export function pinOf(rows){
  const M=new Map(),K={HOME:0,DRAW:1,AWAY:2};
  for(const r of rows||[]){const id=r.event_id??(r.event&&typeof r.event==="object"?r.event.id:r.event);const k=K[String(r.outcome||"").toUpperCase()];
    if(id==null||k==null||r.is_live===true)continue;const o=num(r.opening_decimal_odds),c=num(r.decimal_odds);
    const x=M.get(id)||{o:[null,null,null],c:[null,null,null]};if(o>1)x.o[k]=o;if(c>1)x.c[k]=c;M.set(id,x)}
  for(const [id,x] of M)if(!x.o.every(v=>v>1)||!x.c.every(v=>v>1))M.delete(id);
  return M;
}
export const devig=o=>{if(!o||!o.every(x=>x>1))return null;const q=o.map(x=>1/x),t=q[0]+q[1]+q[2];return q.map(x=>x/t*100)};
// Penilaian pergerakan harga: apakah harga tutup lebih tepat dari harga buka, dan apakah arah pergerakan memberi sinyal.
export function evalMove(hist,minMove=3){
  const R=(hist||[]).filter(e=>e.r&&e.po&&e.pc),z=()=>({n:0,hit:0,br:0});
  const add=(s,p,o)=>{s.n++;if(p.indexOf(Math.max(...p))===o)s.hit++;s.br+=p.reduce((a,x,i)=>a+(x/100-(i===o?1:0))**2,0)};
  const op=z(),cl=z(),bs=z(),mv={n:0,hit:0,imp:0,impO:0},W=[0,.1,.2,.3,.4,.5,.6,.7,.8,.9,1].map(w=>({w,s:z()}));
  for(const e of R){const a=devig(e.po),b=devig(e.pc);if(!a||!b)continue;const o=e.r[0]>e.r[1]?0:e.r[0]===e.r[1]?1:2;
    add(op,a,o);add(cl,b,o);if(e.p){add(bs,e.p,o);for(const q of W)add(q.s,mixP(e.p,b,q.w),o)}
    const d=b.map((x,i)=>x-a[i]),k=d.indexOf(Math.max(...d));           // hasil yang paling "dibeli" pasar
    if(d[k]>=minMove){mv.n++;if(k===o)mv.hit++;mv.imp+=b[k];mv.impO+=a[k]}}
  const f=s=>s.n?{n:s.n,acc:s.hit/s.n*100,brier:s.br/s.n}:null;
  const best=W.filter(q=>q.s.n).sort((x,y)=>x.s.br-y.s.br)[0],m50=W[5].s;
  const mix=best?{n:best.s.n,w:best.w,best:f(best.s),half:f(m50),ok:best.s.n>=300&&bs.n>0&&best.s.br/best.s.n<bs.br/bs.n-.002&&best.w<1}:null;
  return{n:op.n,open:f(op),close:f(cl),bsd:f(bs),mix,moved:mv.n?{n:mv.n,minMove,hit:mv.hit/mv.n*100,closeImp:mv.imp/mv.n,openImp:mv.impO/mv.n}:{n:0,minMove},
    pending:(hist||[]).filter(e=>!e.r&&e.po).length};
}
// V13.5: pemain absen dari /events/{id}/lineups/ (unavailable_players) -> ringkas untuk kartu: {h:[[nama,status]],a:[...]}
// status: i = cedera, d = diragukan, s = skors. Hanya nama pendek, paling banyak 6 per tim.
export function absIds(lu){const u=lu&&lu.unavailable_players,f=a=>new Set((Array.isArray(a)?a:[]).filter(p=>p&&p.id!=null&&p.status!=="doubtful").map(p=>p.id));return{h:f(u&&u.home),a:f(u&&u.away)}}
const r2=x=>Math.round(x*100)/100;
export function absOf(lu){
  const u=lu&&lu.unavailable_players;if(!u)return null;const S={injured:"i",doubtful:"d",suspended:"s"};
  const side=a=>(Array.isArray(a)?a:[]).filter(p=>p&&(p.short_name||p.name)).map(p=>[p.short_name||p.name,S[p.status]||"i"]).slice(0,6);
  const h=side(u.home),a=side(u.away),n=k=>(Array.isArray(u[k])?u[k].length:0);
  return h.length||a.length?{h,a,nh:n("home"),na:n("away")}:{h:[],a:[],nh:0,na:0};
}
// V13.5: prediksi gabungan BSD + pasar (Pinnacle, margin dibuang). Bobot BSD = w.
export const mixP=(p,mk,w)=>{if(!p||!mk)return null;const m=p.map((x,i)=>w*x+(1-w)*mk[i]),t=m[0]+m[1]+m[2];return m.map(x=>x/t*100)};
// V13.5: indikator risiko — penilaian akurasi BSD per kelompok laga "rawan".
export function riskFlags(e){
  const f=[],p=e.p;if(!p)return f;const mx=Math.max(...p),pk=p.indexOf(mx);
  if(mx<40)f.push("tipis");
  const mk=devig(e.pc)||devig(e.o);if(mk&&mk.indexOf(Math.max(...mk))!==pk)f.push("beda");
  if(e.ab&&(e.ab[0]+e.ab[1]>=5||Math.max(e.ab[0],e.ab[1])>=4))f.push("absen");
  return f;
}
export function evalRisk(hist){
  const R=(hist||[]).filter(e=>e.r&&e.p),G={};
  const add=(k,e)=>{const o=e.r[0]>e.r[1]?0:e.r[0]===e.r[1]?1:2,g=G[k]=G[k]||{n:0,hit:0};g.n++;if(e.p.indexOf(Math.max(...e.p))===o)g.hit++};
  for(const e of R){const f=riskFlags(e);add("semua",e);if(!f.length)add("aman",e);for(const k of f)add(k,e);if(f.length>=2)add("ganda",e);if(e.ab)add("adaAbsen",e)}
  const out={};for(const k in G)out[k]={n:G[k].n,acc:G[k].hit/G[k].n*100};return out;
}
// V15: penilaian langsung Model BL vs BSD pada laga yang sudah selesai (prediksi tercatat sebelum kickoff)
export function evalBL(hist){const R=(hist||[]).filter(e=>e.r&&e.p&&e.bl);if(!R.length)return{n:0};
  const sc=k=>{let a=0,b=0,l=0;for(const e of R){const o=e.r[0]>e.r[1]?0:e.r[0]===e.r[1]?1:2,p=e[k].map(x=>x/100);if(p.indexOf(Math.max(...p))===o)a++;b+=p.reduce((s,x,i)=>s+(x-(i===o?1:0))**2,0);l-=Math.log(Math.max(p[o],1e-6))}return{acc:a/R.length*100,brier:b/R.length,ll:l/R.length}};
  return{n:R.length,model:sc("bl"),bsd:sc("p")}}
export function evalHistory(hist){
  const R=(hist||[]).filter(e=>e.r&&e.p),z=()=>({n:0,hit:0,br:0,ll:0,home:0,ouN:0,ouHit:0,btN:0,btHit:0,bets:0,profit:0,mkN:0,mkHit:0,mkBr:0});
  const add=(s,e)=>{const o=e.r[0]>e.r[1]?0:e.r[0]===e.r[1]?1:2,p=e.p.map(x=>x/100),pk=p.indexOf(Math.max(...p));
    s.n++;if(pk===o)s.hit++;if(o===0)s.home++;s.br+=p.reduce((a,x,i)=>a+(x-(i===o?1:0))**2,0);s.ll+=-LG(Math.max(1e-6,p[o]));
    const g=e.r[0]+e.r[1];if(e.ou!=null){s.ouN++;if((e.ou>=50)===(g>2.5))s.ouHit++}
    if(e.bt!=null){s.btN++;if((e.bt>=50)===(e.r[0]>0&&e.r[1]>0))s.btHit++}
    if(e.o&&e.o.every(x=>x>1)){const q=e.o.map(x=>1/x),t=q[0]+q[1]+q[2],m=q.map(x=>x/t),mk=m.indexOf(Math.max(...m));s.mkN++;if(mk===o)s.mkHit++;s.mkBr+=m.reduce((a,x,i)=>a+(x-(i===o?1:0))**2,0)}
    if(e.v&&e.v[1]>0){s.bets++;s.profit+=e.v[0]===o?e.v[2]-1:-1}};
  const fin=s=>({n:s.n,acc:s.n?s.hit/s.n*100:null,brier:s.n?s.br/s.n:null,ll:s.n?s.ll/s.n:null,homeAcc:s.n?s.home/s.n*100:null,
    ou:s.ouN?{n:s.ouN,acc:s.ouHit/s.ouN*100}:null,bt:s.btN?{n:s.btN,acc:s.btHit/s.btN*100}:null,
    market:s.mkN?{n:s.mkN,acc:s.mkHit/s.mkN*100,brier:s.mkBr/s.mkN}:null,value:{bets:s.bets,profit:Math.round(s.profit*100)/100,roi:s.bets?s.profit/s.bets*100:null}});
  const all=z(),lg={},bk=[[0,40],[40,50],[50,60],[60,70],[70,101]].map(([lo,hi])=>({lo,hi,n:0,hit:0,sum:0}));
  for(const e of R){add(all,e);(lg[e.lg]=lg[e.lg]||z(),add(lg[e.lg],e));const mx=Math.max(...e.p),o=e.r[0]>e.r[1]?0:e.r[0]===e.r[1]?1:2,b=bk.find(b=>mx>=b.lo&&mx<b.hi);if(b){b.n++;b.sum+=mx;if(e.p.indexOf(mx)===o)b.hit++}}
  const byLeague={};for(const k in lg)if(lg[k].n>=5)byLeague[k]=fin(lg[k]);
  return{...fin(all),byLeague,calib:bk.map(b=>({lo:b.lo,hi:b.hi,n:b.n,avg:b.n?b.sum/b.n:null,hit:b.n?b.hit/b.n*100:null})),pending:(hist||[]).filter(e=>!e.r).length};
}

// V13.3: uji mundur dari riwayat BSD (prediksi + hasil laga yang sudah selesai). Dicek 20 Nov 2026: angka prediksi BSD
// tidak berubah setelah kickoff (cek-bsd-riwayat: AMAN), jadi riwayat 90 hari layak dinilai.
// Diubah ke bentuk catatan evaluasi biasa supaya bisa dinilai dengan evalHistory yang sama.
export function backtestEntries(preds,events,leagues){
  const L=leagues instanceof Map?leagues:new Map((leagues||[]).map(l=>[l.id,l])),E=new Map((events||[]).map(e=>[e.id,e])),out=[],seen=new Set();
  for(const p of preds||[]){const id=p&&p.event&&p.event.id;if(id==null||seen.has(id))continue;const e=E.get(id);if(!e||String(e.status).toLowerCase()!=="finished")continue;
    const h=num(e.home_score),a=num(e.away_score);if(h==null||a==null)continue;
    const mr=(p.markets&&p.markets.match_result)||{},P=[num(mr.prob_home),num(mr.prob_draw),num(mr.prob_away)];if(P.some(x=>x==null)||P[0]+P[1]+P[2]<=0)continue;
    const s=P[0]+P[1]+P[2],lg=L.get(e.league_id)||{};seen.add(id);
    out.push({id,u:e.event_date,lg:e.league_name||lg.name||("Liga "+e.league_id),c:lg.country&&(lg.country.name||lg.country)||null,
      p:P.map(x=>Math.round(x/s*1000)/10),r:[h,a],ou:num((p.markets.over_under||{}).prob_over_25),bt:num((p.markets.btts||{}).prob_yes),o:null,v:null})}
  return out;
}
export function backtestSummary(entries,now,days){
  const ev=evalHistory(entries),c={};for(const e of entries)if(e.c&&!c[e.lg])c[e.lg]=e.c;
  const u=entries.map(e=>e.u).sort();
  return{updated:new Date(now).toISOString(),days,from:u[0]||null,to:u[u.length-1]||null,...ev,pending:0,countries:c,
    note:"Riwayat prediksi BSD vs hasil asli. Dicek: angka BSD tidak berubah setelah kickoff."};
}

async function main(){
  const KEY=cleanKey(process.env.BSD_API_KEY);
  if(!KEY){console.log("BSD_API_KEY kosong: langkah BSD dilewati.");return}
  const BASE=(process.env.BSD_API||"https://sports.bzzoiro.com/api/v2").replace(/\/+$/,"");
  const GAP=Number(process.env.GAP_MS??500),RETRY=Number(process.env.RETRY_MS??20000);
  const DEEP=process.env.BSD_DEEP!=="0",LIGHT=process.env.BSD_MODE==="light";
  const NEUTRAL=process.env.BL_NEUTRAL==="1";   // V19: tampilan netral (tanpa tabel perbandingan bookmaker), diatur lewat variabel repo
  const MAXD=Number(process.env.BSD_MAX_DETAIL??400),CONC=Number(process.env.BSD_CONCURRENCY??6);
  const WITA=8*3600e3,DAY=864e5,now=Date.parse(process.env.BSD_NOW||"")||Date.now(),wday=t=>new Date(t+WITA).toISOString().slice(0,10);
  const from=wday(now-2*DAY),to=wday(now+7*DAY);
  const errors=[];let calls=0,fatal=false;
  const quiet=new Set([402,403,404,503]);   // sub-resource kosong/tak berlangganan: lewati tanpa mengotori errors

  async function get(url,{soft=false}={}){
    for(let i=0;i<3;i++){
      if(overDeadline())throw new Error(url.replace(BASE,"")+" dilewati: batas waktu run habis");
      let r;
      try{r=await tfetch(url,{headers:{Authorization:"Token "+KEY,Accept:"application/json"}})}catch(e){await sleep(RETRY);continue}
      calls++;
      if(r.status===429){
        let code="";try{code=(await r.json()).code||""}catch(e){}
        if(code==="taster_exhausted"){const e=new Error("kuota harian BSD habis (reset 00:00 UTC / 07:00 WITA)");e.fatal=true;throw e}
        await sleep(Math.max(1000,Number(r.headers.get("retry-after")||1)*1000));continue;
      }
      if(soft&&quiet.has(r.status))return null;
      if(r.status===401||r.status===403||r.status===402){const e=new Error("BSD menolak permintaan (HTTP "+r.status+"). Periksa BSD_API_KEY.");e.fatal=true;throw e}
      if(r.status>=500){await sleep(RETRY);continue}
      if(!r.ok)throw new Error("HTTP "+r.status+" ("+url.replace(BASE,"")+")");
      return r.json();
    }
    throw new Error(url.replace(BASE,"")+" gagal setelah 3 percobaan");
  }
  async function pages(path,maxPages=40,opt){
    let url=BASE+path,out=[];
    for(let i=0;i<maxPages&&url;i++){
      if(i>0)await sleep(GAP);
      const j=await get(url,opt);if(!j)break;out=out.concat(j.results||[]);url=j.next||null;
    }
    return out;
  }
  const safe=async(name,fn)=>{if(fatal)return[];try{return await fn()}catch(e){errors.push(name+": "+e.message);if(e.fatal)fatal=true;return[]}};
  // antrean paralel terbatas (batas burst BSD 25 permintaan/detik per IP)
  async function pool(items,fn){let i=0;const w=Array.from({length:Math.max(1,CONC)},async()=>{while(i<items.length&&!fatal&&!overDeadline()){const x=items[i++];try{await fn(x)}catch(e){if(e.fatal)fatal=true;errors.push(e.message)}}});await Promise.all(w)}

  const events=await safe("events",()=>pages(`/events/?date_from=${from}&date_to=${to}&limit=200`));
  const preds=await safe("predictions",()=>pages(`/predictions/?date_from=${from}&date_to=${to}&limit=200`));
  const leagues=await safe("leagues",()=>pages("/leagues/?limit=200",5));

  const dir=outDir(import.meta.url);mkdirSync(dir,{recursive:true});
  let prevHeavy=null;try{prevHeavy=JSON.parse(readFileSync(dir+"all.json","utf8")).heavyAt||null}catch(e){}
  let own=[];try{own=JSON.parse(readFileSync(dir+"data.json","utf8")).matches||[]}catch(e){}
  const {matches,dup,skipped,linked,ghost}=buildAll({events,preds,leagues,own,now});
  const every=matches.concat(linked);
  const L=new Map((leagues||[]).map(l=>[l.id,l])),P=new Map((preds||[]).map(p=>[p.event&&p.event.id,p])),EV=new Map((events||[]).map(e=>[e.id,e]));
  const deep={odds:0,details:0,carried:0,leagues:0};
  const T0=Date.now(),lap=n=>{(deep.tm=deep.tm||{})[n]=Math.round((Date.now()-T0)/1000)};   // V19 (audit): detik sejak mulai, per tahap (tampil di all.json bsd.tm)

  if(DEEP&&!fatal){
    // 1) harga terbaik per bookmaker untuk semua laga
    const best=[];
    for(const mk of ["1x2","over_under_25","btts"])best.push(...await safe("odds "+mk,()=>pages(`/odds/best/?market=${mk}&date_from=${from}&date_to=${to}&limit=200`,40,{soft:true})));
    const B=pickBest(best);
    for(const m of every){const o=B.get(m.eid);if(o&&Object.keys(o).length){m.odds=o;deep.odds++}}
    const site=siteBase();
    const pull=f=>readPrev(f);   // V19: keluaran run sebelumnya (cache Actions), cadangan: situs tayang
    // V13.4: harga buka + terkini Pinnacle (heavy, ±1 jam sekali); run ringan membawa pin.json dari situs
    {let pin=null;const want=new Set(every.filter(m=>m.status==="NS").map(m=>m.eid));
      if(!LIGHT&&process.env.BSD_PIN!=="0"){
        const rows=await safe("odds pinnacle",()=>pages(`/odds/?market=1x2&bookmaker_slug=pinnacle&updated_after=${new Date(now-3*36e5).toISOString().slice(0,19)}Z&limit=200`,Number(process.env.BSD_PIN_PAGES||60),{soft:true}));
        const P=pinOf(rows);pin={};for(const [id,x] of P)if(want.has(id))pin[id]=x;deep.pin=Object.keys(pin).length;
        const prevPin=await readState("pin.json");if(prevPin&&prevPin.ev)for(const id in prevPin.ev)if(!pin[id]&&want.has(+id))pin[id]=prevPin.ev[id];   // laga yang tidak terbaca kali ini: pakai catatan lama
      }else{const prevPin=await readState("pin.json");if(prevPin&&prevPin.ev){pin={};for(const id in prevPin.ev)if(want.has(+id))pin[id]=prevPin.ev[id]}}
      if(pin){writeState("pin.json",{updated:new Date(now).toISOString(),ev:pin},{dir});for(const m of every)if(pin[m.eid])m.pin=pin[m.eid]}}

    lap("liga");
    // 2) liga: klasemen + papan skor pemain (heavy); light = bawa dari situs tayang
    const lids=[...new Set(matches.map(m=>m.lid).filter(x=>x!=null))];
    mkdirSync(dir+"lg",{recursive:true});
    const lgIndex=[];
    const prevLg=LIGHT?await pull("leagues.json"):null;
    const fetchLeagues=!LIGHT||!(prevLg&&prevLg.leagues&&prevLg.leagues.length);   // run ringan tanpa data lama: ambil langsung, jangan menulis klasemen kosong
    if(fetchLeagues){
      await pool(lids,async id=>{
        const st=await get(`${BASE}/leagues/${id}/standings/`,{soft:true});
        const top={};
        for(const s of ["scorers","assists","yellowcards","redcards"]){const t=await get(`${BASE}/leagues/${id}/top/${s}/?limit=20`,{soft:true});if(t)top[s]=t.leaders||[]}
        const lg=L.get(id)||{};
        const o={id,name:lg.name||("Liga "+id),country:lg.country||"",season:st&&st.season?{id:st.season.id,name:st.season.name}:null,
          grouped:!!(st&&st.grouped),standings:st&&st.standings||[],groups:st&&st.groups||null,zones:st&&st.zones||null,top,updated:new Date(now).toISOString()};
        writeFileSync(dir+"lg/"+id+".json",JSON.stringify(o));deep.leagues++;
        lgIndex.push({id,name:o.name,country:o.country,n:o.standings.length||(o.groups?Object.values(o.groups).reduce((a,g)=>a+((g&&g.length)||(g&&g.standings&&g.standings.length)||0),0):0)});
      });
    }else{
      await pool(prevLg.leagues,async l=>{const o=await pull("lg/"+l.id+".json");if(o){writeFileSync(dir+"lg/"+l.id+".json",JSON.stringify(o));lgIndex.push(l)}});
    }
    lgIndex.sort((a,b)=>(a.country+a.name).localeCompare(b.country+b.name));
    writeFileSync(dir+"leagues.json",JSON.stringify({updated:new Date(now).toISOString(),leagues:lgIndex}));

    lap("match_center");
    // 3) Match Center per laga
    mkdirSync(dir+"m",{recursive:true});
    const hot=focusOf(every,now,LIGHT).sort((a,b)=>(a.status==="LIVE"?0:1)-(b.status==="LIVE"?0:1)||Math.abs(Date.parse(a.utc)-now)-Math.abs(Date.parse(b.utc)-now)).slice(0,MAXD);
    const hotIds=new Set(hot.map(m=>m.eid)),have=new Set();
    await pool(hot,async m=>{
      const id=m.eid,g=p=>get(`${BASE}/events/${id}/${p}`,{soft:true}),isNS=m.status==="NS",e=EV.get(id)||{};
      const [stats,lineups,inc]=await Promise.all([isNS?null:g("stats/"),g("lineups/"),isNS?null:g("incidents/")]);
      const [com,ps,odds,cmp]=await Promise.all([isNS?null:g("commentary/?order=desc"),m.status==="FT"||m.status==="LIVE"?g("player-stats/"):null,g("odds/"),isNS?g("odds/comparison/"):null]);
      const [poly,meta,tv]=await Promise.all([isNS?g("polymarket/"):null,g("metadata/"),g("broadcasts/")]);
      let form=null;
      if(isNS&&m.hid&&m.aid){const [fh,fa]=await Promise.all([get(`${BASE}/teams/${m.hid}/form/?last=10`,{soft:true}),get(`${BASE}/teams/${m.aid}/form/?last=10`,{soft:true})]);form={home:slimForm(fh),away:slimForm(fa)}}
      const out={id,updated:new Date(now).toISOString(),status:m.status,
        info:{venue_id:e.venue_id,referee_id:e.referee_id,home_coach_id:e.home_coach_id,away_coach_id:e.away_coach_id,weather:e.weather||null,attendance:e.attendance,pitch:e.pitch_condition,derby:e.is_local_derby,neutral:e.is_neutral_ground,travel:e.travel_distance_km,highlights:e.highlights||null,round:e.round_label||null,prev_leg:e.previous_leg_event_id||null},
        h2h:e.head_to_head||null,pred:P.get(id)||null,stats,lineups,incidents:inc&&inc.incidents||null,
        commentary:com&&com.commentary?com.commentary.slice(0,120):null,player_stats:ps?slimPS(ps):null,
        odds:odds||null,odds_cmp:NEUTRAL?null:trimCmp(cmp),polymarket:poly,meta,tv:tv&&tv.results||null,form};
      writeFileSync(dir+"m/"+id+".json",JSON.stringify(out));have.add(id);deep.details++;{const ab=absOf(lineups);if(ab)m.ab=ab}
    });
    if(LIGHT){ // laga fokus heavy yang tidak disegarkan: bawa dari situs tayang (supaya Match Center tetap lengkap)
      const prev=await pull("m/index.json"),want=new Set(focusOf(every,now,false).map(m=>m.eid));
      await pool(((prev&&prev.ids)||[]).filter(i=>want.has(i)&&!hotIds.has(i)).slice(0,MAXD),async id=>{const o=await pull("m/"+id+".json");if(o){writeFileSync(dir+"m/"+id+".json",JSON.stringify(o));have.add(id);deep.carried++;const ab=absOf(o.lineups),m=every.find(x=>x.eid===id);if(ab&&m)m.ab=ab}});
    }
    for(const m of every)if(have.has(m.eid))m.dx=1;
    writeFileSync(dir+"m/index.json",JSON.stringify({updated:new Date(now).toISOString(),ids:[...have]}));
  }

  lap("uji_mundur");
  // V13.3: uji mundur 90 hari -> bsd-backtest.json (heavy, paling sering sekali per ~20 jam; selain itu dibawa dari situs)
  // V15: Model BL ikut memakai riwayat ini (prediksi BSD per laga) untuk menilai dan memilih bobot gabungan.
  const pullS=f=>readState(f);   // V19: data internal (STATE_DIR), cadangan: situs tayang (migrasi)
  const prevM=process.env.BL!=="0"?await pullS("model-bl.json"):null;
  const needModel=process.env.BL!=="0"&&(!prevM||!prevM.updated||now-Date.parse(prevM.updated)>20*36e5||prevM.partial);
  let btEnt=null,btE=[];
  {const BTD=Number(process.env.BSD_BACKTEST_DAYS??90);let prev=await pullS("bsd-backtest.json");
    const fresh=prev&&prev.n&&now-Date.parse(prev.updated)<20*36e5;
    if(process.env.BSD_BACKTEST!=="0"&&DEEP&&!LIGHT&&!fatal&&(!fresh||needModel)&&!overDeadline()){
      const P2=[],E2=[];
      for(let k=BTD;k>0&&!fatal&&!overDeadline();k-=7){
        const f=wday(now-k*DAY),t=wday(now-Math.max(1,k-6)*DAY);
        P2.push(...await safe("uji mundur prediksi",()=>pages(`/predictions/?date_from=${f}&date_to=${t}&limit=200`,40,{soft:true})));
        E2.push(...await safe("uji mundur laga",()=>pages(`/events/?status=finished&date_from=${f}&date_to=${t}&limit=200`,60,{soft:true})));
      }
      const ent=backtestEntries(P2,E2,leagues);btEnt=ent;btE=E2;
      if(ent.length>=50){writeState("bsd-backtest.json",backtestSummary(ent,now,BTD),{pub:true,dir});deep.backtest=ent.length}
      else if(prev)writeState("bsd-backtest.json",prev,{pub:true,dir});
    }else if(prev)writeState("bsd-backtest.json",prev,{pub:true,dir});
  }
  lap("model_mulai");
  // V15: Model BL — lihat model.mjs. Riwayat hasil (results.json) dan line-up resmi (starters.json) disimpan di situs dan diperbarui sedikit demi sedikit.
  if(process.env.BL!=="0"&&!fatal){
    const RD=Number(process.env.BL_DAYS??365),CH=Number(process.env.BL_BACKFILL_WEEKS??26);
    let res=await pullS("results.json"),st=await pullS("starters.json");res=res&&res.rows?res:{rows:[],from:null};st=st&&st.t?st:{t:{}};
    const row=e=>e&&String(e.status).toLowerCase()==="finished"&&num(e.home_score)!=null&&num(e.away_score)!=null&&e.home_team_id!=null&&e.away_team_id!=null?
      [e.id,Math.round(Date.parse(e.event_date)/1000),e.league_id,e.home_team_id,e.away_team_id,num(e.home_score),num(e.away_score),e.is_neutral_ground?1:0,e.has_xg===true?1:e.has_xg===false?0:null,e.season_id??null,(e.is_local_derby?1:0)|(e.previous_leg_event_id?2:0),e.travel_distance_km!=null?Math.round(e.travel_distance_km):null,e.home_coach_id??null,e.away_coach_id??null,e.referee_id??null]:null;
    const R=new Map(res.rows.map(r=>[r[0],r]));let added=0;const put=e=>{const r=row(e);if(r&&!R.has(r[0])){R.set(r[0],r);added++}else if(r)R.set(r[0],r)};
    for(const e of btE)put(e);for(const e of events)put(e);
    let from=res.from?Date.parse(res.from):(btE.length?now-90*DAY:now);
    if(needModel&&DEEP&&!LIGHT&&!overDeadline()){
      if(!btE.length)for(let k=10;k>0&&!fatal&&!overDeadline();k-=7){const f=wday(now-k*DAY),t=wday(now-Math.max(1,k-6)*DAY);for(const e of await safe("model laga terbaru",()=>pages(`/events/?status=finished&date_from=${f}&date_to=${t}&limit=200`,60,{soft:true})))put(e)}
      for(let w=0;w<CH&&from>now-RD*DAY&&!fatal&&!overDeadline();w++){const t=from-DAY,f=t-6*DAY;
        const got=await safe("model riwayat",()=>pages(`/events/?status=finished&date_from=${wday(f)}&date_to=${wday(t)}&limit=200`,60,{soft:true}));for(const e of got)put(e);from=f}
    }
    let rows=[...R.values()].filter(r=>r[1]*1000>now-(RD+35)*DAY).sort((a,b)=>a[1]-b[1]);
    // line-up resmi: dari Match Center run ini (laga live/selesai) + isi mundur untuk tim yang akan bermain dalam 48 jam
    const xiOf=(lu,side)=>{const L=lu&&lu.lineups&&lu.lineups[side];return L&&Array.isArray(L.players)&&L.players.length>=11?L.players.map(p=>p.id).filter(x=>x!=null):null};
    const rec=(team,t,ids)=>{if(team==null||!ids)return;const a=st.t[team]=st.t[team]||[];if(!a.some(x=>x[0]===t)){a.push([t,ids]);a.sort((x,y)=>x[0]-y[0]);if(a.length>10)a.splice(0,a.length-10)}};
    for(const m of every){if(!m.dx||m.status==="NS")continue;let o=null;try{o=JSON.parse(readFileSync(dir+"m/"+m.eid+".json","utf8"))}catch(e){}
      const lu=o&&o.lineups;if(lu&&lu.lineup_status==="confirmed"){const t=Math.round(Date.parse(m.utc)/1000);rec(m.hid,t,xiOf(lu,"home"));rec(m.aid,t,xiOf(lu,"away"))}}
    if(DEEP&&!LIGHT&&!overDeadline()){
      const soon=every.filter(m=>m.status==="NS"&&Date.parse(m.utc)-now<48*36e5&&Date.parse(m.utc)>now),need=new Set();
      for(const m of soon)for(const id of [m.hid,m.aid])if(id!=null&&(st.t[id]||[]).length<4)need.add(id);
      const last=new Map();for(let k=rows.length-1;k>=0;k--){const r=rows[k];for(const [id,side] of [[r[3],"home"],[r[4],"away"]])if(need.has(id)){const a=last.get(id)||[];if(a.length<5&&!(st.t[id]||[]).some(x=>x[0]===r[1])){a.push([r[0],r[1],side]);last.set(id,a)}}}
      const jobs=[];for(const [id,a] of last)for(const x of a)jobs.push([id,...x]);const MAXL=Number(process.env.BL_MAX_LINEUPS??150);
      await pool(jobs.slice(0,MAXL),async([team,ev,t,side])=>{const lu=await get(`${BASE}/events/${ev}/lineups/`,{soft:true});deep.xi=(deep.xi||0)+1;if(lu&&lu.lineup_status==="confirmed")rec(team,t,xiOf(lu,side))});
    }
    for(const k of Object.keys(st.t))if(!st.t[k].length||st.t[k][st.t[k].length-1][0]*1000<now-120*DAY)delete st.t[k];
    writeState("starters.json",{v:1,updated:new Date(now).toISOString(),t:st.t},{dir});
    lap("xg");
    // V15.1: xG per laga selesai (xg.json): dari Match Center run ini + isi mundur bertahap, laga terbaru dulu. 0 = BSD tidak punya xG laga itu.
    let xg=await pullS("xg.json");xg=xg&&xg.e?xg:{e:{}};
    const xgOf=o=>{const S=o&&o.stats&&o.stats.home?o.stats:o&&o.stats&&o.stats.stats;const h=S&&S.home&&num(S.home.expected_goals),a=S&&S.away&&num(S.away.expected_goals);return h!=null&&a!=null?[r2(h),r2(a),o.xg_estimated||(o.stats&&o.stats.xg_estimated)?1:0]:null};
    for(const m of every){if(!m.dx||m.status!=="FT"||xg.e[m.eid])continue;let o=null;try{o=JSON.parse(readFileSync(dir+"m/"+m.eid+".json","utf8"))}catch(e){}const v=xgOf(o&&o.stats);if(v)xg.e[m.eid]=v}
    if(DEEP&&!LIGHT&&!overDeadline()){
      // V15.2: tanda has_xg dari daftar laga (1 halaman = 200 laga) jauh lebih murah dari 1 permintaan per laga.
      // Baris lama tanpa tanda: pindai ulang daftar laga per minggu (terbaru dulu), paling banyak BL_FLAG_WEEKS minggu per run.
      // V18: baris lama yang belum punya kolom baru (tanda xG, musim, derby, jarak, pelatih, wasit) ikut dipindai ulang
      const unk=rows.filter(r=>r.length<15||(r[8]==null&&xg.e[r[0]]==null));
      if(unk.length&&process.env.BL_XG_FLAG!=="0"){const wk=new Set();for(const r of unk.sort((a,b)=>b[1]-a[1]))wk.add(Math.floor((r[1]*1000+WITA)/(7*DAY)));
        for(const w of [...wk].slice(0,Number(process.env.BL_FLAG_WEEKS??8))){if(overDeadline())break;const f=w*7*DAY-WITA;
          for(const e of await safe("tanda xG",()=>pages(`/events/?status=finished&date_from=${wday(f)}&date_to=${wday(f+6*DAY)}&limit=200`,60,{soft:true})))put(e);deep.xgScan=(deep.xgScan||0)+1}
        rows=[...R.values()].filter(r=>r[1]*1000>now-(RD+35)*DAY).sort((a,b)=>a[1]-b[1])}
      // V15.3: sampel 20 Nov menunjukkan ~30% laga bertanda has_xg=false tetap punya xG PERKIRAAN BSD. Jadi laga itu tidak dilewati,
      // hanya didahulukan belakangan: bertanda punya xG lebih dulu (terbaru dulu), sisanya menyusul.
      if((xg.v||1)<2){let back=0;for(const r of rows)if(r[8]===0&&xg.e[r[0]]===0&&r[0]%10!==0){delete xg.e[r[0]];back++}xg.v=2;deep.xgBack=back}   // kembalikan yang sempat dilewati
      const want=rows.filter(r=>xg.e[r[0]]==null).sort((a,b)=>(b[8]===1)-(a[8]===1)||b[1]-a[1]).slice(0,Number(process.env.BL_XG_PER_RUN??200));
      const chk=xg.chk||{n:0,hit:0,yes:0,yesHit:0};
      await pool(want,async r=>{const o=await get(`${BASE}/events/${r[0]}/stats/`,{soft:true});deep.xg=(deep.xg||0)+1;const v=xgOf(o);xg.e[r[0]]=v||0;
        if(r[8]===0){chk.n++;if(v)chk.hit++}else if(r[8]===1){chk.yes++;if(v)chk.yesHit++}});
      xg.chk=chk;deep.xgCheck=chk;}
    {const keep=new Set(rows.map(r=>String(r[0])));for(const k of Object.keys(xg.e))if(!keep.has(k))delete xg.e[k]}
    const xgN=Object.values(xg.e).filter(v=>v&&v.length).length;deep.xgHave=xgN;
    writeState("xg.json",{v:xg.v||1,updated:new Date(now).toISOString(),chk:xg.chk||null,e:xg.e},{dir});
    writeState("results.json",{v:1,updated:new Date(now).toISOString(),from:new Date(from).toISOString(),rows},{dir});
    lap("pemain");
    // V16 (Tahap 1): data pemain. players.json = ringkasan statistik pemain per tim; values.json = nilai pasar + posisi pemain.
    let PS=await pullS("players.json"),VA=await pullS("values.json"),XR=await pullS("xi.json");PS=PS&&PS.t?PS:{t:{}};VA=VA&&VA.p?VA:{p:{}};XR=XR&&XR.e?XR:{e:{}};
    if(DEEP&&!LIGHT&&!overDeadline()&&process.env.BL_PLAYERS!=="0"){
      const soon=every.filter(m=>m.status==="NS"&&Date.parse(m.utc)>now&&Date.parse(m.utc)-now<72*36e5),teams=new Set();for(const m of soon){if(m.hid!=null)teams.add(m.hid);if(m.aid!=null)teams.add(m.aid)}
      const have=id=>new Set(((PS.t[id]||{}).ev||[]).map(e=>e[0])),seen=new Set(),jobs=[],per=new Map();
      for(let k=rows.length-1;k>=0&&jobs.length<2000;k--){const r=rows[k];if(r[1]*1000<now-180*DAY)break;for(const id of [r[3],r[4]]){if(!teams.has(id)||seen.has(r[0]))continue;
        const c=per.get(id)||0;if(c>=10||have(id).has(r[0]))continue;per.set(id,c+1);seen.add(r[0]);jobs.push(r)}}
      // laga terbaru tiap tim dulu (urut putaran), supaya semua tim yang akan main cepat punya minimal beberapa laga
      jobs.sort((a,b)=>b[1]-a[1]);const MAXP=Number(process.env.BL_PS_PER_RUN??150);
      await pool(jobs.slice(0,MAXP),async r=>{const o=await get(`${BASE}/events/${r[0]}/player-stats/`,{soft:true});deep.ps=(deep.ps||0)+1;const L=o&&(o.player_stats||o.results||(Array.isArray(o)?o:null));
        if(L&&L.length){const side=id=>{const R=L.filter(x=>x.team_id===id);return R.length?xiRatio(playerQuality(PS.t[id],VA.p),xiFromStats(R)):null};
          const a=side(r[3]),b=side(r[4]);if(a&&b&&a.known>=6&&b.known>=6)XR.e[r[0]]=[a.r[0],a.r[1],b.r[0],b.r[1]];psIngest(PS,r[0],r[1]*1000,L)}});
      // nilai pasar: pemain reguler (>= 20% menit) dari tim yang akan main, yang belum punya atau sudah > 30 hari
      const want=[];for(const id of teams){const T=PS.t[id];if(!T||!T.mt)continue;for(const [pid,q] of Object.entries(T.p)){if(q[0]/T.mt<.2)continue;const v=VA.p[pid];if(!v||now-v[2]*1000>30*DAY)want.push(pid)}}
      const MAXV=Number(process.env.BL_VAL_PER_RUN??150);
      await pool([...new Set(want)].slice(0,MAXV),async pid=>{const o=await get(`${BASE}/players/${pid}/`,{soft:true});deep.pv=(deep.pv||0)+1;const v=valueOf(o,now);if(v)VA.p[pid]=v;else VA.p[pid]=[null,null,Math.round(now/1000)]});
    }
    psCompact(PS,now);for(const k of Object.keys(VA.p))if(now-VA.p[k][2]*1000>120*DAY)delete VA.p[k];
    deep.psTeams=Object.keys(PS.t).length;deep.psVals=Object.values(VA.p).filter(v=>v[0]!=null).length;
    writeState("players.json",{v:1,updated:new Date(now).toISOString(),t:PS.t},{dir});
    writeState("values.json",{v:1,updated:new Date(now).toISOString(),p:VA.p},{dir});
    {const keep=new Set(rows.map(r=>String(r[0])));for(const k of Object.keys(XR.e))if(!keep.has(k))delete XR.e[k]}deep.xiN=Object.keys(XR.e).length;
    writeState("xi.json",{v:1,updated:new Date(now).toISOString(),e:XR.e},{dir});
    // nilai skuad (log10) relatif median liga, hanya tim yang nilai pasar pemain regulernya >= 60% terisi
    const ZV=new Map();{const tl=new Map();for(const r of rows){if(!tl.has(r[3]))tl.set(r[3],r[2]);if(!tl.has(r[4]))tl.set(r[4],r[2])}
      const byL=new Map();for(const [id,T] of Object.entries(PS.t)){const S=teamSummary(T,VA.p);if(!S||!S.squad||S.valCov<.6)continue;const l=tl.get(+id);if(l==null)continue;(byL.get(l)||byL.set(l,[]).get(l)).push([+id,Math.log10(S.squad)])}
      for(const L of byL.values()){if(L.length<4)continue;const v=L.map(x=>x[1]).sort((a,b)=>a-b),md=v[v.length>>1];for(const [id,x] of L)ZV.set(id,x-md)}}
    deep.zv=ZV.size;
    lap("latih");
    // latih + uji mundur + bobot gabungan (sekali sehari), atau bawa hasil sebelumnya
    let MB=prevM,teamsDone=false;
    if(needModel&&DEEP&&!LIGHT&&btEnt&&btEnt.length&&rows.length>=500&&!overDeadline()){
      const ms=rows.map(r=>{const x=xg.e[r[0]];const xr=XR.e[r[0]];return{id:r[0],t:r[1]*1000,l:r[2],h:r[3],a:r[4],gh:r[5],ga:r[6],n:r[7],xh:x?x[0]:null,xa:x?x[1]:null,xe:x?x[2]:0,se:r[9]??null,
        xr:xr||null,zv:ZV.has(r[3])&&ZV.has(r[4])?[ZV.get(r[3]),ZV.get(r[4])]:null,dby:r[10]&1?1:0,tr:r[11]??null,hc:r[12]??null,ac:r[13]??null}});
      const xgCov=ms.filter(m=>m.t>now-180*DAY&&m.xh!=null).length/Math.max(1,ms.filter(m=>m.t>now-180*DAY).length);
      const span=(now-ms[0].t)/DAY,bfrom=now-Number(process.env.BL_BT_DAYS??90)*DAY;
      const cfgs=(span>=200&&process.env.BL_TUNE!=="0"?[{},{hl:120},{hl:300},{tauT:8},{rho:-.12}].concat(xgCov>=.2?[{xga:.5},{xga:.7},{xga:.7,hl:120}]:[]):[{}]).map(c=>({sweeps:25,...c}));
      let best=null;for(const c of cfgs){if(overDeadline())break;const rb=rollingBacktest(ms,bfrom,now,{...c,ranks:true});const sc=score(rb);if(sc&&(!best||sc.ll<best.sc.ll))best={c,rb,sc}}
      const TT=best?bestTemp(best.rb):1;if(best)for(const r of best.rb)r.p=temper(r.p,TT);   // kalibrasi suhu dari uji mundur
      const bsdP=new Map((btEnt||[]).map(e=>[e.id,e.p]));
      const J=best?best.rb.filter(r=>bsdP.has(r.id)).map(r=>({...r,b:bsdP.get(r.id)})):[];
      const half=J.length?J.map(r=>r.t).sort((a,b)=>a-b)[J.length>>1]:0,J1=J.filter(r=>r.t<half),J2=J.filter(r=>r.t>=half);
      const w1=bestBlend(J1,"b","p"),wa=bestBlend(J,"b","p");   // w = bobot BSD
      const mixS=(R,w)=>score(R.map(r=>({o:r.o,q:r.b.map((x,i)=>w*x+(1-w)*r.p[i])})),"q");
      const hold=w1&&J2.length?{w:w1.w,bsd:score(J2,"b"),model:score(J2,"p"),blend:mixS(J2,w1.w)}:null;
      const useful=!!(hold&&wa&&hold.blend.ll<hold.bsd.ll-.002&&wa.w<.95&&J.length>=300);
      const cal=best?[[0,40],[40,50],[50,60],[60,70],[70,101]].map(([lo,hi])=>{const b=best.rb.filter(r=>{const m=Math.max(...r.p);return m>=lo&&m<hi});let s=0,h=0;for(const r of b){const m=Math.max(...r.p);s+=m;if(r.p.indexOf(m)===r.o)h++}return{lo,hi,n:b.length,avg:b.length?s/b.length:null,hit:b.length?h/b.length*100:null}}):[];
      // V16: uji "klasemen menipu" (klasemen saat kickoff vs kekuatan asli vs BSD), hanya laga yang punya prediksi BSD
      let tbl=null;try{const tab=tablesAt(ms);tbl={g5:tableTest(J,tab,{gap:5}),g8:tableTest(J,tab,{gap:8}),g3:tableTest(J,tab,{gap:3})}}catch(e){errors.push("uji klasemen: "+e.message)}
      // V18 (Tahap 3): uji faktor tambahan (form, H2H, derby, habis laga Eropa, perjalanan jauh, pelatih baru)
      let fac=null;try{const eu=new Set((leagues||[]).filter(l=>EU_RE.test(l.name||"")).map(l=>l.id));fac=factorTests(ms,J,eu);
        fac.cov={coach:Math.round(rows.filter(r=>r[12]!=null).length/rows.length*100),travel:Math.round(rows.filter(r=>r[11]!=null).length/rows.length*100),eu:eu.size}}catch(e){errors.push("uji faktor: "+e.message)}
      const M=fitModel(ms,now,{...(best?best.c:{}),sweeps:40});addTimes(M,every.filter(m=>m.hid!=null&&m.aid!=null).map(m=>({h:m.hid,a:m.aid,t:Date.parse(m.utc)})));
      const pred={};for(const m of every){if(m.status!=="NS"||m.hid==null||m.aid==null||m.lid==null)continue;const a=M.team.get(m.hid),b=M.team.get(m.aid);if(!a||!b||a.n<4||b.n<4)continue;
        const ev=EV.get(m.eid)||{};const q=predictModel(M,{h:m.hid,a:m.aid,l:m.lid,n:ev.is_neutral_ground?1:0,t:Date.parse(m.utc),zv:ZV.has(m.hid)&&ZV.has(m.aid)?[ZV.get(m.hid),ZV.get(m.aid)]:null,dby:ev.is_local_derby?1:0});
        pred[m.eid]={x:q.xg.map(v=>Math.round(v*1000)/1000),r:q.rest,n:q.n}}
      MB={updated:new Date(now).toISOString(),temp:TT,xgCov:Math.round(xgCov*1000)/10,partial:span<RD-10,span:Math.round(span),nMatches:ms.length,nTeams:M.team.size,cfg:{...DEF,...(best?best.c:{})},hfa:M.hfa,rest:{own:M.bo,opp:M.bd},
        bt:best?{n:best.sc.n,model:best.sc,joined:J.length,bsd:J.length?score(J,"b"):null,modelJ:J.length?score(J,"p"):null,blendAll:wa,holdout:hold,calib:cal,days:Number(process.env.BL_BT_DAYS??90)}:null,
        useful,w:wa?wa.w:1,core:CORE,cov:M.cov,tbl,fac,pred};
      // ringkasan per tim untuk tampilan (Tahap 4): peringkat kekuatan, keberuntungan musim ini, data pemain
      try{const lk=luckOf(ms,now),TS={};const lgs=new Set(every.map(m=>m.lid).filter(x=>x!=null));
        for(const [id,t] of M.team){if(!lgs.has(t.lg)||t.n<4)continue;const R=strengthRanks(M,t.lg),L=lk[id],S=teamSummary(PS.t[id],VA.p),Lg=M.lg.get(t.lg)||{A:0,D:0};
          TS[id]={lg:t.lg,sr:R.get(id)??null,sn:R.size,att:r2(Lg.A+t.a),def:r2(Lg.D+t.d),
            luck:L?{n:L.n,pts:L.pts,gf:L.gf,ga:L.ga,xn:L.xn,xgf:r2(L.xgf),xga:r2(L.xga),xpts:r2(L.xpts),xpN:L.xpN}:null,
            ps:S?{n:S.n,reg:S.reg,rt:S.avgRt!=null?r2(S.avgRt):null,sq:S.squad,vc:r2(S.valCov),gp:r2(S.gp),key:S.players.slice(0,5).map(p=>[p.pid,p.nm,r2(p.sh),p.rt!=null?r2(p.rt):null,r2(p.x90||p.ga90),p.val,p.pos])}:null}}
        writeState("teams.json",{v:1,updated:new Date(now).toISOString(),t:TS},{pub:true,dir});deep.teams=Object.keys(TS).length;teamsDone=true}catch(e){errors.push("ringkasan tim: "+e.message)}
      deep.model=Object.keys(pred).length;
    }
    if(!teamsDone){const T=await pullS("teams.json");if(T&&T.t)writeState("teams.json",T,{pub:true,dir})}   // dibawa dari run sebelumnya
    if(MB){writeState("model-bl.json",MB,{pub:true,dir});
      // tempel ke laga (tiap run): laju gol dasar + koreksi pemain inti yang tidak main
      for(const m of every){const q=MB.pred&&MB.pred[m.eid];if(!q||m.status!=="NS")continue;
        let o=null;if(m.dx){try{o=JSON.parse(readFileSync(dir+"m/"+m.eid+".json","utf8"))}catch(e){}}
        const lu=o&&o.lineups,conf=lu&&lu.lineup_status==="confirmed",ab=absIds(lu);
        const kh=missingCore(regulars(st.t[m.hid]),conf?xiOf(lu,"home"):null,ab.h),ka=missingCore(regulars(st.t[m.aid]),conf?xiOf(lu,"away"):null,ab.a);
        // V17: kekuatan line-up (serang/bertahan) dari line-up resmi, line-up perkiraan BSD, atau susunan biasa dikurangi pemain absen
        const xiFor=(team,s2,abs)=>{const Q=playerQuality(PS.t[team],VA.p);if(!Q)return null;let xi=xiOf(lu,s2),src=conf?"xi":xi?"pred":"abs";
          // line-up perkiraan bisa masih memuat pemain cedera: keluarkan yang absen, isi dengan pemain berporsi menit terbesar berikutnya
          if(!conf){const fill=[...Q].filter(([pid])=>!abs.has(pid)).sort((a,b)=>b[1].sh-a[1].sh).map(([pid])=>pid);xi=(xi||[]).filter(pid=>!abs.has(pid)).slice(0,11);for(const pid of fill){if(xi.length>=11)break;if(!xi.includes(pid))xi.push(pid)}}
          const R=xiRatio(Q,xi);return R&&R.known>=6?{...R,src}:null};
        const XH=xiFor(m.hid,"home",ab.h),XA=xiFor(m.aid,"away",ab.a),cv=MB.cov||{},useXi=cv.nXr>=300&&XH&&XA;
        let [lh,la]=useXi?[q.x[0],q.x[1]]:adjustL(q.x[0],q.x[1],kh,ka);
        if(useXi){lh*=Math.pow(XH.r[0],cv.gA)*Math.pow(XA.r[1],-cv.gD);la*=Math.pow(XA.r[0],cv.gA)*Math.pow(XH.r[1],-cv.gD)}
        const pr=probs(lh,la,MB.cfg&&MB.cfg.rho);pr.p=temper(pr.p,MB.temp||1);
        m.bl={h:r1(pr.p[0]),d:r1(pr.p[1]),a:r1(pr.p[2]),ou:r1(pr.ou),bt:r1(pr.bt),xg:[r2(lh),r2(la)],ms:pr.ms,r:q.r,k:[kh,ka],src:conf?"xi":"abs",
          lu:XH&&XA?[XH.r[0],XH.r[1],XA.r[0],XA.r[1]]:null,mi:XH&&XA?[XH.miss.filter(x=>x[1]).slice(0,2).map(x=>x[1]),XA.miss.filter(x=>x[1]).slice(0,2).map(x=>x[1])]:null,lsrc:XH?XH.src:null,ux:useXi?1:0};
        if(MB.useful&&m.p&&!m.np&&m.p.h!=null){const w=MB.w,g=[m.p.h,m.p.d,m.p.a].map((x,i)=>w*x+(1-w)*pr.p[i]),t=g[0]+g[1]+g[2];m.bg={h:r1(g[0]/t*100),d:r1(g[1]/t*100),a:r1(g[2]/t*100),w}}}
    }
  }
  const T={2:matches.filter(x=>x.tier===2).length,3:0,4:0};
  lap("latih_selesai");
  // catatan prediksi BSD (dibawa dari situs tayang) -> bsd-history.json + bsd-eval.json
  let hist=[];{if(process.env.BSD_HISTORY_FILE){try{hist=JSON.parse(readFileSync(process.env.BSD_HISTORY_FILE,"utf8"))}catch(e){}}
    else{const h=await readState("bsd-history.json");if(Array.isArray(h))hist=h}}
  if(!fatal&&events.length){hist=updateHistory(hist,every,now);writeState("bsd-history.json",hist,{dir});writeFileSync(dir+"bsd-eval.json",JSON.stringify({updated:new Date(now).toISOString(),...evalHistory(hist),move:evalMove(hist),risk:evalRisk(hist),bl:evalBL(hist)}))}
  const links=(linked||[]).map(r=>({oid:r.oid,eid:r.eid,lid:r.lid,hid:r.hid,aid:r.aid,rl:r.rl,odds:r.odds,dx:r.dx,bp:r.p&&!r.np?{h:r.p.h,d:r.p.d,a:r.p.a}:null}));
  const all={updated:new Date(now).toISOString(),week:[from,to],errors:errors.slice(0,30).map(e=>"BSD: "+e),matches,links,
    heavyAt:(DEEP&&!LIGHT)?new Date(now).toISOString():(prevHeavy||null),tiers:T,nPred:T[2],nLeagues:new Set(matches.map(x=>x.league)).size,bsd:{calls,dup,skipped,ghost,fatal,mode:DEEP?(LIGHT?"light":"heavy"):"basic",...deep}};
  writeFileSync(dir+"all.json",JSON.stringify(all));
  if(errors.length)ghWarn("bsd: "+errors.slice(0,10).join(" ; "));
  console.log("OK bsd:",matches.length,"laga,",T[2],"berprediksi,",all.nLeagues,"liga;",dup,"sudah dimodelkan sendiri;",calls,"permintaan;",errors.length,"error; deep",JSON.stringify(deep));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
