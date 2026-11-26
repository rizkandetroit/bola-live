// V57 (audit 26 Nov 2026): AUDIT KUALITAS PELUANG 1X2 — alat ukur yang bisa diulang, TIDAK dipakai produksi.
// Masukan: baris {t: waktu kickoff (ms), p: [H,D,A] dalam persen (dicatat SEBELUM kickoff), r: [gol tuan rumah, gol tamu], lg, ...}.
// Isi: metrik (log loss, Brier, akurasi, ECE, entropi), breakdown per kelompok, kalibrator multikelas (suhu, suhu + seri,
// "vector scaling" = Dirichlet sederhana dengan ridge), uji walk-forward dengan TEST AKHIR yang tidak disentuh sampai kandidat dipilih,
// dan bootstrap selisih log loss. Semua kalibrator dilatih hanya dari baris yang kickoff-nya SEBELUM baris yang dinilai.
const EPS=1e-6,LN=Math.log;
export const outcome=r=>r[0]>r[1]?0:r[0]===r[1]?1:2;
export const frac=p=>{const q=p.map(x=>Math.max(EPS,Number(x)||0)),s=q[0]+q[1]+q[2];return q.map(x=>x/s)};
const sm=s=>{const m=Math.max(...s),e=s.map(v=>Math.exp(v-m)),t=e[0]+e[1]+e[2];return e.map(v=>v/t)};
export const ent=q=>-q.reduce((a,x)=>a+(x>0?x*LN(x):0),0);
// q: peluang (pecahan, jumlah 1) -> metrik satu laga
// RPS (ranked probability score, urutan H < S < T), rumus sama dengan model.mjs: ((F1-O1)^2 + (F2-O2)^2) / 2
export const rps=(q,o)=>{const c1=q[0]-(o===0?1:0),c2=q[0]+q[1]-(o<=1?1:0);return(c1*c1+c2*c2)/2};
export function one(q,o){return{ll:-LN(Math.max(EPS,q[o])),br:q.reduce((a,x,i)=>a+(x-(i===o?1:0))**2,0),rp:rps(q,o),hit:q.indexOf(Math.max(...q))===o?1:0,h:ent(q)}}
// get(row) -> peluang pecahan; ECE = galat kalibrasi label teratas, 10 kelompok lebar sama (0-10%,...), berbobot jumlah laga
export function metrics(rows,get=r=>frac(r.p)){let n=0,ll=0,br=0,rp=0,hit=0,h=0;const B=Array.from({length:10},()=>({n:0,c:0,a:0}));
  for(const r of rows){const q=get(r);if(!q)continue;const o=outcome(r.r),m=one(q,o);n++;ll+=m.ll;br+=m.br;rp+=m.rp;hit+=m.hit;h+=m.h;const t=Math.max(...q),b=B[Math.min(9,Math.floor(t*10))];b.n++;b.c+=t;b.a+=m.hit}
  if(!n)return{n:0};let ece=0;for(const b of B)if(b.n)ece+=b.n/n*Math.abs(b.c/b.n-b.a/b.n);
  return{n,ll:ll/n,brier:br/n,rps:rp/n,acc:hit/n*100,ent:h/n,ece:ece*100}}
// breakdown: key(row) -> nama kelompok (null = lewati). Juga kontribusi tiap kelompok terhadap total log loss.
export function breakdown(rows,key,get=r=>frac(r.p),minN=1){const G=new Map();let tot=0,N=0;
  for(const r of rows){const k=key(r);if(k==null)continue;(G.get(k)||G.set(k,[]).get(k)).push(r)}
  for(const r of rows){const q=get(r);if(q){tot+=one(q,outcome(r.r)).ll;N++}}
  return[...G].filter(([,L])=>L.length>=minN).map(([k,L])=>{const m=metrics(L,get);return{k,...m,share:tot?m.ll*m.n/tot*100:null,gap:m.ll-m.ent}}).sort((a,b)=>b.n-a.n)}
