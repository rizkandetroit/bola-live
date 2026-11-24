// V48 (25 Nov 2026): laporan pagi — rekap "hari bola" kemarin (06.00–06.00 WITA) dari riwayat prediksi (bsd-history).
// Aturan tanda sama dengan web (resTag): laga terbuka (peluang menang tertinggi < 45%) dinilai "tidak kalah";
// seri paling mungkin -> tebakan seri; selain itu arah tebakan BSD. Hanya ringkasan; tidak mengubah prediksi.
const WITA=8*36e5,H=36e5;
export function dayWindow(now){const w=now+WITA,d=new Date(w);let end=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate(),6)-WITA;if(end>now)end-=24*H;return[end-24*H,end]}
const top3=a=>a.indexOf(Math.max(...a));
export function judge(p,r){const o=r[0]>r[1]?0:r[0]===r[1]?1:2;
  if(p[1]>p[0]&&p[1]>p[2])return{k:"seri",ok:o===1,o};
  const f=p[0]>=p[2]?0:2,pv=p[f];
  if(Math.max(p[0],p[2])<45)return{k:"terbuka",f,pv:p[f]+p[1],ok:o!==(f===0?2:0),seri:o===1,o};
  return{k:"arah",f,pv,ok:o===f,imb:o===1,o}}
const pct=(a,b)=>b?Math.round(a/b*100):null;
export function morningReport(hist,now){
  const[s,e]=dayWindow(now),inW=x=>{const t=Date.parse(x.u);return t>=s&&t<e};
  const L=(hist||[]).filter(x=>x&&x.u&&x.p&&x.p.length===3&&inW(x)),done=L.filter(x=>x.r&&x.r[0]!=null),wait=L.length-done.length;
  const J=done.map(x=>({x,j:judge(x.p,x.r)}));
  const ok=J.filter(q=>q.j.ok).length,imb=J.filter(q=>q.j.imb).length,openN=J.filter(q=>q.j.k==="terbuka"),openSeri=openN.filter(q=>q.j.ok&&q.j.seri).length;
  const strong=J.filter(q=>q.j.k==="arah"&&q.j.pv>=60),fav=done.filter(x=>Math.max(x.p[0]+x.p[1],x.p[2]+x.p[1])>=80),favOk=fav.filter(x=>{const hf=x.p[0]+x.p[1]>=x.p[2]+x.p[1];return hf?x.r[0]>=x.r[1]:x.r[1]>=x.r[0]});
  const acc=k=>{const Q=done.filter(x=>x[k]&&x[k].length===3);return{n:Q.length,hit:Q.filter(x=>top3(x[k])===(x.r[0]>x.r[1]?0:x.r[0]===x.r[1]?1:2)).length}};
  const ouQ=done.filter(x=>x.ou!=null),ouOk=ouQ.filter(x=>(x.ou>=50)===(x.r[0]+x.r[1]>2)).length,btQ=done.filter(x=>x.bt!=null),btOk=btQ.filter(x=>(x.bt>=50)===(x.r[0]>0&&x.r[1]>0)).length;
  // kejutan: tebakan arah yang kalah, urut dari peluang tertinggi
  const kej=J.filter(q=>!q.j.ok&&q.j.k!=="seri").sort((a,b)=>b.j.pv-a.j.pv).slice(0,5).map(q=>({lg:q.x.lg,h:q.x.h,a:q.x.a,r:q.x.r,tim:q.j.f===0?q.x.h:q.x.a,pv:Math.round(q.j.pv),k:q.j.k,seri:q.j.o===1,ab:q.x.ab||null}));
  const by=new Map();for(const q of J){const g=by.get(q.x.lg)||{lg:q.x.lg,n:0,ok:0};g.n++;if(q.j.ok)g.ok++;by.set(q.x.lg,g)}
  const lg=[...by.values()].filter(g=>g.n>=3),best=lg.filter(g=>g.ok/g.n>=.7).sort((a,b)=>b.ok/b.n-a.ok/a.n||b.n-a.n).slice(0,3),worst=lg.filter(g=>g.ok/g.n<=.4).sort((a,b)=>a.ok/a.n-b.ok/b.n||b.n-a.n).slice(0,3);
  return{v:1,updated:new Date(now).toISOString(),from:new Date(s).toISOString(),to:new Date(e).toISOString(),n:done.length,wait,ok,imb,mel:done.length-ok-imb,
    open:{n:openN.length,ok:openN.filter(q=>q.j.ok).length,seri:openSeri},strong:{n:strong.length,ok:strong.filter(q=>q.j.ok).length},fav:{n:fav.length,ok:favOk.length},
    bsd:acc("p"),bl:acc("bl"),sk:acc("sk"),ou:{n:ouQ.length,ok:ouOk},bt:{n:btQ.length,ok:btOk},kej,best,worst}}
