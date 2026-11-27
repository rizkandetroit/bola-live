// V21: lapisan koreksi BSD ("stacking").
// Peluang BSD dipakai sebagai dasar, lalu dikoreksi di bagian yang terbukti keliru:
//   - seberapa jauh ikut Model BL (global + per liga),
//   - seberapa yakin BSD boleh dipercaya (suhu: global + per liga; liga tempat BSD sering meleset jadi lebih datar),
//   - klasemen menipu (selisih poin per laga), pelatih baru, jadwal padat setelah laga Eropa,
//   - kecenderungan seri (global + per liga).
// Skor hasil k (0 = tuan rumah, 1 = seri, 2 = tamu):
//   s_k = tau*ln b_k + w*(ln p_k - ln b_k) + side_k*z + [k=1]*dr ,  side = [+1, 0, -1]
//   tau = 1 + t0 + t_liga, w = w0 + u_liga, dr = d0 + d_liga, z = th_tb*dtb + th_nc*dnc + th_eu*deu
// Peluang = softmax(s). Semua parameter linear di s, jadi log-loss cembung: dicari dengan Newton diagonal + ridge.
// Parameter liga ditarik ke 0 (kL ~ jumlah laga yang dibutuhkan supaya koreksi liga bergeser setengah jalan).

const SIDE=[1,0,-1],EPS=1e-4;
const lg=x=>Math.log(Math.max(x,EPS));
const sm=s=>{const m=Math.max(s[0],s[1],s[2]),e=s.map(v=>Math.exp(v-m)),t=e[0]+e[1]+e[2];return e.map(v=>v/t)};

// fitur satu laga (r: {b:[%], p:[%]|null, tb:[ppgH,ppgA]|null, nc:[0/1,0/1]|null, eu:[0/1,0/1]|null})
function feat(r){
  const b=r.b.map(x=>x/100),lb=b.map(lg),p=r.p?r.p.map(x=>x/100):null,lp=p?p.map(lg):lb;
  const dtb=r.tb?Math.max(-2,Math.min(2,r.tb[0]-r.tb[1])):0,dnc=r.nc?(r.nc[0]||0)-(r.nc[1]||0):0,deu=r.eu?(r.eu[0]||0)-(r.eu[1]||0):0;
  return{lb,dl:lp.map((v,i)=>v-lb[i]),x:[dtb,dnc,deu]};
}
const TH=["tb","nc","eu"];

function scores(M,F,l){
  const L=M.lg[l]||[0,0,0],tau=1+M.t0+L[0],w=M.w0+L[1],dr=M.d0+L[2];
  const z=M.th[0]*F.x[0]+M.th[1]*F.x[1]+M.th[2]*F.x[2];
  return[0,1,2].map(k=>tau*F.lb[k]+w*F.dl[k]+SIDE[k]*z+(k===1?dr:0));
}

// sistem linear kecil (eliminasi Gauss dengan pivot)
function solve(A,b){const n=b.length,M=A.map((r,i)=>[...r,b[i]]);
  for(let c=0;c<n;c++){let p=c;for(let r=c+1;r<n;r++)if(Math.abs(M[r][c])>Math.abs(M[p][c]))p=r;[M[c],M[p]]=[M[p],M[c]];const d=M[c][c];if(Math.abs(d)<1e-12)return new Array(n).fill(0);
    for(let r=0;r<n;r++){if(r===c)continue;const f=M[r][c]/d;if(f)for(let k=c;k<=n;k++)M[r][k]-=f*M[c][k]}}
  return M.map((r,i)=>r[n]/r[i])}
