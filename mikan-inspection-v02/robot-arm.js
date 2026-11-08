import {ARM,ARM_MODELS,ARM_REST,createArmServo,inverseForModel} from './arm-kinematics.js?v=20261107-clearance';
export function createRobotArm(B,scene,metal,accent,details=null){
  let model='two',config=ARM_MODELS.two,servo=createArmServo(),links=[],joints=[];const meshes=[];
  function cylinder(name,height,diameter,material){const m=B.MeshBuilder.CreateCylinder(name,{height,diameter,tessellation:24},scene);m.material=material;m.layerMask=3;meshes.push(m);return m;}
  function block(name,w,h,d,material){const m=B.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);m.material=material;m.layerMask=3;meshes.push(m);return m;}
  const pedestal=cylinder('robot-pedestal',.72,.44,metal);pedestal.position.set(3,.54,2.1);
  function buildChain(){
    links=config.lengths.map((length,i)=>block('robot-rigid-link-'+i,i?.24:.3,length,i?.26:.32,accent));
    joints=Array.from({length:config.lengths.length+1},(_,i)=>cylinder('robot-joint-'+i,i===1?.38:.32,i===1?.43:.36,metal));
    if(details){links.forEach((link,i)=>meshes.push(...details.armLink(link,config.lengths[i],i)));joints.forEach((joint,i)=>meshes.push(...details.armJoint(joint,i)));}
  }
  buildChain();
  const shaft=cylinder('robot-wrist-tool',ARM.toolOffset,.13,metal),claw=new B.TransformNode('tool-tcp',scene);
  const mount=cylinder('vacuum-mount',.12,.16,metal),rubber=new B.StandardMaterial('suction-silicone',scene);rubber.diffuseColor=B.Color3.FromHexString('#59aeb8');rubber.specularColor=new B.Color3(.12,.15,.15);
  const root=new B.TransformNode('suction-pad-body',scene),bellows=B.MeshBuilder.CreateCylinder('suction-bellows',{height:.10,diameterTop:.12,diameterBottom:.34,tessellation:32},scene);bellows.material=rubber;bellows.layerMask=3;bellows.parent=root;bellows.position.y=.05;meshes.push(bellows);
  const lip=B.MeshBuilder.CreateTorus('suction-lip',{diameter:.31,thickness:.025,tessellation:32},scene);lip.material=rubber;lip.layerMask=3;lip.parent=root;lip.position.y=-.005;meshes.push(lip);
  const hoseMaterial=new B.StandardMaterial('air-hose',scene);hoseMaterial.diffuseColor=B.Color3.FromHexString('#4f91b0');
  const airInlet=block('vacuum-air-inlet',.16,.22,.14,hoseMaterial);airInlet.position.set(3.32,.47,2.35);
  let airPath=Array.from({length:64},(_,i)=>new B.Vector3(3.32,.58+i*.001,2.35));
  const hose=B.MeshBuilder.CreateTube('vacuum-hose',{path:airPath,radius:.025,tessellation:8,updatable:true},scene);hose.material=hoseMaterial;hose.layerMask=3;meshes.push(hose);
  const suction={root,bellows,lip,targetPosition:new B.Vector3(),targetRotation:B.Quaternion.Identity(),body:null};
  const vec=p=>new B.Vector3(p.x,p.y,p.z);
  function updateAirRoute(p,yaw){
    const side=new B.Vector3(Math.cos(yaw),0,Math.sin(yaw)),controls=[new B.Vector3(3.32,.58,2.35),new B.Vector3(3.42,.72,2.35),vec(p.base).add(side.scale(.44))];
    for(const point of p.points.slice(1))controls.push(vec(point).add(side.scale(.36)));
    controls.push(vec(p.wrist).add(side.scale(.28)).add(new B.Vector3(0,-.08,0)),vec(p.tcp).add(side.scale(.20)).add(new B.Vector3(0,.12,0)),vec(p.tcp).add(new B.Vector3(0,.025,0)));
    // Fixed sample count lets the same updatable tube follow either arm model.
    airPath=Array.from({length:64},(_,i)=>{const f=i/63*(controls.length-1),j=Math.min(controls.length-2,Math.floor(f)),t=f-j,a=controls[Math.max(0,j-1)],b=controls[j],c=controls[j+1],d=controls[Math.min(controls.length-1,j+2)];return new B.Vector3(...['x','y','z'].map(k=>.5*((2*b[k])+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t*t+(-a[k]+3*b[k]-3*c[k]+d[k])*t*t*t)));});
    B.MeshBuilder.CreateTube('vacuum-hose',{path:airPath,instance:hose},scene);
  }
  function render(){const p=servo.pose,ends=links.map((_,i)=>[p.points[i],p.points[i+1]]);
    const yaw=servo.joints[0];
    links.forEach((mesh,i)=>{const a=vec(ends[i][0]),b=vec(ends[i][1]),pitch=p.pitches[i];mesh.position.copyFrom(B.Vector3.Center(a,b));mesh.rotationQuaternion=B.Quaternion.RotationAxis(B.Axis.Y,-yaw).multiply(B.Quaternion.RotationAxis(B.Axis.X,pitch-Math.PI/2));});
    const axis=new B.Vector3(Math.cos(yaw),0,Math.sin(yaw));
    p.points.forEach((pos,i)=>{joints[i].position.copyFrom(vec(pos));joints[i].rotationQuaternion=B.Quaternion.FromUnitVectorsToRef(B.Axis.Y,axis,new B.Quaternion());});
    claw.position.copyFrom(vec(p.tcp));claw.rotationQuaternion=B.Quaternion.RotationAxis(B.Axis.Y,-yaw);
    const stretch=suction.stretch||0;bellows.scaling.y=1+stretch/.10;bellows.position.y=.05-stretch/2;lip.position.y=-.005-stretch;
    mount.position.copyFrom(claw.position);mount.position.y+=.025;
    shaft.position.copyFrom(vec(p.tcp));shaft.position.y+=ARM.toolOffset/2;
    updateAirRoute(p,yaw);
    suction.targetPosition.set(p.tcp.x,p.tcp.y-.10,p.tcp.z);suction.targetRotation.copyFrom(claw.rotationQuaternion);if(!suction.body){root.position.copyFrom(suction.targetPosition);root.rotationQuaternion=suction.targetRotation.clone();}
  }
  render();
  return {meshes,get links(){return links;},get airPath(){return airPath;},claw,suction,get servo(){return servo;},get model(){return model;},get config(){return config;},canReach:target=>inverseForModel(target,model).reachable,
    setModel(value){if(!ARM_MODELS[value])throw new Error('Unknown arm model');if(value===model)return;for(const mesh of [...links,...joints])mesh.dispose();for(let i=meshes.length-1;i>=0;i--)if(meshes[i].isDisposed())meshes.splice(i,1);const scale=servo.motionScale;model=value;config=ARM_MODELS[model];servo=createArmServo(ARM_REST,scale,model);buildChain();render();},
    command:target=>servo.command(target),grip:closed=>servo.grip(closed),near:(target,tolerance)=>servo.near(target,tolerance),estimate:target=>servo.estimate(target),
    step(dt){for(let left=dt;left>1e-6;left-=.01)servo.step(Math.min(left,.01));render();},reset(target=ARM_REST){servo.reset(target);render();},
  };
}
