import assert from 'node:assert/strict';
import {buildTeamProfiles,buildMatchContext,predictV10,backtestV10} from './intelligence.mjs';

const now=Date.now(),D=864e5;
const teams={A:{id:'team_A',name:'Alpha'},B:{id:'team_B',name:'Beta'}};
const mkLine=(prefix,exclude=null)=>({formation:prefix==='A'?'4-3-3':'4-2-3-1',confirmed:true,coach:{name:'Coach '+prefix},starters:Array.from({length:11},(_,i)=>({player_id:prefix.toLowerCase()+(i+1),name:prefix+' Player '+(i+1),position_id:i+1})).filter(p=>p.player_id!==exclude),subs:[{player_id:prefix.toLowerCase()+'12',name:prefix+' Sub'}]});
const fixtures=[],details={};
for(let i=0;i<9;i++){
  const f={id:'match_'+i,league:{name:'Test League'},time_utc:new Date(now-(9-i)*D).toISOString(),status:'finished',home_team:teams.A,away_team:teams.B,score_home:i%3===0?2:1,score_away:i%2};
  fixtures.push(f);
  const mkPlayers=(prefix,teamId,boost)=>Array.from({length:11},(_,j)=>({
    player:{id:prefix.toLowerCase()+(j+1),name:prefix+' Player '+(j+1),shirt_number:j+1},team_id:teamId,minutes_played:j===0?90:75,
    possession_value:{vaep_total:boost+(j*.008),xt_total:.22+j*.006},creation:{xg_chain:.25+j*.01,xag:.05}
  }));
  details[f.id]={
    lineups:{home:mkLine('A'),away:mkLine('B')},
    advanced:{teams:[
      {team:teams.A,possession_value:{xt_total:1.1,vaep_total:.32},defending:{ppda:7.2},territory:{field_tilt:61,possession_pct:56,final_third_entries:42,box_entries:14},passing:{progressive_passes:32,passes:480},carrying:{progressive_carries:17}},
      {team:teams.B,possession_value:{xt_total:.6,vaep_total:.13},defending:{ppda:11.5},territory:{field_tilt:39,possession_pct:44,final_third_entries:25,box_entries:8},passing:{progressive_passes:21,passes:390},carrying:{progressive_carries:10}}
    ]},
    shots:{periods:[{period:'All',shots:[{team_id:'team_A',expected_goals:.35,x:88,y:30,event_type:'Goal'},{team_id:'team_B',expected_goals:.1,x:76,y:42,event_type:'AttemptSaved'}]}]},
    playerAdvanced:{players:[...mkPlayers('A','team_A',.28),...mkPlayers('B','team_B',.1)]}
  };
}
const profiles=buildTeamProfiles(fixtures,details,now,6);
assert.equal(profiles.team_A.n,6,'rolling profile is limited to six prior matches');
assert(profiles.team_A.xgFor>0&&profiles.team_A.xgAgainst>0,'xG/xGA are extracted from shot-level data');
assert(profiles.team_A.performance.score>profiles.team_B.performance.score,'team performance metrics should distinguish sides');
const upcoming={id:'future',league:{name:'Test League'},time_utc:new Date(now+D).toISOString(),status:'not_started',home_team:teams.A,away_team:teams.B};
const futureDetail={lineups:{home:mkLine('A','a1'),away:mkLine('B')}};
const ctx=buildMatchContext(upcoming,futureDetail,profiles);
assert(ctx.teams.home.lineup.available&&ctx.teams.away.lineup.available,'line-up strengths should be computed');
assert(ctx.teams.home.lineup.absences.some(x=>x.id==='a1'),'regular starter outside XI and bench should be flagged as an indication');
assert(ctx.tactical.available&&ctx.tactical.notes.length>0,'formation analysis should be generated');
const noPlayerProfile=buildMatchContext(upcoming,futureDetail,{});
assert.equal(noPlayerProfile.teams.home.lineup.score,null,'line-up component must remain unavailable without enough player history');
const p=predictV10({raw:{h:52,d:25,a:23},pe:{h:48,d:27,a:25},xg:[1.7,1.0],fr:[45,26,29]},ctx,{lambda:.05});
assert.equal(p.engine,'V10');assert(Math.abs(p.h+p.d+p.a-100)<.11,'1X2 probabilities should sum to 100');
assert(p.weights.lineup>0&&p.weights.xg>0&&p.weights.performance>0,'available intelligence components should receive normalized weights');
assert(p.ms&&p.ou>=0&&p.ou<=100&&p.bt>=0&&p.bt<=100,'score/OU/BTTS outputs should exist');
const bt=backtestV10(fixtures,details,{minGames:3});
assert(bt.n>=5&&bt.versions.v8&&bt.versions.v9&&bt.versions.v10,'three-version backtest should compare on the same sample');
assert(bt.versions.v10.brier>0&&bt.simulation.odds===2,'Brier and assumed-odds ROI simulation should be reported');

// Regression: a partial shot feed must not turn the opponent's xG into a false zero.
const partial={id:'partial',time_utc:new Date(now-2*D).toISOString(),status:'finished',home_team:teams.A,away_team:teams.B,score_home:1,score_away:0};
const partialDetails={partial:{
  stats:{periods:[{period:'1H',groups:[{items:[{key:'expected_goals',home:0.2,away:0.1}]}]},{period:'All',groups:[{items:[{key:'expected_goals',home:1.1,away:0.7}]}]}]},
  shots:{periods:[{period:'All',shots:[{team_id:'team_A',expected_goals:0.4,x:80,y:30}]}]},
  advanced:{teams:[{team:{id:'wrong-id'},possession_value:{xt_total:99}},{team:{id:'team_B'},possession_value:{xt_total:.3}}]}
}};
const partialProfiles=buildTeamProfiles([partial],partialDetails,now,6);
assert.equal(partialProfiles.team_A.xgFor,.4,'home xG should use shot total when shots exist');
assert.equal(partialProfiles.team_A.xgAgainst,.7,'missing away shot feed should fall back to full-match xG, not zero');
assert.equal(partialProfiles.team_B.xgFor,.7,'away xG should fall back to full-match stats when its shots are absent');
assert.equal(partialProfiles.team_A.xt,null,'advanced stats with a mismatched team ID must not be assigned by array position');
assert.equal(partialProfiles.team_B.xt,.3,'advanced stats must match the team ID');
const firstHalfOnly={partial:{stats:{periods:[{period:'1H',groups:[{items:[{key:'expected_goals',home:.2,away:.1}]}]}]}}};
const noFullMatch=buildTeamProfiles([partial],firstHalfOnly,now,6);
assert.equal(noFullMatch.team_A.xgFor,null,'first-half xG must not be mistaken for full-match xG');
console.log('intelligence V10 ok:',bt.n,'fixtures; lineup',ctx.teams.home.lineup.score,'vs',ctx.teams.away.lineup.score,'; V10',p.h,p.d,p.a);
