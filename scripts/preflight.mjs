// Pemeriksaan awal sebelum update: mendeteksi penyebab gagal yang paling umum dan menjelaskannya dengan jelas.
// Tidak memanggil API football-data.org (supaya tidak memakai jatah 10 permintaan/menit).
import {appendFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {cleanKey,tfetch} from "./net.mjs";

export function checkKey(raw){
  if(raw==null||String(raw).trim()==="")return{level:"error",msg:"Secret FOOTBALL_DATA_KEY kosong atau belum dibuat. Buka repo > Settings > Secrets and variables > Actions > New repository secret. Nama harus persis FOOTBALL_DATA_KEY."};
  const k=cleanKey(raw);
  if(k!==String(raw).trim())return{level:"warn",msg:"Secret FOOTBALL_DATA_KEY diapit tanda kutip; dibersihkan otomatis, tetapi sebaiknya tempel ulang tanpa kutip."};
  if(/[^\x21-\x7e]/.test(k))return{level:"error",msg:"Secret FOOTBALL_DATA_KEY mengandung spasi/karakter tak valid di tengah. Tempel ulang hanya tokennya."};
  if(!/^[A-Fa-f0-9]{32}$/.test(k))return{level:"warn",msg:`Panjang/format token tidak seperti biasanya (${k.length} karakter; token football-data.org umumnya 32 karakter heksadesimal). Pastikan yang ditempel adalah token, bukan kata sandi atau alamat email.`};
  return{level:"ok",msg:"Secret FOOTBALL_DATA_KEY terisi dan formatnya wajar."};
}

// status = kode HTTP dari GET /repos/{repo}/pages, body = JSON atau null
export function checkPages(status,body){
  if(status===404)return{level:"error",msg:"GitHub Pages belum diaktifkan. Buka Settings > Pages > Build and deployment > Source, pilih \"GitHub Actions\", lalu jalankan ulang workflow."};
  if(status===200&&body&&body.build_type==="legacy")return{level:"error",msg:"Sumber GitHub Pages masih \"Deploy from a branch\". Ubah di Settings > Pages > Build and deployment > Source menjadi \"GitHub Actions\", lalu jalankan ulang workflow."};
  if(status===200)return{level:"ok",msg:"GitHub Pages aktif dengan sumber GitHub Actions."};
  return{level:"warn",msg:`Status Pages tidak bisa dipastikan (HTTP ${status}). Dilewati; jika langkah deploy gagal, cek Settings > Pages > Source = GitHub Actions.`};
}

export function checkBranch(ref,def){
  if(!ref||!def||ref===def)return{level:"ok",msg:"Cabang sesuai cabang utama repositori."};
  return{level:"warn",msg:`Dijalankan dari cabang "${ref}", sedangkan cabang utama repositori adalah "${def}". Deploy ke Pages biasanya hanya diizinkan dari cabang utama.`};
}

async function main(){
  const E=process.env,res=[];
  res.push(["Token football-data.org",checkKey(E.FOOTBALL_DATA_KEY)]);
  const repo=E.GITHUB_REPOSITORY;
  if(repo&&E.GITHUB_TOKEN){
    try{
      const h={Authorization:"Bearer "+E.GITHUB_TOKEN,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"bola-live-preflight"};
      const r=await tfetch(`${E.GITHUB_API_URL||"https://api.github.com"}/repos/${repo}/pages`,{headers:h});
      let b=null;try{b=await r.json()}catch(e){}
      res.push(["GitHub Pages",checkPages(r.status,b)]);
      const rr=await tfetch(`${E.GITHUB_API_URL||"https://api.github.com"}/repos/${repo}`,{headers:h});
      if(rr.ok){const j=await rr.json();res.push(["Cabang",checkBranch(E.GITHUB_REF_NAME,j.default_branch)]);
        if(j.private)res.push(["Repositori",{level:"warn",msg:"Repositori privat: jadwal tiap 15 menit memakai sekitar 300 menit Actions per hari, sedangkan paket gratis hanya 2.000 menit per bulan. Jadikan repositori publik atau perpanjang jadwal (mis. tiap 60 menit)."}])}
    }catch(e){res.push(["GitHub Pages",{level:"warn",msg:"Tidak bisa memeriksa status Pages ("+e.message+"). Dilewati."}])}
  }
  const icon={ok:"OK  ",warn:"PERLU PERHATIAN",error:"GAGAL"};
  let md="### Pemeriksaan awal\n\n";let fatal=false;
  for(const [n,r] of res){
    console.log(`[${icon[r.level]}] ${n}: ${r.msg}`);
    md+=`- ${r.level==="ok"?"✅":r.level==="warn"?"⚠️":"❌"} **${n}**: ${r.msg}\n`;
    if(r.level==="error"){fatal=true;console.error(`::error title=${n}::${r.msg}`)}
    else if(r.level==="warn")console.warn(`::warning title=${n}::${r.msg}`);
  }
  if(E.GITHUB_STEP_SUMMARY){try{appendFileSync(E.GITHUB_STEP_SUMMARY,md+"\n")}catch(e){}}
  process.exit(fatal?1:0);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main();
