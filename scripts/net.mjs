// Utilitas jaringan bersama (update.mjs, world.mjs, preflight.mjs).
import {fileURLToPath} from "node:url";
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
