// Equipment dimensions only. No simulated fruit state is used for calibration.
export const ROLLER_PITCHES=[.31,.40,.45];
export const ROLLER_DIAMETERS=[.20,.25,.30,.35,.40];
export function compatiblePitch(pitch,diameter){return ROLLER_PITCHES.find(p=>p>=Math.max(pitch,diameter+.01)-1e-8)??.45;}
export function rollerPositions(pitch){
  if(!ROLLER_PITCHES.includes(pitch))throw new Error('Unsupported roller pitch');
  const positions=[];for(let i=0;-6.8+i*pitch<7.2;i++)positions.push(-6.8+i*pitch);return positions;
}
function restingHeight(gap,diameter=.30){
  // Ellipsoid (.39 x .3276) resting between two cylinders.
  const radius=diameter/2;
  let height=0;
  for(let i=0;i<=600;i++){
    const u=-radius+diameter*i/600,q=(u-gap/2)/.39;
    if(Math.abs(q)<=1)height=Math.max(height,Math.sqrt(Math.max(0,radius**2-u*u))+.3276*Math.sqrt(1-q*q));
  }
  return height-.13;
}
const baseline=restingHeight(.31);
export function supportCalibration(pitch,removed=false,diameter=.30){
  const xs=rollerPositions(pitch);let index=0;
  const supports=xs.filter(x=>x< -2||x>2.2||!removed||index++%2!==0);
  // Pocket height at the middle of each pair; interpolate to avoid calibration jumps.
  const knots=supports.slice(1).map((x,i)=>({x:(x+supports[i])/2,y:.35+restingHeight(x-supports[i],diameter)-baseline}));
  return {pitch,removed,diameter,knots,heightAt(x){
    if(x<=knots[0].x)return knots[0].y;
    for(let i=1;i<knots.length;i++)if(x<=knots[i].x){const a=knots[i-1],b=knots[i],t=(x-a.x)/(b.x-a.x);return a.y+(b.y-a.y)*t;}
    return knots.at(-1).y;
  }};
}