// ---------- kalibrator (semua menghasilkan peluang valid: positif, jumlah 1) ----------
// suhu: q_k ∝ p_k^(1/T). T < 1 mempertajam, T > 1 melunakkan. Dipilih dengan pencarian kisi (log loss data latih).
export const temp=(q,T)=>sm(q.map(x=>LN(Math.max(EPS,x))/T));
export function fitTemp(rows){let best={T:1,ll:Infinity};for(let T=.6;T<=1.6001;T+=.01){let l=0;for(const r of rows)l-=LN(Math.max(EPS,temp(frac(r.p),T)[outcome(r.r)]));if(l<best.ll)best={T:Math.round(T*100)/100,ll:l}}return{T:best.T}}
// suhu + geser seri: s_k = ln p_k / T + d·[k = seri]
export const tempDraw=(q,T,d)=>sm(q.map((x,k)=>LN(Math.max(EPS,x))/T+(k===1?d:0)));
export function fitTempDraw(rows){let best={T:1,d:0,ll:Infinity};for(let T=.7;T<=1.4001;T+=.02)for(let d=-.4;d<=.4001;d+=.02){let l=0;for(const r of rows)l-=LN(Math.max(EPS,tempDraw(frac(r.p),T,d)[outcome(r.r)]));if(l<best.ll)best={T:Math.round(T*100)/100,d:Math.round(d*100)/100,ll:l}}return{T:best.T,d:best.d}}
// vector scaling (Dirichlet sederhana): s_k = a_k·ln p_k + b_k (b_0 = 0), ridge ke a=1, b=0. Turunan gradien, langkah tetap kecil.
export const vec=(q,a,b)=>sm(q.map((x,k)=>a[k]*LN(Math.max(EPS,x))+b[k]));
export function fitVec(rows,{lam=2,it=400,lr=.5}={}){let a=[1,1,1],b=[0,0,0];const N=rows.length;if(!N)return{a,b};const X=rows.map(r=>({l:frac(r.p).map(x=>LN(Math.max(EPS,x))),o:outcome(r.r)}));
  for(let t=0;t<it;t++){const ga=[0,0,0],gb=[0,0,0];for(const x of X){const q=sm(x.l.map((v,k)=>a[k]*v+b[k]));for(let k=0;k<3;k++){const e=q[k]-(k===x.o?1:0);ga[k]+=e*x.l[k]/N;gb[k]+=e/N}}
    for(let k=0;k<3;k++){ga[k]+=2*lam/N*(a[k]-1);gb[k]+=2*lam/N*b[k];a[k]-=lr*ga[k];if(k)b[k]-=lr*gb[k]}}
  const r4=v=>Math.round(v*1e4)/1e4;return{a:a.map(r4),b:b.map(r4)}}
// kandidat: nama -> {fit(rowsLatih) -> param, apply(q, param) -> q'}
export const METHODS={
  bsd:{fit:()=>null,apply:q=>q},
  temp:{fit:fitTemp,apply:(q,m)=>temp(q,m.T)},
  tempDraw:{fit:fitTempDraw,apply:(q,m)=>tempDraw(q,m.T,m.d)},
  vector:{fit:R=>fitVec(R),apply:(q,m)=>vec(q,m.a,m.b)}};
