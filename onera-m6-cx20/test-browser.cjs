/* Isolated headless browser test; does not control the user's open tabs. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/ddydd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder = __dirname, root = path.resolve(folder,'..');
const types = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.spz':'application/octet-stream'};
const server = http.createServer((req,res) => {
  const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file = path.resolve(root,'.'+(pathname.endsWith('/') ? pathname+'index.html' : pathname));
  if (!file.startsWith(root+path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file,(error,bytes) => {
    if (error) { res.writeHead(404).end(); return; }
    res.writeHead(200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream'}).end(bytes);
  });
});
let browser;
(async () => {
  try {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    browser = await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const context = await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
    const page = await context.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.route('https://cdn.jsdelivr.net/npm/babylonjs@8.45.3/babylon.js',r=>r.fulfill({path:path.join(root,'onera-m6/work/babylon.js'),contentType:'text/javascript'}));
    await page.route('https://cdn.jsdelivr.net/npm/babylonjs-gui@8.45.3/babylon.gui.min.js',r=>r.fulfill({path:path.join(folder,'work/babylon.gui.min.js'),contentType:'text/javascript'}));
    await page.route('https://cdn.jsdelivr.net/npm/gifenc@1.0.3/+esm',r=>r.fulfill({path:path.join(folder,'work/gifenc.js'),contentType:'text/javascript'}));
    await page.goto(process.env.CX20_TEST_URL || `http://127.0.0.1:${server.address().port}/onera-m6-cx20/`);
    await page.waitForFunction(()=>cx20Viewer.demo?.state.ready || cx20Viewer.errors.length || cx20Viewer.demo?.status.color==='#ffb5b5',null,{timeout:90000});
    const initial=await page.evaluate(()=>({ready:cx20Viewer.demo?.state.ready,status:cx20Viewer.demo?.status.text,errors:cx20Viewer.errors,opts:cx20Viewer.demo?.opts,count:cx20Viewer.demo?.state.flowMesh?.getTotalVertices(),particles:cx20Viewer.demo?.state.particles?.n}));
    assert.equal(initial.ready,true,JSON.stringify(initial));
    assert.equal(initial.count,150000);
    assert.equal(initial.particles,8000);
    assert.equal(initial.opts.surface,'mach');
    assert.equal(initial.opts.anim,true);
    assert.equal(initial.opts.flow,false);
    assert.deepEqual(errors,[]);
    await page.screenshot({path:path.join(folder,'qa/desktop.png')});
    const before=await page.evaluate(()=>Array.from(cx20Viewer.demo.state.particles.p.slice(0,30)));
    await page.waitForTimeout(250);
    const after=await page.evaluate(()=>Array.from(cx20Viewer.demo.state.particles.p.slice(0,30)));
    assert.notDeepEqual(before,after,'Particle positions must advance');
    const cases=[];
    for(const index of [0,1,2,4,3]) {
      await page.evaluate(i=>{cx20Viewer.demo.controls.speedSlider.value=i;cx20Viewer.demo.controls.speedSlider.onPointerUpObservable.notifyObservers({});},index);
      await page.waitForFunction(i=>cx20Viewer.demo.state.activeCaseIndex===i,index,{timeout:90000});
      cases.push(await page.evaluate(()=>({index:cx20Viewer.demo.state.activeCaseIndex,mach:cx20Viewer.demo.state.data.manifest.mach,flow:cx20Viewer.demo.state.flowMesh.getTotalVertices(),field:!!cx20Viewer.demo.state.field})));
    }
    assert.deepEqual(cases.map(c=>c.mach),[.6,.7,.8,.9,.8395]);
    assert.ok(cases.every(c=>c.flow===150000 && c.field));
    await page.evaluate(()=>{
      const d=cx20Viewer.demo;d.opts.flow=true;d.opts.forces=true;d.opts.surface='pressure';d.sync();
      d.controls.slabCheck.isChecked=true;d.controls.etaSlider.value=.65;
    });
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(()=>cx20Viewer.demo.opts.slab),true);
    assert.equal(await page.evaluate(()=>!!cx20Viewer.scene.clipPlane2),true);
    assert.ok(await page.evaluate(()=>cx20Viewer.demo.state.flowMesh.getTotalVertices()<150000));
    await page.screenshot({path:path.join(folder,'qa/section.png')});
    await page.evaluate(()=>cx20Viewer.demo.controls.slabCheck.isChecked=false);
    await page.evaluate(()=>cx20Viewer.demo.setBand(320,420));
    assert.ok(await page.evaluate(()=>cx20Viewer.demo.state.flowMesh.getTotalVertices()<150000));
    await page.evaluate(()=>{const d=cx20Viewer.demo;d.setBand(180,420);d.opts.flow=false;d.opts.forces=false;d.opts.surface='mach';d.sync();});
    const downloadPromise=page.waitForEvent('download',{timeout:90000});
    await page.evaluate(()=>cx20Viewer.demo.recordGif());
    const download=await downloadPromise;
    const gifPath=path.join(folder,'qa/capture.gif');
    await download.saveAs(gifPath);
    const gif=fs.readFileSync(gifPath);
    assert.ok(gif.subarray(0,6).toString().startsWith('GIF8'));
    assert.ok(gif.length>1000 && gif.length<5*1024*1024);
    assert.equal(gif.readUInt16LE(6),640);
    assert.equal(gif.readUInt16LE(8),480);
    await page.evaluate(()=>{
      const ui=cx20Viewer.demo.ui;
      const buttons=ui.rootContainer.getDescendants(false,c=>c instanceof BABYLON.GUI.Button);
      buttons.find(b=>b.textBlock.text==='視点を戻す').onPointerClickObservable.notifyObservers({});
    });
    await page.setViewportSize({width:390,height:844});
    await page.waitForTimeout(500);
    const legends=await page.evaluate(()=>cx20Viewer.demo.layout.legendStack.children.map(c=>({visible:c.isVisible,measure:c._currentMeasure})));
    assert.equal(legends.filter(c=>c.visible).length,2);
    assert.ok(legends.every(c=>c.measure.left>=0 && c.measure.left+c.measure.width<=390));
    await page.screenshot({path:path.join(folder,'qa/mobile.png')});
    await page.locator('#analysisPanel').click();
    assert.equal(await page.evaluate(()=>cx20Viewer.demo.layout.toolCard.isVisible),true);
    assert.equal(await page.evaluate(()=>cx20Viewer.demo.layout.panelCard.isVisible),false);
    await page.screenshot({path:path.join(folder,'qa/mobile-analysis.png')});
    await page.locator('#displayPanel').click();
    assert.equal(await page.evaluate(()=>cx20Viewer.demo.layout.toolCard.isVisible),false);
    assert.equal(await page.evaluate(()=>cx20Viewer.demo.layout.panelCard.isVisible),true);
    await page.screenshot({path:path.join(folder,'qa/mobile-display.png')});
    await page.locator('#closePanel').click();
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(folder,'qa/report.json'),JSON.stringify({initial,cases,gifBytes:gif.length,errors,url:page.url()},null,2));
    console.log(JSON.stringify({initial,cases,gifBytes:gif.length,errors}));
  } finally {
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
