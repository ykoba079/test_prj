const {chromium}=require('C:/Users/ddydd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=__dirname,siteRoot=path.resolve(root,'..');
const server=http.createServer((req,res)=>{const file=path.resolve(siteRoot,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(siteRoot+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,data)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.html':'text/html','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(data);});});



(async()=>{let browser;try{
 const {stepContactSearch,CONTACT_SEARCH}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path.join(root,'contact-search.js'),'utf8')).toString('base64'));
 const pending={};for(let i=0;i<30;i++){const r=stepContactSearch(pending,{dt:.05,now:i*.05,nominalY:.92,tcpY:1.10,rollerTopY:0,contact:false,sealed:false});assert.equal(r.reason,null);}assert.equal(pending.depth,0,'joint descent must not spend probe depth');
 const empty={};let result;for(let i=0;i<60;i++){const tcpY=.92-(empty.depth||0);result=stepContactSearch(empty,{dt:.05,now:i*.05,nominalY:.92,tcpY,rollerTopY:.70,contact:false,sealed:false});assert.ok(result.y>=.70+CONTACT_SEARCH.cupBottomOffset+CONTACT_SEARCH.rollerClearance-1e-8);if(result.reason)break;}assert.equal(result.reason,'no-contact');
 const pressure={};assert.equal(stepContactSearch(pressure,{dt:.05,now:100,nominalY:.92,tcpY:.92,rollerTopY:0,contact:true,sealed:false}).reason,null);assert.equal(stepContactSearch(pressure,{dt:.05,now:101.5,nominalY:.92,tcpY:.92,rollerTopY:0,contact:true,sealed:false}).reason,'pressure-timeout');
 console.log('PASS no probe travel spent above target, geometric depth limit and pressure timer after contact');

 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.MIKAN_TEST_URL||`http://127.0.0.1:${server.address().port}/mikan-inspection-v02/index.html?detector=color`);await page.waitForFunction(()=>globalThis.mikanDebug,null,{timeout:90000});await page.locator('#autoSpawn').uncheck();
 const reports=[];for(const diameter of ['0.2','0.25','0.3','0.35','0.4']){
  await page.locator('#rollerDiameter').selectOption(diameter);await page.evaluate(()=>mikanDebug.reset(false));await page.waitForTimeout(100);
  const report=await page.evaluate(()=>{const d=mikanDebug,B=BABYLON,rs=d.mechanics.rollers,r=rs[0],v=r.getVerticesData('position'),width=Math.max(...v.filter((_,i)=>i%3===0))-Math.min(...v.filter((_,i)=>i%3===0));return {diameter:d.mechanics.readRolling().rollerDiameter,width,shapeWidth:r.body.shape.getBoundingBox().extendSize.x*2,pitch:+document.getElementById('rollerPitch').value,height:d.fruitHeight(1.7),calibration:d.support.diameter,bodies:d.scene.getPhysicsEngine().getBodies().length,rollers:rs.length,rendered:d.views.every(v=>rs.every(r=>v.rt.renderList.includes(r)))};});
  assert.ok(Math.abs(report.width-Number(diameter))<1e-5);assert.ok(Math.abs(report.shapeWidth-Number(diameter))<1e-5,JSON.stringify(report));assert.equal(report.diameter,Number(diameter));assert.equal(report.calibration,Number(diameter));assert.ok(report.pitch>Number(diameter)&&report.rendered);assert.equal(report.bodies-report.rollers,20);reports.push(report);
 }
 await page.locator('#removeSlowRollers').check();await page.locator('#rollerDiameter').selectOption('0.2');await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>mikanDebug.mechanics.rollers.filter(r=>r.driveRole==='slow').every(r=>!r.isEnabled()&&r.body.shape.filterCollideMask===0)),true);

 await page.locator('#removeSlowRollers').uncheck();await page.locator('#rollerDiameter').selectOption('0.3');await page.locator('#rollerPitch').selectOption('0.31');
 await page.evaluate(()=>{mikanDebug.setMotorEnabled(false);mikanDebug.detector.detect=async()=>[];});await page.waitForTimeout(1500);
 await page.evaluate(()=>{const d=mikanDebug;d.reset(false);d.spawn(0,false,new BABYLON.Vector3(2.2,.58,0));d.support.heightAt=()=>.48;let frame=10000;globalThis.imageInputHook=d.scene.onBeforeRenderObservable.add(()=>{const now=performance.now()/1000;d.tracker.update([{x:2.2,z:0,defects:['mold'],scores:{mold:.99,mikan:.99}}],now-.1,frame++);});});
 try{await page.waitForFunction(()=>mikanDebug.attempts.some(a=>a.verifiedRise>=.12),null,{timeout:15000});}catch(e){console.log('APP DIAG',JSON.stringify(await page.evaluate(()=>({attempts:mikanDebug.attempts,phase:mikanDebug.activeJob?.phase,pressure:mikanDebug.suction.readout()}))));throw e;}
 const appContact=await page.evaluate(()=>{mikanDebug.scene.onBeforeRenderObservable.remove(imageInputHook);return mikanDebug.attempts[0];});assert.ok(appContact.contactSearch.depth>.08);assert.ok(appContact.fruitRemainsDynamic&&appContact.verifiedRise>=.12);console.log('PASS app contact search and verified Havok lift under deliberately high image calibration',JSON.stringify(appContact));
 // Reproduce a high initial TCP and a fruit below the nominal height in an isolated Havok scene.
 await page.goto(process.env.MIKAN_TEST_URL?new URL('./test-fixtures/suction.html',process.env.MIKAN_TEST_URL).href:`http://127.0.0.1:${server.address().port}/mikan-inspection-v02/test-fixtures/suction.html`);await page.waitForFunction(()=>globalThis.fixture);
 const physical=await page.evaluate(async()=>{
  const {stepContactSearch}=await import('../contact-search.js'),f=fixture,B=BABYLON;
  f.arm.reset({x:2.2,y:1.10,z:0});f.vacuum.reset();f.arm.grip(true);const state={},start=performance.now()/1000;let touched=false,steps=0,minY=10;
  return new Promise(resolve=>{const h=f.scene.onBeforeRenderObservable.add(()=>{const now=performance.now()/1000,read=f.vacuum.readout(),result=stepContactSearch(state,{dt:1/60,now,nominalY:.92,tcpY:f.arm.claw.position.y,rollerTopY:0,contact:read.contact,sealed:read.sealed});steps++;minY=Math.min(minY,f.arm.claw.position.y);if(!touched)f.arm.command({x:2.2,y:result.y,z:0});if(read.contact||read.sealed)touched=true;
   if(f.vacuum.candidate()||result.reason||now-start>8){f.scene.onBeforeRenderObservable.remove(h);resolve({candidate:!!f.vacuum.candidate(),touched,reason:result.reason,state,steps,minY,pressure:read.pressureKPa});}
  });});
 });assert.ok(physical.touched&&physical.candidate,JSON.stringify(physical));assert.ok(physical.state.depth>.08,'must reach below the previous probe limit');assert.equal(physical.reason,null);console.log('PASS high approach and lower fruit acquire real Havok contact and vacuum',JSON.stringify(physical));
 await page.screenshot({path:path.join(root,'qa/diameter-contact.png')});fs.writeFileSync(path.join(root,'qa/diameter-contact.json'),JSON.stringify({reports,physical,appContact},null,2));assert.deepEqual(errors,[]);console.log('PASS five diameter meshes/colliders/calibration, spacing compatibility, removal mask and no body leaks');console.log(JSON.stringify(reports));
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
