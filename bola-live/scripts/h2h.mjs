import {mkdirSync,writeFileSync,readFileSync} from "node:fs";
import {sleep,tfetch,cleanKey,siteBase,outDir,overDeadline,ghWarn} from "./net.mjs";

const KEY=cleanKey(process.env.API_FOOTBALL_KEY);
if(!KEY){console.log("API_FOOTBALL_KEY kosong: langkah H2H dilewati.");process.exit(0)}

const API=(process.env.APIF_API||"https://v3.football.api-sports.io").replace(/\/+$/,"");
const TTL=Number(process.env.H2H_TTL_MS??3*864e5); // Cache 3 hari
const MAXC=Number(process.env.H2H_MAX_CALLS??10);  // Maksimal 10 request per run
const GAP=Number(process.env.GAP_MS??7000);
const now=Date.now();
const dir=outDir(import.meta.url);mkdirSync(dir,{recursive:true});

async function loadJ(file){
  try{
    const base=siteBase();if(base){const r=await tfetch(base+file+"?t="+Date.now());if(r.ok)return await r.json()}
  }catch(e){}
  try{return JSON.parse(readFileSync(dir+file,"utf8"))}catch(e){return null}
}

const all=await loadJ("all.json");
const h2hCache=await loadJ("h2h-cache.json")||{updated:now,pairs:{}};

if(!all || !all.matches){console.log("all.json tidak ada, H2H dilewati.");process.exit(0)}

// Cari laga NS dalam 48 jam ke depan
const uniquePairs=new Map();
for(const m of all.matches){
  if(!m.hi || !m.ai) continue;
  if(m.status !== "NS") continue;
  const t = Date.parse(m.utc);
  if(t < now || t > now+48*36e5) continue;
  
  const pairKey=`${Math.min(m.hi,m.ai)}-${Math.max(m.hi,m.ai)}`;
  if(!uniquePairs.has(pairKey)) uniquePairs.set(pairKey,{pairKey,hi:m.hi,ai:m.ai});
}

let calls=0;
const errors=[];
for(const [pairKey,p] of uniquePairs) {
  const c=h2hCache.pairs[pairKey];
  if(c && now-c.t < TTL) continue; // Cache masih segar
  if(calls>=MAXC) { errors.push("Batas permintaan H2H tercapai"); break; }
  if(overDeadline()) break;
  
  if(calls>0) await sleep(GAP);
  try{
    const r=await tfetch(`${API}/fixtures/headtohead?h2h=${p.hi}-${p.ai}&last=10`,{headers:{"x-apisports-key":KEY}});
    calls++;
    if(r.status===429) throw new Error("HTTP 429 (Rate Limit)");
    if(!r.ok) throw new Error("HTTP "+r.status);
    const j=await r.json();
    if(j.errors && Object.keys(j.errors).length) throw new Error(Object.values(j.errors).join("; "));
    
    let hW=0,d=0,aW=0,gf=0,ga=0;const last=[];
    for(const f of j.response){
      const isHome = f.teams.home.id === p.hi;
      const gh = isHome ? f.goals.home : f.goals.away;
      const ga = isHome ? f.goals.away : f.goals.home;
      if(gh==null||ga==null) continue;
      gf+=gh;ga+=ga;
      if(gh>ga) hW++; else if(gh<ga) aW++; else d++;
      last.push({t:f.fixture.date.slice(0,10),s:[gh,ga],l:f.league.name});
    }
    last.sort((a,b)=>b.t.localeCompare(a.t));
    h2hCache.pairs[pairKey]={t:now,n:last.length,hW,d,aW,gf,ga,last:last.slice(0,5)};
  }catch(e){
    errors.push(pairKey+": "+e.message);
    if(e.message.includes("429")) break;
  }
}

h2hCache.updated=now;
for(const k of Object.keys(h2hCache.pairs)) if(now-h2hCache.pairs[k].t > 30*864e5) delete h2hCache.pairs[k];
writeFileSync(dir+"h2h-cache.json",JSON.stringify(h2hCache));

// Terapkan ke all.json
let updated=0;
for(const m of all.matches){
  if(m.status!=="NS" || !m.hi || !m.ai) continue;
  const pairKey=`${Math.min(m.hi,m.ai)}-${Math.max(m.hi,m.ai)}`;
  const c=h2hCache.pairs[pairKey];
  if(c){
    const rev = m.hi > m.ai; 
    m.h2h = {
      n: c.n,
      hW: rev ? c.aW : c.hW,
      d: c.d,
      aW: rev ? c.hW : c.aW,
      gf: rev ? c.ga : c.gf,
      ga: rev ? c.gf : c.ga,
      last: c.last.map(x => ({...x, s: rev ? [x.s[1], x.s[0]] : x.s}))
    };
    updated++;
  }
}
writeFileSync(dir+"all.json",JSON.stringify(all));
console.log("H2H OK:",updated,"laga diperbarui.",calls,"permintaan.");
if(errors.length)ghWarn("H2H: "+errors.join(" ; "));
