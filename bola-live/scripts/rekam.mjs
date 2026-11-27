// V50 (25 Nov 2026): REKAM JEJAK PREDIKSI per laga — arsip tayang per bulan kickoff (WITA), tanpa odds (mode netral).
// Sumber: bsd-history (catatan yang sudah ada, dibekukan saat kickoff oleh updateHistory). Arsip ini lapisan kedua:
//  - catatan yang SUDAH kickoff di arsip tidak pernah ditimpa angka prediksinya (p0, p, bl, sk, ou, bt, t0, ts, tc, pu, mv, fx);
//    yang boleh diisi hanya hasil (r) bila masih kosong atau dikoreksi dalam 48 jam setelah kickoff (sama dengan aturan riwayat);
//  - bila sumber membawa angka berbeda untuk laga yang sudah kickoff, arsip tetap memakai angka lama dan menghitung "konflik";
//  - satu id = satu catatan (tanpa duplikasi); laga yang dijadwal ulang ke masa depan sebelum ada hasil boleh diperbarui.
// Arsip tidak ikut terpotong 120 hari seperti bsd-history, jadi rekam jejak lama tetap ada.
export const PRED_FIELDS=["p0","p","bl","sk","ou","bt","t0","ts","tc","pu","mv","xq","sp","sx","fx"];   // V59: fx = uji maju koreksi faktor saja (tidak dipakai prediksi)   // V52: sp/sx = potret sebelum/sesudah line-up resmi
const H48=48*36e5;
export const monthOf=u=>new Date(Date.parse(u)+8*36e5).toISOString().slice(0,7);
export function rekRow(e){const o={id:e.id,u:e.u,lg:e.lg??null,h:e.h??null,a:e.a??null,r:e.r??null,x:e.r?null:(e.x??null)};/* V56: x = keterangan laga tanpa hasil (ditunda/dibatalkan/dihentikan), bukan angka prediksi */for(const k of PRED_FIELDS)o[k]=e[k]??null;if(o.sp&&o.sp.xi){o.sp={...o.sp};delete o.sp.xi}return o}
const same=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
// prev: array catatan arsip lama; hist: catatan bsd-history terbaru. Hasil: {rows, st:{added, updated, locked, results, conflicts, dup}}
export function mergeRekam(prev,hist,now){
  const M=new Map(),st={added:0,updated:0,locked:0,results:0,conflicts:0,dup:0};
  for(const r of prev||[]){if(!r||r.id==null||!r.u)continue;if(M.has(r.id))st.dup++;M.set(r.id,r)}
  for(const e of hist||[]){if(!e||e.id==null||!e.u||!e.p)continue;const n=rekRow(e),o=M.get(e.id);
    if(!o){M.set(e.id,n);st.added++;continue}
    const ko=Date.parse(o.u),started=Number.isFinite(ko)&&ko<=now;
    if(!started||(!o.r&&Date.parse(n.u)>now&&Date.parse(n.u)>ko)){   // belum kickoff (atau dijadwal ulang ke masa depan, belum ada hasil): boleh diperbarui
      const t=o.t0??n.t0,p0=o.p0??n.p0;if(!same({...o,t0:t,p0},{...n,t0:t,p0})){M.set(e.id,{...n,t0:t,p0});st.updated++}continue}
    st.locked++;let c=false;for(const k of PRED_FIELDS)if(o[k]!=null&&n[k]!=null&&!same(o[k],n[k]))c=true;if(c)st.conflicts++;
    // angka prediksi yang kosong setelah kickoff sengaja TIDAK diisi dari sumber (tidak boleh ada pengisian sesudah laga mulai)
    if(n.r&&(!o.r||(!same(o.r,n.r)&&now-ko<H48))){M.set(e.id,{...o,r:n.r,x:null});st.results++}
    else if(!o.r&&!n.r&&n.x&&!same(o.x,n.x)){M.set(e.id,{...o,x:n.x});st.status=(st.status||0)+1}}   // V56: keterangan status boleh diisi/diperbarui selama belum ada hasil
  return{rows:[...M.values()].sort((a,b)=>a.u.localeCompare(b.u)||String(a.id).localeCompare(String(b.id))),st}}
export function byMonth(rows){const G={};for(const r of rows)(G[monthOf(r.u)]||(G[monthOf(r.u)]=[])).push(r);return G}
export function rekIndex(G,now,st){const months=Object.keys(G).sort().map(m=>({m,n:G[m].length,done:G[m].filter(r=>r.r).length,ts:G[m].filter(r=>r.ts).length,vd:G[m].filter(r=>!r.r&&r.x).length}));
  return{v:1,updated:new Date(now).toISOString(),tz:"UTC (tampilan WITA = UTC+8)",total:months.reduce((s,x)=>s+x.n,0),months,st,
    rule:"Angka prediksi dicatat sebelum kickoff dan dikunci saat kickoff; setelah itu hanya hasil yang diisi. Catatan sebelum 25 Nov 2026 tidak punya waktu pencatatan (t0/ts) dan angka awal (p0)."}}