// turunan skor per hasil terhadap parameter global [t0,w0,d0,th_tb,th_nc,th_eu] dan liga [t,u,d]
const dG=(f,k)=>[f.lb[k],f.dl[k],k===1?1:0,SIDE[k]*f.x[0],SIDE[k]*f.x[1],SIDE[k]*f.x[2]];
function nll(M,R,F,lamG,lamL){let l=0;for(let i=0;i<R.length;i++){const q=sm(scores(M,F[i],R[i].l));l-=Math.log(Math.max(q[R[i].o],1e-12))}l/=R.length;
  l+=lamG*(M.t0**2+M.w0**2+M.d0**2+M.th.reduce((s,v)=>s+v*v,0));for(const k in M.lg)l+=lamL*M.lg[k].reduce((s,v)=>s+v*v,0);return l}
// Newton per blok (global, lalu tiap liga) bergantian; tiap langkah dicek tidak memperburuk.
export function fitStack(rows,o={}){
  const R=rows.filter(r=>r&&r.b&&r.o!=null),N=R.length;if(N<50)return null;
  const kL=o.kL??40,kG=o.kG??5,it=o.iters??30,F=R.map(feat);
  const M={t0:0,w0:0,d0:0,th:[0,0,0],lg:{},n:N},byL={};
  R.forEach((r,i)=>{(byL[r.l]=byL[r.l]||[]).push(i)});for(const l in byL)M.lg[l]=[0,0,0];
  const lamG=kG/N,lamL=kL/N;let cur=nll(M,R,F,lamG,lamL);
  const getG=()=>[M.t0,M.w0,M.d0,...M.th],setG=P=>{M.t0=o.thOnly?0:Math.max(-.7,P[0]);M.w0=o.thOnly?0:Math.max(-.5,Math.min(1.2,P[1]));M.d0=o.thOnly?0:P[2];M.th=[P[3],P[4],P[5]]};   // V57: thOnly = hanya 3 faktor (suhu, Model BL, seri dikunci 0)
  for(let iter=0;iter<it;iter++){
    // blok global
    {const g=new Array(6).fill(0),H=[...Array(6)].map(()=>new Array(6).fill(0));
      for(let i=0;i<N;i++){const f=F[i],q=sm(scores(M,f,R[i].l)),D=[0,1,2].map(k=>dG(f,k)),mD=new Array(6).fill(0);
        for(let k=0;k<3;k++){const e=q[k]-(R[i].o===k?1:0);for(let a=0;a<6;a++){g[a]+=e*D[k][a]/N;mD[a]+=q[k]*D[k][a];for(let b=a;b<6;b++)H[a][b]+=q[k]*D[k][a]*D[k][b]/N}}
        for(let a=0;a<6;a++)for(let b=a;b<6;b++)H[a][b]-=mD[a]*mD[b]/N}
      const P=getG();for(let a=0;a<6;a++){g[a]+=2*lamG*P[a];H[a][a]+=2*lamG+1e-9;for(let b=0;b<a;b++)H[a][b]=H[b][a]}
      const st=solve(H,g);let sc=1,ok=false;for(let t=0;t<8;t++){setG(P.map((v,a)=>v-sc*st[a]));const nl=nll(M,R,F,lamG,lamL);if(nl<=cur+1e-12){cur=nl;ok=true;break}sc/=2}if(!ok)setG(P)}
    // blok liga (tiap liga terpisah; baris liga lain tidak terpengaruh)
    for(const l in byL){const ix=byL[l],L=M.lg[l],g=[0,0,0],H=[[0,0,0],[0,0,0],[0,0,0]];
      for(const i of ix){const f=F[i],q=sm(scores(M,f,l)),D=[0,1,2].map(k=>dG(f,k).slice(0,3)),mD=[0,0,0];
        for(let k=0;k<3;k++){const e=q[k]-(R[i].o===k?1:0);for(let a=0;a<3;a++){g[a]+=e*D[k][a]/N;mD[a]+=q[k]*D[k][a];for(let b=0;b<3;b++)H[a][b]+=q[k]*D[k][a]*D[k][b]/N}}
        for(let a=0;a<3;a++)for(let b=0;b<3;b++)H[a][b]-=mD[a]*mD[b]/N}
      for(let a=0;a<3;a++){g[a]+=2*lamL*L[a];H[a][a]+=2*lamL+1e-9}
      const st=solve(H,g),old=L.slice();
      const lossL=()=>{let s=0;for(const i of ix){const q=sm(scores(M,F[i],l));s-=Math.log(Math.max(q[R[i].o],1e-12))}return s/N+lamL*M.lg[l].reduce((a,v)=>a+v*v,0)};
      const before=lossL();let sc=1,ok=false;for(let t=0;t<8;t++){M.lg[l]=old.map((v,a)=>v-sc*st[a]);M.lg[l][0]=Math.max(-.7-M.t0,M.lg[l][0]);if(lossL()<=before+1e-12){ok=true;break}sc/=2}if(!ok)M.lg[l]=old}
    const nl=nll(M,R,F,lamG,lamL);const d=cur-nl;cur=nl;if(iter>2&&Math.abs(d)<1e-8)break;
  }
  for(const l in M.lg)M.lg[l]=M.lg[l].map(v=>Math.round(v*1e4)/1e4).concat(byL[l].length);
  M.t0=Math.round(M.t0*1e4)/1e4;M.w0=Math.round(M.w0*1e4)/1e4;M.d0=Math.round(M.d0*1e4)/1e4;M.th=M.th.map(v=>Math.round(v*1e4)/1e4);
  return M;
}

