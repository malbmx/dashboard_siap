export const METRICS={
sown:{label:'Superficie sembrada',unit:'ha'},harvested:{label:'Superficie cosechada',unit:'ha'},
damaged:{label:'Superficie siniestrada',unit:'ha'},production:{label:'Producción',unit:'unidad'},
yield:{label:'Rendimiento',unit:'unidad/ha'},price:{label:'Precio medio rural',unit:'MXN/unidad'},value:{label:'Valor de producción',unit:'MXN nominales'}};
export const finite=x=>typeof x==='number'&&Number.isFinite(x);
export function quantile(a,p){a=a.filter(finite).sort((x,y)=>x-y);if(!a.length)return null;const n=(a.length-1)*p,i=Math.floor(n);return a[i]+(a[Math.ceil(n)]-a[i])*(n-i);}
export const median=a=>quantile(a,.5);
export function sum(a){return a.length&&a.every(finite)?a.reduce((s,v)=>s+v,0):null;}
export const ratio=(a,b)=>finite(a)&&finite(b)&&b>0?a/b:null;
export function aggregate(rows,keys=['year']){
const overallUnits=new Set(rows.map(r=>r.unit));const groups=new Map();for(const r of rows){const id=JSON.stringify(keys.map(k=>r[k]));if(!groups.has(id))groups.set(id,[]);groups.get(id).push(r);}
return [...groups.values()].map(g=>{const o=Object.fromEntries(keys.map(k=>[k,g[0][k]]));for(const k of ['sown','harvested','damaged','production','value'])o[k]=sum(g.map(r=>r[k]));o.yield=ratio(o.production,o.harvested);o.price=ratio(o.value,o.production);o.n=g.length;o.units=[...new Set(g.map(r=>r.unit))];if(overallUnits.size!==1){o.production=null;o.yield=null;o.price=null;}return o;}).sort((a,b)=>(a.year??0)-(b.year??0));}
export function theilSen(points){const slopes=[];for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)if(points[j].x!==points[i].x)slopes.push((points[j].y-points[i].y)/(points[j].x-points[i].x));const slope=median(slopes)??0;return {slope,intercept:median(points.map(p=>p.y-slope*p.x))};}
export function flagAnomalies(series,metric,method='mad'){
const pts=series.filter(r=>finite(r[metric])).map(r=>({x:r.year,y:r[metric]}));if(pts.length<6)return {flags:[],note:'Se requieren al menos 6 años con datos.',n:pts.length};
const fit=theilSen(pts);const values=pts.map(p=>method==='mad'?p.y-fit.intercept-fit.slope*p.x:p.y);const center=median(values),mad=median(values.map(v=>Math.abs(v-center))),q1=quantile(values,.25),q3=quantile(values,.75),iqr=q3-q1;
if((method==='mad'&&mad===0)||(method==='iqr'&&iqr===0))return {flags:[],note:'Dispersión robusta igual a cero: revise visualmente; no se asignan atípicos automáticamente.',n:pts.length};
const flags=pts.flatMap((p,i)=>{const score=method==='mad'?.67448975*(values[i]-center)/mad:null;const flagged=method==='mad'?Math.abs(score)>3.5:values[i]<q1-1.5*iqr||values[i]>q3+1.5*iqr;return flagged?[{year:p.x,value:p.y,score,reason:method==='mad'?'Desviación robusta de la tendencia: |z| > 3.5':'Fuera de Q1 − 1.5 RIQ o Q3 + 1.5 RIQ'}]:[];});
return {flags,n:pts.length,note:method==='mad'?'MAD de residuos respecto a tendencia Theil–Sen; umbral |z| > 3.5.':'Regla exploratoria de 1.5 veces el rango intercuartílico; puede señalar cambios de tendencia.'};}
export function filterRows(rows,f){return rows.filter(r=>f.years.includes(r.year)&&(!f.states.length||f.states.includes(r.state))&&(!f.municipalities.length||f.municipalities.includes(r.municipality))&&(!f.cycles.length||f.cycles.includes(r.cycle))&&(!f.modes.length||f.modes.includes(r.mode))&&(!f.units?.length||f.units.includes(r.unit)));}
export function applyExclusions(rows,excluded){return rows.filter(r=>!excluded.some(e=>e.type==='year'?r.year===Number(e.key):r.id===e.key));}
export function describe(values){const a=values.filter(finite);if(!a.length)return {n:0,mean:null,sd:null,min:null,max:null,median:null};const m=a.reduce((s,v)=>s+v,0)/a.length;return {n:a.length,mean:m,sd:a.length>1?Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/(a.length-1)):null,min:Math.min(...a),max:Math.max(...a),median:median(a)};}
export function forecastEligible(series,metric){const s=series.filter(r=>finite(r[metric]));if(s.length<10)return 'Se requieren al menos 10 años consecutivos con datos completos.';if(s.some((r,i)=>i&&r.year!==s[i-1].year+1))return 'La selección tiene huecos temporales. Seleccione una serie anual continua; no se comprimen ni imputan los años.';return null;}
export function csv(rows,fields){const cell=v=>'"'+String(v??'').replaceAll('"','""')+'"';return '\uFEFF'+[fields.join(','),...rows.map(r=>fields.map(k=>cell(r[k])).join(','))].join('\r\n');}
export function hashSeed(s){let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
export function spatialStats(features,values,permutations=999){
const used=features.filter(f=>finite(values[f.properties.cvegeo]));if(used.length<5)return {error:'Se requieren al menos cinco entidades con datos y vecindad válida.'};
const ids=used.map(f=>f.properties.cvegeo),v=ids.map(id=>values[id]);const mean=v.reduce((a,b)=>a+b,0)/v.length,z=v.map(x=>x-mean),den=z.reduce((a,b)=>a+b*b,0);
if(!den)return {error:'Sin variación espacial.'};
const neighbors=used.map(f=>(f.properties.neighbors||[]).map(id=>ids.indexOf(id)).filter(i=>i>=0));
if(neighbors.some(n=>!n.length))return {error:'Hay entidades sin vecinos en la selección. Amplíe la cobertura para evitar islas.'};
const calc=a=>{const lag=neighbors.map(ns=>ns.reduce((s,j)=>s+a[j],0)/ns.length);return {I:a.reduce((s,x,i)=>s+x*lag[i],0)/den,local:a.map((x,i)=>x*lag[i]/(den/a.length)),lag};};
const observed=calc(z);let seed=hashSeed(JSON.stringify(ids)+JSON.stringify(v));const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
let greater=0;const expected=-1/(v.length-1);for(let k=0;k<permutations;k++){const a=z.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}if(Math.abs(calc(a).I-expected)>=Math.abs(observed.I-expected))greater++;}
const local=ids.map((id,i)=>{let count=0;const pool=z.filter((_,j)=>j!==i),degree=neighbors[i].length;for(let k=0;k<permutations;k++){const a=pool.slice();for(let j=0;j<degree;j++){const q=j+Math.floor(random()*(a.length-j));[a[j],a[q]]=[a[q],a[j]];}const lag=a.slice(0,degree).reduce((s,x)=>s+x,0)/degree;const sim=z[i]*lag/(den/z.length);if(Math.abs(sim)>=Math.abs(observed.local[i]))count++;}return {id,I:observed.local[i],p:(count+1)/(permutations+1),cluster:z[i]>=0?(observed.lag[i]>=0?'Alto–Alto':'Alto–Bajo'):(observed.lag[i]>=0?'Bajo–Alto':'Bajo–Bajo')};});
const order=local.map((r,i)=>i).sort((a,b)=>local[a].p-local[b].p);let prev=1;for(let k=order.length-1;k>=0;k--){prev=Math.min(prev,local[order[k]].p*local.length/(k+1));local[order[k]].q=prev;}
const sd=Math.sqrt(den/v.length);
 const gi=(arr,i)=>{const ns=[i,...neighbors[i]],k=ns.length,denom=sd*Math.sqrt((v.length*k-k*k)/(v.length-1));return denom? (ns.reduce((s,j)=>s+arr[j],0)-mean*k)/denom:null;};
 const gObserved=ids.map((_,i)=>gi(v,i)),gCounts=ids.map(()=>0);
 for(let k=0;k<permutations;k++){const arr=v.slice();for(let i=arr.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}ids.forEach((_,i)=>{if(gObserved[i]!==null&&Math.abs(gi(arr,i))>=Math.abs(gObserved[i]))gCounts[i]++;});}
 local.forEach((l,i)=>{l.Gstar=gObserved[i];l.gp=gObserved[i]===null?null:(gCounts[i]+1)/(permutations+1);});
 const gOrder=local.map((l,i)=>i).filter(i=>local[i].gp!==null).sort((a,b)=>local[a].gp-local[b].gp);prev=1;for(let k=gOrder.length-1;k>=0;k--){prev=Math.min(prev,local[gOrder[k]].gp*gOrder.length/(k+1));local[gOrder[k]].gq=prev;}
 return {I:observed.I,p:(greater+1)/(permutations+1),n:v.length,permutations,local,seed:hashSeed(JSON.stringify(ids)+JSON.stringify(v))};}


export function scanAnomalies(series,method='mad'){
 const byMetric=Object.fromEntries(Object.keys(METRICS).map(k=>[k,flagAnomalies(series,k,method)]));
 const years=[...new Set(Object.values(byMetric).flatMap(r=>r.flags.map(f=>f.year)))].sort((a,b)=>a-b);
 return {byMetric,years,signals:years.flatMap(year=>Object.entries(byMetric).flatMap(([metric,r])=>r.flags.filter(f=>f.year===year).map(f=>({...f,metric})))),note:'Revisión exploratoria de siete indicadores por separado. Un año se muestra si al menos un indicador lo señala; no es una prueba multivariante ni demuestra una causa. Los indicadores están relacionados y no constituyen confirmaciones independientes.'};
}
