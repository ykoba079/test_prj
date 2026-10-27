const {chromium}=require('C:/Users/ddydd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=__dirname,siteRoot=path.resolve(root,'..');
const server=http.createServer((req,res)=>{const file=path.resolve(siteRoot,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(siteRoot+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,data)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.html':'text/html','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(data);});});

(async()=>{let browser;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:1150}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.MIKAN_TEST_URL||`http://127.0.0.1:${server.address().port}/mikan-inspection-v02/index.html`);await page.waitForFunction(()=>globalThis.mikanDebug,null,{timeout:90000});
 await page.locator('#autoSpawn').uncheck();await page.locator('#pause').click();await page.waitForFunction(()=>!mikanDebug.busy);await page.locator('#reset').click();
 const result=await page.evaluate(async()=>{
  const B=BABYLON,d=mikanDebug,v=d.views[0];
  const capture=async()=>{v.rt.resetRefreshCounter();d.scene.render();const raw=await v.rt.readPixels(),image=new ImageData(640,480);for(let y=0;y<480;y++)image.data.set(raw.subarray((479-y)*2560,(480-y)*2560),y*2560);return image;};
  const equipment=d.views.map(view=>({id:view.id,rollerCount:view.rt.renderList.filter(m=>m.name==='roller'&&(m.layerMask&view.camera.layerMask)).length,markerCount:view.rt.renderList.filter(m=>m.name==='roller-marker').length,rails:view.rt.renderList.filter(m=>m.name==='rail').length,floor:view.rt.renderList.some(m=>m.name==='floor'),ownHousing:view.rt.renderList.some(m=>m.name===(view.id==='A'?'top-camera':'oblique-camera')),debug:view.rt.renderList.some(m=>m.name==='image-predicted-contact')}));
  const fruit=d.spawn(1,true,new B.Vector3(0,.35,0));fruit.visual.rotationQuaternion=B.Quaternion.RotationAxis(B.Axis.X,Math.PI);
  const complete=await capture(),originalList=v.rt.renderList;
  v.rt.renderList=originalList.filter(m=>!['roller','roller-marker'].includes(m.name));const noRollers=await capture();v.rt.renderList=originalList;
  let rollerPixels=0;for(let i=0;i<complete.data.length;i+=4)if(Math.abs(complete.data[i]-noRollers.data[i])+Math.abs(complete.data[i+1]-noRollers.data[i+1])+Math.abs(complete.data[i+2]-noRollers.data[i+2])>20)rollerPixels++;
  const orange=image=>{let n=0;for(let y=180;y<300;y++)for(let x=100;x<220;x++){const i=(y*640+x)*4,r=image.data[i],g=image.data[i+1],b=image.data[i+2];if(r>110&&g>45&&r>g*1.12&&g>b*1.35)n++;}return n;};
  const before=orange(complete),detections=await d.detector.detect(complete,.25);
  const barrier=B.MeshBuilder.CreateBox('qa-occluder',{width:1.1,height:.2,depth:1.1},d.scene);barrier.position.set(0,1,0);barrier.material=d.scene.getMeshByName('rail').material;barrier.layerMask=3;v.rt.renderList.push(barrier);
  const covered=await capture(),after=orange(covered),occludedDetections=await d.detector.detect(covered,.25);v.rt.renderList=v.rt.renderList.filter(m=>m!==barrier);barrier.dispose();
  const restored=await capture();v.ctx.putImageData(restored,0,0);const b=d.views[1];b.rt.resetRefreshCounter();d.scene.render();const br=await b.rt.readPixels(),bi=new ImageData(640,480);for(let y=0;y<480;y++)bi.data.set(br.subarray((479-y)*2560,(480-y)*2560),y*2560);b.ctx.putImageData(bi,0,0);
  return {equipment,rollerPixels,orangeBefore:before,orangeCovered:after,fruitStillEnabled:fruit.root.isEnabled(),detections,occludedDetections,png:v.ctx.canvas.toDataURL('image/png')};
 });
 for(const e of result.equipment){assert.ok(e.rollerCount>40&&e.markerCount>40&&e.rails===2&&e.floor,JSON.stringify(e));assert.equal(e.ownHousing,false);assert.equal(e.debug,false);}
 assert.ok(result.rollerPixels>5000,JSON.stringify({rollerPixels:result.rollerPixels}));assert.ok(result.orangeBefore>500&&result.orangeCovered<result.orangeBefore*.15,JSON.stringify({before:result.orangeBefore,covered:result.orangeCovered}));assert.equal(result.fruitStillEnabled,true);
 fs.mkdirSync(path.join(root,'qa'),{recursive:true});fs.writeFileSync(path.join(root,'qa/inspection-equipment.png'),Buffer.from(result.png.split(',')[1],'base64'));delete result.png;fs.writeFileSync(path.join(root,'qa/inspection-equipment.json'),JSON.stringify(result,null,2));await page.screenshot({path:path.join(root,'qa/equipment-line.png'),fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS actual equipment pixels, depth occlusion without hiding fruit, same-image YOLO; measured detections:',JSON.stringify(result));
}finally{await browser?.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
