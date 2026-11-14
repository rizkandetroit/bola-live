import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {sleep,tfetch,cleanKey,outDir,overDeadline,ghWarn,ghError} from './net.mjs';
import {buildTeamProfiles,buildMatchContext,predictV10,backtestV10,applyV10ToSiteFile} from './intelligence.mjs';

const KEY=cleanKey(process.env.PITCHAPI_KEY);
if(!KEY){console.log('PITCHAPI_KEY kosong: integrasi PitchAPI/V10 dilewati.');process.exit(0)}
const BASE=(process.env.PITCHAPI_URL||'https://api.pitchapi.dev').replace(/\/+$/,'');
const MAX_LINEUPS=Math.max(1,Number(process.env.PITCH_MAX_LINEUPS||48));
const MAX_ANALYTICS=Math.max(0,Number(process.env.PITCH_MAX_ANALYTICS||12));
const HISTORY_PER_TEAM=Math.max(2,Number(process.env.PITCH_HISTORY_PER_TEAM||5));
const MAX_HISTORY=Math.max(0,Number(process.env.PITCH_MAX_HISTORY_MATCHES||80));
// Tampilan utama: 'lite' = model ringkas gol 60 + xG 25 + Elo 15 (bawaan); 'v10' = V10 penuh. Keduanya selalu dihitung dan dibandingkan di tab Evaluasi.
const HEADLINE=process.env.V10_HEADLINE==='v10'?'v10':'lite';
// Syarat aktivasi xG: minimal laga berdata xG per tim (bawaan 3 karena riwayat per tim di workflow hanya 4 laga).
const MIN_XG=Math.max(1,Number(process.env.V10_MIN_XG_GAMES||3));
const FUTURE_DAYS=Math.max(7,Number(process.env.PITCH_FUTURE_DAYS||31));
const now=Date.now(),day=t=>new Date(t).toISOString().slice(0,10),add=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
let lastRequest=0;
async function get(path){
 const pause=150-(Date.now()-lastRequest);if(pause>0)await sleep(pause);
 if(overDeadline())throw new Error('batas waktu workflow habis');
 let r;try{r=await tfetch(BASE+path,{headers:{'X-API-KEY':KEY}})}catch(e){throw new Error(e.message)}
 if(r.status===429){const wait=Math.min(30000,Number(r.headers.get('retry-after')||5)*1000);await sleep(wait);r=await tfetch(BASE+path,{headers:{'X-API-KEY':KEY}})}
 if(!r.ok){let body='';try{body=await r.text()}catch{};throw new Error('HTTP '+r.status+' '+body.slice(0,180))}
 lastRequest=Date.now();const j=await r.json();if(j.error)throw new Error((j.error.code||'API_ERROR')+': '+(j.error.message||'API error'));return j.data??j;
}
const today=day(now),dates=[add(today,-1),today,add(today,1),add(today,2)];
const fixtures=[],errors=[];
for(const d of dates){try{const j=await get('/v1/date/'+d+'?status=all');fixtures.push(...(j.matches||[]))}catch(e){errors.push(d+': '+e.message)}}
const uniq=[...new Map(fixtures.filter(x=>x?.id).map(x=>[String(x.id),x])).values()].sort((a,b)=>String(a.time_utc).localeCompare(String(b.time_utc)));
const isFinished=x=>String(x?.status||'').toLowerCase()==='finished';
const isUpcoming=x=>!isFinished(x)&&Date.parse(x?.time_utc)>=now-2*3600e3&&Date.parse(x?.time_utc)<=now+FUTURE_DAYS*864e5;
const dateUpcoming=uniq.filter(x=>isUpcoming(x)&&Date.parse(x.time_utc)<=now+72*3600e3).slice(0,MAX_LINEUPS);
const datePlayed=uniq.filter(isFinished).sort((a,b)=>Date.parse(b.time_utc)-Date.parse(a.time_utc)).slice(0,MAX_ANALYTICS);

// Discover the active PitchAPI leagues from the fixtures, then fetch the current-season schedule
// once per league. This supplies fixtures beyond the short date endpoint window and recent team history.
const leagueIds=[...new Set(uniq.map(x=>x.league?.id).filter(Boolean).map(String))];
const leagueSchedules=[],scheduleErrors=[];
for(const id of leagueIds){
 try{
  const j=await get('/v1/leagues/'+encodeURIComponent(id)+'/matches?status=all');
  const list=j.matches||[];leagueSchedules.push(...list);
 }catch(e){scheduleErrors.push(id+': '+e.message)}
}
const scheduleById=new Map();
for(const f of [...uniq,...leagueSchedules])if(f?.id)scheduleById.set(String(f.id),f);
const allSchedule=[...scheduleById.values()];
const schedule=allSchedule.filter(x=>isUpcoming(x)&&Date.parse(x.time_utc)<=now+FUTURE_DAYS*864e5).sort((a,b)=>Date.parse(a.time_utc)-Date.parse(b.time_utc));

