// V51 (25 Nov 2026): DATA HEALTH CENTER — ringkasan kesehatan data yang TAYANG (health.json), dibuat guard.mjs "after"
// tepat sebelum deploy. Hanya MEMBACA keluaran run (all.json, m/<eid>.json, lg/<id>.json, file turunan); tidak mengubah data,
// prediksi, atau keputusan guard. Semua waktu ISO UTC. Status umur file dihitung ulang di halaman (umur bertambah setelah tayang).
import {readFileSync,existsSync} from "node:fs";
const J=f=>{try{return JSON.parse(readFileSync(f,"utf8"))}catch(e){return null}};
const H=36e5;
export const FRIENDLY_RE=/friendl|persahabatan|amical|amistos|testspiel/i;
export const CUP_RE=/\b(cup|copa|coupe|pokal|coppa|ta[cç]a|puchar|beker|kupa|piala|trophy|shield|supercopa|supercup|super cup)\b/i;   // V52: piala tanpa klasemen tidak dihitung kurang
// batas umur (jam): [peringatan, masalah]; dipakai juga oleh halaman
export const AGE={"all.json":[.5,2],"model-bl.json":[26,50],"bsd-backtest.json":[26,50],"teams.json":[26,50],"pf.json":[3,26],"laporan.json":[.5,2],"rekam-index.json":[.5,2],"bsd-eval.json":[.5,2]};
const sum3=p=>p.h+p.d+p.a,ok3=p=>p&&[p.h,p.d,p.a].every(v=>typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=100);
// lg: id -> objek klasemen (atau null bila tidak ada); md: eid -> detail Match Center (atau null)
export function matchHealth(matches,now,{lg=()=>null,md=()=>null}={}){
  const W=(matches||[]).filter(m=>{const t=Date.parse(m.utc);return m.status==="LIVE"||(m.status==="NS"&&t>now-6*H&&t<now+72*H)||(m.status==="FT"&&t>now-30*H)});
  const c={n:W.length,pred:0,xg:0,bl:0,det:0,detNeed:0,tbl:0,tblNeed:0,h2h:0,form:0,lu:{confirmed:0,predicted:0,none:0,need:0}},L=new Map(),an=[];
  const seen=new Map();
  for(const m of W){const t=Date.parse(m.utc),hp=!!(m.p&&!m.np),g=L.get(m.league)||{lg:m.league,n:0,miss:0,items:{}};g.n++;const miss=[];
    if(hp)c.pred++;else miss.push("prediksi");if(hp&&m.p.xg)c.xg++;else if(hp)miss.push("xG");if(m.bl)c.bl++;
    const d=m.eid&&m.src!=="HL"?md(m.eid):null;if(m.eid&&m.src!=="HL"){c.detNeed++;if(d)c.det++;else miss.push("detail")}
    if(d){if(Array.isArray(d.h2h)?d.h2h.length:d.h2h&&Object.keys(d.h2h).length)c.h2h++;if(d.form&&(d.form.home||d.form.away))c.form++}
    if(m.lid!=null&&!FRIENDLY_RE.test(m.league||"")){const o=lg(m.lid),rows=o&&((o.standings||[]).length||(o.groups&&Object.keys(o.groups).length));if(rows||!CUP_RE.test(m.league||"")){c.tblNeed++;if(rows)c.tbl++;else miss.push("klasemen")}}
    if(m.status==="NS"&&t>=now&&t-now<=90*6e4&&m.src!=="HL"){c.lu.need++;const s=d&&d.lineups&&d.lineups.lineup_status;if(s==="confirmed")c.lu.confirmed++;else if(s)c.lu.predicted++;else{c.lu.none++;miss.push("line-up")}}
    if(miss.length){g.miss++;for(const k of miss)g.items[k]=(g.items[k]||0)+1}L.set(m.league,g);
    // anomali: hanya dari data yang benar-benar terlihat
    const nm=(m.home&&m.home.name||"?")+" vs "+(m.away&&m.away.name||"?");
    if(!m.home||!m.home.name||!m.away||!m.away.name)an.push({k:"nama",id:m.eid??m.id,t:"Nama tim kosong",m:nm});
    if(hp&&!ok3(m.p))an.push({k:"peluang",id:m.eid,t:"Peluang tidak valid (di luar 0–100)",m:nm});
    else if(hp&&Math.abs(sum3(m.p)-100)>3)an.push({k:"peluang",id:m.eid,t:"Jumlah peluang "+Math.round(sum3(m.p))+"% (seharusnya ±100%)",m:nm});
    if(m.status==="LIVE"&&now-t>3.5*H)an.push({k:"macet",id:m.eid,t:"Masih LIVE "+Math.round((now-t)/H)+" jam setelah kickoff",m:nm});
    if(m.status==="NS"&&now-t>2*H)an.push({k:"belum",id:m.eid,t:"Belum mulai padahal kickoff lewat "+Math.round((now-t)/H)+" jam",m:nm});
    if(m.status==="FT"&&(!m.score||m.score[0]==null||m.score[1]==null))an.push({k:"skor",id:m.eid,t:"Selesai tanpa skor",m:nm});
    if((m.status==="FT"||m.status==="LIVE")&&t>now+H)an.push({k:"jadwal",id:m.eid,t:(m.status==="FT"?"Sudah selesai":"Sedang LIVE")+" padahal jadwal kickoff "+Math.round((t-now)/H)+" jam lagi (jadwal di sumber belum diperbarui)",m:nm});   // V55b
    const key=(m.hid??(m.home&&m.home.name))+"|"+(m.aid??(m.away&&m.away.name))+"|"+String(m.utc).slice(0,10);if(seen.has(key)&&seen.get(key)!==(m.eid??m.id))an.push({k:"ganda",id:m.eid,t:"Laga ganda (tim & tanggal sama)",m:nm});else seen.set(key,m.eid??m.id)}
  const lgs=[...L.values()].filter(g=>g.miss).sort((a,b)=>b.miss-a.miss||b.n-a.n).slice(0,12);
  return{c,lgs,an:an.slice(0,40),anN:an.length}}
