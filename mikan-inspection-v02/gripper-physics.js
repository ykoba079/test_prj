// Four force-limited sliding fingers. Fruit stays DYNAMIC: no attachment or pose correction.
export const GRIP_RULE={motorForce:4,friction:1.2,contactAge:.24,contactSeconds:.12,minImpulse:.00001,verifyRise:.12,verifySeconds:1.8,slipSeconds:.35,closeTimeout:1.4,maxOcclusionAge:4};
export function createPhysicalGripper(B,scene,arm,mechanics){
  let clock=0;const contacts=new Map(),supportHistory=new Map();
  const anchor=new B.TransformNode('gripper-physics-anchor',scene);anchor.position.copyFrom(arm.claw.position);anchor.rotationQuaternion=arm.claw.rotationQuaternion.clone();
  const anchorBody=new B.PhysicsBody(anchor,B.PhysicsMotionType.ANIMATED,false,scene),anchorShape=new B.PhysicsShapeBox(B.Vector3.Zero(),B.Quaternion.Identity(),new B.Vector3(.1,.1,.1),scene);anchorShape.filterCollideMask=0;anchorBody.shape=anchorShape;
  const padShape=new B.PhysicsShapeBox(B.Vector3.Zero(),B.Quaternion.Identity(),new B.Vector3(.10,.58,.30),scene),tipShape=new B.PhysicsShapeBox(B.Vector3.Zero(),B.Quaternion.Identity(),new B.Vector3(.24,.07,.30),scene),shape=new B.PhysicsShapeContainer(scene);
  for(const s of [padShape,tipShape,shape]){s.material={friction:GRIP_RULE.friction,restitution:0};s.filterMembershipMask=2;s.filterCollideMask=1;}
  shape.addChild(padShape,B.Vector3.Zero(),B.Quaternion.Identity());shape.addChild(tipShape,new B.Vector3(-.07,-.29,0),B.Quaternion.Identity());
  const A=B.PhysicsConstraintAxis;
  for(const f of arm.fingers){
    const body=new B.PhysicsBody(f.root,B.PhysicsMotionType.DYNAMIC,false,scene);body.shape=shape;body.setMassProperties({mass:.08});body.setGravityFactor(0);body.setLinearDamping(.1);f.body=body;
    const joint=new B.Physics6DoFConstraint({pivotA:B.Vector3.Zero(),pivotB:new B.Vector3(0,.32,0),axisA:new B.Vector3(Math.cos(f.angle),0,Math.sin(f.angle)),axisB:B.Axis.X,perpAxisA:B.Axis.Y,perpAxisB:B.Axis.Y},[
      {axis:A.LINEAR_X,minLimit:.32,maxLimit:.83},... [A.LINEAR_Y,A.LINEAR_Z,A.ANGULAR_X,A.ANGULAR_Y,A.ANGULAR_Z].map(axis=>({axis,minLimit:0,maxLimit:0}))
    ],scene);anchorBody.addConstraint(body,joint);joint.setAxisMotorType(A.LINEAR_X,B.PhysicsConstraintMotorType.POSITION);joint.setAxisMotorMaxForce(A.LINEAR_X,GRIP_RULE.motorForce);joint.setAxisMotorTarget(A.LINEAR_X,arm.servo.jaw/2);f.joint=joint;
    body.setCollisionCallbackEnabled(true);body.getCollisionObservable().add(event=>{
      const other=event.collider===body?event.collidedAgainst:event.collider;if(!mechanics.fruitForBody(other))return;
      let row=contacts.get(other);if(!row){row=new Map();contacts.set(other,row);}row.set(f.index,{time:clock,impulse:Math.abs(event.impulse||0)});
    });
  }
  function support(body){
    const row=contacts.get(body),touches=row?[...row].filter(([,c])=>clock-c.time<=GRIP_RULE.contactAge&&c.impulse>=GRIP_RULE.minImpulse):[],indices=touches.map(([i])=>i),opposed=indices.some(i=>indices.includes((i+2)%4));
    let history=supportHistory.get(body);if(!history){history={since:clock,last:clock-GRIP_RULE.slipSeconds-1,lastOpposed:clock-GRIP_RULE.slipSeconds-1};supportHistory.set(body,history);}
    if(opposed){if(clock-history.lastOpposed>GRIP_RULE.contactAge)history.since=clock;history.lastOpposed=clock;}if(indices.length>=1)history.last=clock;
    return {indices,opposed,stableSeconds:opposed?clock-history.since:0,lastSupportAge:clock-history.last,impulses:touches.map(([finger,c])=>({finger,impulse:c.impulse}))};
  }
  return {anchorBody,rules:GRIP_RULE,
    // Velocity drive keeps the wrist continuous across the 1/120-second Havok substeps.
    update(dt){clock+=dt;const step=Math.max(.008,Math.min(dt,.1));anchorBody.setLinearVelocity(arm.claw.position.subtract(anchor.position).scale(1/step));const currentYaw=2*Math.atan2(anchor.rotationQuaternion.y,anchor.rotationQuaternion.w),goalYaw=2*Math.atan2(arm.claw.rotationQuaternion.y,arm.claw.rotationQuaternion.w),delta=Math.atan2(Math.sin(goalYaw-currentYaw),Math.cos(goalYaw-currentYaw));anchorBody.setAngularVelocity(new B.Vector3(0,delta/step,0));for(const f of arm.fingers)f.joint.setAxisMotorTarget(A.LINEAR_X,arm.servo.jaw/2);for(const body of contacts.keys())if(!mechanics.fruitForBody(body)){contacts.delete(body);supportHistory.delete(body);}else support(body);},
    support,
    readout(body=null){return body?support(body):[...contacts.keys()].filter(b=>mechanics.fruitForBody(b)&&!mechanics.fruitForBody(b).sorted).map(support).sort((a,b)=>b.indices.length-a.indices.length)[0]||{indices:[],opposed:false,stableSeconds:0};},
    candidate(){return [...contacts.keys()].map(body=>({fruit:mechanics.fruitForBody(body),body,...support(body)})).filter(c=>c.fruit&&!c.fruit.sorted&&c.opposed&&c.stableSeconds>=GRIP_RULE.contactSeconds).sort((a,b)=>b.indices.length-a.indices.length)[0]||null;},
    opened(){return arm.fingers.every(f=>Math.hypot(f.root.position.x-arm.claw.position.x,f.root.position.z-arm.claw.position.z)>.75);},
    reset(){contacts.clear();supportHistory.clear();anchor.position.copyFrom(arm.claw.position);anchor.rotationQuaternion.copyFrom(arm.claw.rotationQuaternion);anchorBody.setPrestepType(B.PhysicsPrestepType.TELEPORT);for(const f of arm.fingers){f.root.position.copyFrom(f.targetPosition);f.root.rotationQuaternion.copyFrom(f.targetRotation);f.body.setLinearVelocity(B.Vector3.Zero());f.body.setAngularVelocity(B.Vector3.Zero());f.body.setPrestepType(B.PhysicsPrestepType.TELEPORT);}scene.onAfterPhysicsObservable.addOnce(()=>{anchorBody.setPrestepType(B.PhysicsPrestepType.DISABLED);for(const f of arm.fingers)f.body.setPrestepType(B.PhysicsPrestepType.DISABLED);});},
  };
}
