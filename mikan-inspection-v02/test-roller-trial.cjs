const {chromium}=require('C:/Users/ddydd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=__dirname,siteRoot=path.resolve(root,'..');
const server=http.createServer((req,res)=>{const file=path.resolve(siteRoot,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(siteRoot+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,data)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.html':'text/html','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(data);});});

(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:1150}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.MIKAN_TEST_URL||`http://127.0.0.1:${server.address().port}/mikan-inspection-v02/index.html?detector=color`);await page.waitForFunction(()=>globalThis.mikanDebug,null,{timeout:90000});
 await page.locator('#autoSpawn').uncheck();await page.evaluate(()=>mikanDebug.reset(false));
 assert.equal(await page.locator('#speed').inputValue(),'8');assert.equal(await page.locator('#rollerDifference').inputValue(),'10');assert.equal(await page.locator('#rollerSlowdown').inputValue(),'22.5');
 const cameras=await page.evaluate(()=>({ids:mikanDebug.views.map(v=>v.id),cameraNames:mikanDebug.scene.cameras.map(c=>c.name),housing:!!mikanDebug.scene.getMeshByName('opposite-camera')}));
 assert.deepEqual(cameras.ids,['A','B']);assert.ok(!cameras.cameraNames.includes('inspection-C'));assert.equal(cameras.housing,false);assert.equal(await page.locator('#inspectionC').count(),0);
 await page.waitForFunction(()=>mikanDebug.mechanics.rollers.every(r=>Math.abs(r.driveSpeed-r.targetDriveSpeed)<1e-4));
 const rates=await page.evaluate(()=>mikanDebug.mechanics.rollers.map(r=>({x:r.position.x,s:r.driveSpeed,w:r.body.getAngularVelocity().z})));
 const inside=rates.filter(r=>r.x>=-2&&r.x<=2.2),outside=rates.filter(r=>r.x< -2||r.x>2.2);
 assert.equal(inside.length,14);inside.forEach((r,i)=>{assert.ok(Math.abs(r.s-(i%2?8.8:6.2))<1e-6);assert.ok(Math.abs(r.w+r.s)<1e-4);});assert.ok(outside.every(r=>r.s===8));
 console.log('PASS two cameras only; alternating 6.2/8.8 in trial zone, 8 elsewhere');
 assert.equal(await page.locator('#rollerSlowdown').getAttribute('max'),'100');assert.equal(await page.locator('#rollerDifference').getAttribute('max'),'100');
 await page.locator('#rollerSlowdown').fill('100');await page.locator('#rollerDifference').fill('100');await page.waitForTimeout(100);await page.waitForFunction(()=>mikanDebug.mechanics.rollers.every(r=>Math.abs(r.driveSpeed-r.targetDriveSpeed)<1e-4));
 const extremes=await page.evaluate(()=>mikanDebug.mechanics.rollers.filter(r=>r.position.x>=-2&&r.position.x<=2.2).map(r=>({speed:r.driveSpeed,w:r.body.getAngularVelocity().z})));
 extremes.forEach((r,i)=>{assert.ok(Math.abs(r.speed-(i%2?16:0))<1e-6);assert.ok(Math.abs(r.w+r.speed)<1e-4);});console.log('PASS 14 variable rollers and 100% settings physically drive 0/16 rad/s');
 const reports=[];
 for(const difference of [0,10]){
  await page.locator('#rollerDifference').fill(String(difference));await page.locator('#rollerSlowdown').fill(difference?'22.5':'0');await page.evaluate(()=>mikanDebug.reset(false));
  reports.push(await page.evaluate(async difference=>{
   const f=mikanDebug.spawn(0,false,new BABYLON.Vector3(-1.9,.58,0));f.root.rotationQuaternion=BABYLON.Quaternion.Identity();let steps=0,angle=0,maxY=0,minY=1,maxZ=0,zoneSteps=0;
   return await new Promise(resolve=>{const handle=mikanDebug.scene.onAfterPhysicsObservable.add(()=>{
    const p=f.root.position;angle+=f.body.getAngularVelocity().length()/120;maxY=Math.max(maxY,p.y);minY=Math.min(minY,p.y);maxZ=Math.max(maxZ,Math.abs(p.z));if(p.x<=2.2&&p.x>=-2)zoneSteps++;
    if(++steps>=600){mikanDebug.scene.onAfterPhysicsObservable.remove(handle);resolve({difference,physicsSeconds:steps/120,angleRadians:angle,dx:p.x+1.9,maxY,minY,maxZ,zoneSeconds:zoneSteps/120});}
   });});
  },difference));
 }
 for(const r of reports){if(!process.argv.includes('--report-only'))assert.ok(r.dx>.5,JSON.stringify(r));assert.ok(r.minY>.1&&r.maxY<.9&&r.maxZ<1.3,JSON.stringify(r));}
 console.log('MEASURE physical rotation/transport comparison (not a full-surface guarantee)',JSON.stringify(reports));
 await page.evaluate(()=>mikanDebug.setMotorEnabled(!mikanDebug.motorEnabled));await page.waitForFunction(()=>mikanDebug.mechanics.rollers.every(r=>Math.abs(r.driveSpeed-r.targetDriveSpeed)<1e-4));assert.equal(await page.evaluate(()=>mikanDebug.mechanics.rollers.every(r=>r.driveSpeed===0)),true);
 console.log('PASS motor stop zeros both roller groups');
 await page.evaluate(()=>mikanDebug.setMotorEnabled(!mikanDebug.motorEnabled));await page.locator('#rollerDifference').fill('0');await page.locator('#rollerSlowdown').fill('0');await page.waitForTimeout(100);await page.waitForFunction(()=>mikanDebug.mechanics.rollers.every(r=>Math.abs(r.driveSpeed-r.targetDriveSpeed)<1e-4));assert.equal(await page.evaluate(()=>mikanDebug.mechanics.rollers.every(r=>r.driveSpeed===8)),true);
 await page.locator('#rollerDifference').fill('10');await page.locator('#rollerSlowdown').fill('22.5');await page.waitForTimeout(100);await page.waitForFunction(()=>mikanDebug.mechanics.rollers.every(r=>Math.abs(r.driveSpeed-r.targetDriveSpeed)<1e-4));fs.mkdirSync(path.join(root,'qa'),{recursive:true});await page.screenshot({path:path.join(root,'qa/roller-trial.png'),fullPage:true});
 const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadPromise;await download.saveAs(path.join(root,'qa/roller-trial.json'));const history=JSON.parse(fs.readFileSync(path.join(root,'qa/roller-trial.json'),'utf8'));assert.deepEqual(history.tracking.auxiliaryDefectCameras,['B']);assert.equal(history.picking.rollerTrial.difference,.1);assert.equal(history.picking.rollerTrial.slowdown,.225);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);console.log('PASS comparison control, export, mobile, no page errors');
}finally{await browser?.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
