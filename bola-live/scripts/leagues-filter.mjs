import {readFileSync} from "node:fs";
// Satu-satunya sumber kebenaran untuk "liga apa saja yang boleh tampil di web".
// Daftarnya ikut BSD (scripts/bsd-leagues.json, dihasilkan dari GET /leagues/ milik BSD).
// Selama meta.complete belum true (daftarnya belum 103 liga penuh), filter DIMATIKAN
// supaya tidak salah menghapus liga yang sebenarnya ada di BSD tapi belum sempat terdaftar.
let WLF=null;
try{WLF=JSON.parse(readFileSync(new URL("./bsd-leagues.json",import.meta.url),"utf8"))}catch(e){WLF=null}
const WL=WLF&&WLF.leagues;
const WL_NAMES=WL?new Set(WL.map(l=>String(l.name).toLowerCase().trim())):null;
export const bsdWhitelistReady=!!(WLF&&WLF.meta&&WLF.meta.complete===true);
export const bsdAllows=name=>{
  if(!bsdWhitelistReady||!WL_NAMES)return true;
  return WL_NAMES.has(String(name||"").toLowerCase().trim());
};
if(!bsdWhitelistReady)console.log("leagues-filter: bsd-leagues.json belum lengkap -> filter liga DIMATIKAN sampai lengkap.");
