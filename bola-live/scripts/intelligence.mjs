// Intelligence engine V10.
// All historical features are built only from matches strictly earlier than asOf.
// Missing data stays null: it is never silently replaced with zero.
import {fit,predictM,pcts,shrink,r1,level} from './lib.mjs';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const mean=a=>{const x=a.map(num).filter(v=>v!==null);return x.length?x.reduce((s,v)=>s+v,0)/x.length:null};
const sum=a=>a.map(num).filter(v=>v!==null).reduce((s,v)=>s+v,0);
const sideObj=(m,s)=>m?.[s+'_team']||m?.[s+'Team']||null;
const teamId=(m,s)=>sideObj(m,s)?.id??m?.[s+'_id']??null;
const matchTime=m=>Date.parse(m?.time_utc||m?.utcDate||m?.date||'');
const detailOf=(details,id)=>details?.[String(id)]||{};
const norm=(s)=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\b(fc|afc|cf|sc|ac|club|football club)\b/g,'').replace(/\s+/g,' ').trim();

function statXg(d,side){
  const periods=d?.stats?.periods||[];
  // Jangan memakai period pertama (sering 1H) sebagai xG pertandingan penuh.
  const all=periods.find(x=>String(x.period||'').toLowerCase()==='all');
  if(!all)return null;
  for(const group of all.groups||[])for(const item of group.items||[]){
    if(['expected_goals','expected_goals_xg','xg'].includes(String(item.key||'').toLowerCase()))return num(item[side]);
  }
  return null;
}
function shotXg(d,homeId,awayId){
  const out={home:0,away:0,homeN:0,awayN:0};let found=false;
  for(const period of d?.shots?.periods||[])for(const sh of period.shots||[]){
    const x=num(sh.expected_goals);if(x===null)continue;
    if(String(sh.team_id)===String(homeId)){out.home+=x;out.homeN++;found=true}
    else if(String(sh.team_id)===String(awayId)){out.away+=x;out.awayN++;found=true}
  }
  return found?out:null;
}
function advancedSide(d,id,index){
  const teams=d?.advanced?.teams||[];
  // Positional fallback hanya aman bila provider tidak mengirim ID sama sekali.
  const byId=teams.find(x=>x.team?.id!=null&&String(x.team.id)===String(id));
  if(byId)return byId;
  return teams.length>=2&&teams.every(x=>x.team?.id==null)?(teams[index]||null):null;
}
function lineSide(d,side){return d?.lineups?.[side]||null}
function playerStats(d){return d?.playerAdvanced?.players||d?.playersAdvanced?.players||d?.advancedPlayers?.players||[]}
function makeRecord(m,d,side){
  const isHome=side==='home',id=teamId(m,side),opp=teamId(m,isHome?'away':'home'),adv=advancedSide(d,id,isHome?0:1);
  const shots=shotXg(d,teamId(m,'home'),teamId(m,'away'));
  const shotFor=shots?(isHome?shots.homeN:shots.awayN):0;
  const shotAgainst=shots?(isHome?shots.awayN:shots.homeN):0;
  const xgFor=shots&&shotFor>0?(isHome?shots.home:shots.away):statXg(d,isHome?'home':'away');
  const xgAgainst=shots&&shotAgainst>0?(isHome?shots.away:shots.home):statXg(d,isHome?'away':'home');
  const pv=adv?.possession_value||{},de=adv?.defending||{},te=adv?.territory||{},pa=adv?.passing||{},ca=adv?.carrying||{};
  const lineup=lineSide(d,side),players=playerStats(d).filter(p=>String(p.team_id)===String(id));
  const score=m?.score_home==null?null:(isHome?num(m.score_home):num(m.score_away));
  const conceded=m?.score_home==null?null:(isHome?num(m.score_away):num(m.score_home));
  return{
    t:matchTime(m),id:m.id,teamId:id,opponentId:opp,side,
    xgFor,xgAgainst,goalsFor:score,goalsAgainst:conceded,
    ppda:num(de.ppda),fieldTilt:num(te.field_tilt),possession:num(te.possession_pct),
    xt:num(pv.xt_total),vaep:num(pv.vaep_total),
    progressivePasses:num(pa.progressive_passes),progressiveCarries:num(ca.progressive_carries),
    finalThirdEntries:num(te.final_third_entries),boxEntries:num(te.box_entries),
    passes:num(pa.passes),passAccuracy:num(pa.pass_accuracy),
    formation:lineup?.formation||null,
    starters:Array.isArray(lineup?.starters)?lineup.starters:[],
    players
  };
}
function weighted(records,key){
  const vals=records.map((r,i)=>({v:num(r[key]),w:Math.pow(.84,i)})).filter(x=>x.v!==null);
  if(!vals.length)return null;return vals.reduce((s,x)=>s+x.v*x.w,0)/vals.reduce((s,x)=>s+x.w,0);
}
function playerForm(records){
  const map=new Map();
  for(let i=0;i<records.length;i++){
    const r=records[i],w=Math.pow(.84,i);
    for(const p of r.players||[]){
      const id=p.player?.id;if(!id)continue;let x=map.get(String(id));if(!x){x={id:String(id),name:p.player?.name||'Pemain',shirt:p.player?.shirt_number||null,minutes:0,weightedMinutes:0,vaep:0,xt:0,xg:0,xag:0,appearances:0,starts:0,weight:0};map.set(String(id),x)}
      const min=Math.max(0,num(p.minutes_played)||0),pv=p.possession_value||{},cr=p.creation||{};
      x.minutes+=min;x.weightedMinutes+=min*w;x.vaep+=(num(pv.vaep_total)||0)*w;x.xt+=(num(pv.xt_total)||0)*w;
      x.xg+=(num(cr.xg_chain)||0)*w;x.xag+=(num(cr.xag)||0)*w;x.appearances++;x.weight+=w;
    }
  }
  for(const r of records)for(const p of r.starters||[]){
    const id=p.player_id||p.id;if(!id)continue;const x=map.get(String(id));if(x)x.starts++;
  }
  return [...map.values()].map(x=>{
    const mins=Math.max(1,x.weightedMinutes),vaep90=x.vaep/mins*90,xt90=x.xt/mins*90,creation90=(x.xg+x.xag)/mins*90;
    const score=clamp(50+18*Math.tanh(vaep90*2.2)+10*Math.tanh(xt90*7)+10*Math.tanh(creation90*1.6),25,90);
    return{...x,vaep90:r1(vaep90),xt90:r1(xt90),creation90:r1(creation90),score:r1(score),startRate:r1(x.starts/Math.max(1,records.length))};
  });
}
function performance(profile){
  if(!profile||!profile.n)return null;
  const f=[
    [num(profile.xgFor)!==null&&num(profile.xgAgainst)!==null?Math.tanh((profile.xgFor-profile.xgAgainst)/.9):null,.29],
    [num(profile.xt)!==null?Math.tanh(profile.xt/1.0):null,.17],
    [num(profile.vaep)!==null?Math.tanh(profile.vaep/.38):null,.16],
    [num(profile.fieldTilt)!==null?Math.tanh((profile.fieldTilt-50)/17):null,.14],
    [num(profile.ppda)!==null?Math.tanh((10.5-profile.ppda)/4.5):null,.14],
    [num(profile.progression)!==null?Math.tanh((profile.progression-28)/24):null,.10]
  ].filter(x=>x[0]!==null);
  if(!f.length)return null;
  const w=f.reduce((s,x)=>s+x[1],0),raw=f.reduce((s,x)=>s+x[0]*x[1],0)/w;
  return{score:r1(clamp(50+18*raw,25,75)),coverage:r1(w),signals:f.length};
}

