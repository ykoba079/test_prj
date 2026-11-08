// Text styling inspired by the outlined NG label in Babylon Playground KK480H#3.
export function labelPresentation(record){
  const confirmed=['mold','damage'].filter(k=>record.defects.has(k));
  const observed=['mold','damage'].filter(k=>record.observedKinds?.has(k));
  const words=kinds=>kinds.map(k=>k==='mold'?'カビ':'キズ').join('・');
  return confirmed.length?{confirmed:true,title:'NG!',detail:words(confirmed)+'検出'}:{confirmed:false,title:'',detail:words(observed)+'候補'};
}
export function labelPopScale(seconds){
  if(seconds<0)return 1;
  if(seconds<.12)return .65+.60*Math.sin(Math.max(0,seconds)/.12*Math.PI/2);
  if(seconds<.38)return 1+.25*(1-(seconds-.12)/.26)**2;
  return 1;
}
export function paintYoloLabel(texture,presentation){
  const c=texture.getContext();c.clearRect(0,0,512,256);c.textAlign='center';c.textBaseline='middle';c.lineJoin='round';
  if(presentation.confirmed){
    c.strokeStyle='#5a0a00';c.lineWidth=18;c.font='900 132px Arial,sans-serif';c.strokeText(presentation.title,256,88);c.fillStyle='#ffd24a';c.fillText(presentation.title,256,88);
    c.font='bold 58px "Yu Gothic",sans-serif';c.lineWidth=12;c.strokeText(presentation.detail,256,207,480);c.fillStyle='#ffffff';c.fillText(presentation.detail,256,207,480);
  }else{
    c.font='bold 66px "Yu Gothic",sans-serif';c.strokeStyle='#47320c';c.lineWidth=12;c.strokeText(presentation.detail,256,128,480);c.fillStyle='#ffe58d';c.fillText(presentation.detail,256,128,480);
  }
  texture.update();
}
