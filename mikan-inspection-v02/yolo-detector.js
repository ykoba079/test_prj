
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

export async function createYoloDetector(onProgress=()=>{}){
  const worker=new Worker(new URL('./yolo-worker.js?v=20261025-continuous',import.meta.url));
  let sequence=0,failure=null,runs=0,lastRaw=[],lastOrphans=[];
  const pending=new Map();
  function fail(error){failure=error;worker.terminate();for(const request of pending.values()){clearTimeout(request.timer);request.reject(error);}pending.clear();}
  worker.onerror=event=>{event.preventDefault();fail(new Error(event.message||'YOLO worker failed'));};
  worker.onmessageerror=()=>fail(new Error('YOLO worker message failed'));
  worker.onmessage=({data})=>{
    if(data.type==='progress'){onProgress(data.message);return;}
    const request=pending.get(data.id);if(!request)return;pending.delete(data.id);clearTimeout(request.timer);
    if(data.error)request.reject(new Error(data.error));else request.resolve(data);
  };
  function call(type,payload={},transfer=[]){
    if(failure)return Promise.reject(failure);
    return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>fail(new Error('YOLO worker timeout')),type==='init'?60000:30000);pending.set(id,{resolve,reject,timer});try{worker.postMessage({id,type,...payload},transfer);}catch(error){fail(error);}});
  }
  let config;try{({config}=await call('init'));}catch(error){fail(error);throw error;}
  return {
    name:'yolov9-quality-640',label:'YOLOv9-T / 640 / Worker',execution:'worker',config,
    get runs(){return runs;},get lastRaw(){return lastRaw;},get lastOrphans(){return lastOrphans;},
    async detect(image,threshold=.25){
      // Keep the original frame for the inspection preview; transfer a copy only.
      const pixels=image.data.slice().buffer;
      const result=await call('detect',{pixels,width:image.width,height:image.height,threshold},[pixels]);
      lastRaw=result.raw;runs++;const associated=associateDetections(lastRaw);lastOrphans=associated.unassigned;return associated.fruits;
    },
  };
}
