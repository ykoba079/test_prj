
const intersection=(a,b)=>Math.max(0,Math.min(a.x2,b.x2)-Math.max(a.x1,b.x1))*Math.max(0,Math.min(a.y2,b.y2)-Math.max(a.y1,b.y1));

// The detector associates image-space defect boxes with detected fruit boxes only.
// No generated defect class, simulation ID or hidden mesh is available here.
export function associateDetections(boxes){
  const fruits=boxes.filter(b=>b.label==='mikan').map(b=>({x0:b.x1,y0:b.y1,x1:b.x2,y1:b.y2,score:b.score,defects:[],defectBoxes:[]})),unassigned=[];
  for(const b of boxes.filter(b=>b.label==='mold'||b.label==='damage')){
    const cx=(b.x1+b.x2)/2,cy=(b.y1+b.y2)/2,area=(b.x2-b.x1)*(b.y2-b.y1);
    const candidates=fruits.map(f=>{const coverage=intersection(b,{x1:f.x0,y1:f.y0,x2:f.x1,y2:f.y1})/Math.max(1e-6,area);return {f,coverage,area:(f.x1-f.x0)*(f.y1-f.y0)};}).filter(({f,coverage})=>cx>=f.x0&&cx<=f.x1&&cy>=f.y0&&cy<=f.y1&&coverage>=.6).sort((a,b)=>b.coverage-a.coverage||a.area-b.area);
    const patch={kind:b.label,x0:b.x1,y0:b.y1,x1:b.x2,y1:b.y2,score:b.score};
    if(!candidates.length){unassigned.push(patch);continue;}
    const f=candidates[0].f;if(!f.defects.includes(b.label))f.defects.push(b.label);f.defectBoxes.push(patch);
  }
  return {fruits,unassigned};
}

export async function createYoloDetector(onProgress=()=>{},inputSize=640){
  const clients=[];let runs=0,lastRaw=[],lastOrphans=[];
  function makeClient(){
    const worker=new Worker(new URL('./yolo-worker.js?v=20261028-controls',import.meta.url)),pending=new Map();let sequence=0,failure=null;
    function fail(error){failure=error;worker.terminate();for(const r of pending.values()){clearTimeout(r.timer);r.reject(error);}pending.clear();}
    worker.onerror=event=>{event.preventDefault();fail(new Error(event.message||'YOLO worker failed'));};worker.onmessageerror=()=>fail(new Error('YOLO worker message failed'));
    worker.onmessage=({data})=>{if(data.type==='progress'){onProgress(data.message);return;}const r=pending.get(data.id);if(!r)return;pending.delete(data.id);clearTimeout(r.timer);if(data.error)r.reject(new Error(data.error));else r.resolve(data);};
    function call(type,payload={},transfer=[]){if(failure)return Promise.reject(failure);return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>fail(new Error('YOLO worker timeout')),type==='init'?60000:30000);pending.set(id,{resolve,reject,timer});try{worker.postMessage({id,type,...payload},transfer);}catch(error){fail(error);}});}
    return {call,fail};
  }
  clients.push(makeClient(),makeClient());let config;
  try{const ready=await Promise.all(clients.map(c=>c.call('init',{inputSize})));config=ready[0].config;if(JSON.stringify(config)!==JSON.stringify(ready[1].config))throw new Error('Inconsistent camera models');}catch(error){clients.forEach(c=>c.fail(error));throw error;}
  async function detectFrame(image,threshold=.25,channel=0){
    const pixels=image.data.slice().buffer,result=await clients[channel%clients.length].call('detect',{pixels,width:image.width,height:image.height,threshold:Math.min(threshold,.65)},[pixels]);
    const raw=result.raw.filter(b=>b.score>=(b.label==='mikan'?.65:threshold)),associated=associateDetections(raw);runs++;lastRaw=raw;lastOrphans=associated.unassigned;
    return {fruits:associated.fruits,orphans:associated.unassigned,raw,timings:result.timings};
  }
  return {name:'yolov9-quality-'+inputSize,label:'YOLOv9-T / '+inputSize+' / dual camera workers',execution:'worker',workers:2,config,
    dispose(){clients.forEach(c=>c.fail(new Error('YOLO session replaced')));},
    get runs(){return runs;},get lastRaw(){return lastRaw;},get lastOrphans(){return lastOrphans;},detectFrame,
    async detect(image,threshold=.25){return (await detectFrame(image,threshold,0)).fruits;},
  };
}
