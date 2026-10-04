/* Isolated rendering and interaction checks. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/ddydd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder=__dirname,root=path.resolve(folder,'..');
const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.gz':'application/gzip'};
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(err,bytes)=>{if(err){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(bytes);});
});
let browser;
(async()=>{try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage();
  const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>requests.push(r.url()));
  await page.route('https://cdn.jsdelivr.net/npm/babylonjs@8.45.3/babylon.js',r=>r.fulfill({path:path.join(root,'onera-m6/work/babylon.js'),contentType:'text/javascript'}));
  await page.route('https://cdn.jsdelivr.net/npm/gifenc@1.0.3/+esm',r=>r.fulfill({path:path.join(folder,'work/gifenc.js'),contentType:'text/javascript'}));
  await page.goto(process.env.FLOW_TEST_URL||`http://127.0.0.1:${server.address().port}/onera-m6-flow/`);
  await page.waitForFunction(()=>flowViewer.demo?.state.ready||flowViewer.errors.length||flowViewer.demo?.state.errors.length,null,{timeout:90000});
  const initial=await page.evaluate(()=>({ready:flowViewer.demo?.state.ready,errors:[...flowViewer.errors,...(flowViewer.demo?.state.errors||[])],surface:flowViewer.demo?.opts.surface,count:flowViewer.demo?.state.shownParticles,meshes:flowViewer.scene?.meshes.map(m=>m.getClassName())}));
  assert.equal(initial.ready,true,JSON.stringify(initial));assert.equal(initial.surface,'pressure');assert.ok(initial.count>0&&initial.count<=16000);assert.ok(initial.meshes.every(m=>m!=='GaussianSplattingMesh'));
  assert.equal(requests.filter(u=>/\.spz(\?|$)/.test(u)).length,0);
  await page.screenshot({path:path.join(folder,'qa/desktop.png')});
  const positions=()=>page.evaluate(()=>Array.from(flowViewer.demo.S.p.slice(0,90)));
  const before=await positions();await page.waitForTimeout(250);assert.notDeepEqual(await positions(),before);
  await page.locator('#pause').click();const paused=await positions();await page.waitForTimeout(250);assert.deepEqual(await positions(),paused);await page.locator('#pause').click();
  for(const id of ['particles','section','eta','etaLabel','thickness','thickLabel','sectionView','mirror','wingVisible','vmin','vmax'])assert.equal(await page.locator('#'+id).count(),0);
  const alwaysShown=()=>page.evaluate(()=>({wings:flowViewer.demo.state.wing.map(m=>m.isEnabled()),particles:flowViewer.scene.getMeshByName('moving-particles').isEnabled(),clipped:!!(flowViewer.scene.clipPlane||flowViewer.scene.clipPlane2),count:flowViewer.demo.state.shownParticles}));
  const full=await alwaysShown();assert.deepEqual(full.wings,[true,true]);assert.equal(full.particles,true);assert.equal(full.clipped,false);assert.equal(full.count%2,0);
  await page.locator('#top').click();assert.ok((await page.evaluate(()=>flowViewer.scene.activeCamera.beta))<.03);await page.locator('#home').click();
  await page.locator('#advanced').evaluate(e=>e.open=true);
  for(const id of ['pause','animSpeed','reseed','fast','slow','all','surface'])assert.equal(await page.locator('#'+id).isDisabled(),false);
  await page.locator('#animSpeed').fill('1.5');assert.equal(await page.evaluate(()=>flowViewer.demo.opts.animSpeed),1.5);await page.locator('#animSpeed').fill('1');
  await page.locator('#reseed').click();assert.ok((await alwaysShown()).count>0);
  const cases=[];
  for(const i of [0,1,2,4,3]){
    await page.locator('#speed').fill(String(i));await page.waitForFunction(i=>flowViewer.demo.state.activeCaseIndex===i&&!flowViewer.demo.state.loading,i,{timeout:90000});
    cases.push(await page.evaluate(()=>({index:flowViewer.demo.state.activeCaseIndex,mach:flowViewer.demo.state.data.manifest.mach,velocityRange:flowViewer.demo.state.data.manifest.grid_speed_range_m_s,surfaceMach:flowViewer.demo.state.data.manifest.surface_mach})));
    const visible=await alwaysShown();assert.deepEqual(visible.wings,[true,true]);assert.equal(visible.particles,true);assert.equal(visible.clipped,false);assert.ok(visible.count>0&&visible.count%2===0);
  }
  assert.deepEqual(cases.map(c=>c.mach),[.6,.7,.8,.9,.8395]);assert.ok(cases.every(c=>c.surfaceMach.includes('not Cp inversion')));
  assert.ok(Number.isFinite(parseFloat(await page.locator('#criticalCp').textContent())));
  const supArea=parseFloat(await page.locator('#supersonicArea').textContent());assert.ok(supArea>=0&&supArea<=100);
  await page.locator('#speed').fill('0');await page.waitForFunction(()=>flowViewer.demo.state.activeCaseIndex===0&&!flowViewer.demo.state.loading);
  await page.locator('#fast').click();assert.equal(await page.evaluate(()=>flowViewer.demo.filter(220)),true);assert.equal(await page.evaluate(()=>flowViewer.demo.filter(200)),false);
  await page.locator('#slow').click();assert.equal(await page.evaluate(()=>flowViewer.demo.filter(190)),true);assert.equal(await page.evaluate(()=>flowViewer.demo.filter(204)),false);
  await page.locator('#all').click();assert.equal(await page.evaluate(()=>flowViewer.demo.filter(95)&&flowViewer.demo.filter(459)),true);
  await page.locator('#surface').selectOption('mach');await page.locator('#forces').check();assert.equal(await page.locator('#cpLegend').isVisible(),true);assert.equal(await page.locator('#machLegend').isVisible(),true);
  await page.screenshot({path:path.join(folder,'qa/forces-mach.png')});
  await page.locator('#surface').selectOption('solid');assert.deepEqual((await alwaysShown()).wings,[true,true]);assert.equal(await page.locator('#surface').isDisabled(),false);
  await page.locator('#forces').uncheck();await page.locator('#surface').selectOption('pressure');
  await page.locator('#advanced').evaluate(e=>e.open=false);await page.locator('#sharing').evaluate(e=>e.open=true);
  const downloadPromise=page.waitForEvent('download',{timeout:90000});await page.locator('#gif').click();const download=await downloadPromise;const gifPath=path.join(folder,'qa/capture.gif');await download.saveAs(gifPath);
  const gif=fs.readFileSync(gifPath);assert.ok(gif.subarray(0,6).toString().startsWith('GIF8'));assert.equal(gif.readUInt16LE(6),640);assert.equal(gif.readUInt16LE(8),480);
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(400);await page.screenshot({path:path.join(folder,'qa/mobile.png')});
  await page.locator('#menu').click();assert.equal(await page.locator('#panel').isVisible(),true);await page.screenshot({path:path.join(folder,'qa/mobile-menu.png')});
  const bounds=await page.locator('#panel').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390);await page.locator('#menu').click();assert.equal(await page.locator('#panel').isVisible(),false);
  assert.deepEqual(errors,[]);assert.equal(requests.filter(u=>/\.spz(\?|$)/.test(u)).length,0);
  fs.writeFileSync(path.join(folder,'qa/report.json'),JSON.stringify({initial,cases,gifBytes:gif.length,errors,url:page.url(),spzRequests:0},null,2));console.log(JSON.stringify({initial,cases,gifBytes:gif.length,errors}));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
