export const LEAGUES=[["PL","Premier League"],["SA","Serie A"],["BL1","Bundesliga"],["PD","La Liga"],["FL1","Ligue 1"]];
const K=5,HA=1.12,MAXG=10;
export const r1=x=>Math.round(x*10)/10;
function pois(l){const p=[Math.exp(-l)];for(let i=1;i<=MAXG;i++)p.push(p[i-1]*l/i);return p}
export function league(tb){let gf=0,pl=0;for(const t of tb){gf+=t.goalsFor||0;pl+=t.playedGames||0}return pl>0&&gf>0?gf/pl:1.35}
function strength(t,base){const n=t.playedGames||0;return{att:((t.goalsFor||0)+K*base)/(n+K)/base,def:((t.goalsAgainst||0)+K*base)/(n+K)/base}}
export function predict(h,a,base){
  const sh=strength(h,base),sa=strength(a,base);
  const lh=base*HA*sh.att*sa.def,la=base/HA*sa.att*sh.def,ph=pois(lh),pa=pois(la);
  let H=0,D=0,A=0,best=[0,0,0];
  for(let i=0;i<=MAXG;i++)for(let j=0;j<=MAXG;j++){const p=ph[i]*pa[j];if(i>j)H+=p;else if(i===j)D+=p;else A+=p;if(p>best[2])best=[i,j,p]}
  const s=H+D+A,h1=r1(H/s*100),a1=r1(A/s*100);
  const r2=x=>Math.round(x*100)/100;
  return{h:h1,d:r1(100-h1-a1),a:a1,xg:[r2(lh),r2(la)],ms:[best[0],best[1],r1(best[2]/s*100)]};
}
export const level=e=>e>=40?"Sangat kuat":e>=20?"Kuat":e>=10?"Sedang":"Tipis";
