import {colorDetector} from './vision.js';
import {createFruitFactory,random} from './fruit.js';
const B=globalThis.BABYLON,$=id=>document.getElementById(id),names={mold:'カビ',damage:'傷'},stateNames={observing:'観測中',good:'良品通過',reject:'不良排除',unknown:'未判定隔離',sorting:'アーム移動中',missed:'搬送異常'};
const engine=new B.Engine($('scene'),true),scene=new B.Scene(engine);scene.clearColor=B.Color4.FromHexString('#1b2925ff');
const orbit=new B.ArcRotateCamera('orbit',-Math.PI/2.6,Math.PI/3.2,17,new B.Vector3(-.5,.1,0),scene);orbit.attachControl($('scene'),true);orbit.lowerRadiusLimit=8;orbit.upperRadiusLimit=26;orbit.layerMask=1;
const sky=new B.HemisphericLight('sky',new B.Vector3(0,1,.2),scene);sky.intensity=1.25;sky.groundColor=new B.Color3(.48,.46,.4);
function material(name,color){const m=new B.StandardMaterial(name,scene);m.diffuseColor=B.Color3.FromHexString(color);m.specularColor=new B.Color3(.1,.1,.1);return m;}
const metal=material('metal','#80968a'),dark=material('belt','#35433d'),accent=material('robot','#d9e5b4'),amber=material('zone','#af873f');
function box(name,w,h,d,x,y,z,m,layer=1){const a=B.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);a.position.set(x,y,z);a.material=m;a.layerMask=layer;return a;}
box('floor',28,.1,20,0,-1.4,0,material('floor','#21312b'));
const inspectionBed=box('inspection-background',14,.15,2.6,0,-.23,0,dark,3);
const rollers=[];
for(let x=-6.8;x<7;x+=.36){const roller=B.MeshBuilder.CreateCylinder('roller',{height:2.65,diameter:.3,tessellation:16},scene);roller.material=metal;roller.position.set(x,-.13,0);roller.rotationQuaternion=B.Quaternion.RotationAxis(B.Axis.X,Math.PI/2);roller.spin=0;roller.layerMask=1;
  const stripe=box('roller-marker',.03,.012,2.5,0,.155,0,dark);stripe.parent=roller;stripe.position.set(.15,0,0);stripe.scaling.set(1,1,1);stripe.rotation.x=-Math.PI/2;rollers.push(roller);}
