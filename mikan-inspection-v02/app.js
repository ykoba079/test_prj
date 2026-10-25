import {colorDetector} from './vision.js?v=20261025-bluegreen-mold';
import {createFruitFactory,random} from './fruit.js?v=20261025-bluegreen-mold';
import {createMechanics} from './physics.js?v=20261025-bluegreen-mold';
import {createYoloDetector} from './yolo-detector.js?v=20261026-image-control-2';
import {createImageTracker,fuseViews,PICK_ZONE,TRACK_RULE} from './tracking.js?v=20261026-image-control-2';
const B=globalThis.BABYLON,$=id=>document.getElementById(id),names={mold:'カビ',damage:'傷'},stateNames={observing:'観測中',good:'良品通過',reject:'不良排除',unknown:'未判定隔離',sorting:'アーム移動中',escaping:'取り逃がし・搬送中',escaped:'取り逃がし通過',missed:'搬送異常'};
if(!B?.Engine.IsSupported)throw new Error('このブラウザーでWebGLを利用できません。ブラウザーの3D描画設定を確認してください。');
const engine=new B.Engine($('scene'),true),scene=new B.Scene(engine);scene.clearColor=B.Color4.FromHexString('#1b2925ff');
const orbit=new B.ArcRotateCamera('orbit',-Math.PI/2.6,Math.PI/3.2,17,new B.Vector3(-.5,.1,0),scene);orbit.attachControl($('scene'),true);orbit.lowerRadiusLimit=8;orbit.upperRadiusLimit=26;orbit.layerMask=1;
const sky=new B.HemisphericLight('sky',new B.Vector3(0,1,.2),scene);sky.intensity=1.25;sky.groundColor=new B.Color3(.48,.46,.4);
function material(name,color){const m=new B.StandardMaterial(name,scene);m.diffuseColor=B.Color3.FromHexString(color);m.specularColor=new B.Color3(.1,.1,.1);return m;}
const metal=material('metal','#80968a'),dark=material('belt','#35433d'),accent=material('robot','#d9e5b4'),amber=material('zone','#af873f');
function box(name,w,h,d,x,y,z,m,layer=1){const a=B.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);a.position.set(x,y,z);a.material=m;a.layerMask=layer;return a;}
box('floor',28,.1,20,0,-1.4,0,material('floor','#21312b'));
const inspectionBed=box('inspection-background',14,.15,2.6,0,-.23,0,dark,3);
const rollers=[];
for(let x=-6.8;x<7.2;x+=.31){const roller=B.MeshBuilder.CreateCylinder('roller',{height:2.65,diameter:.3,tessellation:20},scene);roller.material=metal;roller.position.set(x,-.13,0);roller.rotationQuaternion=B.Quaternion.RotationAxis(B.Axis.X,Math.PI/2);roller.layerMask=1;
  const stripe=box('roller-marker',.03,.012,2.5,0,.155,0,dark);stripe.parent=roller;stripe.position.set(.15,0,0);stripe.scaling.set(1,1,1);stripe.rotation.x=-Math.PI/2;rollers.push(roller);}
