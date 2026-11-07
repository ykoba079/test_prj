// Samples moving arm links/joints against visual camera and light equipment.
// This checks representative paths, not continuous collision or every reachable pose.
const {chromium}=require('C:/Users/ddydd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=__dirname,siteRoot=path.resolve(root,'..');
const server=http.createServer((req,res)=>{const file=path.resolve(siteRoot,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(siteRoot+path.sep))return res.writeHead(403).end();fs.readFile(file,(error,data)=>{if(error)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.html':'text/html','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{let browser;try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.MIKAN_TEST_URL||`http://127.0.0.1:${server.address().port}/mikan-inspection-v02/index.html?detector=color`);
  await page.waitForFunction(()=>globalThis.mikanDebug,null,{timeout:90000});await page.locator('#autoSpawn').uncheck();await page.evaluate(()=>mikanDebug.setPaused(true));await page.waitForFunction(()=>!mikanDebug.busy);
  const sweepResults=[];
  for(const angle of ['0','5'])for(const model of ['two','three']){
    await page.selectOption('#slopeAngle',angle);await page.selectOption('#armModel',model);
    const sweep=await page.evaluate(async()=>{
      const {DROP_POINTS}=await import('./arm-kinematics.js?v=20261107-clearance');
      const d=mikanDebug,obstacles=d.scene.meshes.filter(m=>['inspection-light-bar','light-diffuser','light-support','light-mount','camera-hanger','camera-adjustment-plate','camera-lens-barrel','camera-lens-bezel','camera-lens-glass','camera-mount','top-camera','oblique-camera','vision-camera-crossarm','vision-gantry-top','vision-gantry-post'].includes(m.name)),collisions=[];let reachable=0,samples=0;
      const moving=d.scene.meshes.filter(m=>m.name.startsWith('robot-rigid-link-')||m.name.startsWith('robot-joint-'));
      for(const x of [.6,2.4,4.5])for(const z of [-.8,.8]){
        d.arm.reset();const drop=DROP_POINTS[x<2.5?'reject':'unknown'];
        const targets=[{x,y:1.5,z},{x,y:d.fruitHeight(x)+.45,z},{x,y:1.6,z},{...drop,y:1.6},drop,{...drop,y:1.6},{x:2.3,y:1.7,z:1}];
        for(const target of targets){if(!d.arm.canReach(target))continue;reachable++;d.arm.command(target);
          for(let i=0;i<75;i++){d.arm.step(.04);samples++;for(const m of [...moving,...obstacles])m.computeWorldMatrix(true);
            for(const a of moving)for(const b of obstacles)if(a.intersectsMesh(b,true)&&!collisions.some(c=>c.arm===a.name&&c.obstacleId===b.uniqueId))collisions.push({arm:a.name,obstacle:b.name,obstacleId:b.uniqueId,target});
          }
        }
      }
      d.arm.reset();return {model:d.arm.model,collisions,reachable,samples};
    });sweepResults.push({angle,...sweep});console.log('SWEEP',JSON.stringify({angle,...sweep}));assert.deepEqual(sweep.collisions,[]);assert.ok(sweep.reachable>20);
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(root,'qa/equipment-clearance-validation.json'),JSON.stringify({sweepResults,errors},null,2));console.log('PASS sampled visual equipment clearance for both arm models and 0/5 degree slopes');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
