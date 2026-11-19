import {mkdirSync,writeFileSync,readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {sleep,tfetch,cleanKey,outDir,overDeadline,ghWarn,siteBase} from "./net.mjs";
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
    id:"b"+e.id,league:name,lgc:IMG+"/league/"+e.league_id+"/",utc:new Date(t).toISOString(),status:st,
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

export function buildAll({events,preds,leagues,own=[]}){
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
  out.sort((a,b)=>a.utc.localeCompare(b.utc));
  return{matches:out,dup,skipped,linked};
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
const trimCmp=c=>{ if(!c||!c.markets)return null; // grid bookmaker: simpan pasar utama saja agar berkas kecil
  const keep={};for(const [k,v] of Object.entries(c.markets))if(/^(1x2|match_result|over_under_25|btts|double_chance|asian_handicap|draw_no_bet)/i.test(k))keep[k]=v;
  return{bookmakers_count:c.bookmakers_count,main_lines:c.main_lines||null,markets:keep}};
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
        o:m.odds?[m.odds.h&&m.odds.h.o,m.odds.d&&m.odds.d.o,m.odds.a&&m.odds.a.o]:null,v:v,r:e&&e.r||null});
    }
    if(e&&!e.r&&m.status==="FT"&&m.score[0]!=null&&m.score[1]!=null)e.r=[m.score[0],m.score[1]];
  }
  for(const [k,e] of H){const t=Date.parse(e.u);if((!e.r&&t<now-3*864e5)||t<now-120*864e5)H.delete(k)}   // tanpa hasil >3 hari / >120 hari: buang
  return [...H.values()].sort((a,b)=>a.u.localeCompare(b.u)).slice(-6000);
}
function bestVal(m){if(!m.odds||!m.p)return null;let b=null;[[0,m.p.h,m.odds.h],[1,m.p.d,m.odds.d],[2,m.p.a,m.odds.a]].forEach(([k,p,o])=>{if(p==null||!o||!o.o||p<20||o.o>5)return;const v=p/100*o.o-1;if(v<.02)return;if(!b||v>b[1])b=[k,Math.round(v*1000)/1000,o.o]});return b}
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

