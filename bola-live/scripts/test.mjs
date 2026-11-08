import {readFileSync,rmSync} from "node:fs";
import {predict,league} from "./lib.mjs";
import assert from "node:assert";
const T=(id,pos,pts,gp,gf,ga)=>({position:pos,team:{id,name:"Tim"+id,shortName:"T"+id},playedGames:gp,points:pts,goalsFor:gf,goalsAgainst:ga});
const tb=[T(1,1,27,10,25,6),T(2,2,20,10,18,10),T(3,3,12,10,12,14),T(4,4,5,10,6,26)];
const base=league(tb);
const p1=predict(tb[0],tb[3],base),p2=predict(tb[3],tb[0],base),p3=predict(tb[1],tb[2],base);
assert(Math.abs(p1.h+p1.d+p1.a-100)<0.11);
assert(p1.h>p1.a&&p2.a>p2.h&&p3.h>p3.a);
assert(p1.h>p2.a,"keuntungan kandang");
console.log("model ok",p1,p2,p3);
process.env.FOOTBALL_DATA_KEY="x";process.env.GAP_MS="0";
const t0=Date.now(),iso=new Date(t0+3600e3).toISOString();
const ok=j=>({ok:true,status:200,json:async()=>j});
globalThis.fetch=async u=>{
  if(u.includes("/PL/standings"))return ok({standings:[{type:"TOTAL",table:tb}]});
  if(u.includes("/PL/matches"))return ok({matches:[
    {id:1,utcDate:iso,status:"TIMED",homeTeam:{id:1,shortName:"T1"},awayTeam:{id:4,shortName:"T4"},score:{fullTime:{home:null,away:null}}},
    {id:2,utcDate:iso,status:"IN_PLAY",homeTeam:{id:2,shortName:"T2"},awayTeam:{id:3,shortName:"T3"},score:{fullTime:{home:1,away:0}}},
    {id:3,utcDate:new Date(t0+9*864e5).toISOString(),status:"TIMED",homeTeam:{id:1},awayTeam:{id:2},score:{}},
    {id:4,utcDate:iso,status:"TIMED",homeTeam:{id:1},awayTeam:{id:99},score:{}}]});
  return {ok:false,status:403,json:async()=>({})};
};
await import("./update.mjs");
const d=JSON.parse(readFileSync(new URL("../site/data.json",import.meta.url)));
assert.equal(d.matches.length,2);assert.equal(d.errors.length,4);
assert.equal(d.matches.find(m=>m.id===2).status,"LIVE");assert.deepEqual(d.matches.find(m=>m.id===2).score,[1,0]);
assert.equal(d.matches.find(m=>m.id===1).pick,"h");
console.log("update ok");
rmSync(new URL("../site/data.json",import.meta.url));
