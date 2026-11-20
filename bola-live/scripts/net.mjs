// Utilitas jaringan bersama (update.mjs, bsd.mjs, preflight.mjs).
import {fileURLToPath} from "node:url";
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// Semua permintaan punya batas waktu: server yang menggantung tidak boleh menahan job sampai timeout 12 menit.
export const tfetch=(url,opts={})=>fetch(url,{...opts,signal:AbortSignal.timeout(Number(process.env.FETCH_TIMEOUT_MS??20000))});
// Secret sering tersalin dengan spasi / baris baru / tanda kutip.
export const cleanKey=v=>String(v??"").trim().replace(/^["']+|["']+$/g,"").trim();
// Alamat dasar situs Pages. Repo "nama.github.io" dilayani di akar, repo lain di /nama-repo/.
export function siteBase(env=process.env){
  if(env.SITE_URL)return env.SITE_URL.replace(/\/*$/,"/");
  const repo=env.GITHUB_REPOSITORY;if(!repo||!repo.includes("/"))return null;
  const [o,n]=repo.split("/"),host=o.toLowerCase()+".github.io";
  return n.toLowerCase()===host?`https://${host}/`:`https://${host}/${n}/`;
}
export const outDir=(metaUrl,env=process.env)=>env.OUT_DIR?env.OUT_DIR.replace(/\/*$/,"/"):fileURLToPath(new URL("../site/",metaUrl));
// Batas waktu total satu run (default 8 menit, di bawah timeout job) agar gagal cepat dan jelas, bukan dimatikan paksa.
export const deadline=Date.now()+Number(process.env.MAX_RUN_MS??480000);
export const overDeadline=()=>Date.now()>deadline;
export const ghError=m=>console.error(process.env.GITHUB_ACTIONS?`::error::${m}`:m);
export const ghWarn=m=>console.warn(process.env.GITHUB_ACTIONS?`::warning::${m}`:m);

// ===== V19 (audit 20 Nov 2026): data antar-run tanpa mengunduh ulang dari situs tayang =====
// PREV_DIR  = salinan keluaran run sebelumnya (dipulihkan dari cache GitHub Actions) -> file tayang (all.json, m/, lg/, ...).
// STATE_DIR = data internal yang TIDAK ikut tayang (riwayat setahun, xG, data pemain, odds, status Highlightly):
//             tidak bisa diunduh publik (lisensi BSD/Highlightly) dan tidak memakan bandwidth GitHub Pages.
// Bila file belum ada di lokal (run pertama setelah pindah / cache hilang), dibaca dari situs tayang sebagai cadangan.
const slash=d=>d?d.replace(/\/*$/,"/"):null;
export const prevDir=(env=process.env)=>slash(env.PREV_DIR);
export const stateDir=(env=process.env)=>slash(env.STATE_DIR||env.BL_STATE_DIR);
async function fromSite(f,json){const site=siteBase();if(!site)return null;try{const r=await tfetch(site+f+"?t="+Date.now());if(!r.ok)return null;return json?await r.json():await r.text()}catch(e){return null}}
export async function readPrev(f,{json=true}={}){const p=prevDir();if(p){try{const t=readFileSync(p+f,"utf8");return json?JSON.parse(t):t}catch(e){if(e.code!=="ENOENT")ghWarn("baca "+f+": "+e.message)}}return fromSite(f,json)}
export async function readState(f){const d=stateDir();if(d){try{return JSON.parse(readFileSync(d+f,"utf8"))}catch(e){if(e.code!=="ENOENT")ghWarn("baca data internal "+f+": "+e.message)}}return readPrev(f)}
// tulis data internal; pub = juga tayang (file turunan yang dipakai halaman)
export function writeState(f,obj,{pub=false,dir}={}){const d=stateDir(),s=typeof obj==="string"?obj:JSON.stringify(obj);if(d){mkdirSync(d,{recursive:true});writeFileSync(d+f,s)}if((pub||!d)&&dir)writeFileSync(dir+f,s)}
