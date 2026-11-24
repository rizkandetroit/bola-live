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
console.log("guard ok");
