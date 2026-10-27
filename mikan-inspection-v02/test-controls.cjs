const {chromium}=require('C:/Users/ddydd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=__dirname,siteRoot=path.resolve(root,'..');
const server=http.createServer((req,res)=>{const file=path.resolve(siteRoot,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(siteRoot+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,data)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.html':'text/html','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(data);});});

(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.MIKAN_TEST_URL||`http://127.0.0.1:${server.address().port}/mikan-inspection-v02/index.html`);await page.waitForFunction(()=>globalThis.mikanDebug,null,{timeout:90000});await page.locator('#autoSpawn').uncheck();
 assert.equal(await page.locator('#pause,#motor,#reset').count(),0);assert.equal(await page.locator('aside .caption').count(),0);assert.equal(await page.locator('footer .caption').count(),1);assert.equal(await page.locator('#rollerSlowdown').getAttribute('min'),'-100');
 await page.evaluate(()=>mikanDebug.setPaused(true));await page.waitForFunction(()=>!mikanDebug.busy);await page.evaluate(()=>mikanDebug.reset(false));
 await page.evaluate(async()=>{
  const d=mikanDebug;for(const [type,x]of [[0,-.5],[1,1.3],[2,2.5]]){const f=d.spawn(type,true,new BABYLON.Vector3(x,.35,0));if(type)f.visual.rotationQuaternion=BABYLON.Quaternion.RotationAxis(BABYLON.Axis.X,Math.PI);}
  globalThis.benchmarkImages=[];for(const v of d.views){v.rt.resetRefreshCounter();d.scene.render();const raw=await v.rt.readPixels(),image=new ImageData(640,480);for(let y=0;y<480;y++)image.data.set(raw.subarray((479-y)*2560,(480-y)*2560),y*2560);benchmarkImages.push(image);}
 });
 const measurements=[];
 for(const size of [640,320]){
  if(size===320){await page.locator('#yoloSize').selectOption('320');await page.waitForFunction(()=>mikanDebug.detector.config.inputSize===320&&!document.getElementById('yoloSize').disabled,null,{timeout:60000});}
  measurements.push(await page.evaluate(async size=>{
   const samples=[];let last;for(let n=0;n<5;n++){const t=performance.now();last=await Promise.all(benchmarkImages.map((im,i)=>mikanDebug.detector.detectFrame(im,.25,i)));if(n)samples.push({pairedMs:performance.now()-t,inferenceMs:last.map(r=>r.timings.inferenceMs)});}
   return {size,samples,detections:last.map(r=>({fruits:r.fruits,orphans:r.orphans})),model:mikanDebug.detector.config};
  },size));
 }
 assert.equal(measurements[1].model.inputSize,320);assert.ok(measurements.every(r=>r.samples.every(s=>Number.isFinite(s.pairedMs)&&s.inferenceMs.every(Number.isFinite))));console.log('MEASURE paired YOLO 640/320 on identical camera images:',JSON.stringify(measurements));
 await page.evaluate(()=>{mikanDebug.reset(false);mikanDebug.setPaused(false);});await page.locator('#rollerSlowdown').fill('-100');
 await page.waitForFunction(()=>mikanDebug.mechanics.rollers.filter(r=>r.driveRole==='slow').every(r=>r.targetDriveSpeed===16&&Math.abs(r.driveSpeed-16)<1e-4));
 await page.locator('#removeSlowRollers').check();await page.waitForFunction(()=>mikanDebug.mechanics.readRolling().slowRollersRemoved);
 const removed=await page.evaluate(()=>mikanDebug.mechanics.rollers.map(r=>({role:r.driveRole,visible:r.isEnabled(),mask:r.body.shape.filterCollideMask,speed:r.driveSpeed})));
 assert.equal(removed.filter(r=>r.role==='slow').length,7);assert.ok(removed.filter(r=>r.role==='slow').every(r=>!r.visible&&r.mask===0));assert.ok(removed.filter(r=>r.role!=='slow').every(r=>r.visible&&r.mask!==0));
 const contact=await page.evaluate(async()=>{const d=mikanDebug,r=d.mechanics.rollers.filter(r=>r.driveRole==='slow')[3],f=d.spawn(0,false,new BABYLON.Vector3(r.position.x,.58,0));let steps=0;return await new Promise(resolve=>{const h=d.scene.onAfterPhysicsObservable.add(()=>{if(++steps>=240){d.scene.onAfterPhysicsObservable.remove(h);resolve({events:f.contacts,roles:[...f.rollerContacts.keys()].map(r=>r.driveRole),dynamic:f.body.getMotionType()});}});});});
 assert.ok(contact.events>0);assert.ok(contact.roles.length&&contact.roles.every(r=>r!=='slow'));assert.equal(contact.dynamic,2);console.log('PASS -100% means 16 rad/s, seven slow rollers disappear visually and have no physical contacts',JSON.stringify(contact));
 fs.mkdirSync(path.join(root,'qa'),{recursive:true});const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadPromise;await download.saveAs(path.join(root,'qa/controls-export.json'));const exported=JSON.parse(fs.readFileSync(path.join(root,'qa/controls-export.json'),'utf8'));assert.equal(exported.detector,'yolov9-quality-320');assert.equal(exported.picking.rollerTrial.slowdown,-1);assert.equal(exported.physics.rolling.slowRollersRemoved,true);
 await page.evaluate(()=>document.querySelector('.workspace').scrollIntoView({block:'start'}));await page.locator('#removeSlowRollers').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(root,'qa/compact-controls.png'),fullPage:true});
 await page.evaluate(()=>{document.querySelector('aside').scrollTop=document.querySelector('aside').scrollHeight;});await page.waitForTimeout(100);const lower=await page.locator('#autoSpawn').boundingBox();assert.ok(lower.y>=0&&lower.y+lower.height<=900,JSON.stringify(lower));const canvas=await page.locator('#scene').boundingBox();assert.ok(canvas.y>=0&&canvas.y+canvas.height<=900,JSON.stringify(canvas));await page.screenshot({path:path.join(root,'qa/controls-bottom.png'),fullPage:false});
 await page.locator('#removeSlowRollers').uncheck();await page.waitForFunction(()=>!mikanDebug.mechanics.readRolling().slowRollersRemoved);assert.equal(await page.evaluate(()=>mikanDebug.mechanics.rollers.every(r=>r.isEnabled()&&r.body.shape.filterCollideMask!==0)),true);
 const frameBefore=await page.evaluate(()=>mikanDebug.scene.getFrameId());await page.locator('#yoloSize').selectOption('640');await page.waitForFunction(()=>mikanDebug.detector.config.inputSize===640&&!document.getElementById('yoloSize').disabled,null,{timeout:60000});assert.ok(await page.evaluate(before=>!mikanDebug.paused&&mikanDebug.scene.physicsEnabled&&mikanDebug.scene.getFrameId()>before+2,frameBefore));console.log('PASS live model replacement keeps rendering and physics active');
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);fs.writeFileSync(path.join(root,'qa/resolution-comparison.json'),JSON.stringify(measurements,null,2));console.log('PASS compact controls, sticky scene during settings scroll, footer, restore, export and mobile');
}finally{await browser?.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
