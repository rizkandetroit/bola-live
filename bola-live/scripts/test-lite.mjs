import assert from 'node:assert/strict';
import {writeFileSync,readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {buildTeamProfiles,buildMatchContext,predictLite,predictV10,backtestV10,applyV10ToSiteFile} from './intelligence.mjs';
// Tes model ringkas: Poisson-gol 60 + Poisson-xG 25 + Elo 15; tanpa xG cukup kembali ke gol 70 + Elo 30.
const now=Date.now(),D=864e5,teams={A:{id:'team_A',name:'Alpha'},B:{id:'team_B',name:'Beta'}};
const build=(n,withXg=true)=>{
  const fixtures=[],details={};
  for(let i=0;i<n;i++){
    const f={id:'m'+i,league:{name:'L'},time_utc:new Date(now-(n-i)*D).toISOString(),status:'finished',home_team:i%2?teams.B:teams.A,away_team:i%2?teams.A:teams.B,score_home:2,score_away:i%2};
    fixtures.push(f);
    details[f.id]=withXg?{shots:{periods:[{period:'All',shots:[
      {team_id:'team_A',expected_goals:.9,x:88,y:30},{team_id:'team_B',expected_goals:.4,x:80,y:40}]}]}}:{};
  }
  return{fixtures,details};
};
const upcoming={id:'next',league:{name:'L'},time_utc:new Date(now+D).toISOString(),status:'not_started',home_team:teams.A,away_team:teams.B};
const base={raw:{h:60,d:22,a:18},pe:{h:50,d:25,a:25},xg:[1.8,0.9],fr:[45,26,29]};
const sum=o=>Math.abs(o.h+o.d+o.a-100)<.11;
const finite=o=>[o.h,o.d,o.a,...o.lambda,o.ou,o.bt].every(Number.isFinite);

// 1. xG aktif (6 laga berdata xG per tim >= 3): bobot 60/25/15 dan komponen xG ikut
let {fixtures,details}=build(6);
let profiles=buildTeamProfiles(fixtures,details,now,6);
assert.equal(profiles.team_A.xgN,6,'xgN menghitung laga yang punya xG untuk dan lawan');
let ctx=buildMatchContext(upcoming,{},profiles);
let L=predictLite(base,ctx,{lambda:.05,minXgGames:3});
assert.equal(L.xgOn,true);assert.deepEqual(L.weights,{poisson:60,xg:25,elo:15});
assert(sum(L)&&finite(L)&&L.components.xg.length===3&&L.xg.home.for>0&&L.xg.away.against>0);
assert(/Poisson-gol 60%, Poisson-xG 25%, Elo 15%/.test(L.reason));
console.log('OK 1. xG aktif:',L.h,L.d,L.a,JSON.stringify(L.weights));

// 2. xG kurang dari ambang (2 laga < 3): komponen xG dilewati, kembali ke 70/30, ada kalimat otomatis
({fixtures,details}=build(2));profiles=buildTeamProfiles(fixtures,details,now,6);ctx=buildMatchContext(upcoming,{},profiles);
L=predictLite(base,ctx,{lambda:.05,minXgGames:3});
assert.equal(L.xgOn,false);assert.deepEqual(L.weights,{poisson:70,elo:30});assert(!('xg' in L.components));
assert(/^xG belum cukup data/.test(L.reason)&&/gol \+ Elo saja/.test(L.reason)&&sum(L)&&finite(L));
console.log('OK 2. xG kurang data: kembali ke gol 70 + Elo 30');

// 3. ambang bisa dinaikkan: 4 laga berdata xG tetapi minimal 5 -> tetap tanpa xG
({fixtures,details}=build(4));profiles=buildTeamProfiles(fixtures,details,now,6);ctx=buildMatchContext(upcoming,{},profiles);
assert.equal(predictLite(base,ctx,{minXgGames:5}).xgOn,false);assert.equal(predictLite(base,ctx,{minXgGames:4}).xgOn,true);
console.log('OK 3. ambang minimal xG dipatuhi');

// 4. tidak pernah membagi dengan data kosong: tanpa profil, tanpa konteks, tanpa Elo, tanpa kalibrasi, xG nol
for(const c of [undefined,{},{teams:{}},buildMatchContext(upcoming,{},{})]){
  const x=predictLite({raw:{h:50,d:30,a:20},pe:{h:40,d:30,a:30},xg:[1.2,1.1],fr:[40,30,30]},c,{});
  assert(x&&x.xgOn===false&&sum(x)&&finite(x),'konteks kosong aman');
}
const noElo=predictLite({raw:{h:50,d:30,a:20},xg:[1.2,1.1]},ctx,{minXgGames:3});
assert(noElo&&sum(noElo)&&finite(noElo)&&noElo.weights.poisson>0,'tanpa Elo: bobot dinormalisasi');
assert.equal(predictLite({xg:[1,1]},ctx,{}),null,'tanpa Poisson dasar: tidak mengarang angka');
assert.equal(predictLite({raw:{h:null,d:null,a:null}},ctx,{}),null);
const zero=buildTeamProfiles(build(6).fixtures,{},now,6);   // tanpa detail apa pun: xG tetap null, bukan nol
assert.equal(zero.team_A.xgFor,null);assert.equal(zero.team_A.xgN,0);
const z=predictLite(base,buildMatchContext(upcoming,{},zero),{minXgGames:3});
assert.equal(z.xgOn,false);assert(finite(z)&&z.xg.home.for===null,'xG hilang tetap null, bukan 0');
console.log('OK 4. data kosong aman');

// 5. line-up tidak menjadi pengali: hasil ringkas identik walau line-up berubah, sedangkan V10 penuh boleh berbeda
const mkLine=(p,drop)=>({formation:'4-3-3',confirmed:true,starters:Array.from({length:11},(_,i)=>({player_id:p+(i+1),name:p+i})).filter(x=>x.player_id!==drop),subs:[]});
const c1=buildMatchContext(upcoming,{lineups:{home:mkLine('a'),away:mkLine('b')}},buildTeamProfiles(build(6).fixtures,build(6).details,now,6));
const c2=buildMatchContext(upcoming,{lineups:{home:mkLine('a','a1'),away:mkLine('b','b1')}},buildTeamProfiles(build(6).fixtures,build(6).details,now,6));
const l1=predictLite(base,c1,{lambda:.05}),l2=predictLite(base,c2,{lambda:.05});
assert.deepEqual([l1.h,l1.d,l1.a],[l2.h,l2.d,l2.a],'line-up tidak memengaruhi model ringkas');
console.log('OK 5. line-up hanya catatan teks, bukan pengali');

// 6. applyV10ToSiteFile: tampilan utama 'lite' (bawaan) atau 'v10', keduanya tersimpan
const tmp=mkdtempSync(tmpdir()+'/lite-');
const file=tmp+'/data.json',mk=()=>JSON.stringify({matches:[{id:1,status:'NS',utc:upcoming.time_utc,home:{name:'Alpha'},away:{name:'Beta'},p:{h:60,d:22,a:18,raw:{...base.raw},pe:{...base.pe},xg:[...base.xg],fr:base.fr,ms:[1,0,10],ou:50,bt:50}}]});
const fx=[...fixtures,upcoming],dets={};
({fixtures,details}=build(6));profiles=buildTeamProfiles(fixtures,details,now,6);
writeFileSync(file,mk());let r=applyV10ToSiteFile(file,[upcoming,...fixtures],details,profiles,.05,{headline:'lite',minXgGames:3});
let m=JSON.parse(readFileSync(file,'utf8')).matches[0];
assert.equal(r.updated,1);assert.equal(m.p.engine,'V10-ringkas');assert(m.p.lite&&m.p.v10,'kedua model tersimpan');
assert.equal(m.p.h,m.p.lite.h);assert(Math.abs(m.p.h+m.p.d+m.p.a-100)<.11);assert(['h','a'].includes(m.pick)&&m.edge>=0);
writeFileSync(file,mk());applyV10ToSiteFile(file,[upcoming,...fixtures],details,profiles,.05,{headline:'v10'});
m=JSON.parse(readFileSync(file,'utf8')).matches[0];assert.equal(m.p.engine,'V10');assert.equal(m.p.h,m.p.v10.h);assert(m.p.lite,'ringkas tetap dihitung untuk perbandingan');
writeFileSync(file,mk());applyV10ToSiteFile(file,[upcoming,...fixtures],details,profiles,.05);   // tanpa opsi: bawaan 'lite'
assert.equal(JSON.parse(readFileSync(file,'utf8')).matches[0].p.engine,'V10-ringkas');
rmSync(tmp,{recursive:true,force:true});
console.log('OK 6. tampilan utama bisa dipilih; keduanya tersimpan');

// 7. tab Evaluasi menilai ringkas terpisah, termasuk subset saat xG aktif
const big=build(12),bt=backtestV10(big.fixtures,big.details,{minGames:3,minXgGames:3});
assert(bt.n>=5&&bt.versions.lite&&bt.versions.v9&&bt.versions.v10&&bt.versions.v8,'empat versi pada sampel yang sama');
assert(bt.versions.lite.brier>0&&Number.isFinite(bt.versions.lite.ll)&&/ringkas/i.test(bt.versions.lite.label));
assert(bt.xgSubset&&bt.xgSubset.n>0&&bt.xgSubset.n<=bt.n&&bt.xgSubset.lite.n===bt.xgSubset.n&&bt.xgSubset.v9.n===bt.xgSubset.n,'subset xG sampelnya sama untuk V9 dan ringkas');
const none=backtestV10(build(12,false).fixtures,{},{minGames:3,minXgGames:3});
assert.equal(none.xgSubset.n,0,'tanpa data xG subset kosong, tidak membagi nol');assert.equal(none.xgSubset.lite.acc,null);assert(none.versions.lite.n===none.n);
console.log('OK 7. evaluasi terpisah:',bt.n,'laga;',bt.xgSubset.n,'dengan xG aktif; ringkas Brier',bt.versions.lite.brier,'vs V9',bt.versions.v9.brier);
console.log('lite ok');
