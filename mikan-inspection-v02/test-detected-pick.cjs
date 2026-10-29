const {chromium}=require('C:/Users/ddydd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
  fs.readFile(file,(e,data)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.html':'text/html','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(data);});
});
(async()=>{let browser;try{
  const uri=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
  const {matchDetectedFruits,recordDefectCapture,pendingDefectCount}=await import(uri(fs.readFileSync(__dirname+'/detected-fruit-control.js','utf8')));
  const record=()=>({defects:new Set(),evidence:{mold:0,damage:0}}),r=record();
  recordDefectCapture(r,['mold'],10,1);recordDefectCapture(r,['mold'],10,1);
  assert.equal(r.defects.size,0,'A/B from one capture must not confirm');assert.equal(r.evidence.mold,1);
  recordDefectCapture(r,[],10.5,2);assert.equal(pendingDefectCount(r,10.5),1);
  recordDefectCapture(r,['mold'],11.5,3);assert.ok(r.defects.has('mold'),'a clean frame between two detections is allowed');
  recordDefectCapture(r,[],20,4);assert.ok(r.defects.has('mold'),'confirmation stays latched after the window expires');
  const expired=record();recordDefectCapture(expired,['damage'],0,1);recordDefectCapture(expired,['damage'],2.01,2);assert.equal(expired.defects.size,0);assert.equal(pendingDefectCount(expired,2.01),1);
  const edge=record();recordDefectCapture(edge,['mold'],0,1);recordDefectCapture(edge,['damage'],2,2);assert.equal(edge.defects.size,2,'either defect class counts, including the exact two-second boundary');
  const other=record();recordDefectCapture(other,['mold'],11.5,3);assert.equal(other.defects.size,0,'two separate fruit cannot share evidence');
  const a={id:1,bounds:{x0:0,y0:0,x1:100,y1:100}},b={id:2,bounds:{x0:120,y0:0,x1:220,y1:100}};
  const detection={x0:0,y0:0,x1:100,y1:100,score:.99,defects:['mold'],defectBoxes:[{x0:30,y0:30,x1:50,y1:50,kind:'mold'}]};
  assert.equal(matchDetectedFruits([], [a,b]).length,0);
  assert.deepEqual(matchDetectedFruits([detection],[a,b]).map(m=>[m.candidate.id,m.defects]),[[1,['mold']]]);
  assert.equal(matchDetectedFruits([{...detection,score:.4}],[a,b]).length,0);
  assert.equal(matchDetectedFruits([{...detection,x1:220,defectBoxes:[],defects:[]}],[a,b]).length,0,'ambiguous merged box must not authorize two fruit');
  const {createArmServo}=await import(uri(fs.readFileSync(__dirname+'/arm-kinematics.js','utf8')));
  const times=[1,1.5,2].map(speed=>{const s=createArmServo();s.setMotionScale(speed);return s.estimate({x:3,y:1.5,z:0});});assert.ok(times[0]>times[1]&&times[1]>times[2]);
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.MIKAN_TEST_URL||`http://127.0.0.1:${server.address().port}/mikan-inspection-v02/index.html?preset=joint-trial&arm=three`);
  await page.waitForFunction(()=>globalThis.mikanDebug,null,{timeout:90000});
  assert.equal(await page.locator('#vacuumPressure').inputValue(),'78');assert.equal(await page.locator('#feedInterval').inputValue(),'2.5');
  await page.locator('#autoSpawn').uncheck();const trials=[];
  await page.evaluate(()=>{mikanDebug.reset();mikanDebug.setMotorEnabled(false);});await page.waitForTimeout(1800);
  for(const [model,x] of [['three',3.35],['two',1.9]]){
    await page.evaluate(()=>mikanDebug.setPaused(true));await page.waitForFunction(()=>!mikanDebug.busy);
    await page.selectOption('#armModel',model);await page.evaluate(()=>mikanDebug.reset());
    await page.evaluate(x=>{
      const d=mikanDebug;d.setMotorEnabled(false);const f=d.spawn(0,false,new BABYLON.Vector3(x,d.fruitHeight(x)+.02,0));
      const missed=d.spawn(1,true,new BABYLON.Vector3(-2,d.fruitHeight(-2),0));globalThis.pickFixture={f,missed,samples:[],cycle:0,allowSecond:false};let secondEmitted=false;
      d.detector.detectFrame=async(image,threshold,viewIndex)=>{
        if(viewIndex===0)pickFixture.cycle++;
        if(pickFixture.cycle!==1){if(viewIndex!==0||!pickFixture.allowSecond||secondEmitted)return {fruits:[],orphans:[]};secondEmitted=true;}
        const view=d.views[viewIndex],matrix=view.camera.getViewMatrix().multiply(view.camera.getProjectionMatrix());f.meshes[0].computeWorldMatrix(true);
        const pixels=f.meshes[0].getBoundingInfo().boundingBox.vectorsWorld.map(p=>BABYLON.Vector3.Project(p,BABYLON.Matrix.Identity(),matrix,new BABYLON.Viewport(0,0,640,480)));
        const box={x0:Math.min(...pixels.map(p=>p.x)),x1:Math.max(...pixels.map(p=>p.x)),y0:Math.min(...pixels.map(p=>p.y)),y1:Math.max(...pixels.map(p=>p.y)),score:.99,defects:['mold']};const cx=(box.x0+box.x1)/2,cy=(box.y0+box.y1)/2;
        return {fruits:[{...box,defectBoxes:[{x0:cx-8,x1:cx+8,y0:cy-8,y1:cy+8,kind:'mold',score:.9}]}],orphans:[]};
      };
      pickFixture.timer=setInterval(()=>{const j=d.activeJob;if(j?.attempt.surfaceControl)pickFixture.samples.push({...j.attempt.surfaceControl});},20);d.setPaused(false);
    },x);
    await page.waitForFunction(()=>pickFixture.cycle>=2&&mikanDebug.detectedRecords.length>0,null,{timeout:12000});
    const pending=await page.evaluate(()=>({confirmed:mikanDebug.detectedRecords[0].defects.size,markers:mikanDebug.defectMarkers.size,attempts:mikanDebug.attempts.length,evidence:mikanDebug.detectedRecords[0].evidence.mold,views:[...mikanDebug.detectedRecords[0].views].sort()}));
    assert.deepEqual(pending,{confirmed:0,markers:0,attempts:0,evidence:1,views:['A','B']},'one capture, even from both cameras, must not mark or start the arm');
    await page.evaluate(()=>{pickFixture.allowSecond=true;});
    await page.waitForFunction(()=>mikanDebug.attempts.length>0,null,{timeout:12000});
    await page.waitForFunction(()=>['checking-grip','holding','success','failed'].includes(mikanDebug.attempts[0]?.result),null,{timeout:12000});
    const trial=await page.evaluate(()=>{
      clearInterval(pickFixture.timer);const d=mikanDebug,{f,missed,samples}=pickFixture;
      return {model:d.arm.model,attempt:d.attempts[0],authorized:[...d.detectedFruits.keys()],targetId:f.id,missedId:missed.id,sourceType:f.type,samples};
    });
    assert.deepEqual(trial.authorized,[trial.targetId],'missed fruit must never become an arm target');
    assert.equal(trial.attempt.fruitId,trial.targetId);assert.equal(trial.sourceType,undefined,'simulator ground-truth class is not consulted');
    assert.ok(trial.samples.length>0);for(const sample of trial.samples)assert.ok(sample.targetY-sample.cupOffset>=sample.surfaceY-.025-1e-6,'cup must target the surface, not the center');
    assert.notEqual(trial.attempt.result,'failed',JSON.stringify(trial.attempt));trials.push(trial);
  }
  // Return speed is independent, and may be changed while the robot returns empty.
  await page.waitForFunction(()=>mikanDebug.activeJob?.phase==='return',null,{timeout:16000});
  await page.evaluate(()=>mikanDebug.setPaused(true));
  await page.selectOption('#returnSpeed','1.5');await page.waitForFunction(()=>mikanDebug.arm.servo.motionScale===1.5);
  await page.selectOption('#returnSpeed','2');await page.waitForFunction(()=>mikanDebug.arm.servo.motionScale===2);
  const download=page.waitForEvent('download');await page.click('#export');const artifact=await download,exported=JSON.parse(fs.readFileSync(await artifact.path(),'utf8'));assert.equal(exported.tracking.simulatorPositionsForPlanning,true);assert.equal(exported.robot.returnMotionScale,2);assert.deepEqual(exported.picking.defectConfirmation,{windowSeconds:2,captures:2});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);console.log('PASS two captures within two seconds; same-frame A/B deduplication; clean gap, expiry and latch; no arm/marker on first capture; missed fruit excluded; physical surface contact and settings',JSON.stringify(trials.map(t=>({model:t.model,attempt:t.attempt,samples:t.samples.length}))));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
