// V12.2 (BSD saja): run tiap 5 menit (jadwal GitHub atau cron-job.org) = mode ringan, kecuali run berat terakhir sudah > 55 menit lalu.
// Mengambil all.json yang sedang tayang hanya untuk membaca kapan run berat terakhir (heavyAt).
import {writeFileSync,appendFileSync,mkdirSync} from "node:fs";
import {tfetch,siteBase,outDir,readPrev,prevDir} from "./net.mjs";
const E=process.env,dir=outDir(import.meta.url),site=siteBase();mkdirSync(dir,{recursive:true});
// V13.1: dipicu cron-job.org (workflow_dispatch) tiap 5 menit -> diperlakukan seperti jadwal; hanya push (upload file) yang langsung berat.
let heavy=E.GITHUB_EVENT_NAME==="push"?1:0;
if(E.FORCE_HEAVY==="1")heavy=1;
if(!heavy&&(site||prevDir())){
  let age=1e9;
  try{const t=await readPrev("all.json",{json:false});if(t){const j=JSON.parse(t);writeFileSync(dir+"all.json",t);if(j.heavyAt)age=(Date.now()-Date.parse(j.heavyAt))/6e4}}catch(e){}   // V19: dari cache run sebelumnya
  if(age>55)heavy=1;
  console.log("run berat terakhir:",age>1e8?"tidak diketahui":Math.round(age)+" menit lalu");
}else if(!site&&!prevDir())heavy=1;
console.log("mode:",heavy?"BERAT (klasemen, Match Center penuh)":"RINGAN (live)");
if(E.GITHUB_OUTPUT)appendFileSync(E.GITHUB_OUTPUT,"heavy="+heavy+"\n");