for(const z of [-1.48,1.48]){box('rail',14,.6,.12,0,.05,z,metal);box('inspection-zone',8,.07,.14,0,.38,z,amber);box('pickup-zone',1.7,.08,.16,2.4,.48,z,accent);for(const x of [-5,0,5])box('leg',.16,1.1,.16,x,-.8,z,metal);}
function bin(name,x,z,color){const m=material(name,color);box(name+'-bottom',1.7,.12,1.8,x,-.65,z,m);for(const dz of [-.9,.9])box(name+'-wall',1.8,.55,.09,x,-.4,z+dz,m);for(const dx of [-.85,.85])box(name+'-wall',.09,.55,1.8,x+dx,-.4,z,m);}
bin('良品',7.7,0,'#58734d');bin('不良',3,3.5,'#9c5d46');bin('未判定',3,-3.5,'#4b7384');
for(const x of [-4,4])box('camera-post',.12,3.4,.12,x,1.4,-1.9,metal);
box('camera-crossbar',8,.13,.13,0,3,-1.9,metal);box('top-camera',.52,.23,.55,0,2.9,0,accent);const camHousing=box('oblique-camera',.52,.23,.55,0,2.8,1.9,accent);camHousing.rotation.x=-.6;
box('robot-base',.8,.35,.8,3,.05,2.1,metal);
const armA=B.MeshBuilder.CreateCylinder('arm-a',{height:1,diameter:.18},scene),armB=B.MeshBuilder.CreateCylinder('arm-b',{height:1,diameter:.15},scene);armA.material=armB.material=accent;armA.layerMask=armB.layerMask=3;
const claw=box('gripper',.46,.16,.46,3,1,2,metal,3);
function segment(mesh,a,b){mesh.position=B.Vector3.Center(a,b);mesh.scaling.y=B.Vector3.Distance(a,b);mesh.rotationQuaternion=B.Quaternion.FromUnitVectorsToRef(B.Axis.Y,b.subtract(a).normalize(),new B.Quaternion());}
function robot(target){const base=new B.Vector3(3,.3,2.1),elbow=new B.Vector3(3,2.8,.3);segment(armA,base,elbow);segment(armB,elbow,target);claw.position.copyFrom(target);}
robot(new B.Vector3(3,1.2,2.1));
const views=['A','B'].map(id=>{
  const camera=new B.FreeCamera('inspection-'+id,new B.Vector3(0,9,id==='A'?0:5.5),scene);camera.upVector=new B.Vector3(0,0,1);camera.setTarget(new B.Vector3(0,.35,0));camera.mode=B.Camera.ORTHOGRAPHIC_CAMERA;camera.orthoLeft=-4;camera.orthoRight=4;camera.orthoTop=2;camera.orthoBottom=-2;camera.layerMask=2;
  const rt=new B.RenderTargetTexture('frame-'+id,{width:640,height:320},scene,false,true,B.Engine.TEXTURETYPE_UNSIGNED_BYTE);rt.refreshRate=0;rt.activeCamera=camera;rt.renderList=[inspectionBed,armA,armB,claw];rt.clearColor=new B.Color4(.08,.1,.09,1);scene.customRenderTargets.push(rt);
  return {id,camera,rt,ctx:$('inspection'+id).getContext('2d'),overlay:$('overlay'+id).getContext('2d')};
});
// Draw fruit and equipment immediately; WASM loading must never gate the first frame.
const createFruit=createFruitFactory(scene);
const previewFruits=[0,1,2].map((type,i)=>{const f=createFruit({id:-i-1,type,hidden:i===1,seed:717*(i+1)});f.root.position.set(-5.6+i*1.75,.58,0);for(const v of views)v.rt.renderList.push(...f.meshes);return f;});
scene.activeCamera=orbit;
function loadingRender(){scene.render();}
engine.runRenderLoop(loadingRender);
globalThis.mikanPreview={scene,fruits:previewFruits};
$('loadMessage').textContent='装置とミカンを表示しています。物理演算を準備中…';
for(const element of document.querySelectorAll('button,input,select'))element.disabled=true;
window.addEventListener('resize',()=>engine.resize());
let mechanics;
try{mechanics=await createMechanics(scene,rollers);}catch(error){$('status').textContent='Havok初期化失敗 · 静止表示';$('physicsInfo').textContent=error.message;globalThis.mikanShowError?.(error);throw error;}
let yoloDetector=null,activeDetector=null,switching=false;
const requestedMode=new URLSearchParams(location.search).get('detector')==='color'?'color':'yolo';$('detector').value=requestedMode;
async function ensureYolo(){if(!yoloDetector)yoloDetector=await createYoloDetector(message=>{$('detectorInfo').textContent=message;$('loadMessage').textContent='装置とミカンは静止表示中。'+message;$('loadMessage').hidden=false;});return yoloDetector;}
try{activeDetector=requestedMode==='color'?colorDetector:await ensureYolo();}catch(error){$('status').textContent='YOLO初期化失敗 · 静止表示';$('detectorInfo').textContent=error.message;globalThis.mikanShowError?.(error);throw error;}
engine.stopRenderLoop(loadingRender);
for(const f of previewFruits){for(const v of views)v.rt.renderList=v.rt.renderList.filter(m=>!f.meshes.includes(m));f.root.dispose();for(const m of f.ownedMaterials)m.dispose(false,true);}
delete globalThis.mikanPreview;
for(const element of document.querySelectorAll('button,input,select'))element.disabled=false;
$('loadMessage').hidden=true;
const rng=random(20261005),tracker=createImageTracker(),stats={total:0,good:0,reject:0,unknown:0,escaped:0,lost:0,passed:0,pickFailed:0};
let pauseStarted=0;
let fruits=[],nextId=1,paused=false,motorEnabled=true,busy=false,epoch=0,tick=0,scanClock=0,spawnClock=0,activeJob=null,uiClock=0;
const rest=new B.Vector3(3,1.2,2.1),attempts=[];
const targetMarker=B.MeshBuilder.CreateSphere('image-predicted-contact',{diameter:.16},scene);targetMarker.material=material('predicted-contact','#44e5e8');targetMarker.material.emissiveColor=new B.Color3(.15,.8,.8);targetMarker.layerMask=1;targetMarker.isPickable=false;targetMarker.setEnabled(false);
function log(message){const li=document.createElement('li');li.textContent=new Date().toLocaleTimeString('ja-JP')+' '+message;$('log').prepend(li);while($('log').children.length>8)$('log').lastChild.remove();}
function flushEvents(){for(const e of tracker.drainEvents()){if(e.message==='画像から追跡開始')stats.total++;log(e.id+' '+e.message);}}
function spawn(type=null,hidden=false,position=null){if(fruits.length>=14||(!position&&fruits.some(f=>!f.picked&&f.root.position.x< -5.2)))return null;const f=createFruit({id:nextId++,type:type??(rng()*100<+$('rate').value?(rng()<.5?1:2):0),hidden});f.root.position.copyFrom(position??new B.Vector3(-6.4,.58,0));mechanics.addFruit(f);fruits.push(f);for(const v of views)v.rt.renderList.push(...f.meshes);return f;}
function remove(f){for(const v of views)v.rt.renderList=v.rt.renderList.filter(m=>!f.meshes.includes(m));mechanics.detachFruit(f);f.root.dispose();for(const m of f.ownedMaterials)m.dispose(false,true);fruits=fruits.filter(a=>a!==f);}
function worldAt(d,view){const ray=B.Ray.CreateNew((d.x0+d.x1)/2,(d.y0+d.y1)/2,640,320,B.Matrix.Identity(),view.viewMatrix,view.projectionMatrix);const t=ray.intersectsPlane(new B.Plane(0,1,0,-.35));return t===null?null:ray.origin.add(ray.direction.scale(t));}
function drawBox(ctx,b,color,text){ctx.strokeStyle=color;ctx.lineWidth=2;ctx.strokeRect(b.x0,b.y0,b.x1-b.x0,b.y1-b.y0);ctx.fillStyle=color;ctx.font='12px sans-serif';ctx.fillText(text,b.x0,Math.max(13,b.y0-4));}
async function scan(){if(busy||paused||switching)return;busy=true;const detector=activeDetector,threshold=+$('confidence').value/100,token=epoch,frame=++tick,capturedAt=performance.now()/1000,t0=performance.now();
  const heldAtCapture=activeJob?.phase==='carry'?claw.position.clone():null;
  // Calibration matrices and capture time only: no fruit positions, IDs or orientations.
  const captures=views.map(v=>({...v,viewMatrix:v.camera.getViewMatrix().clone(),projectionMatrix:v.camera.getProjectionMatrix().clone()})),measurements=[];
  try{
    const pixels=await Promise.all(captures.map(v=>v.rt.readPixels()));
    for(let i=0;i<captures.length;i++){
      if(token!==epoch||paused)return;const view=captures[i],raw=pixels[i];if(!raw)continue;
      const image=new ImageData(640,320);for(let y=0;y<320;y++)image.data.set(raw.subarray((319-y)*2560,(320-y)*2560),y*2560);
      const detections=await detector.detect(image,threshold);if(token!==epoch||paused)return;view.ctx.putImageData(image,0,0);view.overlay.clearRect(0,0,640,320);const calibrated=[];
      const heldPixel=heldAtCapture?B.Vector3.Project(heldAtCapture.add(new B.Vector3(0,-.32,0)),B.Matrix.Identity(),view.viewMatrix.multiply(view.projectionMatrix),new B.Viewport(0,0,640,320)):null;
      for(const patch of detector.lastOrphans||[])drawBox(view.overlay,patch,'#c6a9f4',names[patch.kind]+' · 所属未確定');
      for(const d of detections){const world=worldAt(d,view);if(!world||world.x< -3.55||world.x>3.55||Math.abs(world.z)>1.35)continue;
        // Ignore fruit held at the robot's known gripper pose, not a simulator fruit ID.
        if(heldPixel&&Math.hypot((d.x0+d.x1)/2-heldPixel.x,(d.y0+d.y1)/2-heldPixel.y)<55)continue;
        const scores={};if(Number.isFinite(d.score))scores.mikan=d.score;for(const patch of d.defectBoxes||[])scores[patch.kind]=Math.max(scores[patch.kind]||0,patch.score);
        calibrated.push({x:world.x,z:world.z,defects:d.defects,scores});drawBox(view.overlay,d,d.defects.length?'#ff967e':'#c6e49d',d.defects.map(k=>names[k]).join('・')||'不良未検出');
        for(const patch of d.defectBoxes||[])drawBox(view.overlay,patch,patch.kind==='mold'?'#39d9e5':'#ffc385',names[patch.kind]+' '+Math.round(patch.score*100)+'%');
      }
      measurements.push({id:view.id,detections:calibrated});
      tracker.update(fuseViews(measurements),capturedAt,frame);for(const view of captures.filter(v=>measurements.some(m=>m.id===v.id)))for(const t of tracker.tracks.filter(t=>t.lastSeen===capturedAt&&!t.closed)){const p=B.Vector3.Project(new B.Vector3(t.x,.35,t.z),B.Matrix.Identity(),view.viewMatrix.multiply(view.projectionMatrix),new B.Viewport(0,0,640,320));view.overlay.fillStyle='#72e7ed';view.overlay.font='bold 15px sans-serif';view.overlay.fillText(t.id,p.x+10,p.y+18);}flushEvents();
    }
    $('latency').textContent=Math.round(performance.now()-t0)+' ms';
  }catch(error){paused=true;mechanics.pause(true);updateStatus();globalThis.mikanShowError?.(error);log('検査エラー：'+error.message);}finally{busy=false;}
}
function detectorInfo(){const yolo=activeDetector!==colorDetector;$('confidence').disabled=!yolo;$('detectorInfo').textContent=(yolo?'YOLOv9-T / 640 · 信頼度 '+$('confidence').value+'%':'色解析デモ')+' · 画像追跡IDと推定速度で把持';}
function updateStatus(){$('pause').textContent=paused?'再開':'一時停止';$('motor').textContent=motorEnabled?'モーター停止':'モーター再開';$('status').textContent=(activeDetector===colorDetector?'色解析':'YOLOv9')+' · '+(switching?'切替準備中':paused?'一時停止':activeJob?'画像予測でアーム動作中 · 搬送継続':'画像追跡・Havok搬送中');}
function closeTrack(t,state,reason){if(t.closed)return;tracker.close(t,state,reason);if(state==='good'||state==='escaped')stats[state]++;flushEvents();}
function plan(now){if(activeJob)return;const candidates=tracker.tracks.filter(t=>tracker.eligible(t,now)&&tracker.outcome(t)!=='good').map(t=>({t,aim:tracker.target(t,now)})).filter(c=>c.aim).sort((a,b)=>b.aim.x-a.aim.x);
  if(!candidates.length)return;const {t,aim}=candidates[0];t.state='approaching';tracker.note(t,'画像位置＋推定速度で把持へ');const attempt={trackId:t.id,captureTime:t.lastSeen,plannedAt:now,predictedContactAt:now+TRACK_RULE.approachSeconds,aim:{...aim},velocity:{x:t.vx,z:t.vz},result:'approaching'};attempts.push(attempt);activeJob={track:t,phase:'approach',t:0,start:claw.position.clone(),aim:new B.Vector3(aim.x,aim.y,aim.z),attempt};flushEvents();updateStatus();}
