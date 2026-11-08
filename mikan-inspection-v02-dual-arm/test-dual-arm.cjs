const {chromium}=require('C:/Users/ddydd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=__dirname,repo=path.resolve(root,'..');
const server=http.createServer((req,res)=>{const file=path.resolve(repo,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(repo+path.sep))return res.writeHead(403).end();fs.readFile(file,(e,data)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.html':'text/html','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{let browser;try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message);});
  await page.goto(process.env.MIKAN_TEST_URL||`http://127.0.0.1:${server.address().port}/mikan-inspection-v02-dual-arm/index.html`);
  await page.waitForFunction(()=>globalThis.mikanDebug||document.getElementById('loadMessage').getAttribute('role')==='alert',null,{timeout:90000});
  assert.ok(await page.evaluate(()=>!!globalThis.mikanDebug),await page.locator('#loadMessage').textContent());
  await page.evaluate(()=>{mikanDebug.setAutoSpawn(false);mikanDebug.setPaused(true);});await page.waitForFunction(()=>!mikanDebug.busy);
  const setup=await page.evaluate(()=>{const d=mikanDebug;d.reset();return {count:d.actors.length,model:d.detector.name,actors:d.actors.map(a=>({id:a.id,base:a.arm.config.base,rest:a.arm.rest.asArray(),tcp:a.arm.claw.position.asArray(),pad:a.arm.suction.root.position.asArray(),body:a.suction.padBody.transformNode.name})),distinctPads:d.actors[0].suction.padBody!==d.actors[1].suction.padBody,cameras:d.views.map(v=>({id:v.id,arms:[...new Set(v.rt.renderList.map(m=>m.metadata?.armId).filter(Boolean))].sort()}))};});
  assert.equal(setup.count,2);assert.equal(setup.model,'yolov9-quality-640');assert.ok(setup.distinctPads);assert.equal(setup.actors[0].base.z,2.1);assert.equal(setup.actors[1].base.z,-2.1);
  for(const actor of setup.actors){assert.ok(Math.hypot(...actor.rest.map((v,i)=>v-actor.tcp[i]))<1e-5,JSON.stringify(actor));assert.ok(Math.hypot(actor.pad[0]-actor.tcp[0],actor.pad[1]-(actor.tcp[1]-.1),actor.pad[2]-actor.tcp[2])<.03,JSON.stringify(actor));}
  for(const camera of setup.cameras)assert.deepEqual(camera.arms,['A','B']);console.log('PASS two placed robots, independent pads, mirrored world TCP and both cameras',JSON.stringify(setup));
  await page.evaluate(()=>document.getElementById('optionsPanel').open=true);
  for(const model of ['two','three']){await page.selectOption('#armModel',model);assert.ok(await page.evaluate(model=>mikanDebug.actors.every(a=>a.arm.model===model&&a.arm.near(a.arm.rest,.08)),model));assert.ok(await page.evaluate(()=>mikanDebug.views.every(v=>v.rt.renderList.every(m=>!m.isDisposed()))));}
  await page.evaluate(()=>document.getElementById('optionsPanel').open=false);
  // Run real ONNX inference on an actual image from this equipment before
  // injecting detections for deterministic scheduler tests.
  const real=await page.evaluate(async()=>{globalThis.dualRealDetectFrame=mikanDebug.detector.detectFrame;const d=mikanDebug,B=BABYLON,f=d.spawn(1,true,new B.Vector3(.5,d.fruitHeight(.5),0),'mold-large');f.visual.rotationQuaternion=B.Quaternion.RotationAxis(B.Axis.X,Math.PI);const v=d.views[0];for(let i=0;i<4;i++)d.scene.render();v.rt.resetRefreshCounter();d.scene.render();const raw=await v.rt.readPixels(),image=new ImageData(640,480);for(let y=0;y<480;y++)image.data.set(raw.subarray((479-y)*2560,(480-y)*2560),y*2560);const result=await d.detector.detectFrame(image,.35,0);return {fruits:result.fruits.length,timings:result.timings};});
  assert.ok(Number.isFinite(real.timings.inferenceMs));console.log('PASS real YOLO on dual-arm camera image',JSON.stringify(real));
  await page.evaluate(()=>{const el=document.getElementById('slopeAngle');el.value='0';el.dispatchEvent(new Event('change'));});
  await page.evaluate(()=>{
    const d=mikanDebug,B=BABYLON;d.reset();d.setMotorEnabled(false);
    const targets=[[3.6,.8],[2.6,-.8]].map(([x,z])=>{const f=d.spawn(1,true,new B.Vector3(x,d.fruitHeight(x)+.02,z),'mold-large');return f;});
    globalThis.dualFixture={targets,captures:0,maxConcurrent:0,duplicate:false,trace:[]};
    d.scene.onBeforeRenderObservable.add(()=>{const jobs=d.actors.map(a=>a.job).filter(Boolean),ids=jobs.map(j=>j.targetFruit?.id||j.fruit?.id);dualFixture.maxConcurrent=Math.max(dualFixture.maxConcurrent,jobs.length);if(new Set(ids).size!==ids.length)dualFixture.duplicate=true;dualFixture.trace.push(d.actors.map(a=>({id:a.id,phase:a.job?.phase||'idle',fruitId:a.job?.targetFruit?.id,attempt:a.job?.attempt.attemptNumber})));});
    d.detector.detectFrame=async(image,threshold,index)=>{
      if(index!==0||dualFixture.captures>=2)return {fruits:[],orphans:[]};dualFixture.captures++;
      const v=d.views[0],matrix=v.camera.getViewMatrix().multiply(v.camera.getProjectionMatrix());
      const fruits=targets.map(f=>{f.meshes[0].computeWorldMatrix(true);const p=f.meshes[0].getBoundingInfo().boundingBox.vectorsWorld.map(p=>B.Vector3.Project(p,B.Matrix.Identity(),matrix,new B.Viewport(0,0,640,480))),box={x0:Math.min(...p.map(p=>p.x)),x1:Math.max(...p.map(p=>p.x)),y0:Math.min(...p.map(p=>p.y)),y1:Math.max(...p.map(p=>p.y)),score:.99,defects:['mold']},cx=(box.x0+box.x1)/2,cy=(box.y0+box.y1)/2;return {...box,defectBoxes:[{x0:cx-5,x1:cx+5,y0:cy-5,y1:cy+5,kind:'mold',score:.99}]};});return {fruits,orphans:[]};
    };d.setPaused(false);
  });
  await page.waitForFunction(()=>mikanDebug.actors.every(a=>!!a.job),null,{timeout:12000});
  assert.ok(await page.evaluate(()=>mikanDebug.actors[0].job.targetFruit!==mikanDebug.actors[1].job.targetFruit));
  await page.waitForFunction(()=>new Set(mikanDebug.attempts.filter(a=>a.contactAt).map(a=>a.armId)).size===2,null,{timeout:22000});
  const result=await page.evaluate(()=>({maxConcurrent:dualFixture.maxConcurrent,duplicate:dualFixture.duplicate,attempts:mikanDebug.attempts.map(a=>({armId:a.armId,fruitId:a.fruitId,result:a.result,contactAt:a.contactAt,reason:a.reason})),actors:mikanDebug.actors.map(a=>({id:a.id,phase:a.job?.phase,stats:a.stats})),frames:mikanDebug.scene.getFrameId()}));
  assert.equal(result.maxConcurrent,2);assert.equal(result.duplicate,false);assert.ok(result.attempts.some(a=>a.armId==='A'&&a.contactAt)&&result.attempts.some(a=>a.armId==='B'&&a.contactAt));console.log('PASS concurrent targets and physical cup/vacuum contact for both arms',JSON.stringify(result));
  // Drops are an observed outcome, as in the one-arm baseline. Do not turn
  // failures into fake successful collections for the equipment comparison.
  await page.waitForFunction(()=>mikanDebug.detectedRecords.every(r=>r.closed)&&mikanDebug.actors.every(a=>!a.job),null,{timeout:30000});
  const outcomes=await page.evaluate(()=>({attempts:mikanDebug.attempts.map(a=>({armId:a.armId,fruitId:a.fruitId,result:a.result,reason:a.reason,breakReason:a.vacuumAtFailure?.breakReason})),stats:mikanDebug.stats,duplicate:dualFixture.duplicate}));
  assert.equal(outcomes.duplicate,false);assert.ok(outcomes.attempts.every(a=>['success','failed'].includes(a.result)));assert.ok(outcomes.attempts.length<=4);assert.ok(outcomes.stats.reject+outcomes.stats.escaped===2);console.log('MEASURE complete physical outcomes, including inherited suction losses',JSON.stringify(outcomes));
  await page.evaluate(()=>{document.getElementById('optionsPanel').open=true;document.getElementById('diagnosticsPanel').open=true;});const pendingDownload=page.waitForEvent('download');await page.click('#export');const download=await pendingDownload,exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(exported.robots.length,2);assert.ok(exported.attempts.every(a=>['A','B'].includes(a.armId)));await page.evaluate(()=>document.getElementById('optionsPanel').open=false);
  // Validate each world-space bin destination with the empty real kinematic
  // chain, then verify that both real collision bins retain falling fruit.
  await page.evaluate(()=>mikanDebug.setPaused(true));
  const destinations=await page.evaluate(()=>mikanDebug.actors.map(a=>{const p=a.arm.dropPoints.reject;const reachable=a.arm.canReach(p);a.arm.command(p);for(let i=0;i<1500&&!a.arm.near(p,.01);i++)a.arm.step(.01);return {id:a.id,reachable,error:BABYLON.Vector3.Distance(a.arm.claw.position,new BABYLON.Vector3(p.x,p.y,p.z)),target:p};}));
  assert.ok(destinations.every(d=>d.reachable&&d.error<.03));assert.ok(destinations[0].target.z>0&&destinations[1].target.z<0);
  await page.evaluate(()=>{const d=mikanDebug;d.reset();globalThis.binFixtures=d.actors.map(a=>{const p=a.arm.dropPoints.reject,f=d.spawn(0,false,new BABYLON.Vector3(p.x,p.y,p.z));f.sorted=true;f.bin='reject';return f;});d.setPaused(false);});
  await page.waitForFunction(()=>binFixtures.every(f=>f.root.position.y< -2.5&&Math.abs(f.root.position.z)>2.7),null,{timeout:6000});console.log('PASS both world-space release poses and physical collection bins',JSON.stringify(destinations));
  await page.evaluate(()=>mikanDebug.setPaused(true));await page.waitForFunction(()=>!mikanDebug.busy);await page.waitForTimeout(200);fs.mkdirSync(path.join(root,'qa'),{recursive:true});await page.screenshot({path:path.join(root,'qa/dual-arms.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(root,'qa/dual-mobile.png'),fullPage:true});
  await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>{const d=mikanDebug;d.detector.detectFrame=dualRealDetectFrame;const el=document.getElementById('slopeAngle');el.value='5';el.dispatchEvent(new Event('change'));d.setAutoSpawn(true);d.setMotorEnabled(true);d.setPaused(false);});await page.waitForTimeout(1800);await page.locator('#scene').screenshot({path:path.join(root,'preview.png')});
  assert.deepEqual(errors,[]);
}finally{await browser?.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