// peluang % setelah koreksi
export function applyStack(M,r){if(!M||!r||!r.b)return null;const q=sm(scores(M,feat(r),r.l));return q.map(v=>v*100)}

// log-loss & akurasi
export function scoreP(rows,get){let n=0,l=0,a=0;for(const r of rows){const q=get(r);if(!q)continue;n++;l-=Math.log(Math.max(q[r.o]/100,1e-6));if(q.indexOf(Math.max(...q))===r.o)a++}
  return n?{n,ll:l/n,acc:a/n*100}:null}

// label keyakinan dari peluang tampil + kesepakatan BSD vs Model BL
export function labelOf(q,b,p){if(!q)return null;const top=Math.max(...q),ib=b?b.indexOf(Math.max(...b)):null,ip=p?p.indexOf(Math.max(...p)):null,agree=ib==null||ip==null||ib===ip;
  return top>=55&&agree?"jelas":top<42||!agree?"terbuka":"cukup"}
export function labelStats(rows,get){const S={jelas:{n:0,hit:0},cukup:{n:0,hit:0},terbuka:{n:0,hit:0}};
  for(const r of rows){const q=get(r);if(!q)continue;const k=labelOf(q,r.b,r.p);S[k].n++;if(q.indexOf(Math.max(...q))===r.o)S[k].hit++}
  for(const k in S)S[k].hit=S[k].n?Math.round(S[k].hit/S[k].n*1000)/10:null;return S}

// Seluruh proses: bagi menurut waktu (70% awal untuk belajar, 30% akhir untuk uji), bandingkan dengan BSD & gabungan linear,
// aktif hanya bila lebih baik; model produksi dilatih ulang dari semua data.
export function trainStack(rows,o={}){
  const R=rows.filter(r=>r&&r.b&&r.o!=null).sort((a,b)=>a.t-b.t);if(R.length<300)return{on:false,n:R.length,why:"data kurang"};
  const cut=Math.floor(R.length*.7),tr=R.slice(0,cut),te=R.slice(cut),Mt=fitStack(tr,o);
  // gabungan linear (cara lama) dengan bobot dari data belajar
  let bw=1,bl=Infinity;for(let w=0;w<=1.0001;w+=.05){const s=scoreP(tr,r=>r.p?r.b.map((x,i)=>w*x+(1-w)*r.p[i]):r.b);if(s&&s.ll<bl){bl=s.ll;bw=w}}
  const sS=scoreP(te,r=>applyStack(Mt,r)),sB=scoreP(te,r=>r.b),sL=scoreP(te,r=>r.p?r.b.map((x,i)=>bw*x+(1-bw)*r.p[i]):r.b);
  const on=!!(sS&&sB&&te.length>=(o.minTest??300)&&sS.ll<Math.min(sB.ll,sL.ll)-(o.margin??.002));
  const lab=labelStats(te,on?(r=>applyStack(Mt,r)):(r=>r.b));
  const M=fitStack(R,o);
  return{on,n:R.length,nTest:te.length,test:{stack:sS,bsd:sB,blend:{...sL,w:bw}},lab,m:M};
}

