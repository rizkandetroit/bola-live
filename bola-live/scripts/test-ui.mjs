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
 assert(/19 Feb 2026/.test(F.h2d("2026-02-19")),F.h2d("2026-02-19"));assert(html.includes(">V42</span>")&&html.includes("Favorit belum main")&&!html.includes("Rata-rata keunggulan</span>"))}
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
 assert(/✓ Tepat/.test(F.resTag(b)),"terbuka + imbang = tidak kalah tepat");assert(/✕ Meleset/.test(F.resTag({...b,score:[0,1]})));assert(/✓ Tepat/.test(F.resTag({...b,score:[2,0]})));
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
{const F=new Function(pre+";return {rkList,rkLine,rkCard,rkText,renderRk,setD:function(d){D=d}}")();
 const N=Date.now(),iso=t=>new Date(t).toISOString(),dk=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Makassar"}),td=dk.format(new Date(N));
 const mid=Date.parse(td+"T04:00:00Z");   // 12.00 WITA hari ini
 const mk=(id,h,d,a,st,o={})=>({id,eid:id,src:"BSD",status:st,utc:iso(mid+id*6e4),league:"Premier League",home:{name:"Home"+id},away:{name:"Away"+id},score:st==="NS"?[null,null]:[2,0],p:{h,d,a},level:"Sedang",edge:Math.abs(h-a),pick:h>=a?"h":"a",...o});
 F.setD({matches:[mk(1,40,30,30,"NS"),mk(2,70,18,12,"NS",{bl:{h:68,d:19,a:13,xg:[2.1,0.7],ms:[2,0]}}),mk(3,55,25,20,"FT",{pm:{p:[55,25,20]},utc:iso(mid-72e5)}),mk(4,30,26,44,"NS",{utc:iso(mid+2*864e5)}),mk(5,50,25,25,"NS",{np:1})]});
 const R=F.rkList(mid);assert.deepEqual(R.A.map(x=>x.id),[2,1],"urut paling jelas, hanya hari ini, tanpa np");assert.deepEqual(R.F.map(x=>x.id),[3]);
 const c=F.rkCard(R.A[0],0);assert(c.includes("Home2</b> diunggulkan 70%")&&c.includes("Skor: 2-0 <small>")&&c.includes("data-mc=\"2\""),c);
 assert(F.rkLine(R.A[1]).includes("tidak kalah"),"laga terbuka ditulis tidak kalah: "+F.rkLine(R.A[1]));
 assert(F.rkCard(R.F[0],0).includes("Tepat"),"laga selesai diberi tanda hasil");
 const tx=F.rkText(mid);assert(tx.startsWith("Rangkuman harian Bola Live - "+td)&&tx.includes("1. ")&&tx.includes("SUDAH SELESAI")&&!/<[a-z]/.test(tx),tx)}
console.log("test-ui V39 ok");
