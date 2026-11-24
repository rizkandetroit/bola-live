// V19: tes pemeriksa sebelum tayang (guard.mjs)
import assert from "node:assert/strict";import {spawnSync} from "node:child_process";import {mkdtempSync,writeFileSync,mkdirSync,existsSync,readFileSync} from "node:fs";import {tmpdir} from "node:os";import {join,dirname} from "node:path";import {fileURLToPath} from "node:url";
import {counts,check,RULES,health} from "./guard.mjs";
const here=dirname(fileURLToPath(import.meta.url));
const mk=()=>{const d=mkdtempSync(join(tmpdir(),"g-"));mkdirSync(join(d,"state"));mkdirSync(join(d,"site"));mkdirSync(join(d,"prev"));return d};
const put=(d,f,o)=>writeFileSync(join(d,f),JSON.stringify(o));
const rows=n=>({rows:Array.from({length:n},(_,i)=>[i,0,1,2,3,1,0,0])});
// hitung isi
{const d=mk();put(d,"state/results.json",rows(1500));put(d,"state/bsd-history.json",Array(300).fill({}));put(d,"state/hl.json",{matches:{a:[1,2],b:[3]}});
 const c=counts(join(d,"state")+"/");assert.equal(c["results.json"],1500);assert.equal(c["bsd-history.json"],300);assert.equal(c["hl.json"],3);assert.equal(c["xg.json"],undefined)}
// aturan
assert.deepEqual(check({"results.json":2000},{"results.json":1900}),[]);
assert.equal(check({"results.json":2000},{"results.json":100}).length,1,"riwayat anjlok -> ditolak");
assert.deepEqual(check({"results.json":500},{"results.json":10}),[],"data awal yang masih kecil boleh berubah");
assert.equal(check({"hl.json":120},{"hl.json":0}).length,1,"status Highlightly kosong -> ditolak (kasus 20 Nov)");
const run=(d,mode,env={})=>spawnSync(process.execPath,[join(here,"guard.mjs"),mode],{env:{PATH:process.env.PATH,STATE_DIR:join(d,"state"),OUT_DIR:join(d,"site"),PREV_DIR:join(d,"prev"),GUARD_TMP:join(d,"before.json"),...env},encoding:"utf8"});
// alur normal: before -> after sama -> lulus, ringkasan tayang, cadangan pertama diminta
{const d=mk();put(d,"state/results.json",rows(1500));put(d,"state/hl.json",{matches:{a:Array(30).fill(1)}});put(d,"prev/all.json",{matches:Array(200).fill({})});
 assert.equal(run(d,"before").status,0);put(d,"site/all.json",{matches:Array(190).fill({})});
 const o=run(d,"after",{GITHUB_OUTPUT:join(d,"gh.txt")});assert.equal(o.status,0,o.stdout+o.stderr);
 assert(existsSync(join(d,"site/state-manifest.json")));assert.match(readFileSync(join(d,"gh.txt"),"utf8"),/backup=1/);
 const o2=run(d,"after",{GITHUB_OUTPUT:join(d,"gh2.txt")});assert.match(readFileSync(join(d,"gh2.txt"),"utf8"),/backup=0/,"cadangan sekali per hari")}
// status Highlightly terhapus (kasus 20 Nov) -> dikembalikan dari snapshot, run tetap lanjut
{const d=mk();put(d,"state/hl.json",{matches:{a:Array(30).fill(1)}});put(d,"prev/all.json",{matches:[]});run(d,"before");
 put(d,"state/hl.json",{matches:{}});put(d,"site/all.json",{matches:[]});const o=run(d,"after",{GITHUB_OUTPUT:join(d,"gh.txt")});assert.equal(o.status,0,o.stdout+o.stderr);
 assert.match(o.stdout,/DIKEMBALIKAN.*hl\.json: 30 -> 0/);assert.equal(counts(join(d,"state")+"/")["hl.json"],30,"isi lama kembali");assert.match(readFileSync(join(d,"gh.txt"),"utf8"),/restored=1/);
 assert(existsSync(join(d,"site/state-manifest.json")))}
// izin manual: penyusutan dibiarkan
{const d=mk();put(d,"state/hl.json",{matches:{a:Array(30).fill(1)}});put(d,"prev/all.json",{matches:[]});run(d,"before");
 put(d,"state/hl.json",{matches:{}});put(d,"site/all.json",{matches:[]});assert.equal(run(d,"after",{GUARD_ALLOW_SHRINK:"1"}).status,0);assert.equal(counts(join(d,"state")+"/")["hl.json"],0)}
