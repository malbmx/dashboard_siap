import * as C from './core.js';
import {esc,fmt,lineChart,distributionChart,comparisonChart,mapChart,pngFromSvg} from './charts.js';
import {calculate} from './r-engine.js';
import {createReport,renderReport,exportDocx,exportPdf} from './report.js';
const $=id=>document.getElementById(id), selected=id=>[...$(id).selectedOptions].map(o=>o.value);
export const S={catalog:null,cache:new Map(),rows:[],base:[],active:[],annual:[],baseline:[],excluded:[],version:0,metric:'production',method:'mad',science:null,comparison:null,spatial:null,report:null,page:0};
const setStatus=s=>$('status').textContent=s;
function notice(s){$('notice').hidden=!s;$('notice').textContent=s;}
const option=(v,t)=>'<option value="'+esc(v)+'">'+esc(t)+'</option>';
const table=(heads,rows)=>'<table><thead><tr>'+heads.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(v=>'<td>'+v+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
const label=(key,id)=>key==='state'?S.catalog.states[id]||id:key==='municipality'?S.catalog.municipalities[id]||id:key==='crop'?S.catalog.crops.find(c=>c.id===id)?.name||id:id;
export function unit(metric=S.metric){const units=[...new Set(S.base.map(r=>r.unit))];const u=units.length===1?units[0]:'unidades incompatibles';return {production:u,yield:u+'/ha',price:'MXN/'+u}[metric]||C.METRICS[metric].unit;}
function switchTab(name){document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id===name));document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));}
async function download(name,content,type='text/plain;charset=utf-8'){
 const blob=content instanceof Blob?content:new Blob([content],{type});let url;
 if(location.hostname==='127.0.0.1'&&location.port==='4173'){
  try{const result=await fetch('/__export/'+encodeURIComponent(name),{method:'POST',body:blob});if(result.ok)url=(await result.json()).url;}catch{}
 }
 url??=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.textContent='Abrir o guardar '+name;a.style.marginLeft='12px';$('status').textContent=url.startsWith('reportes/')?'Guardado en la carpeta reportes: ':'Archivo preparado: ';$('status').append(a);a.click();
}
function invalid(){S.version++;S.bundle=null;S.science=null;S.comparison=null;S.spatial=null;S.report=null;$('scienceResult').textContent='Los resultados avanzados se calcularán sobre el escenario actual.';$('comparisonResult').textContent='Calcule el contraste de los grupos seleccionados.';$('spatialResult').textContent='';$('forecastChart').innerHTML='';$('reportBody').innerHTML='<p>La consulta cambió. Genere un reporte actualizado.</p>';}
async function loadCrop(id){
 if(S.cache.has(id))return S.cache.get(id);
 const c=S.catalog.crops.find(c=>c.id===id),r=await fetch('data/'+c.file);if(!r.ok)throw Error('No se pudo cargar '+c.name);
 const bytes=await r.arrayBuffer();const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
 if(digest!==c.sha256)throw Error('La integridad del archivo de '+c.name+' no coincide con el catálogo.');
 const unpacked=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
 const rows=unpacked.map(a=>Object.fromEntries(S.catalog.fields.map((k,i)=>[k,a[i]])));S.cache.set(id,rows);return rows;
}
function refreshMunicipalities(){const states=selected('states'),old=selected('municipalities');$('municipalities').innerHTML=Object.entries(S.catalog.municipalities).filter(([id])=>!states.length||states.includes(id.slice(0,2))).sort((a,b)=>a[1].localeCompare(b[1],'es')).map(([id,name])=>option(id,name+' · '+S.catalog.states[id.slice(0,2)])).join('');for(const o of $('municipalities').options)o.selected=old.includes(o.value);}
async function query(){
 const cropIds=selected('crops'),years=[...$('years').querySelectorAll('input:checked')].map(e=>Number(e.value));
 if(!cropIds.length||!years.length){notice('Seleccione al menos un cultivo y un año.');return;}
 $('query').disabled=true;setStatus('Cargando y verificando los datos seleccionados…');notice('');
 try{
 const rows=(await Promise.all(cropIds.map(loadCrop))).flat();
 S.filters={crops:cropIds,years,states:selected('states'),municipalities:selected('municipalities'),cycles:$('cycles').value?[$('cycles').value]:[],modes:$('modes').value?[$('modes').value]:[],units:$('units').value?[$('units').value]:[]};
 S.rows=rows;S.base=C.filterRows(rows,S.filters);S.excluded=[];S.page=0;invalid();
 S.title=cropIds.map(id=>label('crop',id)).join(', ')+' · '+(S.filters.states.length?S.filters.states.map(id=>label('state',id)).join(', '):'México');
 $('queryTitle').textContent=S.title;$('querySubtitle').textContent=(years.every((y,i)=>!i||y===years[i-1]+1)?years[0]+'–'+years.at(-1):years.join(', '))+' · '+(S.filters.cycles.join(', ')||'Todos los ciclos')+' · '+(S.filters.modes.join(', ')||'Todas las modalidades');
 $('excludeYear').innerHTML=years.map(y=>option(y,y)).join('');$('mapYear').innerHTML=years.map(y=>option(y,y)).join('');$('mapYear').value=String(Math.max(...years));
 document.body.classList.remove('awaiting-query');$('makeReport').disabled=false;
 render();
 setStatus(fmt(S.base.length,0)+' registros · '+new Set(S.base.map(r=>r.municipality)).size+' municipios · '+new Set(S.base.map(r=>r.year)).size+' años con datos');
 if(!S.base.length)notice('No hay registros para esta combinación. Pruebe otro territorio, ciclo o modalidad.');
 else if(new Set(S.base.map(r=>r.unit)).size>1)notice('La consulta mezcla unidades de producción. Producción, rendimiento y precio no se agregan ni contrastan entre unidades incompatibles.');
 else if(cropIds.length>1)notice('Consulta multicultivo: los cocientes agregados describen la mezcla seleccionada; no representan el rendimiento de un cultivo individual.');
 }catch(e){notice('No se pudo completar la consulta: '+e.message);}finally{$('query').disabled=false;}
}
function render(){
 if(!S.filters)return;
 S.active=C.applyExclusions(S.base,S.excluded);S.baseline=C.aggregate(S.base);S.annual=C.aggregate(S.active);
 S.anomalyScan=C.scanAnomalies(S.baseline,S.method);S.anomalies=S.anomalyScan.byMetric[S.metric];const last=S.annual.at(-1);
 $('kpis').innerHTML=[['Producción · '+(last?.year||'—'),last?.production,unit('production')],['Superficie cosechada',last?.harvested,'ha · último año disponible'],['Rendimiento ponderado',last?.yield,unit('yield')],['Cobertura del escenario',S.active.length,'registros · '+S.annual.length+' años']].map(([name,v,u])=>'<div class="kpi"><div class="label">'+esc(name)+'</div><div class="value">'+fmt(v)+'</div><div class="unit">'+esc(u)+'</div></div>').join('');
 $('seriesChart').innerHTML=lineChart([{rows:S.baseline,color:'#b4bdb4',label:'Completa',dash:true},{rows:S.annual,color:'#006b76',label:'Escenario'}],S.metric,unit(),S.anomalies.flags.map(f=>f.year));
 $('distributionChart').innerHTML=distributionChart(S.annual.map(r=>r[S.metric]),unit());
 const d=C.describe(S.annual.map(r=>r[S.metric]));
 $('reading').innerHTML='<div class="readingitem"><strong>'+fmt(d.mean)+' <small>'+esc(unit())+'</small></strong><span>Media de los valores anuales · '+d.n+' años válidos</span></div><div class="readingitem"><strong>'+fmt(d.min)+' — '+fmt(d.max)+'</strong><span>Mínimo y máximo anual</span></div><div class="readingitem"><strong>'+S.anomalyScan.years.length+' años para revisar</strong><span>Revisión de los siete indicadores; '+S.anomalies.flags.length+' señales en '+esc(C.METRICS[S.metric].label.toLowerCase())+'</span></div>';
 $('annualTable').innerHTML=table(['Año',...Object.values(C.METRICS).map(m=>m.label),'Registros'],S.annual.map(r=>[r.year,...Object.keys(C.METRICS).map(k=>fmt(r[k])),fmt(r.n,0)]));
 $('anomalyNote').textContent=S.anomalies.note+' '+S.anomalyScan.note;
 $('anomalyTable').innerHTML=S.anomalyScan.signals.length?table(['Año','Indicador','Valor','Unidad','Puntuación robusta','Criterio','Acción'],S.anomalyScan.signals.map(f=>[f.year,esc(C.METRICS[f.metric].label),fmt(f.value),esc(unit(f.metric)),fmt(f.score,3),esc(f.reason),'<button class="textbutton" data-pick-year="'+f.year+'">Revisar / seleccionar</button>'])):'<p>No se señalaron años en los siete indicadores con el criterio actual. Esto no demuestra ausencia de anomalías.</p>';
 $('sensitivity').innerHTML=table(['Escenario','Registros','Años','Media anual ('+unit()+')'],[['Consulta completa',S.base.length,S.baseline.length,fmt(C.describe(S.baseline.map(r=>r[S.metric])).mean)],['Con exclusiones',S.active.length,S.annual.length,fmt(d.mean)]])+'<p>La media resume los años disponibles en cada escenario; si excluye años, cambia la cobertura temporal.</p>';
 $('exclusionTable').innerHTML=S.excluded.length?table(['Tipo','Identificador','Motivo','Acción'],S.excluded.map((e,i)=>[e.type==='year'?'Año':'Registro',esc(e.key),esc(e.reason),'<button class="textbutton" data-restore="'+i+'">Restaurar</button>'])):'<p>Sin exclusiones aplicadas.</p>';
 refreshComparison();renderRows();renderMap();
}
function addExclusion(type,key){
 const reason=$('exclusionReason').value.trim();if(!reason){notice('Escriba un motivo para documentar la exclusión.');$('exclusionReason').focus();return;}
 if(!S.excluded.some(e=>e.type===type&&String(e.key)===String(key)))S.excluded.push({type,key,reason,at:new Date().toISOString()});
 notice('');invalid();render();setStatus('Escenario actualizado. Se conservaron los datos originales.');
}
function renderRows(){
 const search=$('rowSearch').value.toLowerCase(),rows=S.base.filter(r=>[r.id,r.year,label('municipality',r.municipality)].some(v=>String(v).toLowerCase().includes(search)));
 const pages=Math.max(1,Math.ceil(rows.length/40));S.page=Math.min(S.page,pages-1);$('rowPage').textContent=(S.page+1)+' / '+pages;$('prevRows').disabled=S.page===0;$('nextRows').disabled=S.page>=pages-1;
 $('rawTable').innerHTML=table(['ID de origen','Año','Municipio','Ciclo','Modalidad','Producción','Unidad','Acción'],rows.slice(S.page*40,S.page*40+40).map(r=>[esc(r.id),r.year,esc(label('municipality',r.municipality)),esc(r.cycle),esc(r.mode),fmt(r.production),esc(r.unit),S.excluded.some(e=>e.type==='year'?Number(e.key)===r.year:e.key===r.id)?'<span class="tag">Excluido</span>':'<button class="textbutton" data-exclude-row="'+r.id+'">Excluir</button>']));
}
function comparisonData(){
 const key=$('groupBy').value,cut=Number($('periodCut').value);
 const rows=S.active.map(r=>({...r,group:key==='period'?(r.year<=cut?'Hasta '+cut:'Desde '+(cut+1)):r[key]}));
 return C.aggregate(rows,['year','group']);
}
function refreshComparison(){
 const old=selected('comparisonGroups'),data=comparisonData(),groups=[...new Set(data.map(r=>r.group))].sort((a,b)=>label($('groupBy').value,a).localeCompare(label($('groupBy').value,b),'es'));
 $('comparisonGroups').innerHTML=groups.map(g=>option(g,label($('groupBy').value,g))).join('');
 for(const [i,o]of [...$('comparisonGroups').options].entries())o.selected=old.some(g=>groups.includes(g))?old.includes(o.value):i<6;
 $('periodLabel').hidden=$('groupBy').value!=='period';drawComparison();
}
function drawComparison(){
 const data=comparisonData(),sel=selected('comparisonGroups');
 $('comparisonChart').innerHTML=comparisonChart(sel.map(group=>({group,rows:data.filter(r=>r.group===group)})),S.metric,id=>label($('groupBy').value,id),unit());
}
function resultHTML(r){
 if(!r)return '';if(r.error)return '<p>'+esc(r.error)+'</p>';
 let html=r.method?'<h3>'+esc(r.method)+'</h3><p>p = '+fmt(r.p,6)+(C.finite(r.effect)?' · '+esc(r.effectName)+': '+fmt(r.effect,4):'')+' · n = '+r.n+'</p>':'';
 if(r.years)html+='<p>Años comunes: '+r.years.join(', ')+'</p>';
 if(r.pairs?.length)html+=table(Object.keys(r.pairs[0]).map(k=>({comparison:'Contraste',difference:'Diferencia',lower:'Inferior',upper:'Superior',p_adjusted:'p ajustado'}[k]||k)),r.pairs.map(p=>Object.values(p).map(v=>typeof v==='number'?fmt(v,6):esc(v))));
 if(r.note)html+='<p>'+esc(r.note)+'</p>';return html;
}
async function runCompare(){
 if(!S.active.length)return;const sel=selected('comparisonGroups'),key=$('groupBy').value;
 if(['production','yield','price'].includes(S.metric)&&new Set(S.active.map(r=>r.unit)).size!==1){notice('Seleccione cultivos con una misma unidad para este contraste.');return;}
 const data=comparisonData().filter(r=>sel.includes(r.group)).map(r=>({year:r.year,group:label(key,r.group),value:r[S.metric]}));
 const version=S.version;$('runCompare').disabled=true;try{const result=await calculate({type:'comparison',data,method:$('comparisonMethod').value,period:key==='period'},setStatus);if(version!==S.version)return;S.comparison={...result,dimension:key,groups:sel.map(g=>label(key,g)),metric:S.metric};$('comparisonResult').innerHTML=resultHTML(result);S.report=null;setStatus('Comparación calculada.');}catch(e){$('comparisonResult').textContent='No se pudo calcular: '+e.message;}finally{$('runCompare').disabled=false;}
}
const seriesPayload=rows=>rows.map(r=>({year:r.year,value:r[S.metric]}));
function trendHTML(t,name){if(t.error)return '<p>'+esc(name+': '+t.error)+'</p>';return '<h3>'+esc(name)+'</h3>'+table(['Años','Tau de Kendall','p exploratorio','Pendiente de Sen / año','IC 95% de pendiente','Correlación residual rezago 1'],[[t.n,fmt(t.tau,4),fmt(t.p,6),fmt(t.slope,4),fmt(t.lower,4)+' a '+fmt(t.upper,4),fmt(t.lag1,4)]])+'<p>'+esc(t.note)+'</p>';}
async function runScience(){
 if(!S.active.length){notice('No hay datos en el escenario.');return;}
 const version=S.version;$('runScience').disabled=true;try{
 const r=await calculate({type:'science',data:seriesPayload(S.annual),baseline:seriesPayload(S.baseline),horizon:Number($('horizon').value),hasExclusions:!!S.excluded.length},setStatus);
 if(version!==S.version)return;S.science=r;S.report=null;
 let html=trendHTML(r.trend,'Tendencia del escenario');if(S.excluded.length)html+=trendHTML(r.baselineTrend,'Tendencia de la consulta completa');
 if(r.forecast.error)html+='<p>'+esc(r.forecast.error)+'</p>';else{html+='<h3>Pronóstico · '+esc(r.forecast.winner)+'</h3>'+table(['Modelo','RMSE fuera de muestra','MAE','Orígenes'],r.forecast.accuracy.map(a=>[a.model,fmt(a.RMSE),fmt(a.MAE),a.origins]))+'<p>'+esc(r.forecast.note)+'</p>';
 const projection=r.forecast.projection.map(p=>({...p,[S.metric]:p.mean}));
 $('forecastChart').innerHTML=lineChart([{rows:S.annual,color:'#006b76',label:'Observado'},{rows:projection,color:'#0076bd',label:'Pronóstico',dash:true}],S.metric,unit(),[],r.forecast.projection);}
 if(r.baselineForecast&&!r.baselineForecast.error)html+='<p>Consulta completa: modelo '+esc(r.baselineForecast.winner)+'; pronóstico final '+fmt(r.baselineForecast.projection.at(-1).mean)+' '+esc(unit())+'.</p>';
 $('scienceResult').innerHTML=html;setStatus('Análisis calculado con '+r.engine+'.');
 }catch(e){$('scienceResult').textContent='No se pudo iniciar o ejecutar R: '+e.message;setStatus('Los análisis descriptivos siguen disponibles. Revise su conexión para usar R.');}finally{$('runScience').disabled=false;}
}
function renderMap(){
 if(!S.geo)return;const year=Number($('mapYear').value),rows=C.aggregate(S.active.filter(r=>r.year===year),['state']);S.mapValues=Object.fromEntries(rows.map(r=>[r.state,r[S.metric]]));$('mapChart').innerHTML=mapChart(S.geo,S.mapValues,unit());$('mapNotes').textContent='INEGI · Marco Geoestadístico, diciembre de 2025. Unión por clave de entidad. Mapa del año '+year+'. Sin registro o indicador incompleto se representa en gris. La cartografía no reconstruye límites históricos municipales.';
}
function runSpatial(){
 const r=C.spatialStats(S.geo.features,S.mapValues);S.spatial={...r,year:Number($('mapYear').value),metric:S.metric};S.report=null;
 $('spatialResult').innerHTML=r.error?esc(r.error):'<h3>Moran global: '+fmt(r.I,4)+' · p por permutaciones: '+fmt(r.p,4)+'</h3><p>'+r.n+' entidades · '+r.permutations+' permutaciones · vecindad Queen, pesos por fila. LISA con permutación condicional y ajuste BH.</p>'+table(['Entidad','I local','p','q (BH)','Patrón descriptivo','Gi*','q Gi* (BH)'],r.local.map(l=>[esc(label('state',l.id)),fmt(l.I,3),fmt(l.p,4),fmt(l.q,4),esc(l.cluster)+(l.q<.05?' · q < 0.05':' · no significativo'),fmt(l.Gstar,3),fmt(l.gq,4)]));
}
async function makeReport(){
 if(!S.active.length){notice('Consulte datos antes de generar un reporte.');return;}
 $('makeReport').disabled=true;try{const version=S.version;
 if(!S.bundle){setStatus('Calculando tendencias y pronósticos de los siete indicadores…');
 const metrics=Object.fromEntries(Object.keys(C.METRICS).map(k=>[k,{data:S.annual.map(r=>({year:r.year,value:r[k]})),baseline:S.baseline.map(r=>({year:r.year,value:r[k]}))}]));
 try{S.bundle=await calculate({type:'report',metrics,horizon:Number($('horizon').value),hasExclusions:!!S.excluded.length},setStatus);if(version!==S.version){S.bundle=null;return;}S.science=S.bundle[S.metric];}catch(e){notice('Reporte descriptivo: no se completaron los análisis en R. '+e.message);}
 }
 setStatus('Preparando el reporte y sus figuras…');const report=await createReport(S,unit,label);if(version!==S.version)return;S.report=report;renderReport(report,$('reportBody'));switchTab('report');setStatus('Reporte listo para descargar en Word y PDF.');}catch(e){notice('No se pudo generar el reporte: '+e.message);}finally{$('makeReport').disabled=false;}
}
function session(){return {app:'AgroSpatial SIAP 1.0',createdAt:new Date().toISOString(),dataBuild:S.catalog.builtAt,filters:S.filters,metric:S.metric,anomalyMethod:S.method,anomalyScan:S.anomalyScan,excluded:S.excluded,counts:{baseline:S.base.length,scenario:S.active.length},sources:S.catalog.sources.filter(s=>S.filters.years.includes(s.year)),science:S.science,allIndicators:S.bundle,comparison:S.comparison,spatial:S.spatial};}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
$('query').onclick=query;$('states').onchange=refreshMunicipalities;
$('allYears').onclick=()=>document.querySelectorAll('#years input').forEach(e=>e.checked=true);$('noYears').onclick=()=>document.querySelectorAll('#years input').forEach(e=>e.checked=false);
$('cropSearch').oninput=()=>{const term=$('cropSearch').value.toLocaleLowerCase('es');for(const o of $('crops').options)o.hidden=!o.text.toLocaleLowerCase('es').includes(term)&&!o.selected;};
$('metric').onchange=()=>{S.metric=$('metric').value;invalid();render();};
$('anomalyMethod').onchange=()=>{S.method=$('anomalyMethod').value;S.version++;S.report=null;$('reportBody').textContent='El criterio de anomalías cambió. Genere un reporte actualizado.';render();};
$('addExclusion').onclick=()=>addExclusion('year',Number($('excludeYear').value));$('restoreAll').onclick=()=>{S.excluded=[];invalid();render();};
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.pickYear){$('excludeYear').value=b.dataset.pickYear;$('exclusionReason').focus();}if(b.dataset.restore!==undefined){S.excluded.splice(Number(b.dataset.restore),1);invalid();render();}if(b.dataset.excludeRow)addExclusion('record',b.dataset.excludeRow);if(b.dataset.download){const data=await pngFromSvg($(b.dataset.download).innerHTML);const blob=await(await fetch(data)).blob();download('siap-'+S.metric+'.png',blob);}});
$('rowSearch').oninput=()=>{S.page=0;renderRows();};$('prevRows').onclick=()=>{S.page--;renderRows();};$('nextRows').onclick=()=>{S.page++;renderRows();};
$('downloadAnnual').onclick=()=>download('siap-anual.csv',C.csv(S.annual,['year',...Object.keys(C.METRICS),'n']));
$('downloadRows').onclick=()=>{const rows=S.base.map(r=>({...r,source:S.catalog.sources[r.source].file,excluded:!C.applyExclusions([r],S.excluded).length}));download('siap-registros.csv',C.csv(rows,[...S.catalog.fields,'excluded']));};
$('groupBy').onchange=()=>{S.version++;S.comparison=null;S.report=null;$('reportBody').textContent='La comparación cambió. Genere un reporte actualizado.';$('comparisonResult').textContent='Calcule la comparación de los nuevos grupos.';refreshComparison();};
$('periodCut').onchange=()=>{S.version++;S.comparison=null;S.report=null;$('reportBody').textContent='La comparación cambió. Genere un reporte actualizado.';refreshComparison();};
$('comparisonGroups').onchange=()=>{S.version++;S.comparison=null;S.report=null;$('reportBody').textContent='La comparación cambió. Genere un reporte actualizado.';$('comparisonResult').textContent='Calcule la comparación de los grupos seleccionados.';drawComparison();};
$('comparisonMethod').onchange=()=>{S.version++;S.comparison=null;S.report=null;$('reportBody').textContent='La comparación cambió. Genere un reporte actualizado.';$('comparisonResult').textContent='Calcule la comparación con el método seleccionado.';};
$('runCompare').onclick=runCompare;$('runScience').onclick=runScience;$('horizon').onchange=()=>{invalid();render();};
$('mapYear').onchange=()=>{S.spatial=null;S.report=null;$('spatialResult').innerHTML='';renderMap();};$('runSpatial').onclick=runSpatial;
$('makeReport').onclick=makeReport;$('exportSession').onclick=()=>download('siap-trazabilidad.json',JSON.stringify(session(),null,2),'application/json');
$('exportDocx').onclick=async()=>{if(!S.report)await makeReport();if(S.report)await exportDocx(S.report,download);};
$('exportPdf').onclick=async()=>{if(!S.report)await makeReport();if(S.report)await exportPdf(S.report,download);};
$('showMethods').onclick=()=>{ $('methodsDialog').showModal();};$('closeMethods').onclick=()=>$('methodsDialog').close();
async function init(){
 try{
 const r=await fetch('data/catalog.json');if(!r.ok)throw Error('No se encontró el catálogo. Ejecute la preparación de datos.');S.catalog=await r.json();
 $('coverage').textContent=Math.min(...S.catalog.years)+'–'+Math.max(...S.catalog.years);
 $('crops').innerHTML=S.catalog.crops.map(c=>option(c.id,c.name+' · '+c.units.join('/'))).join('');$('crops').selectedIndex=-1;
 $('states').innerHTML=Object.entries(S.catalog.states).sort((a,b)=>a[1].localeCompare(b[1],'es')).map(([id,name])=>option(id,name)).join('');$('states').selectedIndex=-1;refreshMunicipalities();
 $('years').innerHTML=S.catalog.years.map(y=>'<label><input type="checkbox" value="'+y+'"><span>'+y+'</span></label>').join('');
 $('cycles').innerHTML+=['Otoño-Invierno','Primavera-Verano','Perennes'].map(v=>option(v,v)).join('');$('modes').innerHTML+=['Riego','Temporal'].map(v=>option(v,v)).join('');
 $('metric').innerHTML=Object.entries(C.METRICS).map(([key,m])=>option(key,m.label)).join('');$('metric').value=S.metric;
 try{S.geo=await(await fetch('data/states-display.geojson')).json();}catch{$('mapNotes').textContent='Cartografía no disponible.';$('runSpatial').disabled=true;}
 $('methodsContent').innerHTML=await(await fetch('methods.html')).text();
 $('querySubtitle').textContent='Selecciona un cultivo y los años que deseas analizar. Después pulsa «Consultar datos».';setStatus('Sin consulta ejecutada.');$('query').disabled=false;
 }catch(e){notice(e.message);setStatus('No fue posible iniciar la consulta.');}
}
init();
window.siap={state:S,query,runScience,runCompare,makeReport,session,exportDocx:()=>exportDocx(S.report,download),exportPdf:()=>exportPdf(S.report,download)};
