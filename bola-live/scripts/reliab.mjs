// V53 (Tahap 4, 25 Nov 2026): RELIABILITAS ANALISIS — terpisah dari peluang.
// Pertanyaan: seberapa bisa DIPERCAYA angka peluang BSD untuk laga ini? Ukuran: "kejutan berlebih"
//   s = −ln(peluang hasil yang terjadi) − H(p),  H(p) = −Σ p·ln p  (entropi peluang yang dinyatakan).
// Bila peluang terkalibrasi, rata-rata s = 0 untuk kelompok mana pun. s > 0 = BSD terlalu yakin di kelompok itu.
// Fitur (semua dari laga SEBELUMNYA saja, tanpa bocor): rekam jejak liga (rata-rata s, disusutkan ke 0), jumlah sampel liga, ada/tidaknya xG BSD.
// Uji: bobot dipasang di paruh PERTAMA data (waktu), dinilai di paruh KEDUA: tertil reliabilitas rendah harus punya s nyata lebih besar
// daripada tertil tinggi (selisih ≥ 2 galat baku, ≥ 300 laga per tertil). Hanya bila lolos, skor boleh tampil per laga.
const LN=Math.log,K=30;
export function surprise(p,r){const q=p.map(x=>Math.max(1e-6,x/100)),s=q[0]+q[1]+q[2],o=r[0]>r[1]?0:r[0]===r[1]?1:2,P=q.map(x=>x/s);return -LN(P[o])+P.reduce((a,x)=>a+x*LN(x),0)}
const topHit=(p,r)=>{const o=r[0]>r[1]?0:r[0]===r[1]?1:2;return p.indexOf(Math.max(...p))===o?1:0};
const keyOf=e=>e.lid!=null?"i"+e.lid:"n"+(e.lg||"?")+"|"+(e.c||"");
// fitur tiap laga dari keadaan liga sebelum laga itu
function features(E){const S=new Map(),F=[];
  for(const e of E){const k=keyOf(e),g=S.get(k)||{n:0,s:0};const ex=g.n?(g.s/(g.n+K)):0;   // rata-rata disusutkan: Σs/(n+K)
    F.push({e,x:[ex,1/Math.sqrt(g.n+1),e.xg?0:1],y:surprise(e.p,e.r),hit:topHit(e.p,e.r),top:Math.max(...e.p)/100});g.n++;g.s+=F[F.length-1].y;S.set(k,g)}
  return{F,S}}
// regresi linier kecil (kuadrat terkecil + ridge ringan) untuk menebak s dari fitur
function fit(F){const X=F.map(f=>[1,...f.x]),y=F.map(f=>f.y),d=X[0].length,A=Array.from({length:d},()=>Array(d).fill(0)),b=Array(d).fill(0);
  for(let i=0;i<X.length;i++)for(let a=0;a<d;a++){b[a]+=X[i][a]*y[i];for(let c=0;c<d;c++)A[a][c]+=X[i][a]*X[i][c]}
  for(let a=1;a<d;a++)A[a][a]+=1;   // ridge
  // eliminasi Gauss
  const M=A.map((r,i)=>[...r,b[i]]);for(let i=0;i<d;i++){let p=i;for(let j=i+1;j<d;j++)if(Math.abs(M[j][i])>Math.abs(M[p][i]))p=j;[M[i],M[p]]=[M[p],M[i]];const v=M[i][i]||1e-9;for(let j=i;j<=d;j++)M[i][j]/=v;for(let r=0;r<d;r++)if(r!==i){const f=M[r][i];for(let j=i;j<=d;j++)M[r][j]-=f*M[i][j]}}
  return M.map(r=>r[d])}
const pred=(w,x)=>w[0]+w[1]*x[0]+w[2]*x[1]+w[3]*x[2];
const r3=x=>Math.round(x*1000)/1000,r1=x=>Math.round(x*10)/10;
function stat(L){const n=L.length;if(!n)return{n:0};const m=L.reduce((a,f)=>a+f.y,0)/n,v=L.reduce((a,f)=>a+(f.y-m)**2,0)/Math.max(1,n-1);
  const hit=L.reduce((a,f)=>a+f.hit,0)/n,top=L.reduce((a,f)=>a+f.top,0)/n;return{n,ex:r3(m),se:r3(Math.sqrt(v/n)),hit:r1(hit*100),stated:r1(top*100),gap:r1((hit-top)*100)}}
export function reliability(entries,o={}){
  const E=(entries||[]).filter(e=>e&&e.p&&e.p.length===3&&e.r&&e.r[0]!=null&&e.u).sort((a,b)=>a.u.localeCompare(b.u));
  if(E.length<600)return{n:E.length,verdict:"data kurang"};
  const{F,S}=features(E),h=Math.floor(F.length/2),A=F.slice(0,h),B=F.slice(h),w=fit(A);
  const sc=f=>-pred(w,f.x);   // reliabilitas = kebalikan kejutan berlebih yang diperkirakan
  const sA=A.map(sc).sort((a,b)=>a-b),t1=sA[Math.floor(sA.length/3)],t2=sA[Math.floor(sA.length*2/3)];   // batas tertil dari paruh pertama
  const grp=L=>({lo:stat(L.filter(f=>sc(f)<t1)),mid:stat(L.filter(f=>sc(f)>=t1&&sc(f)<t2)),hi:stat(L.filter(f=>sc(f)>=t2))});
  const GA=grp(A),GB=grp(B),dif=GB.lo.n&&GB.hi.n?r3(GB.lo.ex-GB.hi.ex):null,dse=GB.lo.n&&GB.hi.n?r3(Math.sqrt(GB.lo.se**2+GB.hi.se**2)):null;
  const pass=dif!=null&&GB.lo.n>=(o.minN??300)&&GB.hi.n>=(o.minN??300)&&dif>=2*dse;
  // keadaan liga terkini (seluruh data) untuk menilai laga yang akan datang
  const lg={};for(const[k,g]of S)if(g.n>=5)lg[k]=[g.n,r3(g.s/(g.n+K))];
  return{n:E.length,from:E[0].u,to:E[E.length-1].u,cut:B[0].e.u,w:w.map(r3),t:[r3(t1),r3(t2)],first:GA,second:GB,dif,dse,verdict:pass?"lolos":"tidak",lg,K}}
// skor untuk laga yang akan datang (hanya dipakai bila verdict lolos): 0 rendah / 1 sedang / 2 tinggi + alasan dari data
export function relOf(R,m){if(!R||!R.w||!R.lg)return null;const k=m.lid!=null?"i"+m.lid:null,g=k&&R.lg[k],n=g?g[0]:0,ex=g?g[1]:0,x=[ex,1/Math.sqrt(n+1),m.p&&m.p.xg?0:1];
  const s=-(R.w[0]+R.w[1]*x[0]+R.w[2]*x[1]+R.w[3]*x[2]),lv=s<R.t[0]?0:s<R.t[1]?1:2;return{lv,n,ex,xg:!x[2]}}
