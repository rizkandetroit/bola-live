// Tes util jaringan & pemeriksaan awal (preflight) yang dipakai workflow.
// (Tes integrasi mesin lama update.mjs/football-data.org dihapus bersama mesinnya.)
import assert from "node:assert";
import {siteBase,cleanKey,outDir} from "./net.mjs";
import {checkPages,checkBranch} from "./preflight.mjs";

// ---- unit: util & preflight ----
assert.equal(siteBase({GITHUB_REPOSITORY:"Rizkan/Bola-Live"}),"https://rizkan.github.io/Bola-Live/");
assert.equal(siteBase({GITHUB_REPOSITORY:"rizkan/rizkan.github.io"}),"https://rizkan.github.io/");
assert.equal(siteBase({SITE_URL:"http://x/y"}),"http://x/y/");assert.equal(siteBase({}),null);
assert.equal(cleanKey(' "abc"\n'),"abc");assert.equal(cleanKey(undefined),"");
assert.equal(outDir("file:///a/b/scripts/x.mjs",{OUT_DIR:"/tmp/o"}),"/tmp/o/");
assert.equal(checkPages(404,null).level,"error");assert.equal(checkPages(200,{build_type:"legacy"}).level,"error");
assert.equal(checkPages(200,{build_type:"workflow"}).level,"ok");assert.equal(checkPages(403,null).level,"warn");
assert.equal(checkBranch("main","main").level,"ok");assert.equal(checkBranch("dev","main").level,"warn");
console.log("util & preflight ok");
