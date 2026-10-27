import {colorDetector} from './vision.js?v=20261025-bluegreen-mold';
import {createFruitFactory,random} from './fruit.js?v=20261025-bluegreen-mold';
import {createMechanics,ROLLER_TRIAL} from './physics.js?v=20261027-roller-trial';
import {createYoloDetector} from './yolo-detector.js?v=20261027-vacuum';
import {createImageTracker,fuseViews,PICK_ZONE,TRACK_RULE} from './tracking.js?v=20261027-vacuum';
import {createRobotArm} from './robot-arm.js?v=20261027-vacuum';
import {ARM,ARM_REST,DROP_POINTS} from './arm-kinematics.js?v=20261027-vacuum';
import {checkFruitObservation,OBSERVATION_RULE} from './observation-check.js?v=20261027-vacuum';
import {chooseIntercept,PICK_RULE} from './pick-planning.js?v=20261027-vacuum';
import {createVacuumGripper,SUCTION_RULE} from './vacuum-physics.js?v=20261027-vacuum';
const B=globalThis.BABYLON,$=id=>document.getElementById(id),names={mold:'カビ',damage:'傷'},stateNames={observing:'観測中',good:'良品通過',reject:'不良排除',unknown:'未判定隔離',sorting:'アーム移動中',escaping:'取り逃がし・搬送中',escaped:'取り逃がし通過',missed:'搬送異常'};
if(!B?.Engine.IsSupported)throw new Error('このブラウザーでWebGLを利用できません。ブラウザーの3D描画設定を確認してください。');
const FRAME={width:640,height:480};
const engine=new B.Engine($('scene'),true),scene=new B.Scene(engine);scene.clearColor=B.Color4.FromHexString('#1b2925ff');
const orbit=new B.ArcRotateCamera('orbit',-Math.PI/2.6,Math.PI/3.2,21,new B.Vector3(.7,.1,.8),scene);orbit.attachControl($('scene'),true);orbit.lowerRadiusLimit=8;orbit.upperRadiusLimit=26;orbit.layerMask=1;
const sky=new B.HemisphericLight('sky',new B.Vector3(0,1,.2),scene);sky.intensity=1.25;sky.groundColor=new B.Color3(.48,.46,.4);
function material(name,color){const m=new B.StandardMaterial(name,scene);m.diffuseColor=B.Color3.FromHexString(color);m.specularColor=new B.Color3(.1,.1,.1);return m;}
const metal=material('metal','#80968a'),dark=material('belt','#35433d'),accent=material('robot','#d9e5b4'),amber=material('zone','#af873f');
function box(name,w,h,d,x,y,z,m,layer=1){const a=B.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);a.position.set(x,y,z);a.material=m;a.layerMask=layer;return a;}
box('floor',28,.1,20,0,-1.4,0,material('floor','#21312b'));
const inspectionBed=box('inspection-background',14,.15,2.6,0,-.23,0,dark,3);
const rollers=[];
const trialSlow=material('trial-slow','#648fbc'),trialFast=material('trial-fast','#c5ab6c');let trialIndex=0;
for(let x=-6.8;x<7.2;x+=.31){const roller=B.MeshBuilder.CreateCylinder('roller',{height:2.65,diameter:.3,tessellation:20},scene);roller.material=x>=ROLLER_TRIAL.minX&&x<=ROLLER_TRIAL.maxX?(trialIndex++%2===0?trialSlow:trialFast):metal;roller.position.set(x,-.13,0);roller.rotationQuaternion=B.Quaternion.RotationAxis(B.Axis.X,Math.PI/2);roller.layerMask=1;
  const stripe=box('roller-marker',.03,.012,2.5,0,.155,0,dark);stripe.parent=roller;stripe.position.set(.15,0,0);stripe.scaling.set(1,1,1);stripe.rotation.x=-Math.PI/2;rollers.push(roller);}