export function dataHealth(dir,{now=Date.now(),guard={},warn=[]}={}){
  const all=J(dir+"all.json")||{},b=all.bsd||{},hl=all.hl||null,M=Array.isArray(all.matches)?all.matches:[],ck=[];
  const add=(k,label,st,val,note)=>ck.push({k,label,st,val:val??null,note:note??null});
  // sumber data
  if(b.fatal)add("bsd","API BSD","bad","tidak bisa diakses","Token ditolak / langganan bermasalah; data lama tetap tayang.");
  else add("bsd","API BSD",(all.errors||[]).some(e=>/kuota|429|quota/i.test(e))?"warn":"ok",b.calls!=null?b.calls+" panggilan run ini":"terhubung",b.mode?"mode "+(b.mode==="light"?"ringan (5 menit)":"berat (±1 jam)"):null);
  if(hl)add("hl","API Highlightly",hl.errors&&hl.errors.length?"warn":"ok",(hl.today??0)+" / "+(hl.cap??"?")+" kuota hari ini",(hl.matches??0)+" laga, "+(hl.leagues??0)+" liga"+(hl.errors&&hl.errors.length?"; "+hl.errors.slice(0,2).join(" | "):""));
  const er=Array.isArray(all.errors)?all.errors:[];add("err","Catatan galat run",er.length?"warn":"ok",er.length?er.length+" catatan":"tidak ada",er.length?er.slice(0,5).join(" | ").slice(0,400):null);
  const fx=guard.fixed||[];add("guard","Data Guard",fx.length?"warn":"ok",fx.length?"dipulihkan: "+fx.length+" file":"tidak ada penyusutan",fx.length?fx.join("; "):"Data internal tidak menyusut; cadangan & pemulihan aktif.");
  if(warn.length)add("sys","Peringatan sistem","warn",warn.length+" peringatan",warn.slice(0,4).join(" | ").slice(0,400));
  // umur file (dihitung ulang di halaman)
  const files={};for(const f of Object.keys(AGE)){const o=J(dir+f);const u=o&&(o.updated||o.trained);files[f]=Number.isFinite(Date.parse(u))?new Date(Date.parse(u)).toISOString():null}
  // versi
  const mv={};for(const m of M)if(m.p&&m.p.mv)mv[m.p.mv]=(mv[m.p.mv]||0)+1;
  let site=null;try{const h=readFileSync(dir+"index.html","utf8").match(/Bola Live <span[^>]*>(V[\w.]+)</);site=h&&h[1]}catch(e){}
  const MB=J(dir+"model-bl.json");
  const ver={site,bsd:mv,modelBL:MB?{updated:MB.updated||null,n:MB.nMatches||null,partial:!!MB.partial}:null};
  const RI=J(dir+"rekam-index.json");if(RI)add("rekam","Rekam jejak prediksi",RI.st&&RI.st.conflicts?"warn":"ok",(RI.total||0)+" catatan",RI.st&&RI.st.conflicts?RI.st.conflicts+" laga mendapat angka berbeda setelah kickoff (angka lama dipertahankan)":"0 konflik, "+(RI.st&&RI.st.dup||0)+" duplikat");
  // kelengkapan per laga
  const LG=new Map(),MD=new Map();
  const mh=matchHealth(M,now,{lg:id=>{if(!LG.has(id))LG.set(id,J(dir+"lg/"+id+".json"));return LG.get(id)},md:id=>{if(!MD.has(id))MD.set(id,existsSync(dir+"m/"+id+".json")?J(dir+"m/"+id+".json"):null);return MD.get(id)}});
  const c=mh.c,pc=(a,n)=>n?Math.round(a/n*100):null;
  add("pred","Prediksi BSD (laga 30 jam lalu – 72 jam ke depan)",pc(c.pred,c.n)>=80||!c.n?"ok":"warn",c.pred+" / "+c.n,"Laga tanpa prediksi tampil sebagai jadwal saja.");
  add("det","Detail Match Center",c.detNeed&&pc(c.det,c.detNeed)<70?"warn":"ok",c.det+" / "+c.detNeed,"Form, H2H, line-up, statistik; disiapkan untuk laga live, 4 hari ke depan, dan yang baru selesai.");
  add("tbl","Klasemen",c.tblNeed&&pc(c.tbl,c.tblNeed)<70?"warn":"ok",c.tbl+" / "+c.tblNeed,"Laga persahabatan dan piala tanpa klasemen tidak dihitung.");
  add("lu","Line-up (laga ≤90 menit lagi)","info",c.lu.need?c.lu.confirmed+" resmi · "+c.lu.predicted+" perkiraan · "+c.lu.none+" belum ada":"tidak ada laga dalam 90 menit","Line-up resmi biasanya keluar ±1 jam sebelum kickoff.");
  add("xg","xG BSD",c.pred&&pc(c.xg,c.pred)<50?"warn":"ok",c.xg+" / "+c.pred,"Tidak semua liga punya xG.");
  add("an","Anomali data",mh.anN?"warn":"ok",mh.anN?mh.anN+" temuan":"tidak ada","Hanya dari data yang terlihat: peluang tidak valid, laga macet, belum mulai padahal lewat, tanpa skor, jadwal tidak cocok dengan status, ganda.");
  const st=ck.some(x=>x.st==="bad")?"bad":ck.some(x=>x.st==="warn")?"warn":"ok";
  return{v:1,updated:new Date(now).toISOString(),dataUpdated:all.updated||null,status:st,checks:ck,files,age:AGE,ver,matches:c,leagues:mh.lgs,anomalies:mh.an,anomalyN:mh.anN}}
