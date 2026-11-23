// Model BL (V15, 20 Nov 2026): model prediksi Bola Live sendiri dari riwayat hasil laga BSD (semua liga).
//
// Inti: regresi Poisson berbobot waktu (gaya Dixon-Coles) untuk gol kedua tim:
//   log λ_kandang = μ + HFA_liga·(bukan netral) + serang_tim − tahan_lawan + efek_istirahat
//   log λ_tamu    = μ + serang_tim − tahan_lawan + efek_istirahat
// - serang/tahan tim = level liga + selisih tim (ridge): tim baru/sedikit data ditarik ke rata-rata liganya,
//   dan kompetisi lintas liga (Eropa, piala) menghubungkan kekuatan antarliga.
// - keunggulan kandang per liga, ditarik ke rata-rata global (ridge).
// - jadwal padat: tim yang istirahat <= 3 hari sejak laga sebelumnya (semua kompetisi) — besarnya diestimasi dari data.
// - laga lama berbobot lebih kecil (waktu paruh HL hari).
// Peluang 1X2 / over 2,5 / BTTS / skor dari distribusi Poisson dengan koreksi skor kecil Dixon-Coles (rho).
// Semua parameter diestimasi dengan Newton per koordinat (cepat, tanpa pustaka luar).

const DAY=864e5,MAXG=10;
// xga: bobot xG dalam "gol" yang dipakai untuk melatih kekuatan tim (0 = hanya skor; 0,7 = 70% xG + 30% skor), bila xG laga tersedia.
export const DEF={hl:180,tauT:4,tauL:1,tauH:6,rho:-0.06,rest:3,maxAge:400,sweeps:40,minGames:4,xga:0};

