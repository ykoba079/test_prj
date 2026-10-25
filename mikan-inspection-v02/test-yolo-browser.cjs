const {chromium}=require('C:/Users/ddydd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=__dirname,siteRoot=path.resolve(root,'..');
const server=http.createServer((req,res)=>{const file=path.resolve(siteRoot,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(siteRoot+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,data)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.html':'text/html','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{let browser;try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:1150}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url=process.env.MIKAN_TEST_URL||`http://127.0.0.1:${server.address().port}/mikan-inspection-v02/index.html`;
  await page.goto(url);await page.waitForFunction(()=>globalThis.mikanDebug,null,{timeout:90000});
  assert.equal(await page.evaluate(()=>mikanDebug.detector.name),'yolov9-quality-640');
  const associations=await page.evaluate(async()=>{const {associateDetections}=await import('./yolo-detector.js?v=20261025-line-yolo');const box=(label,x1,y1,x2,y2)=>({label,x1,y1,x2,y2,score:.9});return associateDetections([box('mikan',0,0,100,100),box('mikan',110,0,210,100),box('mold',10,10,30,30),box('damage',130,20,150,40),box('mold',250,0,280,30)]);});
  assert.deepEqual(associations.fruits.map(f=>f.defects),[['mold'],['damage']]);assert.equal(associations.unassigned.length,1);
  console.log('PASS actual YOLO startup and image-space defect association');
  assert.equal(await page.evaluate(()=>mikanDebug.detector.execution),'worker');
  await page.locator('#pause').click();await page.waitForFunction(()=>!mikanDebug.busy);
  const responsiveness=await page.evaluate(async()=>{const start=mikanDebug.scene.getFrameId(),t0=performance.now();let ticks=0;const timer=setInterval(()=>ticks++,10);try{await mikanDebug.detector.detect(new ImageData(640,320),.25);return {ticks,frames:mikanDebug.scene.getFrameId()-start,elapsed:performance.now()-t0};}finally{clearInterval(timer);}});
  assert.ok(responsiveness.ticks>=3&&responsiveness.frames>=2,JSON.stringify(responsiveness));console.log('PASS main-thread heartbeat and 3D frames continue during actual worker inference',responsiveness);await page.locator('#pause').click();
  await page.locator('#autoSpawn').uncheck();
  await page.locator('#speed').fill('8');
  for(const [type,kind] of [[2,'damage'],[1,'mold']]){
    // A stationary, camera-facing patch verifies inference deterministically.
    // Natural rolling can legitimately be missed; it is not an accuracy assertion.
    await page.locator('#motor').click();await page.locator('#reset').click();await page.evaluate(type=>{const f=mikanDebug.spawn(type,true,new BABYLON.Vector3(-4.32,.58,0));f.visual.rotationQuaternion=BABYLON.Quaternion.RotationAxis(BABYLON.Axis.X,Math.PI);},type);
    try{await page.waitForFunction(kind=>mikanDebug.records[0]?.defects.has(kind),kind,{timeout:90000});}catch(error){fs.mkdirSync(path.join(root,'qa'),{recursive:true});await page.screenshot({path:path.join(root,'qa/yolo-failed.png'),fullPage:true});console.log('FAILED FIXTURE',JSON.stringify(await page.evaluate(()=>({records:mikanDebug.records.map(f=>({frames:f.frames,evidence:f.evidence,scores:f.scores,state:f.state})),raw:mikanDebug.detector.lastRaw}))));throw error;}
    const evidence=await page.evaluate(()=>{const f=mikanDebug.records[0];return {frames:f.frames,evidence:f.evidence,scores:f.scores,runs:mikanDebug.detector.runs};});assert.ok(evidence.evidence[kind]>=2);assert.ok(evidence.scores[kind]>=.25);console.log('PASS YOLO confirms '+kind,JSON.stringify(evidence));
    await page.locator('#motor').click();
    await page.waitForFunction(()=>mikanDebug.stats.reject===1,null,{timeout:90000});assert.equal(await page.evaluate(()=>mikanDebug.records[0].outcome),'reject');console.log('PASS physical transport and arm reject '+kind);
  }
  const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadPromise;fs.mkdirSync(path.join(root,'qa'),{recursive:true});const historyPath=path.join(root,'qa/yolo-history.json');await download.saveAs(historyPath);const history=JSON.parse(fs.readFileSync(historyPath,'utf8'));assert.equal(history.detector,'yolov9-quality-640');assert.equal(history.confidence,.25);assert.ok(history.records[0].scores.mold>=.25);
  await page.locator('#detector').selectOption('color');await page.waitForFunction(()=>!mikanDebug.switching&&mikanDebug.detector.name==='color-demo');assert.equal(await page.locator('#confidence').isDisabled(),true);
  await page.locator('#detector').selectOption('yolo');await page.waitForFunction(()=>!mikanDebug.switching&&mikanDebug.detector.name==='yolov9-quality-640');assert.equal(await page.locator('#confidence').isDisabled(),false);
  await page.locator('#confidence').fill('40');await page.locator('#confidence').dispatchEvent('change');assert.equal(await page.evaluate(()=>mikanDebug.records.length),3);assert.equal(await page.evaluate(()=>mikanDebug.records.every(f=>!f.defects.size)),true);
  await page.waitForFunction(()=>mikanDebug.detector.runs>4);await page.locator('#pause').click();await page.waitForFunction(()=>!mikanDebug.busy);assert.ok(await page.evaluate(()=>mikanDebug.records.every(f=>f.frames<=2)),'stale inference must not leak into reset history');
  await page.screenshot({path:path.join(root,'qa/yolo-line.png'),fullPage:true});await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);console.log('PASS export, detector switch, threshold reset, mobile layout, no page errors');
  const failedContext=await browser.newContext();await failedContext.route('**/quality-640/mikan.onnx',route=>route.abort());const failed=await failedContext.newPage();await failed.goto(url);await failed.waitForFunction(()=>document.getElementById('loadMessage').getAttribute('role')==='alert',null,{timeout:60000});assert.equal(await failed.evaluate(()=>!!globalThis.mikanPreview&&!globalThis.mikanDebug),true);assert.equal(await failed.locator('#colorFallback').isVisible(),true);assert.equal(await failed.locator('#addGood').isDisabled(),true);console.log('PASS model failure retains static preview and explicit fallback, never silently uses color');
}finally{await browser?.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
