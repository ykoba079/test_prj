import {ARM,ARM_REST,createArmServo,inverse} from './arm-kinematics.js?v=20261027-havok-grip';
export function createRobotArm(B,scene,metal,accent){
  const servo=createArmServo(),meshes=[];
  function cylinder(name,height,diameter,material){const m=B.MeshBuilder.CreateCylinder(name,{height,diameter,tessellation:24},scene);m.material=material;m.layerMask=3;meshes.push(m);return m;}
  function block(name,w,h,d,material){const m=B.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);m.material=material;m.layerMask=3;meshes.push(m);return m;}
  const pedestal=cylinder('robot-pedestal',.72,.44,metal);pedestal.position.set(3,.54,2.1);
  const links=ARM.lengths.map((length,i)=>block('robot-rigid-link-'+i,i?.24:.3,length,i?.26:.32,accent));
  const joints=Array.from({length:3},(_,i)=>cylinder('robot-joint-'+i,i===1?.38:.32,i===1?.43:.36,metal));
  const shaft=cylinder('robot-wrist-tool',ARM.toolOffset,.13,metal),claw=new B.TransformNode('tool-tcp',scene);
  const palm=block('gripper',.64,.10,.64,metal),rails=[block('gripper-cross-x',1.70,.07,.12,accent),block('gripper-cross-z',.12,.07,1.70,accent)];
  const rubber=new B.StandardMaterial('gripper-rubber',scene);rubber.diffuseColor=B.Color3.FromHexString('#354b50');rubber.specularColor=new B.Color3(.04,.04,.04);
  const fingers=Array.from({length:4},(_,index)=>{
    const angle=index*Math.PI/2,root=new B.TransformNode('finger-body-'+index,scene),mesh=block('robot-finger-'+index,.10,.58,.30,rubber),tip=block('robot-finger-tip-'+index,.24,.07,.30,rubber);
    mesh.parent=root;tip.parent=root;tip.position.set(-.07,-.29,0);
    return {index,angle,root,mesh,tip,targetPosition:new B.Vector3(),targetRotation:B.Quaternion.Identity(),body:null};
  });
  const vec=p=>new B.Vector3(p.x,p.y,p.z);
  function render(){const p=servo.pose,ends=[[p.base,p.elbow],[p.elbow,p.wrist]];
    const [yaw,shoulder,bend]=servo.joints;
    links.forEach((mesh,i)=>{const a=vec(ends[i][0]),b=vec(ends[i][1]),pitch=i?shoulder-bend:shoulder;mesh.position.copyFrom(B.Vector3.Center(a,b));mesh.rotationQuaternion=B.Quaternion.RotationAxis(B.Axis.Y,-yaw).multiply(B.Quaternion.RotationAxis(B.Axis.X,pitch-Math.PI/2));});
    const axis=new B.Vector3(Math.cos(yaw),0,Math.sin(yaw));
    [p.base,p.elbow,p.wrist].forEach((pos,i)=>{joints[i].position.copyFrom(vec(pos));joints[i].rotationQuaternion=B.Quaternion.FromUnitVectorsToRef(B.Axis.Y,axis,new B.Quaternion());});
    claw.position.copyFrom(vec(p.tcp));claw.rotationQuaternion=B.Quaternion.RotationAxis(B.Axis.Y,-yaw);
    palm.position.copyFrom(claw.position);palm.position.y+=.10;palm.rotation.y=-yaw;
    for(const rail of rails){rail.position.copyFrom(claw.position);rail.position.y+=.015;rail.rotation.y=-yaw;}
    shaft.position.copyFrom(vec(p.tcp));shaft.position.y+=ARM.toolOffset/2;
    for(const f of fingers){f.targetPosition.set(p.tcp.x+Math.cos(yaw+f.angle)*servo.jaw/2,p.tcp.y-.32,p.tcp.z+Math.sin(yaw+f.angle)*servo.jaw/2);f.targetRotation.copyFrom(B.Quaternion.RotationAxis(B.Axis.Y,-yaw-f.angle));if(!f.body){f.root.position.copyFrom(f.targetPosition);f.root.rotationQuaternion=f.targetRotation.clone();}}
  }
  render();
  return {meshes,links,claw,fingers,servo,canReach:target=>inverse(target).reachable,
    command:target=>servo.command(target),grip:closed=>servo.grip(closed),near:(target,tolerance)=>servo.near(target,tolerance),estimate:target=>servo.estimate(target),
    step(dt){for(let left=dt;left>1e-6;left-=.02)servo.step(Math.min(left,.02));render();},reset(target=ARM_REST){servo.reset(target);render();},
  };
}