// ms: [{t,l,h,a,gh,ga,n}] (t = waktu ms, l = id liga, n = netral). Mengembalikan model siap prediksi.
export function fitModel(ms,asOf,o={}){
  const P={...DEF,...o},T0=asOf-P.maxAge*DAY;
  const L=ms.filter(m=>m.t<asOf&&m.t>=T0&&Number.isFinite(m.gh)&&Number.isFinite(m.ga));
  // istirahat: hari sejak laga sebelumnya tiap tim (semua kompetisi, termasuk yang lebih tua dari jendela)
  const last=new Map(),rest=new Map(),times=new Map();
  for(const m of ms.slice().sort((a,b)=>a.t-b.t)){for(const id of [m.h,m.a]){const p=last.get(id);rest.set(m.id+":"+id,p==null?99:(m.t-p)/DAY);last.set(id,m.t);(times.get(id)||times.set(id,[]).get(id)).push(m.t)}}
  // liga "rumah" tim = liga yang paling sering ia mainkan (bukan piala/kompetisi Eropa bila ada liga domestik)
  const cnt=new Map();for(const m of L)for(const id of [m.h,m.a]){const c=cnt.get(id)||new Map();c.set(m.l,(c.get(m.l)||0)+1);cnt.set(id,c)}
  const home=new Map();for(const [id,c] of cnt){let b=null,bn=-1;for(const [l,n] of c)if(n>bn){b=l;bn=n}home.set(id,b)}
  const tix=new Map(),lix=new Map(),TL=[],LL=[];
  const ti=id=>{if(!tix.has(id)){tix.set(id,TL.length);TL.push({id,lg:home.get(id),a:0,d:0,n:0})}return tix.get(id)};
  const li=id=>{if(!lix.has(id)){lix.set(id,LL.length);LL.push({id,A:0,D:0,h:0,n:0})}return lix.get(id)};
  const N=L.length,H=new Int32Array(N),A=new Int32Array(N),LG=new Int32Array(N),NE=new Uint8Array(N),W=new Float64Array(N),
    YH=new Float64Array(N),YA=new Float64Array(N),SH=new Int8Array(N),SA=new Int8Array(N);
  let sg=0,sw=0;
  L.forEach((m,k)=>{H[k]=ti(m.h);A[k]=ti(m.a);LG[k]=li(m.l);NE[k]=m.n?1:0;W[k]=Math.pow(.5,(asOf-m.t)/(P.hl*DAY));const ux=P.xga>0&&m.xh!=null&&m.xa!=null,al=ux?(m.xe?P.xga/2:P.xga):0;YH[k]=ux?al*m.xh+(1-al)*m.gh:m.gh;YA[k]=ux?al*m.xa+(1-al)*m.ga:m.ga;   // xG perkiraan BSD: bobot setengah
    SH[k]=(rest.get(m.id+":"+m.h)??99)<=P.rest?1:0;SA[k]=(rest.get(m.id+":"+m.a)??99)<=P.rest?1:0;TL[H[k]].n++;TL[A[k]].n++;LL[LG[k]].n++;sg+=W[k]*(YH[k]+YA[k]);sw+=2*W[k]});
  const tl=TL.map(t=>lix.has(t.lg)?lix.get(t.lg):li(t.lg));   // indeks liga rumah tiap tim
  // V17: kovariat per laga (besarnya diestimasi dari data, ditarik ke 0 bila datanya sedikit):
  //  0 gA  kekuatan lini serang sendiri (ln rasio line-up)      1 gD  kekuatan lini bertahan lawan (ln rasio, tanda minus)
  //  2 bv  selisih nilai skuad (log10)                          3 dby derby: perubahan keunggulan kandang
  //  V20: 4 tb  "klasemen menipu": selisih poin per laga di klasemen musim ini (sebelum kickoff), di luar kekuatan asli tim
  //       5 nc  pelatih baru (<= 4 laga pertama): +1 tuan rumah, -1 tamu
  const NC=6,FH=[],FA=[],TH=new Float64Array(NC),TAU=[P.tauG??2,P.tauG??2,P.tauV??10,P.tauDby??10,P.tauTb??10,P.tauNc??20];for(let j=0;j<NC;j++){FH.push(new Float64Array(N));FA.push(new Float64Array(N))}
  let nXr=0,nZv=0,nTb=0,nNc=0;
  L.forEach((m,k)=>{const x=m.xr;if(x&&x.every(v=>v>0)){FH[0][k]=Math.log(x[0]);FA[0][k]=Math.log(x[2]);FH[1][k]=-Math.log(x[3]);FA[1][k]=-Math.log(x[1]);nXr++}
    if(m.zv&&m.zv[0]!=null&&m.zv[1]!=null){FH[2][k]=m.zv[0]-m.zv[1];FA[2][k]=m.zv[1]-m.zv[0];nZv++}
    if(m.dby&&!m.n)FH[3][k]=1;
    if(P.tb!==0&&m.tb){const d=m.tb[0]-m.tb[1];FH[4][k]=d;FA[4][k]=-d;nTb++}
    if(P.nc!==0&&m.nc&&(m.nc[0]||m.nc[1])){const d=m.nc[0]-m.nc[1];FH[5][k]=d;FA[5][k]=-d;nNc++}});
  let mu=Math.log(Math.max(.3,sg/Math.max(sw,1e-9))),hfa=.25,bo=0,bd=0;   // bo: istirahat pendek -> serang sendiri; bd: -> kebobolan
  const lh=new Float64Array(N),la=new Float64Array(N);
  const eta=()=>{for(let k=0;k<N;k++){const h=TL[H[k]],a=TL[A[k]],Lh=LL[tl[H[k]]],La=LL[tl[A[k]]],hf=NE[k]?0:hfa+LL[LG[k]].h;
    let ch=0,ca=0;for(let j=0;j<NC;j++){if(TH[j]){ch+=TH[j]*FH[j][k];ca+=TH[j]*FA[j][k]}}
    lh[k]=Math.exp(mu+hf+Lh.A+h.a-La.D-a.d+bo*SH[k]+bd*SA[k]+ch);la[k]=Math.exp(mu+La.A+a.a-Lh.D-h.d+bo*SA[k]+bd*SH[k]+ca)}};
  // indeks laga per tim & per liga
  const byT=TL.map(()=>[]),byL=LL.map(()=>[]);for(let k=0;k<N;k++){byT[H[k]].push(k);byT[A[k]].push(k);byL[LG[k]].push(k)}
  const byTL=LL.map(()=>[]);TL.forEach((t,i)=>byTL[tl[i]].push(i));
  const step=(g,h,tau,x)=>{const G=g-tau*x,Hh=h+tau;return Hh>1e-9?Math.max(-1,Math.min(1,G/Hh)):0};
  eta();
  for(let it=0;it<P.sweeps;it++){
    // global
    {let g=0,h=0;for(let k=0;k<N;k++){g+=W[k]*(YH[k]-lh[k]+YA[k]-la[k]);h+=W[k]*(lh[k]+la[k])}mu+=step(g,h,0,0);eta()}
    {let g=0,h=0;for(let k=0;k<N;k++)if(!NE[k]){g+=W[k]*(YH[k]-lh[k]);h+=W[k]*lh[k]}hfa+=step(g,h,0,0);eta()}
    {let g=0,h=0;for(let k=0;k<N;k++){if(SH[k]){g+=W[k]*(YH[k]-lh[k]);h+=W[k]*lh[k]}if(SA[k]){g+=W[k]*(YA[k]-la[k]);h+=W[k]*la[k]}}bo+=step(g,h,20,bo)}
    eta();
    {let g=0,h=0;for(let k=0;k<N;k++){if(SA[k]){g+=W[k]*(YH[k]-lh[k]);h+=W[k]*lh[k]}if(SH[k]){g+=W[k]*(YA[k]-la[k]);h+=W[k]*la[k]}}bd+=step(g,h,20,bd)}
    eta();
    {let ch=false;for(let j=0;j<NC;j++){if(j<2&&!nXr||j===2&&!nZv||j===4&&!nTb||j===5&&!nNc)continue;let g=0,h=0;for(let k=0;k<N;k++){const a=FH[j][k],b=FA[j][k];if(!a&&!b)continue;g+=W[k]*((YH[k]-lh[k])*a+(YA[k]-la[k])*b);h+=W[k]*(lh[k]*a*a+la[k]*b*b)}
      const d=step(g,h,TAU[j],TH[j]);if(d){TH[j]+=d;ch=true}}if(ch)eta()}
    // liga: keunggulan kandang, level serang/tahan
    LL.forEach((q,j)=>{let g=0,h=0;for(const k of byL[j])if(!NE[k]){g+=W[k]*(YH[k]-lh[k]);h+=W[k]*lh[k]}q.h+=step(g,h,P.tauH,q.h)});
    eta();
    LL.forEach((q,j)=>{let g=0,h=0;for(const i of byTL[j])for(const k of byT[i]){if(H[k]===i){g+=W[k]*(YH[k]-lh[k]);h+=W[k]*lh[k]}else{g+=W[k]*(YA[k]-la[k]);h+=W[k]*la[k]}}q.A+=step(g,h,P.tauL,q.A)});
    eta();
    LL.forEach((q,j)=>{let g=0,h=0;for(const i of byTL[j])for(const k of byT[i]){if(H[k]===i){g-=W[k]*(YA[k]-la[k]);h+=W[k]*la[k]}else{g-=W[k]*(YH[k]-lh[k]);h+=W[k]*lh[k]}}q.D+=step(g,h,P.tauL,q.D)});
    eta();
    // tim
    TL.forEach((t,i)=>{let g=0,h=0;for(const k of byT[i]){if(H[k]===i){g+=W[k]*(YH[k]-lh[k]);h+=W[k]*lh[k]}else{g+=W[k]*(YA[k]-la[k]);h+=W[k]*la[k]}}
      const d=step(g,h,P.tauT,t.a);t.a+=d;if(d)for(const k of byT[i]){if(H[k]===i)lh[k]*=Math.exp(d);else la[k]*=Math.exp(d)}});
    TL.forEach((t,i)=>{let g=0,h=0;for(const k of byT[i]){if(H[k]===i){g-=W[k]*(YA[k]-la[k]);h+=W[k]*la[k]}else{g-=W[k]*(YH[k]-lh[k]);h+=W[k]*lh[k]}}
      const d=step(g,h,P.tauT,t.d);t.d+=d;if(d)for(const k of byT[i]){if(H[k]===i)la[k]*=Math.exp(-d);else lh[k]*=Math.exp(-d)}});
  }
  const team=new Map(TL.map((t,i)=>[t.id,{a:t.a,d:t.d,n:t.n,lg:t.lg,li:tl[i]}])),lg=new Map(LL.map(q=>[q.id,{A:q.A,D:q.D,h:q.h,n:q.n}]));
  return{P,mu,hfa,bo,bd,team,lg,times,n:N,asOf,cov:{gA:TH[0],gD:TH[1],bv:TH[2],dby:TH[3],tb:TH[4],nc:TH[5],nXr,nZv,nTb,nNc}};
}

