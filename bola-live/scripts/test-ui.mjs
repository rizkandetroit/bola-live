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
// V21: angka utama dari peluang koreksi bila aktif, label keyakinan, alasan
{const F=new Function(pre+";return {dp,pkD,cfTag,whyLine,pb}")();const x={status:"NS",level:"Kuat",edge:20,pick:"h",home:{name:"A"},away:{name:"B"},p:{h:50,d:25,a:25},sk:{h:30,d:28,a:42,u:1},cf:{k:"terbuka",hit:41.5,n:400},why:["Klasemen menipu: <A>"]};
 assert.equal(F.dp(x),x.sk);assert.equal(F.pkD(x).name,"B");assert(F.pb(x).includes("Gabungan")&&F.pb(x).includes("42%"));assert(F.cfTag(x).includes("Terbuka · 42% menang"));assert.equal(F.cfTag({...x,cf:{...x.cf,k:"jelas"}}).includes("Unggul jelas · 42% menang"),true,"bukan Favorit jelas lagi");
 assert(F.whyLine(x).includes("&lt;A&gt;"),"alasan di-escape");const y={...x,sk:{...x.sk,u:0}};assert.equal(F.dp(y),x.p);assert(!F.pb(y).includes("Gabungan"));
 assert(F.cfTag({...x,cf:null}).includes(">Terbuka<")&&!F.cfTag({...x,cf:null}).includes("Kuat 20"),"tanpa label: dari peluang, tanpa angka mentah")}
// V22c: seri peluang tertinggi -> kartu menulis "Berimbang: seri paling mungkin", bukan "Condong ke <tim>"
{const F=new Function(pre+";return {drawTop}")(),mk=(p,sk)=>({status:"NS",level:"Tipis",edge:9,pick:"h",home:{name:"Alpha"},away:{name:"Beta"},p,sk,league:"L",utc:"2026-11-22T12:00:00Z",eid:5,id:5});
 const a=mk({h:34.8,d:40.3,a:25}),b=mk({h:45,d:30,a:25}),c=mk({h:45,d:30,a:25},{h:30,d:41,a:29,u:1}),e=mk({h:40,d:40,a:20});
 assert.equal(F.drawTop(a),true);assert.equal(F.drawTop(b),false);assert.equal(F.drawTop(c),true,"ikut angka Gabungan bila aktif");assert.equal(F.drawTop(e),false,"seri sama besar: tetap condong");
 assert.equal(F.drawTop({...c,sk:{...c.sk,u:0}}),false,"Gabungan belum lolos: pakai BSD");assert.equal(F.drawTop(mk({h:null,d:null,a:null})),false);
 const ca=card(a),cb=card(b);assert(ca.includes("Berimbang: <b>seri</b> paling mungkin")&&!ca.includes("Condong ke <b>"),"kartu seri");assert(cb.includes("Condong ke <b title=\"Alpha\">Alpha</b>"),"kartu biasa tetap")}
