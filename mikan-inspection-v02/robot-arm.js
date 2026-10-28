import {ARM,ARM_REST,createArmServo,inverse} from './arm-kinematics.js?v=20261029-observed';
export function createRobotArm(B,scene,metal,accent){
  const servo=createArmServo(),meshes=[];
  function cylinder(name,height,diameter,material){const m=B.MeshBuilder.CreateCylinder(name,{height,diameter,tessellation:24},scene);m.material=material;m.layerMask=3;meshes.push(m);return m;}
  function block(name,w,h,d,material){const m=B.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);m.material=material;m.layerMask=3;meshes.push(m);return m;}
  const pedestal=cylinder('robot-pedestal',.72,.44,metal);pedestal.position.set(3,.54,2.1);
  const links=ARM.lengths.map((length,i)=>block('robot-rigid-link-'+i,i?.24:.3,length,i?.26:.32,accent));
  const joints=Array.from({length:3},(_,i)=>cylinder('robot-joint-'+i,i===1?.38:.32,i===1?.43:.36,metal));
  const shaft=cylinder('robot-wrist-tool',ARM.toolOffset,.13,metal),claw=new B.TransformNode('tool-tcp',scene);
  const mount=cylinder('vacuum-mount',.12,.16,metal),rubber=new B.StandardMaterial('suction-silicone',scene);rubber.diffuseColor=B.Color3.FromHexString('#59aeb8');rubber.specularColor=new B.Color3(.12,.15,.15);
  const root=new B.TransformNode('suction-pad-body',scene),bellows=B.MeshBuilder.CreateCylinder('suction-bellows',{height:.10,diameterTop:.12,diameterBottom:.34,tessellation:32},scene);bellows.material=rubber;bellows.layerMask=3;bellows.parent=root;bellows.position.y=.05;meshes.push(bellows);
  const lip=B.MeshBuilder.CreateTorus('suction-lip',{diameter:.31,thickness:.025,tessellation:32},scene);lip.material=rubber;lip.layerMask=3;lip.parent=root;lip.position.y=-.005;meshes.push(lip);
  const hoseMaterial=new B.StandardMaterial('air-hose',scene);hoseMaterial.diffuseColor=B.Color3.FromHexString('#4f91b0');
  const hose=B.MeshBuilder.CreateTube('vacuum-hose',{path:[new B.Vector3(.13,.34,0),new B.Vector3(.17,.19,0),new B.Vector3(.12,.08,0),new B.Vector3(0,.025,0)],radius:.025,tessellation:12},scene);hose.material=hoseMaterial;hose.layerMask=3;hose.parent=claw;meshes.push(hose);
  const suction={root,bellows,lip,targetPosition:new B.Vector3(),targetRotation:B.Quaternion.Identity(),body:null};
  const vec=p=>new B.Vector3(p.x,p.y,p.z);
  function render(){const p=servo.pose,ends=[[p.base,p.elbow],[p.elbow,p.wrist]];
    const [yaw,shoulder,bend]=servo.joints;
    links.forEach((mesh,i)=>{const a=vec(ends[i][0]),b=vec(ends[i][1]),pitch=i?shoulder-bend:shoulder;mesh.position.copyFrom(B.Vector3.Center(a,b));mesh.rotationQuaternion=B.Quaternion.RotationAxis(B.Axis.Y,-yaw).multiply(B.Quaternion.RotationAxis(B.Axis.X,pitch-Math.PI/2));});
    const axis=new B.Vector3(Math.cos(yaw),0,Math.sin(yaw));
    [p.base,p.elbow,p.wrist].forEach((pos,i)=>{joints[i].position.copyFrom(vec(pos));joints[i].rotationQuaternion=B.Quaternion.FromUnitVectorsToRef(B.Axis.Y,axis,new B.Quaternion());});
    claw.position.copyFrom(vec(p.tcp));claw.rotationQuaternion=B.Quaternion.RotationAxis(B.Axis.Y,-yaw);
    const stretch=suction.stretch||0;bellows.scaling.y=1+stretch/.10;bellows.position.y=.05-stretch/2;lip.position.y=-.005-stretch;
    mount.position.copyFrom(claw.position);mount.position.y+=.025;
    shaft.position.copyFrom(vec(p.tcp));shaft.position.y+=ARM.toolOffset/2;
    suction.targetPosition.set(p.tcp.x,p.tcp.y-.10,p.tcp.z);suction.targetRotation.copyFrom(claw.rotationQuaternion);if(!suction.body){root.position.copyFrom(suction.targetPosition);root.rotationQuaternion=suction.targetRotation.clone();}
  }
  render();
  return {meshes,links,claw,suction,servo,canReach:target=>inverse(target).reachable,
    command:target=>servo.command(target),grip:closed=>servo.grip(closed),near:(target,tolerance)=>servo.near(target,tolerance),estimate:target=>servo.estimate(target),
    step(dt){for(let left=dt;left>1e-6;left-=.01)servo.step(Math.min(left,.01));render();},reset(target=ARM_REST){servo.reset(target);render();},
  };
}
