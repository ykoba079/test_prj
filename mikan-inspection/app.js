import {colorDetect,decodeYolo} from './vision.js';
const B=globalThis.BABYLON,$=id=>document.getElementById(id),labels=['良品','カビ','傷'],colors=['#b5ee91','#ff8277','#ffc265'];
const engine=new B.Engine($('scene'),true,{preserveDrawingBuffer:true}),scene=new B.Scene(engine);
scene.clearColor=B.Color4.FromHexString('#1b2925ff');
const camera=new B.ArcRotateCamera('orbit',-Math.PI/2.5,Math.PI/3.1,16,new B.Vector3(0,0,0),scene);camera.attachControl($('scene'),true);camera.lowerRadiusLimit=8;camera.upperRadiusLimit=25;camera.layerMask=1;
const light=new B.HemisphericLight('sky',new B.Vector3(0,1,0),scene);light.intensity=1.2;
function mat(name,color){const m=new B.StandardMaterial(name,scene);m.diffuseColor=B.Color3.FromHexString(color);m.specularColor=new B.Color3(.08,.08,.08);return m;}
const metal=mat('metal','#80968a'),dark=mat('belt','#35433d'),orange=mat('orange','#ff961c'),green=mat('mold','#529267'),brown=mat('bruise','#754028'),stem=mat('stem','#64823b'),accent=mat('robot','#d9e5b4');
for(const material of [green,brown]){material.disableLighting=true;material.emissiveColor=material.diffuseColor.clone();}
function box(name,w,h,d,x,y,z,m,layer=1){const a=B.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);a.position.set(x,y,z);a.material=m;a.layerMask=layer;return a;}
box('floor',28,.1,20,0,-1.4,0,mat('floor','#21312b'));
box('conveyor',14,.25,2.7,0,-.16,0,dark,3);
for(const z of [-1.55,1.55]){box('rail',14,.3,.12,0,-.1,z,metal);for(const x of [-5,0,5])box('leg',.18,1.2,.18,x,-.8,z,metal);}
const slats=[];for(let x=-7;x<7;x+=.4)slats.push(box('slat',.025,.01,2.65,x,-.025,0,metal));
const goodBin=box('good-bin',1.5,.7,3,7.6,-.7,0,mat('good-bin','#58734d'));
box('reject-bin',2.2,.6,2.1,3,-.7,3.6,mat('reject-bin','#7a5142'));
for(const x of [-2.8,1.4])box('camera-post',.13,3.5,.13,x,1.4,-1.9,metal);
box('camera-crossbar',4.4,.13,.13,-.7,3.1,-1.9,metal);box('camera-housing',.6,.25,.6,-.7,2.9,0,accent);
box('robot-base',.85,.35,.85,3,.05,2.5,metal);
const armA=B.MeshBuilder.CreateCylinder('arm-a',{height:1,diameter:.18},scene),armB=B.MeshBuilder.CreateCylinder('arm-b',{height:1,diameter:.15},scene);armA.material=accent;armB.material=accent;armA.layerMask=armB.layerMask=1;
const claw=box('gripper',.48,.18,.48,3,1,2.5,metal);
function segment(mesh,a,b){mesh.position=B.Vector3.Center(a,b);mesh.scaling.y=B.Vector3.Distance(a,b);mesh.rotationQuaternion=B.Quaternion.FromUnitVectorsToRef(B.Axis.Y,b.subtract(a).normalize(),new B.Quaternion());}
function robot(target){const base=new B.Vector3(3,.3,2.5),elbow=new B.Vector3(3,2.2,1.8);segment(armA,base,elbow);segment(armB,elbow,target);claw.position.copyFrom(target);}
robot(new B.Vector3(3,1.2,2.5));
const inspectionCamera=new B.FreeCamera('inspection',new B.Vector3(0,10,0),scene);inspectionCamera.upVector=new B.Vector3(0,0,1);inspectionCamera.setTarget(B.Vector3.Zero());inspectionCamera.mode=B.Camera.ORTHOGRAPHIC_CAMERA;inspectionCamera.orthoLeft=-6;inspectionCamera.orthoRight=6;inspectionCamera.orthoTop=3;inspectionCamera.orthoBottom=-3;inspectionCamera.layerMask=2;
const rt=new B.RenderTargetTexture('inspection',{width:640,height:320},scene,false,true,B.Engine.TEXTURETYPE_UNSIGNED_BYTE);rt.activeCamera=inspectionCamera;rt.renderList=[];rt.clearColor=new B.Color4(.08,.1,.09,1);scene.customRenderTargets.push(rt);rt.renderList.push(scene.getMeshByName('conveyor'));
let fruits=[],nextId=1,paused=false,spawnClock=0,scanClock=0,busy=false,session=null,activeJob=null,epoch=0;const stats={total:0,good:0,reject:0};
function log(message){const li=document.createElement('li');li.textContent=new Date().toLocaleTimeString('ja-JP')+'  '+message;$('log').prepend(li);while($('log').children.length>6)$('log').lastChild.remove();}
function metrics(){for(const k in stats)$(k).textContent=stats[k];}
function spawn(){
  const type=Math.random()*100<+$('rate').value?(Math.random()<.5?1:2):0;
  const root=new B.TransformNode('fruit',scene),fruit=B.MeshBuilder.CreateSphere('mikan',{diameter:.78,segments:20},scene);fruit.scaling.y=.82;fruit.material=orange;fruit.parent=root;fruit.layerMask=3;
  const meshes=[fruit];const cap=B.MeshBuilder.CreateCylinder('stem',{height:.045,diameter:.11},scene);cap.material=stem;cap.parent=root;cap.position.y=.34;cap.layerMask=3;meshes.push(cap);
  if(type){for(let i=0;i<5;i++){const patch=B.MeshBuilder.CreateSphere('defect',{diameter:.19+Math.random()*.08,segments:10},scene);patch.scaling.y=.25;patch.position.set((Math.random()-.5)*.25,.31,(Math.random()-.5)*.25);patch.material=type===1?green:brown;patch.parent=root;patch.layerMask=3;meshes.push(patch);}}
  root.position.set(-6.8,.34,(Math.random()-.5)*1.65);rt.renderList.push(...meshes);fruits.push({id:nextId++,root,meshes,decision:null,inspected:false,picked:false});
}
function dispose(f){rt.renderList=rt.renderList.filter(m=>!f.meshes.includes(m));f.root.dispose();fruits=fruits.filter(a=>a!==f);}
const ctx=$('inspection').getContext('2d'),overlay=$('overlay').getContext('2d'),input=document.createElement('canvas');input.width=input.height=640;const inputCtx=input.getContext('2d');
async function infer(image){if($('mode').value==='color')return colorDetect(image);if(!session)throw new Error('モデル未読込');inputCtx.fillStyle='rgb(114,114,114)';inputCtx.fillRect(0,0,640,640);inputCtx.putImageData(image,0,160);const data=inputCtx.getImageData(0,0,640,640).data,tensor=new Float32Array(3*640*640);for(let i=0;i<640*640;i++)for(let c=0;c<3;c++)tensor[c*640*640+i]=data[i*4+c]/255;const output=await session.run({[session.inputNames[0]]:new ort.Tensor('float32',tensor,[1,3,640,640])});return decodeYolo(output[session.outputNames[0]]);}
async function scan(){if(busy||paused)return;busy=true;const token=epoch,t0=performance.now();
  // Snapshot positions before async readback/inference; predict motion by matching the capture-time position.
  const snapshot=fruits.filter(f=>!f.picked).map(f=>({f,x:f.root.position.x,z:f.root.position.z}));
  try{const pixels=await rt.readPixels();if(!pixels)return;const image=new ImageData(640,320);for(let y=0;y<320;y++)image.data.set(pixels.subarray((319-y)*2560,(320-y)*2560),y*2560);const detections=await infer(image);if(token!==epoch)return;ctx.putImageData(image,0,0);overlay.clearRect(0,0,640,320);
    for(const d of detections){overlay.strokeStyle=colors[d.classId];overlay.lineWidth=2;overlay.strokeRect(d.x0,d.y0,d.x1-d.x0,d.y1-d.y0);overlay.fillStyle=colors[d.classId];overlay.font='13px sans-serif';overlay.fillText(labels[d.classId]+($('mode').value==='yolo'?' '+Math.round(d.score*100)+'%':''),d.x0,Math.max(14,d.y0-5));
      const x=((d.x0+d.x1)/2)/640*12-6,z=3-((d.y0+d.y1)/2)/320*6;
      const match=snapshot.map(s=>({...s,distance:Math.hypot(s.x-x,s.z-z)})).sort((a,b)=>a.distance-b.distance)[0];
      if(!match||match.distance>.55||!fruits.includes(match.f)||match.f.picked)continue;
      const f=match.f;if(!f.inspected){f.inspected=true;stats.total++;}if(d.classId>0&&f.decision!==d.classId){f.decision=d.classId;log('#'+f.id+' '+labels[d.classId]+'を画像から検出 → 排除予約');}else if(f.decision===null)f.decision=0;
    }metrics();$('latency').textContent=Math.round(performance.now()-t0)+' ms';
  }catch(e){paused=true;$('pause').textContent='再開';$('status').textContent='検出エラー：停止中';log(e.message);}finally{busy=false;}}