// Kekuatan tim untuk prediksi. Tim tanpa data: level liga laga ini (atau 0).
function str(M,id,l){const t=M.team.get(id);if(t){const L=M.lg.get(t.lg)||{A:0,D:0};return{a:L.A+t.a,d:L.D+t.d,n:t.n}}const L=M.lg.get(l)||{A:0,D:0};return{a:L.A,d:L.D,n:0}}
// apakah tim baru bermain <= P.rest hari sebelum waktu t (laga terakhir sebelum t, dari jadwal mana pun)
function shortRest(M,id,t){const T=t!=null&&M.times.get(id);if(!T)return 0;let lo=0,hi=T.length-1,b=-1;while(lo<=hi){const m=(lo+hi)>>1;if(T[m]<t-36e5){b=m;lo=m+1}else hi=m-1}
  return b>=0&&(t-T[b])/DAY<=M.P.rest?1:0}
// jadwal tambahan (laga mendatang yang sudah diketahui) supaya istirahat bisa dihitung untuk laga yang akan datang
export function addTimes(M,list){for(const m of list||[])for(const id of [m.h,m.a]){if(id==null||m.t==null)continue;const T=M.times.get(id)||M.times.set(id,[]).get(id);if(!T.includes(m.t)){T.push(m.t);T.sort((a,b)=>a-b)}}}
const pois=l=>{const p=[Math.exp(-l)];for(let i=1;i<=MAXG;i++)p.push(p[i-1]*l/i);return p};
// x: {h,a,l,n,t, adj:{h,a}} — adj = pengali λ tambahan (mis. pemain inti absen). Mengembalikan peluang % dan rincian.
export function predictModel(M,x){
  const H=str(M,x.h,x.l),A=str(M,x.a,x.l),Lg=M.lg.get(x.l)||{h:0},hf=x.n?0:M.hfa+(Lg.h||0);
  const rh=shortRest(M,x.h,x.t),ra=shortRest(M,x.a,x.t);
  const ah=(x.adj&&x.adj.h)||1,aa=(x.adj&&x.adj.a)||1;
  const cv=M.cov||{},x2=x.xr&&x.xr.every(v=>v>0)?x.xr:null,zv=x.zv&&x.zv[0]!=null&&x.zv[1]!=null?x.zv:null;
  const tb=x.tb?(cv.tb||0)*(x.tb[0]-x.tb[1]):0,nc=x.nc?(cv.nc||0)*((x.nc[0]||0)-(x.nc[1]||0)):0;   // V20
  const ch=(x2?(cv.gA||0)*Math.log(x2[0])-(cv.gD||0)*Math.log(x2[3]):0)+(zv?(cv.bv||0)*(zv[0]-zv[1]):0)+(x.dby&&!x.n?(cv.dby||0):0)+tb+nc;
  const ca=(x2?(cv.gA||0)*Math.log(x2[2])-(cv.gD||0)*Math.log(x2[1]):0)+(zv?(cv.bv||0)*(zv[1]-zv[0]):0)-tb-nc;
  const lh=Math.min(6,Math.max(.05,Math.exp(M.mu+hf+H.a-A.d+M.bo*rh+M.bd*ra+ch)*ah)),la=Math.min(6,Math.max(.05,Math.exp(M.mu+A.a-H.d+M.bo*ra+M.bd*rh+ca)*aa));
  const ph=pois(lh),pa=pois(la),rho=M.P.rho;let h=0,d=0,a=0,ov=0,bt=0,best=[0,0,0];
  for(let i=0;i<=MAXG;i++)for(let j=0;j<=MAXG;j++){let p=ph[i]*pa[j];
    if(i===0&&j===0)p*=1-lh*la*rho;else if(i===0&&j===1)p*=1+lh*rho;else if(i===1&&j===0)p*=1+la*rho;else if(i===1&&j===1)p*=1-rho;
    if(i>j)h+=p;else if(i===j)d+=p;else a+=p;if(i+j>2)ov+=p;if(i>0&&j>0)bt+=p;if(p>best[2])best=[i,j,p]}
  const s=h+d+a;
  return{p:[h/s*100,d/s*100,a/s*100],ou:ov/s*100,bt:bt/s*100,xg:[lh,la],ms:[best[0],best[1]],rest:[rh,ra],n:[H.n,A.n]};
}

// Uji mundur bergulir: model dilatih ulang tiap `stepD` hari hanya dari laga SEBELUM periode itu, lalu memprediksi laga periode itu.
// Mengembalikan baris {id,t,l,o,p} (o = hasil 0/1/2) untuk laga yang kedua timnya sudah punya >= minGames laga.
export function rollingBacktest(ms,from,to,o={},stepD=7){
  const P={...DEF,...o},out=[];
  for(let t=from;t<to;t+=stepD*DAY){const M=fitModel(ms,t,P);
    for(const m of ms){if(m.t<t||m.t>=Math.min(to,t+stepD*DAY))continue;const a=M.team.get(m.h),b=M.team.get(m.a);if(!a||!b||a.n<P.minGames||b.n<P.minGames)continue;
      const q=predictModel(M,m),R=o.ranks?strengthRanks(M,m.l):null;
      out.push({id:m.id,t:m.t,l:m.l,h:m.h,a:m.a,o:m.gh>m.ga?0:m.gh===m.ga?1:2,p:q.p,ou:q.ou,bt:q.bt,g:m.gh+m.ga,b2:m.gh>0&&m.ga>0,
        sr:R?[R.get(m.h)??null,R.get(m.a)??null,R.size]:null})}}
  return out;
}

