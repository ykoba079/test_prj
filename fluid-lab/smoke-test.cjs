// Optional browser smoke check. Run against a local HTTP server:
// PLAYWRIGHT_MODULE=/path/to/playwright node fluid-lab/smoke-test.cjs
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000},ignoreHTTPSErrors:true});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://localhost:8000/fluid-lab/?webgl=1');
    await page.waitForFunction(()=>window.fluidLab?.getSnapshot().time>.3);
    assert.equal(await page.locator('#viscosity, #water, #quality, #slow, #pause, [data-view]').count(),0);
    const actions=page.locator('.experiment-actions');
    assert.equal(await actions.locator('button').count(),2);
    assert(await actions.isVisible());
    await page.locator('[data-shape=box]').click();
    await page.locator('#action').click();
    await page.waitForFunction(()=>fluidLab.getSnapshot().bodies.length===1);
    assert.equal(await page.evaluate(()=>fluidLab.getSnapshot().bodies[0].shape),'box');
    await page.locator('#reset').click();
    await page.waitForFunction(()=>fluidLab.getSnapshot().bodies.length===0);
    await page.locator('[data-mode=dam]').click();
    await page.waitForFunction(()=>fluidLab.getSnapshot().mode==='dam'&&fluidLab.getSnapshot().time>.1);
    await page.locator('#action').click();
    await page.waitForFunction(()=>fluidLab.getSnapshot().released&&fluidLab.getSnapshot().time>1.2);
    assert(await page.evaluate(()=>fluidLab.getSnapshot().positions.some((x,i)=>i%3===0&&x>1)));
    await page.locator('#reset').click();
    await page.waitForFunction(()=>!fluidLab.getSnapshot().released);
    await page.setViewportSize({width:390,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(os.tmpdir(),'fluid-lab-mobile-preview.png'),fullPage:true});
    await page.setViewportSize({width:1440,height:1000});
    await page.locator('[data-mode=tank]').click();
    await page.waitForFunction(()=>fluidLab.getSnapshot().mode==='tank'&&fluidLab.getSnapshot().time>.3);
    await page.screenshot({path:path.join(os.tmpdir(),'fluid-lab-preview.png')});
    assert.deepEqual(errors,[]);
    await page.goto('http://localhost:8000/fluid-lab/');
    await page.waitForFunction(()=>window.fluidLab?.getSnapshot().time>.1);
    console.log('PASS: simplified controls, grouped actions, box drop, dam release, reset, mobile layout, default engine.');
    console.log(await page.evaluate(()=>({engine:fluidLab.getSnapshot().engine,worker:fluidLab.getSnapshot().worker})));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