function update(dt){if(paused)return;const speed=+$('speed').value;spawnClock+=dt;scanClock+=dt;if(spawnClock>1.45/speed){spawn();spawnClock=0;}for(const s of slats){s.position.x+=dt*speed;if(s.position.x>7)s.position.x-=14;}
  for(const f of [...fruits]){if(f.picked)continue;f.root.position.x+=dt*speed;
    if(f.decision>0&&!activeJob&&f.root.position.x>=2&&f.root.position.x<4){f.picked=true;activeJob={f,t:0,start:f.root.position.clone()};}
    if(f.root.position.x>7.2){if(f.decision>0)log('#'+f.id+' 排除待ち超過（アーム処理能力不足）');else if(f.inspected){stats.good++;log('#'+f.id+' 良品通過');}else log('#'+f.id+' 未検出のまま通過');dispose(f);metrics();}}
  if(activeJob){const j=activeJob;j.t+=dt;const p=Math.min(j.t/1.25,1),end=new B.Vector3(3,.2,3.6);j.f.root.position.copyFrom(B.Vector3.Lerp(j.start,end,p));j.f.root.position.y+=Math.sin(p*Math.PI)*1.4;robot(j.f.root.position.add(new B.Vector3(0,.5,0)));if(p===1){stats.reject++;log('#'+j.f.id+' '+labels[j.f.decision]+'を排除完了');dispose(j.f);activeJob=null;metrics();}}else robot(new B.Vector3(3,1.2,2.5));
  if(scanClock>.25){scanClock=0;scan();}}
