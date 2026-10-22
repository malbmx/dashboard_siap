import {METRICS,finite} from './core.js';
import {esc,fmt,pngFromSvg} from './charts.js';
import {classify,joinMap,classLabel,scientificSVG} from './cartography.js';
let map,layer,legend,outline,model,lastScope='',request=0,pendingFit=false;
const cache=new Map(),$=id=>document.getElementById(id);
export function resizeMap(){if(map)setTimeout(()=>{map.invalidateSize();if(pendingFit&&layer&&$('mapChart').clientWidth){map.fitBounds(layer.getBounds(),{padding:[25,25]});pendingFit=false;}},50);}
function initialize(){
 if(map)return;
 const L=window.L;map=L.map('mapChart',{minZoom:3,maxZoom:15,zoomSnap:.25,attributionControl:true}).setView([23.5,-102],5);
 map.attributionControl.setPrefix(false);map.attributionControl.addAttribution('Datos: SIAP | Límites: INEGI, diciembre 2025');
 L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);
 const north=L.control({position:'topright'});north.onAdd=()=>{const d=L.DomUtil.create('div','map-north');d.innerHTML='N<br>↑';return d;};north.addTo(map);
 legend=L.control({position:'bottomright'});legend.onAdd=()=>L.DomUtil.create('div','map-legend');legend.addTo(map);
 $('mapFit').onclick=()=>layer&&map.fitBounds(layer.getBounds(),{padding:[25,25]});
 $('mapFullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('cartographicViewer').requestFullscreen();pendingFit=true;resizeMap();}catch{$('mapNotes').textContent='Pantalla completa no disponible en este navegador.';}};
 $('mapFind').onchange=()=>{const id=$('mapFind').value;layer?.eachLayer(l=>{if(l.feature.properties.cvegeo===id){map.fitBounds(l.getBounds(),{padding:[50,50]});l.openPopup();}});};
}
async function municipal(st){
 if(!cache.has(st))cache.set(st,fetch('data/municipalities-'+st+'.geojson').then(r=>{if(!r.ok)throw Error('No se pudo cargar la cartografía municipal de '+st);return r.json();}).catch(e=>{cache.delete(st);throw e;}));
 return cache.get(st);
}
export async function updateMap(S,unit,label){
 if(!S.filters||!S.geo)return;
 const token=++request;initialize();$('mapNotes').textContent='Preparando cartografía…';
 for(const id of ['mapSvg','mapPng','mapPdf','mapGeojson','mapMetadata'])$(id).disabled=true;
 model=null;if(layer){map.removeLayer(layer);layer=null;}legend.getContainer().innerHTML='Cargando…';
 try{
 const year=Number($('mapYear').value),metric=$('mapMetric').value||S.metric,states=S.filters.states;
 const municipalLevel=states.length>0,geo=municipalLevel?{type:'FeatureCollection',features:(await Promise.all(states.map(municipal))).flatMap(g=>g.features)}:S.geo;
 if(token!==request)return;
 const joined=joinMap(geo,S.active.filter(r=>r.year===year),municipalLevel?'municipality':'state',metric);
 const classification=classify(geo.features.map(f=>joined.values[f.properties.cvegeo]),$('mapClassification').value,$('mapClasses').value,$('mapPalette').value);
 const nature=['yield','price'].includes(metric)?'Cociente ponderado (intensiva)':'Total agregado (extensiva)';
 const unitText=unit(metric),context=[S.title,S.filters.cycles.join(', ')||'Todos los ciclos',S.filters.modes.join(', ')||'Todas las modalidades'].join(' · ');
 model={geo,...joined,classification,title:METRICS[metric].label,nature,metric,unit:unitText,year,context,level:municipalLevel?'Municipios':'Entidades',exclusions:S.excluded.length,filters:structuredClone(S.filters),excluded:structuredClone(S.excluded),dataBuild:S.catalog.builtAt,method:$('mapClassification').value,palette:$('mapPalette').value};
 $('mapTitle').textContent=METRICS[metric].label+' ('+unitText+') · '+year+' · '+model.level;
 $('mapContext').textContent=context+' · '+nature;
 const L=window.L;layer=L.geoJSON(geo,{style:f=>({color:'#ffffff',weight:1,fillColor:classification.color(joined.values[f.properties.cvegeo]),fillOpacity:.9}),onEachFeature:(f,l)=>{
 const id=f.properties.cvegeo,v=joined.values[id],content='<strong>'+esc(f.properties.nomgeo)+'</strong><br>Clave: '+esc(id)+'<br>'+esc(METRICS[metric].label)+': <b>'+fmt(v)+'</b> '+esc(unitText)+'<br>Año: '+year;
 l.bindTooltip(esc(f.properties.nomgeo)+': '+fmt(v)+' '+esc(unitText),{sticky:true});l.bindPopup(content);
 l.on('mouseover',()=>l.setStyle({weight:2,color:'#062450'}));l.on('mouseout',()=>layer?.resetStyle(l));
 }}).addTo(map);
 if(outline)map.removeLayer(outline);
 if(municipalLevel)outline=L.geoJSON(S.geo.features.filter(f=>states.includes(f.properties.cvegeo)),{style:{color:'#062450',weight:2,fill:false},interactive:false}).addTo(map);
 const scope=JSON.stringify([states,S.filters.municipalities]);if(scope!==lastScope){pendingFit=true;lastScope=scope;}
 const el=legend.getContainer();el.innerHTML='<strong>'+esc(METRICS[metric].label)+'</strong><br>'+esc(unitText)+' · '+year+'<br><small>'+(classification.method==='equal'?'Intervalos iguales':'Cuantiles')+' · '+classification.classes.length+' clases</small>'+classification.classes.map((c,i)=>'<div><i style="background:'+c.color+'"></i>'+esc(classLabel(c,i))+' <small>(n='+c.count+')</small></div>').join('')+'<div><i style="background:#e2e5e8"></i>Sin dato válido</div>';L.DomEvent.disableClickPropagation(el);L.DomEvent.disableScrollPropagation(el);
 $('mapFind').innerHTML='<option value="">Buscar territorio…</option>'+geo.features.slice().sort((a,b)=>a.properties.nomgeo.localeCompare(b.properties.nomgeo,'es')).map(f=>'<option value="'+f.properties.cvegeo+'">'+esc(f.properties.nomgeo)+' · '+f.properties.cvegeo+'</option>').join('');
 $('mapNotes').textContent=joined.matched+' polígonos con valor · '+joined.missing+' sin dato válido · '+joined.unmatched.length+' claves sin geometría'+(joined.unmatched.length?' ('+joined.unmatched.join(', ')+')':'')+'. Límites INEGI de diciembre de 2025, no históricos. Mercator esférica (EPSG:3857); escala aproximada. Las clases se recalculan al cambiar año, variable o consulta.';
 $('mapDataTable').innerHTML='<table><thead><tr><th>Clave</th><th>Territorio</th><th>'+esc(METRICS[metric].label)+' ('+esc(unitText)+')</th></tr></thead><tbody>'+geo.features.map(f=>'<tr><td>'+f.properties.cvegeo+'</td><td>'+esc(f.properties.nomgeo)+'</td><td>'+fmt(joined.values[f.properties.cvegeo])+'</td></tr>').join('')+'</tbody></table>';
 for(const id of ['mapSvg','mapPng','mapPdf','mapGeojson','mapMetadata'])$(id).disabled=false;
 resizeMap();
 }catch(e){if(token===request){$('mapNotes').textContent=e.message;legend.getContainer().innerHTML='Cartografía no disponible.';}}
}
export async function exportMap(kind,download){
 if(!model)return;
 const snapshot=model,name='SIAP_'+model.metric+'_'+model.year+'_'+(model.level==='Municipios'?'municipios':'entidades');
 if(kind==='metadata'){await download(name+'_trazabilidad.json',JSON.stringify({...snapshot,geo:undefined,classification:{method:snapshot.classification.method,classes:snapshot.classification.classes},values:snapshot.values,exportProjection:'EPSG:3857',sourceCRS:'EPSG:6365',cartographyDate:'2025-12',cartographySource:'https://gaia.inegi.org.mx/wscatgeo/v2/geo/mgem/',bounds:$('mapExtent').value==='view'?viewBounds():null},null,2),'application/json');return;}
 if(kind==='geojson'){await download(name+'.geojson',JSON.stringify({type:'FeatureCollection',name,sourceCRS:'EPSG:6365',features:snapshot.geo.features.map(f=>({...f,properties:{...f.properties,year:snapshot.year,variable:snapshot.metric,unit:snapshot.unit,value:finite(snapshot.values[f.properties.cvegeo])?snapshot.values[f.properties.cvegeo]:null}}))}),'application/geo+json');return;}
 const svg=scientificSVG(snapshot,{bounds:$('mapExtent').value==='view'?viewBounds():undefined});
 if(kind==='svg'){await download(name+'.svg',svg,'image/svg+xml');return;}
 const png=await pngFromSvg(svg,3600);
 if(kind==='png'){await download(name+'_3600px.png',await(await fetch(png)).blob());return;}
 const pdf=new window.jspdf.jsPDF({orientation:'landscape',unit:'mm',format:[300,225],compress:true});
 pdf.addImage(png,'PNG',0,0,300,225,undefined,'FAST');await download(name+'.pdf',pdf.output('blob'));
}
function viewBounds(){const b=map.getBounds();return [b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];}