const tgl=ms=>new Date(ms+WITA).toLocaleDateString("id-ID",{timeZone:"UTC",weekday:"long",day:"numeric",month:"long"});
export function reportText(R){
  if(!R||!R.n)return`LAPORAN PAGI BOLA LIVE\nHari bola ${R?tgl(Date.parse(R.from)):"kemarin"}: belum ada laga dengan prediksi yang selesai.${R&&R.wait?` (${R.wait} laga belum ada hasil.)`:""}\n`;
  const P=(a,b)=>b?`${a} dari ${b} (${pct(a,b)}%)`:"–",o=[];
  o.push(`LAPORAN PAGI BOLA LIVE`);o.push(`Hari bola ${tgl(Date.parse(R.from))} (06.00 s.d. 06.00 WITA)`);o.push("");
  o.push(`• ${R.n} laga selesai${R.wait?` (${R.wait} belum ada hasil)`:""}: ✓ Tepat ${P(R.ok,R.n)}, ~ Imbang ${R.imb}, ✕ Meleset ${R.mel}.`);
  if(R.strong.n)o.push(`• Unggulan kuat (≥60% menang): ${P(R.strong.ok,R.strong.n)}.`);
  if(R.fav.n)o.push(`• Favorit (≥80% tidak kalah): ${P(R.fav.ok,R.fav.n)}.`);
  if(R.open.n)o.push(`• Laga terbuka (tebakan "tidak kalah"): ${P(R.open.ok,R.open.n)}, ${R.open.seri} di antaranya karena seri.`);
  const ab=[];if(R.bsd.n)ab.push(`BSD ${P(R.bsd.hit,R.bsd.n)}`);if(R.bl.n)ab.push(`Model BL ${P(R.bl.hit,R.bl.n)}`);if(R.sk.n)ab.push(`Gabungan ${P(R.sk.hit,R.sk.n)}`);
  if(ab.length)o.push(`• Hasil 1X2 paling mungkin: ${ab.join(" · ")}.`);
  const ob=[];if(R.ou.n)ob.push(`Over/Under 2,5 ${P(R.ou.ok,R.ou.n)}`);if(R.bt.n)ob.push(`Kedua tim cetak gol ${P(R.bt.ok,R.bt.n)}`);if(ob.length)o.push(`• ${ob.join(" · ")}.`);
  if(R.kej.length){o.push("");o.push("Paling meleset:");R.kej.forEach((k,i)=>o.push(`${i+1}. ${k.h} ${k.r[0]}-${k.r[1]} ${k.a} (${k.lg}): ${k.tim} ${k.k==="terbuka"?"tidak kalah":"menang"} ${k.pv}%${k.seri?", berakhir seri":""}${k.ab&&(k.ab[0]||k.ab[1])?`, absen ${k.ab[0]||0}-${k.ab[1]||0}`:""}.`))}
  if(R.best.length||R.worst.length){o.push("");if(R.best.length)o.push(`Liga paling mudah ditebak: ${R.best.map(g=>`${g.lg} ${g.ok}/${g.n}`).join(", ")}.`);if(R.worst.length)o.push(`Liga paling sulit: ${R.worst.map(g=>`${g.lg} ${g.ok}/${g.n}`).join(", ")}.`)}
  o.push("");o.push("Penilaian sama dengan tanda di web. Prediksi adalah perkiraan statistik, bukan jaminan hasil.");
  return o.join("\n")+"\n"}
