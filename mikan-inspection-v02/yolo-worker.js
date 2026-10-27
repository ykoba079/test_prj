importScripts('../yolo-camera/vendor/ort.min.js', '../yolo-camera/detection.js');
async function createYoloDetector(onProgress=()=>{},inputSize=640){
  if(!globalThis.ort)throw new Error('ONNX Runtimeを読み込めませんでした');
  if(![320,640].includes(inputSize))throw new Error('Unsupported YOLO input size');
  const configUrl=new URL('./models/quality-'+inputSize+'/model.json?v=20261028-controls',self.location.href);
  async function fetchChecked(url){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);try{const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw new Error('HTTP '+response.status+'：'+new URL(url).pathname);return await response.arrayBuffer();}finally{clearTimeout(timer);}}
  onProgress('YOLOv9モデル設定を読み込み中…');
  const config=JSON.parse(new TextDecoder().decode(await fetchChecked(configUrl)));
  if(config.inputSize!==inputSize||config.boxFormat!=='xyxy'||config.classes.join(',')!=='mikan,mold,damage')throw new Error('YOLOモデルの入出力設定が想定と異なります');
  ort.env.wasm.wasmPaths=new URL('../yolo-camera/vendor/',self.location.href).href;ort.env.wasm.numThreads=1;
  onProgress('YOLOv9モデルと推論エンジンを準備中…');
  const bytes=await fetchChecked(new URL(config.url,configUrl));
  const session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm']});
  onProgress('YOLOv9の初回実行を準備中…');
  const warmup=new ort.Tensor('float32',new Float32Array(3*inputSize*inputSize),[1,3,inputSize,inputSize]);let warmResult;
  try{warmResult=await session.run({[session.inputNames[0]]:warmup});}finally{warmup.dispose();if(warmResult)for(const value of Object.values(warmResult))value.dispose();}
  const canvas=new OffscreenCanvas(config.inputSize,config.inputSize);const ctx=canvas.getContext('2d',{willReadFrequently:true}),source=new OffscreenCanvas(1,1),sourceCtx=source.getContext('2d');
  let lastRaw=[],lastOrphans=[],runs=0;
  return {
    name:'yolov9-quality-640',label:'YOLOv9-T · 改善モデル640',config,
    get runs(){return runs;},get lastRaw(){return lastRaw;},get lastOrphans(){return lastOrphans;},
    async detect(image,threshold=.25){const started=performance.now();
      const size=config.inputSize,scale=Math.min(size/image.width,size/image.height),w=Math.round(image.width*scale),h=Math.round(image.height*scale),padX=Math.floor((size-w)/2),padY=Math.floor((size-h)/2);
      source.width=image.width;source.height=image.height;sourceCtx.putImageData(image,0,0);ctx.fillStyle='rgb(114,114,114)';ctx.fillRect(0,0,size,size);ctx.drawImage(source,padX,padY,w,h);
      const data=ctx.getImageData(0,0,size,size).data,plane=size*size,input=new Float32Array(plane*3);for(let i=0;i<plane;i++)for(let c=0;c<3;c++)input[c*plane+i]=data[i*4+c]/255;
      let tensor,result;
      try{tensor=new ort.Tensor('float32',input,[1,3,size,size]);const inferenceStarted=performance.now();result=await session.run({[session.inputNames[0]]:tensor});const inferenceEnded=performance.now(),output=result[session.outputNames[0]];
        lastRaw=globalThis.YoloDetection.decode(output.data,output.dims,config.classes,threshold,{width:image.width,height:image.height,padX,padY,scaleX:w/image.width,scaleY:h/image.height},config.boxFormat);runs++;
        return {raw:lastRaw,timings:{preprocessMs:inferenceStarted-started,inferenceMs:inferenceEnded-inferenceStarted,postprocessMs:performance.now()-inferenceEnded}};
      }finally{tensor?.dispose();if(result)for(const value of Object.values(result))value.dispose();}
    },
  };
}

let detector;
self.onmessage=async({data})=>{
  const {id,type}=data;
  try{
    if(type==='init'){
      detector=await createYoloDetector(message=>self.postMessage({type:'progress',message}),data.inputSize||640);
      self.postMessage({id,config:detector.config});
    }else if(type==='detect'){
      const image=new ImageData(new Uint8ClampedArray(data.pixels),data.width,data.height);
      const result=await detector.detect(image,data.threshold);
      self.postMessage({id,...result});
    }else throw new Error('Unknown worker request: '+type);
  }catch(error){self.postMessage({id,error:error.message||String(error)});}
};