// V29b: RPS (ranked probability score) = ukuran baku prediksi sepak bola; menghargai "hampir benar" (tebak menang, hasil seri) lebih dari "salah jauh".
export function rps(p,o){const c1=p[0]-(o===0?1:0),c2=p[0]+p[1]-(o<=1?1:0);return(c1*c1+c2*c2)/2}
export function score(rows,key="p"){
  let n=0,acc=0,br=0,ll=0,rp=0;for(const r of rows){const p=r[key];if(!p)continue;n++;const pk=p.indexOf(Math.max(...p));if(pk===r.o)acc++;
    for(let k=0;k<3;k++)br+=(p[k]/100-(k===r.o?1:0))**2;ll-=Math.log(Math.max(p[r.o]/100,1e-6));rp+=rps(p.map(x=>x/100),r.o)}
  return n?{n,acc:acc/n*100,brier:br/n,ll:ll/n,rps:rp/n}:null;
}
// V22d: laga di mana dua sumber berbeda arah (tebakan peluang tertinggi tidak sama): siapa yang benar.
// bl50 = bagian di mana sumber kedua (Model BL) cukup yakin (>= 50%) pada tebakannya.
export function disagree(rows,ka="b",kb="p"){
  const ix=p=>p.indexOf(Math.max(...p));let all=0,n=0,a=0,b=0,z=0,n5=0,a5=0,b5=0;
  for(const r of rows){const pa=r[ka],pb=r[kb];if(!pa||!pb||r.o==null)continue;all++;const ia=ix(pa),ib=ix(pb);if(ia===ib)continue;n++;
    if(ia===r.o)a++;else if(ib===r.o)b++;else z++;if(pb[ib]>=50){n5++;if(ia===r.o)a5++;if(ib===r.o)b5++}}
  return n?{n,of:all,bsd:a,bl:b,none:z,bl50:{n:n5,bsd:a5,bl:b5}}:null;
}
// V24b: uji coba (belum mengubah prediksi). rows: baris uji mundur {t,h,a,o,b (BSD %),p (BL %)}; name(id) -> nama tim.
// 1) Tim muda/cadangan (Jong, U21/U23, II, B, NXT, ...): apakah lebih sulit ditebak, dan apakah peluang BSD perlu "dilunakkan".
// 2) Aturan tebak seri: tebak seri bila peluang tertinggi < thr dan peluang seri >= dmin. Setelan dipilih di paruh pertama, dinilai di paruh kedua.
export const YOUTH=/(^|\s)(jong|u-?1[7-9]|u-?2[0-3]|ii|b|nxt|next gen|reserves?|youth|primavera|castilla|sub-?2[0-3])(\s|$)/i;
export function experiments(rows,name){
  const R=(rows||[]).filter(r=>r.b&&r.o!=null).slice().sort((a,b)=>a.t-b.t);if(R.length<200)return null;
  const ix=p=>p.indexOf(Math.max(...p)),acc=(L,k)=>L.length?L.filter(r=>r[k]&&ix(r[k])===r.o).length/L.filter(r=>r[k]).length*100:null;
  const flat=(p,T)=>{const q=p.map(x=>Math.pow(Math.max(x,.01)/100,1/T)),s=q[0]+q[1]+q[2];return q.map(x=>x/s)};
  const ll=(L,T)=>L.length?-L.reduce((s,r)=>s+Math.log(Math.max(flat(r.b,T)[r.o],1e-6)),0)/L.length:null;
  const half=Math.floor(R.length/2),A=R.slice(0,half),B=R.slice(half);
  // 1) tim muda/cadangan
  const isY=r=>YOUTH.test(String(name(r.h)||"").trim())||YOUTH.test(String(name(r.a)||"").trim());
  const Y=R.filter(isY),N=R.filter(r=>!isY(r)),TS=[1,1.1,1.2,1.3,1.45,1.6];
  let youth={n:Y.length,of:R.length,accB:acc(Y,"b"),accL:acc(Y,"p"),accBo:acc(N,"b"),accLo:acc(N,"p"),llB:ll(Y,1),llBo:ll(N,1)};
  const YA=A.filter(isY),YB=B.filter(isY);
  if(YA.length>=40&&YB.length>=40){let T=1,bl=ll(YA,1);for(const t of TS){const v=ll(YA,t);if(v<bl-1e-9){bl=v;T=t}}youth.T=T;youth.hold={n:YB.length,ll1:ll(YB,1),llT:ll(YB,T)};youth.gain=youth.hold.ll1-youth.hold.llT}
  // 2) aturan tebak seri (untuk BSD)
  const pickD=(p,th,dm)=>Math.max(...p)<th&&p[1]>=dm?1:ix(p);
  const hits=(L,th,dm)=>L.filter(r=>pickD(r.b,th,dm)===r.o).length;
  let best={th:0,dm:101,h:hits(A,0,101)};for(const th of [36,38,40,42,45])for(const dm of [27,29,31,33]){const h=hits(A,th,dm);if(h>best.h)best={th,dm,h}}
  const nD=B.filter(r=>pickD(r.b,best.th,best.dm)===1&&ix(r.b)!==1).length,draw={th:best.th||null,dm:best.th?best.dm:null,hold:{n:B.length,base:hits(B,0,101)/B.length*100,rule:hits(B,best.th,best.dm)/B.length*100,nDraw:nD}};
  draw.gain=draw.hold.rule-draw.hold.base;
  const r1=x=>x==null?null:Math.round(x*1000)/1000;
  for(const k of ["accB","accL","accBo","accLo","llB","llBo","gain"])if(youth[k]!=null)youth[k]=r1(youth[k]);
  if(youth.hold){youth.hold.ll1=r1(youth.hold.ll1);youth.hold.llT=r1(youth.hold.llT)}
  draw.hold.base=r1(draw.hold.base);draw.hold.rule=r1(draw.hold.rule);draw.gain=r1(draw.gain);
  return{youth,draw}}