// tanpa snapshot (patokan dari luar) -> tidak bisa dipulihkan -> gagal, ringkasan tidak ditulis
{const d=mk();writeFileSync(join(d,"before.json"),JSON.stringify({c:{"hl.json":30}}));put(d,"state/hl.json",{matches:{}});put(d,"site/all.json",{matches:[]});
 const o=run(d,"after");assert.equal(o.status,1);assert.match(o.stderr,/hl\.json: 30 -> 0/);assert(!existsSync(join(d,"site/state-manifest.json")))}
// all.json anjlok -> gagal; all.json hilang -> gagal
{const d=mk();put(d,"prev/all.json",{matches:Array(500).fill({})});run(d,"before");put(d,"site/all.json",{matches:Array(20).fill({})});assert.equal(run(d,"after").status,1);
 const d2=mk();run(d2,"before");assert.equal(run(d2,"after").status,1,"all.json tidak ada")}
// kesehatan: model basi, Highlightly kosong, waktu mepet, Model BL tertinggal
{const d=mk(),NOW=Date.parse("2026-11-21T00:00:00Z");put(d,"site/all.json",{matches:[],bsd:{tm:{liga:5,latih:650}},errors:["x"]});put(d,"site/model-bl.json",{updated:"2026-11-18T00:00:00Z"});
 put(d,"site/bsd-eval.json",{bl:{n:150,model:{acc:48,ll:1.08},bsd:{acc:53,ll:.98}}});
 const H=health(join(d,"site")+"/",join(d,"state")+"/",{"hl.json":0},NOW);
 assert.equal(H.w.length,4,H.w.join("\n"));assert(H.w.some(x=>/Model BL belum dilatih ulang 72 jam/.test(x)));assert(H.w.some(x=>/Highlightly kosong/.test(x)));assert(H.w.some(x=>/650 detik/.test(x)));assert(H.w.some(x=>/jauh di bawah/.test(x)));
 const ok=health(join(d,"site")+"/",join(d,"state")+"/",{"hl.json":40},Date.parse("2026-11-18T10:00:00Z"));assert(!ok.w.some(x=>/Model BL belum/.test(x)))}
