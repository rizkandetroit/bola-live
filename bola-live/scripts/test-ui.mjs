// Tes tampilan: narasi "Kenapa X?" (komponen, xG, catatan skuad) dan tabel Evaluasi, dijalankan dengan data tiruan tanpa browser.
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
const html=readFileSync(new URL("../site/index.html",import.meta.url),"utf8");
const js=html.match(/<script>([\s\S]*?)<\/script>/g).pop().replace(/<\/?script>/g,"");
const pre=js.slice(0,js.indexOf('nav("j");load();'));
globalThis.document={querySelector:()=>({addEventListener:()=>{},innerHTML:"",value:""}),addEventListener:()=>{},documentElement:{dataset:{}},querySelectorAll:()=>[]};
globalThis.localStorage={getItem:()=>null,setItem:()=>{}};globalThis.window=globalThis;
const {why,compHtml,v10Comparison,tierTag,card,row,conflict,fresh,liveRows,klTable,setD}=new Function(pre+";return {why,compHtml,v10Comparison,tierTag,card,row,conflict,fresh,liveRows,klTable,setD:function(d){D=d}}")();
// V13.2: klasemen live
{const U="2026-11-19T12:00:00Z",T=h=>new Date(Date.parse(U)+h*36e5).toISOString();
 const R=(id,pos,pts,gf,ga,live)=>({team_id:id,team_name:"T"+id,position:pos,played:10,won:Math.floor(pts/3),drawn:pts%3,lost:10-Math.floor(pts/3)-pts%3,gf,ga,gd:gf-ga,pts,form:"",zone:null,live:!!live});
 const rows=[R(1,1,30,25,10),R(2,2,28,20,12),R(3,3,27,22,15,true),R(4,4,20,12,18)];
 const zones=[{from:1,to:1,label:"Juara",type:"qualification"},{from:4,to:4,label:"Degradasi",type:"relegation"}];
 const m=(eid,st,u,h,a,sc,extra)=>({eid,lid:7,status:st,utc:u,hid:h,aid:a,score:sc,home:{name:"T"+h},away:{name:"T"+a},...extra});
 setD({matches:[
   m(1,"LIVE",T(1),3,4,[2,0],{min:63}),          // C sedang live (live:true di data) -> dihitung
   m(2,"FT",T(2),2,1,[1,0]),                      // kickoff sesudah data diambil -> dihitung
   m(3,"FT",T(-30),1,4,[3,0]),                    // sudah terhitung di data resmi -> TIDAK dihitung lagi
   m(4,"LIVE",T(3),1,2,[null,null],{pend:1}),     // skor belum ada -> dilewati
   m(5,"LIVE",T(1),9,9,[1,1],{lid:8})]});          // liga lain -> dilewati
 const q=liveRows(rows,{id:7,updated:U},zones);
 assert(q&&q.nl===1&&q.nf===1,"1 live + 1 selesai");
 const g=id=>q.rows.find(r=>r.team_id===id);
 assert.equal(g(2).pts,31);assert.equal(g(2).position,1);assert.equal(g(2).mv,1);assert.equal(g(2).dp,3);
 assert.equal(g(3).pts,30);assert.equal(g(3).played,11);assert.equal(g(3).gf,24);assert.equal(g(3).lv.s,"2-0");assert.equal(g(3).lv.min,63);
 assert.equal(g(1).pts,30);assert.equal(g(1).played,11,"laga 3 tidak boleh dihitung dua kali; hanya laga 2");
 assert(g(1).position===2&&g(3).position===3,"sama 30 poin: A (selisih +14) di atas C (+9)");assert.equal(g(3).mv,0);assert.equal(g(1).mv,-1);
 assert.equal(g(4).pts,20);assert.equal(g(4).lv.s,"0-2");assert.equal(g(4).zone.label,"Degradasi");
 assert.equal(q.rows[0].zone.label,"Juara");
 assert.equal(rows[0].pts,30,"data asli tidak boleh berubah");
 const html=klTable(q.rows);assert(html.includes("▲1")&&html.includes("2-0")&&html.includes("1-0 FT")&&html.includes("+3"));
 // tanpa laga live/baru -> null (tabel resmi apa adanya)
 setD({matches:[m(3,"FT",T(-30),1,4,[3,0])]});assert.equal(liveRows(rows,{id:7,updated:U},zones),null);
 // Liga Indonesia: id "hl", hanya laga live
 const hr=[{...R("hl11",1,10,8,3)},{...R("hl12",2,9,7,4)}];
 setD({matches:[{...m(9,"LIVE",T(1),12,11,[1,0]),lid:"hl5"},{...m(10,"FT",T(2),11,12,[0,2]),lid:"hl5"}]});
 const qh=liveRows(hr,{id:"hl5",updated:U},null);
 assert(qh&&qh.nl===1&&qh.nf===0);assert.equal(qh.rows[0].team_id,"hl12");assert.equal(qh.rows[0].pts,12);
 console.log("OK V13.2 klasemen live: live + baru selesai dihitung, tidak dobel, urutan & zona ikut, Liga Indonesia live saja")}
