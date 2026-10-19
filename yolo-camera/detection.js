// Shared by the browser and the Node verification script.
(function (root) {
  function iou(a,b) {
    const area = Math.max(0,Math.min(a.x2,b.x2)-Math.max(a.x1,b.x1))*Math.max(0,Math.min(a.y2,b.y2)-Math.max(a.y1,b.y1));
    return area / Math.max(1e-9,(a.x2-a.x1)*(a.y2-a.y1)+(b.x2-b.x1)*(b.y2-b.y1)-area);
  }
  function decode(data,dims,classes,threshold,geometry,boxFormat='xyxy') {
    const count=classes.length, channels=count+4;
    if(dims.length!==3 || dims[0]!==1 || (dims[1]!==channels && dims[2]!==channels)) throw Error('未対応のモデル出力: '+dims.join('×'));
    const first=dims[1]===channels, n=first?dims[2]:dims[1];
    const get=(i,c)=>data[first?c*n+i:i*channels+c];
    const candidates=[];
    for(let i=0;i<n;i++) {
      let score=0,cls=0;
      for(let c=0;c<count;c++) if(get(i,c+4)>score){score=get(i,c+4);cls=c;}
      if(score<threshold) continue;
      const x=get(i,0),y=get(i,1),w=get(i,2),h=get(i,3);
      if(![x,y,w,h,score].every(Number.isFinite)) continue;
      const left=boxFormat==='cxcywh'?x-w/2:x,top=boxFormat==='cxcywh'?y-h/2:y;
      const right=boxFormat==='cxcywh'?x+w/2:w,bottom=boxFormat==='cxcywh'?y+h/2:h;
      const {padX,padY,scaleX,scaleY,width,height}=geometry;
      const x1=Math.max(0,(left-padX)/scaleX),y1=Math.max(0,(top-padY)/scaleY);
      const x2=Math.min(width,(right-padX)/scaleX),y2=Math.min(height,(bottom-padY)/scaleY);
      if(x2>x1&&y2>y1)candidates.push({x1,y1,x2,y2,score,cls,label:classes[cls]});
    }
    candidates.sort((a,b)=>b.score-a.score);
    const kept=[];
    for(const box of candidates.slice(0,3000)) {
      if(!kept.some(other=>other.cls===box.cls&&iou(box,other)>.45)) kept.push(box);
      if(kept.length>=100)break;
    }
    return kept;
  }
  root.YoloDetection={decode,iou};
  if(typeof module!=='undefined')module.exports=root.YoloDetection;
})(globalThis);
