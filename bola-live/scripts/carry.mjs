// V12: run ringan (tiap 5 menit) tidak memanggil football-data.org / Understat / PitchAPI.
// Berkas hasil run berat terakhir diambil dari situs yang sedang tayang supaya tidak hilang saat deploy ulang.
// Menulis heavy=1|0 ke GITHUB_OUTPUT: heavy bila dipicu manual/push, bila data.json belum ada, atau sudah > 55 menit.
import {writeFileSync,appendFileSync,mkdirSync} from "node:fs";
import {tfetch,siteBase,outDir} from "./net.mjs";
const E=process.env,dir=outDir(import.meta.url),site=siteBase();mkdirSync(dir,{recursive:true});
const FILES=["data.json","eval.json","history.json","pitch.json","understat.json","catalog.json"];
let heavy=E.GITHUB_EVENT_NAME&&E.GITHUB_EVENT_NAME!=="schedule"?1:0,got=[];
if(E.FORCE_HEAVY==="1")heavy=1;
if(!heavy&&site){
  for(const f of FILES){try{const r=await tfetch(site+f+"?t="+Date.now());if(r.ok){const t=await r.text();JSON.parse(t);writeFileSync(dir+f,t);got.push(f)}}catch(e){}}
  let age=1e9;try{const d=JSON.parse((await import("node:fs")).readFileSync(dir+"data.json","utf8"));age=(Date.now()-Date.parse(d.updated))/6e4}catch(e){}
  if(!got.includes("data.json")||age>55)heavy=1;
  console.log("carry:",got.join(", ")||"(tidak ada)","; umur data.json",Math.round(age),"menit");
}else if(!site)heavy=1;
console.log("mode:",heavy?"BERAT (semua sumber)":"RINGAN (BSD live saja)");
if(E.GITHUB_OUTPUT)appendFileSync(E.GITHUB_OUTPUT,"heavy="+heavy+"\n");
