// V19 (audit 20 Nov 2026): pemeriksa sebelum tayang.
//   node guard.mjs before  -> catat isi data internal sesudah dipulihkan dari cache (jumlah baris tiap file penting)
//                             dan simpan salinan file-file itu (snapshot, di luar cache).
//   node guard.mjs after   -> bandingkan; file data internal yang menyusut tidak wajar DIKEMBALIKAN dari snapshot
//                             (peringatan di Actions, situs tetap diperbarui). Bila tidak bisa dipulihkan, atau all.json
//                             rusak/anjlok, KELUAR DENGAN GALAT: cache tidak disimpan, situs lama tetap tayang.
// Juga: tulis ringkasan jumlah (tanpa data) ke situs (state-manifest.json) sebagai patokan bila cache hilang,
// dan memutuskan kapan cadangan harian dibuat (keluaran backup=1).
import {readFileSync,writeFileSync,existsSync,mkdirSync,appendFileSync,mkdtempSync,copyFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
const mkTmp=()=>mkdtempSync(join(tmpdir(),"guard-"))+"/";
import {stateDir,outDir,siteBase,tfetch} from "./net.mjs";

const E=process.env,mode=process.argv[2]||"after",SD=stateDir()||"",dir=outDir(import.meta.url),tmp=E.GUARD_TMP||(SD?SD+"../.guard-before.json":"/tmp/guard-before.json");
const snapDir=tmp.replace(/\.json$/,"")+"-files/";
const J=f=>{try{return JSON.parse(readFileSync(f,"utf8"))}catch(e){return null}};
// jumlah isi tiap file penting (bukan ukuran byte: format bisa berubah, jumlah isi tidak boleh anjlok)
export function counts(sd){
  const c={},g=(f,fn)=>{const o=J(sd+f);if(o!=null){try{c[f]=fn(o)}catch(e){c[f]=0}}};
  g("results.json",o=>(o.rows||[]).length);g("xg.json",o=>Object.keys(o.e||{}).length);g("bsd-history.json",o=>Array.isArray(o)?o.length:0);
  g("players.json",o=>Object.keys(o.t||{}).length);g("values.json",o=>Object.keys(o.p||{}).length);g("starters.json",o=>Object.keys(o.t||{}).length);
  g("xi.json",o=>Object.keys(o.e||{}).length);g("xi2.json",o=>Object.keys(o.e||{}).length);g("hl.json",o=>Object.values(o.matches||{}).reduce((s,a)=>s+(Array.isArray(a)?a.length:0),0));
  g("model-bl.json",o=>o.nMatches||0);return c}
// ambang: file baru boleh lebih kecil, tapi tidak boleh di bawah sekian persen dari sebelumnya (bila sebelumnya cukup besar)
export const RULES={"results.json":[1000,.85],"xg.json":[300,.7],"bsd-history.json":[200,.85],"players.json":[50,.5],"values.json":[100,.7],"starters.json":[50,.5],"hl.json":[20,.5],"model-bl.json":[1000,.7],"xi2.json":[500,.5]};
export function check(before,after,rules=RULES){const bad=[];for(const [f,[min,ratio]] of Object.entries(rules)){const b=before[f]||0,a=after[f]||0;if(b>=min&&a<b*ratio)bad.push(`${f}: ${b} -> ${a}`)}return bad}

// V19 (audit): kesehatan data & model -> peringatan (tidak menggagalkan run) + ringkasan di halaman run Actions
export function health(dir,sd,after,now=Date.now()){
  const w=[],info=[],age=f=>{const o=J(dir+f)||J(sd+f);const t=o&&Date.parse(o.updated);return Number.isFinite(t)?(now-t)/36e5:null};
  const all=J(dir+"all.json")||{},b=all.bsd||{};
  if(b.fatal)w.push("BSD menolak token / tidak bisa diakses (cek secret BSD_API_KEY & masa langganan)");
  const am=age("model-bl.json");if(am!=null&&am>50)w.push(`Model BL belum dilatih ulang ${Math.round(am)} jam (normal: sekali sehari)`);
  const ab=age("bsd-backtest.json");if(ab!=null&&ab>50)w.push(`Uji mundur BSD belum diperbarui ${Math.round(ab)} jam`);
  if((after["hl.json"]??null)===0)w.push("Liga Highlightly kosong (kuota habis / key bermasalah); terisi lagi setelah kuota pulih 08.00 WITA");
  const tm=b.tm||{},mx=Math.max(0,...Object.values(tm).filter(Number.isFinite));if(mx>600)w.push(`Skrip BSD berjalan ${mx} detik (batas 720): kurangi BSD_MAX_DETAIL bila sering`);
  const ev=J(dir+"bsd-eval.json"),bl=ev&&ev.bl;
  if(bl&&bl.n>=100&&bl.model&&bl.bsd){const d=bl.model.ll-bl.bsd.ll;info.push(`Penilaian langsung ${bl.n} laga: Model BL ${bl.model.acc.toFixed(1)}% (log-loss ${bl.model.ll.toFixed(3)}) vs BSD ${bl.bsd.acc.toFixed(1)}% (${bl.bsd.ll.toFixed(3)})`);
    if(d>.05)w.push("Model BL jauh di bawah BSD pada penilaian langsung (selisih log-loss "+d.toFixed(3)+"); cek data line-up/xG")}
  if(Array.isArray(all.errors)&&all.errors.length)info.push("Catatan run: "+all.errors.slice(0,3).join(" | ").slice(0,300));
  if(Object.keys(tm).length)info.push("Waktu BSD per tahap (detik sejak mulai): "+Object.entries(tm).map(([k,v])=>k+" "+v).join(", "));
  return{w,info}}

async function main(){
  if(!SD){console.log("guard: STATE_DIR tidak diatur, dilewati");return}
  if(mode==="before"){const c=counts(SD);mkdirSync(SD,{recursive:true});mkdirSync(snapDir,{recursive:true});
    for(const f of Object.keys(c))try{copyFileSync(SD+f,snapDir+f)}catch(e){}
    writeFileSync(tmp,JSON.stringify({at:Date.now(),c}));console.log("data internal sesudah dipulihkan:",JSON.stringify(c));return}
  let before=J(tmp)?.c||{};
  // cache hilang (tidak ada data sebelum run): pakai ringkasan jumlah yang tayang di situs sebagai patokan
  if(!Object.keys(before).length){const site=siteBase();if(site){try{const r=await tfetch(site+"state-manifest.json?t="+Date.now());if(r.ok)before=(await r.json()).c||{}}catch(e){}
      // run pindahan pertama: belum ada ringkasan -> hitung dari file lama yang masih tayang
      if(!Object.keys(before).length){const t=mkTmp();for(const f of Object.keys(RULES)){try{const r=await tfetch(site+f+"?t="+Date.now());if(r.ok)writeFileSync(t+f,await r.text())}catch(e){}}before=counts(t)}}
    console.log("patokan dari situs:",JSON.stringify(before))}
  let after=counts(SD);const shrunk=check(before,after),bad=[],fixed=[];
  // file yang menyusut dikembalikan dari snapshot sebelum run (data tidak hilang, run tetap jalan)
  const allow=E.GUARD_ALLOW_SHRINK==="1";
  for(const line of shrunk){const f=line.split(":")[0];if(!allow&&existsSync(snapDir+f)){copyFileSync(snapDir+f,SD+f);if(existsSync(dir+f))copyFileSync(snapDir+f,dir+f);fixed.push(line)}else bad.push(line)}
  if(fixed.length){console.log((E.GITHUB_ACTIONS?"::warning::":"")+"Data internal menyusut tidak wajar dan DIKEMBALIKAN ke versi sebelum run: "+fixed.join("; "));after=counts(SD)}
  // all.json wajib ada dan masuk akal
  const all=J(dir+"all.json"),prevAll=E.PREV_DIR?J(E.PREV_DIR.replace(/\/*$/,"/")+"all.json"):null;
  if(!all||!Array.isArray(all.matches))bad.push("all.json tidak ada / rusak");
  else if(prevAll&&Array.isArray(prevAll.matches)&&prevAll.matches.length>=100&&all.matches.length<prevAll.matches.length*.4)bad.push(`all.json: ${prevAll.matches.length} -> ${all.matches.length} laga`);
  console.log("sebelum:",JSON.stringify(before),"\nsesudah:",JSON.stringify(after));
  if(bad.length&&!allow){console.error((E.GITHUB_ACTIONS?"::error::":"")+"Data menyusut tidak wajar, deploy dibatalkan supaya data tidak hilang: "+bad.join("; ")+
    ". Bila memang disengaja, set variabel repo GUARD_ALLOW_SHRINK=1 untuk satu run.");process.exit(1)}
  if(E.GITHUB_OUTPUT&&fixed.length)appendFileSync(E.GITHUB_OUTPUT,"restored="+fixed.length+"\n");
  writeFileSync(dir+"state-manifest.json",JSON.stringify({updated:new Date().toISOString(),c:after}));
  {const H=health(dir,SD,after);for(const x of H.w)console.log((E.GITHUB_ACTIONS?"::warning title=Kesehatan::":"PERINGATAN: ")+x);
   if(E.GITHUB_STEP_SUMMARY)try{appendFileSync(E.GITHUB_STEP_SUMMARY,"### Kesehatan data\n\n"+(H.w.length?H.w.map(x=>"- ⚠️ "+x).join("\n"):"- ✅ Tidak ada masalah")+"\n"+H.info.map(x=>"- "+x).join("\n")+
     "\n\n| File | Isi |\n|---|---|\n"+Object.entries(after).map(([k,v])=>`| ${k} | ${v} |`).join("\n")+(fixed.length?"\n\n**Dipulihkan dari snapshot:** "+fixed.join("; "):"")+"\n")}catch(e){}}
  // cadangan harian
  const bf=SD+".backup-at",last=existsSync(bf)?Number(readFileSync(bf,"utf8"))||0:0,need=Date.now()-last>20*36e5&&(after["results.json"]||0)>0;
  if(need)writeFileSync(bf,String(Date.now()));if(E.GITHUB_OUTPUT)appendFileSync(E.GITHUB_OUTPUT,"backup="+(need?1:0)+"\n");
  console.log("guard OK"+(need?" (cadangan harian dibuat run ini)":""));
}
if(process.argv[1]&&import.meta.url.endsWith(process.argv[1].split("/").pop()))main().catch(e=>{console.error(e);process.exit(1)});
