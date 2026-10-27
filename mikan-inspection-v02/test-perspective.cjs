const {chromium}=require('C:/Users/ddydd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=__dirname,siteRoot=path.resolve(root,'..');
const server=http.createServer((req,res)=>{const file=path.resolve(siteRoot,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(siteRoot+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,data)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.html':'text/html','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(data);});});

(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:1150}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.MIKAN_TEST_URL||`http://127.0.0.1:${server.address().port}/mikan-inspection-v02/index.html`);await page.waitForFunction(()=>globalThis.mikanDebug,null,{timeout:90000});
 await page.locator('#autoSpawn').uncheck();await page.locator('#pause').click();await page.waitForFunction(()=>!mikanDebug.busy);await page.locator('#reset').click();
 const measured=await page.evaluate(async()=>{
  const B=BABYLON,d=mikanDebug,vp=new B.Viewport(0,0,640,480);
  const project=(view,p)=>B.Vector3.Project(p,B.Matrix.Identity(),view.camera.getViewMatrix().multiply(view.camera.getProjectionMatrix()),vp);
  const diameter=(view,z)=>{const a=project(view,new B.Vector3(-.39,.35,z)),b=project(view,new B.Vector3(.39,.35,z));return Math.hypot(a.x-b.x,a.y-b.y);};
  const views=d.views.map(v=>({id:v.id,mode:v.camera.mode,position:v.camera.position.asArray(),fov:v.camera.fov,nearDiameter:diameter(v,.8),farDiameter:diameter(v,-.8)}));
  const calibration=d.views.flatMap(v=>[0,1.55,3.25].flatMap(x=>[-1.3,0,1.3].map(z=>{const pixel=project(v,new B.Vector3(x,.35,z)),ray=B.Ray.CreateNew(pixel.x,pixel.y,640,480,B.Matrix.Identity(),v.camera.getViewMatrix(),v.camera.getProjectionMatrix()),t=ray.intersectsPlane(new B.Plane(0,1,0,-.35)),world=ray.origin.add(ray.direction.scale(t));return {id:v.id,x,z,pixel:[pixel.x,pixel.y],error:B.Vector3.Distance(world,new B.Vector3(x,.35,z))};})));
  for(const [type,z]of [[0,.8],[1,-.8]]){const f=d.spawn(type,true,new B.Vector3(0,.35,z));if(type)f.visual.rotationQuaternion=B.Quaternion.RotationAxis(B.Axis.X,Math.PI);}
  let bImage;for(const v of d.views){v.rt.resetRefreshCounter();d.scene.render();const raw=await v.rt.readPixels(),image=new ImageData(640,480);for(let y=0;y<480;y++)image.data.set(raw.subarray((479-y)*2560,(480-y)*2560),y*2560);v.ctx.putImageData(image,0,0);if(v.id==='B')bImage=image;}
  const detections=await d.detector.detect(bImage,.25);
  return {views,calibration,detections,bProjection:d.views[1].camera.getProjectionMatrix().asArray(),png:d.views[1].ctx.canvas.toDataURL('image/png')};
 });
 assert.equal(measured.views[0].mode,1);assert.equal(measured.views[1].mode,0);assert.ok(Math.abs(measured.views[0].nearDiameter-measured.views[0].farDiameter)<1e-4);assert.ok(measured.views[1].nearDiameter>measured.views[1].farDiameter*1.3);
 assert.ok(measured.calibration.every(p=>p.error<1e-4),JSON.stringify(measured.calibration));assert.ok(measured.calibration.filter(p=>p.x>=1.55).every(p=>p.pixel[0]>=0&&p.pixel[0]<=640&&p.pixel[1]>=0&&p.pixel[1]<=480),'Pickup-plane corners should remain in both views');
 const expectedOverlay=await page.evaluate(()=>{
  const B=BABYLON,v=mikanDebug.views[1],matrix=v.camera.getViewMatrix().multiply(v.camera.getProjectionMatrix()),vp=new B.Viewport(0,0,640,480),center=B.Vector3.Project(new B.Vector3(0,.35,.8),B.Matrix.Identity(),matrix,vp),box={x0:center.x-51,y0:center.y-46,x1:center.x+51,y1:center.y+46,score:.99,defects:[],defectBoxes:[]};
  globalThis.testOverlayRects=[];globalThis.restorePerspectiveDetector=mikanDebug.detector.detectFrame;globalThis.restorePerspectiveStroke=v.overlay.strokeRect;
  v.overlay.strokeRect=function(...args){testOverlayRects.push(args);return restorePerspectiveStroke.apply(this,args);};mikanDebug.detector.detectFrame=async(image,threshold,index)=>({fruits:index===1?[box]:[],orphans:[]});return {x:box.x0,y:480-box.y1,width:102,height:92};
 });
 await page.locator('#pause').click();await page.evaluate(()=>mikanDebug.mechanics.pause(true));await page.waitForFunction(()=>testOverlayRects.length>0,null,{timeout:5000});
 const overlayRect=await page.evaluate(()=>testOverlayRects[0]);assert.ok(Math.abs(overlayRect[0]-expectedOverlay.x)<1e-5&&Math.abs(overlayRect[1]-expectedOverlay.y)<1e-5);assert.equal(overlayRect[2],expectedOverlay.width);assert.equal(overlayRect[3],expectedOverlay.height);
 await page.locator('#pause').click();await page.waitForFunction(()=>!mikanDebug.busy);await page.evaluate(()=>{mikanDebug.detector.detectFrame=restorePerspectiveDetector;mikanDebug.views[1].overlay.strokeRect=restorePerspectiveStroke;});console.log('PASS actual scan draws B detection boxes at vertically mirrored coordinates');
 const display=await page.evaluate(()=>({image:getComputedStyle(document.getElementById('inspectionB')).transform,overlay:getComputedStyle(document.getElementById('overlayB')).transform}));assert.equal(display.image,'matrix(1, 0, 0, -1, 0, 0)');assert.equal(display.overlay,'none');
 fs.mkdirSync(path.join(root,'qa'),{recursive:true});await page.locator('#inspectionB').screenshot({path:path.join(root,'qa/perspective-b-display.png')});console.log('PASS B display flips vertically while labels remain upright');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);const mobileProjection=await page.evaluate(()=>mikanDebug.views[1].camera.getProjectionMatrix().asArray());assert.deepEqual(mobileProjection,measured.bProjection);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 fs.mkdirSync(path.join(root,'qa'),{recursive:true});fs.writeFileSync(path.join(root,'qa/perspective-b.png'),Buffer.from(measured.png.split(',')[1],'base64'));delete measured.png;fs.writeFileSync(path.join(root,'qa/perspective-b.json'),JSON.stringify(measured,null,2));assert.deepEqual(errors,[]);console.log('PASS perspective scale, image/world calibration, pickup coverage, fixed sensor aspect after mobile resize, same-frame YOLO:',JSON.stringify(measured));
}finally{await browser?.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
