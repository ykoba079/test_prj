import {createRobotArm} from '../mikan-inspection-v02/robot-arm.js?v=20261108-standard-bins';
import {ARM_REST,DROP_POINTS} from '../mikan-inspection-v02/arm-kinematics.js?v=20261108-standard-bins';

// Rotate the second station 180 degrees about x=3, z=0. IK remains in each
// robot's original local frame; all planner/gripper coordinates are world space.
export function createPlacedRobotArm(B,scene,metal,paint,details,id){
  const mirrored=id==='B',rotation=B.Quaternion.RotationAxis(B.Axis.Y,mirrored?Math.PI:0);
  const frame=new B.TransformNode('robot-'+id+'-frame',scene);frame.rotationQuaternion=rotation;frame.position.x=mirrored?6:0;
  const raw=createRobotArm(B,scene,metal,paint,details),claw=new B.TransformNode('robot-'+id+'-world-tcp',scene);
  const transform=p=>new B.Vector3(mirrored?6-p.x:p.x,p.y,mirrored?-p.z:p.z);
  const rest=transform(ARM_REST),dropPoints=Object.fromEntries(Object.entries(DROP_POINTS).map(([k,p])=>{const q=transform(p);return [k,{x:q.x,y:q.y,z:q.z}];}));
  function sync(){
    for(const mesh of raw.meshes){if(!mesh.parent)mesh.parent=frame;if(mesh.metadata?.armId!==id)mesh.metadata={...mesh.metadata,armId:id};}
    claw.position.copyFrom(transform(raw.claw.position));claw.rotationQuaternion=rotation.multiply(raw.claw.rotationQuaternion);
    raw.suction.targetPosition.copyFrom(transform(raw.suction.targetPosition));raw.suction.targetRotation.copyFrom(rotation.multiply(raw.suction.targetRotation));
    if(!raw.suction.body){raw.suction.root.position.copyFrom(raw.suction.targetPosition);raw.suction.root.rotationQuaternion.copyFrom(raw.suction.targetRotation);}
  }
  sync();
  return {id,frame,rest,dropPoints,claw,suction:raw.suction,
    get meshes(){return raw.meshes;},get links(){return raw.links;},get model(){return raw.model;},get servo(){return raw.servo;},get config(){const b=transform(raw.config.base);return {...raw.config,base:{x:b.x,y:b.y,z:b.z}};},
    command:target=>raw.command(transform(target)),canReach:target=>raw.canReach(transform(target)),estimate:target=>raw.estimate(transform(target)),near:(target,tolerance)=>raw.near(transform(target),tolerance),grip:value=>raw.grip(value),
    step(dt){raw.step(dt);sync();},reset(target=rest){raw.reset(transform(target));sync();},setModel(value){raw.setModel(value);sync();},
  };
}
