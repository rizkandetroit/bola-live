import assert from 'node:assert/strict';
import {writeFileSync,readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseHtml,parseLeagueJson,fetchLeague,buildTeamXg,seasonOf} from './understat.mjs';
import {teamKey,extMap,lookupTeam,applyExternalXgToSiteFile,applyV10ToSiteFile,buildTeamProfiles} from './intelligence.mjs';
// Tes xG Understat dengan data contoh (tanpa jaringan): parser, nama tim, model ringkas, idempotensi, cadangan saat gagal.
const D=864e5,now=Date.now(),iso=t=>new Date(t).toISOString().slice(0,19).replace('T',' ');
const dates=[];
const add=(i,h,a,xh,xa,res=true)=>dates.push({id:String(i),isResult:res,h:{title:h},a:{title:a},goals:{h:'2',a:'1'},xG:{h:String(xh),a:String(xa)},datetime:iso(now-(20-i)*D)});
for(let i=0;i<6;i++){i%2?add(i,'Manchester City',"Newcastle United",2.1,.6):add(i,"Newcastle United",'Manchester City',.8,1.9)}
add(90,'Manchester City','Everton',0,0);          // 0-0 pada laga selesai: dianggap tanpa data
dates.push({id:'x',isResult:false,h:{title:'Manchester City'},a:{title:'Everton'},xG:{h:null,a:null},datetime:iso(now+D)});