// Bobot gabungan terbaik (linear) antara dua sumber peluang, dipilih dengan log loss.
export function bestBlend(rows,ka,kb){
  const R=rows.filter(r=>r[ka]&&r[kb]);if(!R.length)return null;let best=null;
  for(let w=0;w<=1.0001;w+=.05){const m=R.map(r=>({o:r.o,q:r[ka].map((x,i)=>w*x+(1-w)*r[kb][i])})),s=score(m,"q");if(!best||s.ll<best.ll-1e-12)best={w:Math.round(w*100)/100,...s}}
  return best;
}

// Peluang dari dua laju gol (dipakai ulang tiap run untuk koreksi line-up tanpa melatih ulang).
export function probs(lh,la,rho=DEF.rho){
  const ph=pois(lh),pa=pois(la);let h=0,d=0,a=0,ov=0,bt=0,best=[0,0,0];
  for(let i=0;i<=MAXG;i++)for(let j=0;j<=MAXG;j++){let p=ph[i]*pa[j];
    if(i===0&&j===0)p*=1-lh*la*rho;else if(i===0&&j===1)p*=1+lh*rho;else if(i===1&&j===0)p*=1+la*rho;else if(i===1&&j===1)p*=1-rho;
    if(i>j)h+=p;else if(i===j)d+=p;else a+=p;if(i+j>2)ov+=p;if(i>0&&j>0)bt+=p;if(p>best[2])best=[i,j,p]}
  const s=h+d+a;return{p:[h/s*100,d/s*100,a/s*100],ou:ov/s*100,bt:bt/s*100,ms:[best[0],best[1]]};
}
// Pemain inti: starter di >= 50% line-up resmi yang tercatat (minimal 3 line-up). XI = [[waktu, [id pemain]]...]
export function regulars(XI){if(!XI||XI.length<3)return null;const c=new Map();for(const [,ids] of XI)for(const i of ids)c.set(i,(c.get(i)||0)+1);
  return new Set([...c].filter(([,n])=>n/XI.length>=.5).map(([i])=>i))}
// Berapa pemain inti yang tidak main: dari line-up resmi laga ini bila ada (paling akurat), kalau tidak dari daftar absen.
export function missingCore(reg,xi,absent){if(!reg)return null;const k=xi&&xi.length>=11?[...reg].filter(i=>!xi.includes(i)).length:[...(absent||[])].filter(i=>reg.has(i)).length;return Math.min(5,k)}
// Koreksi laju gol per pemain inti yang hilang (nilai awal yang konservatif; akan dinilai dari riwayat).
export const CORE={own:.035,opp:.025};
export function adjustL(lh,la,kh,ka){kh=kh||0;ka=ka||0;return[lh*Math.exp(-CORE.own*kh+CORE.opp*ka),la*Math.exp(-CORE.own*ka+CORE.opp*kh)]}

// Kalibrasi suhu: p_i^(1/T) dinormalkan. T > 1 = kurangi keyakinan, T < 1 = tambah. T dipilih dari uji mundur (log loss).
export function temper(p,T){if(!T||T===1)return p;const q=p.map(x=>Math.pow(Math.max(x,1e-6),1/T)),s=q[0]+q[1]+q[2];return q.map(x=>x/s*100)}
export function bestTemp(rows){let b=null;for(let T=.8;T<=1.401;T+=.025){const s=score(rows.map(r=>({o:r.o,q:temper(r.p,T)})),"q");if(s&&(!b||s.ll<b.ll-1e-12))b={T:Math.round(T*1000)/1000,ll:s.ll}}return b?b.T:1}

// Peringkat kekuatan asli (serang + tahan, sudah dikoreksi kekuatan lawan) di antara tim yang liga rumahnya = liga ini. 1 = terkuat.
const RK=new WeakMap();
export function strengthRanks(M,l){let c=RK.get(M);if(!c){c=new Map();RK.set(M,c)}if(c.has(l))return c.get(l);
  const L=M.lg.get(l)||{A:0,D:0},T=[];for(const [id,t] of M.team)if(t.lg===l&&t.n>=4)T.push([id,L.A+t.a+L.D+t.d]);
  T.sort((x,y)=>y[1]-x[1]);const R=new Map(T.map(([id],i)=>[id,i+1]));c.set(l,R);return R}

// Musim: pakai id musim BSD bila ada; kalau tidak, musim baru dimulai saat liga itu libur > 40 hari.
export function seasonKeys(ms){const by=new Map();for(const m of ms)(by.get(m.l)||by.set(m.l,[]).get(m.l)).push(m);const key=new Map();
  for(const [l,L] of by){L.sort((a,b)=>a.t-b.t);let s=0,prev=null;for(const m of L){if(m.se!=null)key.set(m.id,l+":"+m.se);else{if(prev!=null&&m.t-prev>40*864e5)s++;key.set(m.id,l+":g"+s)}prev=m.t}}
  return key}
