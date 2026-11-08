const {chromium}=require('C:/Users/ddydd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=__dirname,siteRoot=path.resolve(root,'..');
const server=http.createServer((req,res)=>{const file=path.resolve(siteRoot,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(siteRoot+path.sep))return res.writeHead(403).end();fs.readFile(file,(error,data)=>{if(error)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.html':'text/html','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{let browser;try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.MIKAN_TEST_URL||`http://127.0.0.1:${server.address().port}/mikan-inspection-v02/index.html?detector=color`);
  await page.waitForFunction(()=>globalThis.mikanDebug,null,{timeout:90000});await page.evaluate(()=>{document.getElementById('optionsPanel').open=true;document.getElementById('diagnosticsPanel').open=true;});await page.evaluate(()=>mikanDebug.setAutoSpawn(false));await page.evaluate(()=>mikanDebug.setPaused(true));await page.waitForFunction(()=>!mikanDebug.busy);
  const inspect=()=>page.evaluate(()=>{
    const d=mikanDebug;d.reset();const meshes=d.scene.meshes,rollers=d.mechanics.rollers;
    return {meshes:meshes.length,bodies:d.scene.getPhysicsEngine().getBodies().length,rollers:rollers.length,
      railShells:meshes.filter(m=>m.name==='folded-rail-shell').map(m=>({visible:m.isVisible,proxyVisible:m.parent.isVisible})),oldFlanges:meshes.filter(m=>/folded-(top|bottom)-flange/.test(m.name)).length,
      crateGeometry:meshes.filter(m=>m.name.endsWith('-crate-detail')).map(m=>{m.computeWorldMatrix(true);const b=m.getBoundingInfo().boundingBox;return {ratio:(b.maximumWorld.x-b.minimumWorld.x)/(b.maximumWorld.z-b.minimumWorld.z),foot:b.minimumWorld.y,floor:d.scene.getMeshByName('floor').position.y+.05};}),
      postIntersections:meshes.filter(m=>m.name==='vision-gantry-post').flatMap(post=>meshes.filter(m=>m.name.endsWith('-crate-detail')&&post.intersectsMesh(m,false)).map(m=>m.name)),
      oldCameraPosts:meshes.filter(m=>['camera-post','oblique-camera-support','oblique-camera-bracket'].includes(m.name)).length,
      lensAlignment:d.views.map(v=>{const h=d.scene.getMeshByName(v.id==='A'?'top-camera':'oblique-camera');return BABYLON.Vector3.Dot(BABYLON.Vector3.TransformNormal(BABYLON.Vector3.Down(),h.computeWorldMatrix(true)).normalize(),v.camera.getForwardRay().direction);}),
      cameraOffsets:d.views.map(v=>BABYLON.Vector3.Distance(v.camera.position,d.scene.getMeshByName(v.id==='A'?'top-camera':'oblique-camera').position)),
      crates:meshes.filter(m=>m.name.endsWith('-crate-detail')).length,lights:meshes.filter(m=>m.name==='inspection-light-bar').length,motor:!!d.scene.getMeshByName('drive-motor'),metal:d.scene.getMeshByName('rail').material.getClassName(),
      cameras:d.views.map(v=>{const own=d.scene.getMeshByName(v.id==='A'?'top-camera':'oblique-camera');return {id:v.id,own:v.rt.renderList.some(m=>m===own||m.isDescendantOf(own)),disposed:v.rt.renderList.some(m=>m.isDisposed()),motor:v.rt.renderList.some(m=>m.name==='drive-motor'),decorated:rollers.every(r=>r.getChildMeshes().every(m=>v.rt.renderList.includes(m)))};}),
      slow:rollers.filter(r=>r.driveRole==='slow').every(r=>!r.isEnabled()&&r.body.shape.filterCollideMask===0&&r.getChildMeshes().every(m=>!m.isEnabled())),
      model:d.arm.model,links:d.arm.links.length,diameter:rollers[0].getBoundingInfo().boundingBox.extendSize.x*2,
      floor:d.scene.getMeshByName('floor').position.y,stand:d.scene.getMeshByName('cabinet-stand').getBoundingInfo().boundingBox.minimumWorld.y,
      goodCrate:d.scene.meshes.find(m=>m.name.startsWith('良品-')&&m.name.endsWith('-crate-detail')).position.y,
      goodBottom:d.scene.meshes.find(m=>m.name==='良品-bottom').position.y};
  });
  const checkMounts=r=>{assert.ok(r.lensAlignment.every(d=>d>.999999),JSON.stringify(r.lensAlignment));assert.equal(r.railShells.length,2);assert.ok(r.railShells.every(m=>m.visible&&!m.proxyVisible));assert.equal(r.oldFlanges,0);assert.equal(r.oldCameraPosts,0);assert.deepEqual(r.postIntersections,[]);assert.ok(r.cameraOffsets.every(d=>d<=.002),JSON.stringify(r.cameraOffsets));for(const c of r.crateGeometry){assert.ok(Math.abs(c.ratio-535/370)<1e-5);assert.ok(Math.abs(c.foot-c.floor)<1e-5,'crate feet rest on the room floor');}};
  const initial=await inspect();checkMounts(initial);assert.equal(initial.crates,3);assert.equal(initial.lights,2);assert.ok(initial.motor&&initial.slow);assert.equal(initial.metal,'PBRMaterial');assert.equal(initial.bodies-initial.rollers,23);
  for(const camera of initial.cameras)assert.ok(!camera.own&&!camera.disposed&&camera.motor&&camera.decorated,JSON.stringify(camera));
  const cycles=[];
  for(const pitch of ['0.4','0.6','0.5']){
    await page.selectOption('#fastRollerPitch',pitch);await page.selectOption('#armModel','two');await page.selectOption('#armModel','three');
    const r=await inspect();checkMounts(r);assert.equal(r.bodies-r.rollers,23);assert.equal(r.links,3);for(const camera of r.cameras)assert.ok(!camera.disposed&&camera.decorated&&!camera.own);cycles.push(r);
  }
  assert.equal(cycles.at(-1).meshes,initial.meshes,'rebuilding to the original configuration must not leave decoration meshes');
  for(const angle of ['0','2','5']){await page.selectOption('#slopeAngle',angle);const r=await inspect();checkMounts(r);assert.ok(Math.abs(r.goodCrate-r.goodBottom-.06)<1e-6,'visual crate follows the same sloped exit as its collision body');}
  await page.locator('#removeSlowRollers').uncheck();assert.ok(await page.evaluate(()=>mikanDebug.mechanics.rollers.every(r=>r.isEnabled())));await page.locator('#removeSlowRollers').check();
  await page.evaluate(()=>mikanDebug.setPaused(false));await page.waitForTimeout(400);await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(root,'qa/equipment-detail-validation.json'),JSON.stringify({initial,cycles,errors},null,2));console.log('PASS equipment camera visibility, own housing exclusion, unchanged body count, slope/bin alignment, repeated roller/arm rebuild without stale meshes, mobile layout',JSON.stringify({initialMeshes:initial.meshes,cycles:cycles.map(r=>({meshes:r.meshes,bodies:r.bodies,rollers:r.rollers}))}));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