// V13.1: "Akan Tayang" hanya laga yang belum mulai
{const N=Date.parse("2026-11-19T12:00:00Z"),m=(id,st,u)=>({id,status:st,utc:u,score:[null,null]});
 const r=fresh([m("a","NS","2026-11-19T13:00:00Z"),m("b","NS","2026-11-19T11:00:00Z"),m("c","NS","2026-11-19T08:30:00Z"),m("d","FT","2026-11-17T16:00:00Z"),m("e","LIVE","2026-11-19T11:30:00Z")],N);
 const g=id=>r.find(x=>x.id===id);
 assert.equal(g("a").status,"NS","belum mulai tetap Akan Tayang");
 assert.equal(g("b").status,"LIVE");assert.equal(g("b").pend,1,"jam mulai lewat 1 jam -> Live (baru mulai)");
 assert(!g("c"),"lewat 3,5 jam tanpa pembaruan -> disembunyikan");
 assert.equal(g("d").status,"FT");assert.equal(g("e").status,"LIVE");
 assert(!r.some(x=>x.status==="NS"&&Date.parse(x.utc)<=N),"tidak ada laga yang sudah lewat jam di Akan Tayang");
 console.log("OK V13.1 Akan Tayang hanya laga belum mulai")}
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
// G. tingkat 3 (Elo saja) dan tingkat 4 (tebakan dasar): label, penjelasan, tanpa "#0, 0 poin" dan tanpa tabel kosong
const zs=(n,el)=>({name:n,pos:0,pts:0,gp:0,gf:null,ga:null,w:0,d:0,l:0,sp:null,elo:el,f:null});
let t3={id:"t3",league:"Piala X",utc:new Date().toISOString(),status:"NS",score:[null,null],home:zs("Aaa",1540),away:zs("Bbb",1480),pick:"h",edge:12,level:"Sedang",est:true,tier:3,
 note:"Perkiraan kasar dari peringkat Elo lintas liga.",p:{h:46,d:28,a:26,pe:{h:50,d:27,a:23},el:[1540,1480],gp:[9,7],fr:[45,26,29],engine:"elo"}};
let t4={...t3,id:"t4",tier:4,edge:0,level:"Tipis",home:zs("Ccc",null),away:zs("Ddd",null),note:"tebakan dasar",p:{h:45,d:28,a:27,pe:{h:45,d:28,a:27},el:[null,null],gp:[0,0],fr:[45,26,29],engine:"dasar"}};
assert(tierTag(t3).includes("Elo saja")&&tierTag(t4).includes("Tebakan dasar")&&tierTag({tier:2,est:true}).includes("Statistik dasar")&&tierTag(base()).includes("Model penuh"));
for(const t of [t3,t4]){const c=card(t),r=row(t),w=why(t);
 assert(c.includes("Aaa")||c.includes("Ccc"));assert(!c.includes("#0")&&!r.includes("#0"),"tanpa #0 poin");
 assert(w.includes("Tentang prediksi ini")&&!w.includes("<table"),"penjelasan singkat tanpa tabel kosong");assert(c.includes("tag l1"))}
console.log("OK G. tingkat 3 dan 4: label, penjelasan singkat, tanpa data klasemen palsu");
// H. kasus nyata Villarreal 0-6 PSG (data.json 13 Nov): laga selesai tidak menampilkan klasemen sesudah laga, dan pilihan yang berlawanan dengan indikator ditandai
const vil={id:"575382",league:"Champions League",utc:"2026-11-03T20:00:00Z",status:"FT",score:[0,6],
 home:{name:"Villarreal",pos:28,pts:3,gp:4,gf:8,ga:14,w:1,d:0,l:3,sp:null,elo:1496,f:{l5:"KMK",t:{w:1,d:0,l:2,gf:8,ga:8,cs:0,n:3},v:{w:1,d:0,l:0,gf:3,ga:1,cs:0,n:1}}},
 away:{name:"Paris Saint-Germain",pos:1,pts:12,gp:4,gf:20,ga:5,w:4,d:0,l:0,sp:null,elo:1546,f:{l5:"MMM",t:{w:3,d:0,l:0,gf:14,ga:5,cs:0,n:3},v:{w:1,d:0,l:0,gf:4,ga:2,cs:0,n:1}}},
 p:{h:44.1,d:19,a:36.9,xg:[2.82,2.72],ms:[2,2,5.8],sc5:[[2,2,5.8]],ou:91.4,bt:87.8,fr:[58,11.7,30.3],pe:{h:38.6,d:27.1,a:34.3},el:[1496,1546],gp:[3,3],raw:{h:42.9,d:17.3,a:39.8}},pick:"h",edge:7.2,level:"Tipis"};
