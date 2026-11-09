export const LEAGUES=[["PL","Premier League"],["SA","Serie A"],["BL1","Bundesliga"],["PD","La Liga"],["FL1","Ligue 1"]];
export const r1=x=>Math.round(x*10)/10;
export const level=e=>e>=40?"Sangat kuat":e>=20?"Kuat":e>=10?"Sedang":"Tipis";
const MAXG=10,HL=70*864e5,M0=3,K0=3,EH=65,W_ELO=.3;
const cl=x=>Math.min(4.5,Math.max(.2,x));
const pois=l=>{const p=[Math.exp(-l)];for(let i=1;i<=MAXG;i++)p.push(p[i-1]*l/i);return p};
const eExp=(a,b)=>1/(1+Math.pow(10,-(a-b+EH)/400));
function eloP(E){const d=Math.max(.08,.28*(1-Math.abs(E-.5)*1.6)),h=Math.max(.01,E-d/2),a=Math.max(.01,1-E-d/2),s=h+a+d;return[h/s,d/s,a/s]}
const tr=a=>{const h=r1(a[0]*100),x=r1(a[2]*100);return{h,d:r1(100-h-x),a:x}};
// ms: laga selesai urut waktu naik: {t,h,a,gh,ga}. Hanya laga dengan t<asOf yang dipakai (tidak mengintip masa depan).
export function fit(ms,asOf){
  const L=ms.filter(m=>m.t<asOf);let sh=0,sa=0;for(const m of L){sh+=m.gh;sa+=m.ga}
  const muH=(sh+15)/(L.length+10),muA=(sa+12)/(L.length+10),T=new Map();
  const g=id=>{let x=T.get(id);if(!x){x={gp:0,ow:0,oa:0,od:0,hw:0,ha:0,hd:0,aw:0,aa:0,ad:0,elo:1500,res:[]};T.set(id,x)}return x};
  for(const m of L){
    const w=Math.pow(.5,(asOf-m.t)/HL),H=g(m.h),A=g(m.a),hA=m.gh/muH,hD=m.ga/muA,aA=m.ga/muA,aD=m.gh/muH;
    H.gp++;H.ow+=w;H.oa+=w*hA;H.od+=w*hD;H.hw+=w;H.ha+=w*hA;H.hd+=w*hD;
    A.gp++;A.ow+=w;A.oa+=w*aA;A.od+=w*aD;A.aw+=w;A.aa+=w*aA;A.ad+=w*aD;
    H.res.push({v:"h",gf:m.gh,ga:m.ga});A.res.push({v:"a",gf:m.ga,ga:m.gh});
    const s=m.gh>m.ga?1:m.gh===m.ga?.5:0,gd=Math.abs(m.gh-m.ga),dl=20*(gd<=1?1:gd===2?1.5:(11+gd)/8)*(s-eExp(H.elo,A.elo));H.elo+=dl;A.elo-=dl;
  }
  const oc=[0,0,0];for(const m of L)oc[m.gh>m.ga?0:m.gh===m.ga?1:2]++;
  return{muH,muA,T,n:L.length,fr:[.45,.26,.29].map((p,i)=>(oc[i]+4*p)/(L.length+4))};
}
const EMPTY={gp:0,ow:0,oa:0,od:0,hw:0,ha:0,hd:0,aw:0,aa:0,ad:0,elo:1500,res:[]};
export function strength(T,id){
  const x=T.get(id)||EMPTY,oA=(x.oa+M0)/(x.ow+M0),oD=(x.od+M0)/(x.ow+M0);
  return{gp:x.gp,elo:x.elo,aH:(x.ha+K0*oA)/(x.hw+K0),dH:(x.hd+K0*oD)/(x.hw+K0),aA:(x.aa+K0*oA)/(x.aw+K0),dA:(x.ad+K0*oD)/(x.aw+K0)};
}
export function predictM(model,hid,aid){
  const H=strength(model.T,hid),A=strength(model.T,aid);
  const lh=cl(model.muH*H.aH*A.dA),la=cl(model.muA*A.aA*H.dH),ph=pois(lh),pa=pois(la);
  let h=0,d=0,a=0,best=[0,0,0],sc=[],ov=0,bt=0;
  for(let i=0;i<=MAXG;i++)for(let j=0;j<=MAXG;j++){const p=ph[i]*pa[j];if(i>j)h+=p;else if(i===j)d+=p;else a+=p;if(p>best[2])best=[i,j,p];sc.push([i,j,p]);if(i+j>2)ov+=p;if(i>0&&j>0)bt+=p}
  const s=h+d+a,r2=x=>Math.round(x*100)/100;
  return{...tr([h/s,d/s,a/s]),xg:[r2(lh),r2(la)],ms:[best[0],best[1],r1(best[2]/s*100)],sc5:sc.sort((x,y)=>y[2]-x[2]).slice(0,5).map(x=>[x[0],x[1],r1(x[2]/s*100)]),ou:r1(ov/s*100),bt:r1(bt/s*100),fr:model.fr.map(x=>r1(x*100)),pe:tr(eloP(eExp(H.elo,A.elo))),el:[Math.round(H.elo),Math.round(A.elo)],gp:[H.gp,A.gp]};
}
export function pcts(p){
  const pp=[p.h,p.d,p.a],pe=[p.pe.h,p.pe.d,p.pe.a],pb=pp.map((v,i)=>r1((1-W_ELO)*v+W_ELO*pe[i]));
  return{pp,pe,pb,fr:p.fr};
}
export function formOf(model,id,venue){
  const r=(model.T.get(id)||EMPTY).res,L=x=>x.gf>x.ga?"M":x.gf===x.ga?"S":"K";
  const agg=a=>{const o={w:0,d:0,l:0,gf:0,ga:0,cs:0,n:a.length};for(const x of a){o[x.gf>x.ga?"w":x.gf===x.ga?"d":"l"]++;o.gf+=x.gf;o.ga+=x.ga;if(x.ga===0)o.cs++}return o};
  return{l5:r.slice(-5).map(L).join(""),t:agg(r.slice(-10)),v:agg(r.filter(x=>x.v===venue).slice(-5))};
}
// Uji mundur: tiap laga diprediksi hanya dari laga sebelumnya.
export function backtest(ms,minGames=5){
  const rows=[],c=new Map();
  for(const m of ms){
    const ch=c.get(m.h)||0,ca=c.get(m.a)||0;
    if(ch>=minGames&&ca>=minGames){const p=predictM(fit(ms,m.t),m.h,m.a);rows.push({t:m.t,o:m.gh>m.ga?0:m.gh===m.ga?1:2,ou:p.ou,bt:p.bt,go:m.gh+m.ga>2?1:0,gb:m.gh>0&&m.ga>0?1:0,...pcts(p)})}
    c.set(m.h,ch+1);c.set(m.a,ca+1);
  }
  return rows;
}
// Kalibrasi: tarik peluang 1X2 sedikit ke frekuensi hasil liga. Kekuatan tarikan tiap laga dipilih hanya dari laga sebelumnya (tanpa mengintip).
export const LAMS=[0,.05,.1,.15,.2,.25,.3,.35,.4,.5],LAM0=.15;
export const shrink=(p,fr,lam)=>{const h=r1((1-lam)*p[0]+lam*fr[0]),a=r1((1-lam)*p[2]+lam*fr[2]);return[h,r1(100-h-a),a]};
// Model akhir: gabungan Poisson dan Elo (70/30), lalu ditarik ke frekuensi hasil liga.
export const finalP=(p,lam)=>shrink(pcts(p).pb,p.fr,lam);
const nll=(p,o)=>-Math.log(Math.max(p[o]/100,1e-6));
export function calibrate(rows){
  rows.sort((a,b)=>a.t-b.t);
  const cum=LAMS.map(()=>0),best=()=>{let b=0;for(let i=1;i<cum.length;i++)if(cum[i]<cum[b]-1e-9)b=i;return LAMS[b]};
  rows.forEach((r,i)=>{const lam=i<30?LAM0:best();r.pk=shrink(r.pb,r.fr,lam);LAMS.forEach((l,k)=>{cum[k]+=nll(shrink(r.pb,r.fr,l),r.o)})});
  return{lam:rows.length<30?LAM0:best()};
}
export function evaluate(rows){
  const n=rows.length;if(!n)return{n:0};
  const fr=[0,0,0];for(const r of rows)fr[r.o]++;const base=fr.map(x=>x/n),k3=x=>Math.round(x*1000)/1000;
  const mk=(f,R)=>{let acc=0,br=0,ll=0;for(const r of R){const p=f(r),am=p.indexOf(Math.max(...p));if(am===r.o)acc++;for(let k=0;k<3;k++)br+=(p[k]-(k===r.o?1:0))**2;ll-=Math.log(Math.max(p[r.o],1e-6))}const m=R.length;return{n:m,acc:r1(acc/m*100),brier:k3(br/m),ll:k3(ll/m)}};
  const per=a=>r=>r[a].map(v=>v/100);
  const cal=(R,a)=>[[0,40],[40,50],[50,60],[60,101]].map(([lo,hi])=>{const b=R.filter(r=>{const m=Math.max(...r[a]);return m>=lo&&m<hi});let hit=0,sum=0;for(const r of b){const m=Math.max(...r[a]);sum+=m;if(r[a].indexOf(m)===r.o)hit++}return{lo,hi:Math.min(hi,100),n:b.length,avg:b.length?r1(sum/b.length):null,hit:b.length?r1(hit/b.length*100):null}});
  const bin=(fp,fo)=>{const R=rows.filter(r=>r[fp]!=null);if(!R.length)return null;let ac=0,br=0,s=0;for(const r of R)s+=r[fo];const b=s/R.length;let bb=0;for(const r of R){const p=r[fp]/100,o=r[fo];if((p>=.5?1:0)===o)ac++;br+=(p-o)**2;bb+=(b-o)**2}return{n:R.length,acc:r1(ac/R.length*100),brier:k3(br/R.length),base:k3(bb/R.length),rate:r1(b*100)}};
  const rp=rows.filter(r=>r.pk);
  return{n,pp:mk(per("pp"),rows),pe:mk(per("pe"),rows),pb:mk(per("pb"),rows),fr:mk(()=>base,rows),pk:rp.length?mk(per("pk"),rp):null,homeAcc:r1(fr[0]/n*100),calib:cal(rows,"pp"),calibK:rp.length?cal(rp,"pk"):null,ou:bin("ou","go"),bt:bin("bt","gb")};
}
