const {chromium}=require('C:/Users/ddydd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=__dirname,siteRoot=path.resolve(root,'..');
const server=http.createServer((req,res)=>{const file=path.resolve(siteRoot,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(siteRoot+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,data)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.html':'text/html','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(data);});});

(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:1150}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.MIKAN_TEST_URL||`http://127.0.0.1:${server.address().port}/mikan-inspection-v02/index.html?detector=color`);await page.waitForFunction(()=>globalThis.mikanDebug,null,{timeout:90000});await page.locator('#autoSpawn').uncheck();
 const reports=[];
 for(const degrees of [0,2,5]){
  await page.locator('#slopeAngle').selectOption(String(degrees));await page.evaluate(()=>mikanDebug.reset(false));await page.waitForTimeout(150);
  const calibration=await page.evaluate(async degrees=>{
   const B=BABYLON,d=mikanDebug,g=d.line,vp=new B.Viewport(0,0,640,480),points=[];
   for(const v of d.views)for(const x of [-.5,1.55,2.3,3.1])for(const z of [-.8,.8]){
    const world=new B.Vector3(x,g.heightAt(x),z),vm=v.camera.getViewMatrix(),pm=v.camera.getProjectionMatrix(),pixel=B.Vector3.Project(world,B.Matrix.Identity(),vm.multiply(pm),vp),box={x0:pixel.x,y0:pixel.y,x1:pixel.x,y1:pixel.y},recovered=d.worldAt(box,{viewMatrix:vm,projectionMatrix:pm});
    points.push({camera:v.id,x,z,error:B.Vector3.Distance(world,recovered),diameter:d.projectedFruitDiameter(box,{viewMatrix:vm,projectionMatrix:pm})});
   }
   const {chooseIntercept}=await import('./pick-planning.js?v=20261028-slope'),estimated=[];
   const tracker={pickable:()=>true,predict:()=>({x:1.8,z:0}),uncertainty:()=>0};
   const intercept=chooseIntercept(tracker,{lastSeen:0},0,p=>{estimated.push(p);return .4;},()=>{},x=>g.heightAt(x));
   const first=d.mechanics.rollers[0],last=d.mechanics.rollers.at(-1),bottom=d.scene.meshes.find(m=>m.name==='\u826f\u54c1-bottom');
   return {degrees:g.degrees,points,estimated,intercept,expectedAimY:g.heightAt(1.8),expectedTcpY:g.heightAt(1.8)+.44,reachable:d.arm.canReach(intercept.tcp),first:first.position.asArray(),last:last.position.asArray(),binBottom:bottom.position.asArray(),floorY:d.scene.getMeshByName('floor').position.y};
  },degrees);
  assert.equal(calibration.degrees,degrees);assert.ok(calibration.points.every(p=>p.error<1e-4&&p.diameter>0),JSON.stringify(calibration));assert.ok(calibration.reachable);assert.ok(Math.abs(calibration.intercept.aim.y-calibration.expectedAimY)<1e-8);assert.ok(Math.abs(calibration.intercept.tcp.y-calibration.expectedTcpY)<1e-8);assert.ok(calibration.estimated.every(p=>Math.abs(p.y-calibration.expectedTcpY)<1e-8));if(degrees)assert.ok(calibration.first[1]>calibration.last[1]);
  const motion=await page.evaluate(async()=>{
   const B=BABYLON,d=mikanDebug,g=d.line,p=g.point({x:-4.32,y:.58,z:0}),f=d.spawn(0,false,new B.Vector3(p.x,p.y,p.z)),start=f.root.position.clone();let steps=0,contacts=0,slipSum=0,path=0,spin=0,cameraTicks=0,maxAbove=0;
   return await new Promise(resolve=>{const handle=d.scene.onAfterPhysicsObservable.add(()=>{
    steps++;if(f.body){const state=d.mechanics.rollingStatus(f);if(state.slip!==null){contacts++;slipSum+=state.slip;}const w=f.body.getAngularVelocity();path+=w.length()/120;spin+=w.z/120;if(f.root.position.x>=-1.2&&f.root.position.x<=3.6)cameraTicks++;maxAbove=Math.max(maxAbove,f.root.position.y-g.heightAt(f.root.position.x));}
    if(steps>=960||!f.body){d.scene.onAfterPhysicsObservable.remove(handle);resolve({physicsSeconds:steps/120,dx:f.root.position.x-start.x,dy:f.root.position.y-start.y,contacts:f.contacts,angularPath:path,signedSpinZ:spin,meanSlip:contacts?slipSum/contacts:null,inCameraXSeconds:cameraTicks/120,maxAbovePlane:maxAbove,result:!f.body?'lost':f.sorted?'bin':'on-line'});}
   });});
  });
  assert.ok(Number.isFinite(motion.dx)&&Number.isFinite(motion.angularPath));assert.ok(motion.contacts>0,'Tilted collider must actually contact fruit');reports.push({calibration,motion});console.log('MEASURE',JSON.stringify({degrees,motion}));
 }
 // Drop a retained fruit into the relocated upright basket to check static-body relocation.
 const basket=await page.evaluate(async()=>{
  const d=mikanDebug,bottom=d.scene.meshes.find(m=>m.name==='\u826f\u54c1-bottom'),f=d.spawn(0,false,new BABYLON.Vector3(bottom.position.x,bottom.position.y+.8,bottom.position.z));f.sorted=true;f.bin='good';let ticks=0;
  return await new Promise(resolve=>{const handle=d.scene.onAfterPhysicsObservable.add(()=>{if(++ticks>=240){d.scene.onAfterPhysicsObservable.remove(handle);resolve({fruitY:f.root.position.y,bottomY:bottom.position.y,floorY:d.scene.getMeshByName('floor').position.y});}});});
 });assert.ok(basket.fruitY>basket.bottomY+.25&&basket.fruitY<basket.bottomY+.65,JSON.stringify(basket));assert.ok(basket.floorY<basket.bottomY-.1);
 fs.mkdirSync(path.join(root,'qa'),{recursive:true});fs.writeFileSync(path.join(root,'qa/slope-comparison.json'),JSON.stringify({reports,basket},null,2));await page.screenshot({path:path.join(root,'qa/slope-5.png'),fullPage:true});
 const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadPromise;await download.saveAs(path.join(root,'qa/slope-export.json'));assert.equal(JSON.parse(fs.readFileSync(path.join(root,'qa/slope-export.json'),'utf8')).physics.slope.degrees,5);
 await page.locator('#slopeAngle').selectOption('0');assert.equal(await page.evaluate(()=>mikanDebug.fruits.some(f=>f.sorted)),false);assert.ok(await page.evaluate(()=>Math.abs(mikanDebug.scene.meshes.find(m=>m.name==='\u826f\u54c1-bottom').position.y+1.25)<1e-8));
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);console.log('PASS slope selection, actual contacts, image/world calibration, arm height, relocated basket, reset, export and mobile; outcomes remain measured');
}finally{await browser?.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
