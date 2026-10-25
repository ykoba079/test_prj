const {chromium}=require('C:/Users/ddydd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=__dirname,siteRoot=path.resolve(root,'..'),server=http.createServer((req,res)=>{const file=path.resolve(siteRoot,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(siteRoot+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,data)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',(file.endsWith('.js')||file.endsWith('.mjs'))?'text/javascript':file.endsWith('.wasm')?'application/wasm':file.endsWith('.css')?'text/css':'text/html');res.end(data);});});
(async()=>{let browser;try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const url=process.env.MIKAN_TEST_URL||`http://127.0.0.1:${server.address().port}/mikan-inspection-v02/index.html?detector=color`,page=await browser.newPage({viewport:{width:1366,height:1000}}),requests=[],errors=[];
  fs.mkdirSync(path.join(root,'qa'),{recursive:true});page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message);});page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});
  await page.route('https://cdn.babylonjs.com/**',r=>r.abort());
  let release;const gate=new Promise(r=>release=r);await page.route('**/vendor/HavokPhysics.wasm*',async r=>{await gate;await r.continue();});
  await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>globalThis.mikanPreview?.fruits.length===3&&globalThis.mikanPreview.scene.getFrameId()>2,null,{timeout:15000});
  assert.equal(await page.locator('#addGood').isDisabled(),true);assert.equal(await page.locator('#loadMessage').isVisible(),true);
  await page.screenshot({path:path.join(root,'qa/loading.png')});console.log('PASS 3 fruits and equipment render before WASM finishes loading');
  release();await page.waitForFunction(()=>globalThis.mikanDebug?.mechanics,null,{timeout:20000});assert.equal(await page.locator('#addGood').isDisabled(),false);assert.equal(await page.locator('#loadMessage').isVisible(),false);
  assert.ok(!requests.some(u=>u.includes('cdn.babylonjs.com')),'External CDN must not be required');assert.deepEqual(errors,[]);console.log('PASS same-origin vendor assets initialize Havok with external CDN blocked');
  const failure=await browser.newPage();const expectedErrors=[];failure.on('pageerror',e=>expectedErrors.push(e.message));await failure.route('**/vendor/HavokPhysics.wasm*',r=>r.abort());await failure.goto(url,{waitUntil:'domcontentloaded'});
  await failure.waitForFunction(()=>document.getElementById('loadMessage').getAttribute('role')==='alert'&&globalThis.mikanPreview?.scene.getFrameId()>2,null,{timeout:20000});
  assert.equal(await failure.locator('#addGood').isDisabled(),true);assert.equal(await failure.evaluate(()=>globalThis.mikanPreview.fruits.length),3);assert.ok(await failure.locator('#loadMessage').textContent());await failure.screenshot({path:path.join(root,'qa/load-error.png')});console.log('PASS failed WASM keeps fruit and equipment visible and displays an error');
  await failure.close();await page.close();
}finally{await browser?.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