// ringkasan run tertulis ke halaman Actions
{const d=mk();put(d,"state/results.json",rows(1200));put(d,"prev/all.json",{matches:[]});run(d,"before");put(d,"site/all.json",{matches:[],bsd:{tm:{liga:3}}});
 const o=run(d,"after",{GITHUB_STEP_SUMMARY:join(d,"sum.md")});assert.equal(o.status,0);const md=readFileSync(join(d,"sum.md"),"utf8");assert(md.includes("Kesehatan data")&&md.includes("results.json | 1200"))}
{const d=mk();put(d,"state/rekam-index.json",{total:900,months:[]});assert.equal(counts(join(d,"state")+"/")["rekam-index.json"],900);assert.equal(check({"rekam-index.json":900},{"rekam-index.json":850}).length,1,"V50: arsip rekam jejak menyusut -> ditolak");assert.deepEqual(check({"rekam-index.json":900},{"rekam-index.json":950}),[])}
{// V51: Data Health Center
 const {dataHealth,matchHealth}=await import("./health.mjs");const now=Date.parse("2026-11-25T12:00:00Z"),H=36e5,iso=t=>new Date(t).toISOString();
 const d=mk(),S=join(d,"site")+"/";mkdirSync(S+"m");mkdirSync(S+"lg");
 const M=[{eid:1,lid:1,league:"Premier League",hid:10,aid:11,utc:iso(now+H),status:"NS",home:{name:"A"},away:{name:"B"},score:[null,null],p:{h:50,d:25,a:25,xg:[1,1],mv:"dc-blend-v1"},bl:{h:50,d:25,a:25}},
  {eid:2,lid:1,league:"Premier League",hid:12,aid:13,utc:iso(now+30*6e4),status:"NS",home:{name:"C"},away:{name:"D"},score:[null,null],p:{h:60,d:30,a:30}},             // jumlah 120% -> anomali
  {eid:3,lid:2,league:"Serie A",hid:14,aid:15,utc:iso(now-5*H),status:"LIVE",home:{name:"E"},away:{name:"F"},score:[1,0],p:{h:40,d:30,a:30}},                            // macet
  {eid:4,lid:2,league:"Serie A",hid:16,aid:17,utc:iso(now-3*H),status:"NS",home:{name:"G"},away:{name:"H"},score:[null,null],np:true},                                   // belum mulai padahal lewat
  {eid:5,lid:79,league:"Club Friendlies",hid:18,aid:19,utc:iso(now+2*H),status:"NS",home:{name:"I"},away:{name:"J"},score:[null,null],np:true},
  {eid:6,lid:1,league:"Premier League",hid:10,aid:11,utc:iso(now+H),status:"NS",home:{name:"A"},away:{name:"B"},score:[null,null],p:{h:50,d:25,a:25}},                    // ganda dengan eid 1
  {eid:7,lid:1,league:"Premier League",hid:20,aid:21,utc:iso(now-20*H),status:"FT",home:{name:"K"},away:{name:"L"},score:[null,null],p:{h:50,d:25,a:25}},                 // selesai tanpa skor
  {eid:8,lid:1,league:"Premier League",hid:22,aid:23,utc:iso(now+200*H),status:"NS",home:{name:"M"},away:{name:"N"},score:[null,null],p:{h:50,d:25,a:25}}];               // di luar jendela
 put(d,"site/all.json",{updated:iso(now-2*6e4),errors:["contoh: kuota habis"],bsd:{calls:10,mode:"light",fatal:false},hl:{today:17,cap:90,matches:45,leagues:6,errors:[]},matches:M});
 put(d,"site/m/1.json",{lineups:{lineup_status:"confirmed"},h2h:[{}],form:{home:{},away:{}}});put(d,"site/m/2.json",{lineups:{lineup_status:"predicted"},h2h:[]});
 put(d,"site/lg/1.json",{name:"Premier League",standings:[{team_id:10}]});put(d,"site/model-bl.json",{updated:iso(now-30*H),nMatches:900});put(d,"site/rekam-index.json",{updated:iso(now),total:500,st:{conflicts:0,dup:0}});
 const X=dataHealth(S,{now,guard:{fixed:[]},warn:[]}),ck=k=>X.checks.find(c=>c.k===k);
 assert.equal(X.matches.n,7,"jendela: 30 jam lalu - 72 jam ke depan + laga live/belum mulai yang lewat");assert.equal(X.matches.pred,5);assert.equal(X.matches.lu.need,3);assert.equal(X.matches.lu.confirmed,1);assert.equal(X.matches.lu.predicted,1);
 assert.equal(X.matches.tblNeed,6,"laga persahabatan tidak dihitung");assert.equal(X.matches.tbl,4);
 const kinds=X.anomalies.map(a=>a.k).sort();assert.deepEqual(kinds,["belum","ganda","macet","peluang","skor"],JSON.stringify(X.anomalies));
 assert.equal(ck("err").st,"warn");assert.equal(ck("bsd").st,"warn","kuota -> peringatan");assert.equal(ck("guard").st,"ok");assert.equal(ck("rekam").st,"ok");assert.equal(X.status,"warn");
 assert.equal(X.files["model-bl.json"],iso(now-30*H));assert.equal(X.files["pf.json"],null);assert.deepEqual(X.ver.bsd,{"dc-blend-v1":1});
 assert(X.leagues[0].lg==="Premier League"||X.leagues[0].lg==="Serie A");assert(/Z$/.test(X.updated));
 // data sehat -> ok; BSD fatal -> masalah; guard memulihkan -> peringatan
 put(d,"site/all.json",{updated:iso(now),errors:[],bsd:{calls:10},matches:[M[0]]});assert.equal(dataHealth(S,{now}).status,"ok");
 put(d,"site/all.json",{updated:iso(now),errors:[],bsd:{fatal:true},matches:[]});assert.equal(dataHealth(S,{now}).status,"bad");
 put(d,"site/all.json",{updated:iso(now),errors:[],bsd:{},matches:[]});assert.equal(dataHealth(S,{now,guard:{fixed:["results.json: 2000 -> 10"]}}).checks.find(c=>c.k==="guard").st,"warn");
 // data rusak tidak membuat pemeriksa gagal
 put(d,"site/all.json",{matches:[{status:"NS",utc:"bukan tanggal"},{status:"FT",utc:iso(now-H)},null].filter(Boolean)});assert.doesNotThrow(()=>dataHealth(S,{now}));
 assert.doesNotThrow(()=>dataHealth(join(d,"kosong")+"/",{now}));
 // guard "after" menulis health.json ke situs
 {const g=mk();put(g,"state/results.json",{rows:[]});put(g,"prev/all.json",{matches:[]});run(g,"before");put(g,"site/all.json",{updated:new Date().toISOString(),matches:[],bsd:{}});const o=run(g,"after");assert.equal(o.status,0,o.stderr);
  const hj=JSON.parse(readFileSync(join(g,"site/health.json"),"utf8"));assert(hj.v===1&&Array.isArray(hj.checks)&&hj.checks.length>=5,"health.json tayang")}}

console.log("guard ok");
