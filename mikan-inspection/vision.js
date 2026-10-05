export function colorDetect(image) {
  const {data,width:w,height:h}=image, mask=new Uint8Array(w*h), seen=new Uint8Array(w*h), boxes=[];
  for(let i=0;i<mask.length;i++){const r=data[i*4],g=data[i*4+1],b=data[i*4+2];mask[i]=r>100&&r>g*1.22&&g>35&&g>b*1.35?1:0;}
  for(let i=0;i<mask.length;i++){
    if(!mask[i]||seen[i])continue;
    const stack=[i];seen[i]=1;let x0=w,y0=h,x1=0,y1=0,count=0;
    while(stack.length){const p=stack.pop(),x=p%w,y=Math.floor(p/w);count++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
      for(const n of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])if(n>=0&&mask[n]&&!seen[n]){seen[n]=1;stack.push(n);}}
    if(count<100||x1-x0<12||y1-y0<12)continue;
    let mold=0,damage=0;
    const cx=(x0+x1)/2,cy=(y0+y1)/2,rx=(x1-x0)/2,ry=(y1-y0)/2;
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      if(((x-cx)/rx)**2+((y-cy)/ry)**2>0.68)continue;
      const p=(y*w+x)*4,r=data[p],g=data[p+1],b=data[p+2];
      if(g>r*1.12&&g>b*1.08&&g>35)mold++;
      if(r>g*1.15&&r<125&&g<85&&b<65)damage++;
    }
    boxes.push({x0,y0,x1,y1,classId:mold>45?1:damage>45?2:0,score:1});
  }
  return boxes;
}
export function decodeYolo(tensor,threshold=.45){
  const dims=tensor.dims,d=tensor.data;
  if(dims.length!==3||dims[0]!==1||!(dims[1]===7||dims[2]===7))throw new Error('対応出力は [1,7,N] または [1,N,7] です（3クラス・NMSなし）');
  const channelFirst=dims[1]===7,n=channelFirst?dims[2]:dims[1],get=(i,c)=>d[channelFirst?c*n+i:i*7+c],out=[];
  for(let i=0;i<n;i++){let cls=0,score=get(i,4);for(let c=1;c<3;c++)if(get(i,c+4)>score){score=get(i,c+4);cls=c;}if(score<threshold)continue;
    const x=get(i,0),y=get(i,1),w=get(i,2),h=get(i,3);out.push({x0:x-w/2,y0:y-h/2,x1:x+w/2,y1:y+h/2,classId:cls,score});}
  out.sort((a,b)=>b.score-a.score);const keep=[];
  for(const b of out){if(keep.some(a=>{const inter=Math.max(0,Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0))*Math.max(0,Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0));return inter/((a.x1-a.x0)*(a.y1-a.y0)+(b.x1-b.x0)*(b.y1-b.y0)-inter)>.45;}))continue;keep.push(b);}
  // Input is letterboxed: 640×320 at y=160 in a 640×640 tensor.
  return keep.map(b=>({...b,y0:b.y0-160,y1:b.y1-160})).filter(b=>b.y1>0&&b.y0<320);
}
