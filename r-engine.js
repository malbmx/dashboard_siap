let initPromise; let chain=Promise.resolve();
async function init(status){
 if(!initPromise)initPromise=(async()=>{
 status('Preparando R en el navegador…');
 const {WebR,ChannelType}=await import('https://webr.r-wasm.org/v0.5.4/webr.mjs');
 const r=new WebR({channelType:ChannelType.PostMessage,interactive:false});await r.init();
 status('Cargando métodos estadísticos y pronósticos…');await r.installPackages(['jsonlite','forecast']);
 const code=await (await fetch('analysis.R')).text();await r.FS.writeFile('/home/web_user/analysis.R',new TextEncoder().encode(code));await r.evalRVoid('source("/home/web_user/analysis.R")');return r;
 })().catch(e=>{initPromise=null;throw e;});return initPromise;
}
export function calculate(payload,status=()=>{}){
 const task=async()=>{const r=await init(status);status('Calculando sobre los datos de la consulta…');await r.FS.writeFile('/home/web_user/input.json',new TextEncoder().encode(JSON.stringify(payload)));const out=await r.evalRString('local({ input <- jsonlite::fromJSON("/home/web_user/input.json"); result <- run_analysis(input); as.character(jsonlite::toJSON(result,auto_unbox=TRUE,na="null",null="null",digits=12,dataframe="rows")) })');return JSON.parse(out);};
 const run=chain.then(task,task);chain=run.catch(()=>{});return run;
}