// Build a rolling team database from historical games. Only games with t < asOf enter.
export function buildTeamProfiles(fixtures,details,asOf=Date.now(),maxMatches=6){
  const sorted=(fixtures||[]).filter(m=>m&&m.id&&String(m.status).toLowerCase()==='finished'&&matchTime(m)<asOf).sort((a,b)=>matchTime(b)-matchTime(a));
  const byTeam=new Map();
  for(const m of sorted){
    const d=detailOf(details,m.id);
    for(const side of ['home','away']){
      const id=teamId(m,side);if(!id)continue;
      const r=makeRecord(m,d,side);if(!byTeam.has(String(id)))byTeam.set(String(id),[]);byTeam.get(String(id)).push(r);
    }
  }
  const profiles={};
  for(const [id,all] of byTeam){
    const recs=all.slice(0,maxMatches),player=playerForm(recs);
    const lineups=recs.filter(r=>r.starters.length);
    const profile={id,n:recs.length,
      xgFor:weighted(recs,'xgFor'),xgAgainst:weighted(recs,'xgAgainst'),
      ppda:weighted(recs,'ppda'),fieldTilt:weighted(recs,'fieldTilt'),possession:weighted(recs,'possession'),
      xt:weighted(recs,'xt'),vaep:weighted(recs,'vaep'),
      progressivePasses:weighted(recs,'progressivePasses'),progressiveCarries:weighted(recs,'progressiveCarries'),
      finalThirdEntries:weighted(recs,'finalThirdEntries'),boxEntries:weighted(recs,'boxEntries'),
      // Progresi gabungan hanya dihitung bila kedua metrik tersedia; data hilang bukan nol.
      progression:weighted(recs,'progressivePasses')!==null&&weighted(recs,'progressiveCarries')!==null?weighted(recs,'progressivePasses')+weighted(recs,'progressiveCarries'):null,
      formations:{},player,historyLineups:lineups.map(r=>({id:r.id,formation:r.formation,starters:r.starters.map(p=>({id:String(p.player_id||p.id||''),name:p.name||'Pemain'})).filter(p=>p.id)}))
    };
    for(const r of recs)if(r.formation)profile.formations[r.formation]=(profile.formations[r.formation]||0)+1;
    profile.performance=performance(profile);profiles[id]=profile;
  }
  return profiles;
}
function parseFormation(s){
  if(!s)return null;const a=String(s).split('-').map(Number);if(a.length<3||a.some(x=>!Number.isFinite(x)))return null;
  return{defenders:a[0],midfielders:a.slice(1,-1).reduce((x,y)=>x+y,0),forwards:a[a.length-1],raw:String(s)};
}
function scoreProb(delta,scale=35,draw=.26){
  const h=1/(1+Math.pow(10,-delta/scale)),d=draw,a=1-h;
  const x=[(1-d)*h*100,d*100,(1-d)*a*100],s=x.reduce((u,v)=>u+v,0);return x.map(v=>v*100/s/100);
}
function avgAvailable(values){const x=values.map(num).filter(v=>v!==null);return x.length?mean(x):null}
function lineupInfo(profile,lineup){
  if(!lineup||!Array.isArray(lineup.starters)||!lineup.starters.length)return{available:false,score:null,xiScore:null,benchScore:null,starters:0,subs:0,confirmed:lineup?.confirmed===true,formation:lineup?.formation||null,absences:[],absencePenalty:0};
  const players=new Map((profile?.player||[]).map(p=>[String(p.id),p]));
  const value=p=>players.get(String(p.player_id||p.id||''))?.score??null;
  const xi=lineup.starters,bench=Array.isArray(lineup.subs)?lineup.subs:[];
  const knownXI=xi.filter(p=>value(p)!==null).length,knownBench=bench.filter(p=>value(p)!==null).length;
  // Jangan mengarang skor kekuatan 50 untuk pemain yang tidak punya data historis.
  const xiScore=knownXI>=5?mean(xi.map(value)):null,benchScore=knownBench>=2?mean(bench.map(value)):null;
  const current=new Set([...xi,...bench].map(p=>String(p.player_id||p.id||'')));
  const starting=new Set(xi.map(p=>String(p.player_id||p.id||'')));
  const startersHist=new Map();for(const r of profile?.historyLineups||[])for(const p of r.starters||[]){const x=startersHist.get(p.id)||{name:p.name,starts:0};x.starts++;startersHist.set(p.id,x)}
  const absences=[];let penalty=0;
  for(const p of profile?.player||[]){
    const h=startersHist.get(String(p.id));if(!h||h.starts<2||p.startRate<.45||p.score<56||starting.has(String(p.id)))continue;
    const onBench=current.has(String(p.id));const impact=Math.max(0,p.score-50)*p.startRate*(onBench ? .42 : 1);
    if(impact<2)continue;penalty+=impact;
    absences.push({id:p.id,name:p.name||h.name,status:onBench?'Cadangan':'Tidak tercantum di XI/cadangan',startRate:p.startRate,score:p.score,impact:r1(impact),confirmedAbsent:false});
  }
  absences.sort((a,b)=>b.impact-a.impact);
  const effectiveXi=xiScore===null?null:r1(clamp(xiScore-Math.min(18,penalty*.32),20,95));
  const squadScore=effectiveXi===null?null:r1(benchScore===null?effectiveXi:clamp(effectiveXi*.82+benchScore*.18,20,95));
  return{available:true,score:squadScore,xiScore:xiScore===null?null:r1(xiScore),effectiveXi,benchScore:benchScore===null?null:r1(benchScore),knownXI,knownBench,playerCoverage:r1(knownXI/Math.max(1,xi.length)*100),starters:xi.length,subs:bench.length,confirmed:lineup.confirmed===true,lineupType:lineup.lineup_type||null,formation:lineup.formation||null,coach:lineup.coach?.name||null,absences:absences.slice(0,5),absencePenalty:r1(Math.min(18,penalty*.32)),sample:profile?.n||0};
}
function tactics(home,away,hLine,aLine){
  const hf=parseFormation(hLine?.formation),af=parseFormation(aLine?.formation),hp=home?.performance,ap=away?.performance;
  let edge=0;const notes=[];
  if(hf&&af){
    const diff=hf.midfielders-af.midfielders;
    if(Math.abs(diff)>=2){edge+=clamp(diff*1.1,-3.5,3.5);notes.push(diff>0?'Tuan rumah punya potensi kelebihan jumlah pemain di lini tengah.':'Tim tamu punya potensi kelebihan jumlah pemain di lini tengah.');}
    if(hf.defenders===3&&af.forwards>=2)notes.push('Skema tiga bek tuan rumah menghadapi minimal dua penyerang; ruang sayap dan cover wing-back perlu diperhatikan.');
    if(af.defenders===3&&hf.forwards>=2)notes.push('Skema tiga bek tim tamu menghadapi minimal dua penyerang; ruang sayap dan cover wing-back perlu diperhatikan.');
    if(hf.defenders===4&&af.forwards===1)notes.push('Empat bek tuan rumah berpotensi menjaga area belakang melawan satu penyerang utama.');
    if(af.defenders===4&&hf.forwards===1)notes.push('Empat bek tim tamu berpotensi menjaga area belakang melawan satu penyerang utama.');
  }
  if(num(home?.ppda)!==null&&num(away?.ppda)!==null){const press=clamp((away.ppda-home.ppda)*.7,-3,3);edge+=press;if(Math.abs(press)>1)notes.push((press>0?'Pressing tuan rumah':'Pressing tim tamu')+' lebih agresif berdasarkan PPDA yang lebih rendah.');}
  if(hp&&ap&&Math.abs(hp.score-ap.score)>4)notes.push((hp.score>ap.score?'Tuan rumah':'Tim tamu')+' membawa performa wilayah/progresi yang lebih baik dari sampel pertandingan terakhir.');
  if(!notes.length)notes.push('Belum ada ketimpangan taktik yang cukup kuat dari formasi dan metrik yang tersedia.');
  return{homeFormation:hLine?.formation||null,awayFormation:aLine?.formation||null,homeShape:hf,awayShape:af,edge:r1(clamp(edge,-7,7)),notes,available:!!(hf&&af)};
}
export function buildMatchContext(fixture,detail,profiles){
  const hi=String(teamId(fixture,'home')||''),ai=String(teamId(fixture,'away')||''),hp=profiles?.[hi]||null,ap=profiles?.[ai]||null;
  const hl=lineSide(detail,'home'),al=lineSide(detail,'away');
  const homeLineup=lineupInfo(hp,hl),awayLineup=lineupInfo(ap,al);
  return{
    teams:{home:{id:hi,profile:hp,performance:hp?.performance||null,lineup:homeLineup},away:{id:ai,profile:ap,performance:ap?.performance||null,lineup:awayLineup}},
    tactical:tactics(hp,ap,hl,al),
    availability:{home:homeLineup.absences||[],away:awayLineup.absences||[]},
    coverage:{homeHistory:hp?.n||0,awayHistory:ap?.n||0,homeLineup:homeLineup.available,awayLineup:awayLineup.available}
  };
}
function poisson(lambda,max=10){const p=[Math.exp(-lambda)];for(let i=1;i<=max;i++)p.push(p[i-1]*lambda/i);return p;}
function scoreDist(lh,la){const ph=poisson(lh),pa=poisson(la);let h=0,d=0,a=0,over=0,btts=0,best=[0,0,0],all=[];
  for(let i=0;i<ph.length;i++)for(let j=0;j<pa.length;j++){const p=ph[i]*pa[j];if(i>j)h+=p;else if(i===j)d+=p;else a+=p;if(i+j>2)over+=p;if(i>0&&j>0)btts+=p;if(p>best[2])best=[i,j,p];all.push([i,j,p]);}
  const z=h+d+a||1;return{p:[h/z*100,d/z*100,a/z*100],ou:r1(over/z*100),bt:r1(btts/z*100),ms:[best[0],best[1],r1(best[2]/z*100)],sc5:all.sort((x,y)=>y[2]-x[2]).slice(0,5).map(x=>[x[0],x[1],r1(x[2]/z*100)])};
}
function probsFromRate(h,a){return scoreDist(clamp(h,.2,4.5),clamp(a,.2,4.5)).p;}
function deltaProb(delta,scale=38,draw=.26){const home=1/(1+Math.pow(10,-delta/scale));return[(1-draw)*home*100,draw*100,(1-draw)*(1-home)*100];}
const WEIGHTS={poisson:.45,elo:.20,xg:.15,performance:.10,lineup:.07,tactical:.03};
export function predictV10(base,context,options={}){
  const raw=base?.raw||base?.poisson||{h:base?.h,d:base?.d,a:base?.a};
  const poissonP=[num(raw.h),num(raw.d),num(raw.a)];
  const elo=base?.pe||base?.elo||null,eloP=elo?[num(elo.h),num(elo.d),num(elo.a)]:null;
  const H=context?.teams?.home||{},A=context?.teams?.away||{},hp=H.profile,ap=A.profile;
  const xgh=hp&&ap&&num(hp.xgFor)!==null&&num(ap.xgAgainst)!==null?(hp.xgFor+ap.xgAgainst)/2:null;
  const xga=hp&&ap&&num(ap.xgFor)!==null&&num(hp.xgAgainst)!==null?(ap.xgFor+hp.xgAgainst)/2:null;
  const xgP=xgh!==null&&xga!==null?probsFromRate(xgh*1.06,xga):null;
  const perfH=H.performance?.score,perfA=A.performance?.score;
  const perfP=perfH!==null&&perfH!==undefined&&perfA!==null&&perfA!==undefined?deltaProb(perfH-perfA,34,.26):null;
  const lineH=H.lineup?.score,lineA=A.lineup?.score;
  const lineP=lineH!==null&&lineH!==undefined&&lineA!==null&&lineA!==undefined&&H.lineup?.starters>=8&&A.lineup?.starters>=8?deltaProb(lineH-lineA,42,.25):null;
  const tactic=context?.tactical?.available&&num(context.tactical.edge)!==null?deltaProb(context.tactical.edge,10,.27):null;
  const candidates={poisson:poissonP,elo:eloP,xg:xgP,performance:perfP,lineup:lineP,tactical:tactic};
  const actual=Object.entries(candidates).filter(([k,v])=>v&&v.every(x=>x!==null&&Number.isFinite(x)));
  const weightTotal=actual.reduce((s,[k])=>s+WEIGHTS[k],0)||1,weights={};
  const blended=[0,0,0];for(const [k,v] of actual){const w=WEIGHTS[k]/weightTotal;weights[k]=r1(w*100);for(let i=0;i<3;i++)blended[i]+=v[i]*w;}
  const fr=base?.fr||null,lam=clamp(num(options.lambda)??.075,0,.5),calibrated=fr?shrink(blended,fr,lam):blended;
  const baseGoals=base?.xg||base?.lambda||[1.35,1.15];
  const gHome=num(baseGoals[0])??1.35,gAway=num(baseGoals[1])??1.15;
  const perfDelta=perfH!=null&&perfA!=null?(perfH-perfA)/50:0;
  const lineDelta=lineH!=null&&lineA!=null?(lineH-lineA)/50:0;
  const tactDelta=num(context?.tactical?.edge)||0;
  const lambdaHome=clamp((xgh !== null ? .72*gHome+.28*xgh : gHome)*Math.exp(.10*perfDelta+.055*lineDelta+.035*tactDelta/7),.2,4.5);
  const lambdaAway=clamp((xga !== null ? .72*gAway+.28*xga : gAway)*Math.exp(-.10*perfDelta-.055*lineDelta-.035*tactDelta/7),.2,4.5);
  const goals=scoreDist(lambdaHome,lambdaAway);
  const s=calibrated.reduce((a,b)=>a+b,0)||100;
  const h=r1(calibrated[0]/s*100),d=r1(calibrated[1]/s*100),a=r1(100-h-d);
  const reasons=[];
  if(xgP)reasons.push('xG/xGA rolling '+(hp.n||0)+' dan '+(ap.n||0)+' laga masuk ke model.');
  if(perfP)reasons.push('PPDA, field tilt, xT, VAEP dan progresi serangan diringkas menjadi skor performa tim.');
  if(lineP)reasons.push('Nilai XI dan bangku cadangan ikut dihitung; pemain reguler yang tidak masuk XI diberi penalti indikatif.');
  if(tactic)reasons.push('Formasi dan kecocokan taktik memberi penyesuaian kecil, bukan penentu tunggal.');
  if(!lineP)reasons.push('Bobot line-up dikeluarkan karena susunan belum lengkap/tersedia; tidak diganti dengan angka rekaan.');
  if(!xgP||!perfP)reasons.push('Sebagian metrik tim belum tersedia; bobot yang kosong dinormalisasi ke komponen yang ada.');
  return{
    engine:'V10',h,d,a,raw:{h:poissonP[0],d:poissonP[1],a:poissonP[2]},components:Object.fromEntries(actual.map(([k,v])=>[k,v.map(x=>r1(x))])),weights,
    lambda:[r1(lambdaHome),r1(lambdaAway)],xg:[r1(lambdaHome),r1(lambdaAway)],ms:goals.ms,sc5:goals.sc5,ou:goals.ou,bt:goals.bt,
    lineup:{home:lineH??null,away:lineA??null,homeXI:H.lineup?.xiScore??null,awayXI:A.lineup?.xiScore??null,homeBench:H.lineup?.benchScore??null,awayBench:A.lineup?.benchScore??null,homeConfirmed:H.lineup?.confirmed??false,awayConfirmed:A.lineup?.confirmed??false,homeAbsences:H.lineup?.absences||[],awayAbsences:A.lineup?.absences||[]},
    performance:{home:perfH??null,away:perfA??null,homeGames:hp?.n||0,awayGames:ap?.n||0},
    tactical:context?.tactical||null,reasons,coverage:context?.coverage||null,calibrationLambda:lam
  };
}
function metric(rows,key,odds=2,minProb=.55){
  const n=rows.length;if(!n)return{n:0,acc:null,brier:null,ll:null,roi:null,profit:null,staked:0,bets:0};
  let hit=0,brier=0,ll=0,profit=0,staked=0,bets=0;
  for(const r of rows){const p=r[key],pick=p.indexOf(Math.max(...p));if(pick===r.o)hit++;
    for(let i=0;i<3;i++)brier+=(p[i]/100-(i===r.o?1:0))**2;
    ll-=Math.log(Math.max(p[r.o]/100,1e-6));
    const max=Math.max(...p)/100;if(max>=minProb){bets++;staked++;profit+=pick===r.o?odds-1:-1;}
  }
  return{n,acc:r1(hit/n*100),brier:r1(brier/n*1000)/1000,ll:r1(ll/n*1000)/1000,roi:staked?r1(profit/staked*100):null,profit:r1(profit),staked,bets,odds,minProb:r1(minProb*100)};
}
function bestLambda(rows,key){
  if(rows.length<30)return .075;
  let best=.075,bestLoss=Infinity;
  for(let l=0;l<=.5;l+=.025){let loss=0;for(const r of rows){const p=shrink(r[key],r.fr,l);loss-=Math.log(Math.max(p[r.o]/100,1e-6));}if(loss<bestLoss){bestLoss=loss;best=l;}}
  return best;
}
export function backtestV10(fixtures,details,options={}){
  const ordered=(fixtures||[]).filter(m=>String(m.status).toLowerCase()==='finished'&&m.score_home!=null&&m.score_away!=null).sort((a,b)=>matchTime(a)-matchTime(b));
  const results=[],minGames=options.minGames??3,odds=options.odds??2,minProb=options.minProb??.55;
  const previous=[];
  for(const m of ordered){
    const t=matchTime(m),hid=teamId(m,'home'),aid=teamId(m,'away');if(!hid||!aid)continue;
    const old=ordered.filter(x=>matchTime(x)<t),hg=old.filter(x=>String(teamId(x,'home'))===String(hid)||String(teamId(x,'away'))===String(hid)).length,ag=old.filter(x=>String(teamId(x,'home'))===String(aid)||String(teamId(x,'away'))===String(aid)).length;
    if(hg<minGames||ag<minGames)continue;
    const ms=old.map(x=>({t:matchTime(x),h:teamId(x,'home'),a:teamId(x,'away'),gh:num(x.score_home),ga:num(x.score_away)}));
    const model=fit(ms,t),p=predictM(model,hid,aid),base=pcts(p);
    const fr=p.fr,lam9=bestLambda(previous,'v9base'),lam10=bestLambda(previous,'v10base');
    const ctx=buildMatchContext(m,detailOf(details,m.id),buildTeamProfiles(ordered,details,t,6));
    const v10raw=predictV10({raw:{h:p.h,d:p.d,a:p.a},pe:p.pe,xg:p.xg,fr,lam:0.075},{...ctx},{lambda:0});
    const v10=shrink([v10raw.h,v10raw.d,v10raw.a],fr,lam10);
    const v8=[p.h,p.d,p.a],v9=shrink(base.pb,fr,lam9);
    const result={t,o:num(m.score_home)>num(m.score_away)?0:num(m.score_home)===num(m.score_away)?1:2,fr,v8,v9,v10,home:sideObj(m,'home')?.name,away:sideObj(m,'away')?.name,lg:m.league?.name||m.league_name||'PitchAPI'};
    results.push(result);previous.push({fr,v9base:base.pb,v10base:[v10raw.h,v10raw.d,v10raw.a],o:result.o});
  }
  const versions={
    v8:{...metric(results,'v8',odds,minProb),label:'V8 benchmark proxy (Poisson-only)',note:'Bukan kode V8 asli; dipakai sebagai baseline Poisson karena arsip V8 tidak ada di paket yang diunggah.'},
    v9:{...metric(results,'v9',odds,minProb),label:'V9 (Poisson + Elo 70/30 + kalibrasi)'},
    v10:{...metric(results,'v10',odds,minProb),label:'V10 (fitur line-up, xG dan taktik)'}
  };
  return{updated:new Date().toISOString(),n:results.length,minGames,simulation:{odds,minProbability:r1(minProb*100),unitStake:1,description:'Simulasi datar: taruhan 1 unit pada peluang tertinggi bila probabilitas >= ambang, dengan odds desimal asumsi. Bukan odds historis/bookmaker.'},versions,coverage:{fixtures:ordered.length,details:Object.keys(details||{}).length},results:results.slice(-200)};
}

