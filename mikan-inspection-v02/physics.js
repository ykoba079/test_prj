import {ROLLER_TRIAL,rollerRole} from './roller-layout.js?v=20261029-layout';
export {ROLLER_TRIAL};
const B=globalThis.BABYLON;
export const ROLLING_PRESETS={
  legacy:{segments:12,angularDamping:.12,acceleration:0,friction:.7,staticRatio:1},
  friction:{segments:12,angularDamping:.12,acceleration:0,friction:1,staticRatio:1.2},
  shape:{segments:32,angularDamping:.12,acceleration:0,friction:.7,staticRatio:1},
  ramp:{segments:12,angularDamping:.12,acceleration:6,friction:.7,staticRatio:1},
  damping:{segments:12,angularDamping:.02,acceleration:0,friction:.7,staticRatio:1},
  combined:{segments:32,angularDamping:.02,acceleration:6,friction:1,staticRatio:1.2}
};

export async function createMechanics(scene,rollers){
  if(typeof globalThis.HavokPhysics!=='function')throw new Error('Havokのスクリプトを取得できませんでした');
  const wasmUrl=new URL('./vendor/HavokPhysics.wasm?v=20261025-bluegreen-mold',import.meta.url);
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
  let havok;
  try{
    const response=await fetch(wasmUrl,{signal:controller.signal});
    if(!response.ok)throw new Error('Havok WASMを取得できません（HTTP '+response.status+'）');
    const wasmBinary=await response.arrayBuffer();
    havok=await globalThis.HavokPhysics({wasmBinary,locateFile:file=>new URL('./vendor/'+file,import.meta.url).href});
  }catch(error){throw new Error(error.name==='AbortError'?'Havokの読込がタイムアウトしました。ページを再読み込みしてください。':error.message);}
  finally{clearTimeout(timeout);}
  const plugin=new B.HavokPlugin(true,havok);
  scene.enablePhysics(new B.Vector3(0,-9.81,0),plugin);
  scene.getPhysicsEngine().setSubTimeStep(1000/120);
  let rollerDiameter=.30;
  const makeRollerShape=()=>new B.PhysicsShapeCylinder(new B.Vector3(0,-1.325,0),new B.Vector3(0,1.325,0),rollerDiameter/2,scene);
  let rollerShape=makeRollerShape(),slowRollerShape=makeRollerShape(),slowCollisionMask=slowRollerShape.filterCollideMask;
  function attachRollers(){
    for(const roller of rollers){
      const body=new B.PhysicsBody(roller,B.PhysicsMotionType.ANIMATED,false,scene);
      body.shape=roller.driveRole==='slow'?slowRollerShape:rollerShape;body.setMassProperties({mass:10});roller.body=body;
    }
  }
  // Standalone fixtures may supply meshes without a preassigned role.
  const pitch=rollers.length>1?rollers[1].position.x-rollers[0].position.x:.31;
  for(const r of rollers)r.driveRole??=rollerRole(r.position.x,pitch);
  attachRollers();
  // Bake the same ellipsoid proportions as the visible fruit into the collision hull.
  const fruitShapes=new Map([12,32].map(segments=>{
    const hullMesh=B.MeshBuilder.CreateSphere('fruit-collision-template',{diameter:.78,segments},scene);
    hullMesh.scaling.y=.84;hullMesh.bakeCurrentTransformIntoVertices();
    const shape=new B.PhysicsShapeConvexHull(hullMesh,scene);hullMesh.dispose();return [segments,shape];
  }));
  const staticBodies=[];
  for(const mesh of scene.meshes.filter(m=>m.name==='floor'||m.name==='rail'||/^(良品|不良|未判定)-(bottom|wall)$/.test(m.name))){
    const aggregate=new B.PhysicsAggregate(mesh,B.PhysicsShapeType.BOX,{mass:0,friction:.5,restitution:0},scene);staticBodies.push(aggregate);
  }
  let preset='combined',friction=1,clock=0,slowRollersRemoved=false;const fruitBodies=new Map();
  const rule=()=>ROLLING_PRESETS[preset],fruitShape=()=>fruitShapes.get(rule().segments);
  function applyMaterials(){
    const combine=B.PhysicsMaterialCombineMode.MINIMUM,staticFriction=friction*rule().staticRatio;
    fruitShape().material={friction,staticFriction,restitution:.02,frictionCombine:combine};
    // Preserve the historical roller coefficient in isolated legacy comparisons.
    const rollerFriction=rule().staticRatio>1?friction:friction===0?0:.9;
    rollerShape.material={friction:rollerFriction,staticFriction:rollerFriction*rule().staticRatio,restitution:0,frictionCombine:combine};
    slowRollerShape.material={...rollerShape.material};
  }
  applyMaterials();
  scene.onBeforePhysicsObservable.add(()=>{
    const dt=scene.getPhysicsEngine().getSubTimeStep()/1000;clock+=dt;
    for(const r of rollers){
      const target=r.targetDriveSpeed||0,current=r.driveSpeed||0,limit=rule().acceleration*dt;
      r.driveSpeed=limit?current+Math.max(-limit,Math.min(limit,target-current)):target;
      r.body.setAngularVelocity(new B.Vector3(0,0,-r.driveSpeed));
    }
  });
  return {
    plugin,rollers,get fruitShape(){return fruitShape();},fruitForBody:body=>fruitBodies.get(body)||null,
    rebuildRollers(diameter=rollerDiameter){rollerShape.dispose();slowRollerShape.dispose();rollerDiameter=diameter;rollerShape=makeRollerShape();slowRollerShape=makeRollerShape();slowCollisionMask=slowRollerShape.filterCollideMask;slowRollerShape.filterCollideMask=slowRollersRemoved?0:slowCollisionMask;applyMaterials();attachRollers();for(const f of fruitBodies.values())f.rollerContacts.clear();for(const r of rollers)if(r.driveRole==='slow')r.setEnabled(!slowRollersRemoved);},
    syncLayout(){
      // A setting change resets fruit first; teleport equipment once, then resume velocity drive.
      const bodies=[...rollers.map(r=>r.body),...staticBodies.map(a=>a.body)];
      for(const body of bodies)body.setPrestepType(B.PhysicsPrestepType.TELEPORT);
      scene.onAfterPhysicsObservable.addOnce(()=>{for(const body of bodies)body.setPrestepType(B.PhysicsPrestepType.DISABLED);});
    },
    setRollingPreset(name){if(!ROLLING_PRESETS[name])throw new Error('Unknown rolling preset');preset=name;friction=rule().friction;applyMaterials();},
    readRolling(){return {preset,...rule(),friction,rollerDiameter,slowRollersRemoved,fruitMaterial:fruitShape().material,rollerMaterial:rollerShape.material,slowRollerMaterial:slowRollerShape.material};},
    setSlowRollersRemoved(value){
      if(slowRollersRemoved===value)return;slowRollersRemoved=value;
      slowRollerShape.filterCollideMask=value?0:slowCollisionMask;
      for(const r of rollers)if(r.driveRole==='slow')r.setEnabled(!value);
      // Exclude contacts from the previous substep immediately after switching.
      for(const f of fruitBodies.values())for(const r of f.rollerContacts.keys())if(r.driveRole==='slow')f.rollerContacts.delete(r);
    },
    rollingStatus(f){const recent=[...(f.rollerContacts?.values()||[])].filter(c=>clock-c.time<.035);return {contacts:recent.length,slip:recent.length?recent.reduce((sum,c)=>sum+c.slip,0)/recent.length:null,angularSpeed:f.body?.getAngularVelocity().length()||0};},
    setDrive(speed,difference=0,slowdown=difference){
      const delta=Math.max(0,Math.min(1,difference));
      const reduction=Math.max(-1,Math.min(1,slowdown));
      for(const r of rollers){
        const factor=r.driveRole==='slow'?1-reduction:r.driveRole==='fast'?1+delta:1;
        r.targetDriveSpeed=speed*factor;
      }
    },
    setFriction(value){if(value===friction)return;friction=value;applyMaterials();},
    addFruit(f){
      const body=new B.PhysicsBody(f.root,B.PhysicsMotionType.DYNAMIC,false,scene);
      body.shape=fruitShape();body.setMassProperties({mass:.18});body.setLinearDamping(.04);body.setAngularDamping(rule().angularDamping);
      f.body=body;fruitBodies.set(body,f);f.contacts=0;f.rollerContacts=new Map();body.setCollisionCallbackEnabled(true);
      body.getCollisionObservable().add(e=>{
        const roller=rollers.find(r=>r.body===e.collider||r.body===e.collidedAgainst);if(!roller)return;f.contacts++;
        if(!e.point||!e.normal)return;
        const fruitVelocity=body.getLinearVelocity().add(B.Vector3.Cross(body.getAngularVelocity(),e.point.subtract(f.root.position)));
        const rollerVelocity=roller.body.getLinearVelocity().add(B.Vector3.Cross(roller.body.getAngularVelocity(),e.point.subtract(roller.position)));
        const relative=fruitVelocity.subtract(rollerVelocity),normal=e.normal.clone().normalize();
        const slip=relative.subtract(normal.scale(B.Vector3.Dot(relative,normal))).length();
        f.rollerContacts.set(roller,{time:clock,slip});
      });
    },
    detachFruit(f){if(f.body){fruitBodies.delete(f.body);f.body.dispose();f.body=null;}},
    pause(value){scene.physicsEnabled=!value;},
  };
}
