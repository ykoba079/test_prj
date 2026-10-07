const canvas=document.getElementById('canvas');
const diagnostics={errors:[],scene:null,engine:null};window.flowViewer=diagnostics;
function fail(error){diagnostics.errors.push(String(error));document.getElementById('fatalMessage').textContent=String(error);document.getElementById('fatal').hidden=false;}
document.getElementById('retry').addEventListener('click',()=>location.reload());
window.addEventListener('error',event=>fail(event.message));
window.addEventListener('unhandledrejection',event=>fail(event.reason));
document.getElementById('menu').addEventListener('click',()=>{
  const open=document.getElementById('panel').classList.toggle('open');
  document.getElementById('menu').setAttribute('aria-expanded',String(open));
  document.getElementById('menu').textContent=open?'閉じる':'メニュー';
});
try{
  if(!window.BABYLON)throw Error('Babylon.jsの読み込みに失敗しました。');
  if(typeof DecompressionStream==='undefined')throw Error('速度データの解凍に対応したブラウザーで開いてください。');
  const engine=new BABYLON.Engine(canvas,true,{stencil:true});diagnostics.engine=engine;
  if(engine.webGLVersion<2)throw Error('WebGL 2が必要です。');
  engine.setHardwareScalingLevel(Math.max(1,devicePixelRatio/1.5));
  const {default:createScene}=await import('./demo.js?v=particles-20261004d');
  const scene=createScene(engine,canvas);diagnostics.scene=scene;diagnostics.demo=scene.metadata.flow;
  function resize(){engine.resize();scene.activeCamera.viewport=innerWidth<=850?new BABYLON.Viewport(0,.2,1,.8):new BABYLON.Viewport(0,0,1,1);}
  window.addEventListener('resize',resize);resize();engine.runRenderLoop(()=>{if(!scene.isDisposed)scene.render();});
}catch(error){fail(error);}
