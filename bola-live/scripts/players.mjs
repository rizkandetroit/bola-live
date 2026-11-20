// V16 (Tahap 1, 20 Nov 2026): data pemain dari BSD untuk "kekuatan asli".
// - Statistik pemain per laga (/events/{id}/player-stats/) diringkas per tim dengan bobot menurun per laga (laga terbaru = 1,
//   laga sebelumnya x0,9, dst.), jadi kira-kira mencerminkan ±10 laga terakhir tanpa menyimpan semua baris.
// - Nilai pasar + posisi dari profil pemain (/players/{id}/).
// Semua angka disimpan ringkas (dibulatkan) supaya file kecil.

export const PDEC=.9;
// indeks kolom ringkasan pemain
export const C={min:0,app:1,st:2,rtw:3,rtm:4,g:5,a:6,xg:7,xa:8,cr:9,gp:10,sv:11,last:12};
const r1=x=>Math.round(x*10)/10,r2=x=>Math.round(x*100)/100;
const n0=x=>{const v=Number(x);return Number.isFinite(v)?v:0};

// rows: baris player-stats satu laga (kedua tim). t: waktu kickoff (ms). Mengembalikan jumlah tim yang diperbarui.
export function ingest(P,ev,t,rows){
  P.t=P.t||{};const by=new Map();for(const r of rows||[]){if(r&&r.team_id!=null&&r.player_id!=null)(by.get(r.team_id)||by.set(r.team_id,[]).get(r.team_id)).push(r)}
  let n=0;const ts=Math.round(t/1000);
  for(const [team,R] of by){
    const T=P.t[team]=P.t[team]||{ev:[],mt:0,p:{}};if(T.ev.some(e=>e[0]===ev))continue;
    const newer=T.ev.filter(e=>e[1]>ts).length,w=Math.pow(PDEC,newer);
    if(!newer){for(const k in T.p){const q=T.p[k];for(let i=0;i<C.last;i++)q[i]*=PDEC}T.mt*=PDEC}   // laga terbaru: yang lama turun bobotnya
    T.mt+=90*w;T.ev.push([ev,ts]);T.ev.sort((a,b)=>a[1]-b[1]);if(T.ev.length>15)T.ev.splice(0,T.ev.length-15);
    for(const r of R){const m=n0(r.minutes_played);if(m<=0)continue;const q=T.p[r.player_id]=T.p[r.player_id]||[0,0,0,0,0,0,0,0,0,0,0,0,0];
      const rt=r.rating==null?null:Number(r.rating);
      q[C.min]+=m*w;q[C.app]+=w;if(m>=60)q[C.st]+=w;if(rt!=null&&Number.isFinite(rt)){q[C.rtw]+=rt*m*w;q[C.rtm]+=m*w}
      q[C.g]+=n0(r.goals)*w;q[C.a]+=n0(r.goal_assist)*w;q[C.xg]+=n0(r.expected_goals)*w;q[C.xa]+=n0(r.expected_assists)*w;
      q[C.cr]+=(n0(r.key_pass)+n0(r.big_chance_created))*w;q[C.gp]+=n0(r.goals_prevented)*w;q[C.sv]+=n0(r.saves)*w;q[C.last]=Math.max(q[C.last],ts)}
    n++;
  }
  return n;
}
export function compact(P,now,keepDays=200){
  for(const team of Object.keys(P.t||{})){const T=P.t[team],last=T.ev.length?T.ev[T.ev.length-1][1]*1000:0;if(now-last>150*864e5){delete P.t[team];continue}
    T.mt=r1(T.mt);for(const k of Object.keys(T.p)){const q=T.p[k];if(q[C.min]<1&&now-q[C.last]*1000>keepDays*864e5){delete T.p[k];continue}for(let i=0;i<C.last;i++)q[i]=i===C.rtw?r1(q[i]):r2(q[i])}}
  return P;
}
// Ringkasan tim: porsi menit tiap pemain, rating rata-rata (berbobot menit), pemain kunci, nilai skuad (pemain reguler).
export function teamSummary(T,values){
  if(!T||!T.mt)return null;const V=values||{},L=[];
  for(const [pid,q] of Object.entries(T.p)){const sh=q[C.min]/T.mt,rt=q[C.rtm]?q[C.rtw]/q[C.rtm]:null,v=V[pid];
    L.push({pid:+pid,nm:v?v[3]||null:null,sh:Math.min(1,sh),rt,ga90:q[C.min]?(q[C.g]+q[C.a])*90/q[C.min]:0,x90:q[C.min]?(q[C.xg]+q[C.xa])*90/q[C.min]:0,gp:q[C.gp],sv:q[C.sv],val:v?v[0]:null,pos:v?v[1]:null})}
  const reg=L.filter(p=>p.sh>=.25),rw=reg.reduce((s,p)=>s+(p.rt!=null?p.sh:0),0);
  const avg=rw?reg.reduce((s,p)=>s+(p.rt!=null?p.rt*p.sh:0),0)/rw:null,vv=reg.filter(p=>p.val!=null);
  return{n:T.ev.length,reg:reg.length,avgRt:avg,squad:vv.length?vv.reduce((s,p)=>s+p.val,0):null,valCov:reg.length?vv.length/reg.length:0,
    gp:L.reduce((s,p)=>s+p.gp,0),players:L.sort((a,b)=>b.sh-a.sh)};
}
// profil pemain -> [nilai pasar EUR | null, posisi G/D/M/F | null, waktu cek (detik), nama pendek]
export function valueOf(o,now){if(!o||o.id==null)return null;const v=Number(o.market_value_eur);return[Number.isFinite(v)&&v>0?v:null,o.position||null,Math.round(now/1000),o.short_name||o.name||null]}

