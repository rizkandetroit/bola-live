import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {sleep,tfetch,cleanKey,outDir,overDeadline,ghWarn,ghError} from './net.mjs';
const KEY=cleanKey(process.env.PITCHAPI_KEY);
if(!KEY){console.log('PITCHAPI_KEY kosong: integrasi PitchAPI dilewati.');process.exit(0)}
const BASE=(process.env.PITCHAPI_URL||'https://api.pitchapi.dev').replace(/\/+$/,'');
const MAX_LINEUPS=Math.max(1,Number(process.env.PITCH_MAX_LINEUPS||48));
let lastRequest=0;
const MAX_ANALYTICS=Math.max(0,Number(process.env.PITCH_MAX_ANALYTICS||12));
const now=Date.now(),day=t=>new Date(t).toISOString().slice(0,10),add=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
async function get(path){
 const pause=150-(Date.now()-lastRequest);if(pause>0)await sleep(pause);
 if(overDeadline())throw new Error('batas waktu workflow habis');
 let r;try{r=await tfetch(BASE+path,{headers:{'X-API-KEY':KEY}})}catch(e){throw new Error(e.message)}
 if(r.status===429){const wait=Math.min(30000,Number(r.headers.get('retry-after')||5)*1000);await sleep(wait);r=await tfetch(BASE+path,{headers:{'X-API-KEY':KEY}})}
 if(!r.ok){let body='';try{body=await r.text()}catch{};throw new Error('HTTP '+r.status+' '+body.slice(0,180))}
 lastRequest=Date.now();const j=await r.json();if(j.error)throw new Error(j.error.message||j.error.code||'API error');return j.data??j;
}
const today=day(now), dates=[add(today,-1),today,add(today,1),add(today,2)];
const fixtures=[];const errors=[];
for(const d of dates){try{const j=await get('/v1/date/'+d+'?status=all');fixtures.push(...(j.matches||[]))}catch(e){errors.push(d+': '+e.message)}}
const uniq=[...new Map(fixtures.map(x=>[x.id,x])).values()].sort((a,b)=>String(a.time_utc).localeCompare(String(b.time_utc)));
const upcoming=uniq.filter(x=>Date.parse(x.time_utc)>=now-2*3600e3&&Date.parse(x.time_utc)<=now+72*3600e3&&x.status!=='finished').slice(0,MAX_LINEUPS);
const played=uniq.filter(x=>x.status==='finished').sort((a,b)=>Date.parse(b.time_utc)-Date.parse(a.time_utc)).slice(0,MAX_ANALYTICS);
const details={};
async function detail(m,kind,paths){const o={};for(const [key,path] of paths){try{o[key]=await get('/v1/matches/'+encodeURIComponent(m.id)+'/'+path)}catch(e){o[key+'_error']=e.message}}details[m.id]=Object.assign(details[m.id]||{},o)}
for(const m of upcoming){await detail(m,'lineup',[['lineups','lineups']]);}
for(const m of played){await detail(m,'analytics',[['stats','stats'],['advanced','advanced'],['shots','shots']]);}
const out={updated:new Date(now).toISOString(),source:'PitchAPI',fixtures:uniq,details,coverage:{dates,upcoming:upcoming.length,played:played.length,maxLineups:MAX_LINEUPS,maxAnalytics:MAX_ANALYTICS},errors};
const dir=outDir(import.meta.url);mkdirSync(dir,{recursive:true});writeFileSync(dir+'pitch.json',JSON.stringify(out));
console.log('PitchAPI OK:',uniq.length,'fixture;',upcoming.length,'lineup;',played.length,'match analytics;',errors.length,'error');if(errors.length)ghWarn(errors.join(' | '));
