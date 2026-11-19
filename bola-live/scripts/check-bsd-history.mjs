// Cek sekali jalan: apakah prediksi BSD untuk laga yang SUDAH selesai masih tersedia, dan apakah semuanya dibuat
// SEBELUM kickoff (updated_at < event_date)? Kalau ya, data lama aman dipakai untuk uji mundur akurasi.
// Hanya mencetak ringkasan angka ke log. Tidak menulis file situs, tidak mencetak API key.
import {tfetch,cleanKey,sleep} from "./net.mjs";

const KEY=cleanKey(process.env.BSD_API_KEY);
if(!KEY){console.log("BSD_API_KEY kosong: cek dilewati.");process.exit(0)}
const BASE=(process.env.BSD_API||"https://sports.bzzoiro.com/api/v2").replace(/\/+$/,"");
const DAYS=Number(process.env.CHECK_DAYS??90),CHUNK=7,GAP=Number(process.env.GAP_MS??150);
let calls=0;const errs=[];

async function get(url){
  for(let i=0;i<3;i++){
    calls++;
    try{const r=await tfetch(url,{headers:{Authorization:"Token "+KEY,Accept:"application/json"}});
      if(r.status===401||r.status===403)throw Object.assign(new Error("BSD menolak (HTTP "+r.status+")"),{fatal:true});
      if(r.status===429||r.status>=500){await sleep(3000*(i+1));continue}
      if(!r.ok)throw new Error("HTTP "+r.status+" "+url.replace(BASE,""));
      return await r.json()}
    catch(e){if(e.fatal)throw e;if(i===2)throw e;await sleep(2000)}
  }
}
async function all(path){const out=[];let url=BASE+path,p=0;
  while(url&&p<60){const j=await get(url);p++;const rows=Array.isArray(j)?j:(j.results||[]);out.push(...rows);url=Array.isArray(j)?null:j.next;await sleep(GAP)}
  return out}
const day=d=>new Date(d).toISOString().slice(0,10);
const num=v=>v==null||v===""?null:Number(v);
const pct=(a,b)=>b?Math.round(a/b*1000)/10:null;

const now=Date.now(),preds=new Map(),evs=new Map();
for(let k=DAYS;k>0;k-=CHUNK){
  const from=day(now-k*864e5),to=day(now-Math.max(1,k-CHUNK+1)*864e5);
  try{
    for(const p of await all(`/predictions/?date_from=${from}&date_to=${to}&limit=200`))if(p.event&&p.event.id!=null)preds.set(p.event.id,p);
    for(const e of await all(`/events/?status=finished&date_from=${from}&date_to=${to}&limit=200`))evs.set(e.id,e);
    console.log(`${from}..${to}: total prediksi ${preds.size}, laga selesai ${evs.size}`);
  }catch(e){errs.push(from+": "+e.message);if(e.fatal)break}
}

// gabungkan
const rows=[];let noTime=0,late=0,lateMin=[];const leadH=[];
for(const [id,p] of preds){
  const e=evs.get(id);if(!e)continue;
  const h=num(e.home_score),a=num(e.away_score);if(h==null||a==null)continue;
  const mr=(p.markets&&p.markets.match_result)||{};const P=[num(mr.prob_home),num(mr.prob_draw),num(mr.prob_away)];
  if(P.some(x=>x==null))continue;
  const ko=Date.parse(e.event_date),up=Date.parse(p.updated_at),cr=Date.parse(p.created_at);
  if(!Number.isFinite(ko)||!Number.isFinite(up)){noTime++;continue}
  const pre=up<ko;if(!pre){late++;lateMin.push(Math.round((up-ko)/6e4))}
  if(Number.isFinite(cr))leadH.push((ko-cr)/36e5);
  const ou=p.markets.over_under&&num(p.markets.over_under.prob_over_25),bt=p.markets.btts&&num(p.markets.btts.prob_yes);
  rows.push({pre,lg:e.league_name||("liga "+e.league_id),P,r:h>a?0:h===a?1:2,g:h+a,b:h>0&&a>0,ou,bt,t:e.event_date});
}
function score(R){
  const n=R.length;if(!n)return{n:0};
  let hit=0,home=0,br=0,ouN=0,ouH=0,btN=0,btH=0;
  for(const x of R){const s=x.P[0]+x.P[1]+x.P[2]||1,q=x.P.map(v=>v/s),pk=q.indexOf(Math.max(...q));
    if(pk===x.r)hit++;if(x.r===0)home++;br+=q.reduce((t,v,i)=>t+(v-(i===x.r?1:0))**2,0);
    if(x.ou!=null){ouN++;if((x.ou>=50)===(x.g>2))ouH++}if(x.bt!=null){btN++;if((x.bt>=50)===x.b)btH++}}
  return{n,acc:pct(hit,n),homeOnly:pct(home,n),brier:Math.round(br/n*1000)/1000,ou25:pct(ouH,ouN),btts:pct(btH,btN)}
}
const pre=rows.filter(x=>x.pre);
const byLg={};for(const x of pre)(byLg[x.lg]=byLg[x.lg]||[]).push(x);
const calib=[[0,40],[40,50],[50,60],[60,70],[70,101]].map(([lo,hi])=>{const b=pre.filter(x=>{const s=x.P[0]+x.P[1]+x.P[2]||1,m=Math.max(...x.P)/s*100;return m>=lo&&m<hi});
  let hit=0,sum=0;for(const x of b){const s=x.P[0]+x.P[1]+x.P[2]||1,q=x.P.map(v=>v/s*100),m=Math.max(...q);sum+=m;if(q.indexOf(m)===x.r)hit++}
  return{rentang:lo+"-"+(hi>100?100:hi)+"%",n:b.length,rata2Model:b.length?Math.round(sum/b.length*10)/10:null,kenyataan:pct(hit,b.length)}});
leadH.sort((a,b)=>a-b);lateMin.sort((a,b)=>a-b);
const dates=rows.map(x=>x.t).sort();

const out={
  jendelaHari:DAYS,permintaan:calls,error:errs,
  prediksiDiambil:preds.size,lagaSelesaiDiambil:evs.size,pasanganDenganSkor:rows.length,tanpaWaktu:noTime,
  lagaTertua:dates[0]||null,lagaTerbaru:dates[dates.length-1]||null,
  praLaga:{jumlah:pre.length,persen:pct(pre.length,rows.length)},
  diperbaruiSetelahKickoff:{jumlah:late,persen:pct(late,rows.length),menitSetelahKickoff_median:lateMin.length?lateMin[lateMin.length>>1]:null,maks:lateMin.length?lateMin[lateMin.length-1]:null},
  jamDibuatSebelumKickoff_median:leadH.length?Math.round(leadH[leadH.length>>1]*10)/10:null,
  akurasiPraLaga:score(pre),akurasiSemua:score(rows),
  kalibrasi:calib,
  perLiga:Object.entries(byLg).map(([k,v])=>({liga:k,...score(v)})).sort((a,b)=>b.n-a.n).slice(0,25)
};
console.log("=== RINGKASAN CEK RIWAYAT BSD ===");
console.log(JSON.stringify(out,null,1));
