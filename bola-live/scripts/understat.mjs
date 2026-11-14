// Mengambil xG tim dari Understat (gratis, tanpa kunci) untuk 5 liga Eropa, lalu memakainya di model ringkas.
// Understat tidak punya API resmi: skrip ini mencoba endpoint JSON dulu, lalu membaca data yang tertanam di halaman liga.
// Bila gagal, skrip tetap selesai (exit 0) dan model otomatis kembali ke gol 70% + Elo 30%.
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {sleep,tfetch,siteBase,outDir,ghWarn} from './net.mjs';
import {applyExternalXgToSiteFile,teamKey} from './intelligence.mjs';

export const LEAGUES=['EPL','La_liga','Bundesliga','Serie_A','Ligue_1'];
// Musim Understat dinamai tahun mulainya: Juli ke atas = musim baru.
export const seasonOf=(d=new Date())=>d.getUTCMonth()>=6?d.getUTCFullYear():d.getUTCFullYear()-1;
const HEADERS={'User-Agent':'Mozilla/5.0 (compatible; bola-live)','Accept':'application/json, text/html;q=0.8'};

// Halaman liga menaruh data sebagai JSON.parse('...') dengan karakter ber-escape \xNN.
export function parseHtml(html){
  const m=/datesData\s*=\s*JSON\.parse\('([\s\S]*?)'\)/.exec(String(html||''));
  if(!m)throw new Error('datesData tidak ditemukan di halaman');
  const txt=m[1].replace(/\\x([0-9A-Fa-f]{2})/g,(_,h)=>String.fromCharCode(parseInt(h,16)));
  const dates=JSON.parse(txt);if(!Array.isArray(dates))throw new Error('datesData bukan array');return dates;
}
export function parseLeagueJson(txt){
  const o=JSON.parse(txt),dates=Array.isArray(o?.dates)?o.dates:Array.isArray(o?.data?.dates)?o.data.dates:null;
  if(!dates)throw new Error('JSON liga tanpa field dates');return dates;
}
export async function fetchLeague(code,season,doFetch=tfetch){
  const errs=[];
  try{
    const r=await doFetch(`https://understat.com/getLeagueData/${code}/${season}`,{headers:{...HEADERS,'X-Requested-With':'XMLHttpRequest'}});
    if(!r.ok)throw new Error('HTTP '+r.status);return parseLeagueJson(await r.text());
  }catch(e){errs.push('json: '+e.message)}
  try{
    const r=await doFetch(`https://understat.com/league/${code}/${season}`,{headers:HEADERS});
    if(!r.ok)throw new Error('HTTP '+r.status);return parseHtml(await r.text());
  }catch(e){errs.push('html: '+e.message)}
  throw new Error(errs.join(' | '));
}

// Rata-rata berbobot (laga terbaru paling berat, sama seperti profil PitchAPI) dari maxMatches laga selesai terakhir.
export function buildTeamXg(dates,league,maxMatches=6,now=Date.now()){
  const by=new Map();
  for(const d of dates||[]){
    if(!(d?.isResult===true||d?.isResult==='true'))continue;
    const xh=Number(d.xG?.h),xa=Number(d.xG?.a),t=Date.parse(String(d.datetime||'').replace(' ','T')+'Z');
    if(!Number.isFinite(xh)||!Number.isFinite(xa)||!Number.isFinite(t)||t>now)continue;
    if(xh===0&&xa===0)continue; // xG 0-0 pada laga selesai biasanya berarti data belum ada
    for(const [s,o,x,y] of [['h','a',xh,xa],['a','h',xa,xh]]){
      const name=d[s]?.title;if(!name)continue;
      if(!by.has(name))by.set(name,[]);
      by.get(name).push({t,xgFor:x,xgAgainst:y,gf:Number(d.goals?.[s]),ga:Number(d.goals?.[o])});
    }
  }
  const teams={};
  for(const [name,all] of by){
    const recs=all.sort((a,b)=>b.t-a.t).slice(0,maxMatches),w=recs.map((_,i)=>Math.pow(.84,i)),sw=w.reduce((a,b)=>a+b,0);
    const avg=k=>recs.reduce((s,r,i)=>s+r[k]*w[i],0)/sw;
    teams[teamKey(name)]={name,league,n:recs.length,xgN:recs.length,xgFor:+avg('xgFor').toFixed(3),xgAgainst:+avg('xgAgainst').toFixed(3),
      last:recs.map(r=>({t:new Date(r.t).toISOString().slice(0,10),xgFor:+r.xgFor.toFixed(2),xgAgainst:+r.xgAgainst.toFixed(2),gf:r.gf,ga:r.ga}))};
  }
  return teams;
}

async function main(){
  const dir=outDir(import.meta.url);mkdirSync(dir,{recursive:true});
  const season=Number(process.env.UNDERSTAT_SEASON)||seasonOf();
  const maxM=Math.max(3,Number(process.env.UNDERSTAT_MATCHES||6)),minXg=Math.max(1,Number(process.env.V10_MIN_XG_GAMES||3));
  const teams={},errors=[];
  for(const lg of LEAGUES){
    try{Object.assign(teams,buildTeamXg(await fetchLeague(lg,season),lg,maxM))}catch(e){errors.push(lg+': '+e.message)}
    await sleep(Number(process.env.UNDERSTAT_DELAY_MS??1500));
  }
  let source='Understat',stale=false;
  if(!Object.keys(teams).length){
    // Semua liga gagal: pakai salinan terakhir yang sudah terbit di Pages agar xG tidak hilang karena gangguan sesaat.
    try{const b=siteBase();if(b){const r=await tfetch(b+'understat.json');if(r.ok){const j=await r.json();Object.assign(teams,j.teams||{});stale=true;source='Understat (salinan lama '+(j.updated||'?')+')'}}}catch(e){errors.push('salinan lama: '+e.message)}
  }
  const out={updated:new Date().toISOString(),season,source,stale,teams,errors};
  writeFileSync(join(dir,'understat.json'),JSON.stringify(out));
  let lam=.075;try{lam=Number(JSON.parse(readFileSync(join(dir,'data.json'),'utf8')).cal?.lam)||.075}catch{}
  const patched={};
  for(const name of ['data.json','all.json']){
    const path=join(dir,name);if(!existsSync(path))continue;
    const r=applyExternalXgToSiteFile(path,out,lam,{minXgGames:minXg});
    patched[name]=r.updated;if(r.unmatched.length)console.log('Nama tim belum cocok di '+name+':',r.unmatched.join(', '));
  }
  console.log('Understat:',Object.keys(teams).length,'tim;',errors.length,'galat; laga diperbarui',JSON.stringify(patched));
  if(errors.length)ghWarn('Understat: '+errors.join(' | '));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{ghWarn('Understat dilewati: '+e.message);process.exit(0)});
