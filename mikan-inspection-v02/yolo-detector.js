import '../yolo-camera/detection.js?v=20261025-line-yolo';

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
  if(!globalThis.ort)throw new Error('ONNX Runtimeを読み込めませんでした');
  const configUrl=new URL('./models/quality-640/model.json?v=20261025-line-yolo',import.meta.url);
  async function fetchChecked(url){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);try{const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw new Error('HTTP '+response.status+'：'+new URL(url).pathname);return await response.arrayBuffer();}finally{clearTimeout(timer);}}
  onProgress('YOLOv9モデル設定を読み込み中…');
  const config=JSON.parse(new TextDecoder().decode(await fetchChecked(configUrl)));
  if(config.inputSize!==640||config.boxFormat!=='xyxy'||config.classes.join(',')!=='mikan,mold,damage')throw new Error('YOLOモデルの入出力設定が想定と異なります');
  ort.env.wasm.wasmPaths=new URL('../yolo-camera/vendor/',import.meta.url).href;ort.env.wasm.numThreads=1;
  onProgress('YOLOv9モデルと推論エンジンを準備中…');
  const bytes=await fetchChecked(new URL(config.url,configUrl));
  const session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm']});
  const canvas=document.createElement('canvas');canvas.width=canvas.height=config.inputSize;const ctx=canvas.getContext('2d',{willReadFrequently:true}),source=document.createElement('canvas'),sourceCtx=source.getContext('2d');
  let lastRaw=[],lastOrphans=[],runs=0;
  return {
    name:'yolov9-quality-640',label:'YOLOv9-T · 改善モデル640',config,
    get runs(){return runs;},get lastRaw(){return lastRaw;},get lastOrphans(){return lastOrphans;},
    async detect(image,threshold=.25){
      const size=config.inputSize,scale=Math.min(size/image.width,size/image.height),w=Math.round(image.width*scale),h=Math.round(image.height*scale),padX=Math.floor((size-w)/2),padY=Math.floor((size-h)/2);
      source.width=image.width;source.height=image.height;sourceCtx.putImageData(image,0,0);ctx.fillStyle='rgb(114,114,114)';ctx.fillRect(0,0,size,size);ctx.drawImage(source,padX,padY,w,h);
      const data=ctx.getImageData(0,0,size,size).data,plane=size*size,input=new Float32Array(plane*3);for(let i=0;i<plane;i++)for(let c=0;c<3;c++)input[c*plane+i]=data[i*4+c]/255;
      let tensor,result;
      try{tensor=new ort.Tensor('float32',input,[1,3,size,size]);result=await session.run({[session.inputNames[0]]:tensor});const output=result[session.outputNames[0]];
        lastRaw=globalThis.YoloDetection.decode(output.data,output.dims,config.classes,threshold,{width:image.width,height:image.height,padX,padY,scaleX:w/image.width,scaleY:h/image.height},config.boxFormat);runs++;
        const associated=associateDetections(lastRaw);lastOrphans=associated.unassigned;return associated.fruits;
      }finally{tensor?.dispose();if(result)for(const value of Object.values(result))value.dispose();}
    },
  };
}
