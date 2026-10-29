// Validate the visible support of a YOLO fruit box, never the simulator's objects.
// This does not classify mold/damage; those labels still come from the selected detector.
export const OBSERVATION_RULE={bodyConfidence:.65,minPeelFraction:.2,contourWidthFraction:.85,contourHeightFraction:.70};
function checkBox(image,box,expectedDiameter){
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
// Recover a complete silhouette inside an oversized YOLO box. No scene objects or labels are consulted.
export function checkFruitObservation(image,box,expectedDiameter=62.4,{refine=false}={}){
  const original=checkBox(image,box,expectedDiameter);
  if(!refine||original.valid&&original.complete||box.score<OBSERVATION_RULE.bodyConfidence)return original;
  const e=expectedDiameter,w=box.x1-box.x0,h=box.y1-box.y0;
  if(!Number.isFinite(e)||e<=0||w<e*.7||h<e*.65||w>e*2.8||h>e*2.8)return original;
  const step=2,x0=Math.max(0,Math.ceil(box.x0)),y0=Math.max(0,Math.ceil(box.y0)),cols=Math.max(0,Math.ceil((Math.min(image.width,box.x1)-x0)/step)),rows=Math.max(0,Math.ceil((Math.min(image.height,box.y1)-y0)/step));
  const mask=new Uint8Array(cols*rows),orange=new Uint8Array(mask.length);
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
    const p=((y0+y*step)*image.width+x0+x*step)*4,r=image.data[p],g=image.data[p+1],b=image.data[p+2],i=y*cols+x;
    orange[i]=r>125&&g>40&&r>g*1.18&&g>b*1.4?1:0;
    mask[i]=orange[i]||g>r*1.4&&b>r*1.4&&g>85&&b>90?1:0;
  }
  const candidates=[];
  for(let start=0;start<mask.length;start++){
    if(!mask[start])continue;const stack=[start];mask[start]=0;let minX=cols,maxX=0,minY=rows,maxY=0,count=0,peel=0;
    while(stack.length){const i=stack.pop(),x=i%cols,y=Math.floor(i/cols);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);count++;peel+=orange[i];
      for(const n of [x>0?i-1:-1,x+1<cols?i+1:-1,y>0?i-cols:-1,y+1<rows?i+cols:-1])if(n>=0&&mask[n]){mask[n]=0;stack.push(n);}
    }
    const bw=(maxX-minX)*step,bh=(maxY-minY)*step;
    if(bw<e*.85||bh<e*.70||bw>e*1.25||bh>e*1.25||bw/bh<.7||bw/bh>1.4||count*step*step<e*e*.38||peel*step*step<e*e*.16)continue;
    const bounds={x0:x0+minX*step,y0:y0+minY*step,x1:x0+maxX*step,y1:y0+maxY*step};
    if(bounds.x0<2||bounds.y0<2||bounds.x1>=image.width-2||bounds.y1>=image.height-2)continue;
    candidates.push({valid:true,complete:true,refined:true,reason:null,bounds,center:{x:(bounds.x0+bounds.x1)/2,y:(bounds.y0+bounds.y1)/2},peelFraction:peel/count});
  }
  return candidates.length===1?candidates[0]:candidates.length>1?{valid:false,reason:'ambiguous-contours'}:original;
}
