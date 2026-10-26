const rad=value=>value*Math.PI/180,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const ARM={base:{x:3,y:.9,z:2.1},lengths:[2,1.9],toolOffset:.22,
  limits:[[-160,160],[-20,135],[12,150]].map(([a,b])=>[rad(a),rad(b)]),
  speed:[rad(115),rad(85),rad(115)],acceleration:[rad(250),rad(200),rad(260)]};
export const ARM_REST={x:2.3,y:1.7,z:1};
export const DROP_POINTS={reject:{x:1.7,y:.65,z:3.5},unknown:{x:4.1,y:.65,z:3.5}};
export function forward(joints){
  const [yaw,shoulder,bend]=joints,[upper,forearm]=ARM.lengths,b=ARM.base;
  const point=(r,y)=>({x:b.x+Math.sin(yaw)*r,y:b.y+y,z:b.z-Math.cos(yaw)*r});
  const elbow=point(upper*Math.cos(shoulder),upper*Math.sin(shoulder));
  const wrist=point(upper*Math.cos(shoulder)+forearm*Math.cos(shoulder-bend),upper*Math.sin(shoulder)+forearm*Math.sin(shoulder-bend));
  return {base:{...b},elbow,wrist,tcp:{...wrist,y:wrist.y-ARM.toolOffset}};
}
export function inverse(target){
  const b=ARM.base,[a,c]=ARM.lengths,dx=target.x-b.x,dz=target.z-b.z,y=target.y+ARM.toolOffset-b.y,r=Math.hypot(dx,dz),d=Math.hypot(r,y);
  if(![dx,dz,y].every(Number.isFinite)||d>a+c||d<Math.abs(a-c)||r<.05)return {reachable:false,reason:'到達範囲外'};
  const yaw=Math.atan2(dx,-dz),bend=Math.acos(clamp((d*d-a*a-c*c)/(2*a*c),-1,1));
  const shoulder=Math.atan2(y,r)+Math.atan2(c*Math.sin(bend),a+c*Math.cos(bend));
  const joints=[yaw,shoulder,bend];if(joints.some((v,i)=>v<ARM.limits[i][0]||v>ARM.limits[i][1]))return {reachable:false,reason:'関節可動域外'};
  return {reachable:true,joints};
}
export function createArmServo(initial=ARM_REST){
  const start=inverse(initial);if(!start.reachable)throw new Error('Invalid robot rest pose');
  let joints=[...start.joints],goal=[...joints],velocity=[0,0,0],jaw=1.60,jawGoal=1.60;
  return {get joints(){return [...joints];},get velocity(){return [...velocity];},get jaw(){return jaw;},get pose(){return forward(joints);},
    command(target){const result=inverse(target);if(result.reachable)goal=[...result.joints];return result;},
    grip(closed){jawGoal=closed?.76:1.60;},
    get gripReady(){return Math.abs(jaw-jawGoal)<.005;},
    reset(target=initial){const result=inverse(target);if(!result.reachable)throw new Error('Invalid robot reset pose');joints=[...result.joints];goal=[...joints];velocity=[0,0,0];jaw=jawGoal=1.60;},
    near(target,tolerance=.07){const p=forward(joints).tcp;return Math.hypot(p.x-target.x,p.y-target.y,p.z-target.z)<tolerance&&Math.max(...velocity.map(Math.abs))<.35;},
    estimate(target){
      const result=inverse(target);if(!result.reachable)return Infinity;
      const q=[...joints],v=[...velocity],dt=.02;
      for(let n=0;n<300;n++){
        const p=forward(q).tcp;if(Math.hypot(p.x-target.x,p.y-target.y,p.z-target.z)<.065&&Math.max(...v.map(Math.abs))<.3)return n*dt;
        for(let i=0;i<3;i++){const error=result.joints[i]-q[i],acc=ARM.acceleration[i],wanted=Math.sign(error)*Math.min(ARM.speed[i],Math.sqrt(2*acc*Math.abs(error)),Math.abs(error)*8);v[i]+=clamp(wanted-v[i],-acc*dt,acc*dt);q[i]=clamp(q[i]+v[i]*dt,...ARM.limits[i]);}
      }
      return Infinity;
    },
    step(dt){
      // Acceleration-limited joints; link geometry is never scaled.
      dt=Math.max(0,Math.min(dt,.05));
      for(let i=0;i<3;i++){
        const error=goal[i]-joints[i],limit=ARM.speed[i],acc=ARM.acceleration[i];
        const wanted=Math.sign(error)*Math.min(limit,Math.sqrt(2*acc*Math.abs(error)),Math.abs(error)*8);
        velocity[i]+=clamp(wanted-velocity[i],-acc*dt,acc*dt);
        joints[i]=clamp(joints[i]+velocity[i]*dt,...ARM.limits[i]);
      }
      jaw+=clamp(jawGoal-jaw,-1.3*dt,1.3*dt);
      return forward(joints);
    },
  };
}