// Klasemen tepat sebelum tiap laga (poin, selisih gol, gol). Mengembalikan Map(id laga -> {h:[peringkat,main,poin], a:[...], n:jumlah tim}).
export function tablesAt(ms){
  const sk=seasonKeys(ms),by=new Map();for(const m of ms){const k=sk.get(m.id);(by.get(k)||by.set(k,[]).get(k)).push(m)}
  const out=new Map();
  for(const L of by.values()){L.sort((a,b)=>a.t-b.t);const T=new Map(),row=id=>T.get(id)||T.set(id,{p:0,gd:0,gf:0,n:0}).get(id);
    let i=0;while(i<L.length){let j=i;while(j<L.length&&L[j].t===L[i].t)j++;   // laga di jam yang sama: klasemen sebelum semuanya
      const order=[...T.entries()].sort((x,y)=>y[1].p-x[1].p||y[1].gd-x[1].gd||y[1].gf-x[1].gf),rk=new Map(order.map(([id],k)=>[id,k+1]));
      for(let k=i;k<j;k++){const m=L[k],h=T.get(m.h),a=T.get(m.a);out.set(m.id,{h:h?[rk.get(m.h),h.n,h.p]:[null,0,0],a:a?[rk.get(m.a),a.n,a.p]:[null,0,0],n:T.size})}
      for(let k=i;k<j;k++){const m=L[k];if(!Number.isFinite(m.gh)||!Number.isFinite(m.ga))continue;const h=row(m.h),a=row(m.a);h.n++;a.n++;h.gf+=m.gh;a.gf+=m.ga;h.gd+=m.gh-m.ga;a.gd+=m.ga-m.gh;if(m.gh>m.ga)h.p+=3;else if(m.gh<m.ga)a.p+=3;else{h.p++;a.p++}}
      i=j}}
  return out}
// Uji "klasemen menipu": laga di mana klasemen mengunggulkan satu tim (selisih peringkat >= gap) tapi kekuatan asli mengunggulkan lawannya.
// Untuk tim unggulan klasemen: berapa kali benar-benar menang vs peluang menang menurut BSD dan Model BL.
export function tableTest(rows,tab,o={}){
  const gap=o.gap??5,minN=o.minN??6,G={beda:[],sama:[],semua:[]};
  for(const r of rows){const T=tab.get(r.id);if(!T||!r.sr||r.sr[0]==null||r.sr[1]==null||!r.b)continue;const [th,nh]=T.h,[ta,na]=T.a;if(th==null||ta==null||nh<minN||na<minN)continue;
    const d=ta-th;if(Math.abs(d)<gap)continue;const fav=d>0?0:2;            // 0 = tuan rumah unggulan klasemen, 2 = tamu
    const rFav=r.sr[0]<r.sr[1]?0:2,x={win:r.o===fav?1:0,bsd:r.b[fav]/100,bl:r.p[fav]/100,gapT:Math.abs(d),gapR:Math.abs(r.sr[0]-r.sr[1])};
    G.semua.push(x);(rFav===fav?G.sama:G.beda).push(x)}
  const sum=L=>{if(!L.length)return{n:0};const n=L.length,w=L.reduce((s,x)=>s+x.win,0)/n,b=L.reduce((s,x)=>s+x.bsd,0)/n,m=L.reduce((s,x)=>s+x.bl,0)/n,se=Math.sqrt(Math.max(w*(1-w),.05)/n);
    return{n,win:w*100,bsd:b*100,bl:m*100,se:se*100,gapBsd:(w-b)*100}};
  return{gap,minN,beda:sum(G.beda),sama:sum(G.sama),semua:sum(G.semua)};
}
// Keberuntungan per tim (musim berjalan): poin vs poin harapan dari xG, gol vs xG.
export function luckOf(ms,now,days=200){
  const sk=seasonKeys(ms),cur=new Map();for(const m of ms){const k=sk.get(m.id);const c=cur.get(m.l);if(!c||m.t>c.t)cur.set(m.l,{t:m.t,k})}
  const T={},pp=(lh,la)=>{const P=l=>{const a=[Math.exp(-l)];for(let i=1;i<=10;i++)a.push(a[i-1]*l/i);return a},a=P(Math.max(lh,.05)),b=P(Math.max(la,.05));let h=0,d=0;for(let i=0;i<=10;i++)for(let j=0;j<=10;j++){const q=a[i]*b[j];if(i>j)h+=q;else if(i===j)d+=q}return[3*h+d,3*(1-h-d)+d]};
  for(const m of ms){const c=cur.get(m.l);if(!c||sk.get(m.id)!==c.k||m.t<now-days*864e5)continue;
    for(const [id,gf,ga,xf,xa,side] of [[m.h,m.gh,m.ga,m.xh,m.xa,0],[m.a,m.ga,m.gh,m.xa,m.xh,1]]){const t=T[id]=T[id]||{l:m.l,n:0,pts:0,gf:0,ga:0,xn:0,xgf:0,xga:0,xpts:0,xpN:0};
      t.n++;t.gf+=gf;t.ga+=ga;t.pts+=gf>ga?3:gf===ga?1:0;if(xf!=null&&xa!=null){t.xn++;t.xgf+=xf;t.xga+=xa;const e=pp(m.xh,m.xa)[side];t.xpts+=e;t.xpN+=gf>ga?3:gf===ga?1:0}}}
  return T}

// V20: fitur per laga untuk Model BL. tb = poin per laga di klasemen musim ini sebelum kickoff (hanya bila kedua tim sudah >= minN laga);
// nc = pelatih baru (pelatih berbeda dari sebelumnya, <= 4 laga pertama, pergantian < 90 hari). Laga mendatang (gh null) ikut dihitung
// dari data sebelum kickoff saja.
export function matchFeatures(ms,o={}){
  const minN=o.minN??6,tab=tablesAt(ms),out=new Map(),eu=o.eu||null,lastM=new Map();   // V21: eu = Set id liga Eropa/antarbenua
  const S=ms.slice().sort((a,b)=>a.t-b.t),st=new Map();   // per tim: {c: pelatih terakhir, same: laga beruntun dgn pelatih itu, oldT: laga terakhir pelatih sebelumnya}
  const flag=(id,c,t)=>{const x=st.get(id);if(c==null||!x||x.c==null)return 0;if(c!==x.c)return 1;return x.oldT!=null&&x.same<4&&t-x.oldT<90*DAY?1:0};
  const push=(id,c,t)=>{if(c==null)return;const x=st.get(id)||{c:null,same:0,oldT:null};if(x.c===c)x.same++;else{x.oldT=x.c!=null?x.lastT:null;x.c=c;x.same=1}x.lastT=t;st.set(id,x)};
  for(const m of S){const T=tab.get(m.id);let tb=null;if(T&&T.h[1]>=minN&&T.a[1]>=minN)tb=[T.h[2]/T.h[1],T.a[2]/T.a[1]];
    const nc=[flag(m.h,m.hc,m.t),flag(m.a,m.ac,m.t)];
    const euF=id=>{if(!eu||eu.has(m.l))return 0;const x=lastM.get(id);return x&&m.t-x.t<=4*DAY&&m.t>x.t&&eu.has(x.l)?1:0};
    const tr=T&&T.h[0]!=null&&T.a[0]!=null&&T.h[1]>=minN&&T.a[1]>=minN?[T.h[0],T.a[0],T.n]:null;
    out.set(m.id,{tb,nc,eu:[euF(m.h),euF(m.a)],tr});
    if(Number.isFinite(m.gh)){push(m.h,m.hc,m.t);push(m.a,m.ac,m.t);lastM.set(m.h,{t:m.t,l:m.l});lastM.set(m.a,{t:m.t,l:m.l})}}
  return out}