for(const z of [-1.48,1.48]){box('rail',14,.6,.12,0,.05,z,metal);box('inspection-zone',4.8,.07,.14,1.2,.38,z,amber);box('pickup-zone',1.7,.08,.16,2.4,.48,z,accent);for(const x of [-5,0,5])box('leg',.16,1.1,.16,x,-.8,z,metal);}
function bin(name,x,z,color){const m=material(name,color),walls=m.clone(name+'-transparent-wall');walls.alpha=.28;box(name+'-bottom',1.7,.12,1.8,x,-1.25,z,m);for(const dz of [-.9,.9])box(name+'-wall',1.8,1.1,.09,x,-.67,z+dz,walls);for(const dx of [-.85,.85])box(name+'-wall',.09,1.1,1.8,x+dx,-.67,z,walls);}
bin('良品',7.7,0,'#58734d');bin('不良',1.7,3.5,'#9c5d46');bin('未判定',4.1,3.5,'#4b7384');
for(const x of [-4,4])box('camera-post',.12,3.4,.12,x,1.4,-1.9,metal);
box('camera-crossbar',8,.13,.13,0,3,-1.9,metal);const topHousing=box('top-camera',.52,.23,.55,1.2,2.9,0,accent);topHousing.rotation.x=0;const camHousing=box('oblique-camera',.52,.23,.55,1.2,2.8,2.4,accent);camHousing.rotation.x=-Math.PI/4;
box('robot-base',.8,.35,.8,3,.05,2.1,metal);
const arm=createRobotArm(B,scene,material('robot-metal','#3f454b'),material('robot-shell','#8e969d')),claw=arm.claw;
function robot(target){return arm.command(target);}
const views=['A','B'].map(id=>{
  const camera=new B.FreeCamera('inspection-'+id,new B.Vector3(1.2,9,id==='A'?0:8.65),scene);camera.upVector=new B.Vector3(0,0,1);camera.setTarget(new B.Vector3(1.2,.35,0));camera.mode=B.Camera.ORTHOGRAPHIC_CAMERA;camera.orthoLeft=-2.4;camera.orthoRight=2.4;camera.orthoTop=1.8;camera.orthoBottom=-1.8;camera.layerMask=2;
  const rt=new B.RenderTargetTexture('frame-'+id,FRAME,scene,false,true,B.Engine.TEXTURETYPE_UNSIGNED_BYTE);rt.refreshRate=0;rt.activeCamera=camera;rt.renderList=[inspectionBed,...arm.meshes];rt.clearColor=new B.Color4(.08,.1,.09,1);scene.customRenderTargets.push(rt);
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
const suction=createVacuumGripper(B,scene,arm,mechanics);
let yoloDetector=null,activeDetector=null,switching=false;
const requestedMode=new URLSearchParams(location.search).get('detector')==='color'?'color':'yolo';$('detector').value=requestedMode;
async function ensureYolo(){if(!yoloDetector)yoloDetector=await createYoloDetector(message=>{$('detectorInfo').textContent=message;$('loadMessage').textContent='装置とミカンは静止表示中。'+message;$('loadMessage').hidden=false;});return yoloDetector;}
try{activeDetector=requestedMode==='color'?colorDetector:await ensureYolo();}catch(error){$('status').textContent='YOLO初期化失敗 · 静止表示';$('detectorInfo').textContent=error.message;globalThis.mikanShowError?.(error);throw error;}
engine.stopRenderLoop(loadingRender);
for(const f of previewFruits){for(const v of views)v.rt.renderList=v.rt.renderList.filter(m=>!f.meshes.includes(m));f.root.dispose();for(const m of f.ownedMaterials)m.dispose(false,true);}
delete globalThis.mikanPreview;
for(const element of document.querySelectorAll('button,input,select'))element.disabled=false;
$('loadMessage').hidden=true;
const rng=random(20261005),tracker=createImageTracker(),stats={total:0,good:0,reject:0,unknown:0,escaped:0,lost:0,passed:0,pickFailed:0,observationRejected:0,unclassified:0};
let pauseStarted=0;
let fruits=[],nextId=1,paused=false,motorEnabled=true,busy=false,epoch=0,tick=0,scanClock=0,spawnClock=0,activeJob=null,uiClock=0;
const rest=new B.Vector3(ARM_REST.x,ARM_REST.y,ARM_REST.z),attempts=[];
const targetMarker=B.MeshBuilder.CreateSphere('image-predicted-contact',{diameter:.16},scene);targetMarker.material=material('predicted-contact','#44e5e8');targetMarker.material.emissiveColor=new B.Color3(.15,.8,.8);targetMarker.layerMask=1;targetMarker.isPickable=false;targetMarker.setEnabled(false);
function log(message){const li=document.createElement('li');li.textContent=new Date().toLocaleTimeString('ja-JP')+' '+message;$('log').prepend(li);while($('log').children.length>8)$('log').lastChild.remove();}
function flushEvents(){for(const e of tracker.drainEvents()){if(e.message==='画像から追跡開始')stats.total++;log(e.id+' '+e.message);}}
function spawn(type=null,hidden=false,position=null){if(fruits.filter(f=>!f.sorted).length>=14||(!position&&fruits.some(f=>!f.picked&&f.root.position.x< -5.2)))return null;const f=createFruit({id:nextId++,type:type??(rng()*100<+$('rate').value?(rng()<.5?1:2):0),hidden});f.root.position.copyFrom(position??new B.Vector3(-6.4,.58,0));mechanics.addFruit(f);fruits.push(f);for(const v of views)v.rt.renderList.push(...f.meshes);return f;}
function remove(f){for(const v of views)v.rt.renderList=v.rt.renderList.filter(m=>!f.meshes.includes(m));mechanics.detachFruit(f);f.root.dispose();for(const m of f.ownedMaterials)m.dispose(false,true);fruits=fruits.filter(a=>a!==f);}
function worldAt(d,view){const ray=B.Ray.CreateNew((d.x0+d.x1)/2,(d.y0+d.y1)/2,FRAME.width,FRAME.height,B.Matrix.Identity(),view.viewMatrix,view.projectionMatrix);const t=ray.intersectsPlane(new B.Plane(0,1,0,-.35));return t===null?null:ray.origin.add(ray.direction.scale(t));}
function drawBox(ctx,b,color,text){ctx.strokeStyle=color;ctx.lineWidth=2;ctx.strokeRect(b.x0,b.y0,b.x1-b.x0,b.y1-b.y0);ctx.fillStyle=color;ctx.font='12px sans-serif';ctx.fillText(text,b.x0,Math.max(13,b.y0-4));}
async function scan(){if(busy||paused||switching)return;busy=true;const detector=activeDetector,threshold=+$('confidence').value/100,token=epoch,frame=++tick,capturedAt=performance.now()/1000,t0=performance.now();
  const heldAtCapture=activeJob?.fruit?claw.position.clone():null;
  // Calibration matrices and capture time only: no fruit positions, IDs or orientations.
  const captures=views.map(v=>({...v,viewMatrix:v.camera.getViewMatrix().clone(),projectionMatrix:v.camera.getProjectionMatrix().clone()})),measurements=[];
  try{
    const pixels=await Promise.all(captures.map(v=>v.rt.readPixels()));
    const jobs=captures.map(async(view,i)=>{
      const raw=pixels[i];if(!raw)return null;const image=new ImageData(FRAME.width,FRAME.height);const stride=FRAME.width*4;for(let y=0;y<FRAME.height;y++)image.data.set(raw.subarray((FRAME.height-1-y)*stride,(FRAME.height-y)*stride),y*stride);
      if(detector.detectFrame){const result=await detector.detectFrame(image,threshold,i);return {view,image,detections:result.fruits,orphans:result.orphans};}
      return {view,image,detections:await detector.detect(image,threshold),orphans:[]};
    });
    const results=await Promise.all(jobs);
    for(const result of results){
      if(token!==epoch||paused)return;if(!result)continue;const {view,image,detections,orphans}=result;view.ctx.putImageData(image,0,0);view.overlay.clearRect(0,0,FRAME.width,FRAME.height);const calibrated=[];
      const heldPixel=heldAtCapture?B.Vector3.Project(heldAtCapture.add(new B.Vector3(0,-.32,0)),B.Matrix.Identity(),view.viewMatrix.multiply(view.projectionMatrix),new B.Viewport(0,0,FRAME.width,FRAME.height)):null;
      for(const patch of orphans)drawBox(view.overlay,patch,'#c6a9f4',names[patch.kind]+' · 所属未確定');
      for(const d of detections){const support=checkFruitObservation(image,d,FRAME.width*.78/(view.camera.orthoRight-view.camera.orthoLeft));if(!support.valid||view.id==='A'&&!support.complete){stats.observationRejected++;continue;}const center=view.id==='A'&&support.center;const world=worldAt(center?{x0:center.x-.5,x1:center.x+.5,y0:center.y-.5,y1:center.y+.5}:d,view);if(!world||world.x< -3.55||world.x>3.55||Math.abs(world.z)>1.35)continue;
        // Ignore fruit held at the robot's known gripper pose, not a simulator fruit ID.
        if(heldPixel&&Math.hypot((d.x0+d.x1)/2-heldPixel.x,(d.y0+d.y1)/2-heldPixel.y)<55)continue;
        const scores={};if(Number.isFinite(d.score))scores.mikan=d.score;for(const patch of d.defectBoxes||[])scores[patch.kind]=Math.max(scores[patch.kind]||0,patch.score);
        calibrated.push({x:world.x,z:world.z,defects:d.defects,scores,peelFraction:support.peelFraction});drawBox(view.overlay,d,d.defects.length?'#ff967e':'#c6e49d',d.defects.map(k=>names[k]).join('・')||'不良未検出');
        for(const patch of d.defectBoxes||[])drawBox(view.overlay,patch,patch.kind==='mold'?'#39d9e5':'#ffc385',names[patch.kind]+' '+Math.round(patch.score*100)+'%');
      }
      measurements.push({id:view.id,detections:calibrated});
    }
    tracker.update(fuseViews(measurements),capturedAt,frame);
    for(const view of captures)for(const t of tracker.tracks.filter(t=>t.lastSeen===capturedAt&&!t.closed)){
      const p=B.Vector3.Project(new B.Vector3(t.x,.35,t.z),B.Matrix.Identity(),view.viewMatrix.multiply(view.projectionMatrix),new B.Viewport(0,0,FRAME.width,FRAME.height));view.overlay.fillStyle='#72e7ed';view.overlay.font='bold 15px sans-serif';view.overlay.fillText(t.id,p.x+10,p.y+18);
    }
    for(const auxiliary of measurements.filter(v=>v.id!=='A'))tracker.confirmAuxiliary(auxiliary.detections,capturedAt,frame,auxiliary.id);flushEvents();
    $('latency').textContent=Math.round(performance.now()-t0)+' ms';
  }catch(error){paused=true;mechanics.pause(true);updateStatus();globalThis.mikanShowError?.(error);log('検査エラー：'+error.message);}finally{busy=false;}
}
function detectorInfo(){const yolo=activeDetector!==colorDetector;$('confidence').disabled=!yolo;$('detectorInfo').textContent=(yolo?'YOLOv9-T / 640 · 信頼度 '+$('confidence').value+'%':'色解析デモ')+' · 果実確認65%＋形・果皮色の確認 · 確定した不良を優先';}
function updateStatus(){$('pause').textContent=paused?'再開':'一時停止';$('motor').textContent=motorEnabled?'モーター停止':'モーター再開';$('status').textContent=(activeDetector===colorDetector?'色解析':'YOLOv9')+' · '+(switching?'切替準備中':paused?'一時停止':activeJob?'画像予測でアーム動作中 · 搬送継続':'画像追跡・Havok搬送中');}
function closeTrack(t,state,reason){if(t.closed)return;tracker.close(t,state,reason);if(state==='good'||state==='escaped'||state==='unclassified')stats[state]++;flushEvents();}
function plan(now){if(activeJob)return;const candidates=tracker.tracks.filter(t=>tracker.eligible(t,now)&&now-t.lastSeen<=TRACK_RULE.startAge&&(t.defects.size||$('collectUnknown').checked&&tracker.outcome(t)==='unknown')).map(t=>{
    const p=tracker.predict(t,now),hover=new B.Vector3(PICK_RULE.stationX,PICK_RULE.hoverY,Math.max(-1.2,Math.min(1.2,p.z))),travel=arm.estimate(hover);
    const arrival=t.vx>.08?(PICK_RULE.stationX-p.x)/t.vx:p.x<PICK_RULE.stationX?1:0;
    const future=tracker.predict(t,now+travel+.5);
    if(!Number.isFinite(travel)||p.x< -1.2||p.x>2.8||arrival>3.5||t.stable&&future.x>PICK_ZONE.maxX){t.armBlocked='新しい画像と把持可能な到着時刻を待機';return null;}
    t.armBlocked=null;return {t,p,hover,travel};
  }).filter(Boolean).sort((a,b)=>(Number(b.t.defects.size>0)-Number(a.t.defects.size>0))||b.p.x-a.p.x);
  if(!candidates.length)return;const {t,p,hover,travel}=candidates[0];t.state='approaching';tracker.note(t,'画像で確認した対象に備えて上方待機');const attempt={trackId:t.id,captureTime:t.lastSeen,plannedAt:now,predictedContactAt:null,aim:{x:p.x,y:.35,z:p.z},preposition:{x:hover.x,y:hover.y,z:hover.z},velocity:{x:t.vx,z:t.vz},result:'approaching'};attempts.push(attempt);activeJob={track:t,phase:'hover',t:0,approachTime:0,aim:new B.Vector3(p.x,.35,p.z),hover,attempt,rechecks:0,waitingVision:true};arm.grip(false);flushEvents();updateStatus();}
function waitForImage(j,reason){
  j.phase='hover';j.t=0;j.intercept=null;j.contactGoal=null;j.touchGoal=null;j.waitingVision=true;arm.grip(false);j.rechecks++;
  tracker.note(j.track,reason);flushEvents();if(j.rechecks>2)failPick(j,'新しい画像で把持位置を確定できず中止');
}

function failPick(j,reason){stats.pickFailed++;j.attempt.result='failed';j.attempt.reason=reason;if(j.fruit){const f=j.fruit;j.attempt.vacuumAtFailure=suction.support(f.body);f.picked=false;j.fruit=null;}closeTrack(j.track,'escaped',reason);j.phase='return';j.t=0;arm.grip(false);}
// Acquisition requires cup contact, simulated vacuum pressure and a physical lift.
const preContact=new Set(['hover','descend','seal']);
function commandArm(j,target){const result=robot(target);if(!result.reachable){failPick(j,'関節制約により到達できない');return false;}return true;}
function advanceArm(dt,now){const j=activeJob;targetMarker.setEnabled(!!j&&preContact.has(j.phase));if(!j){robot(rest);arm.grip(false);return;}j.t+=dt;
  if(j.fruit&&['lift','transfer','lower'].includes(j.phase)&&suction.support(j.fruit.body).lastSupportAge>SUCTION_RULE.slipSeconds){failPick(j,'搬送中に吸着が外れて落下');return;}
  if(preContact.has(j.phase)){
    j.approachTime+=dt;const age=now-j.track.lastSeen,current=tracker.predict(j.track,now);
    if(age>(j.phase==='hover'?TRACK_RULE.maxAge:SUCTION_RULE.maxOcclusionAge)||j.track.ambiguous){failPick(j,'把持前に画像追跡が失効・不確実');return;}
    if(j.approachTime>10||current.x>PICK_ZONE.maxX+.1){failPick(j,'対象が把持のタイミングを通過');return;}
    if(j.phase==='hover'){
      j.waitingVision=true;if(!commandArm(j,j.hover))return;
      targetMarker.position.set(PICK_RULE.stationX,.85,j.hover.z);
      if(arm.near(j.hover,.08)){
        const intercept=chooseIntercept(tracker,j.track,now,p=>arm.estimate(p),(reason,details)=>{j.waitReason=reason;j.attempt.lastCheck={reason,...details,time:now};});
        if(intercept&&arm.canReach(intercept.tcp)){
          j.intercept=intercept;j.aim.set(intercept.aim.x,.35,intercept.aim.z);j.contactGoal=new B.Vector3(intercept.tcp.x,intercept.tcp.y,intercept.tcp.z);j.attempt.aim={...intercept.aim};j.attempt.predictedContactAt=intercept.contactAt;j.attempt.captureTime=j.track.lastSeen;j.attempt.uncertainty=tracker.uncertainty(j.track,now,intercept.lead);j.phase='descend';j.t=0;j.waitingVision=false;tracker.note(j.track,'新しい画像で把持点・時刻を確定');flushEvents();
        }
      }
    }else{
      // Stop the TCP on cup contact; never recenter from a fruit mesh pose.
      const touch=suction.readout();if(j.phase==='seal'&&!j.touchGoal&&(touch.contact||touch.sealed))j.touchGoal=claw.position.clone();
      const lead=PICK_RULE.followLeadSeconds,p=tracker.predict(j.track,now+lead);
      if(!j.touchGoal&&(age>SUCTION_RULE.maxOcclusionAge||tracker.uncertainty(j.track,now,lead)>TRACK_RULE.maxUncertainty)){waitForImage(j,'新しい画像で把持位置を再確認');return;}
      // Follow fresh image estimates during descent; do not wait for a moving target to settle.
      if(j.touchGoal)j.contactGoal.copyFrom(j.touchGoal);else j.contactGoal.set(p.x,PICK_RULE.tcpHeight-(j.phase==='seal'?Math.min(SUCTION_RULE.probeDepth,j.t*SUCTION_RULE.probeRate):0),p.z);j.aim.set(j.contactGoal.x,.35,j.contactGoal.z);j.attempt.aim={x:j.aim.x,y:.35,z:j.aim.z};
      if(!commandArm(j,j.contactGoal))return;targetMarker.position.set(j.aim.x,.85,j.aim.z);
      if(j.phase==='descend'){
        const current=tracker.predict(j.track,now),gap=Math.hypot(claw.position.x-current.x,claw.position.z-current.z);
        if(current.x>=PICK_ZONE.minX&&current.x<=PICK_ZONE.maxX&&(gap<.16||touch.contact||touch.sealed)&&Math.abs(claw.position.y-PICK_RULE.tcpHeight)<.12&&age<=SUCTION_RULE.maxOcclusionAge-PICK_RULE.settleSeconds){j.phase='seal';j.t=0;if((touch.contact||touch.sealed))j.touchGoal=claw.position.clone();arm.grip(true);tracker.note(j.track,'画像予測位置に工具が到達・追従しながら把持');flushEvents();}
      }else if(j.t>=PICK_RULE.settleSeconds&&Math.abs(claw.position.y-PICK_RULE.tcpHeight)<.20){
        const contact=suction.candidate();
        if(!contact){if(j.t>SUCTION_RULE.sealTimeout)failPick(j,'密着または負圧を確認できず吸着失敗');return;}
        const f=contact.fruit;j.fruit=f;f.picked=true;j.verifyStartY=f.root.position.y;j.verifyStarted=now;
        j.attempt.result='checking-grip';j.attempt.contactAt=now;j.attempt.pressureAtSealKPa=contact.pressureKPa;j.attempt.sealQuality=contact.quality;j.attempt.forceCapacityAtSeal=contact.forceCapacity;j.attempt.fruitRemainsDynamic=f.body.getMotionType()===B.PhysicsMotionType.DYNAMIC;
        j.outcome=tracker.outcome(j.track);j.track.state='grip-check';j.drop=new B.Vector3(DROP_POINTS[j.outcome].x,DROP_POINTS[j.outcome].y,DROP_POINTS[j.outcome].z);j.lift=claw.position.add(new B.Vector3(0,.30,0));j.phase='verifyLift';j.t=0;tracker.note(j.track,'接触と負圧を確認・試し持ち上げへ');flushEvents();

      }
    }
  }else if(j.phase==='verifyLift'){
    if(!commandArm(j,j.lift))return;
    const support=suction.support(j.fruit.body),rise=j.fruit.root.position.y-j.verifyStartY;
    if(support.lastSupportAge>SUCTION_RULE.slipSeconds){failPick(j,'持ち上げ確認中に吸着が外れた');return;}
    if(rise>=SUCTION_RULE.verifyRise&&support.sealed&&support.pressureKPa>=SUCTION_RULE.readyKPa){j.attempt.result='holding';j.attempt.verifiedAt=now;j.attempt.verifiedRise=rise;j.attempt.verifiedPressureKPa=support.pressureKPa;j.track.state='sorting';j.lift.y=1.6;j.phase='lift';j.t=0;tracker.note(j.track,'Havokで実際の持ち上がりを確認・搬送へ');flushEvents();}
    else if(now-j.verifyStarted>SUCTION_RULE.verifySeconds)failPick(j,'パッドは接触したが持ち上がらず吸着失敗');
  }else if(j.phase==='lift'){
    if(commandArm(j,j.lift)&&arm.near(j.lift,.09)){j.phase='transfer';j.t=0;}
  }else if(j.phase==='transfer'){
    const hover=new B.Vector3(j.drop.x,1.5,j.drop.z);if(commandArm(j,hover)&&arm.near(hover,.09)){j.phase='lower';j.t=0;}
  }else if(j.phase==='lower'){
    if(commandArm(j,j.drop)&&arm.near(j.drop,.075)){j.phase='vent';j.t=0;arm.grip(false);}
  }else if(j.phase==='vent'){
    if(!commandArm(j,j.drop))return;
    if(j.t>=.3&&suction.opened()){
      const f=j.fruit;f.picked=false;f.sorted=true;f.bin=j.outcome;f.releaseAt=now;j.fruit=null;stats[j.outcome]++;j.attempt.result='success';closeTrack(j.track,j.outcome,j.outcome==='reject'?'不良箱へ開放':'未判定箱へ開放');j.phase='retract';j.t=0;
    }
  }else if(j.phase==='retract'){
    const safe=new B.Vector3(j.drop.x,1.6,j.drop.z);if(commandArm(j,safe)&&arm.near(safe,.1)){j.phase='return';j.t=0;}
  }else{robot(rest);if(arm.near(rest,.08)){activeJob=null;updateStatus();}}
}

function update(dt){if(paused||switching)return;suction.configure({targetKPa:+$('vacuumPressure').value,leak:+$('vacuumLeak').value/100});const now=performance.now()/1000,speed=+$('speed').value;mechanics.setDrive(motorEnabled?speed:0,+$('rollerDifference').value/100);mechanics.setFriction(+$('friction').value);spawnClock+=motorEnabled?dt:0;scanClock+=dt;uiClock+=dt;
  if($('autoSpawn').checked&&speed>0&&spawnClock>=+$('feedInterval').value){spawn();spawnClock=0;}
  for(const t of tracker.tracks){if(t.closed||t.state!=='observing')continue;const p=tracker.predict(t,now),age=now-t.lastSeen;
    if(age>TRACK_RULE.expireAge)closeTrack(t,t.defects.size||$('collectUnknown').checked?'escaped':'unclassified',t.defects.size?'不良の画像追跡を見失った':'不良未確定のまま追跡終了');
    else if(p.x>PICK_ZONE.maxX){if(tracker.outcome(t)==='good'&&age<=TRACK_RULE.maxAge)closeTrack(t,'good','画像で不良未検出・排除区間通過');else if(!t.defects.size&&!$('collectUnknown').checked)closeTrack(t,'unclassified','不良未確定・未回収で通過');else closeTrack(t,'escaped',t.armBlocked||(activeJob?'アーム動作中に追跡個体が区間通過':'判定・画像更新が間に合わず区間通過'));}
  }
  plan(now);advanceArm(dt,now);arm.step(dt*(activeJob?.fruit?SUCTION_RULE.carryMotionScale:1));suction.update(dt);tracker.prune();
  // World poses below are used only for physics lifecycle and outcome accounting.
  for(const f of [...fruits]){if(f.picked)continue;if(f.sorted)continue;if(f.root.position.x>7.3){stats.passed++;f.sorted=true;f.bin='good';f.releaseAt=now;}else if(f.root.position.y< -1||Math.abs(f.root.position.z)>2||f.root.position.x< -7.5||f.root.position.x>8){stats.lost++;remove(f);}}
}
function renderHistory(){const now=performance.now()/1000;for(const k in stats){const el=$(k);if(el)el.textContent=stats[k];}const f=fruits.find(f=>f.body&&!f.sorted);$('physicsInfo').textContent=f?'Havok · 速度 '+f.body.getLinearVelocity().length().toFixed(2)+' u/s / 接触 '+f.contacts+'回':'Havok · 投入待ち';$('binCount').textContent=fruits.filter(f=>f.sorted).length;$('trackingInfo').textContent='画像追跡 '+tracker.tracks.filter(t=>!t.closed).length+'個体 ／ アーム目標 '+(activeJob?activeJob.track.id+' · '+({hover:activeJob.waitingVision?(activeJob.waitReason||'把持位置で画像確認待ち'):'上方から接近',descend:'下降',seal:'負圧を確認',verifyLift:'持ち上げて把持確認',lift:'持ち上げ',transfer:'箱へ旋回',lower:'箱へ下降',vent:'真空解除',retract:'退避',return:'待機位置へ復帰'}[activeJob.phase]||activeJob.phase):'待機');
  const vacuum=suction.readout(activeJob?.fruit?.body);$('gripInfo').textContent='吸着：負圧 −'+vacuum.pressureKPa.toFixed(1)+' kPa ／ 保持力上限 '+vacuum.forceCapacity.toFixed(1)+' N（モデル値）／ '+(vacuum.sealed?'密着中':vacuum.contact?'接触あり':'接触待ち');
  const phases={observing:'画像追跡中',approaching:'予測把持へ移動','grip-check':'吸着の持ち上げ確認',sorting:'箱へ移動',reject:'不良排除',unknown:'未判定隔離',good:'不良未検出通過',unclassified:'未判定通過',escaped:'追跡喪失・取り逃がし'};
  $('history').replaceChildren(...tracker.records.slice(-14).reverse().map(t=>{const tr=document.createElement('tr');const p=tracker.predict(t,now);const label=t.state==='observing'&&t.defects.size?(t.missedFrames?'不良確定・再検出待ち':!t.stable?'不良確定・位置推定中':'不良確定・把持待ち'):phases[t.state]||t.state;const texts=[t.id,label,String(t.frames),t.x.toFixed(2)+', '+t.z.toFixed(2)+' / vx '+t.vx.toFixed(2),[...t.defects].map(k=>names[k]).join('・')||'—',t.events.slice(-3).join(' → ')];for(const [i,text] of texts.entries()){const td=document.createElement('td');td.textContent=text;if(i===1&&t.defects.size)td.className='bad';tr.append(td);}return tr;}));
}
function reset(keepBins=false){epoch++;for(const f of [...fruits])if(!keepBins||!f.sorted)remove(f);tracker.reset();nextId=1+fruits.reduce((max,f)=>Math.max(max,f.id),0);spawnClock=scanClock=0;tick=0;activeJob=null;targetMarker.setEnabled(false);attempts.length=0;for(const k in stats)stats[k]=0;for(const v of views){v.ctx.clearRect(0,0,FRAME.width,FRAME.height);v.overlay.clearRect(0,0,FRAME.width,FRAME.height);}arm.reset();suction.reset();renderHistory();updateStatus();log('物理ラインと画像追跡をリセット');}
$('pause').onclick=()=>{epoch++;paused=!paused;if(paused)pauseStarted=performance.now()/1000;else{const delta=performance.now()/1000-pauseStarted;tracker.shiftTime(delta);if(activeJob?.intercept)activeJob.intercept.contactAt+=delta;if(activeJob?.verifyStarted)activeJob.verifyStarted+=delta;}mechanics.pause(paused);updateStatus();};$('reset').onclick=()=>reset(false);$('clearBins').onclick=()=>{for(const f of [...fruits])if(f.sorted)remove(f);renderHistory();log('箱の回収済みミカンを取り除きました');};
$('motor').onclick=()=>{motorEnabled=!motorEnabled;updateStatus();};
function seedLine(){for(const [i,type] of [0,1,2].entries()){const f=spawn(type,type>0,new B.Vector3(-5.6+i*1.75,.58,0));if(type&&f)f.visual.rotationQuaternion=B.Quaternion.RotationAxis(B.Axis.X,Math.PI);}}
$('detector').onchange=async()=>{if(switching)return;const old=activeDetector,wasPaused=paused;switching=true;epoch++;mechanics.pause(true);for(const el of document.querySelectorAll('button,input,select'))el.disabled=true;updateStatus();try{activeDetector=$('detector').value==='color'?colorDetector:await ensureYolo();reset(true);seedLine();paused=wasPaused;$('loadMessage').hidden=true;$('colorFallback').hidden=true;}catch(error){activeDetector=old;$('detector').value=old===colorDetector?'color':'yolo';paused=true;globalThis.mikanShowError?.(error);}finally{switching=false;mechanics.pause(paused);for(const el of document.querySelectorAll('button,input,select'))el.disabled=false;detectorInfo();updateStatus();}};
$('confidence').oninput=()=>{$('confidenceValue').value=$('confidence').value+'%';};$('confidence').onchange=()=>{reset(true);seedLine();detectorInfo();};
for(const [id,type,hidden] of [['addGood',0,false],['addMold',1,false],['addDamage',2,false],['addHidden',1,true]])$(id).onclick=()=>spawn(type,hidden);
for(const [id,unit] of [['rollerDifference','%'],['vacuumPressure',' kPa'],['vacuumLeak','%'],['speed',' rad/s'],['friction',''],['rate','%'],['feedInterval',' 秒']])$(id).oninput=()=>{$(id+'Value').value=((id==='rate'||id==='vacuumLeak'||id==='rollerDifference')?$(id).value:(+$(id).value).toFixed(id==='friction'?2:1))+unit;};
$('export').onclick=()=>{const data={version:'0.2-vacuum',detector:activeDetector.name,confidence:activeDetector===colorDetector?null:+$('confidence').value/100,inventory:{retained:fruits.filter(f=>f.sorted).length,bins:{good:fruits.filter(f=>f.bin==='good').length,reject:fruits.filter(f=>f.bin==='reject').length,unknown:fruits.filter(f=>f.bin==='unknown').length}},picking:{rules:PICK_RULE,observationRules:OBSERVATION_RULE,collectUnknown:$('collectUnknown').checked,feedInterval:+$('feedInterval').value,rollerAngularSpeed:+$('speed').value,rollerTrial:{...ROLLER_TRIAL,difference:+$('rollerDifference').value/100}},tracking:{positionCamera:'A',auxiliaryDefectCameras:['B'],source:'calibrated-image-detections',simulatorIds:false,simulatorPositionsForPlanning:false,rules:TRACK_RULE,pickupZone:PICK_ZONE},robot:{kinematics:'fixed-link-IK',linkLengths:ARM.lengths,jointLimitsRadians:ARM.limits,maxSpeedsRadiansPerSecond:ARM.speed,maxAccelerationsRadiansPerSecondSquared:ARM.acceleration,joints:arm.servo.joints,predictionLead:'joint-travel-then-image-velocity-follow',dropPoints:DROP_POINTS},physics:{engine:'Havok',continuous:true,grasp:'vacuum-force-and-lift',fruitDynamicDuringCarry:true,vacuumRules:SUCTION_RULE,vacuumSettings:suction.readout()},stats,attempts,records:tracker.records.map(t=>({...t,defects:[...t.defects],views:[...t.views]}))};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='mikan-image-tracking.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
let last=performance.now();engine.runRenderLoop(()=>{const now=performance.now(),dt=Math.min((now-last)/1000,.25);last=now;update(dt);const capture=scanClock>=.2&&!busy&&!paused&&!switching;if(capture)for(const v of views)v.rt.resetRefreshCounter();scene.render();if(capture){scanClock=0;scan();}if(uiClock>=.3){uiClock=0;renderHistory();}});
seedLine();detectorInfo();updateStatus();renderHistory();
globalThis.mikanDebug={scene,stats,views,mechanics,suction,reset,spawn,tracker,attempts,arm,get detector(){return activeDetector;},get switching(){return switching;},get fruits(){return fruits;},get records(){return tracker.records;},get busy(){return busy;},get paused(){return paused;},get activeJob(){return activeJob;}};
