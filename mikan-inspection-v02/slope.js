export const SLOPE_ANGLES=[0,2,5],SLOPE_PIVOT_X=2.3;
export function createSlopeGeometry(degrees=0){
  if(!SLOPE_ANGLES.includes(degrees))throw new Error('Unsupported conveyor slope');
  const angle=degrees*Math.PI/180,sin=Math.sin(angle),cos=Math.cos(angle);
  return {degrees,angle,sin,cos,pivotX:SLOPE_PIVOT_X,
    point:({x,y,z=0})=>({x:SLOPE_PIVOT_X+(x-SLOPE_PIVOT_X)*cos+y*sin,y:-(x-SLOPE_PIVOT_X)*sin+y*cos,z}),
    heightAt:(x,localHeight=.35)=>(localHeight-(x-SLOPE_PIVOT_X)*sin)/cos,
    plane:{x:sin,y:cos,z:0,d:-SLOPE_PIVOT_X*sin-.35}
  };
}
