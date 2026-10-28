import {stepContactSearch,CONTACT_SEARCH} from './contact-search.js?v=20261029-transfer';
import {colorDetector} from './vision.js?v=20261025-bluegreen-mold';
import {createFruitFactory,random} from './fruit.js?v=20261025-bluegreen-mold';
import {createMechanics,ROLLER_TRIAL} from './physics.js?v=20261029-transfer';
import {rollerLayout,supportCalibration,compatiblePitch} from './roller-layout.js?v=20261029-transfer';
import {createSlopeGeometry} from './slope.js?v=20261028-slope';
import {createYoloDetector} from './yolo-detector.js?v=20261028-controls';
import {createImageTracker,fuseViews,PICK_ZONE,TRACK_RULE} from './tracking.js?v=20261029-observed';
import {createRobotArm} from './robot-arm.js?v=20261029-articulated';
import {ARM_REST,DROP_POINTS} from './arm-kinematics.js?v=20261029-articulated';
import {checkFruitObservation,OBSERVATION_RULE} from './observation-check.js?v=20261027-vacuum';
import {chooseIntercept,PICK_RULE,hoverReady,observedInPickZone} from './pick-planning.js?v=20261029-observed';
import {createVacuumGripper,SUCTION_RULE} from './vacuum-physics.js?v=20261029-center';
const B=globalThis.BABYLON,$=id=>document.getElementById(id),names={mold:'カビ',damage:'傷'},stateNames={observing:'観測中',good:'良品通過',reject:'不良排除',unknown:'未判定隔離',sorting:'アーム移動中',escaping:'取り逃がし・搬送中',escaped:'取り逃がし通過',missed:'搬送異常'};
if(!B?.Engine.IsSupported)throw new Error('このブラウザーでWebGLを利用できません。ブラウザーの3D描画設定を確認してください。');
const FRAME={width:640,height:480};
let line=createSlopeGeometry(0),support=supportCalibration(.31);
const linePoint=p=>{const q=line.point(p);return new B.Vector3(q.x,q.y,q.z);};
const fruitHeight=x=>line.heightAt(x,support.heightAt(line.pivotX+(x-line.pivotX)/line.cos)),tcpHeight=x=>fruitHeight(x)+PICK_RULE.tcpHeight-.35;
const engine=new B.Engine($('scene'),true),scene=new B.Scene(engine);scene.clearColor=B.Color4.FromHexString('#1b2925ff');
const orbit=new B.ArcRotateCamera('orbit',-Math.PI/2.6,Math.PI/3.2,21,new B.Vector3(.7,.1,.8),scene);orbit.attachControl($('scene'),true);orbit.lowerRadiusLimit=8;orbit.upperRadiusLimit=26;orbit.layerMask=1;
const sky=new B.HemisphericLight('sky',new B.Vector3(0,1,.2),scene);sky.intensity=1.25;sky.groundColor=new B.Color3(.48,.46,.4);
function material(name,color){const m=new B.StandardMaterial(name,scene);m.diffuseColor=B.Color3.FromHexString(color);m.specularColor=new B.Color3(.1,.1,.1);return m;}
const metal=material('metal','#80968a'),dark=material('belt','#35433d'),accent=material('robot','#d9e5b4'),amber=material('zone','#af873f');
function box(name,w,h,d,x,y,z,m,layer=1){const a=B.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);a.position.set(x,y,z);a.material=m;a.layerMask=layer;return a;}
box('floor',28,.1,20,0,-1.4,0,material('floor','#21312b'));
box('inspection-background',14,.15,2.6,0,-.23,0,dark,3);
const rollers=[];
const trialSlow=material('trial-slow','#648fbc'),trialFast=material('trial-fast','#c5ab6c');
function fastPitchValue(){return $('fastRollerPitch').value==='auto'?null:+$('fastRollerPitch').value;}
function buildRollers(pitch,diameter=.30,removed=false,fastPitch=null){
  for(const {x,role,transfer=false} of rollerLayout(pitch,removed,fastPitch)){
    const roller=B.MeshBuilder.CreateCylinder('roller',{height:2.65,diameter,tessellation:20},scene);
    roller.driveRole=role;roller.transfer=transfer;
    roller.material=roller.driveRole==='slow'?trialSlow:roller.driveRole==='fast'?trialFast:metal;roller.position.set(x,-.13,0);roller.rotationQuaternion=B.Quaternion.RotationAxis(B.Axis.X,Math.PI/2);roller.layerMask=1;
    const stripe=box('roller-marker',.03,.012,2.5,0,.155,0,dark);stripe.parent=roller;stripe.position.set(diameter/2,0,0);stripe.rotation.x=-Math.PI/2;rollers.push(roller);
  }
}
buildRollers(.31);
for(const z of [-1.48,1.48]){box('rail',14,.6,.12,0,.05,z,metal);box('inspection-zone',4.8,.07,.14,2.0,.38,z,amber);box('pickup-zone',PICK_ZONE.maxX-PICK_ZONE.minX,.08,.16,(PICK_ZONE.minX+PICK_ZONE.maxX)/2,.48,z,accent);for(const x of [-5,0,5])box('leg',.16,1.1,.16,x,-.8,z,metal);}
function bin(name,x,z,color){const m=material(name,color),walls=m.clone(name+'-transparent-wall');walls.alpha=.28;box(name+'-bottom',1.7,.12,1.8,x,-1.25,z,m);for(const dz of [-.9,.9])box(name+'-wall',1.8,1.1,.09,x,-.67,z+dz,walls);for(const dx of [-.85,.85])box(name+'-wall',.09,1.1,1.8,x+dx,-.67,z,walls);}
bin('良品',7.7,0,'#58734d');bin('不良',1.7,3.5,'#9c5d46');bin('未判定',4.1,3.5,'#4b7384');
for(const x of [-4,4])box('camera-post',.12,3.4,.12,x,1.4,-1.9,metal);
box('camera-crossbar',8,.13,.13,0,3,-1.9,metal);const topHousing=box('top-camera',.52,.23,.55,2.0,2.9,0,accent);topHousing.rotation.x=0;const camHousing=box('oblique-camera',.52,.23,.55,2.0,2.8,2.4,accent);camHousing.rotation.x=-Math.PI/4;
box('robot-base',.8,.35,.8,3,.05,2.1,metal);
const arm=createRobotArm(B,scene,material('robot-metal','#3f454b'),material('robot-shell','#8e969d')),claw=arm.claw;
function robot(target){return arm.command(target);}
// Share the visible equipment with inspection views. Fruit is added/removed below.
// Each camera's schematic housing sits in its own optical path, so omit only itself.
const inspectionEquipment=[...scene.meshes];
let lineLayout=scene.meshes.filter(m=>['roller','rail','inspection-background','inspection-zone','pickup-zone'].includes(m.name)).map(mesh=>({mesh,position:mesh.position.clone(),rotation:mesh.rotationQuaternion?.clone()||B.Quaternion.Identity()}));
const legs=scene.meshes.filter(m=>m.name==='leg').map(mesh=>({mesh,position:mesh.position.clone()}));
const goodBinLayout=scene.meshes.filter(m=>m.name.startsWith('良品-')).map(mesh=>({mesh,position:mesh.position.clone()}));
const views=['A','B'].map(id=>{
  const camera=new B.FreeCamera('inspection-'+id,id==='A'?new B.Vector3(2.0,9,0):camHousing.position.clone(),scene);camera.upVector=new B.Vector3(0,0,1);camera.setTarget(new B.Vector3(2.0,.35,0));camera.layerMask=3;
  if(id==='A'){
    camera.mode=B.Camera.ORTHOGRAPHIC_CAMERA;camera.orthoLeft=-2.4;camera.orthoRight=2.4;camera.orthoTop=1.8;camera.orthoBottom=-1.8;
  }else{
    camera.mode=B.Camera.PERSPECTIVE_CAMERA;camera.fov=65*Math.PI/180;camera.minZ=.05;camera.maxZ=100;
    // Keep image calibration at the 640x480 sensor aspect, independent of the UI canvas.
    camera.freezeProjectionMatrix(B.Matrix.PerspectiveFovLH(camera.fov,FRAME.width/FRAME.height,camera.minZ,camera.maxZ));
  }
  const rt=new B.RenderTargetTexture('frame-'+id,FRAME,scene,false,true,B.Engine.TEXTURETYPE_UNSIGNED_BYTE);rt.refreshRate=0;rt.activeCamera=camera;rt.renderList=inspectionEquipment.filter(mesh=>mesh!==(id==='A'?topHousing:camHousing));rt.clearColor=new B.Color4(.08,.1,.09,1);scene.customRenderTargets.push(rt);
  return {id,camera,rt,ctx:$('inspection'+id).getContext('2d'),overlay:$('overlay'+id).getContext('2d')};
});
function applySlopeLayout(degrees){
  line=createSlopeGeometry(degrees);const rotation=B.Quaternion.RotationAxis(B.Axis.Z,-line.angle);
  for(const item of lineLayout){item.mesh.position.copyFrom(linePoint(item.position));item.mesh.rotationQuaternion=rotation.multiply(item.rotation);}
  const binAnchor=linePoint({x:7.7,y:0,z:0}),binShift=binAnchor.subtract(new B.Vector3(7.7,0,0));
  for(const item of goodBinLayout)item.mesh.position.copyFrom(item.position.add(binShift));
  const floor=scene.getMeshByName('floor');floor.position.y=-1.4+binShift.y;
  for(const item of legs){const top=linePoint({x:item.position.x,y:-.25,z:item.position.z}),bottom=floor.position.y+.05;item.mesh.position.set(top.x,(top.y+bottom)/2,top.z);item.mesh.scaling.y=(top.y-bottom)/1.1;}
  for(const view of views)view.camera.setTarget(new B.Vector3(2.0,fruitHeight(2.0),0));
  mechanics.syncLayout();updatePickupArea();
}
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
async function ensureYolo(){if(!yoloDetector||yoloDetector.config.inputSize!==+$('yoloSize').value){const previous=yoloDetector;yoloDetector=await createYoloDetector(message=>{$('detectorInfo').textContent=message;$('loadMessage').textContent='装置とミカンは静止表示中。'+message;$('loadMessage').hidden=false;},+$('yoloSize').value);previous?.dispose();}return yoloDetector;}
try{activeDetector=requestedMode==='color'?colorDetector:await ensureYolo();}catch(error){$('status').textContent='YOLO初期化失敗 · 静止表示';$('detectorInfo').textContent=error.message;globalThis.mikanShowError?.(error);throw error;}
engine.stopRenderLoop(loadingRender);
for(const f of previewFruits){for(const v of views)v.rt.renderList=v.rt.renderList.filter(m=>!f.meshes.includes(m));f.root.dispose();for(const m of f.ownedMaterials)m.dispose(false,true);}
delete globalThis.mikanPreview;
for(const element of document.querySelectorAll('button,input,select'))element.disabled=false;
$('loadMessage').hidden=true;
const rng=random(20261005),tracker=createImageTracker(),stats={total:0,good:0,reject:0,unknown:0,escaped:0,lost:0,passed:0,pickFailed:0,observationRejected:0,unclassified:0};
const observationIssues={};
const issueNames={'weak-fruit-box':'\u4f4e\u4fe1\u983c\u5ea6','implausible-size-or-shape':'\u30b5\u30a4\u30ba\u30fb\u5f62\u72b6','no-visible-peel':'\u679c\u76ae\u4e0d\u8db3','incomplete-contour':'\u8f2a\u90ed\u4e0d\u8db3','invalid-calibration':'\u4f4d\u7f6e\u63db\u7b97','outside-inspection-range':'\u691c\u67fb\u7bc4\u56f2\u5916'};
function rejectObservation(reason,view){stats.observationRejected++;const key=view+':'+reason;observationIssues[key]=(observationIssues[key]||0)+1;}
let pauseStarted=0;
let fruits=[],nextId=1,paused=false,motorEnabled=true,busy=false,epoch=0,tick=0,scanClock=0,spawnClock=0,activeJob=null,uiClock=0;
const rest=new B.Vector3(ARM_REST.x,ARM_REST.y,ARM_REST.z),attempts=[];
const observationMarker=B.MeshBuilder.CreateSphere('image-last-observation',{diameter:.13},scene);observationMarker.material=material('last-observation','#ff7bd3');observationMarker.layerMask=1;observationMarker.isPickable=false;observationMarker.setEnabled(false);
const targetMarker=B.MeshBuilder.CreateSphere('image-predicted-contact',{diameter:.16},scene);targetMarker.material=material('predicted-contact','#44e5e8');targetMarker.material.emissiveColor=new B.Color3(.15,.8,.8);targetMarker.layerMask=1;targetMarker.isPickable=false;targetMarker.setEnabled(false);
// Display-only, keyed by image track IDs. Never attach to or look up fruit meshes.
// These meshes are created after inspection render lists and never added to them.
const defectMarkers=new Map(),defectMarkerMaterial=material('yolo-defect-debug','#ff2538');
defectMarkerMaterial.emissiveColor=B.Color3.FromHexString('#ff2538');defectMarkerMaterial.disableLighting=true;
function clearDefectMarkers(){for(const marker of defectMarkers.values())marker.dispose();defectMarkers.clear();}
function updateDefectMarkers(now){
  if(!activeDetector.name.startsWith('yolov9')){clearDefectMarkers();return;}
  const visible=new Set();
  for(const track of tracker.tracks){
    if(track.closed||!(track.evidence.mold||track.evidence.damage))continue;
    const held=activeJob?.track===track&&!!activeJob.fruit;
    if(!held&&now-track.lastSeen>TRACK_RULE.maxAge)continue;
    visible.add(track.id);let marker=defectMarkers.get(track.id);
    if(!marker){marker=B.MeshBuilder.CreateBox('yolo-defect-'+track.id,{size:.16},scene);marker.material=defectMarkerMaterial;marker.layerMask=1;marker.isPickable=false;defectMarkers.set(track.id,marker);}
    if(held)marker.position.set(claw.position.x,claw.position.y+.10,claw.position.z);
    else{const p=tracker.predict(track,now);marker.position.set(p.x,fruitHeight(p.x)+.58,p.z);}
  }
  for(const [id,marker] of defectMarkers)if(!visible.has(id)){marker.dispose();defectMarkers.delete(id);}
}
const pickupMaterial=material('pickup-area-color','#33e6a0');pickupMaterial.alpha=.28;pickupMaterial.emissiveColor=new B.Color3(.08,.55,.3);pickupMaterial.backFaceCulling=false;
let pickupArea=null;
function updatePickupArea(){
  pickupArea?.dispose();const positions=[],indices=[],nx=16,nz=24;
  for(let i=0;i<nx;i++)for(let k=0;k<nz;k++){
    const x0=PICK_ZONE.minX+(PICK_ZONE.maxX-PICK_ZONE.minX)*i/nx,x1=PICK_ZONE.minX+(PICK_ZONE.maxX-PICK_ZONE.minX)*(i+1)/nx;
    const z0=-PICK_ZONE.maxZ+2*PICK_ZONE.maxZ*k/nz,z1=-PICK_ZONE.maxZ+2*PICK_ZONE.maxZ*(k+1)/nz;
    const corners=[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
    if(!corners.every(([x,z])=>[fruitHeight(x)+CONTACT_SEARCH.cupBottomOffset,tcpHeight(x),PICK_RULE.hoverY+fruitHeight(x)-.35].every(y=>arm.canReach({x,y,z}))))continue;
    const start=positions.length/3;
    for(const [x,z] of corners)positions.push(x,line.heightAt(x,-.13+(+$('rollerDiameter').value)/2+.035),z);
    indices.push(start,start+1,start+2,start,start+2,start+3);
  }
  pickupArea=new B.Mesh('image-pickup-area',scene);const data=new B.VertexData();data.positions=positions;data.indices=indices;data.normals=[];B.VertexData.ComputeNormals(positions,indices,data.normals);data.applyToMesh(pickupArea);pickupArea.material=pickupMaterial;pickupArea.layerMask=1;pickupArea.isPickable=false;
}
updatePickupArea();
function log(message){const li=document.createElement('li');li.textContent=new Date().toLocaleTimeString('ja-JP')+' '+message;$('log').prepend(li);while($('log').children.length>8)$('log').lastChild.remove();}
function flushEvents(){for(const e of tracker.drainEvents()){if(e.message==='画像から追跡開始')stats.total++;log(e.id+' '+e.message);}}
function spawn(type=null,hidden=false,position=null){if(fruits.filter(f=>!f.sorted).length>=14||(!position&&fruits.some(f=>!f.picked&&f.root.position.x< -5.2)))return null;const f=createFruit({id:nextId++,type:type??(rng()*100<+$('rate').value?(rng()<.5?1:2):0),hidden});f.root.position.copyFrom(position??linePoint({x:-6.4,y:.58,z:0}));f.root.rotationQuaternion=B.Quaternion.RotationAxis(B.Axis.Z,-line.angle);mechanics.addFruit(f);fruits.push(f);for(const v of views)v.rt.renderList.push(...f.meshes);return f;}
function remove(f){for(const v of views)v.rt.renderList=v.rt.renderList.filter(m=>!f.meshes.includes(m));mechanics.detachFruit(f);f.root.dispose();for(const m of f.ownedMaterials)m.dispose(false,true);fruits=fruits.filter(a=>a!==f);}
function worldAt(d,view){
  const ray=B.Ray.CreateNew((d.x0+d.x1)/2,(d.y0+d.y1)/2,FRAME.width,FRAME.height,B.Matrix.Identity(),view.viewMatrix,view.projectionMatrix);
  const geometry=view.geometry||line,calibration=view.support||support;
  let plane=view.linePlane||new B.Plane(geometry.plane.x,geometry.plane.y,0,geometry.plane.d),point;
  for(let i=0;i<8;i++){
    const t=ray.intersectsPlane(plane);if(t===null||t<0)return null;point=ray.origin.add(ray.direction.scale(t));
    const localX=geometry.pivotX+(point.x-geometry.pivotX)/geometry.cos;
    plane=new B.Plane(geometry.sin,geometry.cos,0,-geometry.pivotX*geometry.sin-calibration.heightAt(localX));
  }
  return point;
}
function projectedFruitDiameter(d,view){
  const center=worldAt(d,view);if(!center)return NaN;
  const transform=view.viewMatrix.multiply(view.projectionMatrix),viewport=new B.Viewport(0,0,FRAME.width,FRAME.height);
  const half=new B.Vector3(.39*line.cos,-.39*line.sin,0);
  const left=B.Vector3.Project(center.subtract(half),B.Matrix.Identity(),transform,viewport),right=B.Vector3.Project(center.add(half),B.Matrix.Identity(),transform,viewport);
  return Math.hypot(right.x-left.x,right.y-left.y);
}
function drawBox(ctx,b,color,text){const y=ctx.canvas.id==='overlayB'?FRAME.height-b.y1:b.y0;ctx.strokeStyle=color;ctx.lineWidth=2;ctx.strokeRect(b.x0,y,b.x1-b.x0,b.y1-b.y0);ctx.fillStyle=color;ctx.font='12px sans-serif';ctx.fillText(text,b.x0,Math.max(13,y-4));}
async function scan(){if(busy||paused||switching)return;busy=true;const detector=activeDetector,threshold=+$('confidence').value/100,token=epoch,frame=++tick,capturedAt=performance.now()/1000,t0=performance.now();
  const heldAtCapture=activeJob?.fruit?claw.position.clone():null;
  // Calibration matrices and capture time only: no fruit positions, IDs or orientations.
  const captures=views.map(v=>({...v,geometry:line,support,viewMatrix:v.camera.getViewMatrix().clone(),projectionMatrix:v.camera.getProjectionMatrix().clone(),linePlane:new B.Plane(line.plane.x,line.plane.y,line.plane.z,line.plane.d)})),measurements=[];
  try{
    const pixels=await Promise.all(captures.map(v=>v.rt.readPixels()));
    const jobs=captures.map(async(view,i)=>{
      const raw=pixels[i];if(!raw)return null;const image=new ImageData(FRAME.width,FRAME.height);const stride=FRAME.width*4;for(let y=0;y<FRAME.height;y++)image.data.set(raw.subarray((FRAME.height-1-y)*stride,(FRAME.height-y)*stride),y*stride);
      if(detector.detectFrame){const result=await detector.detectFrame(image,threshold,i);return {view,image,detections:result.fruits,orphans:result.orphans,timings:result.timings};}
      return {view,image,detections:await detector.detect(image,threshold),orphans:[]};
    });
    const results=await Promise.all(jobs);
    for(const result of results){
      if(token!==epoch||paused)return;if(!result)continue;const {view,image,detections,orphans}=result;view.ctx.putImageData(image,0,0);view.overlay.clearRect(0,0,FRAME.width,FRAME.height);const calibrated=[];
      const heldPixel=heldAtCapture?B.Vector3.Project(heldAtCapture.add(new B.Vector3(0,-.32,0)),B.Matrix.Identity(),view.viewMatrix.multiply(view.projectionMatrix),new B.Viewport(0,0,FRAME.width,FRAME.height)):null;
      for(const patch of orphans)drawBox(view.overlay,patch,'#c6a9f4',names[patch.kind]+' · 所属未確定');
      for(const d of detections){const expectedDiameter=projectedFruitDiameter(d,view);if(!Number.isFinite(expectedDiameter)||expectedDiameter<=0){rejectObservation('invalid-calibration',view.id);continue;}const support=checkFruitObservation(image,d,expectedDiameter);if(!support.valid||view.id==='A'&&!support.complete){rejectObservation(support.reason||'incomplete-contour',view.id);continue;}const center=view.id==='A'&&support.center;const world=worldAt(center?{x0:center.x-.5,x1:center.x+.5,y0:center.y-.5,y1:center.y+.5}:d,view);if(!world||world.x< -3.55||world.x>PICK_ZONE.maxX+.3||Math.abs(world.z)>1.35){rejectObservation('outside-inspection-range',view.id);continue;}
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
      const p=B.Vector3.Project(new B.Vector3(t.x,fruitHeight(t.x),t.z),B.Matrix.Identity(),view.viewMatrix.multiply(view.projectionMatrix),new B.Viewport(0,0,FRAME.width,FRAME.height));view.overlay.fillStyle='#72e7ed';view.overlay.font='bold 15px sans-serif';view.overlay.fillText(t.id,p.x+10,(view.id==='B'?FRAME.height-p.y:p.y)+18);
    }
    for(const auxiliary of measurements.filter(v=>v.id!=='A'))tracker.confirmAuxiliary(auxiliary.detections,capturedAt,frame,auxiliary.id);flushEvents();
    $('latency').textContent=Math.round(performance.now()-t0)+' ms';$('inferenceInfo').textContent=results.filter(r=>r?.timings).map(r=>r.view.id+' 推論 '+Math.round(r.timings.inferenceMs)+' ms').join(' ／ ');
  }catch(error){if(token!==epoch)return;paused=true;mechanics.pause(true);updateStatus();globalThis.mikanShowError?.(error);log('検査エラー：'+error.message);}finally{busy=false;}
}
function detectorInfo(){const yolo=activeDetector!==colorDetector;$('confidence').disabled=!yolo;$('detectorInfo').textContent=yolo?'YOLOv9-T / '+activeDetector.config.inputSize+' · CPU · 信頼度 '+$('confidence').value+'%':'色解析デモ';$('pipelineInput').textContent=yolo?'2視点 / 入力'+activeDetector.config.inputSize:'2視点 / 色解析';}
function updateStatus(){$('status').textContent=(activeDetector===colorDetector?'色解析':'YOLOv9')+' · '+(switching?'切替準備中':paused?'一時停止':activeJob?'画像予測でアーム動作中 · 搬送継続':'画像追跡・Havok搬送中');}
function closeTrack(t,state,reason){if(t.closed)return;tracker.close(t,state,reason);if(state==='good'||state==='escaped'||state==='unclassified')stats[state]++;flushEvents();}
function plan(now){if(activeJob)return;const candidates=tracker.tracks.filter(t=>observedInPickZone(t)&&tracker.eligible(t,now)&&tracker.pickable(t,now)&&now-t.lastSeen<=TRACK_RULE.startAge&&(t.defects.size||$('collectUnknown').checked&&tracker.outcome(t)==='unknown')).map(t=>{
    const p=tracker.predict(t,now),hover=new B.Vector3(Math.max(PICK_RULE.minFinalX,Math.min(PICK_RULE.maxFinalX,p.x)),PICK_RULE.hoverY+fruitHeight(p.x)-.35,Math.max(-1.2,Math.min(1.2,p.z))),travel=arm.estimate(hover);
    const future=tracker.predict(t,now+travel+PICK_RULE.settleSeconds);
    if(!Number.isFinite(travel)||p.x<PICK_ZONE.minX||p.x>PICK_ZONE.maxX||t.stable&&future.x>PICK_ZONE.maxX){t.armBlocked='新しい画像と把持可能な到着時刻を待機';return null;}
    t.armBlocked=null;return {t,p,hover,travel};
  }).filter(Boolean).sort((a,b)=>(Number(b.t.defects.size>0)-Number(a.t.defects.size>0))||b.p.x-a.p.x);
  if(!candidates.length)return;const {t,p,hover,travel}=candidates[0];t.state='approaching';tracker.note(t,'\u753b\u50cf\u306e\u73fe\u5728\u4f4d\u7f6e\u304c\u628a\u6301\u7bc4\u56f2\u5185\u30fb\u63a5\u8fd1\u958b\u59cb');const attempt={trackId:t.id,observedAtStart:{x:t.x,z:t.z,capturedAt:t.lastSeen},captureTime:t.lastSeen,plannedAt:now,predictedContactAt:null,aim:{x:p.x,y:fruitHeight(p.x),z:p.z},preposition:{x:hover.x,y:hover.y,z:hover.z},velocity:{x:t.vx,z:t.vz},result:'approaching'};attempts.push(attempt);activeJob={track:t,phase:'hover',t:0,approachTime:0,aim:new B.Vector3(p.x,fruitHeight(p.x),p.z),hover,attempt,rechecks:0,waitingVision:true};arm.grip(false);flushEvents();updateStatus();}
function setArmWait(j,reason,details={}){j.waitReason=reason;j.attempt.lastCheck={reason,...details,time:performance.now()/1000};if(j.attempt.waits?.at(-1)?.reason!==reason){j.attempt.waits??=[];j.attempt.waits.push(j.attempt.lastCheck);if(j.attempt.waits.length>40)j.attempt.waits.shift();}}
function waitForImage(j,reason){
  j.phase='hover';j.t=0;j.intercept=null;j.contactGoal=null;j.touchGoal=null;j.touchAt=null;j.search=null;j.waitingVision=true;arm.grip(false);j.rechecks++;
  tracker.note(j.track,reason);flushEvents();if(j.rechecks>2)failPick(j,'新しい画像で把持位置を確定できず中止');
}

function failPick(j,reason){stats.pickFailed++;j.attempt.result='failed';j.attempt.reason=reason;if(j.fruit){const f=j.fruit;j.attempt.vacuumAtFailure=suction.support(f.body);f.picked=false;j.fruit=null;}closeTrack(j.track,'escaped',reason);j.phase='return';j.t=0;arm.grip(false);}
// Acquisition requires cup contact, simulated vacuum pressure and a physical lift.
const preContact=new Set(['hover','descend','seal']);
function commandArm(j,target){const result=robot(target);if(!result.reachable){failPick(j,'関節制約により到達できない');return false;}return true;}
function advanceArm(dt,now){const j=activeJob;targetMarker.setEnabled(!!j&&preContact.has(j.phase));observationMarker.setEnabled(!!j&&preContact.has(j.phase));if(j)observationMarker.position.set(j.track.x,fruitHeight(j.track.x)+.5,j.track.z);if(!j){robot(rest);arm.grip(false);return;}j.t+=dt;
  if(j.fruit&&['lift','transfer','lower'].includes(j.phase)&&suction.support(j.fruit.body).lastSupportAge>SUCTION_RULE.slipSeconds){failPick(j,'搬送中に吸着が外れて落下');return;}
  if(preContact.has(j.phase)){
    j.approachTime+=dt;if(!j.touchGoal&&!observedInPickZone(j.track)){failPick(j,'\u89b3\u6e2c\u4f4d\u7f6e\u304c\u628a\u6301\u7bc4\u56f2\u3092\u5916\u308c\u305f');return;}const age=now-j.track.lastSeen,current=tracker.predict(j.track,now);
    if(!j.touchGoal&&(age>(j.phase==='hover'?TRACK_RULE.maxAge:SUCTION_RULE.maxOcclusionAge)||j.track.ambiguous)){failPick(j,'把持前に画像追跡が失効・不確実');return;}
    if(!j.touchGoal&&(j.approachTime>10||current.x>PICK_ZONE.maxX+.1)){failPick(j,'対象が把持のタイミングを通過');return;}
    if(j.phase==='hover'){
      j.waitingVision=true;
      const hoverLead=Math.min(.5,arm.estimate(j.hover)),nearFuture=tracker.predict(j.track,now+(Number.isFinite(hoverLead)?hoverLead:0));
      const hoverX=Math.max(PICK_RULE.minFinalX,Math.min(PICK_RULE.maxFinalX,nearFuture.x));j.hover.set(hoverX,PICK_RULE.hoverY+fruitHeight(hoverX)-.35,Math.max(-1.2,Math.min(1.2,nearFuture.z)));
      j.attempt.preposition={x:j.hover.x,y:j.hover.y,z:j.hover.z};if(!commandArm(j,j.hover))return;
      targetMarker.position.set(j.hover.x,fruitHeight(j.hover.x)+.5,j.hover.z);
      if(hoverReady(claw.position,j.hover)){
        const intercept=chooseIntercept(tracker,j.track,now,p=>arm.estimate(p),(reason,details)=>setArmWait(j,reason,details),fruitHeight);
        if(intercept&&arm.canReach(intercept.tcp)){
          j.intercept=intercept;j.aim.set(intercept.aim.x,intercept.aim.y,intercept.aim.z);j.contactGoal=new B.Vector3(intercept.tcp.x,intercept.tcp.y,intercept.tcp.z);j.attempt.aim={...intercept.aim};j.attempt.predictedContactAt=intercept.contactAt;j.attempt.captureTime=j.track.lastSeen;j.attempt.uncertainty=tracker.uncertainty(j.track,now,intercept.lead);j.phase='descend';j.t=0;j.search={};j.waitingVision=false;arm.grip(true);tracker.note(j.track,'新しい画像で把持点・時刻を確定');flushEvents();
        }
      }else setArmWait(j,'\u4e0a\u65b9\u76ee\u6a19\u3078\u63a5\u8fd1\u4e2d',{gap:B.Vector3.Distance(claw.position,j.hover)});
    }else{
      // Stop the TCP on cup contact; never recenter from a fruit mesh pose.
      const touch=suction.readout();if(!j.touchGoal&&(touch.physicalContact||touch.contact||touch.sealed)){j.touchGoal=claw.position.clone();j.touchAt=now;arm.servo.setMotionScale(1);if(j.phase==='descend'){j.phase='seal';j.t=0;j.search=null;arm.grip(true);}}
      // Remaining joint travel replaces a fixed future offset; capture age is included by predict().
      const predicted=tracker.predict(j.track,now),travel=arm.estimate({x:predicted.x,y:Math.min(tcpHeight(predicted.x),j.contactGoal?.y??tcpHeight(predicted.x)),z:predicted.z});
      const lead=Math.min(PICK_RULE.maxFollowLead,Math.max(.04,Number.isFinite(travel)?travel:0)),p=tracker.predict(j.track,now+lead);
      j.attempt.predictedContactAt=now+lead;j.attempt.captureTime=j.track.lastSeen;j.attempt.remainingTravel=travel;
      j.attempt.predictionSeconds=now+lead-j.track.lastSeen;
      if(!j.touchGoal&&(age>SUCTION_RULE.maxOcclusionAge||tracker.uncertainty(j.track,now,lead)>TRACK_RULE.maxUncertainty)){waitForImage(j,'新しい画像で把持位置を再確認');return;}
      let search=null;
      if(!j.touchGoal){
        j.search??={};search=stepContactSearch(j.search,{dt,now,nominalY:tcpHeight(p.x),centerY:fruitHeight(p.x),tcpY:claw.position.y,cupBottomY:arm.suction.root.position.y-.0175,horizontalGap:Math.hypot(claw.position.x-predicted.x,claw.position.z-predicted.z),rollerTopY:Math.max(...[p.x,claw.position.x,arm.suction.root.position.x].map(x=>line.heightAt(x,-.13+(+$('rollerDiameter').value)/2))),contact:touch.physicalContact||touch.contact,sealed:touch.sealed});
        j.attempt.contactSearch={...j.search,tcpY:claw.position.y,cupBottomY:arm.suction.root.position.y-.0175,centerY:fruitHeight(p.x),lowerCupY:search.lowerCupY,aligned:search.aligned,targetY:search.y,reason:search.reason};
        if(search.reason){failPick(j,search.reason==='pressure-timeout'?'接触したが負圧が不足して吸着失敗':search.reason==='no-contact'?'接触探索の下降限界で空振り':'接触探索の下降が間に合わず空振り');return;}
      }
      // Follow fresh image estimates during descent; do not wait for a moving target to settle.
      if(j.touchGoal)j.contactGoal.copyFrom(j.touchGoal);else j.contactGoal.set(p.x,search?.y??tcpHeight(p.x),p.z);j.aim.set(j.contactGoal.x,fruitHeight(j.contactGoal.x),j.contactGoal.z);j.attempt.aim={x:j.aim.x,y:j.aim.y,z:j.aim.z};
      if(!commandArm(j,j.contactGoal))return;targetMarker.position.set(j.aim.x,j.aim.y+.5,j.aim.z);
      if(j.phase==='descend'){
        setArmWait(j,search?.aligned?'接触するまで下降中':'横位置へ追従中',{tcpY:claw.position.y,cupBottomY:arm.suction.root.position.y-.0175,targetY:j.contactGoal.y});
      }else if(j.t>=PICK_RULE.settleSeconds){
        const contact=suction.candidate();
        if(!contact){if(j.touchGoal&&now-(j.touchAt??now)>CONTACT_SEARCH.sealTimeout)failPick(j,'接触したが負圧が不足して吸着失敗');return;}
        const f=contact.fruit;j.attempt.carryMotionScale=1;j.fruit=f;f.picked=true;j.verifyStartY=f.root.position.y;j.verifyStarted=now;
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

function update(dt){if(paused||switching)return;suction.configure({targetKPa:+$('vacuumPressure').value,leak:+$('vacuumLeak').value/100});const now=performance.now()/1000,speed=+$('speed').value;mechanics.setDrive(motorEnabled?speed:0,+$('rollerDifference').value/100,+$('rollerSlowdown').value/100);mechanics.setFriction(+$('friction').value);mechanics.setSlowRollersRemoved($('removeSlowRollers').checked);spawnClock+=motorEnabled?dt:0;scanClock+=dt;uiClock+=dt;
  if($('autoSpawn').checked&&speed>0&&spawnClock>=+$('feedInterval').value){spawn();spawnClock=0;}
  for(const t of tracker.tracks){if(t.closed||t.state!=='observing')continue;const p=tracker.predict(t,now),age=now-t.lastSeen;
    if(age>TRACK_RULE.expireAge)closeTrack(t,t.defects.size||$('collectUnknown').checked?'escaped':'unclassified',t.defects.size?'不良の画像追跡を見失った':'不良未確定のまま追跡終了');
    else if(p.x>PICK_ZONE.maxX){if(tracker.outcome(t)==='good'&&age<=TRACK_RULE.maxAge)closeTrack(t,'good','画像で不良未検出・排除区間通過');else if(!t.defects.size&&!$('collectUnknown').checked)closeTrack(t,'unclassified','不良未確定・未回収で通過');else closeTrack(t,'escaped',t.armBlocked||(activeJob?'アーム動作中に追跡個体が区間通過':'判定・画像更新が間に合わず区間通過'));}
  }
  const holding=!!activeJob&&(!!activeJob.fruit||!!activeJob.touchGoal);
  arm.servo.setMotionScale(holding?1:+$('armSpeed').value);
  plan(now);advanceArm(dt,now);arm.step(dt*(activeJob?.fruit?SUCTION_RULE.carryMotionScale:1));suction.update(dt);tracker.prune();updateDefectMarkers(now);
  // World poses below are used only for physics lifecycle and outcome accounting.
  for(const f of [...fruits]){if(f.picked)continue;if(f.sorted)continue;if(f.root.position.x>linePoint({x:7.3,y:0}).x){stats.passed++;f.sorted=true;f.bin='good';f.releaseAt=now;}else if(f.root.position.y< -1||Math.abs(f.root.position.z)>2||f.root.position.x< -7.5||f.root.position.x>8){stats.lost++;remove(f);}}
}
function renderHistory(){const now=performance.now()/1000;for(const k in stats){const el=$(k);if(el)el.textContent=stats[k];}const f=fruits.find(f=>f.body&&!f.sorted);$('physicsInfo').textContent=f?'Havok · 速度 '+f.body.getLinearVelocity().length().toFixed(2)+' u/s / 接触 '+f.contacts+'回':'Havok · 投入待ち';if(f){const rolling=mechanics.rollingStatus(f);$('physicsInfo').textContent+=' ／ 角速度 '+rolling.angularSpeed.toFixed(2)+' rad/s ／ 接点滑り '+(rolling.slip===null?'接触なし':rolling.slip.toFixed(3)+' u/s');}const rules=mechanics.readRolling();$('rollingInfo').textContent='当たり判定 '+rules.segments+'分割 ／ 角減衰 '+rules.angularDamping.toFixed(2)+' ／ 加減速 '+(rules.acceleration?rules.acceleration+' rad/s²':'即時')+' ／ 実材質：動摩擦 '+rules.fruitMaterial.friction.toFixed(2)+'・静摩擦 '+rules.fruitMaterial.staticFriction.toFixed(2);$('binCount').textContent=fruits.filter(f=>f.sorted).length;$('trackingInfo').textContent='画像追跡 '+tracker.tracks.filter(t=>!t.closed).length+'個体 ／ アーム目標 '+(activeJob?activeJob.track.id+' · '+({hover:activeJob.waitingVision?(activeJob.waitReason||'把持位置で画像確認待ち'):'上方から接近',descend:'下降',seal:'負圧を確認',verifyLift:'持ち上げて把持確認',lift:'持ち上げ',transfer:'箱へ旋回',lower:'箱へ下降',vent:'真空解除',retract:'退避',return:'待機位置へ復帰'}[activeJob.phase]||activeJob.phase):'待機');
  $('predictionInfo').textContent=activeJob&&preContact.has(activeJob.phase)?'桃：最終観測 ／ 水色：予測目標 · 画像の経過 '+Math.round((now-activeJob.track.lastSeen)*1000)+' ms ／ 接触まで '+Math.round(Math.max(0,(activeJob.attempt.predictedContactAt??now)-now)*1000)+' ms · '+(activeJob.waitingVision?(activeJob.waitReason||'対象の上方へ接近'):activeJob.phase==='descend'?(activeJob.waitReason||activeJob.phase):activeJob.phase):'桃：最終観測 ／ 水色：予測目標';
  if(activeJob&&['descend','seal'].includes(activeJob.phase))$('predictionInfo').textContent+=' ／ 工具高さ '+claw.position.y.toFixed(2)+'・目標 '+activeJob.contactGoal.y.toFixed(2)+'・吸盤下面 '+(arm.suction.root.position.y-.0175).toFixed(2)+'・追加下降 '+(activeJob.search?.depth||0).toFixed(2);
  $('observationInfo').textContent='\u679c\u5b9f\u5019\u88dc\u306e\u9664\u5916\uff1a'+(Object.entries(observationIssues).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([key,n])=>{const [view,reason]=key.split(':');return view+' '+(issueNames[reason]||reason)+' '+n;}).join(' / ')||'0');
  const vacuum=suction.readout(activeJob?.fruit?.body);$('gripInfo').textContent='吸着：負圧 −'+vacuum.pressureKPa.toFixed(1)+' kPa ／ 保持力上限 '+vacuum.forceCapacity.toFixed(1)+' N（モデル値）／ '+(vacuum.sealed?'密着中':vacuum.contact?'吸着面に接触':vacuum.physicalContact?'接触あり・密着未成立':'接触待ち');
  const phases={observing:'画像追跡中',approaching:'予測把持へ移動','grip-check':'吸着の持ち上げ確認',sorting:'箱へ移動',reject:'不良排除',unknown:'未判定隔離',good:'不良未検出通過',unclassified:'未判定通過',escaped:'追跡喪失・取り逃がし'};
  $('history').replaceChildren(...tracker.records.slice(-14).reverse().map(t=>{const tr=document.createElement('tr');const p=tracker.predict(t,now);const label=t.state==='observing'&&t.defects.size?(!observedInPickZone(t)?'\u628a\u6301\u7bc4\u56f2\u3078\u306e\u9032\u5165\u5f85\u3061':t.missedFrames?'不良確定・再検出待ち':!t.stable?'不良確定・位置推定中':'不良確定・把持待ち'):phases[t.state]||t.state;const texts=[t.id,label,String(t.frames),t.x.toFixed(2)+', '+t.z.toFixed(2)+' / vx '+t.vx.toFixed(2),[...t.defects].map(k=>names[k]).join('・')||'—',t.events.slice(-3).join(' → ')];for(const [i,text] of texts.entries()){const td=document.createElement('td');td.textContent=text;if(i===1&&t.defects.size)td.className='bad';tr.append(td);}return tr;}));
}
function reset(keepBins=false){epoch++;clearDefectMarkers();for(const f of [...fruits])if(!keepBins||!f.sorted)remove(f);tracker.reset();nextId=1+fruits.reduce((max,f)=>Math.max(max,f.id),0);spawnClock=scanClock=0;tick=0;activeJob=null;targetMarker.setEnabled(false);observationMarker.setEnabled(false);attempts.length=0;for(const k in observationIssues)delete observationIssues[k];for(const k in stats)stats[k]=0;for(const v of views){v.ctx.clearRect(0,0,FRAME.width,FRAME.height);v.overlay.clearRect(0,0,FRAME.width,FRAME.height);}arm.reset();suction.reset();renderHistory();updateStatus();log('物理ラインと画像追跡をリセット');}
function setPaused(value){if(paused===value)return;epoch++;paused=value;if(paused)pauseStarted=performance.now()/1000;else{const delta=performance.now()/1000-pauseStarted;tracker.shiftTime(delta);if(activeJob?.intercept)activeJob.intercept.contactAt+=delta;if(activeJob?.verifyStarted)activeJob.verifyStarted+=delta;}mechanics.pause(paused);updateStatus();}
function setMotorEnabled(value){motorEnabled=!!value;updateStatus();}
$('clearBins').onclick=()=>{for(const f of [...fruits])if(f.sorted)remove(f);renderHistory();log('箱の回収済みミカンを取り除きました');};
function seedLine(){for(const [i,type] of [0,1,2].entries()){const f=spawn(type,type>0,linePoint({x:-5.6+i*1.75,y:.58,z:0}));if(type&&f)f.visual.rotationQuaternion=B.Quaternion.RotationAxis(B.Axis.X,Math.PI);}}
$('detector').onchange=async()=>{if(switching)return;const old=activeDetector,wasPaused=paused;switching=true;epoch++;mechanics.pause(true);for(const el of document.querySelectorAll('button,input,select'))el.disabled=true;updateStatus();try{activeDetector=$('detector').value==='color'?colorDetector:await ensureYolo();reset(true);seedLine();paused=wasPaused;$('loadMessage').hidden=true;$('colorFallback').hidden=true;}catch(error){activeDetector=old;$('detector').value=old===colorDetector?'color':'yolo';paused=true;globalThis.mikanShowError?.(error);}finally{switching=false;mechanics.pause(paused);for(const el of document.querySelectorAll('button,input,select'))el.disabled=false;detectorInfo();updateStatus();}};
let resolutionLoading=false;
$('yoloSize').onchange=async()=>{
  if(activeDetector===colorDetector)return;if(resolutionLoading)return;resolutionLoading=true;
  const previous=yoloDetector;$('yoloSize').disabled=$('detector').disabled=true;
  try{
    // Keep the current model, rendering and physics running until replacement warmup completes.
    const next=await createYoloDetector(message=>{$('detectorInfo').textContent=message;},+$('yoloSize').value);
    activeDetector=yoloDetector=next;reset(true);seedLine();previous?.dispose();$('inferenceInfo').textContent='';log('YOLO入力を'+next.config.inputSize+'へ変更');
  }catch(error){$('yoloSize').value=String(previous.config.inputSize);$('inferenceInfo').textContent='解像度の切替失敗：従来モデルで継続';log(error.message);}
  finally{resolutionLoading=false;$('yoloSize').disabled=$('detector').disabled=false;detectorInfo();}
};
$('slopeAngle').onchange=()=>{reset(false);applySlopeLayout(+$('slopeAngle').value);seedLine();renderHistory();};
function changeRollerLayout(resetLine=true){
  if(fastPitchValue()!==null&&fastPitchValue()<+$('rollerDiameter').value+.01-1e-8)$('fastRollerPitch').value=[...$('fastRollerPitch').options].find(o=>o.value!=='auto'&&+o.value>=+$('rollerDiameter').value+.01-1e-8).value;
  $('rollerPitch').value=String(compatiblePitch(+$('rollerPitch').value,+$('rollerDiameter').value));
  if(resetLine)reset(true);else{epoch++;clearDefectMarkers();if(activeJob&&preContact.has(activeJob.phase))failPick(activeJob,'\u30ed\u30fc\u30e9\u30fc\u9593\u9694\u5909\u66f4\u3067\u628a\u6301\u3092\u4e2d\u6b62');tracker.reset();}
  mechanics.setSlowRollersRemoved($('removeSlowRollers').checked);
  const old=rollers.flatMap(r=>[r,...r.getChildMeshes()]);
  for(const view of views)view.rt.renderList=view.rt.renderList.filter(m=>!old.includes(m));
  lineLayout=lineLayout.filter(item=>!rollers.includes(item.mesh));
  for(const r of rollers){r.body.dispose();r.dispose();}rollers.length=0;
  buildRollers(+$('rollerPitch').value,+$('rollerDiameter').value,$('removeSlowRollers').checked,fastPitchValue());
  lineLayout.push(...rollers.map(mesh=>({mesh,position:mesh.position.clone(),rotation:mesh.rotationQuaternion.clone()})));
  for(const view of views)view.rt.renderList.push(...rollers.flatMap(r=>[r,...r.getChildMeshes()]));
  support=supportCalibration(+$('rollerPitch').value,$('removeSlowRollers').checked,+$('rollerDiameter').value,fastPitchValue());
  mechanics.rebuildRollers(+$('rollerDiameter').value);applySlopeLayout(line.degrees);if(resetLine)seedLine();$('fastRollerPitch').disabled=!$('removeSlowRollers').checked;renderHistory();
};
$('armModel').onchange=()=>{
  reset(true);const previous=[...arm.meshes];arm.setModel($('armModel').value);arm.servo.setMotionScale(+$('armSpeed').value);
  for(const view of views){view.rt.renderList=view.rt.renderList.filter(mesh=>!previous.includes(mesh));view.rt.renderList.push(...arm.meshes);}
  suction.reset();updatePickupArea();seedLine();renderHistory();
};
$('armSpeed').onchange=()=>{if(!activeJob?.fruit&&!activeJob?.touchGoal)arm.servo.setMotionScale(+$('armSpeed').value);};
$('rollerPitch').onchange=$('rollerDiameter').onchange=()=>changeRollerLayout(true);
$('removeSlowRollers').onchange=$('fastRollerPitch').onchange=()=>changeRollerLayout(false);
$('rollingPreset').onchange=()=>{reset(true);mechanics.setRollingPreset($('rollingPreset').value);$('friction').value=String(mechanics.readRolling().friction);$('frictionValue').value=(+$('friction').value).toFixed(2);seedLine();renderHistory();};
$('confidence').oninput=()=>{$('confidenceValue').value=$('confidence').value+'%';};$('confidence').onchange=()=>{reset(true);seedLine();detectorInfo();};
for(const [id,type,hidden] of [['addGood',0,false],['addMold',1,false],['addDamage',2,false],['addHidden',1,true]])$(id).onclick=()=>spawn(type,hidden);
for(const [id,unit] of [['rollerSlowdown','%'],['rollerDifference','%'],['vacuumPressure',' kPa'],['vacuumLeak','%'],['speed',' rad/s'],['friction',''],['rate','%'],['feedInterval',' 秒']])$(id).oninput=()=>{$(id+'Value').value=((id==='rate'||id==='vacuumLeak'||id==='rollerDifference')?$(id).value:(+$(id).value).toFixed(id==='friction'?2:1))+unit;};
$('export').onclick=()=>{const data={version:'0.2-vacuum',detector:activeDetector.name,confidence:activeDetector===colorDetector?null:+$('confidence').value/100,inventory:{retained:fruits.filter(f=>f.sorted).length,bins:{good:fruits.filter(f=>f.bin==='good').length,reject:fruits.filter(f=>f.bin==='reject').length,unknown:fruits.filter(f=>f.bin==='unknown').length}},picking:{rules:PICK_RULE,observationRules:OBSERVATION_RULE,collectUnknown:$('collectUnknown').checked,feedInterval:+$('feedInterval').value,conveyorSlopeDegrees:line.degrees,rollerPitch:+$('rollerPitch').value,rollerDiameter:+$('rollerDiameter').value,fastRollerPitch:fastPitchValue(),supportCalibration:{source:'known-equipment-and-nominal-ellipsoid',knots:support.knots},rollerAngularSpeed:+$('speed').value,rollerTrial:{...ROLLER_TRIAL,transferCenters:mechanics.rollers.filter(r=>r.transfer).map(r=>({x:r.position.x,y:r.position.y})),activeCenters:mechanics.rollers.filter(r=>r.driveRole!=='normal').map(r=>({x:r.position.x,y:r.position.y,role:r.driveRole})),difference:+$('rollerDifference').value/100,slowdown:+$('rollerSlowdown').value/100}},tracking:{positionCamera:'A',auxiliaryDefectCameras:['B'],source:'calibrated-image-detections',observationIssues:{...observationIssues},simulatorIds:false,simulatorPositionsForPlanning:false,rules:TRACK_RULE,pickupZone:PICK_ZONE},robot:{model:arm.model,solver:arm.model==='three'?'redundant-planar-IK-2deg':'two-link-analytic-IK',approachMotionScale:+$('armSpeed').value,carryMotionScale:1,motionScale:arm.servo.motionScale,kinematics:'fixed-link-IK',linkLengths:arm.config.lengths,jointLimitsRadians:arm.config.limits,maxSpeedsRadiansPerSecond:arm.config.speed.map(v=>v*arm.servo.motionScale/arm.config.motionScale),maxAccelerationsRadiansPerSecondSquared:arm.config.acceleration.map(v=>v*(arm.servo.motionScale/arm.config.motionScale)**2),joints:arm.servo.joints,predictionLead:'capture-age-plus-remaining-joint-travel',dropPoints:DROP_POINTS},physics:{engine:'Havok',rolling:mechanics.readRolling(),slope:{degrees:line.degrees,pivotX:line.pivotX,plane:line.plane},continuous:true,grasp:'vacuum-force-and-lift',fruitDynamicDuringCarry:true,vacuumRules:SUCTION_RULE,contactSearchRules:CONTACT_SEARCH,vacuumSettings:suction.readout()},stats,attempts,records:tracker.records.map(t=>({...t,defects:[...t.defects],views:[...t.views]}))};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='mikan-image-tracking.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
let last=performance.now();engine.runRenderLoop(()=>{const now=performance.now(),dt=Math.min((now-last)/1000,.25);last=now;update(dt);const capture=scanClock>=.2&&!busy&&!paused&&!switching;if(capture)for(const v of views)v.rt.resetRefreshCounter();scene.render();if(capture){scanClock=0;scan();}if(uiClock>=.3){uiClock=0;renderHistory();}});
const startup=new URLSearchParams(location.search);
if(startup.get('preset')==='joint-trial'){
  $('slopeAngle').value='5';$('rollerDiameter').value='0.35';$('rollerPitch').value='0.45';$('removeSlowRollers').checked=true;$('fastRollerPitch').value='0.5';applySlopeLayout(5);changeRollerLayout(true);
}else seedLine();
if(startup.get('arm')==='three'){$('armModel').value='three';$('armModel').onchange();}
$('fastRollerPitch').disabled=!$('removeSlowRollers').checked;detectorInfo();updateStatus();renderHistory();
globalThis.mikanDebug={setPaused,setMotorEnabled,get motorEnabled(){return motorEnabled;},get line(){return line;},get pickupArea(){return pickupArea;},get defectMarkers(){return defectMarkers;},fruitHeight,get support(){return support;},worldAt,projectedFruitDiameter,scene,stats,observationIssues,views,mechanics,suction,reset,spawn,tracker,attempts,arm,get detector(){return activeDetector;},get switching(){return switching;},get fruits(){return fruits;},get records(){return tracker.records;},get busy(){return busy;},get paused(){return paused;},get activeJob(){return activeJob;}};