// ===== V17 (Tahap 2): nilai kepentingan pemain + kekuatan line-up per laga =====
// Unit: "att" = lini serang (F penuh, M sebagian), "def" = lini bertahan (G, D penuh, M sebagian).
export const UNIT={F:[1,.15],M:[.6,.45],D:[.1,1],G:[0,1.2]};
const median=a=>{if(!a.length)return null;const b=a.slice().sort((x,y)=>x-y),k=b.length>>1;return b.length%2?b[k]:(b[k-1]+b[k])/2};
// posisi: dari profil (nilai pasar) bila ada, kalau tidak ditebak dari statistik (penyelamatan -> kiper)
export function posOf(q,v){if(v&&v[1])return v[1];return q&&q[C.sv]>0&&q[C.g]===0?"G":"M"}
// Kualitas per 90 menit (1 = pemain reguler rata-rata tim): rating vs rata-rata tim, kontribusi gol vs rata-rata tim, nilai pasar vs median tim.
export function playerQuality(T,V){
  const S=teamSummary(T,V);if(!S)return null;const reg=S.players.filter(p=>p.sh>=.25),avgX=reg.length?reg.reduce((s,p)=>s+p.x90,0)/reg.length:0,medV=median(reg.map(p=>p.val).filter(v=>v));
  const Q=new Map();for(const p of S.players){let q=1;if(p.rt!=null&&S.avgRt!=null)q+=Math.max(-.3,Math.min(.5,(p.rt-S.avgRt)*.25));
    const pos=posOf(T.p[p.pid],V&&V[p.pid]);if(pos==="F"||pos==="M")q+=Math.max(-.2,Math.min(.4,(p.x90-avgX)*.5));
    if(p.val&&medV)q+=Math.max(-.2,Math.min(.3,Math.log10(p.val/medV)*.2));
    Q.set(p.pid,{q:Math.max(.5,q),sh:Math.min(1,p.sh),pos,nm:p.nm})}
  return Q}
// Kekuatan line-up = mutu pemain yang turun / mutu susunan biasanya, per unit. xi = id pemain yang turun (starter / >= 45 menit).
// Pemain yang tidak kita kenal dianggap pemain pengganti (mutu 0,85). Mengembalikan [serang, bertahan] (1 = biasa) + pemain kunci yang hilang.
export function xiRatio(Q,xi){
  if(!Q||!Q.size||!xi||!xi.length)return null;const set=new Set(xi.map(Number));let ea=0,ed=0,sa=0,sd=0,aa=0,ad=0,known=0;const miss=[];
  for(const [pid,p] of Q){const u=UNIT[p.pos]||UNIT.M,w=p.q*p.sh;ea+=w*u[0];ed+=w*u[1];sa+=p.sh*u[0];sd+=p.sh*u[1];
    if(set.has(pid)){aa+=p.q*u[0];ad+=p.q*u[1];known++}else if(p.sh>=.5)miss.push([pid,p.nm,Math.round(p.sh*p.q*100)/100,p.pos])}
  if(!sa||!sd)return null;const unk=Math.max(0,Math.min(11,xi.length)-known),Ua=sa/ (Q.size?[...Q.values()].reduce((s,p)=>s+p.sh,0):1),Ud=sd/[...Q.values()].reduce((s,p)=>s+p.sh,0);
  // pengganti tak dikenal: mutu 0,85 dengan porsi unit rata-rata tim
  aa+=unk*.85*Ua;ad+=unk*.85*Ud;const ra=aa/ (ea*11/[...Q.values()].reduce((s,p)=>s+p.sh,0)),rd=ad/(ed*11/[...Q.values()].reduce((s,p)=>s+p.sh,0));
  miss.sort((x,y)=>y[2]-x[2]);
  return{r:[Math.round(Math.max(.5,Math.min(1.25,ra))*1000)/1000,Math.round(Math.max(.5,Math.min(1.25,rd))*1000)/1000],miss:miss.slice(0,4),known}}
// XI dari baris player-stats satu tim (starter = >= 45 menit, maksimal 11 dengan menit terbanyak)
export function xiFromStats(rows){return(rows||[]).filter(r=>Number(r.minutes_played)>=45).sort((a,b)=>b.minutes_played-a.minutes_played).slice(0,11).map(r=>r.player_id)}