// 1. parser halaman (escape \xNN) dan JSON
const esc=s=>s.replace(/[{}"':,\[\]]/g,c=>'\\x'+c.charCodeAt(0).toString(16).toUpperCase().padStart(2,'0'));
assert.deepEqual(parseHtml(`<script>var datesData = JSON.parse('${esc(JSON.stringify(dates.slice(0,2)))}')</script>`).length,2);
assert.equal(parseHtml(`var datesData=JSON.parse('${esc(JSON.stringify([{h:{title:"Sant\'Etienne"}}]))}')`)[0].h.title,"Sant'Etienne");
assert.throws(()=>parseHtml('<html></html>'));
assert.equal(parseLeagueJson(JSON.stringify({dates})).length,dates.length);
assert.throws(()=>parseLeagueJson('{"x":1}'));
console.log('OK 1. parser halaman dan JSON');

// 2. musim: November 2026 = musim 2026, Maret 2026 = musim 2025
assert.equal(seasonOf(new Date('2026-11-14T00:00:00Z')),2026);assert.equal(seasonOf(new Date('2026-03-01T00:00:00Z')),2025);
console.log('OK 2. penentuan musim');

// 3. profil xG tim: hanya laga selesai berdata, laga 0-0 dan laga mendatang dibuang
const teams=buildTeamXg(dates,'EPL',6,now),city=teams[teamKey('Manchester City')],newc=teams[teamKey('Newcastle United')];
assert.equal(city.n,6);assert.equal(city.xgN,6);assert(city.xgFor>1.5&&city.xgFor<2.2,'xG City '+city.xgFor);assert(city.xgAgainst<1);
assert(newc.xgFor<1&&newc.xgAgainst>1.4);assert(!teams[teamKey('Everton')],'tim tanpa laga berdata tidak dibuat');
console.log('OK 3. profil xG tim:',city.xgFor,'/',city.xgAgainst);

// 4. pencocokan nama tim (nama football-data -> judul Understat)
const U=['Manchester City','Tottenham','Inter','Atletico Madrid','Celta Vigo','RasenBallsport Leipzig','Borussia M.Gladbach','FC Cologne','Paris Saint Germain','Lyon','Rennes','Brest','Mainz 05','Bayer Leverkusen','Parma Calcio 1913','Roma','Wolverhampton Wanderers','Paris FC'];
const um=extMap({teams:Object.fromEntries(U.map(n=>[n,{name:n,xgN:5}]))});
const pairs={'Manchester City':'Manchester City','Tottenham Hotspur':'Tottenham','FC Internazionale Milano':'Inter','Club Atlético de Madrid':'Atletico Madrid','RC Celta de Vigo':'Celta Vigo','RB Leipzig':'RasenBallsport Leipzig','Borussia Mönchengladbach':'Borussia M.Gladbach','1. FC Köln':'FC Cologne','Paris Saint-Germain':'Paris Saint Germain','Olympique Lyonnais':'Lyon','Stade Rennais':'Rennes','Stade Brestois 29':'Brest','1. FSV Mainz 05':'Mainz 05','Bayer 04 Leverkusen':'Bayer Leverkusen','Parma Calcio 1913':'Parma Calcio 1913','AS Roma':'Roma','Wolverhampton Wanderers':'Wolverhampton Wanderers','Paris FC':'Paris FC'};
for(const [fd,us] of Object.entries(pairs))assert.equal(lookupTeam(um,fd)?.name,us,fd+' harus cocok dengan '+us);
assert.equal(lookupTeam(um,'Klub Tak Dikenal'),null);
const amb=extMap({teams:{a:{name:'Real Madrid Castilla'},b:{name:'Real Madrid Femenino'}}});assert.equal(lookupTeam(amb,'Real Madrid'),null,'cocok ganda ditolak, bukan ditebak');
console.log('OK 4. pencocokan nama tim:',Object.keys(pairs).length,'pasangan');

// 5. model ringkas dari xG luar: aktif bila cukup laga, idempotensi, dan data lama (v9, raw, xg0) terjaga
const tmp=mkdtempSync(join(tmpdir(),'us-'));
try{
  const file=join(tmp,'data.json');
  const mk=()=>({matches:[
    {id:1,league:'EPL',utc:new Date(now+D).toISOString(),status:'NS',home:{name:'Manchester City'},away:{name:'Newcastle United'},p:{h:50,d:25,a:25,raw:{h:48,d:26,a:26},pe:{h:52,d:24,a:24},xg:[1.6,1.1],fr:[45,26,29],ou:50,bt:50,ms:[1,0]}},
    {id:2,league:'EPL',utc:new Date(now+D).toISOString(),status:'NS',home:{name:'Klub Tak Dikenal'},away:{name:'Newcastle United'},p:{h:40,d:30,a:30,raw:{h:40,d:30,a:30},pe:null,xg:[1.2,1.2],fr:[45,26,29]}}]});
  writeFileSync(file,JSON.stringify(mk()));
  const ext={teams};
  let r=applyExternalXgToSiteFile(file,ext,.075,{minXgGames:3});
  assert.equal(r.updated,1);assert.deepEqual(r.unmatched,['Klub Tak Dikenal']);
  let d=JSON.parse(readFileSync(file,'utf8')),m=d.matches[0],m2=d.matches[1];
  assert.equal(m.p.engine,'V10-ringkas');assert.equal(m.p.lite.xgOn,true);assert(/Understat/.test(m.p.lite.reason));
  assert.deepEqual(m.p.raw,{h:48,d:26,a:26},'raw awal tetap');assert.deepEqual(m.p.xg0,[1.6,1.1],'xG awal tersimpan');assert.equal(m.p.v9.h,50,'v9 = prediksi sebelum xG');
  assert(Math.abs(m.p.h+m.p.d+m.p.a-100)<.11);assert(m.p.h>m.p.a,'City dengan xG jauh lebih tinggi harus lebih diunggulkan');
  assert.equal(m2.p.engine,undefined,'laga dengan tim tak dikenal tidak diubah');assert.equal(m2.p.h,40);
  const snap=JSON.stringify(m.p);r=applyExternalXgToSiteFile(file,ext,.075,{minXgGames:3});
  assert.equal(JSON.stringify(JSON.parse(readFileSync(file,'utf8')).matches[0].p),snap,'dijalankan dua kali hasilnya sama');
  console.log('OK 5. model ringkas dari xG luar:',m.p.h,m.p.d,m.p.a,'(sebelumnya 50/25/25)');

  // 6. xG kurang dari ambang: laga tidak diubah
  writeFileSync(file,JSON.stringify(mk()));
  const few={teams:Object.fromEntries(Object.entries(teams).map(([k,v])=>[k,{...v,n:2,xgN:2}]))};
  r=applyExternalXgToSiteFile(file,few,.075,{minXgGames:3});assert.equal(r.updated,0);
  assert.equal(JSON.parse(readFileSync(file,'utf8')).matches[0].p.h,50);
  console.log('OK 6. xG kurang dari 3 laga: model tidak diubah (tetap gol + Elo)');

  // 7. jalur PitchAPI: profil tanpa xG diisi Understat hanya untuk model ringkas; V10 penuh tidak tersentuh
  const T={A:{id:'tA',name:'Manchester City'},B:{id:'tB',name:'Newcastle United'}};
  const fixtures=[];for(let i=0;i<6;i++)fixtures.push({id:'f'+i,league:{name:'EPL'},time_utc:new Date(now-(7-i)*D).toISOString(),status:'finished',home_team:i%2?T.B:T.A,away_team:i%2?T.A:T.B,score_home:2,score_away:1});
  const profiles=buildTeamProfiles(fixtures,{},now,6);assert.equal(profiles.tA.xgN,0);
  const up={id:'nx',league:{name:'EPL'},time_utc:new Date(now+D).toISOString(),status:'not_started',home_team:T.A,away_team:T.B};
  writeFileSync(file,JSON.stringify(mk()));
  const noExt=applyV10ToSiteFile(file,[...fixtures,up],{},profiles,.075,{minXgGames:3});assert.equal(noExt.updated,1);
  const without=JSON.parse(readFileSync(file,'utf8')).matches[0].p;assert.equal(without.lite.xgOn,false);
  writeFileSync(file,JSON.stringify(mk()));
  applyV10ToSiteFile(file,[...fixtures,up],{},profiles,.075,{minXgGames:3,extXg:ext});
  const withX=JSON.parse(readFileSync(file,'utf8')).matches[0].p;
  assert.equal(withX.lite.xgOn,true);assert(/Understat/.test(withX.lite.reason));assert(Number.isFinite(withX.v10.h),'V10 penuh tetap dihitung');
  assert.deepEqual(withX.v10,without.v10,'V10 penuh tidak berubah oleh xG luar');
  console.log('OK 7. jalur PitchAPI: xG luar mengisi model ringkas saja');

  // 8. pengambilan: JSON gagal -> jatuh ke HTML; keduanya gagal -> galat jelas
  const html=`var datesData=JSON.parse('${esc(JSON.stringify(dates))}')`;let calls=[];
  const f1=async(u)=>{calls.push(u);return u.includes('getLeagueData')?new Response('x',{status:503}):new Response(html,{status:200})};
  assert.equal((await fetchLeague('EPL',2026,f1)).length,dates.length);assert.equal(calls.length,2);
  const f2=async()=>new Response('x',{status:403});
  await assert.rejects(fetchLeague('EPL',2026,f2),/json: HTTP 403.*html: HTTP 403/);
  console.log('OK 8. pengambilan dengan cadangan HTML dan galat jelas');
}finally{rmSync(tmp,{recursive:true,force:true})}
console.log('understat ok');
