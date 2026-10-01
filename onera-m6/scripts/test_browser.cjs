/* Isolated headless integration test; does not operate an existing browser. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/ddydd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.spz': 'application/octet-stream' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, bytes) => {
    if (error) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }).end(bytes);
  });
});
let browser;
(async () => {
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = `http://127.0.0.1:${server.address().port}/`;
    browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('https://cdn.jsdelivr.net/npm/babylonjs@8.45.3/babylon.js', route => route.fulfill({ path: path.join(root,'work/babylon.js'), contentType: 'text/javascript' }));
    await page.route('https://cdn.jsdelivr.net/npm/babylonjs-loaders@8.45.3/babylonjs.loaders.min.js', route => route.fulfill({ path: path.join(root,'work/babylonjs.loaders.min.js'), contentType: 'text/javascript' }));
    await page.route('https://unpkg.com/fflate/**', route => route.fulfill({ path: path.join(root,'work/fflate.js'), contentType: 'text/javascript' }));
    await page.goto(process.env.ONERA_TEST_URL || address);
    await page.waitForFunction(() => window.oneraViewer?.ready || window.oneraViewer?.errors.length, { timeout: 60000 });
    const ready = await page.evaluate(() => ({ ready: oneraViewer.ready, errors: oneraViewer.errors, counts: oneraViewer.flow.map(mesh => mesh.getTotalVertices()), meshes: oneraViewer.wing.length }));
    assert.equal(ready.ready, true, JSON.stringify(ready));
    assert.equal(ready.meshes, 2);
    assert.equal(ready.counts[0], 150000);
    assert.equal(await page.locator('#count').textContent(), '150,000');
    assert.equal(await page.locator('#surface').inputValue(), 'pressure');
    assert.equal(await page.evaluate(() => oneraViewer.wing[0].useVertexColors), true);
    assert.deepEqual(errors, []);
    const caseChecks=[];
    for (const index of [0,1,2,4,3]) {
      await page.locator('#speed').fill(String(index));
      await page.waitForFunction(i => oneraViewer.activeCaseIndex === i && !oneraViewer.loading, index, { timeout: 60000 });
      const check = await page.evaluate(() => ({
        index:oneraViewer.activeCaseIndex,mach:oneraViewer.manifest.mach,
        velocity:oneraViewer.manifest.freestream_velocity_m_s,
        count:oneraViewer.flow[0].getTotalVertices(),
        sceneMeshes:oneraViewer.wing[0].getScene().meshes.length,
        meshNames:oneraViewer.wing[0].getScene().meshes.map(mesh=>({name:mesh.name,type:mesh.getClassName()})),
        cpRange:oneraViewer.manifest.wing.cp_range,
        colors:Array.from(oneraViewer.wing[0].getVerticesData(BABYLON.VertexBuffer.ColorKind).slice(0,32)),
        residual:oneraViewer.manifest.convergence['rms[Rho]'],
        error:oneraViewer.lastSwitchError
      }));
      assert.equal(check.index,index);
      assert.equal(check.mach,[.6,.7,.8,.8395,.9][index]);
      assert.equal(check.count,150000);
      // Babylon creates one camera-support mesh per Gaussian mesh.
      assert.equal(check.sceneMeshes,6);
      assert.equal(check.meshNames.filter(mesh=>mesh.type==='GaussianSplattingMesh').length,2);
      assert.equal(check.error,null);
      assert.ok(check.residual < -11);
      assert.equal(await page.locator('#velocity').textContent(),`${Math.round(check.velocity)} m/s`);
      assert.equal(await page.evaluate(() => oneraViewer.wing[0].useVertexColors),true);
      caseChecks.push(check);
      await page.screenshot({path:path.join(root,`qa/speed-${index}.png`)});
    }
    assert.notDeepEqual(caseChecks[0].colors,caseChecks[3].colors);
    const failedPressure = '**/cases/m080/pressure.json*';
    await page.route(failedPressure,route => route.fulfill({status:200,contentType:'application/json',body:'{"cp":[],"colors":[]}'}));
    await page.locator('#speed').fill('2');
    await page.waitForFunction(() => oneraViewer.lastSwitchError !== null && !oneraViewer.loading);
    assert.equal(await page.evaluate(() => oneraViewer.activeCaseIndex),3);
    assert.equal(await page.locator('#speed').inputValue(),'3');
    assert.equal(await page.evaluate(() => oneraViewer.wing[0].getScene().meshes.length),6);
    await page.unroute(failedPressure);
    await page.locator('#speed').fill('2');
    await page.waitForFunction(() => oneraViewer.activeCaseIndex === 2 && !oneraViewer.loading);
    assert.equal(await page.evaluate(() => oneraViewer.lastSwitchError),null);
    // Fast dragging: only the last choice can become the visible result.
    await page.locator('#speed').fill('0');
    await page.locator('#speed').fill('4');
    await page.locator('#speed').fill('1');
    await page.waitForFunction(() => oneraViewer.activeCaseIndex === 1 && !oneraViewer.loading);
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => oneraViewer.activeCaseIndex),1);
    await page.locator('#speed').fill('3');
    await page.waitForFunction(() => oneraViewer.activeCaseIndex === 3 && !oneraViewer.loading);
    await page.screenshot({ path: path.join(root,'qa/desktop-flow.png') });
    await page.locator('#flow').uncheck();
    await page.locator('#surface').selectOption('pressure');
    await page.locator('#top').click();
    await page.waitForFunction(() => Math.abs(oneraViewer.wing[0].getScene().activeCamera.beta - 0.02) < 0.001);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(root,'qa/desktop-pressure.png') });
    console.log('pressure geometry',JSON.stringify(await page.evaluate(() => ({
      wing:oneraViewer.wing.map(mesh=>({name:mesh.name,enabled:mesh.isEnabled(),min:mesh.getBoundingInfo().boundingBox.minimum.asArray(),max:mesh.getBoundingInfo().boundingBox.maximum.asArray()})),
      camera: {position:oneraViewer.wing[0].getScene().activeCamera.position.asArray(),up:oneraViewer.wing[0].getScene().activeCamera.upVector.asArray()}
    }))));
    assert.equal(await page.evaluate(() => oneraViewer.wing[0].useVertexColors), true);
    await page.locator('#forces').check();
    await page.locator('#reset').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(root,'qa/desktop-forces.png') });
    await page.locator('#mirror').uncheck();
    assert.equal(await page.evaluate(() => oneraViewer.wing[1].isEnabled()), false);
    await page.locator('#speed').fill('0');
    await page.waitForFunction(() => oneraViewer.activeCaseIndex === 0 && !oneraViewer.loading);
    assert.equal(await page.evaluate(() => oneraViewer.wing[1].isEnabled()), false);
    assert.equal(await page.evaluate(() => oneraViewer.flow[0].isEnabled()), false);
    assert.equal(await page.evaluate(() => oneraViewer.forces[0].isEnabled()), true);
    await page.screenshot({ path: path.join(root,'qa/desktop-half.png') });
    await page.locator('#mirror').check();
    await page.locator('#flow').check();
    await page.locator('#forces').uncheck();
    await page.locator('#surface').selectOption('pressure');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(root,'qa/mobile-flow.png') });
    const layout = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth, panel: document.querySelector('.panel').getBoundingClientRect().toJSON() }));
    assert.equal(layout.scroll, layout.width);
    assert.ok(layout.panel.x >= 0 && layout.panel.right <= layout.width);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(root,'qa/browser-report.json'), JSON.stringify({ ready, caseChecks, layout, errors, url: process.env.ONERA_TEST_URL || address, note: 'Isolated headless Edge with software WebGL; CDN bytes served from matching downloaded version.' }, null, 2));
    console.log(JSON.stringify({ ready, caseChecks, layout, errors }));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