// V22: rekap harian & akurasi Model BL per liga di kartu
{const F=new Function(pre+";return {rekapHtml,btLine,set:function(b,m){BT=b;MBL=m}}")();
 const h=F.rekapHtml({days:[{d:"2026-11-21",bsd:[9,5],bl:[9,4],sk:[0,0],lg:[["Eerste Divisie",9,5,9,4,0,0]],m:[["Eerste Divisie","Heracles","Jong <PSV>",2,1,0,0,null]]}]});
 assert(h.includes("Sabtu, 21 Nov")&&h.includes("BSD 56% (5/9)")&&h.includes("Model BL 44% (4/9)")&&h.includes("Jong &lt;PSV&gt;")&&h.includes("✅")&&!h.includes("Gabungan benar"),h.slice(0,400));
 F.set({days:90,byLeague:{"K League 1":{n:44,acc:40.9}}},{blLg:{"77":[40,42,47.5]}});const b=F.btLine({src:"BSD",league:"K League 1",lid:77});
 assert(b.includes("BSD <b>40,9%</b>")&&b.includes("Model BL <b>47,5%</b>")&&b.includes("BSD sering meleset"),b)}
{const F=new Function(pre+";NEUTRAL=1;return {oddLine,pinLine}")();assert.equal(F.oddLine({odds:{h:{o:2,b:"x"}}}),"");assert.equal(F.pinLine({status:"NS"}),"")}
assert(/if\(NEUTRAL\)\{tabs=tabs\.filter/.test(js),"tab Odds disembunyikan saat netral");
assert(!/fetch\([^)]*Date\.now\(\)/.test(js),"tidak ada lagi unduhan dengan ?Date.now() (pakai revalidasi 304)");
assert(html.includes('http-equiv="Content-Security-Policy"'));
console.log("OK G. Bookmaker, mode netral, unduhan hemat, CSP");
console.log("render ok");
// V22d: label "menunggu data", jumlah pemain inti di baris Absen, statistik beda arah di Evaluasi
{const F=new Function(pre+";return {fresh,stt,absLine,mblHtml}")(),N=Date.parse("2026-11-21T12:00:00Z"),m=(id,u)=>({id,status:"NS",utc:u,score:[null,null],home:{name:"A"},away:{name:"B"}});
 const r=F.fresh([m("a","2026-11-21T11:50:00Z"),m("b","2026-11-21T11:00:00Z")],N),g=id=>r.find(x=>x.id===id);
 assert.equal(g("a").pend,1);assert.equal(g("a").pendLate,0);assert(F.stt(g("a")).includes("baru mulai"));
 assert.equal(g("b").pendLate,1);assert(F.stt(g("b")).includes("menunggu data")&&!F.stt(g("b")).includes("baru mulai"),"lewat 20 menit tanpa data");
 const x={status:"NS",home:{name:"Lorient"},away:{name:"Rennes"},ab:{h:[["B. Fadiga","i"],["I. Baldé","i"],["S. Touré","i"],["P. Katseris","i"]],a:[["P. Frankowski","i"]],nh:4,na:1},bl:{k:[2,0],src:"abs"}};
 const L=F.absLine(x);assert(L.includes("<b>Lorient</b> 4, <b class=\"ki\">2 inti</b> (B. Fadiga, I. Baldé, …)"),L);assert(L.includes("<b>Rennes</b> 1 (P. Frankowski)")&&!L.includes("0 inti"),L);
 assert(F.absLine({...x,bl:{k:[2,1],src:"xi"}}).includes("2 inti tak main"),"line-up resmi");
 {const z=F.absLine({...x,ab:{...x.ab,a:[],na:0},bl:{k:[2,1],src:"xi"}});assert(z.includes("<b>Rennes</b> <b class=\"ki\">1 inti tak main</b>")&&!z.includes("Rennes</b> 0"),"tanpa pemain absen: tidak menulis 0 → "+z)}assert(!F.absLine({...x,bl:null}).includes("inti</b>"),"tanpa Model BL: seperti biasa");
 const M={updated:"2026-11-22T00:00:00Z",temp:1,xgCov:40,cfg:{xga:.7},hfa:.18,rest:{own:0,opp:0},cov:{nXr:0,gA:0,gD:0,nZv:10},xrHist:0,core:{own:.035,opp:.025},w:1,useful:false,
   bt:{days:90,joined:4107,bsd:{acc:53.5,brier:.58,ll:.973},modelJ:{acc:51,brier:.6,ll:.998}},dis:{n:820,of:4107,bsd:330,bl:300,none:190,bl50:{n:200,bsd:70,bl:95}}};
 const h=F.mblHtml(M,null);assert(h.includes("berbeda arah</b> (820 dari 4.107 laga uji mundur): BSD benar <b>40,2%</b>, Model BL benar <b>36,6%</b>, keduanya salah 23,2%"),h.slice(h.indexOf("berbeda"),h.indexOf("berbeda")+260));
 assert(h.includes("BL benar 47,5%, BSD 35,0% (200 laga)"));assert(h.includes("dimatikan sementara"),"catatan line-up dimatikan");
 assert(!F.mblHtml({...M,dis:null},null).includes("berbeda arah"));
 console.log("OK V22d: menunggu data, pemain inti absen, beda arah")}
// V24: bedah meleset di Evaluasi
{const F=new Function(pre+";return {missHtml}")(),Z=(n,miss,draw,c)=>({n,miss,draw,c:Object.assign({apes:0,merah:0,telat:0,tipis:0,salah:0,nodata:0},c)});
 const h=F.missHtml({days:30,bsd:Z(100,55,20,{apes:12,merah:3,telat:4,tipis:15,salah:11,nodata:10}),bl:Z(90,50,18,{apes:10,salah:14,tipis:16,nodata:10})});
 assert(h.includes("Bedah meleset")&&h.includes("<b>Kurang beruntung</b>")&&h.includes("12 <small>(22%)</small>")&&h.includes("BSD meleset 55 dari 100 laga, Model BL 50 dari 90")&&h.includes("36% tebakan BSD"),h.slice(0,600));
 assert.equal(F.missHtml(null),"");assert.equal(F.missHtml({days:30,bsd:Z(10,0,0,{})}),"");
 console.log("OK V24: bedah meleset")}
// V24b: uji coba di Evaluasi
{const F=new Function(pre+";return {mblHtml}")();const M={updated:"2026-11-22T00:00:00Z",temp:1,xgCov:40,cfg:{xga:.7},hfa:.18,rest:{own:0,opp:0},cov:{nXr:0,gA:0,gD:0},xrHist:0,core:{own:.035,opp:.025},w:1,useful:false,
   bt:{days:90,joined:4107,bsd:{acc:53.5,brier:.58,ll:.973},modelJ:{acc:51,brier:.6,ll:.998}},exp:{youth:{n:180,of:4107,accB:44.4,accL:41.1,accBo:53.9,accLo:51.4,T:1.2,gain:.006,hold:{n:90,ll1:1.05,llT:1.044}},draw:{th:40,dm:31,gain:.5,hold:{n:2053,base:54.1,rule:54.6,nDraw:31}}}};
 const h=F.mblHtml(M,null);assert(h.includes("Uji coba (belum dipakai)")&&h.includes("Tim muda/cadangan")&&h.includes("BSD tepat 44,4% (laga lain 53,9%)")&&h.includes("memperbaiki log loss")&&h.includes("akurasi 54,1% → 54,6%"),h.slice(h.indexOf("Uji coba"),h.indexOf("Uji coba")+700));
 const h2=F.mblHtml({...M,exp:{youth:{n:0},draw:{th:null,dm:null,gain:0,hold:{n:2000,base:54,rule:54,nDraw:0}}}},null);assert(h2.includes("model tetap tidak menebak seri"));
 console.log("OK V24b: uji coba")}
// V24b: kartu ringkas di HP — nama pendek, line-up bahasa sederhana, rincian dilipat
{const F=new Function(pre+";return {shortNm,blWhy,blLine,cardDet,card,set:function(b,m){BT=b;MBL=m}}")();
 assert.equal(F.shortNm("Arsenal"),"Arsenal");assert.equal(F.shortNm("Gwangju FC"),"Gwangju FC","pendek: tidak diubah");
 assert.equal(F.shortNm("Club Tigres de la UANL"),"Tigres UANL");assert.equal(F.shortNm("Real Sociedad de Fútbol"),"Real Sociedad");assert.equal(F.shortNm("Sporting Clube de Braga"),"Sporting Braga");assert.equal(F.shortNm("Racing Club de Avellaneda"),"Avellaneda");
 assert.equal(F.shortNm("Olympique Lyonnais Groupe"),"Lyonnais Groupe");assert.equal(F.shortNm("Bucheon FC 1995"),"Bucheon FC 1995");
 assert.equal(F.shortNm("Borussia Mönchengladbach"),"Borussia Mönchengladbach","tanpa kata umum: tetap utuh");
 const x={id:9,eid:9,status:"NS",level:"Tipis",edge:9,pick:"h",league:"Liga MX",utc:"2026-11-22T12:00:00Z",src:"BSD",home:{name:"Club Tigres de la UANL"},away:{name:"Club América"},p:{h:50,d:25,a:25},
  bl:{h:48,d:27,a:25,xg:[1.4,1],ms:[1,0],ou:45,bt:44,lu:[.82,.95,1,1],mi:[["Gignac","Brunetta"],[]],src:"xi"},ab:{h:[["Gignac","i"]],a:[],nh:1,na:0}};
 const w=F.blWhy(x);assert(w.includes("Line-up <b>Tigres UANL</b>: serangan melemah, pertahanan biasa · tanpa Gignac, Brunetta"),w);assert(w.includes("serang 82%, bertahan 95%"),"persen tetap di title");
 assert(!w.includes("Club América"),"tim lengkap tidak ditulis");assert(!F.blLine(x).includes("Line-up"),"baris Model BL tidak memuat line-up lagi");
 assert(F.blWhy({...x,bl:{...x.bl,lu:[1.15,.85,1,1]}}).includes("serangan lebih kuat, pertahanan melemah"));
 F.set({days:90,byLeague:{"Liga MX":{n:60,acc:52}}},null);
 const c=F.card(x),d=c.indexOf('<details class="cdt"');assert(d>0,"ada Detail");
 assert(c.indexOf("Akurasi liga ini")>d&&c.indexOf("Line-up <b>")>d&&c.indexOf("Gignac (")>d,"line-up, absen, akurasi di dalam Detail");
 assert(c.includes(", line-up, absen, akurasi liga)")&&c.includes("(data "),"ringkasan isi Detail");assert(c.indexOf("Model BL:")<d,"Model BL tetap terlihat");
 assert(c.includes('Condong ke <b title="Club Tigres de la UANL">Tigres UANL</b>'),"nama pendek + title");
 {const d0=F.cardDet({...x,bl:null,ab:null,src:"HL",p:{h:50,d:25,a:25}});assert(d0.includes("(data ")&&!d0.includes("line-up,"),"tanpa rincian: hanya kelengkapan data")}}
console.log("test-ui V24b ok");
// V24c: periode catatan langsung ditulis apa adanya, bukan "30 hari terakhir"
{const F=new Function(pre+";return {missHtml,bsdEvalHtml,spanTxt,spanDays,setBT:function(b){BT=b}}")();
 assert.equal(F.spanTxt("2026-11-20T10:00:00Z","2026-11-22T01:00:00Z"),"20–22 Nov");assert.equal(F.spanTxt("2026-10-30T10:00:00Z","2026-11-02T01:00:00Z"),"30 Okt – 2 Nov");
 assert.equal(F.spanTxt("2026-11-20T17:00:00Z","2026-11-20T18:00:00Z"),"21 Nov","pakai tanggal WITA");assert.equal(F.spanDays("2026-11-20T10:00:00Z","2026-11-22T01:00:00Z"),3,"hari kalender WITA");
 F.setBT({n:4354,days:90});const Z={apes:1,merah:0,telat:0,tipis:0,salah:1,nodata:0};
 const h=F.missHtml({days:30,from:"2026-11-20T10:00:00Z",to:"2026-11-22T03:00:00Z",bsd:{n:311,miss:2,draw:1,c:Z},bl:null});
 assert(h.includes("Bedah meleset <small>20–22 Nov · 311 laga</small>")&&!h.includes("30 hari terakhir"),h.slice(0,200));assert(h.includes("Catatan langsung baru 3 hari")&&h.includes("uji mundur 90 hari (4.354 laga)"),"catatan muda");
 const o=F.missHtml({days:30,from:"2026-10-01T10:00:00Z",to:"2026-11-22T03:00:00Z",bsd:{n:900,miss:2,draw:1,c:Z},bl:null});assert(o.includes("30 hari terakhir")&&!o.includes("Catatan langsung baru"),"catatan sudah panjang");
 const l=F.missHtml({days:30,bsd:{n:5,miss:2,draw:1,c:Z},bl:null});assert(l.includes("30 hari terakhir"),"data lama tanpa rentang tetap jalan");
 const e=F.bsdEvalHtml({updated:"2026-11-22T04:50:00Z",n:311,pending:5,acc:45,homeAcc:38.6,brier:.64,calib:[],span:{from:"2026-11-20T10:00:00Z",to:"2026-11-22T03:00:00Z"}});
 assert(e.includes("311 laga dinilai (20–22 Nov)")&&e.includes("Catatan langsung baru 3 hari"),e.slice(0,300))}
console.log("test-ui V24c ok");
// V25: tab Favorit
{const F=new Function(pre+";return {favOf,stOk,favLine,favHead,favRaporHtml,favPrev,card,setS:function(o){Object.assign(S,o)},set:function(b,e){BT=b;EV=e}}")();
 const fut=new Date(Date.now()+36e5).toISOString(),past=new Date(Date.now()-36e5).toISOString();
 const BL={h:80,d:12,a:8,xg:[2,.6],ms:[2,0],ou:60,bt:40},mk=(p,o)=>({id:1,eid:1,status:"NS",utc:fut,league:"L",level:"Kuat",edge:20,pick:"h",home:{name:"FC Twente"},away:{name:"Willem II Tilburg"},p:{xg:[2.1,.7],...p},bl:BL,odds:{h:{o:1.2}},...o});
 const a=mk({h:88,d:8,a:4}),b=mk({h:10,d:12,a:78}),c=mk({h:50,d:25,a:25});
 assert.equal(F.favOf(mk({h:88,d:8,a:4,xg:null})),null,"tanpa xG BSD: tidak tampil");assert.equal(F.favOf(mk({h:88,d:8,a:4},{bl:null})),null,"tanpa Model BL");assert.equal(F.favOf(mk({h:88,d:8,a:4},{odds:null})),null,"tanpa harga pasar");assert.equal(F.favOf(mk({h:88,d:8,a:4},{odds:null,pin:{o:[1.2,6,12]}})).v,96,"Pinnacle saja cukup");
 assert.equal(F.favOf(a).v,96);assert.equal(F.favOf(b).s,2);assert.equal(F.favOf(b).t.name,"Willem II Tilburg");assert.equal(F.favOf(c),null,"75%: bukan favorit");assert.equal(F.favOf({...a,np:1}),null);
 F.setS({st:"FAV"});assert.equal(F.stOk(a),true);assert.equal(F.stOk(c),false);assert.equal(F.stOk({...a,status:"LIVE"}),false,"hanya yang belum main");assert.equal(F.stOk({...a,utc:past}),false,"kickoff lewat: keluar");
 const l=F.favLine(a);assert(l.includes('FC Twente</b> tidak kalah <b class="fv">96%</b>')&&l.includes("menang 88%")&&!l.includes("liga kecil"),l);
 assert(F.card(a).includes("tidak kalah"),"label di tab Favorit");F.setS({st:"NS"});assert.equal(F.stOk(c),true);assert(!F.card(a).includes("tidak kalah"),"tab lain: kartu tidak berubah");
 F.set({days:90,dc:{all:{n:1353,hit:89.1,avg:86.4}}},{dc:{all:{n:86,hit:81.4,avg:85.8}},rk:{days:[{d:"2026-11-22",fv:{n:3,hit:3,m:[]}},{d:"2026-11-21",fv:{n:20,hit:18,m:[["Eredivisie","Feyenoord","Excelsior",2,3,0,92,0],["NPFL","Bendel","Doma",0,1,0,80,1]]}}]}});
 const h=F.favHead([a,b],"2026-11-22");assert(h.includes("data lengkap")&&h.includes("2 laga belum main")&&h.includes("89%</b> dari 1.353 laga")&&h.includes("Kemarin: Favorit tidak kalah <b>18 dari 20</b> (90%)")&&h.includes('data-n="e"'),h);
 assert(!F.favHead([],"2026-11-24").includes("Kemarin"),"hari terakhir bukan kemarin: pakai tanggal");assert(F.favHead([],"2026-11-24").includes("22 Nov: Favorit"),"hari terakhir yang ada");
 const r=F.favRaporHtml({days:[{d:"2026-11-21",fv:{n:2,hit:1,m:[["Eredivisie","Feyenoord","Excelsior",2,3,0,92,0],["NPFL","Bendel","Doma",0,0,2,80,1]]}}]});
 assert(r.includes("Rapor Favorit")&&r.includes("tidak kalah 1/2 (50%)")&&r.includes("<b>Feyenoord</b> <small>kandang vs Excelsior")&&r.includes("❌")&&r.includes("<b>Doma</b> <small>tandang vs Bendel")&&r.includes("✅"),r);
 assert.equal(F.favRaporHtml({days:[{d:"x",fv:null}]}),"");assert.equal(F.favPrev("2026-11-22"),"2026-11-21")}
console.log("test-ui V25 ok");
// V26: nama liga versi Indonesia, tanda putri / tim muda
{const F=new Function(pre+";return {lgLabel,lgName,teamTag,card}")();
 assert.equal(F.lgLabel("Stoiximan Super League"),"Liga Yunani");assert.equal(F.lgLabel("Premier League","England"),"Liga Inggris");assert.equal(F.lgLabel("Liga 1 Indonesia"),"Liga 1 Indonesia","tidak dikenal: tetap");
 assert.equal(F.lgLabel("Super League","Switzerland"),"Liga Swiss");assert.equal(F.lgLabel("Conference League"),"Liga Konferensi Eropa");assert.equal(F.lgLabel("Liga F"),"Liga Spanyol Putri");
 assert.equal(F.lgName({league:"Trendyol 1. Lig",lc:"Turkey"}),'<span title="Trendyol 1. Lig">Liga 2 Turki</span> <span class="lc">Trendyol 1. Lig</span>');
 assert.equal(F.lgName({league:"Championship",lc:"England"}),'<span title="Championship">Divisi 2 Inggris (Championship)</span>',"nama resmi sudah di dalam label");
 assert.equal(F.lgName({league:"Liga 1 Indonesia",lc:""}),'<span title="Liga 1 Indonesia">Liga 1 Indonesia</span>');
 const T=(lg,n)=>F.teamTag({league:lg},{name:n});assert.equal(T("Liga F","Real Madrid"),"","nama liga sudah memuat Putri");assert(T("Serie C, Girone A","Juventus Next Gen U23").includes("Tim muda"));
 assert(T("Segunda División","Real Sociedad B").includes("Tim muda"));assert.equal(T("Eredivisie","Willem II Tilburg"),"","Willem II = tim utama");assert.equal(T("Eerste Divisie","Jong Ajax").includes("Tim muda"),true);assert.equal(T("La Liga","Barcelona"),"")}
{const F=new Function(pre+";return {favRaporHtml,set:function(b,e){BT=b;EV=e}}")();F.set({days:90,dc:{all:{n:1353,hit:89.1,avg:86.4}}},{dc:{all:{n:86,hit:81.4,avg:85.8}},dcF:{all:{n:60,hit:85,avg:86}}});
 const r=F.favRaporHtml({days:[{d:"2026-11-21",fv:{n:1,hit:1,m:[["L","A","B",1,0,0,90,0]]}}]});assert(r.includes("Catatan langsung: 85% (60 laga")&&!r.includes("81%"),"rapor memakai data lengkap")}
{const F=new Function(pre+";return {lgLabel}")();assert.equal(F.lgLabel("Thai League 1"),"Liga Thailand");assert.equal(F.lgLabel("Malaysia Super League"),"Liga Malaysia");assert.equal(F.lgLabel("1st Division Denmark","Denmark"),"Liga 2 Denmark")}
console.log("test-ui V26 ok");
// V28: tampilan uji coba line-up tahap 2
{const F=new Function(pre+";return {mblHtml}")();
 const M={updated:"2026-11-22T00:00:00Z",temp:1,xgCov:40,cfg:{xga:.7},hfa:.18,rest:{own:0,opp:0},cov:{nXr:0,gA:0,gD:0},xrHist:0,core:{own:.035,opp:.025},w:1,useful:false,bt:{days:90,joined:4107,bsd:{acc:53.5,brier:.58,ll:.973},modelJ:{acc:51,brier:.6,ll:.998}},lu2:{n:1200,feat:1500,bsd:{n:600,ll0:.98,ll1:.975,gain:.005,acc0:53,acc1:54,pass:true},bl:{n:600,ll0:1,ll1:.999,gain:.001,acc0:51,acc1:51,pass:false}}};
 let h="";try{h=F.mblHtml(M,null)}catch(e){h=String(e)}
 assert(h.includes("Koreksi line-up tahap 2")&&h.includes("1.200 laga")&&h.includes("(lolos)")&&h.includes("(belum lolos)"),h.slice(0,400))}
console.log("test-ui V28 ok");
// V29: RPS per kelompok, pembanding pasar, kelengkapan data
{const F=new Function(pre+";return {segHtml,mktHtml,dataQ,dqLine,cardDet,set:function(b){BT=b}}")();
 const S={top5:{n:400,acc:55,rps:.19},piala:{n:60,acc:48,rps:.22},lain:{n:900,acc:51,rps:.2},putri:{n:5,acc:60,rps:.1}};
 const h=F.segHtml(S,"uji mundur");assert(h.includes("5 liga top Eropa")&&h.includes("Piala domestik")&&!h.includes("Liga putri")&&h.includes("0,190"),h);assert.equal(F.segHtml({lain:S.lain},"x"),"");
 assert(F.mktHtml({n:300,acc:49,rps:.2,bsdRps:.199,bsdAcc:50}).includes("BSD setara atau lebih tajam"));assert.equal(F.mktHtml(null),"");
 F.set({byLeague:{L:{n:40}}});const x={league:"L",src:"BSD",status:"NS",p:{h:50,d:25,a:25,xg:[1,1]},bl:{h:1,d:1,a:1,src:"xi"},odds:{h:{o:2}},home:{name:"A"},away:{name:"B"}};
 assert.equal(F.dataQ(x).n,5);assert.equal(F.dataQ({...x,odds:null,bl:null,p:{h:1,d:1,a:1,xg:null}}).n,1);
 const d=F.cardDet(x);assert(d.includes("data 5/5")&&d.includes("Kelengkapan data: <b>5/5</b>"),d.slice(0,300))}
console.log("test-ui V29 ok");
{const F=new Function(pre+";return {drawRisk,set:function(m){MBL=m}}")();const x={status:"NS",p:{h:36,d:31,a:33},bl:{h:35,d:30,a:35},home:{name:"A"},away:{name:"B"}};
 F.set({drw:{rule:{th:40,dm:28,pass:true,test:{n:300,draw:36.1,base:26.4}}}});assert(F.drawRisk(x).includes("Rawan seri")&&F.drawRisk(x).includes("36,1%"));
 assert.equal(F.drawRisk({...x,p:{h:55,d:25,a:20}}),"","tidak berimbang");F.set({drw:{rule:{th:40,dm:28,pass:false,test:{}}}});assert.equal(F.drawRisk(x),"","belum lolos: tidak tampil")}
console.log("test-ui V30 ok");
{const F=new Function(pre+";return {mblHtml}")();const M={updated:"2026-11-22T00:00:00Z",temp:1,xgCov:40,cfg:{xga:.7},hfa:.18,rest:{own:0,opp:0},cov:{nXr:0,gA:0,gD:0},xrHist:0,core:{own:.035,opp:.025},w:1,useful:false,bt:{days:90,joined:4107,bsd:{acc:53.5,brier:.58,ll:.973},modelJ:{acc:51,brier:.6,ll:.998}},
  lu2:{n:50,note:"belum cukup laga",fac:{kiperCadangan:{n:40,win:20,bsd:35,gap:-15,se:6.3},kiperUtama:{n:900,win:45,bsd:44,gap:1,se:1.7},segar:{n:5,win:1,bsd:1,gap:0,se:1}}}};
 const h=F.mblHtml(M,null);assert(h.includes("Kiper cadangan turun")&&h.includes("-15 *")&&!h.includes("Starter rata-rata &lt; 60")&&!h.includes("< 60 menit"),h.slice(h.indexOf("Kondisi"),h.indexOf("Kondisi")+600))}
console.log("test-ui V31 ok");
{const F=new Function(pre+";return {cardDet,set:function(b){BT=b}}")();F.set({byLeague:{}});const x={id:5,league:"L",src:"BSD",p:{h:50,d:25,a:25,xg:[1,1]},home:{name:"A"},away:{name:"B"}};
 assert(F.cardDet({...x,status:"NS"}).includes("Kelengkapan data"));assert(!F.cardDet({...x,status:"LIVE"}).includes("Kelengkapan data"),"live: tidak tampil");assert(!F.cardDet({...x,status:"FT"}).includes("Kelengkapan data"),"selesai: tidak tampil")}
console.log("test-ui V31b ok");
{const F=new Function(pre+";return {pb}")();const x={status:"NS",p:{h:45,d:27,a:28},sk:{h:40,d:28,a:32,u:1,src:"lean"},home:{name:"A"},away:{name:"B"}};
 assert(F.pb(x).includes("BSD terkoreksi")&&!F.pb(x).includes("Gabungan ·"));assert(F.pb({...x,sk:{...x.sk,src:"stack"}}).includes("Gabungan ·"));assert(!F.pb({...x,sk:{...x.sk,u:0}}).includes("terkoreksi"))}
console.log("test-ui V32 ok");
{const F=new Function(pre+";KL.tm={'7':{sr:9,sn:18,luck:{xn:10,xpN:24,xpts:18.4}},'8':{sr:2,sn:18,luck:{xn:2,xpN:3,xpts:5}}};return {klTable}")();
 const R=[{position:3,team_id:7,team_name:"A",played:10,won:7,drawn:3,lost:0,gf:20,ga:5,gd:15,xgd:3,pts:24,form:"WWDWW"},{position:12,team_id:8,team_name:"B",played:10,won:1,drawn:0,lost:9,gf:5,ga:20,gd:-15,xgd:-2,pts:3,form:"LLLLL"},{position:5,team_id:99,team_name:"C",played:10,won:5,drawn:0,lost:5,gf:9,ga:9,gd:0,xgd:null,pts:15,form:""}];
 const h=F.klTable(R);assert(h.includes(">Kuat<")&&h.includes(">Untung<"),"kolom baru");assert(h.includes('kq dn">9<')&&h.includes('kq up">2<'),"warna kekuatan");assert(h.includes('kq up">+5,6<'),"untung: "+h.match(/kq[^<]*/g));
 assert((h.match(/<td class="s">-<\/td>/g)||[]).length===3,"data kurang -> strip");
 const G=new Function(pre+";KL.tm={};return {klTable}")();assert(!G.klTable(R).includes(">Kuat<"),"tanpa data: kolom disembunyikan")}
console.log("test-ui V33 ok");
{// V34: klasemen — Poin tepat setelah Tim, nama pendek; ROI tersembunyi di mode netral; label kalibrasi; o2 koma
 const F=new Function(pre+";KL.tm={};return {klTable,ctab,o2}")();
 const R=[{position:1,team_id:7,team_name:"Brighton & Hove Albion",played:11,won:7,drawn:1,lost:3,gf:26,ga:9,gd:17,xgd:3,pts:22,form:"WWLWW"}];
 const h=F.klTable(R),ths=[...h.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map(m=>m[1]);assert.deepEqual(ths.slice(0,3),["#","Tim","Poin"],"urutan kolom: "+ths);
 assert(/<td class="t">.*<td><b>22<\/b>/.test(h),"poin langsung setelah tim");assert(h.includes('class="sn"')&&h.includes(">Brighton & Hove Albion<".replace("&","&amp;")),"nama penuh + pendek");
 const c=F.ctab([{lo:0,hi:40,n:1,avg:30,hit:31},{lo:60,hi:70,n:1,avg:65,hit:66},{lo:70,hi:101,n:1,avg:80,hit:82}]);assert(c.includes("di bawah 40%")&&c.includes("60–70%")&&c.includes("70% ke atas")&&!c.includes("101"),"label kalibrasi");
 assert.equal(F.o2(1.744),"1,74");assert.equal(F.o2(null),"-");
 assert(/NEUTRAL\?'':'<th>ROI value/.test(html),"ROI ikut mode netral")}
console.log("test-ui V34 ok");
{const F=new Function(pre+";return {rlId,h2d}")();
 assert.equal(F.rlId("Regular season · Matchday 15"),"Musim reguler · Pekan 15");assert.equal(F.rlId("League phase · Round 5"),"Fase liga · Babak 5");assert.equal(F.rlId("Quarter-finals"),"Perempat final");assert.equal(F.rlId("Round of 16"),"16 besar");assert.equal(F.rlId(null),"");
 assert(/19 Feb 2026/.test(F.h2d("2026-02-19")),F.h2d("2026-02-19"));assert(html.includes(">V55</span>")&&html.includes("Favorit belum main")&&!html.includes("Rata-rata keunggulan</span>"))}
console.log("test-ui V34c ok");
{const F=new Function(pre+";return {dataQ}")();const b={p:{h:30,d:30,a:40,xg:1},src:"BSD",odds:{},home:{name:"A"},away:{name:"B"}};
 assert.equal(F.dataQ({...b,bl:{src:"abs",lsrc:"pred",lu:[1,1,1,1]}}).L[3][1],false,"line-up perkiraan bukan resmi");assert.equal(F.dataQ({...b,bl:{src:"xi",lsrc:"xi"}}).L[3][1],true)}
console.log("test-ui V34d ok");
{const F=new Function(pre+";return {tierTag,fresh,riskOf,blWhy}")();
 assert(F.tierTag({src:"HL",tier:2,p:{engine:"hl"}}).includes("Prediksi Highlightly"));assert(F.tierTag({src:"HL",tier:2,p:{engine:"poisson"}}).includes("Statistik dasar"));
 const now=Date.parse("2026-11-23T07:00:00Z");assert.equal(F.fresh([{status:"FT",utc:"2026-11-28T15:00:00Z"},{status:"FT",utc:"2026-11-22T15:00:00Z"}],now).length,1,"FT berjadwal masa depan disembunyikan");
 const x={status:"NS",src:"BSD",league:"X",home:{name:"A"},away:{name:"B"},p:{h:50,d:25,a:25},bl:{h:50,d:25,a:25,src:"abs",lsrc:"pred",lu:[.8,1,1,1]}};
 assert(F.riskOf(x).some(r=>/perkiraan line-up A melemah/.test(r)),F.riskOf(x));assert(F.blWhy(x).includes("Perkiraan line-up"));
 const y={...x,bl:{...x.bl,src:"xi",lsrc:"xi"}};assert(F.riskOf(y).some(r=>/^line-up A melemah/.test(r)));assert(!F.blWhy(y).includes("Perkiraan"))}
console.log("test-ui V34e ok");
{// V35: tab Analisa — disusun dari data, tanda bukti sesuai hasil uji
 const F=new Function(pre+`;return {anHtml,AN,KL,setAll:function(d,m,b,e){D=d;MBL=m;BT=b;EV=e}}`)();
 const x={eid:1,src:"BSD",league:"Premier League",lc:"England",lid:1,hid:16,aid:20,utc:"2026-11-23T20:00:00Z",status:"NS",home:{name:"Brentford"},away:{name:"Everton"},p:{h:41.4,d:27.1,a:31.5,xg:[1.58,1.15],ou:52.4,bt:56.6},bl:{h:46.9,d:25.2,a:27.9,xg:[1.67,1.25],ms:[1,1],k:[1,0],src:"abs",lsrc:"pred",lu:[0.986,1.005,1.029,1.021],mi:[["I. Thiago"],["M. Röhl"]],r:[0,0]},pin:{o:[2.15,3.65,3.43],c:[2.33,3.55,3.13]},ab:{h:[["I. Thiago","s"]],a:[]},cf:{k:"terbuka",hit:40.6,n:527},level:"Tipis",why:["Klasemen menipu: Everton peringkat 7 klasemen, tapi kekuatan aslinya #11 dari 20","Brentford baru ganti pelatih"]};
 F.setAll({matches:[x,{eid:2,src:"BSD",hid:20,aid:99,utc:"2026-11-26T20:00:00Z",league:"UEFA Europa League",status:"NS"},{eid:3,src:"BSD",hid:16,aid:98,utc:"2026-11-21T14:00:00Z",league:"Premier League",status:"FT"}],week:["2026-11-21","2026-11-30"],updated:"2026-11-23T13:05:00Z"},
  {fac:{formPanas:{n:1183,win:49.9,bsd:47.9,gapBsd:1.9,se:1.45},pelatihBaru:{n:1003,win:29.5,bsd:34.4,gapBsd:-4.9,se:1.44},h2hDominan:{n:303,win:48.5,bsd:50,gapBsd:-1.5,se:2.9}},tbl:{g5:{beda:{n:226,win:32.7,bsd:36.4,gapBsd:-3.6,se:3.1},sama:{n:1514,win:55.1,bsd:51.3,gapBsd:3.7,se:1.28}}},dis:{n:879,bsd:379,bl:264},stk:{lab:{terbuka:{n:527,hit:40.6}}},blLg:{1:[92,44.6,43.5]}},
  {byLeague:{"Premier League":{n:92,acc:44.6}}},{move:{open:{acc:47.9},close:{acc:48.2}}});
 F.KL.tm={16:{lg:1,sr:6,sn:20,luck:{xn:12,xpN:20,xpts:16.1}},20:{lg:1,sr:11,sn:20,luck:{xn:13,xpN:22,xpts:18}}};
 F.AN.lg[1]={grouped:false,standings:[{position:1,pts:28,played:11,team_id:18,zone:{type:"qualification",label:"Champions League"}},{position:2,pts:22,played:11,team_id:5},{position:3,pts:22,played:11,team_id:12},{position:7,pts:16,played:10,team_id:20,form:"WWLLD"},{position:10,pts:14,played:10,team_id:16,form:"LWDLD"},{position:18,pts:8,played:11,team_id:30,zone:{type:"relegation",label:"Relegation"}},{position:19,pts:6,played:11,team_id:31,zone:{type:"relegation"}}],top:{scorers:[{player_id:473,player_name:"Igor Thiago",team_id:16,value:6}]}};
 const d={form:{home:{overall:{matches:10,won:3,drawn:4,lost:3,goals_for:16,goals_against:14,form:"LWLDLDWWDD",stats:{expected_goals:{average:1.136}}},home:{matches:4,won:2,drawn:1,lost:1,goals_for:7,goals_against:3,form:"WLWD"}},away:{overall:{matches:10,won:5,drawn:3,lost:2,goals_for:13,goals_against:10,form:"WWWLLDWWDD"},away:{matches:4,won:1,drawn:2,lost:1,goals_for:3,goals_against:4,form:"WLDD"}}},
  h2h:{total_matches:12,home_wins:3,draws:5,away_wins:4,avg_total_goals:2.75,recent_matches:[{home_team_id:16,home_score:2,away_score:2},{home_team_id:20,home_score:2,away_score:4},{home_team_id:16,home_score:1,away_score:1}]},info:{derby:false,travel:283,weather:{description:"rain",temperature_c:8}},
  lineups:{lineup_status:"predicted",unavailable_players:{home:[{id:473,short_name:"I. Thiago",status:"suspended",reason:"red_card_suspension"},{id:2373,short_name:"A. Hickey",status:"injured",reason:"Hamstring Injury"}],away:[]}}};
 const h=F.anHtml(x,d),t=h.replace(/<[^>]+>/g," ").replace(/\s+/g," ");
 if(process.env.SHOW_AN)console.log(h.replace(/<(li|h3|div)[^>]*>/g,"\n").replace(/<[^>]+>/g,"").replace(/\n+/g,"\n"));
 assert(/Laga terbuka/.test(t),"kesimpulan: terbuka");assert(/posisi 10 \(14 poin dari 10 laga\), 14 poin di bawah pemuncak/.test(t),"situasi");
 assert(/Igor Thiago, 6 gol\) tidak main/.test(t),"top skor absen");assert(/I\. Thiago \(skors\)/.test(t),"skors");
 assert(/baru ganti pelatih.*🟢 terbukti/.test(t),"pelatih baru = terbukti");assert(/3 pertemuan|12 pertemuan.*⚪ sudah diperhitungkan BSD/.test(t),"H2H = sudah diperhitungkan");
 assert(/3 hari lagi main di .*kemungkinan rotasi/.test(t),"Everton main Eropa 3 hari lagi");assert(/berbeda arah|sepakat/.test(t));assert(/Harga pasar bergeser ke arah Everton/.test(t),"pasar ke Everton: "+t.match(/Harga pasar[^.]*/));
 assert(/Klasemen|kekuatan asli #6 dari 20/.test(t));assert(/Line-up resmi belum keluar/.test(t));assert(!/undefined|NaN/.test(t),"tanpa undefined/NaN: "+(t.match(/.{40}(undefined|NaN).{20}/)||[""])[0]);
 const y={...x,status:"FT",score:[null,null]};assert(/Skor akhir belum tersedia/.test(F.anHtml(y,d)));const z={...x,np:1};assert(/Belum ada prediksi/.test(F.anHtml(z,null)));
 const w=F.anHtml(x,null).replace(/<[^>]+>/g," ");assert(!/undefined|NaN/.test(w),"tanpa detail tetap rapi")}
console.log("test-ui V35 ok");
{// V45: performa pemain di Analisa (pf.json)
 const F=new Function(pre+`;return {anHtml,AN,KL,setAll:function(d,m,b,e){D=d;MBL=m;BT=b;EV=e}}`)();
 const x={eid:1,src:"BSD",league:"Premier League",lc:"England",lid:1,hid:16,aid:20,utc:"2026-11-23T20:00:00Z",status:"NS",home:{name:"Brentford"},away:{name:"Everton"},p:{h:41.4,d:27.1,a:31.5,xg:[1.58,1.15]}};
 F.setAll({matches:[x],week:["2026-11-21","2026-11-30"],updated:"2026-11-23T13:05:00Z"},null,null,null);F.KL.tm={};F.AN.lg[1]=null;
 F.AN.pf={16:{n:6,p:[[1,"I. Thiago","F",6,520,5,1,4.2,7.6,"p"],[2,"M. Damsgaard","M",5,400,0,3,0.8,null,"p"],[3,"K. Lewis-Potter","D",3,250,0,0,0,6.9,"n"]]},20:{n:4,p:[[9,"J. Branthwaite","D",4,360,0,0,0,7.1,"n"]]}};
 const t=F.anHtml(x,null).replace(/<[^>]+>/g," ").replace(/\s+/g," ");
 assert(/Brentford — dalam performa \(6 laga terakhir\): I\. Thiago \(5 gol, 1 assist, rating 7,6, 6 laga\), M\. Damsgaard \(3 assist, 5 laga\)/.test(t),"performa: "+(t.match(/Brentford — .{0,160}/)||[""])[0]);
 assert(/Naik daun \(menit main melonjak di 3 laga terakhir\): K\. Lewis-Potter \(250 menit\)/.test(t),"naik daun");
 assert(/Everton — belum ada pemain yang menonjol di 4 laga terakhir\. Naik daun.*J\. Branthwaite/.test(t),"tim tanpa pemain menonjol");
 assert(/⚪ info/.test(t)&&!/undefined|NaN/.test(t));const lu={lineups:{lineup_status:"predicted",unavailable_players:{home:[{id:2,short_name:"M. Damsgaard",status:"injured"}],away:[]},lineups:{home:{players:Array.from({length:11},(_,k)=>({id:k===0?1:50+k}))},away:{players:Array.from({length:11},(_,k)=>({id:60+k}))}}}};
 const t2=F.anHtml(x,lu).replace(/<[^>]+>/g," ").replace(/\s+/g," ");assert(/I\. Thiago \([^)]*\), M\. Damsgaard \([^)]*\) — absen/.test(t2),"absen ditandai: "+(t2.match(/Brentford — .{0,200}/)||[""])[0]);
 assert(/Lewis-Potter \(250 menit\) — tidak di line-up perkiraan/.test(t2)&&!/I\. Thiago \([^)]*\) — /.test(t2),"yang main tidak ditandai");assert(/J\. Branthwaite \(360 menit\)/.test(t2));
 F.AN.pf={};assert(!/dalam performa/.test(F.anHtml(x,null)),"tanpa data: tidak tampil")}
console.log("test-ui V45 ok");
{// V46: istirahat dari riwayat hasil (bl.lp), bukan "istirahat panjang" palsu
 const F=new Function(pre+`;return {anHtml,AN,KL,setAll:function(d,m,b,e){D=d;MBL=m;BT=b;EV=e}}`)();
 const x={eid:1,src:"BSD",league:"Premier League",lc:"England",lid:1,hid:16,aid:20,utc:"2026-11-25T20:00:00Z",status:"NS",home:{name:"Arsenal"},away:{name:"Dortmund"},p:{h:51,d:25,a:24},bl:{h:50,d:25,a:25,xg:[1.6,1],ms:[1,0],k:[0,0],lp:[Math.round(Date.parse("2026-11-21T15:00:00Z")/1000),null]}};
 F.setAll({matches:[x],week:["2026-11-22","2026-12-01"],updated:"2026-11-24T13:05:00Z"},null,null,null);F.KL.tm={};F.AN.lg[1]=null;F.AN.pf={};
 const t=F.anHtml(x,null).replace(/<[^>]+>/g," ").replace(/\s+/g," ");
 assert(/Arsenal : istirahat 4 hari \(laga terakhir 21 Nov 2026\)/.test(t),"istirahat dari lp: "+(t.match(/Arsenal : .{0,80}/)||[""])[0]);
 assert(/Dortmund : laga terakhirnya belum tercatat di data kita/.test(t));assert(!/istirahat panjang/.test(t))}
console.log("test-ui V46 ok");
{// V47: profil tim
 const F=new Function(pre+`;return {tpHtml,tpRow,AN,KL,setAll:function(d,m,b,e){D=d;MBL=m;BT=b;EV=e}}`)();
 const m1={eid:11,src:"BSD",league:"Premier League",lc:"England",lid:1,hid:16,aid:20,utc:"2026-11-28T15:00:00Z",status:"NS",home:{name:"Brentford"},away:{name:"Everton"},p:{h:45,d:27,a:28}};
 const m2={eid:12,id:"b12",src:"BSD",league:"Premier League",lc:"England",lid:1,hid:30,aid:16,utc:"2026-11-22T15:00:00Z",status:"FT",score:[0,2],home:{name:"Fulham"},away:{name:"Brentford"},p:{h:50,d:25,a:25}};
 const m3={eid:13,src:"BSD",league:"Premier League",lc:"England",lid:1,hid:40,aid:41,utc:"2026-11-22T15:00:00Z",status:"FT",score:[1,1],home:{name:"A"},away:{name:"B"},p:{h:50,d:25,a:25}};
 F.setAll({matches:[m1,m2,m3],week:["2026-11-21","2026-11-30"],updated:"2026-11-24T13:05:00Z"},null,null,null);
 F.AN.lg[1]={name:"Premier League",grouped:false,standings:[{position:1,team_id:18,pts:28,played:12},{position:9,team_id:16,team_name:"Brentford",pts:17,played:12,won:5,drawn:2,lost:5,gf:18,ga:17,form:"WLWDW"},...Array.from({length:18},(_,k)=>({position:k+2,team_id:100+k,pts:10,played:12}))]};
 F.KL.tm={16:{lg:1,sr:6,sn:20,luck:{xpN:12,pts:17,xpts:21.4},ps:{key:[[1,"I. Thiago",.92,7.4,.6,4.5e7,"F"],[2,null,.8,7,0,null,"M"]]}}};F.AN.pf={16:{n:6,p:[[1,"I. Thiago","F",6,520,5,1,4.2,7.6,"p"],[3,"K. Lewis-Potter","D",3,250,0,0,0,6.9,"n"]]}};
 const h=F.tpHtml(16,1),t=h.replace(/<[^>]+>/g," ").replace(/\s+/g," ");if(process.env.SHOW_TP)console.log(t);
 assert(/Brentford/.test(t)&&/Posisi #9 dari 20/.test(t)&&/Poin 17 \(12 laga\)/.test(t)&&/M-S-K 5-2-5/.test(t),"ringkasan: "+t.slice(0,300));
 assert(/Kekuatan asli #6 dari 20/.test(t)&&/17 \/ 21,4 kurang beruntung/.test(t),"kekuatan & keberuntungan");
 assert(/Laga berikutnya.*vs Everton.*kandang|Laga berikutnya.*kandang.*vs Everton/.test(t)&&/menang 45%, seri 27%/.test(t),"laga berikutnya");
 assert(/Hasil terakhir .*tepat 1 dari 1/.test(t)&&/vs Fulham/.test(t)&&/tandang/.test(t)&&!/vs A\b/.test(t),"hasil terakhir");
 assert(/Dalam performa .*I\. Thiago F 5 gol · 1 assist · rating 7,6 · 6 laga, 520 menit/.test(t),"performa");assert(/Naik daun.*K\. Lewis-Potter/.test(t));
 assert(/Pemain paling sering main.*I\. Thiago F 92% menit · rating 7,4 · €45,0 jt/.test(t),"pemain inti");assert(h.includes('data-mc="11"')&&h.includes('data-mc="12"'));
 assert(!/undefined|NaN|null/.test(t),"rapi: "+(t.match(/.{30}(undefined|NaN|null).{20}/)||[""])[0]);
 const e=F.tpHtml(999,null).replace(/<[^>]+>/g," ");assert(/Klasemen dan peringkat kekuatan tim ini belum tersedia/.test(e)&&!/undefined|NaN/.test(e),"tim tak dikenal tetap rapi");
 F.AN.lg[2]={name:"UCL",grouped:true,groups:{A:[{position:2,team_id:16,pts:6,played:3,won:2,drawn:0,lost:1}],B:[{position:1,team_id:50}]}};
 const g=F.tpHtml(16,2).replace(/<[^>]+>/g," ").replace(/\s+/g," ");assert(/Posisi #9 dari 20/.test(g)&&/UCL \(grup\) #2 dari 1 · 6 poin/.test(g)&&/klasemen Liga Inggris; kekuatan asli dan poin vs harapan xG juga dihitung di liga ini/.test(g),"liga utama + kompetisi lain: "+g.slice(0,400));
 F.KL.tm={};F.AN.lg[3]={name:"Cup",grouped:true,groups:{A:[{position:2,team_id:77,pts:6,played:3,won:2,drawn:0,lost:1}]}};const g3=F.tpHtml(77,3).replace(/<[^>]+>/g," ");assert(/Posisi #2 dari 1/.test(F.tpHtml(77,3).replace(/<[^>]+>/g," ").replace(/\s+/g," ")),"grup: "+g3.slice(0,300))}
console.log("test-ui V47 ok");
{// V48: riwayat 10 laga di profil + nama tim bisa diketuk di kartu + kotak laporan
 const F=new Function(pre+`;return {tpHtml,rkCard,lpBox,AN,KL,setLP:function(v){LP=v;LPb=1},setAll:function(d){D=d}}`)();
 const m1={eid:11,src:"BSD",league:"Premier League",lc:"England",lid:1,hid:16,aid:20,utc:"2026-11-28T15:00:00Z",status:"NS",home:{name:"Brentford"},away:{name:"Everton"},p:{h:45,d:27,a:28}};
 F.setAll({matches:[m1],week:["2026-11-21","2026-11-30"],updated:"2026-11-24T13:05:00Z"});F.KL.tm={};F.AN.lg[1]=null;
 F.AN.pf={16:{n:0,p:[],hr:[[1763820000,1,"Fulham",1,2,0],[1763215200,1,null,0,1,1],[1762610400,9,"Ajax",0,0,3]]}};
 const t=F.tpHtml(16,1).replace(/<[^>]+>/g," ").replace(/\s+/g," ");
 assert(/3 laga terakhir · 1 menang, 1 seri, 1 kalah · gol 3-4/.test(t),"ringkasan riwayat: "+t.slice(0,400));assert(/tandang · Liga Inggris vs Fulham M 2-0/.test(t)&&/vs lawan S 1-1/.test(t)&&/vs Ajax K 0-3/.test(t),"baris riwayat");
 assert(!/Dalam performa/.test(t)&&!/undefined|NaN|null/.test(t));
 const c=F.rkCard(m1,0);assert(c.includes('data-tp="16"')&&c.includes('data-tp="20"')&&c.includes('data-mc="11"'),"nama tim di kartu Rangkuman bisa diketuk");
 F.setLP({n:4,wait:1,ok:2,imb:1,mel:1,from:"2026-11-23T22:00:00.000Z",strong:{n:2,ok:1},fav:{n:0,ok:0},open:{n:1,ok:1,seri:1},bsd:{n:4,hit:2},bl:{n:1,hit:1},sk:{n:0,hit:0},ou:{n:1,ok:0},bt:{n:0,ok:0},kej:[{lg:"Premier League",h:"P",a:"Q",r:[0,1],tim:"P",pv:65,k:"arah",seri:false}],best:[],worst:[{lg:"Serie A",n:4,ok:1}]});
 const L=F.lpBox().replace(/<[^>]+>/g," ").replace(/\s+/g," ");assert(/Laporan hari bola kemarin Selasa, 24 Nov · ✓ Tepat 2 dari 4 \(50%\)/.test(L),"kotak laporan: "+L.slice(0,200));
 assert(/P 0-1 Q \(Liga Inggris\) ?: P menang 65%/.test(L)&&/Paling sulit: Liga Italia 1\/4/.test(L)&&!/undefined|NaN/.test(L),L);F.setLP({n:0});assert.equal(F.lpBox(),"")}
console.log("test-ui V48 ok");
{const F=new Function(pre+`;return {trapHtml}`)();const q={n:300,win:40,bsd:55,gap:-15,se:2.8,draw:30};
 const h=F.trapHtml({tp:{n:5600,from:"2026-08-15T00:00Z",to:"2026-11-24T00:00Z",n30:3,maxN:31,trap:{teams:12,first:q,second:{n:120,win:52,bsd:56,gap:-4,se:4.5}},rel:{teams:9,first:q,second:{n:0}},worst:[{nm:"Santos",win:30,bsd:58,n:12}],best:[],verdict:"data per tim kurang"}}).replace(/<[^>]+>/g," ").replace(/\s+/g," ");
 assert(/Tim "penipu"/.test(h)&&/Sering gagal — paruh kedua \(uji\) 12 120 52,0% 56,0% -4 ± 9/.test(h)&&/Santos menang 30% vs 58% kata BSD, 12 laga/.test(h)&&/Belum lolos/.test(h)&&/terlalu sedikit/.test(h)&&!/undefined|NaN/.test(h),h);assert.equal(F.trapHtml({}),"")}
console.log("test-ui V49 ok");
{// V50: rekam jejak (UI) + kartu tahan data kosong
 const {judge}=await import("./laporan.mjs");
 const F=new Function(pre+`;return {rkJudge,rkTag,rkMet,rekFilter,rekSum,rekCsv,rekHtml,blLine,card_0,card,safeC,RK,setD:function(d){D=d}}`)();
 let sd=5;const rn=()=>(sd=(sd*16807)%2147483647)/2147483647;
 for(let i=0;i<3000;i++){const h=Math.round(rn()*80),d=Math.round(rn()*(100-h)),p=[h,d,100-h-d],r=[Math.floor(rn()*4),Math.floor(rn()*4)],a=F.rkJudge(p,r),b=judge(p,r);
   assert.equal(a.ok,b.ok,"penilaian web = laporan pagi: "+p+" "+r);assert.equal(!!a.imb,!!b.imb)}
 const m=F.rkMet([50,25,25],[2,0]);assert(Math.abs(m.br-(0.25+0.0625+0.0625))<1e-9&&Math.abs(m.ll-Math.log(2))<1e-9&&m.hit);
 const R=[{id:1,u:"2026-11-24T19:45:00Z",lg:"Championship",h:"Norwich",a:"QPR",t0:"2026-11-22T02:00:00.000Z",ts:"2026-11-24T19:40:00.000Z",tc:"2026-11-24T18:00:00.000Z",pu:"2026-11-24T02:15:00.000Z",mv:"v1",p0:[45,27,28],p:[47,26,27],bl:[43,27,30],ou:55,bt:52,r:[2,0]},
   {id:2,u:"2026-11-24T20:00:00Z",lg:"Champions League",h:"Arsenal",a:'Dortmund, "BVB"',t0:null,ts:null,tc:null,pu:null,mv:null,p0:null,p:[67,20,13],bl:null,ou:null,bt:null,r:[1,1]},
   {id:3,u:"2026-11-25T20:00:00Z",lg:"Champions League",h:"Inter",a:"Stuttgart",t0:"2026-11-23T00:00:00.000Z",ts:"2026-11-25T19:00:00.000Z",tc:null,pu:null,mv:null,p0:[67,18,15],p:[67,18,15],bl:null,ou:null,bt:null,r:null}];
 assert.equal(F.rekFilter(R,{from:"2026-11-25",to:"",lg:"",st:"",q:""}).length,3,"periode WITA: 24 Nov 19.45 UTC = 25 Nov 03.45 WITA");
 assert.equal(F.rekFilter(R,{from:"",to:"2026-11-25",lg:"",st:"",q:""}).length,2);assert.equal(F.rekFilter(R,{lg:"Champions League"}).length,2);assert.equal(F.rekFilter(R,{st:"wait"}).length,1);
 assert.equal(F.rekFilter(R,{st:"ok"}).length,1);assert.equal(F.rekFilter(R,{st:"no"}).length,1);assert.equal(F.rekFilter(R,{q:"arsen"}).length,1);
 const S=F.rekSum(R);assert.equal(S.n,2);assert.equal(S.tag,1);assert.equal(S.ts,2);assert.equal(S.ouN,1);
 const csv=F.rekCsv(R),lines=csv.replace(/^﻿/,"").trim().split("\n");assert.equal(lines.length,4);assert(lines[0].startsWith("id,kickoff_utc,kickoff_wita"));assert(lines[1].includes("2026-11-25 03.45")&&lines[1].includes("2026-11-22T02:00:00.000Z")&&lines[1].includes("✓ Tepat"));
 assert(lines[2].includes('"Dortmund, ""BVB"""')&&lines[2].includes("~ Imbang"),"CSV aman untuk koma/kutip: "+lines[2]);assert(lines[3].includes("belum ada hasil"));
 F.RK.idx={months:[{m:"2026-11",n:3}],st:{conflicts:0}};F.RK.m="2026-11";F.RK.rows=R;
 const h=F.rekHtml().replace(/<[^>]+>/g," ").replace(/\s+/g," ");assert(/Rekam jejak prediksi/.test(h)&&/3 laga · 2 sudah ada hasil: ✓ Tepat \(tanda web\) 1 \(50%\)/.test(h)&&/tidak tercatat/.test(h)&&/45\/27\/28/.test(h)&&!/undefined|NaN|null/.test(h),h.slice(0,600));
 F.RK.rows=null;assert(/Memuat/.test(F.rekHtml()));F.RK.idx={months:[]};assert(/belum tersedia/.test(F.rekHtml()));
 // kartu: bl tanpa xg/ms/ou/bt tidak lagi galat; bl tanpa peluang tidak ditampilkan; galat lain tetap tertangkap pengaman dan dicatat
 const x={id:"b1",eid:1004,src:"BSD",status:"NS",league:"Premier League",utc:new Date(Date.now()+36e5).toISOString(),home:{name:"A"},away:{name:"B"},score:[null,null],p:{h:50,d:25,a:25,xg:[1.4,1]},pick:"h",edge:25,level:"Kuat",bl:{h:50,d:25,a:25,ms:null,xg:null,k:null,ou:null,bt:null}};
 F.setD({matches:[x],week:["2026-11-20","2026-11-30"]});const c=F.card_0(x,1);assert(c.includes("Model BL: 50 / 25 / 25")&&!/undefined|NaN|null/.test(c.replace(/<[^>]+>/g," ")),"kartu 1004 tanpa galat");
 assert.equal(F.blLine({...x,bl:{h:null,d:null,a:null}}),"");const w=console.warn;let warned=0;console.warn=()=>{warned++};const g=F.safeC(()=>{throw new Error("uji")},x,"card");console.warn=w;assert(g.includes('data-mc="1004"')&&warned===1,"galat tak terduga tetap dicatat")}
console.log("test-ui V50 ok");
{// V51: Data Health Center (UI) + kelengkapan data per laga
 const F=new Function(pre+`;return {healthHtml,hdStatus,hdAge,dqOf,dqHtml,anHtml,AN,KL,setD:function(d){D=d}}`)();
 const now=Date.parse("2026-11-25T12:00:00Z"),iso=t=>new Date(t).toISOString();
 const H={v:1,updated:iso(now-2*6e4),status:"ok",checks:[{k:"bsd",label:"API BSD",st:"ok",val:"10 panggilan",note:"mode ringan"},{k:"an",label:"Anomali data",st:"ok",val:"tidak ada",note:null}],
  files:{"all.json":iso(now-3*6e4),"model-bl.json":iso(now-30*36e5),"pf.json":null},age:{"all.json":[.5,2],"model-bl.json":[26,50],"pf.json":[3,26]},ver:{site:"V51",bsd:{"dc-blend-v1":500},modelBL:{updated:iso(now-30*36e5),n:900}},
  leagues:[{lg:"Premier League",n:10,miss:2,items:{"line-up":2}}],anomalies:[{k:"macet",id:3,t:"Masih LIVE 5 jam setelah kickoff",m:"E vs F"}],anomalyN:1};
 F.setD({matches:[],week:["2026-11-20","2026-11-30"]});
 assert.equal(F.hdStatus(H,now),"ok");assert.equal(F.hdStatus(H,now+3*36e5),"bad","data tidak diperbarui 3 jam -> masalah (dihitung ulang di halaman)");assert.equal(F.hdStatus(H,now+40*6e4),"warn");
 assert.deepEqual(F.hdAge(H,now).map(a=>a.st),["ok","warn","warn"]);
 const t=F.healthHtml(H,now).replace(/<[^>]+>/g," ").replace(/\s+/g," ");
 assert(/🟢 Kesehatan data Data lengkap dan terbaru · diperiksa 2 menit lalu/.test(t)&&/API BSD 10 panggilan mode ringan/.test(t)&&/Model BL \(dilatih\) 30 jam lalu 26 jam/.test(t)&&/Performa pemain tidak ada/.test(t),t.slice(0,700));
 assert(/situs V51 · model BSD dc-blend-v1 \(500 laga\) · Model BL dilatih/.test(t)&&/Liga Inggris 10 2 line-up 2/.test(t)&&/E vs F Masih LIVE 5 jam/.test(t)&&!/undefined|NaN|null/.test(t));
 assert(/belum tersedia/.test(F.healthHtml(null)));
 // kelengkapan data per laga
 const x={eid:1,src:"BSD",lid:1,league:"Premier League",hid:1,aid:2,utc:iso(Date.now()+36e5),status:"NS",home:{name:"A"},away:{name:"B"},p:{h:50,d:25,a:25,xg:[1,1]},bl:{h:50,d:25,a:25,xg:[1,1],ms:[1,0],k:[0,0]}};
 F.AN.lg[1]={name:"Premier League",standings:[{team_id:1}]};
 const q=F.dqOf(x,{lineups:{lineup_status:"predicted"},h2h:[{}],form:{home:{}}});assert.equal(q.lim,false);
 assert.deepEqual(q.it.map(i=>i[0]+":"+i[1]),["Prediksi BSD:1","xG BSD:1","Model BL:1","Detail laga:1","Form:1","H2H:1","Line-up:0.5","Klasemen:1"]);
 const q2=F.dqOf({...x,p:{h:50,d:25,a:25},bl:null},null);assert.equal(q2.lim,true,"tanpa xG, tanpa Model BL, tanpa detail -> data terbatas");
 assert.equal(F.dqOf({...x,np:true,p:null},null).lim,true);assert(!F.dqOf({...x,league:"Club Friendlies"},null).it.some(i=>i[0]==="Klasemen"),"persahabatan: klasemen tidak dinilai");
 const h=F.dqHtml({...x,p:{h:50,d:25,a:25},bl:null},null).replace(/<[^>]+>/g," ");assert(/Kelengkapan data/.test(h)&&/Data terbatas/.test(h)&&!/undefined|NaN|null/.test(h));
 const a=F.anHtml(x,null);assert(a.indexOf("Kelengkapan data")>=0&&a.indexOf("Kelengkapan data")<200,"baris kelengkapan di atas Analisa");assert.equal(F.anHtml(null,null),'<div class="em">Analisa belum tersedia.</div>');assert(F.anHtml(x,null,true).indexOf("Kelengkapan data")<0,"saat detail masih dimuat: belum dinilai")}
console.log("test-ui V51 ok");
{// V52: tampilan sebelum vs sesudah line-up, lencana Rangkuman, kata tingkat, piala
 const F=new Function(pre+`;return {lxHtml,lxBig,rkCard,dqOf,anHtml,AN,KL,setD:function(d){D=d}}`)();
 const x={eid:5,src:"BSD",lid:1,league:"Premier League",hid:1,aid:2,utc:new Date(Date.now()+36e5).toISOString(),status:"NS",home:{name:"Arsenal"},away:{name:"Borussia Dortmund"},score:[null,null],p:{h:67,d:20,a:13},
  lx:{sp:{t:"2026-11-24T17:00:00.000Z",p:[67,20,13],bl:[59,24,17],k:[1,1]},sx:{t:"2026-11-24T19:00:00.000Z",tu:"2026-11-24T19:55:00.000Z",p:[67,20,13],bl:[52,26,22],k:[2,1],in:[["M. Lewis-Skelly"],[]],out:[["B. Saka"],[]]}}};
 F.setD({matches:[x],week:["2026-11-20","2026-11-30"]});
 assert.equal(F.lxBig(x),true,"Model BL turun 7 poin -> perubahan berarti");
 const t=F.lxHtml(x).replace(/<[^>]+>/g," ").replace(/\s+/g," ");
 assert(/Sebelum vs sesudah line-up resmi perubahan berarti/.test(t)&&/BSD 67% → 67% 0 20% → 20% 0 13% → 13% 0/.test(t)&&/Model BL 59% → 52% -7 24% → 26% \+2 17% → 22% \+5/.test(t),t.slice(0,500));
 assert(/Arsenal : beda dari perkiraan — masuk M\. Lewis-Skelly; keluar B\. Saka/.test(t)&&/Borussia Dortmund : line-up resmi sama dengan perkiraan/.test(t)&&/Arsenal 1 → 2/.test(t)&&/Sebelum: 11-25 01\.00 WITA/.test(t)&&!/BSD memperbarui/.test(t)&&!/undefined|NaN|null/.test(t),t);
 const y={...x,lx:{sp:{t:"2026-11-24T17:00:00.000Z",p:[60,22,18],bl:[50,25,25]},sx:null}};assert(/Line-up resmi belum keluar/.test(F.lxHtml(y))&&!F.lxBig(y));
 const z={...x,lx:{sp:{t:"2026-11-24T17:00:00.000Z",p:[60,22,18],bl:[50,25,25]},sx:{t:"2026-11-24T19:00:00.000Z",p:[62,21,17],bl:[51,25,24],in:null,out:null}}};
 const tz=F.lxHtml(z).replace(/<[^>]+>/g," ");assert(!F.lxBig(z)&&/BSD memperbarui angkanya/.test(tz)&&!/perubahan berarti/.test(tz));
 assert.equal(F.lxHtml({...x,lx:null}),"");assert(F.rkCard(x,0).includes("berubah setelah line-up")&&!F.rkCard({...x,lx:null},0).includes("berubah setelah line-up"));
 assert(F.anHtml(x,null).indexOf("Sebelum vs sesudah line-up resmi")>=0);
 {const w=F.anHtml({...x,eid:6,lx:null,level:"Kuat",cf:null,p:{h:50,d:25,a:25}},null).replace(/<[^>]+>/g," ");assert(!/\(kuat,/.test(w),"tanpa label uji mundur tidak memakai kata tingkat lama: "+(w.match(/Condong ke[^.]{0,80}/)||[""])[0])}
 // piala tanpa klasemen tidak dinilai kurang; liga tanpa klasemen tetap dinilai
 F.AN.lg[7]=null;assert(!F.dqOf({...x,lid:7,league:"Puchar Polski"},null).it.some(i=>i[0]==="Klasemen"));assert(F.dqOf({...x,lid:7,league:"Ekstraklasa"},null).it.some(i=>i[0]==="Klasemen"&&i[1]===0))}
console.log("test-ui V52 ok");
{// V53: tampilan reliabilitas
 const F=new Function(pre+`;return {relHtml,relLine,anHtml,setD:function(d){D=d}}`)();
 const q={n:900,ex:0.061,se:0.02,hit:48.5,stated:52.1,gap:-3.6},q2={n:900,ex:-0.01,se:0.018,hit:55,stated:54,gap:1};
 const h=F.relHtml({rl:{n:6759,cut:"2026-10-10T00:00:00Z",second:{lo:q,mid:q2,hi:q2},dif:0.071,dse:0.027,verdict:"lolos"}}).replace(/<[^>]+>/g," ").replace(/\s+/g," ");
 assert(/Reliabilitas analisis/.test(h)&&/Reliabilitas rendah 900 \+0,061 ± 0,04 48,5% 52,1% -3,6/.test(h)&&/Lolos uji/.test(h)&&!/undefined|NaN|null/.test(h),h);
 const h2=F.relHtml({rl:{n:6759,cut:"2026-10-10",second:{lo:q2,mid:q2,hi:q2},dif:0,dse:0.03,verdict:"tidak"}});assert(/Belum lolos/.test(h2)&&/tidak<\/b> ditampilkan per laga/.test(h2));assert.equal(F.relHtml({}),"");
 const x={eid:9,src:"BSD",lid:1,league:"Premier League",hid:1,aid:2,utc:new Date(Date.now()+36e5).toISOString(),status:"NS",home:{name:"A"},away:{name:"B"},p:{h:50,d:25,a:25,xg:[1,1]}};F.setD({matches:[x],week:["2026-11-20","2026-11-30"]});
 assert.equal(F.relLine(x),"","tanpa rel (uji belum lolos): tidak tampil");const l=F.relLine({...x,rel:{lv:0,n:120,ex:0.05,xg:true}}).replace(/<[^>]+>/g," ");
 assert(/Reliabilitas analisis: rendah/.test(l)&&/rekam jejak liga ini 120 laga, BSD cenderung terlalu yakin/.test(l)&&/bukan peluang menang/.test(l));
 assert(F.anHtml({...x,rel:{lv:2,n:500,ex:0,xg:true}},null).indexOf("Reliabilitas analisis: tinggi")>=0)}
console.log("test-ui V53 ok");
{// V54: watchlist
 const F=new Function(pre+`;return {wToggle,wHas,wChanges,wSnap,wHtml,wAct,wPrune,wLoad,card_0,rkCard,setD:function(d){D=d}}`)();
 const now=Date.now(),iso=t=>new Date(t).toISOString();
 const x={id:"b5",eid:5,src:"BSD",lid:1,league:"Premier League",hid:1,aid:2,utc:iso(now+3*36e5),status:"NS",home:{name:"Arsenal"},away:{name:"Chelsea"},score:[null,null],p:{h:50,d:25,a:25},bl:{h:48,d:26,a:26,xg:[1,1],ms:[1,0],k:[0,0]},pick:"h",edge:25,level:"Kuat"};
 const old={...x,eid:6,id:"b6",status:"FT",score:[1,0],utc:iso(now-60*36e5)};
 F.setD({matches:[x,old],week:["2026-11-20","2026-11-30"]});
 assert(!F.wHas(5));F.wToggle(5);assert(F.wHas(5),"ditambah");assert(F.card_0(x,1).includes('data-w="5"')&&F.card_0(x,1).includes("★"));assert(F.rkCard(x,0).includes('data-w="5"'));
 const s0=F.wLoad().items["5"].s;assert.deepEqual(F.wChanges(x,s0),[],"tanpa perubahan: tidak ada peringatan");
 // perubahan kecil (<3 poin) tidak dilaporkan; perubahan nyata dilaporkan
 assert.deepEqual(F.wChanges({...x,p:{h:52,d:24,a:24}},s0),[]);
 const y={...x,p:{h:56,d:23,a:21},bl:{...x.bl,h:40,d:28,a:32},utc:iso(now+4*36e5),lx:{sp:{t:"a",p:[50,25,25],bl:[48,26,26]},sx:{t:"b",p:[56,23,21],bl:[40,28,32],in:null,out:null}}};
 const c=F.wChanges(y,s0);assert(c.some(t=>/Jam kickoff berubah/.test(t))&&c.some(t=>/Peluang BSD berubah: 50\/25\/25 → 56\/23\/21/.test(t))&&c.some(t=>/Model BL berubah/.test(t))&&c.some(t=>/Line-up resmi keluar — peluang berubah berarti/.test(t)),JSON.stringify(c));
 assert.deepEqual(F.wChanges({...x,status:"LIVE",score:[0,0]},s0),["Laga dimulai."]);
 assert.deepEqual(F.wChanges({...x,status:"LIVE",score:[1,0]},{...s0,st:"LIVE",sc:[0,0]}),["Skor berubah: 0-0 → 1-0."]);
 assert.deepEqual(F.wChanges({...x,status:"FT",score:[2,1]},{...s0,st:"LIVE",sc:[2,1]}),["Selesai: 2-1."]);
 assert(/tidak ada lagi di jadwal/.test(F.wChanges(null,s0)[0]));
 // tampil sekali sampai ditandai sudah dilihat
 F.setD({matches:[y,old],week:["2026-11-20","2026-11-30"]});let h=F.wHtml().replace(/<[^>]+>/g," ").replace(/\s+/g," ");assert(/★ Pantauan 1 laga · 1 ada perubahan/.test(h)&&/Peluang BSD berubah/.test(h),h);
 F.wAct("seen:5");h=F.wHtml().replace(/<[^>]+>/g," ");assert(/tidak ada perubahan baru/.test(h)&&!/Peluang BSD berubah/.test(h),"sesudah dilihat: tidak diulang");
 // laga selesai >48 jam dibuang otomatis; hapus
 F.wToggle(6);assert(F.wHas(6));F.wPrune();assert(!F.wHas(6),"laga lama dibuang");F.wToggle(5);assert(!F.wHas(5));assert.equal(F.wHtml(),"");
 assert(!/undefined|NaN|null/.test(h))}
console.log("test-ui V54 ok");
{// V55: dampak line-up resmi
 const F=new Function(pre+`;return {luImpact,luImpactHtml}`)();
 const R=[{id:1,r:[1,0],sp:{p:[50,25,25],bl:[40,30,30]},sx:{p:[50,25,25],bl:[60,25,15],in:[["a","b"],[]],out:[["c","d"],[]]}},
   {id:2,r:[0,1],sp:{p:[50,25,25],bl:[50,25,25]},sx:{p:[50,25,25],bl:[52,25,23],in:[["a","b","c","d","e"],["x"]],out:[[],[]]}},
   {id:3,r:null,sp:{p:[50,25,25],bl:[50,25,25]},sx:{p:[50,25,25],bl:[50,25,25],in:null,out:null}},{id:4,r:[1,1],sp:null,sx:{bl:[1,1,98]}}];
 const X=F.luImpact(R);assert.equal(X.n,3);assert.equal(X.teams,4);assert.equal(X.avg,2);assert.deepEqual(X.dist,[1,2,0,1]);assert.equal(X.big,1);assert.equal(X.cmp.n,2);assert.equal(X.cmp.w,1);assert.equal(X.cmp.l,1);
 const h=F.luImpactHtml(R).replace(/<[^>]+>/g," ").replace(/\s+/g," ");assert(/Dampak line-up resmi/.test(h)&&/rata-rata 2 pemain per tim/.test(h)&&/Sampel masih kecil/.test(h)&&!/undefined|NaN|null/.test(h),h);assert.equal(F.luImpactHtml([]),"")}
console.log("test-ui V55 ok");
{const F=new Function(pre+`;return {drawRisk,setM:function(m){MBL=m}}`)();F.setM({drw:{rule:{pass:true,th:38,dm:28,test:{draw:34.1,base:24.6,bsdD:30.4}}}});
 const t=F.drawRisk({status:"NS",p:{h:35,d:30,a:35},bl:{d:29}});assert(/34,1%.*24,6%.*BSD sendiri sudah memperkirakan ±30,4%/.test(t),t)}
console.log("test-ui V35c ok");
{// V36: analisa langsung
 const F=new Function(pre+`;return {anHtml,liveProb,redsOf}`)();
 const x={eid:9,src:"BSD",status:"LIVE",min:63,score:[1,0],home:{name:"Brentford"},away:{name:"Everton"},p:{h:41,d:27,a:32,xg:[1.58,1.15]},bl:{xg:[1.67,1.25]}};
 const d={stats:{stats:{home:{xg:{actual:.4},total_shots:4,shots_on_target:1,big_chances:0,ball_possession:38},away:{xg:{actual:1.5},total_shots:12,shots_on_target:5,big_chances:3,ball_possession:62}},momentum:[{m:54,v:-30},{m:56,v:-40},{m:58,v:-20},{m:60,v:-35},{m:62,v:-25}]},
  incidents:[{type:"goal",minute:20,player:"K. Schade",is_home:true,home_score:1,away_score:0},{type:"card",minute:50,player:"J. Tarkowski",is_home:false,card_type:"red"}]};
 const t=F.anHtml(x,d).replace(/<[^>]+>/g," ").replace(/\s+/g," ");if(process.env.SHOW_AN)console.log(t);
 assert(/Menit 63 · Brentford 1-0 Everton/.test(t));assert(/Brentford unggul walau peluangnya lebih sedikit/.test(t));assert(/Everton lebih menekan/.test(t));
 assert(/Everton bermain dengan 10 orang sejak menit 50/.test(t));assert(/20' K\. Schade \(Brentford\) → 1-0/.test(t));assert(/Perkiraan hasil akhir: Brentford menang \d+%/.test(t));assert(!/undefined|NaN/.test(t),t);
 const p=F.liveProb(x,[0,1]),p0=F.liveProb(x,[0,0]);assert(Math.abs(p[0]+p[1]+p[2]-100)<1e-6&&p[0]>p0[0],"merah tamu menaikkan peluang tuan rumah");
 const e=F.liveProb({...x,min:90,score:[0,0]},[0,0]);assert(e[1]>85,"menit 90 imbang -> seri besar: "+e);
 const u=F.anHtml({...x,src:"HL",pend:1,min:null},null).replace(/<[^>]+>/g," ");assert(/Baru mulai/.test(u)&&/baru dimulai/.test(u)&&!/undefined|NaN/.test(u))}
console.log("test-ui V36 ok");

{// V37: bedah sesudah laga
 const F=new Function(pre+`;return {anHtml,whyMiss}`)();
 const x={eid:5,src:"BSD",status:"FT",score:[0,1],home:{name:"Brentford"},away:{name:"Everton"},p:{h:41,d:27,a:32},pm:{p:[46,26,28],bl:[48,25,27]}};
 const d={stats:{stats:{home:{xg:{actual:1.9},total_shots:15,shots_on_target:6},away:{xg:{actual:.5},total_shots:5,shots_on_target:2}}},incidents:[{type:"goal",minute:70,player:"I. Ndiaye",is_home:false,home_score:0,away_score:1}]};
 const t=F.anHtml(x,d).replace(/<[^>]+>/g," ").replace(/\s+/g," ");if(process.env.SHOW_AN)console.log(t);
 assert(/Selesai · Brentford 0-1 Everton — Everton menang/.test(t));assert(/BSD: 46 \/ 26 \/ 28 → menebak menang Brentford ❌ meleset/.test(t));assert(/Model BL: 48/.test(t));
 assert(/Everton menang beruntung/.test(t));assert(/Kurang beruntung/.test(t));assert(!/undefined|NaN/.test(t),t);
 assert.equal(F.whyMiss(0,[0,1],[1.9,.5],[null,null],null),"apes");assert.equal(F.whyMiss(0,[0,1],[1,1],[60,null],null),"merah");assert.equal(F.whyMiss(0,[1,1],[1.2,1],[null,null],[1,0]),"telat");assert.equal(F.whyMiss(0,[1,0],[1,1],[null,null],null),null);
 const ok=F.anHtml({...x,score:[2,0]},d).replace(/<[^>]+>/g," ");assert(/✅ benar/.test(ok)&&/sesuai hasil/.test(ok));
 const nd=F.anHtml({...x,pm:null,src:"HL",p:{h:60,d:25,a:15}},null).replace(/<[^>]+>/g," ");assert(/xG tidak tersedia/.test(nd)&&!/undefined|NaN/.test(nd))}
{const F=new Function(pre+`;return {anHtml}`)();const x={eid:6,src:"BSD",status:"FT",score:[3,1],home:{name:"A"},away:{name:"B"},pm:{p:[66,21,13]}};
 const g=(m,h,hs,as)=>({type:"goal",minute:m,is_home:h,home_score:hs,away_score:as});
 const t1=F.anHtml(x,{incidents:[g(10,true,1,0),g(30,true,2,0),g(60,true,3,0),g(90,false,3,1)]}).replace(/<[^>]+>/g," ");assert(!/mengubah hasil/.test(t1),"gol akhir yang tidak mengubah hasil tidak disebut");
 const t2=F.anHtml({...x,score:[1,1]},{incidents:[g(10,true,1,0),g(88,false,1,1)]}).replace(/<[^>]+>/g," ");assert(/Gol menit 88 \(B\) mengubah hasil/.test(t2),t2)}
console.log("test-ui V37 ok");

{const F=new Function(pre+`;return {shortNm,anHtml}`)();assert.equal(F.shortNm("Atlético San Luis"),"San Luis");assert.equal(F.shortNm("Sporting Kansas City"),"Kansas City");assert.equal(F.shortNm("Arsenal"),"Arsenal");
 const x={eid:1,src:"BSD",status:"FT",score:[1,1],home:{name:"Puebla"},away:{name:"San Luis"},pm:{p:[37,27,35]}};const t=F.anHtml(x,{stats:{stats:{home:{xg:{actual:1.09}},away:{xg:{actual:1.67}}}}}).replace(/<[^>]+>/g," ");
 assert(/Imbang, padahal\s+San Luis lebih banyak peluang/.test(t)&&/Salah baca/.test(t)&&!/seimbang; hasil ini wajar/.test(t),t)}
console.log("test-ui V38c ok");
{const F=new Function(pre+`;return {teamTag}`)();const w=Object.keys(new Function(pre+";return WOMEN")());const lgP=w.find(l=>/Putri/.test(new Function(pre+";return lgLabel")()(l)));
 if(lgP)assert.equal(F.teamTag({league:lgP},{name:"X"}),"","liga sudah bertanda Putri -> tidak ada tanda dobel");assert(/Tim muda/.test(F.teamTag({league:"Eerste Divisie"},{name:"Jong Ajax"})));
 assert(/order\.sort\(\);if\(S\.st==="FT"\)order\.reverse\(\)/.test(html),"Selesai terbaru dulu")}
console.log("test-ui V38d ok");

{const F=new Function(pre+`;return {resTag}`)();const b={status:"FT",pick:"h",p:{h:60,d:25,a:15},home:{name:"A"},away:{name:"B"}};
 assert(/✓ Tepat/.test(F.resTag({...b,score:[2,0]})));assert(/✕ Meleset/.test(F.resTag({...b,score:[0,1]})));assert(/~ Imbang/.test(F.resTag({...b,score:[1,1]})));
 assert.equal(F.resTag({...b,status:"NS",score:[null,null]}),"");assert(/✓ Tepat/.test(F.resTag({...b,p:{h:30,d:40,a:30},score:[0,0]})),"tebakan seri tepat")}
console.log("test-ui V38e ok");

{// V39: label dari angka nyata, laga terbuka = "tidak kalah", liga sulit dari catatan langsung
 const F=new Function(pre+`;return {cfTag,isOpen,openTxt,resTag,riskOf,setG:function(b,e){BT=b;EV=e}}`)();
 F.setG({calib:[{lo:0,hi:40,n:500,hit:37},{lo:40,hi:50,n:900,hit:46},{lo:50,hi:60,n:700,hit:55},{lo:60,hi:70,n:400,hit:69},{lo:70,hi:101,n:300,hit:81}]},{byLeague:{"J1 League":{n:10,acc:20}}});
 const b={status:"FT",pick:"h",home:{name:"Brentford"},away:{name:"Everton"},p:{h:41,d:27,a:32},score:[1,1]};
 assert(/Terbuka · 46% menang/.test(F.cfTag(b)),F.cfTag(b));assert(/Unggul jelas · 69% menang/.test(F.cfTag({...b,p:{h:64,d:22,a:14}})));assert(/Cukup · 55% menang/.test(F.cfTag({...b,p:{h:52,d:26,a:22}})));
 assert(F.isOpen(b)&&!F.isOpen({...b,p:{h:52,d:26,a:22}}));assert(/<b>Brentford<\/b> tidak kalah 68%/.test(F.openTxt(b)));
 assert(/✓ Tepat/.test(F.resTag(b)),"terbuka + imbang = tidak kalah tepat");assert(/Tepat · seri/.test(F.resTag(b)),"V44b: seri ditandai jelas");assert(/Tepat · menang/.test(F.resTag({...b,score:[2,0]}))||/Tepat · menang/.test(F.resTag({...b,score:[0,2]})),"V44b: menang ditandai");assert(/✕ Meleset/.test(F.resTag({...b,score:[0,1]})));assert(/✓ Tepat/.test(F.resTag({...b,score:[2,0]})));
 assert(/~ Imbang/.test(F.resTag({...b,p:{h:55,d:25,a:20},score:[1,1]})),"bukan terbuka: imbang tetap ~");
 assert(/pm/.test("pm")&&/Terbuka/.test(F.cfTag({...b,p:{h:70,d:20,a:10},pm:{p:[41,27,32]}})),"laga selesai memakai tebakan sebelum kickoff");
 const r=F.riskOf({status:"NS",src:"BSD",league:"J1 League",home:{name:"A"},away:{name:"B"},p:{h:45,d:27,a:28}});assert(r.some(t=>/BSD baru benar 2 dari 10 laga/.test(t)),r);
 assert(/Unggulan kuat \(≥60%\)/.test(html))}
// V40: tabel uji xG vs peluang BSD di tab Evaluasi
{const F=new Function(pre+";return {xcHtml}")();const X={n:5667,thr:{"0":{n:998,pick:{win:45.6,bsd:44.6},xg:{win:28.7,bsd:28.9,gap:-.2,se:1.4},draw:25.8},"0.5":{n:141,pick:{win:44,bsd:48.7},xg:{win:32.6,bsd:26.3,gap:6.4,se:3.9},draw:23.4}},blendConf:{hold:{base:{ll:.975},rule:{ll:.975}}},verdict:"tidak"};
 const h=F.xcHtml({xc:X});assert(h.includes("Tidak lolos uji")&&h.includes("5.667 laga")&&h.includes("+6,4 ± 7,8")&&h.includes("berapa pun"),h);
 assert(F.xcHtml({xc:{...X,verdict:"konflik"}}).includes("Lolos uji"));assert.equal(F.xcHtml({}),"");assert.equal(F.xcHtml({xc:{n:10,note:"x"}}),"")}
// V41: 3 skor teratas, bukan 1-1 BSD saja
{const F=new Function(pre+";return {sc3}")();
 const a=F.sc3({bl:{xg:[1.6,0.9],ms:[1,0]}},{score:{most_likely:"1-1"}});assert((a.match(/ · /g)||[]).length===2&&a.startsWith("1-0 <small>")&&a.includes("(Model BL)")&&!a.includes("BSD"),a);
 const b=F.sc3({p:{}},{expected_goals:{home:2.2,away:0.6},score:{most_likely:"1-1"}});assert(b.includes("dari xG BSD")&&/^(2-0|1-0)/.test(b),b);
 assert.equal(F.sc3({},{score:{most_likely:"1-1"}}),"1-1 <small>(BSD)</small>");assert.equal(F.sc3({},null),"-")}
// V42: Rangkuman harian
{const F=new Function(pre+";return {rkDay,rkList,rkLine,rkCard,rkText,renderRk,setD:function(d){D=d}}")();
 const iso=t=>new Date(t).toISOString(),mid=Date.parse("2026-11-24T04:00:00Z"),td="2026-11-24";   // 12.00 WITA
  const mk=(id,h,d,a,st,o={})=>({id:"b"+id,eid:id,src:"BSD",status:st,utc:iso(mid+id*6e4),league:"Premier League",home:{name:"Home"+id},away:{name:"Away"+id},score:st==="NS"?[null,null]:[2,0],p:{h,d,a},level:"Sedang",edge:Math.abs(h-a),pick:h>=a?"h":"a",...o});
 F.setD({matches:[mk(1,40,30,30,"NS"),mk(2,70,18,12,"NS",{bl:{h:68,d:19,a:13,xg:[2.1,0.7],ms:[2,0]}}),mk(3,55,25,20,"FT",{pm:{p:[55,25,20]},utc:iso(mid-72e5)}),mk(4,30,26,44,"NS",{utc:iso(mid+2*864e5)}),mk(5,50,25,25,"NS",{np:1}),mk(6,60,22,18,"NS",{utc:"2026-11-24T17:45:00Z"}),mk(7,65,20,15,"FT",{utc:"2026-11-23T20:00:00Z"})]});
 const z=F.rkDay(mid),z2=F.rkDay(Date.parse("2026-11-24T21:00:00Z")),z3=F.rkDay(Date.parse("2026-11-24T20:30:00Z"));
 assert.equal(iso(z.t0),"2026-11-23T22:00:00.000Z");assert.equal(z.td,"2026-11-24");assert.equal(z2.td,"2026-11-24","05.00 WITA masih hari bola kemarin");assert.equal(z3.td,"2026-11-24");
 assert.equal(F.rkDay(Date.parse("2026-11-24T22:00:00Z")).td,"2026-11-25","06.00 WITA hari bola baru");
 const R=F.rkList(mid);assert.deepEqual(R.A.map(x=>x.eid),[2,6,1],"urut paling jelas, hari bola (laga 01.45 WITA ikut), tanpa np, tanpa laga kemarin");assert.deepEqual(R.F.map(x=>x.eid),[3]);
 const c=F.rkCard(R.A[0],0);assert(c.includes("Home2</b> diunggulkan 70%")&&c.includes("Skor: 2-0 <small>")&&c.includes("data-mc=\"2\"")&&F.rkCard({...R.A[0],eid:null},0).indexOf("data-mc")<0,c);
 assert(F.rkLine(R.A[2]).includes("tidak kalah"),"laga terbuka ditulis tidak kalah: "+F.rkLine(R.A[2]));
 assert(F.rkCard(R.F[0],0).includes("Tepat"),"laga selesai diberi tanda hasil");
 {const L1={...R.A[0],status:"LIVE",pend:1,pendLate:0,score:[null,null]},L2={...L1,pend:0,min:55,score:[1,0]},F2={...R.F[0],score:[1,1],et:[1,0],pen:null};
  const c1=F.rkCard(L1,0),c2=F.rkCard(L2,0),c3=F.rkCard(F2,0);assert(c1.includes("Baru mulai")&&!/null/.test(c1),c1);assert(c2.includes("55'")&&c2.includes("1 - 0"),c2);assert(c3.includes("PW 2-1"),c3);
  assert(c2.includes('role="button" tabindex="0"'))}
 const tx=F.rkText(mid);assert(tx.startsWith("Rangkuman harian Bola Live - "+td)&&tx.includes("1. ")&&tx.includes("SUDAH SELESAI")&&!/<[a-z]/.test(tx),tx)}
// V42e: uji acak kasus aneh di semua fungsi tampilan utama (tidak boleh error / undefined / NaN / null / Infinity)
{const F=new Function(pre+";return {prMk,card,row,card_0,row_0,rkCard_0,cardDet,rkCard,rkLine,rkText,cfTag,resTag,sc3,riskOf,anHtml,setD:function(d){D=d}}")();
 let sd=11;const rn=()=>(sd=(sd*16807)%2147483647)/2147483647,pick=a=>a[Math.floor(rn()*a.length)];
 const BAD=/\bundefined\b|\bNaN\b|\bnull\b|Infinity|\[object/;const now=Date.now();let n=0;
 const mk=i=>{const st=pick(["NS","NS","LIVE","FT","FT"]),h=rn()*70+5,d=rn()*(95-h)*.6,a=100-h-d,hasP=rn()>.1;
  const x={id:"b"+i,eid:rn()>.1?1000+i:null,src:pick(["BSD","BSD","HL"]),status:st,league:pick(["Premier League","Liga 1","Copa del Rey","Liga F","Eerste Divisie"]),lc:pick([null,"ID","ES"]),
   utc:new Date(now+(st==="NS"?(rn()*48-6)*36e5:-(rn()*20)*36e5)).toISOString(),home:{name:pick(["Jong Ajax","Real Madrid","San Luis","Persib Bandung","A"])},away:{name:pick(["RC Lens","Kansas City","B","Borussia Mönchengladbach"])},
   score:st==="NS"?[null,null]:rn()>.2?[Math.floor(rn()*4),Math.floor(rn()*4)]:[null,null],min:st==="LIVE"&&rn()>.3?Math.floor(rn()*95):null,ht:st==="LIVE"&&rn()>.8?1:0,pend:st==="LIVE"&&rn()>.7?1:0,pendLate:rn()>.5?1:0,
   level:pick(["Tipis","Sedang","Kuat"]),edge:Math.abs(h-a),pick:h>=a?"h":"a",np:hasP?0:1};   // data asli: tanpa p <=> np
  if(hasP)x.p={h,d,a,xg:rn()>.3?[rn()*2.5,rn()*2]:null,ou:rn()>.3?rn()*100:null,bt:rn()>.3?rn()*100:null};
  if(st==="FT"&&rn()>.2&&hasP)x.pm={p:[h,d,a]};if(st==="FT"&&rn()>.85&&x.score[0]!=null){x.et=[Math.floor(rn()*2),Math.floor(rn()*2)];if(rn()>.5)x.pen=[4,3]}
  if(rn()>.4)x.bl={h:h+1,d,a:a-1,xg:[rn()*2.5,rn()*2],ms:pick([[1,0],[1,1],[2,1]]),ou:50,bt:50,src:pick(["xi","abs"]),lsrc:pick(["pred","xi",null]),lu:rn()>.5?[.8,.95,.9,.7]:null,k:pick([[2,0],[0,0],[0,3]])};   // data asli: bl selalu punya xg, ms, k
  if(rn()>.5)x.cf={k:pick(["jelas","cukup","terbuka"]),hit:rn()>.3?50+rn()*20:null,n:300};
  if(rn()>.5)x.why=["Klasemen menipu: A #3"];if(rn()>.6){const nh=Math.floor(rn()*6),na=Math.floor(rn()*6),L=n=>Array.from({length:n},(_,j)=>["Pemain "+j,pick(["i","s","d"])]);x.ab={h:L(nh),a:L(na),nh,na}}if(x.bl&&rn()>.5)x.bl.mi=[["P. Satu"],[]];return x};
 const M=[];for(let i=0;i<400;i++)M.push(mk(i));F.setD({matches:M,week:["2026-11-20","2026-11-30"]});
 for(const x of M){for(const [nm,f] of [["card",()=>F.card_0(x,1)],["row",()=>F.row_0(x)],["cardDet",()=>F.cardDet(x)],["cfTag",()=>F.cfTag(x)],["resTag",()=>F.resTag(x)],["sc3",()=>F.sc3(x,null)],["risk",()=>F.riskOf(x).join(" ")],
   ["rkCard",()=>x.p&&!x.np?F.rkCard_0(x,0):""],["rkLine",()=>x.p&&!x.np?F.rkLine(x):""],["anHtml",()=>F.anHtml(x,null)],["prMk",()=>x.p&&!x.np?F.prMk(x,null,null):""]]){
  let o;try{o=String(f()??"")}catch(e){assert.fail("fuzz "+nm+" error: "+e.message+" "+JSON.stringify(x))}
  const tx=o.replace(/<[^>]*>/g," ");if(BAD.test(tx))assert.fail("fuzz "+nm+" teks rusak: "+tx.match(new RegExp(".{0,60}"+BAD.source+".{0,30}"))[0]+" | "+JSON.stringify({st:x.status,sc:x.score,pend:x.pend,p:!!x.p,bl:!!x.bl,et:x.et}));n++}}
 {const y={...M.find(x=>x.bl&&x.p&&x.status==="NS"&&x.eid)},z={...y,bl:{...y.bl,ms:null,xg:null,k:null}};const o=F.card(z,1)+F.row(z);assert(!/undefined|NaN/.test(o)&&o.includes("data-mc"),"pengaman kartu: "+o.slice(0,200))}
 const t=F.rkText();assert(!BAD.test(t),"fuzz rkText: "+t.match(new RegExp(".{0,60}"+BAD.source+".{0,30}")));
 console.log("fuzz UI ok: "+n+" tampilan")}
// V42e: peluang live tidak 0%/100%; klasemen laga persahabatan disingkirkan
{const F=new Function(pre+";return {pcC,realTbl,anSit}")();
 assert.equal(F.pcC(0),"&lt;1%");assert.equal(F.pcC(100),"&gt;99%");assert.equal(F.pcC(42.4),"42%");assert.equal(F.pcC(99.4),"99%");
 assert(!F.realTbl("Club Friendlies",3164)&&!F.realTbl("Liga X",500)&&F.realTbl("Premier League",20)&&F.realTbl("Campeonato de Portugal",56)&&F.realTbl("Liga 2 Indonesia",0));
 const st=Array.from({length:30},(_,i)=>({position:i+1,team_id:i+1,pts:60-i,played:10}));
 assert.equal(F.anSit({hid:1,aid:2},{name:"Club Friendlies",standings:st}),null,"laga persahabatan: tanpa situasi klasemen")}
{const F=new Function(pre+";return {restTxt}")();assert.equal(F.restTxt({own:-.01,opp:0}),"gol sendiri -1%, kebobolan hampir tetap");assert.equal(F.restTxt({own:0,opp:.001}),"hampir tidak berpengaruh");assert.equal(F.restTxt(null),"hampir tidak berpengaruh")}
// V43: versi cetak Rangkuman
{const F=new Function(pre+";return {prHtml,prMk,prForm,prPos,prDay,rkList,setD:function(d){D=d},setBT:function(b){BT=b}}")();
 const mid=Date.parse("2026-11-24T04:00:00Z"),iso=t=>new Date(t).toISOString();
 const mk=(id,h,d,a,st,o={})=>({id:"b"+id,eid:id,lid:4,hid:10+id,aid:50+id,src:"BSD",status:st,utc:iso(mid+id*36e5),league:"Serie A",home:{name:"Home"+id},away:{name:"Away"+id},score:st==="NS"?[null,null]:[2,1],p:{h,d,a,ou:55,bt:52},level:"Sedang",edge:Math.abs(h-a),pick:h>=a?"h":"a",...o});
 const M=[mk(1,70,18,12,"NS",{cf:{k:"jelas",hit:69.1,n:531},bl:{h:66,d:20,a:14,xg:[2,.8],ms:[2,0],src:"xi",mi:[["P. Inti"],[]],k:[1,0]},ab:{h:[["P. Inti","i"]],a:[],nh:1,na:0},why:["Klasemen menipu: Away1 #3"]}),
   mk(2,40,30,30,"NS",{cf:{k:"terbuka",hit:41,n:900}}),mk(3,52,25,23,"NS",{cf:{k:"cukup",hit:52,n:700},bl:{h:30,d:30,a:40,xg:[1,1.2],ms:[1,1],src:"abs",k:[0,0]}}),mk(4,60,22,18,"FT",{pm:{p:[60,22,18]},utc:iso(mid-36e5)})];
 F.setD({matches:M,allInfo:{updated:iso(mid)}});F.setBT({acc:52.8,n:5968,calib:[]});
 const R=F.rkList(mid),DX={1:{form:{home:{overall:{form:"WWDLW"}},away:{overall:{form:"LLDWL"}}},h2h:{total_matches:5,home_wins:3,draws:1,away_wins:1},lineups:{lineup_status:"confirmed"}}};
 const LG={4:{name:"Serie A",standings:Array.from({length:20},(_,i)=>({position:i+1,team_id:[11,51][i]||100+i,pts:40-i}))}};
 const h=F.prHtml(R,DX,LG,mid),tx=h.replace(/<[^>]*>/g,"").replace(/&nbsp;/g," ").replace(/\s+/g," ");
 for(const w of ["Cara membaca","Jadwal ringkas","Unggul jelas (1 laga)","Cukup (1 laga)","Terbuka (1 laga)","Sudah selesai (1 laga","dari 531 laga lama","Form 5 laga: Home1 MMSKM (10 poin)","terbaru di kiri (M = menang","klasemen #1 dari 20","H2H 5 laga","Line-up: resmi","Absen","P. Inti","Model BL sepakat","Model BL berbeda","Lebih dari 2,5 gol: 55%","Klasemen menipu","1/3 line-up resmi","Unggul jelas (1 laga)","Waspada","5.968 laga","Selasa"])assert(tx.includes(w),"cetak harus memuat: "+w);
 assert(!/\bundefined\b|\bNaN\b|\bnull\b|Infinity/.test(tx),"cetak bersih: "+(tx.match(/.{0,40}(undefined|NaN|null|Infinity).{0,20}/)||[""])[0]);
 assert((h.match(/<tr>/g)||[]).length>=5,"tabel jadwal");assert.equal(F.prForm({overall:{form:"WD"}}).replace(/<[^>]*>/g,""),"MS");assert(F.prForm({overall:{form:"WWDLW"}}).includes('<span class="p-L">K</span>'));assert.equal(F.prForm(null),null);
 assert.equal(F.prPos({name:"Club Friendlies",standings:[{team_id:1,position:1970}]},1),null);
 assert.deepEqual(F.prPos({name:"Serie C",grouped:true,groups:{A:Array.from({length:20},(_,i)=>({team_id:i+1,position:i+1,pts:1}))}},3),{p:3,n:20,pts:1,g:1});
 {const k=F.prMk(M[2],null,LG).replace(/<[^>]*>/g,"");assert(!/ - ·|Away3 -/.test(k),"tanpa form: tidak ada tanda '-': "+k);assert(!/Klasemen: [^|]*klasemen/.test(k),"tanpa kata dobel: "+k)}
 const h2=F.prHtml(R,{},{},mid);assert(!/\bundefined\b|\bNaN\b|\bnull\b/.test(h2.replace(/<[^>]*>/g," ")),"cetak tanpa detail tetap bersih")}
console.log("test-ui V39 ok");