export const valid=q=>Array.isArray(q)&&q.length===3&&q.every(x=>Number.isFinite(x)&&x>0&&x<1)&&Math.abs(q[0]+q[1]+q[2]-1)<1e-9;
// ---------- evaluasi temporal ----------
// rows diurutkan menurut waktu. Test akhir = bagian terakhir (fracTest). Bagian sebelumnya dibagi jadi `folds` blok validasi berurutan:
// tiap blok divalidasi dengan kalibrator yang dilatih HANYA dari semua baris sebelum blok itu (expanding window, minimal minTrain).
// Kandidat dipilih dari rata-rata validasi (harus lebih baik dari BSD di mayoritas blok DAN di rata-rata, dengan margin);
// baru setelah itu test akhir dibuka: kandidat terpilih dilatih dari semua baris sebelum test akhir, dinilai sekali.
// gap (jeda): baris latih harus kickoff >= gap sebelum laga PERTAMA blok yang dinilai, supaya hasilnya benar-benar sudah diketahui
// saat itu (laga yang kickoff 30 menit sebelumnya belum selesai). Bawaan 3 jam.
export function walkForward(rows,{methods=METHODS,folds=3,fracTest=.25,minTrain=100,margin=.002,gap=3*36e5}={}){
  const R=rows.filter(r=>r&&r.p&&r.r&&Number.isFinite(r.t)).slice().sort((a,b)=>a.t-b.t),nT=Math.floor(R.length*fracTest),dev=R.slice(0,R.length-nT),test=R.slice(R.length-nT);
  const blk=Math.floor((dev.length-minTrain)/folds);if(blk<20||nT<20)return{ok:false,why:"data kurang",n:R.length};
  const F=[];for(let f=0;f<folds;f++){const s=minTrain+f*blk,e=f===folds-1?dev.length:s+blk,va=dev.slice(s,e),tr=dev.slice(0,s).filter(r=>r.t<=va[0].t-gap),out={i:f,nTrain:tr.length,trTo:tr.length?tr[tr.length-1].t:null,nVal:va.length,from:va[0].t,to:va[va.length-1].t,m:{}};
    for(const [k,M] of Object.entries(methods)){const prm=M.fit(tr),Q=va.map(r=>M.apply(frac(r.p),prm));out.m[k]={...metrics(va.map((r,i)=>({...r,_q:Q[i]})),r=>r._q),prm,valid:Q.every(valid)}}F.push(out)}
  const avg=k=>F.reduce((s,f)=>s+f.m[k].ll*f.nVal,0)/F.reduce((s,f)=>s+f.nVal,0),wins=k=>F.filter(f=>f.m[k].ll<f.m.bsd.ll).length;
  const cand=Object.keys(methods).filter(k=>k!=="bsd").map(k=>({k,ll:avg(k),wins:wins(k)})).sort((a,b)=>a.ll-b.ll),base=avg("bsd");
  const pick=cand.find(c=>c.ll<base-margin&&c.wins>Math.floor(folds/2))||null;
  // test akhir: dibuka SEKALI, untuk BSD dan (bila ada) kandidat terpilih; kandidat lain juga dilaporkan sebagai informasi, bukan untuk memilih
  const tr=dev.filter(r=>r.t<=test[0].t-gap),T={};for(const [k,M] of Object.entries(methods)){const prm=M.fit(tr),Q=test.map(r=>M.apply(frac(r.p),prm));T[k]={...metrics(test.map((r,i)=>({...r,_q:Q[i]})),r=>r._q),prm,valid:Q.every(valid),Q}}
  const boot=pick?bootDiff(test,T[pick.k].Q,T.bsd.Q):null;for(const k in T)delete T[k].Q;
  return{ok:true,n:R.length,nDev:dev.length,nTest:test.length,nTrainTest:tr.length,gap,testFrom:test[0].t,testTo:test[test.length-1].t,folds:F,valAvg:{bsd:base,...Object.fromEntries(cand.map(c=>[c.k,c.ll]))},wins:Object.fromEntries(cand.map(c=>[c.k,c.wins])),pick:pick&&pick.k,test:T,boot}}
// bootstrap selisih log loss (kandidat - BSD) per laga; deterministik (seed tetap) supaya bisa diulang
export function bootDiff(rows,QA,QB,{B=2000,seed=12345}={}){const d=rows.map((r,i)=>{const o=outcome(r.r);return-LN(Math.max(EPS,QA[i][o]))+LN(Math.max(EPS,QB[i][o]))}),n=d.length;let s=seed;const rnd=()=>(s=(s*16807)%2147483647)/2147483647;
  const M=[];for(let b=0;b<B;b++){let t=0;for(let i=0;i<n;i++)t+=d[Math.floor(rnd()*n)];M.push(t/n)}M.sort((x,y)=>x-y);const mean=d.reduce((a,x)=>a+x,0)/n;
  return{mean,lo:M[Math.floor(B*.025)],hi:M[Math.floor(B*.975)],pBetter:M.filter(x=>x<0).length/B}}
// CLI: node prob-audit.mjs rows.json  (array baris atau {rows}) -> ringkasan JSON
if(typeof process!=="undefined"&&process.argv&&process.argv[1]&&import.meta.url.endsWith(process.argv[1].split("/").pop())&&process.argv[2]){
  const {readFileSync}=await import("node:fs");let j=JSON.parse(readFileSync(process.argv[2],"utf8"));const rows=(Array.isArray(j)?j:j.rows).map(r=>({...r,t:Number.isFinite(r.t)?r.t:Date.parse(r.u)})).filter(r=>r.p&&r.r);
  console.log(JSON.stringify({all:metrics(rows),wf:walkForward(rows)},null,1))}
