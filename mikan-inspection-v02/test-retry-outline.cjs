// Exercise the actual planner/return state machine with deterministic command
// failures. Image boxes are injected; classification quality is tested separately.
const {chromium}=require('C:/Users/ddydd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=__dirname,repo=path.resolve(root,'..');
const server=http.createServer((req,res)=>{const file=path.resolve(repo,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(repo+path.sep))return res.writeHead(403).end();fs.readFile(file,(e,data)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.html':'text/html','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{let browser;try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.MIKAN_TEST_URL||`http://127.0.0.1:${server.address().port}/mikan-inspection-v02/index.html`);await page.waitForFunction(()=>globalThis.mikanDebug,null,{timeout:90000});
  await page.evaluate(()=>mikanDebug.setAutoSpawn(false));await page.evaluate(()=>mikanDebug.setPaused(true));await page.waitForFunction(()=>!mikanDebug.busy);
  await page.evaluate(()=>{document.getElementById('optionsPanel').open=true;});
  const outlines=[];
  for(const model of ['two','three'])for(const slope of ['0','2','5']){
    await page.selectOption('#armModel',model);await page.selectOption('#slopeAngle',slope);
    const row=await page.evaluate(()=>{const d=mikanDebug,m=d.pickupArea;return {model:d.arm.model,slope:d.line.degrees,type:m.getClassName(),vertices:m.getTotalVertices(),physics:!!m.body,finite:m.getVerticesData(BABYLON.VertexBuffer.PositionKind).every(Number.isFinite),count:d.scene.meshes.filter(m=>m.name==='image-pickup-area').length,cameraLeaks:d.views.filter(v=>v.rt.renderList.includes(m)).length};});
    assert.equal(row.type,'LinesMesh');assert.ok(row.vertices>0&&row.finite);assert.equal(row.physics,false);assert.equal(row.count,1);assert.equal(row.cameraLeaks,0);outlines.push(row);
  }
  await page.locator('#optionsPanel>summary').click();await page.evaluate(()=>mikanDebug.reset());await page.waitForTimeout(250);fs.mkdirSync(path.join(root,'qa'),{recursive:true});await page.screenshot({path:path.join(root,'qa/pick-outline.png'),fullPage:true});
  const setup=async()=>{
    await page.evaluate(()=>mikanDebug.setPaused(true));await page.waitForFunction(()=>!mikanDebug.busy);
    await page.evaluate(()=>{
      const d=mikanDebug,B=BABYLON;d.reset();d.setMotorEnabled(false);
      d.arm.command=globalThis.retryOriginalCommand??d.arm.command;d.arm.canReach=globalThis.retryOriginalReach??d.arm.canReach;
      retryOriginalCommand=d.arm.command;retryOriginalReach=d.arm.canReach;
      const f=d.spawn(1,true,new B.Vector3(2.5,d.fruitHeight(2.5)+.12,0),'mold-large');f.body.setGravityFactor(0);
      globalThis.retryFixture={f,captures:0,failed:new Set(),blockRetry:true,secondNearRest:null};
      d.arm.command=target=>{const j=d.activeJob,n=j?.attempt.attemptNumber;if(j?.targetFruit&&['hover','descend','seal'].includes(j.phase)){
        if(n===2&&retryFixture.secondNearRest===null)retryFixture.secondNearRest=d.arm.near(retryRest,.08);
        if(j.approachTime>.20&&!retryFixture.failed.has(n)){retryFixture.failed.add(n);return {reachable:false};}
      }return retryOriginalCommand(target);};
      d.arm.canReach=target=>d.detectedRecords.some(r=>r.state==='retry-wait')&&retryFixture.blockRetry?false:retryOriginalReach(target);
      d.detector.detectFrame=async(image,threshold,index)=>{
        if(index!==0||retryFixture.captures>=2)return {fruits:[],orphans:[]};retryFixture.captures++;
        const v=d.views[0],matrix=v.camera.getViewMatrix().multiply(v.camera.getProjectionMatrix());f.meshes[0].computeWorldMatrix(true);
        const p=f.meshes[0].getBoundingInfo().boundingBox.vectorsWorld.map(p=>B.Vector3.Project(p,B.Matrix.Identity(),matrix,new B.Viewport(0,0,640,480))),box={x0:Math.min(...p.map(p=>p.x)),x1:Math.max(...p.map(p=>p.x)),y0:Math.min(...p.map(p=>p.y)),y1:Math.max(...p.map(p=>p.y)),score:.99,defects:['mold']},cx=(box.x0+box.x1)/2,cy=(box.y0+box.y1)/2;
        return {fruits:[{...box,defectBoxes:[{x0:cx-5,x1:cx+5,y0:cy-5,y1:cy+5,kind:'mold',score:.99}]}],orphans:[]};
      };d.setPaused(false);
    });
  };
  // Use the exported rest pose, rather than a fixture-specific assumption.
  await page.evaluate(async()=>{globalThis.retryRest=(await import('./arm-kinematics.js?v=20261108-standard-bins')).ARM_REST;});
  await setup();
  await page.waitForFunction(()=>mikanDebug.activeJob?.phase==='return'&&mikanDebug.attempts[0]?.retryScheduled,null,{timeout:12000});
  assert.ok(await page.evaluate(()=>!mikanDebug.detectedRecords[0].closed&&mikanDebug.stats.escaped===0&&mikanDebug.attempts.length===1));
  await page.waitForFunction(()=>!mikanDebug.activeJob,null,{timeout:10000});await page.waitForTimeout(600);
  assert.equal(await page.evaluate(()=>mikanDebug.attempts.length),1,'unreachable target cannot trigger a retry');
  await page.evaluate(()=>{retryFixture.blockRetry=false;});
  await page.waitForFunction(()=>mikanDebug.attempts.length===2,null,{timeout:6000});
  await page.waitForFunction(()=>mikanDebug.detectedRecords[0].closed&&!mikanDebug.activeJob,null,{timeout:10000});await page.waitForTimeout(700);
  const exhausted=await page.evaluate(()=>({attempts:mikanDebug.attempts.map(a=>({number:a.attemptNumber,retry:a.retry,fruitId:a.fruitId,result:a.result})),failed:mikanDebug.stats.pickFailed,escaped:mikanDebug.stats.escaped,closed:mikanDebug.detectedRecords[0].closed,secondNearRest:retryFixture.secondNearRest,ng:mikanDebug.defectLabels.get(retryFixture.f.id)?.text}));
  assert.equal(exhausted.attempts.length,2);assert.deepEqual(exhausted.attempts.map(a=>a.number),[1,2]);assert.deepEqual(exhausted.attempts.map(a=>a.retry),[false,true]);assert.ok(exhausted.attempts.every(a=>a.fruitId===exhausted.attempts[0].fruitId&&a.result==='failed'));assert.equal(exhausted.failed,2);assert.equal(exhausted.escaped,1);assert.ok(exhausted.closed&&exhausted.secondNearRest);assert.equal(exhausted.ng,'NG! カビ検出');
  await setup();await page.waitForFunction(()=>mikanDebug.activeJob?.phase==='return'&&mikanDebug.attempts[0]?.retryScheduled,null,{timeout:12000});
  await page.evaluate(()=>{const f=retryFixture.f;f.root.position.x=4.5;f.body.setPrestepType(BABYLON.PhysicsPrestepType.TELEPORT);mikanDebug.scene.onAfterPhysicsObservable.addOnce(()=>f.body.setPrestepType(BABYLON.PhysicsPrestepType.DISABLED));retryFixture.blockRetry=false;});
  await page.waitForFunction(()=>mikanDebug.detectedRecords[0].closed&&!mikanDebug.activeJob,null,{timeout:10000});await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>mikanDebug.attempts.length),1,'fruit outside the zone must not be retried');
  assert.deepEqual(errors,[]);console.log('PASS dashed reachable outline for two arms / three slopes; retry only after return and reachability; same confirmed fruit; two-attempt limit; one final miss; no retry after exit',JSON.stringify({outlines,exhausted}));
}finally{await browser?.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
