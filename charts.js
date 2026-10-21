import {finite,quantile} from './core.js';
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const fmt=(v,d=2)=>finite(v)&&v!==0&&Math.abs(v)<10**(-d)?v.toExponential(2):finite(v)?v.toLocaleString('en-US',{maximumFractionDigits:d}).replaceAll(',',' '):'—';
const compact=v=>Math.abs(v)>=1e9?fmt(v/1e9,1)+' mil M':Math.abs(v)>=1e6?fmt(v/1e6,1)+' M':Math.abs(v)>=1e3?fmt(v/1e3,1)+' mil':fmt(v,1);
const svg=(body,w=900,h=330,title='Gráfica')=>'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="'+esc(title)+'" style="font-family:Segoe UI,Arial,sans-serif;background:white"><title>'+esc(title)+'</title>'+body+'</svg>';
const text=(x,y,t,extra='')=>'<text x="'+x+'" y="'+y+'" font-size="11" fill="#526778" '+extra+'>'+esc(t)+'</text>';
export function lineChart(series,metric,unit,flags=[],forecast=null){
 const values=series.flatMap(s=>s.rows.map(r=>r[metric])).filter(finite).concat(forecast?forecast.flatMap(r=>[r.lower,r.upper]).filter(finite):[]);
 const years=series.flatMap(s=>s.rows.map(r=>r.year)).concat(forecast?forecast.map(r=>r.year):[]);
 if(!values.length)return svg(text(450,155,'Sin datos comparables','text-anchor="middle"'));
 const xmin=Math.min(...years),xmax=Math.max(...years),rawMin=Math.min(...values),rawMax=Math.max(...values);const pad=(rawMax-rawMin||Math.abs(rawMax)||1)*.12,min=rawMin-pad,max=rawMax+pad;
 const X=v=>80+(v-xmin)/(xmax-xmin||1)*780,Y=v=>270-(v-min)/(max-min)*230;
 let b=text(80,20,unit);
 for(let i=0;i<=4;i++){const v=min+(max-min)*i/4;b+='<path d="M80 '+Y(v)+'H860" stroke="#e1eaf0"/>'+text(69,Y(v)+4,compact(v),'text-anchor="end"');}
 const step=Math.max(1,Math.ceil((xmax-xmin)/10));for(let y=xmin;y<=xmax;y+=step)b+=text(X(y),299,y,'text-anchor="middle"');if((xmax-xmin)%step!==0)b+=text(X(xmax),299,xmax,'text-anchor="middle"');
 if(forecast?.length){const points=forecast.map(r=>X(r.year)+','+Y(r.upper)).concat([...forecast].reverse().map(r=>X(r.year)+','+Y(r.lower))).join(' ');b+='<polygon points="'+points+'" fill="#c6eaf0" opacity=".8"/>';}
 for(const s of series){let d='',last=null;for(const r of s.rows){if(!finite(r[metric])){last=null;continue;}d+=(last!==null&&r.year===last+1?'L':'M')+X(r.year)+' '+Y(r[metric])+' ';last=r.year;}
 b+='<path d="'+d+'" fill="none" stroke="'+s.color+'" stroke-width="2.4" '+(s.dash?'stroke-dasharray="5 4"':'')+'/>';
 for(const r of s.rows.filter(r=>finite(r[metric])))b+='<circle cx="'+X(r.year)+'" cy="'+Y(r[metric])+'" r="'+(flags.includes(r.year)?5.5:3.2)+'" fill="'+(flags.includes(r.year)?'#b07921':s.color)+'" stroke="white" stroke-width="1.3"><title>'+esc(s.label+' · '+r.year+': '+fmt(r[metric])+' '+unit)+'</title></circle>';
 }return svg(b,900,330,unit+' por año');
}
export function distributionChart(values,unit){
 const v=values.filter(finite).sort((a,b)=>a-b);if(!v.length)return svg(text(220,100,'Sin datos'),450,240);
 const min=v[0],max=v.at(-1),range=max-min||1,bins=Math.min(8,Math.max(3,Math.ceil(Math.sqrt(v.length)))),counts=Array(bins).fill(0);for(const x of v)counts[Math.min(bins-1,Math.floor((x-min)/range*bins))]++;
 let b=text(45,22,'Número de años');const tallest=Math.max(...counts);for(let i=0;i<bins;i++){const h=counts[i]/tallest*135,x=48+i*350/bins;b+='<rect x="'+x+'" y="'+(180-h)+'" width="'+(350/bins-4)+'" height="'+h+'" fill="#008caa" rx="3"><title>'+esc(fmt(min+i*range/bins)+' a '+fmt(min+(i+1)*range/bins)+': '+counts[i]+' años')+'</title></rect>'+text(x+175/bins,171-h,counts[i],'text-anchor="middle"');}b+=text(48,202,compact(min))+text(400,202,compact(max),'text-anchor="end"')+text(225,227,unit,'text-anchor="middle"');return svg(b,450,240,'Distribución de valores anuales');
}
export function comparisonChart(groups,metric,labeler,unit){
 const items=groups.map(g=>({name:labeler(g.group),v:g.rows.map(r=>r[metric]).filter(finite)})).filter(g=>g.v.length).slice(0,40);if(!items.length)return svg(text(200,100,'Sin grupos'));
 const low=Math.min(...items.flatMap(g=>g.v)),high=Math.max(...items.flatMap(g=>g.v)),X=v=>225+(v-low)/(high-low||1)*600;let b=text(225,20,unit);const h=50+items.length*36;
 for(const [i,g] of items.entries()){const y=48+i*36,q1=quantile(g.v,.25),q3=quantile(g.v,.75),m=quantile(g.v,.5);b+=text(212,y+4,g.name.length>29?g.name.slice(0,27)+'…':g.name,'text-anchor="end"')+'<path d="M'+X(Math.min(...g.v))+' '+y+'H'+X(Math.max(...g.v))+'" stroke="#79aab8"/><rect x="'+X(q1)+'" y="'+(y-10)+'" width="'+Math.max(1,X(q3)-X(q1))+'" height="20" fill="#c6eaf0"/><path d="M'+X(m)+' '+(y-11)+'V'+(y+11)+'" stroke="#006b76" stroke-width="2"><title>'+esc(g.name+': mediana '+fmt(m))+'</title></path>';
 }return svg(b,900,Math.max(160,h),'Distribución anual por grupo');
}
export function mapChart(geo,values,unit){
 const vals=Object.values(values).filter(finite),lo=Math.min(...vals),hi=Math.max(...vals);let body='';
 const point=p=>[(p[0]+119)*25+25,(33.5-p[1])*28+18];
 for(const f of geo.features){const v=values[f.properties.cvegeo],t=finite(v)?(v-lo)/(hi-lo||1):null;const fill=t===null?'#e9ece7':'rgb('+Math.round(227-221*t)+','+Math.round(245-209*t)+','+Math.round(249-169*t)+')';
 const polys=f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[f.geometry.coordinates];let d='';for(const poly of polys)for(const ring of poly)d+='M'+ring.map(p=>point(p).map(n=>n.toFixed(1)).join(',')).join('L')+'Z';
 body+='<path d="'+d+'" fill="'+fill+'" fill-rule="evenodd" stroke="#fff" stroke-width=".65"><title>'+esc(f.properties.nomgeo+': '+fmt(v)+' '+unit)+'</title></path>';
 }body+=text(30,575,'Menor '+fmt(lo)+'   →   Mayor '+fmt(hi)+' '+unit+' · Gris: sin dato');return svg(body,850,600,'Mapa por entidad');
}
export async function pngFromSvg(svgText,width=1500){const img=new Image(),url=URL.createObjectURL(new Blob([svgText],{type:'image/svg+xml'}));await new Promise((ok,no)=>{img.onload=ok;img.onerror=no;img.src=url;});const canvas=document.createElement('canvas');canvas.width=width;canvas.height=Math.round(width*img.height/img.width);const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);return canvas.toDataURL('image/png');}

