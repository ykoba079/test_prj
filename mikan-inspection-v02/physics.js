const B=globalThis.BABYLON;

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
  const rollerShape=new B.PhysicsShapeCylinder(new B.Vector3(0,-1.325,0),new B.Vector3(0,1.325,0),.15,scene);
  rollerShape.material={friction:.9,restitution:0};
  for(const roller of rollers){
    const body=new B.PhysicsBody(roller,B.PhysicsMotionType.ANIMATED,false,scene);
    body.shape=rollerShape;body.setMassProperties({mass:10});
    roller.body=body;
  }
  // Bake the same ellipsoid proportions as the visible fruit into the collision hull.
  const hullMesh=B.MeshBuilder.CreateSphere('fruit-collision-template',{diameter:.78,segments:12},scene);
  hullMesh.scaling.y=.84;hullMesh.bakeCurrentTransformIntoVertices();
  const fruitShape=new B.PhysicsShapeConvexHull(hullMesh,scene);hullMesh.dispose();
  fruitShape.material={friction:.7,restitution:.02};
  const staticBodies=[];
  for(const mesh of scene.meshes.filter(m=>m.name==='floor'||m.name==='rail'||/^(良品|不良|未判定)-(bottom|wall)$/.test(m.name))){
    const aggregate=new B.PhysicsAggregate(mesh,B.PhysicsShapeType.BOX,{mass:0,friction:.5,restitution:0},scene);staticBodies.push(aggregate);
  }
  let friction=.7;const fruitBodies=new Map();
  return {
    plugin,rollers,fruitShape,fruitForBody:body=>fruitBodies.get(body)||null,
    setDrive(speed){for(const r of rollers)r.body.setAngularVelocity(new B.Vector3(0,0,-speed));},
    setFriction(value){if(value===friction)return;friction=value;fruitShape.material={friction:value,restitution:.02};rollerShape.material={friction:value===0?0:.9,restitution:0};},
    addFruit(f){
      const body=new B.PhysicsBody(f.root,B.PhysicsMotionType.DYNAMIC,false,scene);
      body.shape=fruitShape;body.setMassProperties({mass:.18});body.setLinearDamping(.04);body.setAngularDamping(.12);
      f.body=body;fruitBodies.set(body,f);f.contacts=0;body.setCollisionCallbackEnabled(true);
      body.getCollisionObservable().add(e=>{if(rollers.some(r=>r.body===e.collider||r.body===e.collidedAgainst))f.contacts++;});
    },
    detachFruit(f){if(f.body){fruitBodies.delete(f.body);f.body.dispose();f.body=null;}},
    pause(value){scene.physicsEnabled=!value;},
  };
}