for(const z of [-1.48,1.48]){box('rail',14,.22,.12,0,-.07,z,metal);box('inspection-zone',6.2,.07,.14,-1.6,.07,z,amber);for(const x of [-5,0,5])box('leg',.16,1.1,.16,x,-.8,z,metal);}
function bin(name,x,z,color){const m=material(name,color);box(name+'-bottom',1.7,.12,1.8,x,-.65,z,m);for(const dz of [-.9,.9])box(name+'-wall',1.8,.55,.09,x,-.4,z+dz,m);for(const dx of [-.85,.85])box(name+'-wall',.09,.55,1.8,x+dx,-.4,z,m);}
bin('良品',7.7,0,'#58734d');bin('不良',3,3.5,'#9c5d46');bin('未判定',3,-3.5,'#4b7384');
for(const x of [-4.7,1.5])box('camera-post',.12,3.4,.12,x,1.4,-1.9,metal);
box('camera-crossbar',6.3,.13,.13,-1.6,3,-1.9,metal);box('top-camera',.52,.23,.55,-1.6,2.9,0,accent);const camHousing=box('oblique-camera',.52,.23,.55,-1.6,2.8,1.9,accent);camHousing.rotation.x=-.6;
box('robot-base',.8,.35,.8,3,.05,2.1,metal);
const armA=B.MeshBuilder.CreateCylinder('arm-a',{height:1,diameter:.18},scene),armB=B.MeshBuilder.CreateCylinder('arm-b',{height:1,diameter:.15},scene);armA.material=armB.material=accent;armA.layerMask=armB.layerMask=1;
const claw=box('gripper',.46,.16,.46,3,1,2,metal);
function segment(mesh,a,b){mesh.position=B.Vector3.Center(a,b);mesh.scaling.y=B.Vector3.Distance(a,b);mesh.rotationQuaternion=B.Quaternion.FromUnitVectorsToRef(B.Axis.Y,b.subtract(a).normalize(),new B.Quaternion());}
function robot(target){const base=new B.Vector3(3,.3,2.1),elbow=new B.Vector3(3,2.8,.3);segment(armA,base,elbow);segment(armB,elbow,target);claw.position.copyFrom(target);}
robot(new B.Vector3(3,1.2,2.1));
const views=['A','B'].map(id=>{
  const camera=new B.FreeCamera('inspection-'+id,new B.Vector3(-1.6,9,id==='A'?0:5.5),scene);camera.upVector=new B.Vector3(0,0,1);camera.setTarget(new B.Vector3(-1.6,.42,0));camera.mode=B.Camera.ORTHOGRAPHIC_CAMERA;camera.orthoLeft=-3.5;camera.orthoRight=3.5;camera.orthoTop=1.75;camera.orthoBottom=-1.75;camera.layerMask=2;
  const rt=new B.RenderTargetTexture('frame-'+id,{width:640,height:320},scene,false,true,B.Engine.TEXTURETYPE_UNSIGNED_BYTE);rt.activeCamera=camera;rt.renderList=[inspectionBed];rt.clearColor=new B.Color4(.08,.1,.09,1);scene.customRenderTargets.push(rt);
  return {id,camera,rt,ctx:$('inspection'+id).getContext('2d'),overlay:$('overlay'+id).getContext('2d')};
});
const directions=Array.from({length:12},(_,i)=>{const y=1-2*(i+.5)/12,a=i*Math.PI*(3-Math.sqrt(5)),r=Math.sqrt(1-y*y);return new B.Vector3(Math.cos(a)*r,y,Math.sin(a)*r);});
const createFruit=createFruitFactory(scene),rng=random(20261005),stats={total:0,good:0,reject:0,unknown:0};
let fruits=[],records=[],nextId=1,paused=false,busy=false,epoch=0,tick=0,scanClock=0,spawnClock=0,activeJob=null,dirty=true,uiClock=0;
function log(message){const li=document.createElement('li');li.textContent=new Date().toLocaleTimeString('ja-JP')+'  '+message;$('log').prepend(li);while($('log').children.length>8)$('log').lastChild.remove();}
function event(f,text){f.events.push(text);if(f.events.length>8)f.events.shift();dirty=true;}
function spawn(type=null,hidden=false){if(fruits.length>=14){log('ラインが満杯です。搬送後に投入してください');return null;}const f=createFruit({id:nextId++,type:type??(rng()*100<+$('rate').value?(rng()<.5?1:2):0),hidden});const tail=fruits.filter(a=>!a.picked).reduce((x,a)=>Math.min(x,a.root.position.x),-4.8);f.root.position.x=Math.min(-6.4,tail-1.75);fruits.push(f);records.push(f);if(records.length>80)records.shift();for(const v of views)v.rt.renderList.push(...f.meshes);event(f,hidden?'底面を上に回す比較用個体':'投入');return f;}
function remove(f){for(const v of views)v.rt.renderList=v.rt.renderList.filter(m=>!f.meshes.includes(m));f.root.dispose();for(const m of f.ownedMaterials)m.dispose(false,true);fruits=fruits.filter(a=>a!==f);dirty=true;}
function complete(f){return f.frames>=12&&f.directions.size>=8;}
function recordObservation(f,s,view,d,frame){
  if(!f.observed){f.observed=true;stats.total++;}
  if(f.lastFrame!==frame){f.lastFrame=frame;f.frames++;}
  const local=view.camera.position.subtract(s.position).normalize().rotateByQuaternionToRef(s.orientation.conjugate(),new B.Vector3());let nearest=0,best=-2;directions.forEach((n,i)=>{const dot=B.Vector3.Dot(n,local);if(dot>best){nearest=i;best=dot;}});f.directions.add(nearest);
  for(const kind of d.defects){if(f.lastEvidence[kind]!==frame){f.evidence[kind]++;f.lastEvidence[kind]=frame;}if(f.evidence[kind]>=2&&!f.defects.has(kind)){f.defects.add(kind);event(f,names[kind]+'確定（2フレーム）');log('#'+f.id+' '+names[kind]+'を画像で確認 → 排除予約');}}
  dirty=true;
}
// General orthographic-camera unprojection onto the nominal fruit-center plane.
function worldAt(d,view){const ray=B.Ray.CreateNew((d.x0+d.x1)/2,(d.y0+d.y1)/2,640,320,B.Matrix.Identity(),view.viewMatrix,view.projectionMatrix);const t=ray.intersectsPlane(new B.Plane(0,1,0,-.42));return t===null?null:ray.origin.add(ray.direction.scale(t));}
async function scan(){if(busy||paused)return;busy=true;const token=epoch,frame=++tick,t0=performance.now();
  const snapshot=fruits.filter(f=>!f.picked&&f.state==='observing').map(f=>({f,position:f.root.position.clone(),orientation:f.visual.rotationQuaternion.clone()}));
  const captures=views.map(v=>({...v,viewMatrix:v.camera.getViewMatrix().clone(),projectionMatrix:v.camera.getProjectionMatrix().clone()}));
  try{
    const pixels=await Promise.all(captures.map(v=>v.rt.readPixels()));
    for(let i=0;i<captures.length;i++){
      if(token!==epoch||paused)return;const view=captures[i],raw=pixels[i];if(!raw)continue;
      const image=new ImageData(640,320);for(let y=0;y<320;y++)image.data.set(raw.subarray((319-y)*2560,(320-y)*2560),y*2560);
      const detections=await colorDetector.detect(image);if(token!==epoch||paused)return;view.ctx.putImageData(image,0,0);view.overlay.clearRect(0,0,640,320);const matched=new Set();
      for(const d of detections){const world=worldAt(d,view);if(!world)continue;const candidates=snapshot.filter(s=>!matched.has(s.f.id)).map(s=>({...s,distance:Math.hypot(s.position.x-world.x,s.position.z-world.z)})).sort((a,b)=>a.distance-b.distance);const s=candidates[0];if(!s||s.distance>.5||!fruits.includes(s.f)||s.f.picked||s.position.x< -4.8||s.position.x>1.4)continue;matched.add(s.f.id);
        recordObservation(s.f,s,view,d,frame);const color=d.defects.length?'#ff967e':'#c6e49d';view.overlay.strokeStyle=color;view.overlay.lineWidth=2;view.overlay.strokeRect(d.x0,d.y0,d.x1-d.x0,d.y1-d.y0);view.overlay.fillStyle=color;view.overlay.font='13px sans-serif';view.overlay.fillText('#'+s.f.id+' '+(d.defects.map(k=>names[k]).join('・')||'不良未検出'),d.x0,Math.max(14,d.y0-5));
      }
    }
    $('latency').textContent=Math.round(performance.now()-t0)+' ms';
  }catch(error){paused=true;updateStatus();log('検査エラー：'+error.message);}finally{busy=false;}
}
function updateStatus(){ $('pause').textContent=paused?'再開':'一時停止';$('status').textContent=paused?'ライン停止中':activeJob?'選別中 · 搬送待機':'回転検査 稼働中'; }
function finish(f,state){f.state=state;stats[state]++;event(f,stateNames[state]);log('#'+f.id+' '+stateNames[state]);remove(f);}
function update(dt){if(paused)return;const speed=+$('speed').value,awaitingResult=busy&&fruits.some(f=>f.state==='observing'&&f.root.position.x>=1.5),transport=activeJob||awaitingResult?0:dt;spawnClock+=transport;scanClock+=dt;uiClock+=dt;
  if($('autoSpawn').checked&&spawnClock>=1.8/speed){spawn();spawnClock=0;}
  for(const r of rollers){r.spin-=transport*speed*4;r.rotationQuaternion=B.Quaternion.RotationAxis(B.Axis.X,Math.PI/2).multiply(B.Quaternion.RotationAxis(B.Axis.Y,r.spin));}
  for(const f of [...fruits]){
    if(f.picked)continue;f.root.position.x+=transport*speed;
    if(f.root.position.x>=-4.8&&f.root.position.x<=1.4){f.angle+=transport*+$('rotation').value;const q=B.Quaternion.RotationAxis(B.Axis.Z,-f.angle);f.visual.rotationQuaternion=$('rotationMode').value==='compound'?B.Quaternion.RotationAxis(B.Axis.X,f.angle*.61).multiply(q):q;}
    if(f.root.position.x>=1.55&&f.state==='observing'){
      if(busy)continue;
      const target=f.defects.size?'reject':complete(f)?'good':'unknown';f.outcome=target;event(f,target==='good'?'観測十分・不良未検出':target==='reject'?'不良確定':'観測不足・未判定');
      if(target==='good'){f.state='passing';dirty=true;}else if(!activeJob){f.picked=true;f.state='sorting';activeJob={f,t:0,start:f.root.position.clone(),end:new B.Vector3(3,-.1,target==='reject'?3.5:-3.5)};updateStatus();break;}
    }
    if(f.root.position.x>7.3){if(f.outcome==='good')finish(f,'good');else{f.state='missed';event(f,'搬送異常');remove(f);log('#'+f.id+' 搬送異常');}}
  }
  if(activeJob){const j=activeJob;j.t+=dt;const p=Math.min(j.t/1.5,1);j.f.root.position.copyFrom(B.Vector3.Lerp(j.start,j.end,p));j.f.root.position.y+=Math.sin(p*Math.PI)*1.5;robot(j.f.root.position.add(new B.Vector3(0,.48,0)));if(p===1){finish(j.f,j.f.outcome);activeJob=null;updateStatus();}}else robot(new B.Vector3(3,1.2,2.1));
}
function renderHistory(){if(!dirty)return;dirty=false;for(const k in stats)$(k).textContent=stats[k];const rows=records.slice(-14).reverse().map(f=>{const tr=document.createElement('tr');const phase=f.state==='passing'?'良品・搬送中':f.state==='observing'?(f.defects.size?'不良・排除待ち':complete(f)?'観測十分・判定待ち':'観測中'):stateNames[f.state];const texts=['#'+f.id,phase,String(f.frames),f.directions.size+'/12'+(complete(f)?' · 観測十分':''),[...f.defects].map(k=>names[k]).join('・')||'—',f.events.slice(-3).join(' → ')];texts.forEach((text,i)=>{const td=document.createElement('td');td.textContent=text;if(i===1)td.className=f.defects.size?'bad':f.outcome==='unknown'?'unknown':'';tr.append(td);});return tr;});$('history').replaceChildren(...rows);}
function reset(){epoch++;for(const f of [...fruits])remove(f);records=[];nextId=1;spawnClock=scanClock=0;tick=0;activeJob=null;Object.keys(stats).forEach(k=>stats[k]=0);for(const v of views){v.ctx.clearRect(0,0,640,320);v.overlay.clearRect(0,0,640,320);}dirty=true;renderHistory();updateStatus();robot(new B.Vector3(3,1.2,2.1));log('ラインと履歴をリセットしました');}
$('pause').onclick=()=>{paused=!paused;updateStatus();};$('reset').onclick=reset;
for(const [id,type,hidden] of [['addGood',0,false],['addMold',1,false],['addDamage',2,false],['addHidden',1,true]])$(id).onclick=()=>spawn(type,hidden);
for(const [id,unit] of [['speed','×'],['rotation',' rad/s'],['rate','%']])$(id).oninput=()=>{$(id+'Value').value=(id==='rate'?$(id).value:(+$(id).value).toFixed(1))+unit;};
$('export').onclick=()=>{const data={version:'0.2',detector:colorDetector.name,coverageRule:{minimumFrames:12,minimumDirections:8,directionBins:12,surfaceCoverage:false},records:records.map(f=>({id:f.id,state:f.state,outcome:f.outcome??null,frames:f.frames,directions:[...f.directions],defects:[...f.defects],evidence:{...f.evidence},history:[...f.events]}))};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='mikan-v0.2-history.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
let last=performance.now();engine.runRenderLoop(()=>{const now=performance.now(),dt=Math.min((now-last)/1000,.05);last=now;update(dt);scene.render();if(scanClock>=.2){scanClock=0;scan();}if(uiClock>=.3){uiClock=0;renderHistory();}});window.addEventListener('resize',()=>engine.resize());
for(const [i,type] of [0,1,2].entries()){const f=spawn(type,i===1);f.root.position.x=-4.6+i*1.75;}
renderHistory();
globalThis.mikanDebug={scene,stats,views,reset,spawn,get fruits(){return fruits;},get records(){return records;},get busy(){return busy;},get paused(){return paused;},get activeJob(){return activeJob;}};
