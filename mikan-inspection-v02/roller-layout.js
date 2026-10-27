// Equipment dimensions only. No simulated fruit state is used for calibration.
export const ROLLER_PITCHES=[.31,.40,.45];
export function rollerPositions(pitch){
  if(!ROLLER_PITCHES.includes(pitch))throw new Error('Unsupported roller pitch');
  const positions=[];for(let i=0;-6.8+i*pitch<7.2;i++)positions.push(-6.8+i*pitch);return positions;
}
function restingHeight(gap){
  // Ellipsoid (.39 x .3276) resting between two radius-.15 cylinders.
  let height=0;
  for(let i=0;i<=600;i++){
    const u=-.15+.30*i/600,q=(u-gap/2)/.39;
    if(Math.abs(q)<=1)height=Math.max(height,Math.sqrt(Math.max(0,.15**2-u*u))+.3276*Math.sqrt(1-q*q));
  }
  return height-.13;
}
const baseline=restingHeight(.31);
export function supportCalibration(pitch,removed=false){
  const xs=rollerPositions(pitch);let index=0;
  const supports=xs.filter(x=>x< -2||x>2.2||!removed||index++%2!==0);
  // Pocket height at the middle of each pair; interpolate to avoid calibration jumps.
  const knots=supports.slice(1).map((x,i)=>({x:(x+supports[i])/2,y:.35+restingHeight(x-supports[i])-baseline}));
  return {pitch,removed,knots,heightAt(x){
    if(x<=knots[0].x)return knots[0].y;
    for(let i=1;i<knots.length;i++)if(x<=knots[i].x){const a=knots[i-1],b=knots[i],t=(x-a.x)/(b.x-a.x);return a.y+(b.y-a.y)*t;}
    return knots.at(-1).y;
  }};
}
