// Tes tampilan: narasi "Kenapa X?" (komponen, xG, catatan skuad) dan tabel Evaluasi, dijalankan dengan data tiruan tanpa browser.
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
const html=readFileSync(new URL("../site/index.html",import.meta.url),"utf8");
const js=html.match(/<script>([\s\S]*?)<\/script>/g).pop().replace(/<\/?script>/g,"");
const pre=js.slice(0,js.indexOf('nav("j");load();'));
globalThis.document={querySelector:()=>({addEventListener:()=>{},innerHTML:"",value:""}),addEventListener:()=>{},documentElement:{dataset:{}},querySelectorAll:()=>[]};
globalThis.localStorage={getItem:()=>null,setItem:()=>{}};globalThis.window=globalThis;
const {why,compHtml,v10Comparison}=new Function(pre+";return {why,compHtml,v10Comparison}")();
const side=(n,o={})=>({name:n,pos:3,pts:20,gp:8,gf:20,ga:6,w:6,d:2,l:0,sp:null,elo:1600,f:{l5:"MMSMM",t:{w:7,d:2,l:1,gf:25,ga:8,cs:4,n:10},v:{w:3,d:1,l:1,gf:9,ga:4,n:5}},...o});
const base=(o={})=>({id:"x1",league:"Bundesliga",utc:new Date().toISOString(),status:"NS",score:[null,null],home:side("FC Bayern München"),away:side("1. FC Köln",{ga:12,gp:8}),pick:"h",edge:72,level:"Sangat kuat",
 p:{h:81,d:10,a:9,xg:[2.4,.8],ms:[3,0,11],sc5:[[3,0,11,0]],ou:70,bt:40,pe:{h:65,d:18,a:18},raw:{h:88,d:8,a:4},gp:[8,8],el:[1600,1400],fr:[45,26,29],...o}});
const lite=(o={})=>({engine:"ringkas",h:81,d:10,a:9,components:{poisson:[88,8,4],xg:[84,10,6],elo:[65,18,18]},weights:{poisson:60,xg:25,elo:15},xgOn:true,
 xg:{home:{for:2.91,against:.9,n:6},away:{for:1.1,against:2.1,n:6}},reason:"Model gabungan: ...",...o});
// A. xG aktif + rapuh + catatan skuad
let x=base({engine:"V10-ringkas",lite:lite(),v10:{ms:[2,0],ou:60,bt:45,reasons:[],lineup:{home:null,away:null,homeConfirmed:true,awayConfirmed:true,homeAbsences:[],awayAbsences:[{name:"Pemain Satu",status:"Tidak tercantum di XI/cadangan"},{name:"Pemain Dua",status:"Tidak tercantum di XI/cadangan"},{name:"Bench X",status:"Cadangan"}]}}});
let h=why(x);
assert(h.includes("Poisson-gol (60%): 88/8/4")&&h.includes("Poisson-xG (25%): 84/10/6")&&h.includes("Elo (15%): 65/18/18"),"tiga baris komponen");
assert(h.includes("Hasil gabungan</b>: 81/10/9"));
assert(h.includes("FC Bayern München xG rata-rata 2,91 per laga (6 laga), 1. FC Köln kebobolan xG rata-rata 2,10 per laga (6 laga)"),"angka xG mentah");
assert(h.includes("pertahanannya mungkin lebih rapuh"),"Köln xGA 2,10 vs 1,50 gol: rapuh");
assert(!/Bayern München \(0,9/.test(h),"Bayern xGA 0,9 < gol kebobolan: tidak ditandai rapuh");
assert(h.includes("2 pemain reguler 1. FC Köln (Pemain Satu, Pemain Dua) tidak masuk line-up terkonfirmasi")&&h.includes("bukan konfirmasi cedera"),"catatan skuad hanya yang tidak tercantum, bukan cadangan");
assert(!h.includes("gabungan 70/30"),"kalimat usang hilang");
assert(h.includes("Pembanding V10 penuh"));
console.log("OK A. xG aktif: 3 komponen, angka xG, rapuh, catatan skuad");
// B. xG kurang data
x=base({engine:"V10-ringkas",lite:lite({xgOn:false,components:{poisson:[88,8,4],elo:[65,18,18]},weights:{poisson:70,elo:30},reason:"xG belum cukup data (2 laga tuan rumah dan 6 laga tamu berdata xG, minimal 3); prediksi memakai gol + Elo saja."})});
h=why(x);assert(h.includes("Poisson-gol (70%)")&&h.includes("Elo (30%)")&&!h.includes("Poisson-xG")&&h.includes("xG belum cukup data (2 laga tuan rumah")&&h.includes("gol + Elo saja"));
console.log("OK B. xG kurang data: 70/30 dan kalimat otomatis");
// C. tanpa PitchAPI (v9 biasa): tetap ada rincian 70/30 + kalimat xG tidak tersedia
x=base();h=why(x);assert(h.includes("Poisson-gol (70%): 88/8/4")&&h.includes("Elo (30%): 65/18/18")&&h.includes("xG belum tersedia untuk laga ini; prediksi memakai gol + Elo saja."));
console.log("OK C. laga tanpa PitchAPI: 70/30 + kalimat xG tidak tersedia");
// D. tanpa raw/pe sama sekali (data lama): tidak error, tidak ada daftar
x=base({raw:undefined,pe:undefined});h=why(x);assert(!h.includes("cmp")&&h.includes("Kenapa"));
// E. tampilan utama V10 penuh: catatan
x=base({engine:"V10",h:70,lite:lite()});h=why(x);assert(h.includes("tampilan utama memakai V10 penuh")&&h.includes("Hasil gabungan</b>: 81/10/9"));
console.log("OK D/E. data lama aman; mode V10 penuh diberi catatan");
// F. kartu Evaluasi
const m=(n,a,b,l)=>({n,acc:a,brier:b,ll:l,roi:null,bets:0,profit:null});
let ev=v10Comparison({n:9,simulation:{odds:2,minProbability:55},versions:{v8:{...m(9,50,.4,1),label:"V8"},v9:{...m(9,55,.35,.9),label:"V9"},v10:{...m(9,56,.34,.88,),label:"V10 penuh"},lite:{...m(9,57,.33,.87),label:"V10-ringkas (gol 60 + xG 25 + Elo 15)"}},xgSubset:{n:9,minGames:3,v9:m(9,55,.35,.9),lite:m(9,57,.33,.87),v10:m(9,56,.34,.88)}});
assert(ev.includes("V10-ringkas")&&ev.includes("Hanya laga saat xG aktif (9 laga)")&&ev.includes("Sampel masih kecil"));
ev=v10Comparison({n:9,versions:{v9:m(9,55,.35,.9),lite:m(9,57,.33,.87)},xgSubset:{n:0,minGames:3}});assert(ev.includes("Komponen xG belum aktif"));
ev=v10Comparison({n:9,versions:{v9:m(9,55,.35,.9)}});assert(ev.includes("belum aktif"),"tanpa xgSubset: aman");
console.log("OK F. Evaluasi: baris ringkas, subset xG, peringatan sampel kecil");
console.log("render ok");