$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'再開':'一時停止';$('status').textContent=paused?'ライン停止中':($('mode').value==='yolo'?'YOLO推論 稼働中':'画像解析デモ 稼働中');};
$('reset').onclick=()=>{epoch++;for(const f of [...fruits])dispose(f);activeJob=null;nextId=1;spawnClock=scanClock=0;Object.keys(stats).forEach(k=>stats[k]=0);metrics();overlay.clearRect(0,0,640,320);ctx.clearRect(0,0,640,320);log('ラインをリセットしました');};
$('speed').oninput=()=>{$('speedValue').value=(+$('speed').value).toFixed(1)+'×';};$('rate').oninput=()=>{$('rateValue').value=$('rate').value+'%';};
$('mode').onchange=()=>{epoch++;$('status').textContent=paused?'ライン停止中':($('mode').value==='yolo'?'YOLO推論 稼働中':'画像解析デモ 稼働中');$('reset').click();};
$('model').onchange=async e=>{const file=e.target.files[0];if(!file)return;$('modelNote').textContent='モデルを読み込み中…';try{ort.env.wasm.numThreads=1;const candidate=await ort.InferenceSession.create(await file.arrayBuffer(),{executionProviders:['wasm']});const previous=session;session=candidate;const blank=new ImageData(640,320);const oldMode=$('mode').value;$('mode').options[1].disabled=false;$('mode').value='yolo';try{await infer(blank);}catch(error){session=previous;$('mode').value=oldMode;$('mode').options[1].disabled=!previous;await candidate.release();throw error;}if(previous)await previous.release();$('modelNote').textContent=file.name+' 読込済み（精度はモデルに依存）';$('mode').dispatchEvent(new Event('change'));log('YOLO / ONNX モデルを有効化');}catch(error){$('modelNote').textContent='読込失敗：'+error.message;}};
let last=performance.now();engine.runRenderLoop(()=>{const now=performance.now(),dt=Math.min((now-last)/1000,.05);last=now;update(dt);scene.render();});window.addEventListener('resize',()=>engine.resize());
for(let i=0;i<5;i++){spawn();fruits.at(-1).root.position.x=-5.5+i*1.5;}
globalThis.mikanDebug={scene,stats,get fruits(){return fruits;},get busy(){return busy;}};
