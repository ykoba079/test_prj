// Rigid-body approximation of a compliant vacuum cup. No CFD and no fruit pose attachment.
export const SUCTION_RULE={radius:.16,effectiveAreaM2:.0002,targetKPa:60,pumpSeconds:.05,ventSeconds:.055,readyKPa:12,holdingKPa:8,sealSeconds:.10,contactAge:.10,maxGap:.14,minNormalY:.65,spring:120,damping:6,angularSpring:.6,angularDamping:.08,momentArm:.056,carryMotionScale:.65,shearRatio:.70,padForce:3,verifyRise:.12,verifySeconds:1.8,slipSeconds:.25,sealTimeout:1.4,maxOcclusionAge:3.5};
export function createVacuumGripper(B,scene,arm,mechanics){
  let clock=0,pressure=0,targetKPa=SUCTION_RULE.targetKPa,leak=0,seal=null,readySince=null,lastBreak='idle',lastApplied=0;
  const contacts=new Map(),lastSupport=new Map(),anchor=new B.TransformNode('vacuum-wrist-anchor',scene);anchor.position.copyFrom(arm.claw.position);anchor.rotationQuaternion=arm.claw.rotationQuaternion.clone();
  const anchorBody=new B.PhysicsBody(anchor,B.PhysicsMotionType.ANIMATED,false,scene),empty=new B.PhysicsShapeBox(B.Vector3.Zero(),B.Quaternion.Identity(),new B.Vector3(.05,.05,.05),scene);empty.filterCollideMask=0;anchorBody.shape=empty;
  const pad=arm.suction,body=new B.PhysicsBody(pad.root,B.PhysicsMotionType.DYNAMIC,false,scene),shape=new B.PhysicsShapeCylinder(new B.Vector3(0,-.0175,0),new B.Vector3(0,.0175,0),SUCTION_RULE.radius,scene);shape.material={friction:.8,restitution:0};body.shape=shape;body.setMassProperties({mass:.035});body.setGravityFactor(0);pad.body=body;
  const A=B.PhysicsConstraintAxis,joint=new B.Physics6DoFConstraint({pivotA:new B.Vector3(0,-.10,0),pivotB:B.Vector3.Zero(),axisA:B.Axis.Y,axisB:B.Axis.Y,perpAxisA:B.Axis.X,perpAxisB:B.Axis.X},[{axis:A.LINEAR_X,minLimit:0,maxLimit:.08},...[A.LINEAR_Y,A.LINEAR_Z,A.ANGULAR_X,A.ANGULAR_Y,A.ANGULAR_Z].map(axis=>({axis,minLimit:0,maxLimit:0}))],scene);anchorBody.addConstraint(body,joint);joint.setAxisMotorType(A.LINEAR_X,B.PhysicsConstraintMotorType.POSITION);joint.setAxisMotorTarget(A.LINEAR_X,0);joint.setAxisMotorMaxForce(A.LINEAR_X,SUCTION_RULE.padForce);
  body.setCollisionCallbackEnabled(true);body.getCollisionObservable().add(e=>{
    const other=e.collider===body?e.collidedAgainst:e.collider,fruit=mechanics.fruitForBody(other);if(!fruit||fruit.sorted||!e.point||!e.normal)return;
    const alignment=Math.abs(e.normal.y),radial=Math.hypot(e.point.x-pad.root.position.x,e.point.z-pad.root.position.z)/SUCTION_RULE.radius,quality=Math.max(0,alignment*alignment*(1-.65*radial*radial));
    if(alignment<.8||radial>1.08||quality<.25)return;contacts.set(other,{time:clock,quality,point:e.point.clone(),normal:e.normal.scale(e.normal.y<0?-1:1)});
  });
  function detach(reason){if(seal){lastBreak=reason;contacts.delete(seal.body);}seal=null;readySince=null;lastApplied=0;arm.suction.stretch=0;}
  function capacity(){return pressure*1000*SUCTION_RULE.effectiveAreaM2;}
  function currentContact(){return [...contacts].filter(([b,c])=>mechanics.fruitForBody(b)&&!mechanics.fruitForBody(b).sorted&&clock-c.time<=SUCTION_RULE.contactAge).sort((a,b)=>b[1].quality-a[1].quality)[0]||null;}
  function worldPoint(){seal.fruit.root.computeWorldMatrix(true);return B.Vector3.TransformCoordinates(seal.localPoint,seal.fruit.root.getWorldMatrix());}
  function targetPoint(){pad.root.computeWorldMatrix(true);return B.Vector3.TransformCoordinates(seal.padPoint,pad.root.getWorldMatrix());}
  function status(forBody=null){const active=!!seal&&(!forBody||forBody===seal.body),contact=currentContact();return {sealed:active,contact:!!contact,quality:active?seal.quality:contact?.[1].quality||0,pressureKPa:pressure,forceCapacity:capacity(),appliedForce:lastApplied,stableSeconds:active&&readySince!==null?clock-readySince:0,lastSupportAge:forBody?clock-(lastSupport.get(forBody)??-100):active?clock-(lastSupport.get(seal.body)??-100):100,breakReason:lastBreak,targetKPa,leak};}
  // Forces are applied once per Havok substep, not once per rendered frame.
  scene.onBeforePhysicsObservable.add(()=>{
    const dt=(scene.getPhysicsEngine().getSubTimeStep()||1000/60)/1000;clock+=dt;
    for(const [b,c] of contacts)if(!mechanics.fruitForBody(b)||clock-c.time>.5)contacts.delete(b);
    if(!arm.servo.valveOn){detach('vented');pressure*=Math.exp(-dt/SUCTION_RULE.ventSeconds);return;}
    if(!seal){const touch=currentContact();if(touch){const [b,c]=touch,fruit=mechanics.fruitForBody(b);fruit.root.computeWorldMatrix(true);pad.root.computeWorldMatrix(true);const inverse=fruit.root.getWorldMatrix().clone().invert();seal={body:b,fruit,quality:c.quality,localPoint:B.Vector3.TransformCoordinates(c.point,inverse),localNormal:B.Vector3.TransformNormal(c.normal,inverse).normalize(),padPoint:B.Vector3.TransformCoordinates(c.point,pad.root.getWorldMatrix().clone().invert())};lastBreak='';}}
    const demand=seal?targetKPa*seal.quality/(1+8*leak):0;pressure+=(demand-pressure)*(1-Math.exp(-dt/SUCTION_RULE.pumpSeconds));
    if(!seal){readySince=null;return;}if(!mechanics.fruitForBody(seal.body)){detach('removed');return;}
    const point=worldPoint(),target=targetPoint(),gap=target.subtract(point),normal=B.Vector3.TransformNormal(seal.localNormal,seal.fruit.root.getWorldMatrix()).normalize();
    pad.stretch=Math.max(0,Math.min(.08,gap.y));
    if(gap.length()>SUCTION_RULE.maxGap||normal.y<SUCTION_RULE.minNormalY){detach(gap.length()>SUCTION_RULE.maxGap?'gap':'tilt');pressure=0;return;}
    const lever=point.subtract(seal.body.getObjectCenterWorld()),velocity=seal.body.getLinearVelocity().add(B.Vector3.Cross(seal.body.getAngularVelocity(),lever)),padLever=target.subtract(pad.root.position),targetVelocity=body.getLinearVelocity().add(B.Vector3.Cross(body.getAngularVelocity(),padLever));
    const force=gap.scale(SUCTION_RULE.spring).add(targetVelocity.subtract(velocity).scale(SUCTION_RULE.damping)),limit=capacity();force.y=Math.max(0,Math.min(limit,force.y));const shear=Math.hypot(force.x,force.z),maxShear=limit*SUCTION_RULE.shearRatio;if(shear>maxShear){force.x*=maxShear/shear;force.z*=maxShear/shear;}if(force.length()>limit)force.scaleInPlace(limit/force.length());lastApplied=force.length();seal.body.applyImpulse(force.scale(dt),point);body.applyImpulse(force.scale(-dt),target);
    const spin=seal.body.getAngularVelocity(),torque=B.Vector3.Cross(normal,B.Axis.Y).scale(SUCTION_RULE.angularSpring).subtract(new B.Vector3(spin.x,0,spin.z).scale(SUCTION_RULE.angularDamping)),momentLimit=limit*SUCTION_RULE.momentArm;if(torque.length()>momentLimit)torque.scaleInPlace(momentLimit/torque.length());seal.body.applyAngularImpulse(torque.scale(dt));body.applyAngularImpulse(torque.scale(-dt));
    if(pressure>=SUCTION_RULE.holdingKPa)lastSupport.set(seal.body,clock);if(pressure>=SUCTION_RULE.readyKPa){if(readySince===null)readySince=clock;}else readySince=null;
  });
  return {rules:SUCTION_RULE,anchorBody,padBody:body,
    update(dt){const step=Math.max(.008,Math.min(dt,.1));anchorBody.setLinearVelocity(arm.claw.position.subtract(anchor.position).scale(1/step));const a=2*Math.atan2(anchor.rotationQuaternion.y,anchor.rotationQuaternion.w),b=2*Math.atan2(arm.claw.rotationQuaternion.y,arm.claw.rotationQuaternion.w);anchorBody.setAngularVelocity(new B.Vector3(0,Math.atan2(Math.sin(b-a),Math.cos(b-a))/step));},
    configure(settings){if(settings.targetKPa!==undefined)targetKPa=Math.max(0,Math.min(80,settings.targetKPa));if(settings.leak!==undefined)leak=Math.max(0,Math.min(1,settings.leak));},
    support:status,readout:status,
    candidate(){return seal&&readySince!==null&&clock-readySince>=SUCTION_RULE.sealSeconds?{fruit:seal.fruit,body:seal.body,...status(seal.body)}:null;},
    opened(){return !arm.servo.valveOn&&!seal&&pressure<2;},
    reset(){detach('reset');lastBreak='reset';pressure=0;contacts.clear();lastSupport.clear();anchor.position.copyFrom(arm.claw.position);anchor.rotationQuaternion.copyFrom(arm.claw.rotationQuaternion);pad.root.position.copyFrom(pad.targetPosition);pad.root.rotationQuaternion.copyFrom(pad.targetRotation);for(const b of [anchorBody,body]){b.setLinearVelocity(B.Vector3.Zero());b.setAngularVelocity(B.Vector3.Zero());b.setPrestepType(B.PhysicsPrestepType.TELEPORT);}scene.onAfterPhysicsObservable.addOnce(()=>{for(const b of [anchorBody,body])b.setPrestepType(B.PhysicsPrestepType.DISABLED);});},
  };
}
