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
  let mu=Math.log(Math.max(.3,sg/Math.max(sw,1e-9))),hfa=.25,bo=0,bd=0;   // bo: istirahat pendek -> serang sendiri; bd: -> kebobolan
  const lh=new Float64Array(N),la=new Float64Array(N);
  const eta=()=>{for(let k=0;k<N;k++){const h=TL[H[k]],a=TL[A[k]],Lh=LL[tl[H[k]]],La=LL[tl[A[k]]],hf=NE[k]?0:hfa+LL[LG[k]].h;
    lh[k]=Math.exp(mu+hf+Lh.A+h.a-La.D-a.d+bo*SH[k]+bd*SA[k]);la[k]=Math.exp(mu+La.A+a.a-Lh.D-h.d+bo*SA[k]+bd*SH[k])}};
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
  return{P,mu,hfa,bo,bd,team,lg,times,n:N,asOf};
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
  const lh=Math.min(6,Math.max(.05,Math.exp(M.mu+hf+H.a-A.d+M.bo*rh+M.bd*ra)*ah)),la=Math.min(6,Math.max(.05,Math.exp(M.mu+A.a-H.d+M.bo*ra+M.bd*rh)*aa));
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
      const q=predictModel(M,m);out.push({id:m.id,t:m.t,l:m.l,o:m.gh>m.ga?0:m.gh===m.ga?1:2,p:q.p,ou:q.ou,bt:q.bt,g:m.gh+m.ga,b2:m.gh>0&&m.ga>0})}}
  return out;
}

export function score(rows,key="p"){
  let n=0,acc=0,br=0,ll=0;for(const r of rows){const p=r[key];if(!p)continue;n++;const pk=p.indexOf(Math.max(...p));if(pk===r.o)acc++;
    for(let k=0;k<3;k++)br+=(p[k]/100-(k===r.o?1:0))**2;ll-=Math.log(Math.max(p[r.o]/100,1e-6))}
  return n?{n,acc:acc/n*100,brier:br/n,ll:ll/n}:null;
}
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
