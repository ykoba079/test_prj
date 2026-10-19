'use strict';
const $=id=>document.getElementById(id);
const video=$('video'),canvas=$('canvas'),ctx=canvas.getContext('2d');
const inputCanvas=document.createElement('canvas'),inputCtx=inputCanvas.getContext('2d',{willReadFrequently:true});
let session,config,stream,running=false,busy=false,generation=0,lastImage=null;
const status=text=>$('status').textContent=text;
function controls(){
  $('start').disabled=!session||(!running&&busy);
  $('start').setAttribute('aria-pressed',String(running));
  $('cameraLabel').textContent=running?'■ 停止':'カメラで試す';
  $('chooseImage').disabled=$('image').disabled=!session||running||busy;
  $('facing').disabled=running||busy;
}
function stop(){running=false;generation++;if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;controls();}
function prepare(source){
  const width=source.videoWidth||source.naturalWidth,height=source.videoHeight||source.naturalHeight,size=config.inputSize;
  const scale=Math.min(size/width,size/height),w=Math.round(width*scale),h=Math.round(height*scale);
  const padX=Math.floor((size-w)/2),padY=Math.floor((size-h)/2);
  inputCtx.fillStyle='rgb(114,114,114)';inputCtx.fillRect(0,0,size,size);inputCtx.drawImage(source,padX,padY,w,h);
  const pixels=inputCtx.getImageData(0,0,size,size).data,plane=size*size,data=new Float32Array(plane*3);
  for(let i=0;i<plane;i++){data[i]=pixels[i*4]/255;data[plane+i]=pixels[i*4+1]/255;data[plane*2+i]=pixels[i*4+2]/255;}
  return {tensor:new ort.Tensor('float32',data,[1,3,size,size]),geometry:{width,height,padX,padY,scaleX:w/width,scaleY:h/height}};
}
async function infer(source,token){
  if(busy)return;busy=true;controls();
  let tensor,result;
  try{
    const t=performance.now(),prepared=prepare(source);tensor=prepared.tensor;
    // Show exactly the frame used for inference, so boxes and image stay aligned.
    canvas.width=prepared.geometry.width;canvas.height=prepared.geometry.height;ctx.drawImage(source,0,0,canvas.width,canvas.height);
    result=await session.run({[session.inputNames[0]]:tensor});
    if(token!==generation)return;
    const out=result[session.outputNames[0]];
    const boxes=YoloDetection.decode(out.data,out.dims,config.classes,Number($('threshold').value)/100,prepared.geometry,config.boxFormat);
    ctx.font=`${Math.max(16,Math.round(canvas.width/50))}px sans-serif`;ctx.lineWidth=Math.max(2,canvas.width/320);
    for(const b of boxes){
      ctx.strokeStyle='#70ffc0';ctx.strokeRect(b.x1,b.y1,b.x2-b.x1,b.y2-b.y1);
      const label=`${b.label} ${(b.score*100).toFixed(0)}%`,h=Math.max(24,canvas.width/35),w=ctx.measureText(label).width+12;
      const x=Math.min(b.x1,Math.max(0,canvas.width-w)),y=Math.max(0,b.y1-h);
      ctx.fillStyle='#102d24';ctx.fillRect(x,y,w,h);ctx.fillStyle='white';ctx.fillText(label,x+6,y+h-6);
    }
    const ms=performance.now()-t;
    $('metrics').textContent=`${config.name} ｜ ${boxes.length}件 ｜ ${ms.toFixed(0)} ms/回 ｜ ${(1000/ms).toFixed(1)} 回/秒（処理時間から算出）`;
  }finally{tensor?.dispose();if(result)for(const value of Object.values(result))value.dispose();busy=false;controls();}
}
async function loop(token){
  if(!running||token!==generation)return;
  try{await infer(video,token);}catch(e){stop();status('検出に失敗しました: '+e.message);console.error(e);return;}
  if(running&&token===generation)requestAnimationFrame(()=>loop(token));
}
$('start').onclick=async()=>{
  if(running){stop();status('停止しました');return;}
  busy=true;controls();status('カメラを起動中…');
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw Error('HTTPSまたはlocalhostで開いてください。');
    const facing=document.querySelector('input[name="facing"]:checked').value;
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing},width:{ideal:640},height:{ideal:480}},audio:false});
    video.srcObject=stream;await video.play();running=true;lastImage=null;status('検出中（端末内で処理）');
  }catch(e){stop();status('カメラを開始できません: '+e.message);}
  finally{busy=false;controls();}
  if(running)loop(++generation);
};
$('chooseImage').onclick=()=>$('image').click();
$('threshold').oninput=()=>{$('thresholdValue').value=$('threshold').value+'%';};
$('threshold').onchange=async()=>{if(lastImage&&!running&&!busy)try{await infer(lastImage,generation);}catch(e){status(e.message);}};
$('image').onchange=async event=>{
  const file=event.target.files[0];if(!file)return;
  const url=URL.createObjectURL(file);busy=true;controls();
  try{const image=new Image();image.src=url;await image.decode();lastImage=image;busy=false;await infer(image,++generation);status('画像の検出が完了しました');}
  catch(e){status('画像の検出に失敗しました: '+e.message);}
  finally{busy=false;controls();URL.revokeObjectURL(url);event.target.value='';}
};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&running){stop();status('画面を離れたため停止しました');}});
window.addEventListener('pagehide',stop);
async function fetchResource(url,label){
  let response;
  try{response=await fetch(url);}catch(e){throw Error(`${label}を取得できません: ${url}。接続先とファイルの配置を確認してください。`);}
  if(!response.ok)throw Error(`${label}を取得できません（HTTP ${response.status}）: ${url}`);
  return response;
}
(async()=>{
  let stage='起動';
  try{
    if(location.protocol==='file:')throw Error('HTMLのダブルクリックではモデルを読み込めません。python yolo-camera/serve.py を実行し、http://127.0.0.1:8002/yolo-camera/detectsample_camera_yolo.html で開いてください。');
    if(!globalThis.ort)throw Error('推論エンジンを読み込めません。');
    stage='設定ファイル';
    const configUrl=new URL('model.json',location.href);
    const response=await fetchResource(configUrl.href,'設定ファイル');config=await response.json();
    if(!Number.isInteger(config.inputSize)||config.inputSize<=0||!Array.isArray(config.classes)||!config.classes.length)throw Error('モデル設定が不正です。');
    if(!['xyxy','cxcywh'].includes(config.boxFormat))throw Error('boxFormatはxyxyまたはcxcywhを指定してください。');
    inputCanvas.width=inputCanvas.height=config.inputSize;
    ort.env.wasm.wasmPaths=new URL('vendor/',location.href).href;ort.env.wasm.numThreads=1;
    stage='ONNXモデル';status('物体検出モデルを読み込み中…');
    const modelResponse=await fetchResource(new URL(config.url,configUrl).href,'ONNXモデル');
    const modelBytes=await modelResponse.arrayBuffer();
    stage='WASM推論エンジン';status('推論エンジンを準備中…');
    session=await ort.InferenceSession.create(modelBytes,{executionProviders:['wasm']});
    status('● 準備完了');controls();
  }catch(e){
    const hint=stage==='WASM推論エンジン'?' vendor内の .mjs と .wasm が配信されていることを確認してください。':'';
    status(`モデルの読み込みに失敗しました［${stage}］: ${e.message}${hint}`);console.error(e);
  }
})();
