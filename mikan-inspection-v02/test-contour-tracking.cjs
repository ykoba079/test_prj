const {chromium}=require('C:/Users/ddydd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
  fs.readFile(file,(error,data)=>{
    if(error)return res.writeHead(404).end();
    if(file.endsWith('mikan-inspection-v02'+path.sep+'app.js'))data=Buffer.from(data.toString().replace('globalThis.mikanDebug={','globalThis.contourFixture={supplementDefectPositions};globalThis.mikanDebug={'));
    res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.html':'text/html','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(data);
  });
});
(async()=>{let browser;try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/mikan-inspection-v02/index.html?detector=color&preset=joint-trial&arm=three`);
  await page.waitForFunction(()=>globalThis.mikanDebug);
  await page.evaluate(()=>mikanDebug.setPaused(true));await page.waitForFunction(()=>!mikanDebug.busy);
  const result=await page.evaluate(async()=>{
    const d=mikanDebug,{pickStartStatus}=await import('./pick-planning.js?v=20261030-readiness');d.reset();
    const f=d.spawn(0,false,new BABYLON.Vector3(2,d.fruitHeight(2),0)),base=performance.now()/1000;
    const detect=(x,defects=[])=>({x,z:0,defects,scores:{mikan:.99,mold:.8}});
    d.tracker.update([detect(1.8,['mold'])],base,100);const t=d.tracker.tracks[0];
    const initial=pickStartStatus(d.tracker,t,base).code;
    async function contours(time){
      const v=d.views[0];v.rt.resetRefreshCounter();d.scene.render();
      const raw=await v.rt.readPixels(),image=new ImageData(640,480);
      for(let y=0;y<480;y++)image.data.set(raw.subarray((479-y)*2560,(480-y)*2560),y*2560);
      const view={...v,geometry:d.line,support:d.support,viewMatrix:v.camera.getViewMatrix().clone(),projectionMatrix:v.camera.getProjectionMatrix().clone(),linePlane:new BABYLON.Plane(d.line.plane.x,d.line.plane.y,d.line.plane.z,d.line.plane.d)},observations=[];
      contourFixture.supplementDefectPositions(image,view,observations,time);return observations;
    }
    const first=await contours(base+.3);d.tracker.update(first,base+.3,101);
    f.root.position.set(2.2,d.fruitHeight(2.2),0);
    const second=await contours(base+.6);d.tracker.update(second,base+.6,102);
    const ready=pickStartStatus(d.tracker,t,base+.6).code,source=t.positionSource,frames=t.frames,position=t.x,evidence=t.evidence.mold;
    f.root.setEnabled(false);const hidden=await contours(base+.8);d.tracker.update(hidden,base+.8,103);
    const missing=pickStartStatus(d.tracker,t,base+.8).code;
    d.tracker.reset();d.tracker.update([detect(2,['mold'])],base+1,200);
    f.root.setEnabled(true);f.root.position.set(1.6,d.fruitHeight(1.6),0);d.spawn(0,false,new BABYLON.Vector3(2.4,d.fruitHeight(2.4),0));
    const ambiguous=await contours(base+1.1);
    d.tracker.reset();d.tracker.update([detect(2.15,['mold']),detect(2.25,['mold'])],base+1.2,250);
    d.fruits[1].root.setEnabled(false);f.root.position.set(2.2,d.fruitHeight(2.2),0);
    const rivalTracks=await contours(base+1.3);
    d.tracker.reset();d.tracker.update([{x:2,z:0,defects:[],scores:{},trackOnly:'T404',positionSource:'contour'}],base+2,300);
    return {initial,first,second,ready,source,frames,position,evidence,hidden:hidden.length,missing,ambiguous:ambiguous.length,rivalTracks:rivalTracks.length,createdFromContour:d.tracker.tracks.length};
  });
  assert.equal(result.initial,'motion');assert.equal(result.first.length,1);assert.equal(result.second.length,1);
  assert.equal(result.ready,'ready');assert.equal(result.source,'contour');assert.equal(result.frames,3);assert.ok(Math.abs(result.position-2.2)<.1);
  assert.equal(result.evidence,1);assert.ok(result.first.every(d=>d.defects.length===0));
  assert.equal(result.hidden,0);assert.equal(result.missing,'missing');assert.equal(result.ambiguous,0);assert.equal(result.rivalTracks,0);assert.equal(result.createdFromContour,0);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);console.log('PASS actual camera contours preserve a once-detected defect, recover stable motion, reject hidden/ambiguous fruit, never create IDs; visible readiness and mobile layout',JSON.stringify(result));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
