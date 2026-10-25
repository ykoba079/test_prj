// Validate the visible support of a YOLO fruit box, never the simulator's objects.
// This does not classify mold/damage; those labels still come from the selected detector.
export const OBSERVATION_RULE={bodyConfidence:.65,minPeelFraction:.2,contourWidthFraction:.85,contourHeightFraction:.70};
export function checkFruitObservation(image,box,expectedDiameter=62.4){
  const w=box.x1-box.x0,h=box.y1-box.y0;
  if(Number.isFinite(box.score)&&box.score<OBSERVATION_RULE.bodyConfidence)return {valid:false,reason:'weak-fruit-box'};
  if(w<expectedDiameter*.75||h<expectedDiameter*.65||w>expectedDiameter*1.25||h>expectedDiameter*1.25||w/h<.7||w/h>1.4)return {valid:false,reason:'implausible-size-or-shape'};
  const cx=(box.x0+box.x1)/2,cy=(box.y0+box.y1)/2;let samples=0,peel=0,minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(let y=Math.max(0,Math.ceil(box.y0));y<Math.min(image.height,box.y1);y+=2)for(let x=Math.max(0,Math.ceil(box.x0));x<Math.min(image.width,box.x1);x+=2){
    if(((x-cx)/(w/2))**2+((y-cy)/(h/2))**2>.9)continue;samples++;
    const p=(y*image.width+x)*4,r=image.data[p],g=image.data[p+1],b=image.data[p+2];
    const orange=r>125&&g>40&&r>g*1.18&&g>b*1.4;if(orange)peel++;if(orange||g>r*1.4&&b>r*1.4&&g>85&&b>90){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  }
  const peelFraction=peel/Math.max(1,samples),complete=maxX-minX>expectedDiameter*OBSERVATION_RULE.contourWidthFraction&&maxY-minY>expectedDiameter*OBSERVATION_RULE.contourHeightFraction,center=complete?{x:(minX+maxX)/2,y:(minY+maxY)/2}:null;
  return {valid:peelFraction>=OBSERVATION_RULE.minPeelFraction,reason:peelFraction>=OBSERVATION_RULE.minPeelFraction?null:'no-visible-peel',peelFraction,center,complete};
}