function failPick(j,reason){stats.pickFailed++;j.attempt.result='failed';j.attempt.reason=reason;closeTrack(j.track,'escaped',reason);j.phase='return';j.t=0;j.start=claw.position.clone();}
// Contact resolution belongs to the simulated gripper, never to tracking/planning.
// There is deliberately no lookup by track ID or correction toward a fruit's real pose.
function contactAt(aim){return fruits.filter(f=>!f.picked&&Math.abs(f.root.position.y-aim.y)<.24&&Math.hypot(f.root.position.x-aim.x,f.root.position.z-aim.z)<.3).sort((a,b)=>Math.hypot(a.root.position.x-aim.x,a.root.position.z-aim.z)-Math.hypot(b.root.position.x-aim.x,b.root.position.z-aim.z))[0]||null;}
function advanceArm(dt,now){const j=activeJob;targetMarker.setEnabled(j?.phase==='approach');if(!j){robot(rest);return;}j.t+=dt;
  if(j.phase==='approach'){
    if(now-j.track.lastSeen>TRACK_RULE.maxAge||j.track.ambiguous){failPick(j,'把持前に画像追跡が失効・不確実');return;}
    const aim=tracker.predict(j.track,now+Math.max(0,TRACK_RULE.approachSeconds-j.t));
    if(aim.x>PICK_ZONE.maxX||Math.abs(aim.z)>PICK_ZONE.maxZ){failPick(j,'予測把持点がアーム区間を通過');return;}
    j.aim.set(aim.x,.35,aim.z);targetMarker.position.copyFrom(j.aim);targetMarker.position.y=.85;j.attempt.aim={x:aim.x,y:.35,z:aim.z};const p=Math.min(j.t/TRACK_RULE.approachSeconds,1);robot(B.Vector3.Lerp(j.start,j.aim.add(new B.Vector3(0,.32,0)),p));
    if(p===1){const f=contactAt(j.aim);j.attempt.contactAt=now;if(!f){failPick(j,'予測位置に果実がなく空振り');return;}
      j.attempt.result='contact';j.attempt.contactError=Math.hypot(f.root.position.x-j.aim.x,f.root.position.z-j.aim.z);f.picked=true;mechanics.detachFruit(f);j.fruit=f;j.phase='carry';j.t=0;j.start=f.root.position.clone();j.outcome=tracker.outcome(j.track);j.track.state='sorting';j.end=new B.Vector3(3,-.1,j.outcome==='reject'?3.5:-3.5);tracker.note(j.track,'把持点で接触・箱へ搬送');flushEvents();}
  }else if(j.phase==='carry'){
    const p=Math.min(j.t/.9,1);j.fruit.root.position.copyFrom(B.Vector3.Lerp(j.start,j.end,p));j.fruit.root.position.y+=Math.sin(p*Math.PI)*1.5;robot(j.fruit.root.position.add(new B.Vector3(0,.32,0)));
    if(p===1){stats[j.outcome]++;j.attempt.result='success';closeTrack(j.track,j.outcome,j.outcome==='reject'?'不良箱へ排除':'未判定箱へ隔離');remove(j.fruit);j.phase='return';j.t=0;j.start=claw.position.clone();}
  }else{const p=Math.min(j.t/.35,1);robot(B.Vector3.Lerp(j.start,rest,p));if(p===1){activeJob=null;updateStatus();}}
}
function update(dt){if(paused||switching)return;const now=performance.now()/1000,speed=+$('speed').value;mechanics.setDrive(motorEnabled?speed:0);mechanics.setFriction(+$('friction').value);spawnClock+=motorEnabled?dt:0;scanClock+=dt;uiClock+=dt;
  if($('autoSpawn').checked&&speed>0&&spawnClock>=3){spawn();spawnClock=0;}
  for(const t of tracker.tracks){if(t.closed||t.state!=='observing')continue;const p=tracker.predict(t,now),age=now-t.lastSeen;
    if(age>TRACK_RULE.expireAge)closeTrack(t,'escaped','画像追跡を見失った');
    else if(p.x>PICK_ZONE.maxX){if(tracker.outcome(t)==='good'&&age<=TRACK_RULE.maxAge)closeTrack(t,'good','画像で不良未検出・排除区間通過');else closeTrack(t,'escaped',activeJob?'アーム動作中に追跡個体が区間通過':'判定・画像更新が間に合わず区間通過');}
  }
  plan(now);advanceArm(dt,now);tracker.prune();
  // World poses below are used only for physics lifecycle and outcome accounting.
  for(const f of [...fruits]){if(f.picked)continue;if(f.root.position.x>7.3){stats.passed++;remove(f);}else if(f.root.position.y< -1||Math.abs(f.root.position.z)>2||f.root.position.x< -7.5||f.root.position.x>8){stats.lost++;remove(f);}}
}
function renderHistory(){const now=performance.now()/1000;for(const k in stats){const el=$(k);if(el)el.textContent=stats[k];}const f=fruits.find(f=>f.body);$('physicsInfo').textContent=f?'Havok · 速度 '+f.body.getLinearVelocity().length().toFixed(2)+' u/s / 接触 '+f.contacts+'回':'Havok · 投入待ち';$('trackingInfo').textContent='画像追跡 '+tracker.tracks.filter(t=>!t.closed).length+'個体 ／ アーム目標 '+(activeJob?activeJob.track.id+' · '+activeJob.phase:'待機');
  const phases={observing:'画像追跡中',approaching:'予測把持へ移動',sorting:'箱へ移動',reject:'不良排除',unknown:'未判定隔離',good:'不良未検出通過',escaped:'追跡喪失・取り逃がし'};
  $('history').replaceChildren(...tracker.records.slice(-14).reverse().map(t=>{const tr=document.createElement('tr');const p=tracker.predict(t,now);const texts=[t.id,phases[t.state]||t.state,String(t.frames),t.x.toFixed(2)+', '+t.z.toFixed(2)+' / vx '+t.vx.toFixed(2),[...t.defects].map(k=>names[k]).join('・')||'—',t.events.slice(-3).join(' → ')];for(const [i,text] of texts.entries()){const td=document.createElement('td');td.textContent=text;if(i===1&&t.defects.size)td.className='bad';tr.append(td);}return tr;}));
}
function reset(){epoch++;for(const f of [...fruits])remove(f);tracker.reset();nextId=1;spawnClock=scanClock=0;tick=0;activeJob=null;targetMarker.setEnabled(false);attempts.length=0;for(const k in stats)stats[k]=0;for(const v of views){v.ctx.clearRect(0,0,640,320);v.overlay.clearRect(0,0,640,320);}robot(rest);renderHistory();updateStatus();log('物理ラインと画像追跡をリセット');}
$('pause').onclick=()=>{epoch++;paused=!paused;if(paused)pauseStarted=performance.now()/1000;else tracker.shiftTime(performance.now()/1000-pauseStarted);mechanics.pause(paused);updateStatus();};$('reset').onclick=reset;
$('motor').onclick=()=>{motorEnabled=!motorEnabled;updateStatus();};
function seedLine(){for(const [i,type] of [0,1,2].entries())spawn(type,i===1,new B.Vector3(-5.6+i*1.75,.58,0));}
$('detector').onchange=async()=>{if(switching)return;const old=activeDetector,wasPaused=paused;switching=true;epoch++;mechanics.pause(true);for(const el of document.querySelectorAll('button,input,select'))el.disabled=true;updateStatus();try{activeDetector=$('detector').value==='color'?colorDetector:await ensureYolo();reset();seedLine();paused=wasPaused;$('loadMessage').hidden=true;$('colorFallback').hidden=true;}catch(error){activeDetector=old;$('detector').value=old===colorDetector?'color':'yolo';paused=true;globalThis.mikanShowError?.(error);}finally{switching=false;mechanics.pause(paused);for(const el of document.querySelectorAll('button,input,select'))el.disabled=false;detectorInfo();updateStatus();}};
$('confidence').oninput=()=>{$('confidenceValue').value=$('confidence').value+'%';};$('confidence').onchange=()=>{reset();seedLine();detectorInfo();};
for(const [id,type,hidden] of [['addGood',0,false],['addMold',1,false],['addDamage',2,false],['addHidden',1,true]])$(id).onclick=()=>spawn(type,hidden);
for(const [id,unit] of [['speed',' rad/s'],['friction',''],['rate','%']])$(id).oninput=()=>{$(id+'Value').value=(id==='rate'?$(id).value:(+$(id).value).toFixed(id==='friction'?2:1))+unit;};
$('export').onclick=()=>{const data={version:'0.2-image-control',detector:activeDetector.name,confidence:activeDetector===colorDetector?null:+$('confidence').value/100,tracking:{source:'calibrated-image-detections',simulatorIds:false,simulatorPositionsForPlanning:false,rules:TRACK_RULE,pickupZone:PICK_ZONE},physics:{engine:'Havok',continuous:true},stats,attempts,records:tracker.records.map(t=>({...t,defects:[...t.defects],views:[...t.views]}))};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='mikan-image-tracking.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
let last=performance.now();engine.runRenderLoop(()=>{const now=performance.now(),dt=Math.min((now-last)/1000,.05);last=now;update(dt);const capture=scanClock>=.2&&!busy&&!paused&&!switching;if(capture)for(const v of views)v.rt.resetRefreshCounter();scene.render();if(capture){scanClock=0;scan();}if(uiClock>=.3){uiClock=0;renderHistory();}});
seedLine();detectorInfo();updateStatus();renderHistory();
globalThis.mikanDebug={scene,stats,views,mechanics,reset,spawn,tracker,attempts,get detector(){return activeDetector;},get switching(){return switching;},get fruits(){return fruits;},get records(){return tracker.records;},get busy(){return busy;},get paused(){return paused;},get activeJob(){return activeJob;}};