// V28 (uji coba, belum dipakai): koreksi line-up tahap 2 dari xi2.json (line-up resmi + statistik pemain per laga).
// Tanpa bocor: nilai pemain hanya dari laga SEBELUM tanggal laga. Nilai = rata-rata rating (berbobot menit) dari >=2 laga sebelumnya.
// Kualitas line-up tim = rata-rata nilai starter yang dikenal; "dq" = kualitas hari ini dikurangi rata-rata 8 laga terakhir tim itu.
// Lalu diuji: apakah menggeser peluang BSD / Model BL sebesar exp(beta*(dqH-dqA)) memperbaiki log loss pada separuh laga terakhir.
export function lineupFeatures(E,minKnown=7){
  const L=Object.entries(E||{}).filter(([,e])=>e&&Array.isArray(e.s)&&e.s.length===2&&Array.isArray(e.r)&&e.r.length).map(([id,e])=>({id:String(id),...e})).sort((a,b)=>a.t-b.t);
  const P=new Map(),T=new Map(),F=new Map(),TG=new Map();
  const val=pid=>{const q=P.get(pid);return q&&q.n>=2&&q.m>0?q.s/q.m:null};
  // V31: kiper (pemain yang pernah mencatat penyelamatan) & beban menit 8 hari terakhir per starter
  const isGK=pid=>{const q=P.get(pid);return!!(q&&q.sv>0)};
  const load=(ids,t)=>{let s=0,k=0;for(const p of ids){const q=P.get(p);if(!q)continue;k++;for(const [tt,mm] of q.rec)if(t-tt<=8*86400&&t>tt)s+=mm}return k>=7?s/k:null};
  const gkSide=(ids,team)=>{const g=ids.find(isGK);if(g==null)return null;const H=TG.get(team)||[];if(H.length<5)return{g,backup:null};
    const c=new Map();for(const x of H.slice(-8))c.set(x,(c.get(x)||0)+1);const top=[...c].sort((a,b)=>b[1]-a[1])[0][0];return{g,backup:g!==top&&(c.get(g)||0)<=1?1:0}};
  for(const e of L){
    const gh=gkSide(e.s[0],e.h),ga=gkSide(e.s[1],e.a),fh=load(e.s[0],e.t),fa=load(e.s[1],e.t);
    const side=(ids,team)=>{const v=ids.map(val).filter(x=>x!=null);if(v.length<minKnown)return null;const Q=v.reduce((a,b)=>a+b,0)/v.length;
      const H=T.get(team)||[];const typ=H.length>=3?H.slice(-8).reduce((a,b)=>a+b,0)/Math.min(8,H.length):null;return{Q,typ,known:v.length}};
    const h=side(e.s[0],e.h),a=side(e.s[1],e.a);
    const ex={gk:[gh&&gh.backup,ga&&ga.backup],fat:[fh,fa]};
    if(h&&a&&h.typ!=null&&a.typ!=null)F.set(e.id,{dh:h.Q-h.typ,da:a.Q-a.typ,t:e.t,...ex});else F.set(e.id,{t:e.t,...ex,only:1});
    if(gh)TG.set(e.h,[...(TG.get(e.h)||[]),gh.g].slice(-12));if(ga)TG.set(e.a,[...(TG.get(e.a)||[]),ga.g].slice(-12));
    if(h)T.set(e.h,[...(T.get(e.h)||[]),h.Q].slice(-12));if(a)T.set(e.a,[...(T.get(e.a)||[]),a.Q].slice(-12));
    for(const r of e.r){const q=P.get(r[0])||{n:0,s:0,m:0,sv:0,rec:[]};if(r[10]>0)q.sv++;q.rec.push([e.t,r[2]]);if(q.rec.length>6)q.rec.shift();
      if(!(r[3]<0||r[2]<20)){q.n++;q.s+=r[3]/10*r[2];q.m+=r[2]}P.set(r[0],q)}}
  return F}
