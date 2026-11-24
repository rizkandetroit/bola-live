// V40: uji "xG BSD bertentangan dengan peluang menang BSD".
// Contoh pemicu (23 Nov 2026): Monza xG 1,62 vs 1,36 tetapi peluang menang diberikan ke Fiorentina (49%) -> Monza menang 3-0.
// Entri: {u (waktu kickoff), lg, p:[h,d,a] (%), xg:[h,a], r:[gol h, gol a]} dari uji mundur 90 hari (prediksi BSD sebelum kickoff).
// Semua setelan dipilih di paruh PERTAMA (urut waktu) lalu dinilai di paruh KEDUA, jadi tidak ada kebocoran.
import { probs, score } from "./model.mjs";

const OUT=r=>r[0]>r[1]?0:r[0]===r[1]?1:2;
const r3=x=>x==null||!isFinite(x)?null:Math.round(x*1000)/1000;

// sisi tebakan BSD di antara menang kandang/tandang (abaikan seri), sisi xG (bila selisih > T)
function sides(e,T){const pk=e.p[0]>=e.p[2]?0:2,d=e.xg[0]-e.xg[1],xs=d>T?0:d<-T?2:null;return{pk,xs,conf:xs!=null&&xs!==pk}}

// ringkasan satu kelompok: tebakan BSD vs sisi xG, dibanding peluang yang BSD berikan
function group(L){if(!L.length)return null;let wp=0,wx=0,dr=0,pp=0,px=0;
  for(const e of L){const o=OUT(e.r),pk=e.pk,xs=e.xs;if(o===pk)wp++;if(o===xs)wx++;if(o===1)dr++;pp+=e.p[pk]/100;px+=e.p[xs]/100}
  const n=L.length,f=x=>x/n*100,se=q=>Math.sqrt(Math.max(q*(1-q),.05)/n)*100;
  return{n,pick:{win:f(wp),bsd:f(pp),gap:f(wp)-f(pp),se:se(wp/n)},xg:{win:f(wx),bsd:f(px),gap:f(wx)-f(px),se:se(wx/n)},draw:f(dr)}}

// selisih log loss berpasangan (dasar - aturan) beserta galat baku: >0 berarti aturan lebih baik
function paired(L,ka,kb){const d=L.map(e=>Math.log(Math.max(e[kb][e.o]/100,1e-6))-Math.log(Math.max(e[ka][e.o]/100,1e-6)));if(!d.length)return null;
  const m=d.reduce((a,b)=>a+b,0)/d.length,v=d.reduce((a,b)=>a+(b-m)**2,0)/Math.max(1,d.length-1);return{gain:m,se:Math.sqrt(v/d.length)}}

const mix=(p,q,w)=>p.map((x,i)=>(1-w)*x+w*q[i]);