export function matchFixtureForSite(match,fixtures){
  const h=norm(match?.home?.name),a=norm(match?.away?.name),t=Date.parse(match?.utc||'');if(!h||!a||!Number.isFinite(t))return null;
  let best=null,delta=Infinity;
  for(const f of fixtures||[]){const fh=norm(sideObj(f,'home')?.name),fa=norm(sideObj(f,'away')?.name),ft=matchTime(f);if(fh!==h||fa!==a||!Number.isFinite(ft))continue;const d=Math.abs(ft-t);if(d<delta){best=f;delta=d}}
  return delta<=6*3600e3?best:null;
}
export function applyV10ToSiteFile(filePath,fixtures,details,profiles,lambda=.075){
  let data;try{data=JSON.parse((awaitlessRead(filePath)))}catch{return{updated:0}}
  if(!Array.isArray(data.matches))return{updated:0};let updated=0;
  for(const m of data.matches){if(!m.p||m.status!=='NS')continue;const f=matchFixtureForSite(m,fixtures);if(!f)continue;
    const ctx=buildMatchContext(f,detailOf(details,f.id),profiles),p=m.p;
    const old={h:p.h,d:p.d,a:p.a,ou:p.ou,bt:p.bt,ms:p.ms};
    const v10=predictV10({raw:p.raw||p,pe:p.pe,xg:p.xg,fr:p.fr,lam:lambda},ctx,{lambda:lambda*.5});
    p.v9=p.v9||old;p.v10=v10;p.engine='V10';p.h=v10.h;p.d=v10.d;p.a=v10.a;p.xg=v10.lambda;p.ou=v10.ou;p.bt=v10.bt;p.ms=v10.ms;p.sc5=v10.sc5;
    m.pick=p.h>=p.a?'h':'a';m.edge=r1(Math.abs(p.h-p.a));m.level=level(m.edge);updated++;
  }
  awaitlessWrite(filePath,JSON.stringify(data));return{updated};
}
// These wrappers keep this module's public API synchronous while using the runtime's fs module.
import {readFileSync as awaitlessRead,writeFileSync as awaitlessWrite} from 'node:fs';