// V21: odds pasar sebagai masukan internal (tidak ditampilkan). Peluang pasar = 1/odds dinormalkan (margin bandar dibuang).
export function marketP(o){if(!o||o.length!==3||o.some(x=>!(x>1)))return null;const q=o.map(x=>1/x),t=q[0]+q[1]+q[2];return q.map(x=>x/t*100)}
export function poolMarket(q,m,beta){if(!q||!m||!beta)return q;return sm([0,1,2].map(k=>lg(q[k]/100)+beta*(lg(m[k]/100)-lg(q[k]/100)))).map(v=>v*100)}
// rows: [{o,q:[%],m:[%],t}] -> bobot pasar terbaik, diuji pada 30% laga terakhir
export function trainMarket(rows,o={}){
  const R=rows.filter(r=>r.q&&r.m&&r.o!=null).sort((a,b)=>a.t-b.t);if(R.length<(o.minN??300))return{on:false,n:R.length,beta:0};
  const cut=Math.floor(R.length*.7),tr=R.slice(0,cut),te=R.slice(cut);
  let best=0,bl=Infinity;for(let b=0;b<=1.0001;b+=.05){const s=scoreP(tr,r=>poolMarket(r.q,r.m,b));if(s.ll<bl){bl=s.ll;best=Math.round(b*100)/100}}
  const s1=scoreP(te,r=>poolMarket(r.q,r.m,best)),s0=scoreP(te,r=>r.q);
  const on=!!(best>0&&s1.ll<s0.ll-(o.margin??.002));
  let ball=best;if(on){let bl2=Infinity;for(let b=0;b<=1.0001;b+=.05){const s=scoreP(R,r=>poolMarket(r.q,r.m,b));if(s.ll<bl2){bl2=s.ll;ball=Math.round(b*100)/100}}}
  return{on,n:R.length,nTest:te.length,beta:on?ball:0,test:{with:s1,without:s0}};
}

// V29 (uji coba): koreksi TERARAH atas BSD — tanpa Model BL dan tanpa parameter per liga, hanya:
//   suhu global (t0), kecenderungan seri global (d0), dan 3 pola yang terbukti di uji faktor:
//   klasemen (selisih poin per laga), pelatih baru, habis laga Eropa. Total 6 angka -> sulit "hafal" data.
// Dinilai sama seperti V21: belajar 70% awal, uji 30% akhir, lolos bila log loss < BSD - 0,002.
export function trainLean(rows){
  const R=(rows||[]).map(r=>({...r,p:null}));const T=trainStack(R,{kL:1e9});
  if(!T||!T.m)return T?{on:false,n:T.n,why:T.why||null}:null;
  const r4=x=>Math.round(x*1e4)/1e4,te=T.test||{};
  return{on:T.on,n:T.n,nTest:T.nTest,test:{lean:te.stack,bsd:te.bsd},m:{t0:T.m.t0,d0:T.m.d0,th:T.m.th.map(r4),w0:0,lg:{}}};   // w0/lg kosong: bisa langsung dipakai applyStack
}

