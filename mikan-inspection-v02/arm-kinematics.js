const rad=value=>value*Math.PI/180,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const ARM={motionScale:2,base:{x:3,y:.9,z:2.1},lengths:[2,1.9],toolOffset:.22,
  limits:[[-170,170],[-35,150],[8,165]].map(([a,b])=>[rad(a),rad(b)]),
  speed:[rad(230),rad(170),rad(230)],acceleration:[rad(1000),rad(800),rad(1040)]};
export const ARM_REST={x:2.3,y:1.7,z:1};
export const DROP_POINTS={reject:{x:1.7,y:.65,z:3.5},unknown:{x:4.1,y:.65,z:3.5}};
export const ARM_THREE={motionScale:2,base:{...ARM.base},lengths:[1.7,1.4,.8],toolOffset:ARM.toolOffset,
  limits:[[-170,170],[-35,150],[8,165],[-140,140]].map(([a,b])=>[rad(a),rad(b)]),
  speed:[rad(230),rad(170),rad(230),rad(230)],acceleration:[rad(1000),rad(800),rad(1040),rad(1040)]};
export const ARM_MODELS={two:ARM,three:ARM_THREE};
export function forward(joints){
  const [yaw,shoulder,bend]=joints,[upper,forearm]=ARM.lengths,b=ARM.base;
  const point=(r,y)=>({x:b.x+Math.sin(yaw)*r,y:b.y+y,z:b.z-Math.cos(yaw)*r});
  const elbow=point(upper*Math.cos(shoulder),upper*Math.sin(shoulder));
  const wrist=point(upper*Math.cos(shoulder)+forearm*Math.cos(shoulder-bend),upper*Math.sin(shoulder)+forearm*Math.sin(shoulder-bend));
  return {base:{...b},elbow,wrist,points:[{...b},elbow,wrist],pitches:[shoulder,shoulder-bend],tcp:{...wrist,y:wrist.y-ARM.toolOffset}};
}
export function forwardThree(joints){
  const [yaw,shoulder,bend,distal]=joints,b=ARM_THREE.base,pitches=[shoulder,shoulder-bend,shoulder-bend-distal];
  let r=0,y=0;const points=[{...b}];
  ARM_THREE.lengths.forEach((length,i)=>{r+=length*Math.cos(pitches[i]);y+=length*Math.sin(pitches[i]);points.push({x:b.x+Math.sin(yaw)*r,y:b.y+y,z:b.z-Math.cos(yaw)*r});});
  const wrist=points.at(-1);return {base:points[0],elbow:points[1],elbow2:points[2],wrist,points,pitches,tcp:{...wrist,y:wrist.y-ARM_THREE.toolOffset}};
}
export function inverseThree(target,reference=null){
  const b=ARM_THREE.base,[a,c,d]=ARM_THREE.lengths,dx=target.x-b.x,dz=target.z-b.z,y=target.y+ARM_THREE.toolOffset-b.y,r=Math.hypot(dx,dz);
  if(![dx,dz,y].every(Number.isFinite)||Math.hypot(r,y)>a+c+d||r<.05)return {reachable:false,reason:'到達範囲外'};
  const yaw=Math.atan2(dx,-dz),preferred=reference||[yaw,rad(65),rad(105),rad(20)];
  const seedPitch=preferred[1]-preferred[2]-preferred[3],angles=[seedPitch];
  for(let degrees=-160;degrees<=40;degrees+=2)angles.push(rad(degrees));
  let best=null,bestCost=Infinity;
  for(const pitch of angles){
    const wx=r-d*Math.cos(pitch),wy=y-d*Math.sin(pitch),distance=Math.hypot(wx,wy);
    if(wx<.05||distance>a+c||distance<Math.abs(a-c))continue;
    const bend=Math.acos(clamp((distance*distance-a*a-c*c)/(2*a*c),-1,1));
    const shoulder=Math.atan2(wy,wx)+Math.atan2(c*Math.sin(bend),a+c*Math.cos(bend));
    const joints=[yaw,shoulder,bend,shoulder-bend-pitch];
    if(joints.some((q,i)=>q<ARM_THREE.limits[i][0]||q>ARM_THREE.limits[i][1]))continue;
    // Prefer the existing posture and avoid abrupt redundant-joint branch changes.
    const cost=joints.reduce((sum,q,i)=>sum+(q-preferred[i])**2,0)+.02*(pitch-rad(-60))**2;
    if(cost<bestCost){bestCost=cost;best={reachable:true,joints};}
  }
  return best||{reachable:false,reason:'関節可動域外'};
}
export function inverseForModel(target,model='two',reference=null){return model==='three'?inverseThree(target,reference):inverse(target);}
export function inverse(target){
  const b=ARM.base,[a,c]=ARM.lengths,dx=target.x-b.x,dz=target.z-b.z,y=target.y+ARM.toolOffset-b.y,r=Math.hypot(dx,dz),d=Math.hypot(r,y);
  if(![dx,dz,y].every(Number.isFinite)||d>a+c||d<Math.abs(a-c)||r<.05)return {reachable:false,reason:'到達範囲外'};
  const yaw=Math.atan2(dx,-dz),bend=Math.acos(clamp((d*d-a*a-c*c)/(2*a*c),-1,1));
  const shoulder=Math.atan2(y,r)+Math.atan2(c*Math.sin(bend),a+c*Math.cos(bend));
  const joints=[yaw,shoulder,bend];if(joints.some((v,i)=>v<ARM.limits[i][0]||v>ARM.limits[i][1]))return {reachable:false,reason:'関節可動域外'};
  return {reachable:true,joints};
}
export function createArmServo(initial=ARM_REST,motionScale=ARM.motionScale,model='two'){
  const config=ARM_MODELS[model];if(!config)throw new Error('Unknown arm model');
  const solve=(target,reference=null)=>inverseForModel(target,model,reference),fk=model==='three'?forwardThree:forward;
  let speed,acceleration,gain;
  function setMotionScale(value){if(![1,1.5,2].includes(value))throw new Error('Unsupported arm speed');motionScale=value;const ratio=value/config.motionScale;speed=config.speed.map(v=>v*ratio);acceleration=config.acceleration.map(v=>v*ratio*ratio);gain=8*value;}
  setMotionScale(motionScale);
  const start=solve(initial);if(!start.reachable)throw new Error('Invalid robot rest pose');
  let joints=[...start.joints],goal=[...joints],velocity=joints.map(()=>0),valveOn=false;
  return {model,config,get motionScale(){return motionScale;},setMotionScale,get joints(){return [...joints];},get velocity(){return [...velocity];},get valveOn(){return valveOn;},get pose(){return fk(joints);},
    command(target){const result=solve(target,goal);if(result.reachable)goal=[...result.joints];return result;},
    grip(on){valveOn=!!on;},
    reset(target=initial){const result=solve(target);if(!result.reachable)throw new Error('Invalid robot reset pose');joints=[...result.joints];goal=[...joints];velocity=joints.map(()=>0);valveOn=false;},
    near(target,tolerance=.07){const p=fk(joints).tcp;return Math.hypot(p.x-target.x,p.y-target.y,p.z-target.z)<tolerance&&Math.max(...velocity.map(Math.abs))<.35*motionScale;},
    estimate(target){
      const result=solve(target,goal);if(!result.reachable)return Infinity;
      const q=[...joints],v=[...velocity],dt=.02/motionScale;
      for(let n=0;n<300;n++){
        const p=fk(q).tcp;if(Math.hypot(p.x-target.x,p.y-target.y,p.z-target.z)<.065&&Math.max(...v.map(Math.abs))<.3*motionScale)return n*dt;
        for(let i=0;i<q.length;i++){const error=result.joints[i]-q[i],acc=acceleration[i],wanted=Math.sign(error)*Math.min(speed[i],Math.sqrt(2*acc*Math.abs(error)),Math.abs(error)*gain);v[i]+=clamp(wanted-v[i],-acc*dt,acc*dt);q[i]=clamp(q[i]+v[i]*dt,...config.limits[i]);}
      }
      return Infinity;
    },
    step(dt){
      // Acceleration-limited joints; link geometry is never scaled.
      dt=Math.max(0,Math.min(dt,.05));
      for(let i=0;i<joints.length;i++){
        const error=goal[i]-joints[i],limit=speed[i],acc=acceleration[i];
        const wanted=Math.sign(error)*Math.min(limit,Math.sqrt(2*acc*Math.abs(error)),Math.abs(error)*gain);
        velocity[i]+=clamp(wanted-velocity[i],-acc*dt,acc*dt);
        joints[i]=clamp(joints[i]+velocity[i]*dt,...config.limits[i]);
      }
      return fk(joints);
    },
  };
}
