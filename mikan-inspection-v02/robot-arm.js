import {ARM,ARM_REST,createArmServo,inverse} from './arm-kinematics.js?v=20261026-fixed-arm-2';
export function createRobotArm(B,scene,metal,accent){
  const servo=createArmServo(),meshes=[];
  function cylinder(name,height,diameter,material){const m=B.MeshBuilder.CreateCylinder(name,{height,diameter,tessellation:24},scene);m.material=material;m.layerMask=3;meshes.push(m);return m;}
  function block(name,w,h,d,material){const m=B.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);m.material=material;m.layerMask=3;meshes.push(m);return m;}
  const pedestal=cylinder('robot-pedestal',.72,.44,metal);pedestal.position.set(3,.54,2.1);
  const links=ARM.lengths.map((length,i)=>block('robot-rigid-link-'+i,i?.24:.3,length,i?.26:.32,accent));
  const joints=Array.from({length:3},(_,i)=>cylinder('robot-joint-'+i,i===1?.38:.32,i===1?.43:.36,metal));
  const shaft=cylinder('robot-wrist-tool',ARM.toolOffset,.13,metal),claw=block('gripper',.5,.12,.25,metal);
  const fingers=[-1,1].map(sign=>({sign,mesh:block('robot-finger-'+sign,.1,.34,.18,metal)}));
  const vec=p=>new B.Vector3(p.x,p.y,p.z);
  function render(){const p=servo.pose,ends=[[p.base,p.elbow],[p.elbow,p.wrist]];
    const [yaw,shoulder,bend]=servo.joints;
    links.forEach((mesh,i)=>{const a=vec(ends[i][0]),b=vec(ends[i][1]),pitch=i?shoulder-bend:shoulder;mesh.position.copyFrom(B.Vector3.Center(a,b));mesh.rotationQuaternion=B.Quaternion.RotationAxis(B.Axis.Y,-yaw).multiply(B.Quaternion.RotationAxis(B.Axis.X,pitch-Math.PI/2));});
    const axis=new B.Vector3(Math.cos(yaw),0,Math.sin(yaw));
    [p.base,p.elbow,p.wrist].forEach((pos,i)=>{joints[i].position.copyFrom(vec(pos));joints[i].rotationQuaternion=B.Quaternion.FromUnitVectorsToRef(B.Axis.Y,axis,new B.Quaternion());});
    claw.position.copyFrom(vec(p.tcp));claw.rotation.y=-yaw;
    shaft.position.copyFrom(vec(p.tcp));shaft.position.y+=ARM.toolOffset/2;
    for(const {mesh,sign} of fingers){mesh.position.set(p.tcp.x+Math.cos(yaw)*sign*servo.jaw/2,p.tcp.y-.22,p.tcp.z+Math.sin(yaw)*sign*servo.jaw/2);mesh.rotation.y=-yaw;}
  }
  render();
  return {meshes,links,claw,servo,canReach:target=>inverse(target).reachable,
    command:target=>servo.command(target),grip:closed=>servo.grip(closed),near:(target,tolerance)=>servo.near(target,tolerance),estimate:target=>servo.estimate(target),
    step(dt){servo.step(dt);render();},reset(){servo.reset(ARM_REST);render();},
  };
}
