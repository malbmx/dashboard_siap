import {METRICS,describe,finite,scanAnomalies} from './core.js';
import {esc,fmt,lineChart,pngFromSvg} from './charts.js';
const para=text=>({type:'p',text}),heading=text=>({type:'h',text});
export async function createReport(S,unit,label,{rasterize=pngFromSvg}={}){
 const blocks=[],years=S.filters.years,indicator=METRICS[S.metric].label;
 const title='Análisis agrícola de '+S.title;
 blocks.push(para('AgroSpatial · Datos SIAP · Reporte generado el '+new Date().toLocaleDateString('es-MX')+'.'));
 blocks.push(heading('1. Objetivo y alcance'));
 blocks.push(para('Describir la evolución de '+S.filters.crops.map(c=>label('crop',c)).join(', ')+' en '+(S.filters.states.length?S.filters.states.map(s=>label('state',s)).join(', '):'México')+', comparar el escenario de análisis con la consulta completa y examinar posibles años anómalos. Los resultados son observacionales y no establecen causalidad.'));
 blocks.push(para('Años seleccionados: '+years.join(', ')+'. Ciclos: '+(S.filters.cycles.join(', ')||'todos')+'. Unidad de producción: '+(S.filters.units?.join(', ')||'todas las presentes')+'. Modalidades: '+(S.filters.modes.join(', ')||'todas')+'. Municipios: '+(S.filters.municipalities.length?S.filters.municipalities.map(m=>label('municipality',m)).join(', '):'todos los disponibles en la selección')+'.'));
 blocks.push(heading('2. Datos y métodos'));
 blocks.push(para('La consulta completa contiene '+fmt(S.base.length,0)+' registros; el escenario conserva '+fmt(S.active.length,0)+' registros y '+S.annual.length+' años con observaciones. Se suman superficies, producción y valor; el rendimiento se calcula como producción / superficie cosechada y el precio como valor / producción. No se promedian cocientes municipales. Una suma con componentes faltantes se informa como no disponible. No se agregan volúmenes con unidades distintas.'));
 blocks.push(para('La base publicada contiene '+fmt(S.catalog.rows,0)+' registros analíticos. La preparación identificó '+S.catalog.quality.duplicates+' duplicados exactos, excluidos de la capa analítica; '+S.catalog.quality.missing_numeric+' celdas numéricas vacías y '+S.catalog.quality.invalid_numeric+' valores no numéricos, conservados como faltantes con auditoría. Estos conteos corresponden a toda la base, no solo a esta consulta. Los archivos originales se conservan.'));
 blocks.push(para('Detección de años anómalos para '+indicator+': '+S.anomalies.note+' La detección se realiza sobre los indicadores anuales de la consulta completa; no se itera eliminando observaciones. Un año señalado puede corresponder a un fenómeno real y no es un error confirmado.'));
 blocks.push(heading('3. Resultados descriptivos'));
 blocks.push({type:'table',caption:'Tabla 1. Resumen de los indicadores anuales del escenario.',headers:['Indicador','Unidad','Años','Media','Mediana','DE'],rows:Object.entries(METRICS).map(([k,m])=>{const d=describe(S.annual.map(r=>r[k]));return[m.label,unit(k),d.n,fmt(d.mean),fmt(d.median),fmt(d.sd)];})});
 let fig=0;
 for(const [k,m]of Object.entries(METRICS)){
 const valid=S.annual.filter(r=>finite(r[k])),first=valid[0],last=valid.at(-1);if(!valid.length){blocks.push(para(m.label+': no hay datos completos con unidades compatibles.'));continue;}
 blocks.push(para(m.label+': el valor anual fue '+fmt(first[k])+' '+unit(k)+' en '+first.year+' y '+fmt(last[k])+' '+unit(k)+' en '+last.year+'. Estos extremos temporales no sustituyen una estimación de tendencia (Figura '+(fig+1)+').'));
 const svg=lineChart([{rows:S.baseline,color:'#b4bdb4',label:'Completa',dash:true},{rows:S.annual,color:'#006b76',label:'Escenario'}],k,unit(k),k===S.metric?S.anomalies.flags.map(f=>f.year):[]);
 blocks.push({type:'figure',src:await rasterize(svg),width:900,height:330,caption:'Figura '+(++fig)+'. '+m.label+' por año ('+unit(k)+'). Turquesa: escenario; gris discontinuo: consulta completa. Los huecos temporales se conservan.'});
 }
 blocks.push(heading('4. Anomalías y sensibilidad'));
 const scan=scanAnomalies(S.baseline,S.method||S.anomalyMethod||'mad');
 blocks.push(para('Revisión conjunta: '+scan.years.length+' años señalados en al menos uno de los siete indicadores: '+(scan.years.join(', ')||'ninguno')+'. '+scan.note));
 if(scan.signals.length)blocks.push({type:'table',caption:'Señales por año e indicador en la consulta completa.',headers:['Año','Indicador','Valor','Unidad','Puntuación robusta'],rows:scan.signals.map(f=>[f.year,METRICS[f.metric].label,fmt(f.value),unit(f.metric),fmt(f.score,3)])});

 blocks.push(para('Se señalaron '+S.anomalies.flags.length+' años para '+indicator+': '+(S.anomalies.flags.map(f=>f.year).join(', ')||'ninguno con el criterio aplicado')+'. No se atribuye una causa climática, económica o administrativa sin evidencia externa.'));
 if(S.anomalies.flags.length)blocks.push({type:'table',caption:'Tabla 2. Años señalados en la consulta completa.',headers:['Año','Valor','Criterio'],rows:S.anomalies.flags.map(f=>[f.year,fmt(f.value),f.reason])});
 blocks.push({type:'table',caption:'Sensibilidad del indicador '+indicator+' ('+unit()+').',headers:['Escenario','Registros','Años','Media anual'],rows:[['Completo',S.base.length,S.baseline.length,fmt(describe(S.baseline.map(r=>r[S.metric])).mean)],['Con exclusiones',S.active.length,S.annual.length,fmt(describe(S.annual.map(r=>r[S.metric])).mean)]]});
 blocks.push(para('La comparación de medias resume coberturas que pueden diferir cuando se excluyen años; no es una prueba de efecto causal de la exclusión.'));
 if(S.excluded.length)blocks.push({type:'table',caption:'Registro de exclusiones reversibles.',headers:['Tipo','Identificador','Motivo'],rows:S.excluded.map(e=>[e.type==='year'?'Año':'Registro',String(e.key),e.reason])});else blocks.push(para('No se aplicaron exclusiones.'));
 blocks.push(heading('5. Comparaciones, tendencia y pronóstico'));
 const cmp=S.comparison;if(cmp&&!cmp.error){blocks.push(para('Comparación de '+cmp.groups.join(', ')+'. Método: '+cmp.method+'. p = '+fmt(cmp.p,6)+'. '+(finite(cmp.effect)?cmp.effectName+' = '+fmt(cmp.effect,4)+'. ':'')+cmp.note));if(cmp.years)blocks.push(para('Años comunes del contraste: '+cmp.years.join(', ')+'.'));if(cmp.pairs?.length)blocks.push({type:'table',caption:'Contrastes posteriores.',headers:Object.keys(cmp.pairs[0]).map(k=>({comparison:'Contraste',difference:'Diferencia',lower:'Inferior',upper:'Superior',p_adjusted:'p ajustado'}[k]||k)),rows:cmp.pairs.map(p=>Object.values(p).map(v=>typeof v==='number'?fmt(v,6):v))});}else blocks.push(para('Comparación inferencial: '+(cmp?.error||'no ejecutada en esta consulta. Puede calcularla en la sección Comparaciones y regenerar el reporte.')));
 const sci=S.science;
 if(sci){const t=sci.trend;blocks.push(para(t.error?'Tendencia: '+t.error:'Para '+indicator+', tau de Kendall = '+fmt(t.tau,4)+', p exploratorio = '+fmt(t.p,6)+', pendiente de Sen = '+fmt(t.slope,4)+' '+unit()+'/año. IC 95% de la pendiente: '+fmt(t.lower,4)+' a '+fmt(t.upper,4)+'. '+t.note));
 if(S.excluded.length&&!sci.baselineTrend.error)blocks.push(para('En la consulta completa: tau = '+fmt(sci.baselineTrend.tau,4)+' y pendiente de Sen = '+fmt(sci.baselineTrend.slope,4)+' '+unit()+'/año.'));
 const f=sci.forecast;if(f.error)blocks.push(para(f.error));else{
 blocks.push(para('Se compararon los modelos ingenuo, ETS y ARIMA. El menor RMSE fuera de muestra seleccionó '+f.winner+' usando '+f.validationOrigins+' orígenes. '+f.note));
 blocks.push({type:'table',caption:'Validación temporal de los pronósticos.',headers:['Modelo','RMSE','MAE','Orígenes'],rows:f.accuracy.map(a=>[a.model,fmt(a.RMSE),fmt(a.MAE),a.origins])});
 blocks.push({type:'table',caption:'Proyección de '+indicator+' ('+unit()+').',headers:['Año','Estimación','Límite inferior 95%','Límite superior 95%'],rows:f.projection.map(p=>[p.year,fmt(p.mean),fmt(p.lower),fmt(p.upper)])});
 const svg=lineChart([{rows:S.annual,color:'#006b76',label:'Observado'},{rows:f.projection.map(p=>({...p,[S.metric]:p.mean})),color:'#0076bd',label:'Pronóstico',dash:true}],S.metric,unit(),[],f.projection);
 blocks.push({type:'figure',src:await rasterize(svg),width:900,height:330,caption:'Figura '+(++fig)+'. Pronóstico de '+indicator+'. Banda: intervalo predictivo del 95%.'});
 if(sci.baselineForecast&&!sci.baselineForecast.error)blocks.push(para('Sensibilidad del pronóstico: la consulta completa selecciona '+sci.baselineForecast.winner+' y proyecta '+fmt(sci.baselineForecast.projection.at(-1).mean)+' '+unit()+' para '+sci.baselineForecast.projection.at(-1).year+'. El escenario proyecta '+fmt(f.projection.at(-1).mean)+' '+unit()+' para '+f.projection.at(-1).year+'.'));
 }
 blocks.push(para('Motor: '+sci.engine+'. Paquete forecast '+sci.forecastVersion+'.'));
 }else blocks.push(para('Tendencias y pronósticos no calculados: el motor R no estuvo disponible. Este reporte no contiene resultados inferenciales inventados.'));
 if(S.bundle){
 blocks.push(heading('Tendencias de los siete indicadores'));
 blocks.push({type:'table',caption:'Tau de Kendall y pendiente de Sen por indicador. Valores p exploratorios sin corrección conjunta entre indicadores.',headers:['Indicador','Tau','p','Sen / año','IC 95%'],rows:Object.entries(S.bundle).map(([k,r])=>[METRICS[k].label,fmt(r.trend.tau,4),fmt(r.trend.p,6),fmt(r.trend.slope,4),fmt(r.trend.lower,3)+' a '+fmt(r.trend.upper,3)])});
 for(const [k,r]of Object.entries(S.bundle)){if(k===S.metric)continue;const f=r.forecast;blocks.push(heading('Pronóstico de '+METRICS[k].label.toLowerCase()));
 if(f.error){blocks.push(para(f.error));continue;}
 blocks.push(para('Modelo seleccionado: '+f.winner+'. Unidad: '+unit(k)+'. Validación a un paso con '+f.validationOrigins+' orígenes. Los intervalos del 95% son predictivos y dependen del modelo.'));
 blocks.push({type:'table',caption:'Errores fuera de muestra.',headers:['Modelo','RMSE','MAE'],rows:f.accuracy.map(a=>[a.model,fmt(a.RMSE),fmt(a.MAE)])});
 blocks.push({type:'table',caption:'Proyección anual.',headers:['Año','Estimación','Inferior 95%','Superior 95%'],rows:f.projection.map(p=>[p.year,fmt(p.mean),fmt(p.lower),fmt(p.upper)])});
 const chart=lineChart([{rows:S.annual,color:'#006b76',label:'Observado'},{rows:f.projection.map(p=>({...p,[k]:p.mean})),color:'#0076bd',label:'Pronóstico',dash:true}],k,unit(k),[],f.projection);
 blocks.push({type:'figure',src:await rasterize(chart),width:900,height:330,caption:'Figura '+(++fig)+'. Pronóstico de '+METRICS[k].label.toLowerCase()+' ('+unit(k)+'). Intervalo predictivo del 95%.'});
 }
 }
 blocks.push(heading('6. Análisis territorial'));
 if(S.spatial&&!S.spatial.error){blocks.push(para('Año '+S.spatial.year+': Moran global = '+fmt(S.spatial.I,4)+', p por permutaciones = '+fmt(S.spatial.p,4)+'. '+S.spatial.n+' entidades, '+S.spatial.permutations+' permutaciones. Vecindad Queen de cartografía INEGI sin simplificar, pesos estandarizados por fila. Los contrastes locales usan permutación condicional y ajuste BH.'));blocks.push({type:'table',caption:'LISA por entidad.',headers:['Entidad','I local','p','q BH','Patrón','Gi*','q Gi*'],rows:S.spatial.local.map(l=>[label('state',l.id),fmt(l.I,4),fmt(l.p,4),fmt(l.q,4),l.cluster,fmt(l.Gstar,3),fmt(l.gq,4)])});}else blocks.push(para('Inferencia espacial: '+(S.spatial?.error||'no ejecutada. El mapa descriptivo está disponible en la sección Territorio.')));
 blocks.push(heading('7. Interpretación y límites'));
 blocks.push(para('El reporte describe la consulta seleccionada. Una señal de anomalía no identifica su causa ni justifica por sí sola eliminar datos. Las comparaciones son observacionales y pueden verse afectadas por composición territorial, cambios de cobertura y dependencia temporal. Los importes monetarios son nominales, sin ajuste por inflación. Las superficies acumuladas entre ciclos no equivalen a superficie física única. Las ausencias de registro no se convierten en ceros.'));
 blocks.push(para('Los intervalos y pruebas dependen de sus supuestos y del tamaño de la serie. Los pronósticos no incorporan automáticamente sequías, heladas, políticas o cambios de mercado. Si se seleccionan años discontinuos, se conserva el calendario y se desactiva el pronóstico. La cartografía estatal de referencia no reconstruye los límites municipales de cada año.'));
 blocks.push(heading('8. Fuentes y reproducibilidad'));
 blocks.push(para('SIAP. Cierre de la producción agrícola municipal. '+S.catalog.sourceUrl));
 blocks.push(para('INEGI. Marco Geoestadístico, diciembre de 2025. https://gaia.inegi.org.mx/wscatgeo/v2/geo/mgee/'));
 blocks.push(para('NIST/SEMATECH. e-Handbook of Statistical Methods, Detection of Outliers. https://itl.nist.gov/div898/handbook/eda/section3/eda35h.htm'));
 blocks.push(para('R Core Team. Documentación de stats: cor.test, aov, TukeyHSD, friedman.test y wilcox.test. https://stat.ethz.ch/R-manual/R-devel/library/stats/html/00Index.html'));
 blocks.push(para('Hyndman y colaboradores. Paquete forecast, documentación de pronósticos y validación. https://pkg.robjhyndman.com/forecast/'));
 blocks.push(para('Versión de datos: '+S.catalog.builtAt+'. Los nombres de archivos, huellas SHA-256, filtros, exclusiones y resultados se conservan en la descarga de trazabilidad JSON.'));
 blocks.push({type:'table',caption:'Archivos utilizados (las huellas completas se incluyen en JSON).',headers:['Año','Archivo'],rows:S.catalog.sources.filter(s=>years.includes(s.year)).map(s=>[s.year,s.file])});
 return {title,blocks,createdAt:new Date().toISOString(),metric:S.metric};
}
export function renderReport(r,el){el.innerHTML='<h1>'+esc(r.title)+'</h1>'+r.blocks.map(b=>b.type==='h'?'<h2>'+esc(b.text)+'</h2>':b.type==='p'?'<p>'+esc(b.text)+'</p>':b.type==='figure'?'<figure><img src="'+b.src+'" alt="'+esc(b.caption)+'"><figcaption>'+esc(b.caption)+'</figcaption></figure>':'<h3>'+esc(b.caption)+'</h3><div class="tablewrap"><table><thead><tr>'+b.headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+b.rows.map(row=>'<tr>'+row.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>').join('');}
export async function exportDocx(r,download){
 const D=window.docx;if(!D)throw Error('Biblioteca Word no disponible.');
 const p=(text,opts={})=>new D.Paragraph({children:[new D.TextRun({text:String(text),font:'Calibri',size:22})],spacing:{after:150,line:280},...opts});
 const children=[new D.Paragraph({text:r.title,heading:D.HeadingLevel.TITLE})];
 for(const b of r.blocks){
 if(b.type==='h')children.push(new D.Paragraph({text:b.text,heading:D.HeadingLevel.HEADING_1,keepNext:true}));
 else if(b.type==='p')children.push(p(b.text,{keepNext:/\(Figura \d+\)/.test(b.text)}));
 else if(b.type==='figure'){
 const bytes=Uint8Array.from(atob(b.src.split(',')[1]),c=>c.charCodeAt(0));
 children.push(new D.Paragraph({children:[new D.ImageRun({type:'png',data:bytes,transformation:{width:610,height:610*b.height/b.width},altText:{title:b.caption,description:b.caption,name:b.caption}})],keepNext:true}));
 children.push(p(b.caption,{spacing:{after:220}}));
 }else{
 children.push(p(b.caption,{keepNext:true}));
 const rows=[b.headers,...b.rows].map((row,i)=>new D.TableRow({tableHeader:i===0,cantSplit:true,children:row.map(v=>new D.TableCell({children:[p(v,{spacing:{after:60}})],shading:i===0?{fill:'E7F4F6'}:undefined,margins:{top:90,bottom:90,left:90,right:90}}))}));
 children.push(new D.Table({width:{size:100,type:D.WidthType.PERCENTAGE},rows}),p(''));
 }}
 const doc=new D.Document({creator:'AgroSpatial',title:r.title,description:'Análisis reproducible de datos SIAP',styles:{default:{document:{run:{font:'Calibri',size:22}}},paragraphStyles:[{id:'Title',name:'Title',basedOn:'Normal',run:{size:36,bold:true,color:'000000'},paragraph:{spacing:{after:260}}},{id:'Heading1',name:'Heading 1',basedOn:'Normal',run:{size:27,bold:true,color:'006B76'},paragraph:{spacing:{before:250,after:140},keepNext:true}}]},sections:[{properties:{page:{size:{width:12240,height:15840},margin:{top:1000,right:1000,bottom:1000,left:1000}}},children,footers:{default:new D.Footer({children:[new D.Paragraph({alignment:D.AlignmentType.RIGHT,children:[new D.TextRun('AgroSpatial · SIAP | '),new D.TextRun({children:[D.PageNumber.CURRENT]})]})]})}}]});
 await download('Reporte_SIAP_'+r.metric+'.docx',await D.Packer.toBlob(doc));
}
export async function exportPdf(r,download){
 const {jsPDF}=window.jspdf;const pdf=new jsPDF({unit:'mm',format:'letter',compress:true});const left=18,width=180,bottom=255;let y=22;
 const clean=s=>String(s??'').replaceAll('−','-').replaceAll('→','a').replaceAll('↗','').replaceAll('…','...');
 function newPage(){pdf.addPage();y=22;}
 function text(s,size=10,bold=false){pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);pdf.setTextColor(23,46,42);const lines=pdf.splitTextToSize(clean(s),width);const lineH=size*.46;for(const line of lines){if(y+lineH>bottom)newPage();pdf.text(line,left,y);y+=lineH;}y+=3;}
 text(r.title,18,true);
 for(const b of r.blocks){
 if(b.type==='h'){if(y>210)newPage();y+=4;text(b.text,13,true);}
 else if(b.type==='p')text(b.text);
 else if(b.type==='figure'){const height=width*b.height/b.width;if(y+height+20>bottom)newPage();pdf.addImage(b.src,'PNG',left,y,width,height,undefined,'FAST');y+=height+4;text(b.caption,9);}
 else{
 if(y>220)newPage();text(b.caption,10,true);
 const cols=b.headers.length,colWidth=width/cols;
 const row=(values,header=false)=>{pdf.setFontSize(8);pdf.setFont('helvetica',header?'bold':'normal');const lines=values.map(v=>pdf.splitTextToSize(clean(v),colWidth-4));const h=Math.max(...lines.map(l=>l.length))*3.8+5;if(y+h>bottom){newPage();if(!header)row(b.headers,true);}if(header){pdf.setFillColor(231,244,246);pdf.rect(left,y,width,h,'F');}
 for(let i=0;i<cols;i++)pdf.text(lines[i],left+i*colWidth+2,y+4);pdf.setDrawColor(220,228,220);pdf.line(left,y+h,left+width,y+h);y+=h;};
 row(b.headers,true);for(const values of b.rows)row(values);y+=7;
 }}
 const n=pdf.getNumberOfPages();for(let i=1;i<=n;i++){pdf.setPage(i);pdf.setFontSize(8);pdf.setTextColor(100,117,109);pdf.text('AgroSpatial · SIAP',18,269);pdf.text(i+' / '+n,195,269,{align:'right'});}
 await download('Reporte_SIAP_'+r.metric+'.pdf',pdf.output('blob'));
}