async function main(){
  const KEY=cleanKey(process.env.BSD_API_KEY);
  if(!KEY){console.log("BSD_API_KEY kosong: langkah BSD dilewati.");return}
  const BASE=(process.env.BSD_API||"https://sports.bzzoiro.com/api/v2").replace(/\/+$/,"");
  const GAP=Number(process.env.GAP_MS??500),RETRY=Number(process.env.RETRY_MS??20000);
  const DEEP=process.env.BSD_DEEP!=="0",LIGHT=process.env.BSD_MODE==="light";
  const MAXD=Number(process.env.BSD_MAX_DETAIL??400),CONC=Number(process.env.BSD_CONCURRENCY??6);
  const WITA=8*3600e3,DAY=864e5,now=Date.now(),wday=t=>new Date(t+WITA).toISOString().slice(0,10);
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
  const {matches,dup,skipped,linked}=buildAll({events,preds,leagues,own});
  const every=matches.concat(linked);
  const L=new Map((leagues||[]).map(l=>[l.id,l])),P=new Map((preds||[]).map(p=>[p.event&&p.event.id,p])),EV=new Map((events||[]).map(e=>[e.id,e]));
  const deep={odds:0,details:0,carried:0,leagues:0};

  if(DEEP&&!fatal){
    // 1) harga terbaik per bookmaker untuk semua laga
    const best=[];
    for(const mk of ["1x2","over_under_25","btts"])best.push(...await safe("odds "+mk,()=>pages(`/odds/best/?market=${mk}&date_from=${from}&date_to=${to}&limit=200`,40,{soft:true})));
    const B=pickBest(best);
    for(const m of every){const o=B.get(m.eid);if(o&&Object.keys(o).length){m.odds=o;deep.odds++}}
    const site=siteBase();
    const pull=async f=>{if(!site)return null;try{const r=await tfetch(site+f+"?t="+now);return r.ok?await r.json():null}catch(e){return null}};

    // 2) liga: klasemen + papan skor pemain (heavy); light = bawa dari situs tayang
    const lids=[...new Set(matches.map(m=>m.lid).filter(x=>x!=null))];
    mkdirSync(dir+"lg",{recursive:true});
    const lgIndex=[];
    if(!LIGHT){
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
      const prev=await pull("leagues.json");
      for(const l of (prev&&prev.leagues)||[]){const o=await pull("lg/"+l.id+".json");if(o){writeFileSync(dir+"lg/"+l.id+".json",JSON.stringify(o));lgIndex.push(l)}}
    }
    lgIndex.sort((a,b)=>(a.country+a.name).localeCompare(b.country+b.name));
    writeFileSync(dir+"leagues.json",JSON.stringify({updated:new Date(now).toISOString(),leagues:lgIndex}));

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
      if(isNS&&m.hid&&m.aid){const [fh,fa]=await Promise.all([get(`${BASE}/teams/${m.hid}/form/?last=10`,{soft:true}),get(`${BASE}/teams/${m.aid}/form/?last=10`,{soft:true})]);form={home:fh,away:fa}}
      const out={id,updated:new Date(now).toISOString(),status:m.status,
        info:{venue_id:e.venue_id,referee_id:e.referee_id,home_coach_id:e.home_coach_id,away_coach_id:e.away_coach_id,weather:e.weather||null,attendance:e.attendance,pitch:e.pitch_condition,derby:e.is_local_derby,neutral:e.is_neutral_ground,travel:e.travel_distance_km,highlights:e.highlights||null,round:e.round_label||null,prev_leg:e.previous_leg_event_id||null},
        h2h:e.head_to_head||null,pred:P.get(id)||null,stats,lineups,incidents:inc&&inc.incidents||null,
        commentary:com&&com.commentary?com.commentary.slice(0,120):null,player_stats:ps?slimPS(ps):null,
        odds:odds||null,odds_cmp:trimCmp(cmp),polymarket:poly,meta,tv:tv&&tv.results||null,form};
      writeFileSync(dir+"m/"+id+".json",JSON.stringify(out));have.add(id);deep.details++;
    });
    if(LIGHT){ // laga fokus heavy yang tidak disegarkan: bawa dari situs tayang (supaya Match Center tetap lengkap)
      const prev=await pull("m/index.json"),want=new Set(focusOf(every,now,false).map(m=>m.eid));
      for(const id of ((prev&&prev.ids)||[]).filter(i=>want.has(i)&&!hotIds.has(i)).slice(0,MAXD)){const o=await pull("m/"+id+".json");if(o){writeFileSync(dir+"m/"+id+".json",JSON.stringify(o));have.add(id);deep.carried++}}
    }
    for(const m of every)if(have.has(m.eid))m.dx=1;
    writeFileSync(dir+"m/index.json",JSON.stringify({updated:new Date(now).toISOString(),ids:[...have]}));
  }

  const T={2:matches.filter(x=>x.tier===2).length,3:0,4:0};
  // catatan prediksi BSD (dibawa dari situs tayang) -> bsd-history.json + bsd-eval.json
  let hist=[];{const site=siteBase();if(process.env.BSD_HISTORY_FILE){try{hist=JSON.parse(readFileSync(process.env.BSD_HISTORY_FILE,"utf8"))}catch(e){}}
    else if(site){try{const r=await tfetch(site+"bsd-history.json?t="+now);if(r.ok)hist=await r.json()}catch(e){}}}
  if(!fatal&&events.length){hist=updateHistory(hist,every,now);writeFileSync(dir+"bsd-history.json",JSON.stringify(hist));writeFileSync(dir+"bsd-eval.json",JSON.stringify({updated:new Date(now).toISOString(),...evalHistory(hist)}))}
  const links=(linked||[]).map(r=>({oid:r.oid,eid:r.eid,lid:r.lid,hid:r.hid,aid:r.aid,rl:r.rl,odds:r.odds,dx:r.dx,bp:r.p&&!r.np?{h:r.p.h,d:r.p.d,a:r.p.a}:null}));
  const all={updated:new Date(now).toISOString(),week:[from,to],errors:errors.slice(0,30).map(e=>"BSD: "+e),matches,links,
    heavyAt:(DEEP&&!LIGHT)?new Date(now).toISOString():(prevHeavy||null),tiers:T,nPred:T[2],nLeagues:new Set(matches.map(x=>x.league)).size,bsd:{calls,dup,skipped,fatal,mode:DEEP?(LIGHT?"light":"heavy"):"basic",...deep}};
  writeFileSync(dir+"all.json",JSON.stringify(all));
  if(errors.length)ghWarn("bsd: "+errors.slice(0,10).join(" ; "));
  console.log("OK bsd:",matches.length,"laga,",T[2],"berprediksi,",all.nLeagues,"liga;",dup,"sudah dimodelkan sendiri;",calls,"permintaan;",errors.length,"error; deep",JSON.stringify(deep));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
