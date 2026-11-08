const {chromium}=require('C:/Users/ddydd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=__dirname,siteRoot=path.resolve(root,'..');
const server=http.createServer((req,res)=>{const file=path.resolve(siteRoot,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(siteRoot+path.sep))return res.writeHead(403).end();fs.readFile(file,(error,data)=>{if(error)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.html':'text/html','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{let browser;try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.MIKAN_TEST_URL||`http://127.0.0.1:${server.address().port}/mikan-inspection-v02/index.html?detector=color`);
  await page.waitForFunction(()=>globalThis.mikanDebug,null,{timeout:90000});await page.evaluate(()=>{document.getElementById('optionsPanel').open=true;document.getElementById('diagnosticsPanel').open=true;});await page.evaluate(()=>mikanDebug.setAutoSpawn(false));await page.evaluate(()=>mikanDebug.setPaused(true));await page.waitForFunction(()=>!mikanDebug.busy);
  const trials=[];
  assert.equal(await page.locator('#sampleAppearance option').count(),8);
  await page.evaluate(()=>mikanDebug.reset());await page.selectOption('#sampleAppearance','mold-spots');await page.click('#addSample');
  const selected=await page.evaluate(()=>{const f=mikanDebug.fruits[0];return {count:mikanDebug.fruits.length,patches:f.meshes.filter(m=>m.name.startsWith('surface-defect-')).length,simulatorClass:f.type};});
  assert.equal(selected.count,1);assert.equal(selected.patches,4);assert.equal(selected.simulatorClass,undefined,'appearance selection must not expose a truth class for picking');
  for(const angle of ['0','2','5']){
    await page.selectOption('#slopeAngle',angle);await page.evaluate(()=>{
      const d=mikanDebug;d.reset();globalThis.chuteRun={steps:0,fruits:[],contacts:new Set()};
      for(const z of [-.8,0,.8]){
        const p=d.line.point({x:6.9,y:.58,z}),f=d.spawn(0,false,new BABYLON.Vector3(p.x,p.y,p.z),'standard');chuteRun.fruits.push(f);
        f.body.setLinearVelocity(new BABYLON.Vector3(1.2*d.line.cos,-1.2*d.line.sin,0));
        f.body.getCollisionObservable().add(e=>{for(const b of [e.collider,e.collidedAgainst])if(b?.transformNode?.name?.startsWith('exit-chute-'))chuteRun.contacts.add(f.id);});
      }
      chuteRun.observer=d.scene.onAfterPhysicsObservable.add(()=>chuteRun.steps++);d.setPaused(false);
    });
    await page.waitForFunction(()=>chuteRun.steps>=720,null,{timeout:25000});await page.evaluate(()=>{mikanDebug.setPaused(true);mikanDebug.scene.onAfterPhysicsObservable.remove(chuteRun.observer);});
    const r=await page.evaluate(()=>{const d=mikanDebug,crate=d.scene.meshes.find(m=>m.name.endsWith('-crate-detail')&&Math.abs(m.position.z)<.1),spec=crate.metadata.crate;return {contacts:[...chuteRun.contacts],steps:chuteRun.steps,crate:{x:crate.position.x,y:crate.position.y,z:crate.position.z,...spec},fruits:chuteRun.fruits.map(f=>({id:f.id,retained:d.fruits.includes(f),bin:f.bin,dynamic:f.body?.getMotionType()===BABYLON.PhysicsMotionType.DYNAMIC,p:{x:f.root.position.x,y:f.root.position.y,z:f.root.position.z}}))};});
    assert.equal(r.contacts.length,3,'all fruit must physically contact the chute');
    for(const f of r.fruits){assert.ok(f.retained&&f.dynamic&&f.bin==='good',JSON.stringify(f));assert.ok(Math.abs(f.p.x-r.crate.x)<r.crate.innerHalfX&&Math.abs(f.p.z-r.crate.z)<r.crate.innerHalfZ&&f.p.y>r.crate.y&&f.p.y<r.crate.y+r.crate.wallHeight,JSON.stringify(f));}
    trials.push({angle,...r});console.log('PASS physical chute to good bin',JSON.stringify({angle,contacts:r.contacts,fruits:r.fruits}));
  }
  for(const model of ['two','three']){await page.selectOption('#armModel',model);const hose=await page.evaluate(()=>{const d=mikanDebug;d.arm.command(new BABYLON.Vector3(1.1,1.6,4.25));for(let i=0;i<80;i++)d.arm.step(.04);const path=d.arm.airPath;return {count:path.length,meshCount:d.scene.meshes.filter(m=>m.name==='vacuum-hose').length,start:BABYLON.Vector3.Distance(path[0],new BABYLON.Vector3(3.32,.58,2.35)),end:BABYLON.Vector3.Distance(path.at(-1),d.arm.claw.position.add(new BABYLON.Vector3(0,.025,0))),maxSegment:Math.max(...path.slice(1).map((p,i)=>BABYLON.Vector3.Distance(p,path[i])))};});assert.equal(hose.meshCount,1);assert.equal(hose.count,64);assert.ok(hose.start<1e-6&&hose.end<1e-6&&hose.maxSegment<.35,JSON.stringify(hose));}
  assert.deepEqual(errors,[]);fs.mkdirSync(path.join(root,'qa'),{recursive:true});fs.writeFileSync(path.join(root,'qa/chute-validation.json'),JSON.stringify({trials,errors},null,2));console.log('PASS appearance selector and continuous root-to-cup air hose for both arm models');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
