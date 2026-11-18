import {mkdirSync,writeFileSync,readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {sleep,tfetch,cleanKey,outDir,overDeadline,ghWarn} from "./net.mjs";
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
const LIVE=new Set(["live","inprogress","1st_half","2nd_half","halftime","extra_time","penalties","break"]);
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
  const out=[];let dup=0,skipped=0;
  for(const e of events||[]){
    const r=toRecord(e,P.get(e.id),L);
    if(!r){skipped++;continue}
    if(own.some(x=>isDup(r,x))){dup++;continue}
    out.push(r);
  }
  out.sort((a,b)=>a.utc.localeCompare(b.utc));
  return{matches:out,dup,skipped};
}

async function main(){
  const KEY=cleanKey(process.env.BSD_API_KEY);
  if(!KEY){console.log("BSD_API_KEY kosong: langkah BSD dilewati.");return}
  const BASE=(process.env.BSD_API||"https://sports.bzzoiro.com/api/v2").replace(/\/+$/,"");
  const GAP=Number(process.env.GAP_MS??500),RETRY=Number(process.env.RETRY_MS??20000);
  const WITA=8*3600e3,DAY=864e5,now=Date.now(),wday=t=>new Date(t+WITA).toISOString().slice(0,10);
  const from=wday(now-2*DAY),to=wday(now+7*DAY);
  const errors=[];let calls=0,fatal=false;

  async function get(url){
    for(let i=0;i<3;i++){
      if(overDeadline())throw new Error(url+" dilewati: batas waktu run habis");
      let r;
      try{r=await tfetch(url,{headers:{Authorization:"Token "+KEY,Accept:"application/json"}})}catch(e){await sleep(RETRY);continue}
      calls++;
      if(r.status===429){   // "taster_exhausted" = kuota harian habis: menunggu tidak ada gunanya; "rate_limited" = tunggu 1 detik
        let code="";try{code=(await r.json()).code||""}catch(e){}
        if(code==="taster_exhausted"){const e=new Error("kuota harian BSD habis (reset 00:00 UTC / 07:00 WITA)");e.fatal=true;throw e}
        await sleep(Math.max(1000,Number(r.headers.get("retry-after")||1)*1000));continue;
      }
      if(r.status===401||r.status===403||r.status===402){const e=new Error("BSD menolak permintaan (HTTP "+r.status+"). Periksa BSD_API_KEY.");e.fatal=true;throw e}
      if(r.status>=500){await sleep(RETRY);continue}
      if(!r.ok)throw new Error("HTTP "+r.status+" ("+url.replace(BASE,"")+")");
      return r.json();
    }
    throw new Error(url.replace(BASE,"")+" gagal setelah 3 percobaan");
  }
  async function pages(path,maxPages=6){
    let url=BASE+path,out=[];
    for(let i=0;i<maxPages&&url;i++){
      if(i>0)await sleep(GAP);
      const j=await get(url);out=out.concat(j.results||[]);url=j.next||null;
    }
    return out;
  }
  const safe=async(name,fn)=>{if(fatal)return[];try{return await fn()}catch(e){errors.push(name+": "+e.message);if(e.fatal)fatal=true;return[]}};

  const events=await safe("events",()=>pages(`/events/?date_from=${from}&date_to=${to}&limit=200`));
  const preds=await safe("predictions",()=>pages(`/predictions/?date_from=${from}&date_to=${to}&limit=200`));
  const leagues=await safe("leagues",()=>pages("/leagues/?limit=200",3));

  const dir=outDir(import.meta.url);mkdirSync(dir,{recursive:true});
  let own=[];try{own=JSON.parse(readFileSync(dir+"data.json","utf8")).matches||[]}catch(e){}
  const {matches,dup,skipped}=buildAll({events,preds,leagues,own});

  const T={2:matches.filter(x=>x.tier===2).length,3:0,4:0};
  const all={updated:new Date(now).toISOString(),week:[from,to],errors:errors.map(e=>"BSD: "+e),matches,
    tiers:T,nPred:T[2],nLeagues:new Set(matches.map(x=>x.league)).size,bsd:{calls,dup,skipped,fatal}};
  writeFileSync(dir+"all.json",JSON.stringify(all));
  if(errors.length)ghWarn("bsd: "+errors.join(" ; "));
  console.log("OK bsd:",matches.length,"laga,",T[2],"berprediksi,",all.nLeagues,"liga;",dup,"sudah dimodelkan sendiri;",calls,"permintaan;",errors.length,"error");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