// For every team with a scheduled match in the prediction window, collect its latest N completed matches.
const targetTeams=new Set();for(const m of schedule){if(m.home_team?.id)targetTeams.add(String(m.home_team.id));if(m.away_team?.id)targetTeams.add(String(m.away_team.id));}
const histCandidates=new Map();
for(const team of targetTeams){
 const games=allSchedule.filter(m=>isFinished(m)&&Date.parse(m.time_utc)<now&&Date.parse(m.time_utc)>=now-210*864e5&&
   (String(m.home_team?.id)===team||String(m.away_team?.id)===team))
  .sort((a,b)=>Date.parse(b.time_utc)-Date.parse(a.time_utc)).slice(0,HISTORY_PER_TEAM);
 for(const m of games)histCandidates.set(String(m.id),m);
}
const historyFixtures=[...histCandidates.values()].sort((a,b)=>Date.parse(b.time_utc)-Date.parse(a.time_utc)).slice(0,MAX_HISTORY);
// Include the latest completed date fixtures as a fallback when a league schedule is unavailable.
for(const m of datePlayed)if(!historyFixtures.some(x=>String(x.id)===String(m.id))&&historyFixtures.length<MAX_HISTORY)historyFixtures.push(m);

const details={};
async function detail(m,paths){
 const o=details[m.id]||{};
 for(const [key,path] of paths){
  try{o[key]=await get('/v1/matches/'+encodeURIComponent(m.id)+'/'+path)}
  catch(e){o[key+'_error']=e.message}
 }
 details[m.id]=o;
}
const lineupCandidates=[...dateUpcoming,...schedule.filter(x=>Date.parse(x.time_utc)>=now-2*3600e3&&Date.parse(x.time_utc)<=now+48*3600e3)];
const lineupSet=new Map();for(const m of lineupCandidates)if(!lineupSet.has(String(m.id))&&lineupSet.size<MAX_LINEUPS)lineupSet.set(String(m.id),m);
for(const m of lineupSet.values())await detail(m,[['lineups','lineups']]);
for(const m of historyFixtures){
 await detail(m,[['lineups','lineups'],['stats','stats'],['advanced','advanced'],['shots','shots'],['playerAdvanced','advanced/players']]);
}
// Ensure the latest played matches remain visible in the analytics tab even if the league history is sparse.
for(const m of datePlayed)if(!details[m.id])await detail(m,[['stats','stats'],['advanced','advanced'],['shots','shots']]);

const profiles=buildTeamProfiles(historyFixtures,details,now,6);
const intelligence={};
for(const m of schedule){
 const d=details[m.id]||{};
 intelligence[m.id]=buildMatchContext(m,d,profiles);
}
for(const m of datePlayed){if(!intelligence[m.id])intelligence[m.id]=buildMatchContext(m,details[m.id]||{},profiles)}

const dir=outDir(import.meta.url);mkdirSync(dir,{recursive:true});
// Apply V10 to the existing schedule data wherever a PitchAPI fixture can be matched safely by teams + kickoff.
let calibration=.15;
try{const d=JSON.parse(readFileSync(join(dir,'data.json'),'utf8'));calibration=Number(d.cal?.lam??.15)}catch{}
let extXg=null;try{extXg=JSON.parse(readFileSync(join(dir,'understat.json'),'utf8'))}catch{}
const patched={};
for(const name of ['data.json','all.json','world.json']){
 const path=join(dir,name);if(!existsSync(path))continue;
 patched[name]=applyV10ToSiteFile(path,allSchedule,details,profiles,calibration,{headline:HEADLINE,minXgGames:MIN_XG,extXg});
}

const bt=backtestV10(historyFixtures,details,{minGames:3,odds:Number(process.env.V10_SIM_ODDS||2),minProb:Number(process.env.V10_SIM_MIN_PROB||.55),minXgGames:MIN_XG});
let evalData={};try{evalData=JSON.parse(readFileSync(join(dir,'eval.json'),'utf8'))}catch{}
evalData.v10Comparison=bt;evalData.v10Comparison.updated=new Date().toISOString();
writeFileSync(join(dir,'eval.json'),JSON.stringify(evalData));

const out={
 updated:new Date(now).toISOString(),source:'PitchAPI',fixtures:uniq,schedule:schedule.slice(0,500),details,intelligence,
 coverage:{dates,upcoming:lineupSet.size,played:datePlayed.length,history:historyFixtures.length,teams:targetTeams.size,activeLeagues:leagueIds.length,maxLineups:MAX_LINEUPS,maxAnalytics:MAX_ANALYTICS,maxHistory:MAX_HISTORY,historyPerTeam:HISTORY_PER_TEAM,headline:HEADLINE,minXgGames:MIN_XG,patched},
 errors:[...errors,...scheduleErrors]
};
writeFileSync(join(dir,'pitch.json'),JSON.stringify(out));
console.log('PitchAPI/V10 OK:',uniq.length,'fixture tanggal;',schedule.length,'jadwal sebulan;',lineupSet.size,'line-up;',historyFixtures.length,'laga riwayat;',Object.keys(profiles).length,'profil tim;',bt.n,'laga backtest V10; patch',JSON.stringify(patched));
if(errors.length||scheduleErrors.length)ghWarn([...errors,...scheduleErrors].join(' | '));