export function xgConflict(entries,o={}){
  const minN=o.minN??400;
  const R=(entries||[]).filter(e=>e&&e.p&&e.xg&&e.r&&e.xg.every(x=>x!=null&&x>=0&&x<8)&&e.p.every(x=>x!=null)).map(e=>({...e,o:OUT(e.r),q:probs(Math.max(e.xg[0],.05),Math.max(e.xg[1],.05)).p}))
    .sort((a,b)=>String(a.u).localeCompare(String(b.u)));
  if(R.length<minN)return{n:R.length,note:"belum cukup laga dengan xG BSD"};
  const half=Math.floor(R.length/2),A=R.slice(0,half),B=R.slice(half);
  // 1) kelompok konflik di beberapa ambang selisih xG
  const TS=[0,.15,.3,.5],thr={};
  for(const T of TS){const L=R.map(e=>({...e,...sides(e,T)})).filter(e=>e.conf);const g=group(L);if(g)thr[T]={...g,of:R.length,share:g.n/R.length*100}}
  // 2) aturan A: campur peluang BSD dengan peluang Poisson dari xG BSD sendiri, di SEMUA laga (bobot w dipilih di paruh pertama)
  const W=[0,.1,.2,.3,.4,.5,.6,.7,.8,.9,1],llOf=(L,w)=>score(L.map(e=>({o:e.o,s:mix(e.p,e.q,w)})),"s").ll;
  let wA=0,bA=llOf(A,0);for(const w of W){const v=llOf(A,w);if(v<bA-1e-12){bA=v;wA=w}}
  const Bm=B.map(e=>({...e,m:mix(e.p,e.q,wA)})),blendAll={w:wA,hold:{n:B.length,base:score(Bm,"p"),rule:score(Bm,"m")},pair:paired(Bm,"p","m")};
  // 3) aturan B: campur hanya di laga konflik (ambang T dan bobot w dipilih di paruh pertama)
  let best={T:0,w:0,ll:Infinity};
  for(const T of TS)for(const w of W){const L=A.map(e=>{const s=sides(e,T);return{o:e.o,s:s.conf?mix(e.p,e.q,w):e.p}});const v=score(L,"s").ll;if(v<best.ll-1e-12)best={T,w,ll:v}}
  const Bc=B.map(e=>{const s=sides(e,best.T);return{...e,c:s.conf,m:s.conf?mix(e.p,e.q,best.w):e.p}}),Cc=Bc.filter(e=>e.c);
  const blendConf={T:best.T,w:best.w,hold:{n:B.length,nConf:Cc.length,base:score(Bc,"p"),rule:score(Bc,"m"),confBase:Cc.length?score(Cc,"p"):null,confRule:Cc.length?score(Cc,"m"):null},pair:paired(Bc,"p","m")};
  // 4) aturan C: pada laga konflik, tebak sisi xG (bukan tebakan BSD) — akurasi saja
  const flip={};for(const T of TS){const f=L=>{const C=L.map(e=>({...e,...sides(e,T)})).filter(e=>e.conf);return{n:C.length,bsd:C.length?C.filter(e=>e.o===e.pk).length/C.length*100:null,xg:C.length?C.filter(e=>e.o===e.xs).length/C.length*100:null}};flip[T]={a:f(A),b:f(B)}}
  // 5) per liga (ambang 0,3) — hanya liga dengan >= 25 laga konflik
  const lg={};for(const e of R){const s=sides(e,.3);if(!s.conf)continue;(lg[e.lg]=lg[e.lg]||[]).push({...e,...s})}
  const byLeague=Object.entries(lg).filter(([,L])=>L.length>=25).map(([k,L])=>{const g=group(L);return[k,g.n,r3(g.pick.win),r3(g.xg.win),r3(g.pick.bsd)]}).sort((a,b)=>b[1]-a[1]).slice(0,20);
  // putusan: lolos bila perbaikan log loss di paruh kedua > 2 galat baku DAN akurasi tidak turun
  const ok=x=>x&&x.pair&&x.pair.gain>2*x.pair.se&&x.hold.rule.acc>=x.hold.base.acc-.3;
  const verdict=ok(blendConf)&&(!ok(blendAll)||blendConf.pair.gain>=blendAll.pair.gain)?"konflik":ok(blendAll)?"semua":"tidak";
  const rs=s=>s&&{n:s.n,acc:r3(s.acc),ll:r3(s.ll),brier:r3(s.brier)};
  for(const x of [blendAll,blendConf]){for(const k of ["base","rule","confBase","confRule"])if(x.hold[k])x.hold[k]=rs(x.hold[k]);if(x.pair)x.pair={gain:r3(x.pair.gain),se:r3(x.pair.se)}}
  for(const T in thr){const g=thr[T];for(const k of ["pick","xg"])for(const j in g[k])g[k][j]=r3(g[k][j]);g.draw=r3(g.draw);g.share=r3(g.share)}
  for(const T in flip)for(const h of ["a","b"]){flip[T][h].bsd=r3(flip[T][h].bsd);flip[T][h].xg=r3(flip[T][h].xg)}
  return{n:R.length,from:R[0].u,to:R[R.length-1].u,split:R[half].u,thr,blendAll,blendConf,flip,byLeague,verdict};
}
