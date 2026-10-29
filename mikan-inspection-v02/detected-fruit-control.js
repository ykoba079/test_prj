// Detection authorizes an individual. Its simulator pose may then guide the robot.
export const DETECTED_PICK={cupOffset:.1175,indent:.012,maxIndent:.025,hoverClearance:.55,followLead:.14,timeout:6};
export function matchDetectedFruits(detections,candidates){
  const matches=[];
  for(const d of detections){
    if(!Number.isFinite(d.score)||d.score<.65)continue;
    const options=candidates.map(candidate=>{
      const b=candidate.bounds,cx=(b.x0+b.x1)/2,cy=(b.y0+b.y1)/2;
      const area=Math.max(0,Math.min(b.x1,d.x1)-Math.max(b.x0,d.x0))*Math.max(0,Math.min(b.y1,d.y1)-Math.max(b.y0,d.y0));
      const union=(b.x1-b.x0)*(b.y1-b.y0)+(d.x1-d.x0)*(d.y1-d.y0)-area;
      const patches=(d.defectBoxes||[]).filter(p=>((p.x0+p.x1)/2-cx)**2/((b.x1-b.x0)/2)**2+((p.y0+p.y1)/2-cy)**2/((b.y1-b.y0)/2)**2<=1.25);
      return {candidate,iou:area/Math.max(1,union),inside:cx>=d.x0&&cx<=d.x1&&cy>=d.y0&&cy<=d.y1,patches};
    }).filter(c=>c.inside&&c.iou>=.12).sort((a,b)=>b.iou-a.iou);
    const withDefect=options.filter(c=>c.patches.length),pool=withDefect.length?withDefect:options;
    if(!pool.length||pool[1]&&pool[0].iou-pool[1].iou<.12)continue;
    const best=pool[0],defects=d.defectBoxes?Array.from(new Set(best.patches.map(p=>p.kind))):[...(d.defects||[])];
    matches.push({candidate:best.candidate,defects,score:d.score,patches:best.patches});
  }
  return matches;
}
// Highest point on the rotating collision ellipsoid, including its lateral offset.
export function fruitSurface(B,fruit,lead=0){
  const rotation=new B.Matrix();(fruit.root.rotationQuaternion||B.Quaternion.Identity()).toRotationMatrix(rotation);
  const x=B.Vector3.TransformNormal(B.Axis.X,rotation),y=B.Vector3.TransformNormal(B.Axis.Y,rotation),z=B.Vector3.TransformNormal(B.Axis.Z,rotation);
  const a2=.39**2,b2=(.39*.84)**2,s=x.scale(a2*x.y).add(y.scale(b2*y.y)).add(z.scale(a2*z.y));
  const offset=s.scale(1/Math.sqrt(s.y)),velocity=fruit.body?.getLinearVelocity()||B.Vector3.Zero();
  return fruit.root.position.add(offset).add(velocity.scale(lead));
}