export function lineupExp(rows,E){
  const F=lineupFeatures(E);if(!F.size)return null;
  // V31: uji faktor kiper cadangan & beban menit tinggi (tim yang terkena vs peluang menang BSD)
  const fac2=(()=>{const G={};const add=(k,win,b)=>{const g=G[k]=G[k]||{n:0,w:0,b:0};g.n++;g.w+=win;g.b+=b};
    for(const r of rows||[]){const f=F.get(String(r&&r.id));if(!f||!r.b||r.o==null)continue;for(const s of [0,1]){const win=r.o===(s?2:0)?1:0,b=r.b[s?2:0]/100;
      if(f.gk&&f.gk[s]===1)add("kiperCadangan",win,b);if(f.gk&&f.gk[s]===0)add("kiperUtama",win,b);if(f.fat&&f.fat[s]!=null&&f.fat[s]>=150)add("bebanTinggi",win,b);if(f.fat&&f.fat[s]!=null&&f.fat[s]<60)add("segar",win,b)}}
    const o={};for(const [k,g] of Object.entries(G)){const w=g.w/g.n,b=g.b/g.n;o[k]={n:g.n,win:Math.round(w*1000)/10,bsd:Math.round(b*1000)/10,gap:Math.round((w-b)*1000)/10,se:Math.round(Math.sqrt(Math.max(w*(1-w),.05)/g.n)*1000)/10}}return o})();
  const R=(rows||[]).filter(r=>r&&r.b&&r.o!=null&&F.has(String(r.id))&&!F.get(String(r.id)).only).map(r=>({...r,f:F.get(String(r.id))})).sort((a,b)=>a.f.t-b.f.t);
  const out={feat:F.size,n:R.length,fac:fac2};if(R.length<200)return{...out,note:"belum cukup laga"};
  const adj=(p,z,beta)=>{const q=[p[0]*Math.exp(beta*z),p[1],p[2]*Math.exp(-beta*z)].map(x=>Math.max(x,1e-6)),s=q[0]+q[1]+q[2];return q.map(x=>x/s)};
  const ll=(L,k,beta)=>-L.reduce((s,r)=>s+Math.log(adj(r[k].map(x=>x/100),r.f.dh-r.f.da,beta)[r.o]),0)/L.length;
  const acc=(L,k,beta)=>L.filter(r=>{const q=adj(r[k].map(x=>x/100),r.f.dh-r.f.da,beta);return q.indexOf(Math.max(...q))===r.o}).length/L.length*100;
  const half=Math.floor(R.length/2),A=R.slice(0,half),B=R.slice(half),G=[0,.5,1,1.5,2,3,4,6,8],r3=x=>Math.round(x*1000)/1000;
  for(const k of ["b","p"]){const AA=A.filter(r=>r[k]),BB=B.filter(r=>r[k]);if(AA.length<100||BB.length<100)continue;
    let beta=0,best=ll(AA,k,0);for(const g of G){const v=ll(AA,k,g);if(v<best-1e-9){best=v;beta=g}}
    const base=ll(BB,k,0),withLu=ll(BB,k,beta);out[k==="b"?"bsd":"bl"]={beta,n:BB.length,ll0:r3(base),ll1:r3(withLu),gain:r3(base-withLu),acc0:r3(acc(BB,k,0)),acc1:r3(acc(BB,k,beta)),pass:base-withLu>=.002}}
  const ad=R.map(r=>Math.abs(r.f.dh-r.f.da)).sort((a,b)=>a-b);out.medGap=r3(ad[ad.length>>1]);
  return out}

// V30 (analisis seri): (1) tingkat seri per liga vs perkiraan BSD; (2) aturan "rawan seri" (BSD & Model BL sama-sama melihat laga berimbang);
// (3) koreksi seri per liga (ditarik ke 0, k=150 laga) — semua dipelajari di separuh awal dan diuji di separuh akhir (urut waktu).
export function drawExp(rows){
  const R=(rows||[]).filter(r=>r&&r.b&&r.o!=null).slice().sort((a,b)=>a.t-b.t);if(R.length<400)return null;
  const half=Math.floor(R.length/2),A=R.slice(0,half),B=R.slice(half),r3=x=>x==null?null:Math.round(x*1000)/1000,r1=x=>x==null?null:Math.round(x*10)/10;
  // 1) per liga (semua laga)
  const G=new Map();for(const r of R){const g=G.get(r.l)||{n:0,d:0,bd:0};g.n++;if(r.o===1)g.d++;g.bd+=r.b[1];G.set(r.l,g)}
  const lg=[...G].filter(([,g])=>g.n>=40).map(([l,g])=>[l,g.n,r1(g.d/g.n*100),r1(g.bd/g.n)]).sort((a,b)=>Math.abs(b[2]-b[3])-Math.abs(a[2]-a[3])).slice(0,15);
  const base=x=>x.length?x.filter(r=>r.o===1).length/x.length*100:null;
  // 2) aturan rawan seri
  const flag=(r,th,dm)=>Math.max(r.b[0],r.b[2])<th&&r.b[1]>=dm&&(!r.p||r.p[1]>=dm-2);
  let best=null;for(const th of [38,40,42,44,46])for(const dm of [26,28,30,32]){const F=A.filter(r=>flag(r,th,dm));if(F.length<60)continue;const lift=base(F)-base(A);if(!best||lift>best.lift)best={th,dm,lift,nA:F.length}}
  let rule=null;if(best){const F=B.filter(r=>flag(r,best.th,best.dm)),d=base(F),b0=base(B),bd=F.length?F.reduce((s,r)=>s+r.b[1],0)/F.length:null;
    rule={th:best.th,dm:best.dm,nA:best.nA,test:{n:F.length,draw:r1(d),base:r1(b0),bsdD:r1(bd)},pass:F.length>=60&&d-b0>=5}}
  // 3) koreksi seri per liga
  const k=150,ll=(L,dl)=>-L.reduce((s,r)=>{const d=dl.get(r.l)||0,q=[r.b[0],r.b[1]*Math.exp(d),r.b[2]],t=q[0]+q[1]+q[2];return s+Math.log(Math.max(q[r.o]/t,1e-6))},0)/L.length;
  const GA=new Map();for(const r of A){const g=GA.get(r.l)||{n:0,d:0,bd:0};g.n++;if(r.o===1)g.d++;g.bd+=r.b[1]/100;GA.set(r.l,g)}
  const dl=new Map();for(const [l,g] of GA){const w=g.n/(g.n+k),obs=(g.d+.5)/(g.n+1),exp=Math.max(g.bd/g.n,.05);dl.set(l,w*Math.log(obs/exp))}
  const ll0=ll(B,new Map()),ll1=ll(B,dl),corr={n:B.length,ll0:r3(ll0),ll1:r3(ll1),gain:r3(ll0-ll1),pass:ll0-ll1>=.002};
  return{n:R.length,draw:r1(base(R)),bsdDraw:r1(R.reduce((s,r)=>s+r.b[1],0)/R.length),lg,rule,corr}}
