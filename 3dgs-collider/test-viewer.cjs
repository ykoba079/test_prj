const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const source = html.split('<script type="module">')[1].split('</script>')[0];
new Function(source);

class Vector3 {
  constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); }
  clone() { return new Vector3(this.x, this.y, this.z); }
  minimizeInPlace(p) { for (const a of ['x', 'y', 'z']) this[a] = Math.min(this[a], p[a]); }
  maximizeInPlace(p) { for (const a of ['x', 'y', 'z']) this[a] = Math.max(this[a], p[a]); }
}
const context = vm.createContext({ BABYLON: { Vector3 }, ui: { fitBoxesInput: { checked: true } } });
vm.runInContext(source.slice(source.indexOf('    function createPointDistribution'), source.indexOf('    function makePreviewBox')), context);
const distribution = context.createPointDistribution();
context.addDistributionPoint(distribution, new Vector3(0.1, 0.2, 0.1));
context.addDistributionPoint(distribution, new Vector3(0.2, 0.2, 0.3));
const center = new Vector3(0.5, 0.5, 0.5), size = new Vector3(1, 1, 1);
const fitted = context.fitBoxToDistribution(center, size, distribution);
assert.ok(fitted.size.x < 0.25 && fitted.size.y < 0.15 && fitted.size.z < 0.35);
for (const axis of ['x', 'y', 'z']) {
  assert.ok(fitted.center[axis] - fitted.size[axis] / 2 <= distribution.min[axis]);
  assert.ok(fitted.center[axis] + fitted.size[axis] / 2 >= distribution.max[axis]);
}
const floor = context.fitBoxToDistribution(center, new Vector3(1, 0.04, 1), distribution, true);
assert.equal(floor.size.y, 0.04);
assert.ok(Math.abs(floor.center.y + floor.size.y / 2 - 0.2) < 1e-10);
context.ui.fitBoxesInput.checked = false;
assert.equal(context.fitBoxToDistribution(center, size, distribution).size, size);
console.log('Syntax and point-distribution geometry checks passed.');

