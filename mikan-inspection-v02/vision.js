// Detector interface: detect(ImageData) -> [{x0,y0,x1,y1,defects: string[]}].
// No simulation label or 3D mesh is passed into image analysis.
export function detectColor(image) {
  const {data,width:w,height:h}=image,mask=new Uint8Array(w*h),seen=new Uint8Array(w*h),out=[];
  for(let i=0;i<mask.length;i++){const r=data[i*4],g=data[i*4+1],b=data[i*4+2];mask[i]=r>135&&r>g*1.25&&g>45&&g>b*1.5?1:0;}
  for(let i=0;i<mask.length;i++){
    if(!mask[i]||seen[i])continue;
    const stack=[i];seen[i]=1;let x0=w,y0=h,x1=0,y1=0,count=0;
    while(stack.length){const p=stack.pop(),x=p%w,y=Math.floor(p/w);count++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
      for(const n of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])if(n>=0&&mask[n]&&!seen[n]){seen[n]=1;stack.push(n);}}
    if(count<180||x1-x0<18||y1-y0<18)continue;
    let mold=0,damage=0;const cx=(x0+x1)/2,cy=(y0+y1)/2,rx=(x1-x0)/2,ry=(y1-y0)/2;
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      if(((x-cx)/rx)**2+((y-cy)/ry)**2>.86)continue;
      const p=(y*w+x)*4,r=data[p],g=data[p+1],b=data[p+2];
      if(g>r*1.2&&g>b*1.12&&g>38)mold++;
      if(r>g*1.3&&r<130&&g<85&&b<70)damage++;
    }
    const defects=[];if(mold>26)defects.push('mold');if(damage>26)defects.push('damage');
    out.push({x0,y0,x1,y1,defects});
  }
  return out;
}
export const colorDetector={name:'color-demo',detect:detectColor};
