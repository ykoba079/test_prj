const {chromium}=require('C:/Users/ddydd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=__dirname,siteRoot=path.resolve(root,'..');
const server=http.createServer((req,res)=>{const file=path.resolve(siteRoot,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(siteRoot+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,data)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.html':'text/html','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(data);});});

(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:1150}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.MIKAN_TEST_URL||`http://127.0.0.1:${server.address().port}/mikan-inspection-v02/index.html?detector=color`);await page.waitForFunction(()=>globalThis.mikanDebug,null,{timeout:90000});await page.locator('#autoSpawn').uncheck();await page.evaluate(()=>mikanDebug.reset(false));
 assert.equal(await page.locator('#speed').inputValue(),'8');assert.equal(await page.locator('#rollingPreset').inputValue(),'combined');
 const reports=[];
 for(const preset of ['legacy','friction','shape','ramp','damping','combined']){
  await page.locator('#rollingPreset').selectOption(preset);await page.evaluate(()=>mikanDebug.reset(false));
  await page.waitForFunction(()=>mikanDebug.mechanics.rollers.every(r=>Math.abs(r.driveSpeed-r.targetDriveSpeed)<1e-4));
  const settings=await page.evaluate(()=>mikanDebug.mechanics.readRolling());assert.equal(settings.preset,preset);assert.ok(Math.abs(settings.fruitMaterial.friction-settings.friction)<1e-6);assert.ok(Math.abs(settings.fruitMaterial.staticFriction-settings.friction*settings.staticRatio)<1e-6);assert.equal(settings.fruitMaterial.frictionCombine,1);assert.equal(settings.rollerMaterial.frictionCombine,1);
  const report=await page.evaluate(async settings=>{
   const d=mikanDebug,f=d.spawn(0,false,new BABYLON.Vector3(-1.9,.58,0)),start=f.root.position.x;let steps=0,contactTicks=0,slip=0,path=0,spinZ=0,maxTilt=0,maxY=0;
   const actualDamping=f.body.getAngularDamping();
   return await new Promise(resolve=>{const handle=d.scene.onAfterPhysicsObservable.add(()=>{
    steps++;if(f.body){const state=d.mechanics.rollingStatus(f),w=f.body.getAngularVelocity();if(state.slip!==null){contactTicks++;slip+=state.slip;}path+=w.length()/120;spinZ+=w.z/120;maxY=Math.max(maxY,f.root.position.y);f.root.computeWorldMatrix(true);const n=BABYLON.Vector3.TransformNormal(BABYLON.Axis.Y,f.root.getWorldMatrix()).normalize();maxTilt=Math.max(maxTilt,Math.acos(Math.max(-1,Math.min(1,n.y))));}
    if(steps>=480||!f.body){d.scene.onAfterPhysicsObservable.remove(handle);resolve({settings,actualDamping,physicsSeconds:steps/120,dx:f.root.position.x-start,angularPath:path,signedSpinZ:spinZ,maxTiltDegrees:maxTilt*180/Math.PI,contactFraction:contactTicks/steps,meanContactSlip:contactTicks?slip/contactTicks:null,maxY,outcome:f.body?'on-scene':'lost'});}
   });});
  },settings);
  assert.ok(Math.abs(report.actualDamping-settings.angularDamping)<1e-6);assert.ok(Number.isFinite(report.dx)&&Number.isFinite(report.angularPath));reports.push(report);fs.mkdirSync(path.join(root,'qa'),{recursive:true});fs.writeFileSync(path.join(root,'qa/rolling-comparison.json'),JSON.stringify({reports},null,2));console.log('MEASURE',JSON.stringify(report));
 }
 // At 100% the targets are still 0/16, while physical velocities approach them gradually.
 await page.evaluate(()=>mikanDebug.reset(false));await page.evaluate(()=>mikanDebug.setMotorEnabled(!mikanDebug.motorEnabled));await page.waitForFunction(()=>mikanDebug.mechanics.rollers.every(r=>Math.abs(r.driveSpeed)<1e-4));
 await page.locator('#rollerDifference').fill('100');await page.locator('#rollerSlowdown').fill('100');
 await page.evaluate(()=>{globalThis.driveSamples=[];const d=mikanDebug;globalThis.driveObserver=d.scene.onAfterPhysicsObservable.add(()=>driveSamples.push(d.mechanics.rollers.map(r=>r.driveSpeed)));});await page.evaluate(()=>mikanDebug.setMotorEnabled(!mikanDebug.motorEnabled));await page.waitForFunction(()=>mikanDebug.mechanics.rollers.some(r=>r.targetDriveSpeed===16)&&mikanDebug.mechanics.rollers.every(r=>Math.abs(r.driveSpeed-r.targetDriveSpeed)<1e-4));
 const ramp=await page.evaluate(()=>{mikanDebug.scene.onAfterPhysicsObservable.remove(driveObserver);let maxDelta=0;for(let i=1;i<driveSamples.length;i++)for(let j=0;j<driveSamples[i].length;j++)maxDelta=Math.max(maxDelta,Math.abs(driveSamples[i][j]-driveSamples[i-1][j]));return {steps:driveSamples.length,maxDelta,targets:mikanDebug.mechanics.rollers.filter(r=>r.position.x>=-2&&r.position.x<=2.2).map(r=>r.driveSpeed)};});
 assert.ok(ramp.maxDelta<=6/120+1e-6,JSON.stringify(ramp));assert.equal(ramp.targets.length,14);ramp.targets.forEach((v,i)=>assert.ok(Math.abs(v-(i%2?16:0))<1e-4));console.log('PASS acceleration bound and 100% targets',JSON.stringify(ramp));
 await page.locator('#friction').fill('0');await page.waitForTimeout(100);const zero=await page.evaluate(()=>mikanDebug.mechanics.readRolling());assert.equal(zero.fruitMaterial.friction,0);assert.equal(zero.fruitMaterial.staticFriction,0);assert.equal(zero.rollerMaterial.friction,0);assert.equal(zero.rollerMaterial.staticFriction,0);
 await page.locator('#rollerDifference').fill('10');await page.locator('#rollerSlowdown').fill('22.5');await page.locator('#friction').fill('1');
 const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadPromise;fs.mkdirSync(path.join(root,'qa'),{recursive:true});await download.saveAs(path.join(root,'qa/rolling-export.json'));assert.equal(JSON.parse(fs.readFileSync(path.join(root,'qa/rolling-export.json'),'utf8')).physics.rolling.preset,'combined');
 fs.writeFileSync(path.join(root,'qa/rolling-comparison.json'),JSON.stringify({reports,ramp},null,2));await page.screenshot({path:path.join(root,'qa/rolling-settings.png'),fullPage:true});await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);console.log('PASS preset comparison, backend material readback, zero-friction, export and mobile; transport outcomes are measurements, not forced successes');
}finally{await browser?.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
