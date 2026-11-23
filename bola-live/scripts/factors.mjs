// V18 (Tahap 3, 20 Nov 2026): uji faktor tambahan — apakah BSD (dan Model BL) sudah memperhitungkannya?
// Untuk tiap faktor, ambil "tim yang terkena faktor" di laga yang punya prediksi BSD, lalu bandingkan:
// seberapa sering ia benar-benar menang vs peluang menang menurut BSD dan Model BL. Untuk derby: seri.
// Semua dihitung hanya dari data SEBELUM laga (form, H2H, pelatih, jadwal).

const DAY=864e5;
// ms: [{id,t,l,h,a,gh,ga,hc,ac,tr}] ; J: [{id,o,p,b}] ; eu: Set id liga kompetisi Eropa/antarbenua
export function factorTests(ms,J,eu,cup){cup=cup||new Set();
  const S=ms.slice().sort((a,b)=>a.t-b.t),byT=new Map(),pos=new Map();
  for(const m of S){for(const [id,home] of [[m.h,1],[m.a,0]]){const L=byT.get(id)||byT.set(id,[]).get(id);
    L.push({id:m.id,t:m.t,l:m.l,opp:home?m.a:m.h,gf:home?m.gh:m.ga,ga:home?m.ga:m.gh,coach:home?m.hc:m.ac,home});pos.set(m.id+":"+id,L.length-1)}}
  const G={};const add=(k,win,b,p)=>{const g=G[k]=G[k]||{n:0,w:0,b:0,p:0};g.n++;g.w+=win;g.b+=b;g.p+=p};
  const pts=(x)=>x.gf>x.ga?3:x.gf===x.ga?1:0,byId=new Map(S.map(m=>[m.id,m]));
  for(const r of J){const m=byId.get(r.id);if(!m||!r.b||!r.p)continue;
    const side=(id,k)=>{const L=byT.get(id),i=pos.get(m.id+":"+id);return L&&i!=null?{L,i,prev:L.slice(Math.max(0,i-k),i)}:null};
    const H=side(m.h,5),A=side(m.a,5);if(!H||!A)continue;
    const res=[r.o===0?1:0,r.o===2?1:0],pb=[r.b[0]/100,r.b[2]/100],pp=[r.p[0]/100,r.p[2]/100];
    [H,A].forEach((X,s)=>{
      // form 5 laga terakhir (semua kompetisi)
      if(X.prev.length===5){const f=X.prev.reduce((a,x)=>a+pts(x),0);if(f>=12)add("formPanas",res[s],pb[s],pp[s]);if(f<=3)add("formDingin",res[s],pb[s],pp[s])}
      // jadwal padat setelah laga Eropa (<= 4 hari)
      const last=X.L[X.i-1];if(last&&m.t-last.t<=4*DAY&&eu.has(last.l)&&!eu.has(m.l))add("habisEropa",res[s],pb[s],pp[s]);
      // V30b: rotasi menjelang laga Eropa (laga berikutnya <= 4 hari lagi di kompetisi Eropa/antarbenua). Jadwal diumumkan jauh hari -> bukan bocor.
      const next=X.L[X.i+1];if(next&&next.t-m.t<=4*DAY&&eu.has(next.l)&&!eu.has(m.l))add("sebelumEropa",res[s],pb[s],pp[s]);
      // V30b: unggulan besar (BSD >= 60%) di piala domestik — sering rotasi, lawan divisi bawah bermain habis-habisan
      if(cup.has(m.l)&&pb[s]>=.6)add("pialaUnggulan",res[s],pb[s],pp[s]);
      // pelatih baru: pelatih beda dari laga sebelumnya; berlaku untuk 4 laga pertama pelatih itu
      const cur=X.L[X.i].coach;if(cur!=null){let k=X.i-1,same=0;while(k>=0&&X.L[k].coach===cur){same++;k--}
        if(k>=0&&X.L[k].coach!=null&&X.L[k].coach!==cur&&same<4&&m.t-X.L[k].t<90*DAY)add("pelatihBaru",res[s],pb[s],pp[s])}
    });
    // H2H: minimal 2 pertemuan sebelumnya (setahun terakhir) dan satu tim menang semuanya
    {const meet=H.L.slice(0,H.i).filter(x=>x.opp===m.a&&m.t-x.t<370*DAY);if(meet.length>=2){if(meet.every(x=>x.gf>x.ga))add("h2hDominan",res[0],pb[0],pp[0]);else if(meet.every(x=>x.gf<x.ga))add("h2hDominan",res[1],pb[1],pp[1])}}
    // perjalanan jauh tim tamu
    if(m.tr!=null&&m.tr>=1500)add("tamuJauh",res[1],pb[1],pp[1]);
    // derby: seri
    if(m.dby)add("derbySeri",r.o===1?1:0,r.b[1]/100,r.p[1]/100);
  }
  const out={};for(const [k,g] of Object.entries(G)){const w=g.w/g.n,b=g.b/g.n,p=g.p/g.n;out[k]={n:g.n,win:w*100,bsd:b*100,bl:p*100,gapBsd:(w-b)*100,se:Math.sqrt(Math.max(w*(1-w),.05)/g.n)*100}}
  return out;
}
export const EU_RE=/UEFA|Champions League|Europa League|Conference League|Libertadores|Sudamericana|CONCACAF|AFC Champions|CAF Champions|Club World Cup/i;
