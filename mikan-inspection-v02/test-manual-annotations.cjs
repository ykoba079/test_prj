const {chromium}=require('C:/Users/ddydd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=__dirname,siteRoot=path.resolve(root,'..');
const server=http.createServer((req,res)=>{
  const file=path.resolve(siteRoot,'.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(siteRoot+path.sep))return res.writeHead(403).end();
  fs.readFile(file,(e,data)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.html':'text/html','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(data);});
});
(async()=>{let browser;try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url=process.env.MIKAN_TEST_URL||`http://127.0.0.1:${server.address().port}/mikan-inspection-v02/index.html`;
  await page.goto(url+(url.includes('?')?'&':'?')+'detector=color');
  await page.waitForFunction(()=>globalThis.mikanDebug,null,{timeout:90000});
  assert.equal(await page.locator('#addGood,#addMold,#addDamage,#addHidden,#binCount,#clearBins,#autoSpawn,.operation-bar').count(),0);
  assert.equal(await page.evaluate(()=>mikanDebug.autoSpawn),true,'automatic feed continues without the removed checkbox');
  await page.evaluate(()=>mikanDebug.setAutoSpawn(false));await page.evaluate(()=>mikanDebug.setPaused(true));await page.waitForFunction(()=>!mikanDebug.busy);
  const burst=await page.evaluate(()=>{
    const d=mikanDebug;d.reset();
    for(const variant of ['standard','mold-large','damage','mold-large']){document.getElementById('sampleAppearance').value=variant;document.getElementById('addSample').click();}
    document.getElementById('sampleAppearance').value='mold-small';document.getElementById('addSample').click();
    const firstCount=d.fruits.length,markers=[...d.defectMarkers.keys()],badIds=d.fruits.filter(f=>f.debugDefect).map(f=>f.id);
    const automaticBlocked=d.spawn()===null;
    document.getElementById('sampleAppearance').value='standard';for(let i=0;i<9;i++)document.getElementById('addSample').click();
    const positions=d.fruits.map(f=>f.root.position.asArray());let minDistance=Infinity;
    for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++)minDistance=Math.min(minDistance,Math.hypot(...positions[i].map((v,k)=>v-positions[j][k])));
    document.getElementById('addSample').click();
    const cameraLeaks=d.views.flatMap(v=>v.rt.renderList.filter(m=>m.name.startsWith('yolo-defect-')||m.name.startsWith('yolo-label-'))).length;
    return {firstCount,markers,badIds,automaticBlocked,count:d.fruits.length,minDistance,feedback:document.getElementById('spawnFeedback').textContent,cameraLeaks,labels:d.defectLabels.size,attempts:d.attempts.length,positions};
  });
  assert.equal(burst.firstCount,5,'every click creates fruit even with a blocked inlet');assert.deepEqual(burst.markers,burst.badIds);assert.equal(burst.markers.length,4);
  assert.equal(burst.count,14);assert.ok(burst.minDistance>=.74-1e-6);assert.match(burst.feedback,/14/);assert.ok(burst.automaticBlocked);assert.equal(burst.cameraLeaks,0);assert.equal(burst.labels,0);assert.equal(burst.attempts,0);
  const followed=await page.evaluate(()=>{const d=mikanDebug;d.setMotorEnabled(false);d.setPaused(false);const f=d.fruits.find(f=>f.debugDefect);f.root.position.x+=.2;return f.id;});
  await page.waitForFunction(id=>{const d=mikanDebug,f=d.fruits.find(f=>f.id===id),m=d.defectMarkers.get(id);return Math.abs(m.position.x-f.root.position.x)<.02;},followed);
  await page.evaluate(()=>mikanDebug.setPaused(true));
  fs.mkdirSync(path.join(root,'qa'),{recursive:true});await page.screenshot({path:path.join(root,'qa/manual-annotations.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const reset=await page.evaluate(()=>{mikanDebug.reset();return {fruit:mikanDebug.fruits.length,boxes:mikanDebug.defectMarkers.size,labels:mikanDebug.defectLabels.size,annotationMeshes:mikanDebug.scene.meshes.filter(m=>m.name.startsWith('yolo-defect-')||m.name.startsWith('yolo-label-')).length};});assert.deepEqual(reset,{fruit:0,boxes:0,labels:0,annotationMeshes:0});
  await page.evaluate(()=>{mikanDebug.setAutoSpawn(true);mikanDebug.setMotorEnabled(true);mikanDebug.setPaused(false);});await page.waitForFunction(()=>mikanDebug.fruits.length>0,null,{timeout:7000});
  assert.deepEqual(errors,[]);console.log('PASS immediate manual burst, non-overlapping placement, capacity feedback, ground-truth markers, camera exclusion, follow and cleanup',JSON.stringify(burst));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