// V57 (uji coba, TIDAK dipakai prediksi): koreksi BSD HANYA dari 3 faktor (klasemen, pelatih baru, habis laga Eropa) — tanpa suhu,
// tanpa seri, tanpa Model BL, tanpa angka per liga. Hipotesis dari uji faktor (pelatih baru & habis Eropa menyimpang > 2,5 galat baku dari BSD).
// Karena hipotesis itu terbentuk dari data yang sama, uji ini dibuat lebih ketat dari V29: walk-forward 3 blok berurutan (latih hanya dari
// laga SEBELUM blok), lolos hanya bila rata-rata validasi lebih baik dari BSD (margin) DAN menang di >= 2 dari 3 blok; test akhir (25% terakhir)
// dibuka sekali sesudah keputusan validasi. Tetap perlu uji maju (laga sesudah hari ini) sebelum dipakai.
// gap: laga latih harus kickoff >= gap (bawaan 3 jam) sebelum laga pertama blok yang dinilai (hasilnya sudah diketahui saat itu).
export function trainFx(rows,{folds=3,fracTest=.25,margin=.001,minN=600,gap=3*36e5}={}){
  const R=(rows||[]).filter(r=>r&&r.b&&r.o!=null&&Number.isFinite(r.t)).map(r=>({...r,p:null})).sort((a,b)=>a.t-b.t);if(R.length<minN)return{on:false,n:R.length,why:"data kurang"};
  const nT=Math.floor(R.length*fracTest),dev=R.slice(0,R.length-nT),test=R.slice(R.length-nT),blk=Math.floor(dev.length/(folds+1)),o={kL:1e9,thOnly:true},r4=x=>Math.round(x*1e4)/1e4;
  const F=[];for(let f=0;f<folds;f++){const va=dev.slice(blk*(f+1),f===folds-1?dev.length:blk*(f+2)),tr=dev.slice(0,blk*(f+1)).filter(r=>r.t<=va[0].t-gap),M=fitStack(tr,o);
    const sF=scoreP(va,r=>applyStack(M,r)),sB=scoreP(va,r=>r.b);F.push({nTr:tr.length,nVa:va.length,trTo:tr.length?tr[tr.length-1].t:null,vaFrom:va[0].t,bsd:sB.ll,fx:sF.ll,th:M.th})}
  const w=F.reduce((a,f)=>a+f.nVa,0),avg=k=>F.reduce((a,f)=>a+f[k]*f.nVa,0)/w,wins=F.filter(f=>f.fx<f.bsd).length;
  const val={bsd:avg("bsd"),fx:avg("fx"),wins},pass=val.fx<val.bsd-margin&&wins>=Math.ceil(folds/2+.01);
  const trT=dev.filter(r=>r.t<=test[0].t-gap),M=fitStack(trT,o),d=test.map(r=>{const q=applyStack(M,r);return-Math.log(Math.max(q[r.o]/100,1e-6))+Math.log(Math.max(r.b[r.o]/100,1e-6))}),md=d.reduce((a,x)=>a+x,0)/d.length,se=Math.sqrt(d.reduce((a,x)=>a+(x-md)**2,0)/(d.length-1)/d.length);
  const tst={n:test.length,nTrain:trT.length,trTo:trT.length?trT[trT.length-1].t:null,from:test[0].t,bsd:scoreP(test,r=>r.b),fx:scoreP(test,r=>applyStack(M,r)),diff:r4(md),se:r4(se),th:M.th};
  // V59: model untuk UJI MAJU — dilatih dari SEMUA laga yang sudah selesai saat ini, dipakai ke laga yang BELUM mulai, angkanya dicatat
  //   sebelum kickoff & dikunci saat kickoff (riwayat + rekam jejak). Tidak mengubah prediksi; dinilai di bsd-eval.json (fxf).
  const MA=fitStack(R,o),m=MA?{t0:0,d0:0,th:MA.th.map(r4),w0:0,lg:{},to:R[R.length-1].t}:null;
  return{on:false,pass,n:R.length,gap,folds:F.map(f=>({...f,bsd:r4(f.bsd),fx:r4(f.fx)})),val:{bsd:r4(val.bsd),fx:r4(val.fx),wins},test:tst,m,note:"uji coba; tidak dipakai prediksi (uji maju berjalan sejak V59; perlu persetujuan sebelum dipakai)"};
}