if (!process.argv.includes('--browser')) process.exit(0);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/ddydd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const hook = '\nwindow.viewerQA = { state, scene, engine, ui, camera, landingMarker, dropGuide, spawnBall, dropBalls, clearBalls, buildDensityPreview, BASIN_RECESS_LOCAL, localToWorld, pointerPosition };\n';
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  if (file === path.join(__dirname, 'index.html')) {
    return res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html.replace('</script>\n</body>', hook + '</script>\n</body>').replace('</script>\r\n</body>', hook + '</script>\r\n</body>'));
  }
  fs.readFile(file, (error, data) => {
    if (error) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': path.extname(file) === '.js' ? 'text/javascript' : 'application/octet-stream' }).end(data);
  });
});
let browser;
(async () => {
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/3dgs-collider/index.html`);
    await page.waitForFunction(() => window.viewerQA?.state.mesh && viewerQA.state.physicsReady, null, { timeout: 90000 });
    await page.evaluate(() => viewerQA.scene.whenReadyAsync());
    await page.waitForTimeout(1500);
    const pointer = await page.evaluate(() => {
      const target = viewerQA.localToWorld(viewerQA.BASIN_RECESS_LOCAL);
      const origin = viewerQA.pointerPosition();
      return { dx: origin.x - target.x, dz: origin.z - target.z, height: origin.y };
    });
    assert.ok(Math.abs(pointer.dx) <= 0.005 && Math.abs(pointer.dz) <= 0.005);
    assert.ok(Math.abs(pointer.height - 2) < 0.005);
    const output = path.join(os.tmpdir(), '3dgs-collider-qa');
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, 'initial-target.png') });
    if (process.argv.includes('--view-only')) {
      const alpha = await page.evaluate(() => viewerQA.camera.alpha);
      assert.ok(Math.abs(alpha - (-1.2 + 120 * Math.PI / 180)) < 1e-8);
      await page.evaluate(() => { viewerQA.camera.alpha = 0; });
      await page.click('#resetButton');
      assert.ok(Math.abs(await page.evaluate(() => viewerQA.camera.alpha) - alpha) < 1e-8);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: path.join(output, 'mobile-camera.png') });
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ alpha, pointer, screenshots: output }));
      return;
    }
    await page.click('#selectDropButton');
    assert.equal(await page.getAttribute('#selectDropButton', 'aria-pressed'), 'true');
    await page.mouse.click(20, 220);
    assert.equal(await page.getAttribute('#selectDropButton', 'aria-pressed'), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await page.getAttribute('#selectDropButton', 'aria-pressed'), 'false');
    async function selectablePoint(mobile = false) {
      return page.evaluate(mobile => {
        const { scene, camera, engine, state, localToWorld } = viewerQA;
        const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
        const candidates = state.densityBoxes.map(box => {
          const p = localToWorld(box.localCenter);
          p.y += box.mesh.scaling.y * 0.5;
          const screen = BABYLON.Vector3.Project(p, BABYLON.Matrix.Identity(), scene.getTransformMatrix(), viewport);
          return { x: screen.x, y: screen.y };
        }).filter(p => p.x > 20 && p.x < (mobile ? innerWidth - 20 : 1000) && p.y > (mobile ? 420 : 250) && p.y < innerHeight - 50);
        candidates.sort((a, b) => Math.hypot(a.x - (mobile ? 195 : 680), a.y - (mobile ? 510 : 355)) - Math.hypot(b.x - (mobile ? 195 : 680), b.y - (mobile ? 510 : 355)));
        for (const p of candidates) {
          const hit = scene.pick(p.x, p.y, m => m.metadata?.dropCollider === true);
          if (hit?.hit) return { ...p, hit: { x: hit.pickedPoint.x, y: hit.pickedPoint.y, z: hit.pickedPoint.z } };
        }
        return null;
      }, mobile);
    }
    await page.click('#selectDropButton');
    const selected = await selectablePoint();
    assert.ok(selected);
    await page.mouse.click(selected.x, selected.y);
    assert.equal(await page.getAttribute('#selectDropButton', 'aria-pressed'), 'false');
    const selection = await page.evaluate(() => ({ x: viewerQA.pointerPosition().x, z: viewerQA.pointerPosition().z,
      offset: viewerQA.pointerPosition().y - viewerQA.localToWorld(viewerQA.state.dropSurfaceLocal).y,
      marker: viewerQA.landingMarker.isEnabled(), guide: viewerQA.dropGuide.isEnabled() }));
    assert.ok(Math.abs(selection.x - selected.hit.x) < 0.011 && Math.abs(selection.z - selected.hit.z) < 0.011);
    assert.equal(selection.marker, true);
    assert.equal(selection.guide, true);
    await page.click('#controlsToggle');
    await page.locator('#pointerYInput').fill('2.5');
    assert.ok(Math.abs(await page.evaluate(() => viewerQA.pointerPosition().y - viewerQA.localToWorld(viewerQA.state.dropSurfaceLocal).y) - 2.5) < 1e-8);
    await page.click('#controlsToggle');
    await page.click('#dropMixedButton');
    await page.waitForFunction(() => viewerQA.state.balls.length === 50, null, { timeout: 30000 });
    const result = await page.evaluate(() => {
      const sizes = viewerQA.state.balls.map(b => b.mesh.getBoundingInfo().boundingBox.extendSize.x * 2);
      return { large: sizes.filter(d => d > 0.1).length, small: sizes.filter(d => d < 0.1).length,
        colliders: viewerQA.state.densityBoxes.filter(b => b.aggregate).length };
    });
    assert.equal(result.large, 25);
    assert.equal(result.small, 25);
    assert.ok(result.colliders > 0);
    await page.click('#clearBallsButton');
    await page.click('#dropSmallButton');
    await page.waitForFunction(() => viewerQA.state.balls.length === 50);
    assert.ok(await page.evaluate(() => viewerQA.state.balls.every(b => b.mesh.getBoundingInfo().boundingBox.extendSize.x * 2 < 0.1)));
    await page.click('#clearBallsButton');
    await page.click('#dropLargeButton');
    await page.waitForFunction(() => viewerQA.state.balls.length === 50);
    assert.ok(await page.evaluate(() => viewerQA.state.balls.every(b => b.mesh.getBoundingInfo().boundingBox.extendSize.x * 2 > 0.1)));
    await page.click('#controlsToggle');
    await page.uncheck('#fitBoxesInput');
    const coarseVolume = await page.evaluate(() => viewerQA.state.densityBoxes.reduce((v, b) => v + b.localSize.x * b.localSize.y * b.localSize.z, 0));
    await page.check('#fitBoxesInput');
    const fittedVolume = await page.evaluate(() => viewerQA.state.densityBoxes.reduce((v, b) => v + b.localSize.x * b.localSize.y * b.localSize.z, 0));
    assert.ok(fittedVolume < coarseVolume);
    await page.screenshot({ path: path.join(output, 'desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click('#controlsToggle');
    await page.click('#selectDropButton');
    const touchPoint = await selectablePoint(true);
    assert.ok(touchPoint);
    await page.touchscreen.tap(touchPoint.x, touchPoint.y);
    assert.equal(await page.getAttribute('#selectDropButton', 'aria-pressed'), 'false');
    await page.screenshot({ path: path.join(output, 'mobile.png') });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ...result, pointer, selection, touchSelection: true, coarseVolume, fittedVolume, screenshots: output }));
  } finally {
    await browser?.close();
    server.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
