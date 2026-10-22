import {finite,quantile,aggregate} from './core.js';
import {esc,fmt} from './charts.js';
export const PALETTES={agro:['#e0f3f2','#a6d9d4','#58b5b5','#168291','#06465f','#062450'],blue:['#eff3ff','#c6dbef','#9ecae1','#6baed6','#3182bd','#08519c'],grey:['#f0f0f0','#d9d9d9','#bdbdbd','#969696','#636363','#252525']};
export function classify(values,method='quantile',count=5,palette='agro'){
 const a=values.filter(finite).sort((a,b)=>a-b),lo=a[0],hi=a.at(-1);if(!a.length)return {classes:[],color:()=> '#e2e5e8',method};
 const n=Math.max(3,Math.min(6,Number(count)||5));
 const edges=lo===hi?[lo,hi]:[lo,...[...new Set(Array.from({length:n-1},(_,i)=>method==='equal'?lo+(hi-lo)*(i+1)/n:quantile(a,(i+1)/n)))].filter(v=>v>lo&&v<hi),hi];
 const colors=PALETTES[palette]||PALETTES.agro;
 const classes=edges.slice(1).map((upper,i)=>({lower:edges[i],upper,color:colors[Math.round(i*5/Math.max(1,edges.length-2))],count:a.filter(v=>i===0?v>=edges[i]&&v<=upper:v>edges[i]&&v<=upper).length}));
 return {classes,method,color:v=>finite(v)?(classes.find((c,i)=>(i===0?v>=c.lower:v>c.lower)&&v<=c.upper)?.color||'#e2e5e8'):'#e2e5e8'};
}
export function joinMap(geo,rows,key,metric){
 const groups=aggregate(rows,[key]),values=Object.fromEntries(groups.map(r=>[r[key],r[metric]])),ids=new Set(geo.features.map(f=>f.properties.cvegeo));
 const unmatched=groups.filter(r=>!ids.has(r[key])).map(r=>r[key]);
 return {values,groups,unmatched,matched:geo.features.filter(f=>finite(values[f.properties.cvegeo])).length,missing:geo.features.filter(f=>!finite(values[f.properties.cvegeo])).length};
}
export const mercator=([lon,lat])=>[6378137*lon*Math.PI/180,6378137*Math.log(Math.tan(Math.PI/4+Math.max(-85,Math.min(85,lat))*Math.PI/360))];
export function geoBounds(geo){const b=[Infinity,Infinity,-Infinity,-Infinity];const walk=x=>{if(typeof x[0]==='number'){b[0]=Math.min(b[0],x[0]);b[1]=Math.min(b[1],x[1]);b[2]=Math.max(b[2],x[0]);b[3]=Math.max(b[3],x[1]);}else x.forEach(walk);};geo.features.forEach(f=>walk(f.geometry.coordinates));return b;}
export const classLabel=(c,i)=>c.lower===c.upper?fmt(c.lower,4):(i?'>'+fmt(c.lower,4):fmt(c.lower,4))+' – '+fmt(c.upper,4);
export function scientificSVG(model,options={}){
 const {geo,values,classification,title,unit,year,context,level,unmatched=[]}=model;
 const width=1400,height=1050,box={x:65,y:168,w:960,h:650},bounds=options.bounds||geoBounds(geo);
 const sw=mercator(bounds.slice(0,2)),ne=mercator(bounds.slice(2)),scale=Math.min(box.w/(ne[0]-sw[0]||1),box.h/(ne[1]-sw[1]||1))*.94;
 const cx=(sw[0]+ne[0])/2,cy=(sw[1]+ne[1])/2,xy=p=>{const q=mercator(p);return [box.x+box.w/2+(q[0]-cx)*scale,box.y+box.h/2-(q[1]-cy)*scale];};
 const t=(x,y,s,size=14,extra='')=>'<text x="'+x+'" y="'+y+'" font-family="Arial,sans-serif" font-size="'+size+'" fill="#062450" '+extra+'>'+esc(s)+'</text>';
 const lines=(s,max=102)=>{const result=[];let line='';for(const word of s.split(' ')){if((line+' '+word).length>max){result.push(line);line=word;}else line+=(line?' ':'')+word;}if(line)result.push(line);return result;};
 let out='<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1050" viewBox="0 0 1400 1050"><title>'+esc(title+' · '+year)+'</title><rect width="1400" height="1050" fill="white"/><defs><clipPath id="mapframe"><rect x="65" y="168" width="960" height="650"/></clipPath></defs>';
 out+=t(65,43,'AGROSPATIAL · CARTOGRAFÍA AGRÍCOLA',15)+t(65,83,title,27)+t(65,113,year+' · '+level+' · '+unit,19);
 lines(context,145).slice(0,2).forEach((l,i)=>out+=t(65,137+i*18,l,12));
 out+='<rect x="65" y="168" width="960" height="650" fill="#f6f9fb" stroke="#90a6b3"/><g clip-path="url(#mapframe)">';
 for(let i=0;i<=4;i++){const lon=bounds[0]+(bounds[2]-bounds[0])*i/4,lat=bounds[1]+(bounds[3]-bounds[1])*i/4;const a=xy([lon,bounds[1]]),b=xy([lon,bounds[3]]),c=xy([bounds[0],lat]),d=xy([bounds[2],lat]);out+='<path d="M'+a+'L'+b+'M'+c+'L'+d+'" fill="none" stroke="#ccd9e0" stroke-dasharray="4 4"/>';}
 for(const f of geo.features){const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;let path='';for(const poly of polygons)for(const ring of poly)path+='M'+ring.map(p=>xy(p).map(x=>x.toFixed(2)).join(',')).join('L')+'Z';
 out+='<path d="'+path+'" fill="'+classification.color(values[f.properties.cvegeo])+'" fill-rule="evenodd" stroke="white" stroke-width=".7"><title>'+esc(f.properties.nomgeo+': '+fmt(values[f.properties.cvegeo])+' '+unit)+'</title></path>';}
 out+='</g>';
 for(let i=0;i<=4;i++){const lon=bounds[0]+(bounds[2]-bounds[0])*i/4,lat=bounds[1]+(bounds[3]-bounds[1])*i/4;const a=xy([lon,bounds[1]]),b=xy([bounds[0],lat]);out+=t(a[0],837,Math.abs(lon).toFixed(2)+'° O',11,'text-anchor="middle"')+t(60,b[1],lat.toFixed(2)+'° N',11,'text-anchor="end"');}
 out+=t(1060,195,'LEYENDA',18)+t(1060,222,unit,14);
 let ly=255;classification.classes.forEach((c,i)=>{out+='<rect x="1060" y="'+(ly-14)+'" width="25" height="18" fill="'+c.color+'"/>';out+=t(1095,ly,classLabel(c,i),13);ly+=32;});
 out+='<rect x="1060" y="'+(ly-14)+'" width="25" height="18" fill="#e2e5e8"/>'+t(1095,ly,'Sin dato válido',13);
 out+=t(1060,ly+90,model.nature?.startsWith('Cociente')?'Variable intensiva':'Variable extensiva',13);
 out+=t(1060,ly+36,classification.method==='equal'?'Intervalos iguales':'Cuantiles',14)+t(1060,ly+58,classification.classes.length+' clases efectivas',13);
 out+=t(1190,610,'N',22,'text-anchor="middle"')+'<path d="M1190 625L1178 675L1190 662L1202 675Z" fill="#062450"/>';
 const latCenter=(bounds[1]+bounds[3])/2,metersPerPixel=Math.cos(latCenter*Math.PI/180)/scale,target=metersPerPixel*180,pow=10**Math.floor(Math.log10(target)),nice=[1,2,5,10].map(n=>n*pow).filter(n=>n<=target).at(-1)||pow;
 const px=nice/metersPerPixel;out+='<path d="M90 784v10h'+px+'v-10" stroke="#062450" stroke-width="3" fill="none"/>'+t(90,777,'0',12)+t(90+px,777,fmt(nice/1000)+' km',12,'text-anchor="end"');
 out+=t(65,870,'Proyección de visualización: Mercator esférica (EPSG:3857). Escala aproximada a '+latCenter.toFixed(2)+'° N.',13);
 out+=t(65,893,'Fuente de datos: SIAP · Cierre agrícola municipal. Límites: INEGI · Marco Geoestadístico, diciembre de 2025.',13);
 out+=t(65,916,'Coordenadas de origen INEGI: ITRF2008 (EPSG:6365); representación web sin transformación geodésica de precisión.',12);
 out+=t(65,939,'Límites actuales aplicados al año consultado; no reconstruyen cambios municipales históricos. Sin dato no equivale a cero.',12);
 out+=t(65,962,'Cobertura: '+model.matched+' polígonos con valor; '+model.missing+' sin dato válido; '+unmatched.length+' claves de datos sin geometría.',12);
 out+=t(65,985,'Escenario con '+model.exclusions+' exclusiones · Elaboración: '+new Date().toLocaleDateString('es-MX')+' · Clases calculadas en la extensión de datos completa.',12);
 out+=t(65,1015,'Los totales dependen del tamaño territorial; rendimiento y precio son cocientes ponderados. Consultar trazabilidad adjunta.',12);
 return out+'</svg>';
}