const wv=why(vil),cv=card(vil);
assert(!wv.includes("Posisi klasemen")&&!wv.includes("Poin per laga")&&!wv.includes("Gol dicetak per laga"),"laga selesai: tanpa baris klasemen sesudah laga");
assert(wv.includes("Form 5 laga")&&wv.includes("Elo (perkiraan)"),"indikator sebelum laga tetap tampil");
assert(wv.includes("berlawanan dengan sebagian besar indikator")&&wv.includes("tidak ditampilkan untuk laga selesai"));
assert(cv.includes("indikator berlawanan")&&cv.includes("kini #28")&&cv.includes("kini #1,"),"kartu: tag berlawanan dan label klasemen kini");
const ns=base();assert(!card(ns).includes("indikator berlawanan")&&!card(ns).includes("kini #")&&why(ns).includes("Posisi klasemen"),"laga belum main: tidak berubah");
console.log("OK H. Villarreal 0-6 PSG: klasemen sesudah laga disembunyikan, pilihan berlawanan ditandai");
// F. kartu Evaluasi
const m=(n,a,b,l)=>({n,acc:a,brier:b,ll:l,roi:null,bets:0,profit:null});
let ev=v10Comparison({n:9,simulation:{odds:2,minProbability:55},versions:{v8:{...m(9,50,.4,1),label:"V8"},v9:{...m(9,55,.35,.9),label:"V9"},v10:{...m(9,56,.34,.88,),label:"V10 penuh"},lite:{...m(9,57,.33,.87),label:"V10-ringkas (gol 60 + xG 25 + Elo 15)"}},xgSubset:{n:9,minGames:3,v9:m(9,55,.35,.9),lite:m(9,57,.33,.87),v10:m(9,56,.34,.88)}});
assert(ev.includes("V10-ringkas")&&ev.includes("Hanya laga saat xG aktif (9 laga)")&&ev.includes("Sampel masih kecil"));
ev=v10Comparison({n:9,versions:{v9:m(9,55,.35,.9),lite:m(9,57,.33,.87)},xgSubset:{n:0,minGames:3}});assert(ev.includes("Komponen xG belum aktif"));
ev=v10Comparison({n:9,versions:{v9:m(9,55,.35,.9)}});assert(ev.includes("belum aktif"),"tanpa xgSubset: aman");
console.log("OK F. Evaluasi: baris ringkas, subset xG, peringatan sampel kecil");
// V19 (audit): tabel bookmaker membaca format ringkas & format mentah BSD; mode netral; link cuplikan hanya http(s)
{const F=new Function(pre+";return {cmpTable,valTag,valBox,setN:function(v){NEUTRAL=v}}")();
 const t1=F.cmpTable({"1X2":{betano:{"Tuan rumah":2.1,"Seri":3.3,"Tamu":3.6},bwin:{"Tuan rumah":2.05}}});
 assert(t1.includes("betano")&&t1.includes("bwin")&&t1.includes("Tuan rumah")&&t1.includes("2.10")||t1.includes("2,10"),t1.slice(0,300));
 assert(t1.indexOf("Tuan rumah")<t1.indexOf("Seri")&&t1.indexOf("Seri")<t1.indexOf("Tamu"),"urutan kolom 1-X-2");
 const t2=F.cmpTable({btts:{yes:{outcome:"yes",outcome_name:"Yes",best_odds:1.67,bookmakers:{betano:{decimal_odds:1.6,movement:"X"},unibet:{decimal_odds:1.58}}},no:{outcome_name:"No",bookmakers:{betano:{decimal_odds:2.2}}}}});
 assert(t2.includes("betano")&&t2.includes("unibet")&&!t2.includes("best_odds"),"format mentah: baris = bookmaker, bukan best_odds");
 const x={p:{h:60,d:25,a:15},odds:{h:{o:2.2,b:"bk"}},home:{name:"A"},away:{name:"B"}};
 assert(F.valTag(x).includes("Value")&&F.valBox(x).includes("Value"));F.setN(1);assert.equal(F.valTag(x),"");assert.equal(F.valBox(x),"")}
{const F=new Function(pre+";NEUTRAL=1;return {oddLine,pinLine}")();assert.equal(F.oddLine({odds:{h:{o:2,b:"x"}}}),"");assert.equal(F.pinLine({status:"NS"}),"")}
assert(/if\(NEUTRAL\)\{tabs=tabs\.filter/.test(js),"tab Odds disembunyikan saat netral");
assert(!/fetch\([^)]*Date\.now\(\)/.test(js),"tidak ada lagi unduhan dengan ?Date.now() (pakai revalidasi 304)");
assert(html.includes('http-equiv="Content-Security-Policy"'));
console.log("OK G. Bookmaker, mode netral, unduhan hemat, CSP");
console.log("render ok");
