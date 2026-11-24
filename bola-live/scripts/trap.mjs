// V49 (25 Nov 2026): "tim penipu" — apakah ada tim yang SECARA KONSISTEN lebih jarang menang saat diunggulkan BSD
// daripada kata peluang BSD (atau sebaliknya lebih bisa diandalkan)? Uji tanpa bocor: tim ditandai dari paruh PERTAMA data,
// lalu dinilai di paruh KEDUA. Lolos hanya bila kelompok yang ditandai tetap meleset/unggul nyata di paruh kedua.
// entries: {u, hid, aid, hn, an, lg, p:[h,d,a] (persen), r:[gh,ga]}
export function teamTrap(entries,o={}){
  const MINP=o.minP??50,MINH=o.minHalf??5,Z=o.z??1.5,MINFULL=o.minFull??30;
  const E=(entries||[]).filter(e=>e&&e.hid!=null&&e.aid!=null&&e.p&&e.p.length===3&&e.r&&e.r[0]!=null&&e.u).sort((a,b)=>a.u.localeCompare(b.u));
  if(E.length<200)return{n:E.length,verdict:"data kurang"};
  const cut=E[Math.floor(E.length/2)].u;
  const fav=e=>{const s=e.p[0]>=e.p[2]?0:2;return e.p[s]>=MINP?s:null};
  const acc=new Map(),add=(k,half,e,s)=>{const id=s===0?e.hid:e.aid,nm=s===0?e.hn:e.an,p=e.p[s]/100,w=s===0?e.r[0]>e.r[1]:e.r[1]>e.r[0],q=e.r[0]===e.r[1];
    const t=acc.get(id)||{id,nm,lg:e.lg,h:[{n:0,w:0,ew:0,v:0,d:0},{n:0,w:0,ew:0,v:0,d:0}]};t.nm=nm||t.nm;const g=t.h[half];g.n++;g.w+=w?1:0;g.ew+=p;g.v+=p*(1-p);g.d+=q?1:0;acc.set(id,t)};
  for(const e of E){const s=fav(e);if(s==null)continue;add(0,e.u<cut?0:1,e,s)}
  const T=[...acc.values()],z=g=>g.v>0?(g.w-g.ew)/Math.sqrt(g.v):0,sum=(L,h)=>L.reduce((a,t)=>{const g=t.h[h];a.n+=g.n;a.w+=g.w;a.ew+=g.ew;a.v+=g.v;a.d+=g.d;return a},{n:0,w:0,ew:0,v:0,d:0});
  const pct=g=>g.n?{n:g.n,win:r1(g.w/g.n*100),bsd:r1(g.ew/g.n*100),gap:r1((g.w-g.ew)/g.n*100),se:r1(Math.sqrt(g.v)/g.n*100),draw:r1(g.d/g.n*100)}:{n:0};
  const trap=T.filter(t=>t.h[0].n>=MINH&&z(t.h[0])<=-Z),rel=T.filter(t=>t.h[0].n>=MINH&&z(t.h[0])>=Z);
  const A=pct(sum(trap,1)),B=pct(sum(rel,1)),A0=pct(sum(trap,0)),B0=pct(sum(rel,0));
  const sig=g=>g.n>=50&&Math.abs(g.gap)>=2*g.se;
  const pass=(sig(A)&&A.gap<0)||(sig(B)&&B.gap>0);
  const full=T.map(t=>{const g={n:t.h[0].n+t.h[1].n,w:t.h[0].w+t.h[1].w,ew:t.h[0].ew+t.h[1].ew,v:t.h[0].v+t.h[1].v,d:t.h[0].d+t.h[1].d};return{id:t.id,nm:t.nm,lg:t.lg,...pct(g),z:r2(z(g))}});
  const pool=full.filter(t=>t.n>=10),cnt=k=>full.filter(t=>t.n>=k).length,mx=full.reduce((a,t)=>Math.max(a,t.n),0);
  return{n:E.length,from:E[0].u,to:E[E.length-1].u,cut,teams:full.length,n10:cnt(10),n20:cnt(20),n30:cnt(MINFULL),maxN:mx,
    trap:{teams:trap.length,first:A0,second:A},rel:{teams:rel.length,first:B0,second:B},
    worst:pool.slice().sort((a,b)=>a.z-b.z).slice(0,8),best:pool.slice().sort((a,b)=>b.z-a.z).slice(0,8),
    verdict:pass?"lolos":cnt(MINFULL)<20?"data per tim kurang":"tidak"}}
const r1=x=>Math.round(x*10)/10,r2=x=>Math.round(x*100)/100;
