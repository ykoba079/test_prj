const {chromium}=require('C:/Users/ddydd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=__dirname,repo=path.resolve(root,'..');
const server=http.createServer((req,res)=>{const file=path.resolve(repo,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(repo+path.sep))return res.writeHead(403).end();fs.readFile(file,(e,data)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.html':'text/html','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{let browser;try{
  const {citrusPoint}=await import('data:text/javascript;base64,'+fs.readFileSync(path.join(root,'fruit-detail.js')).toString('base64'));
  // Visible fruit must stay within the collision envelope; preserve size while
  // making the stem and blossom ends recessed rather than protruding.
  assert.ok(citrusPoint([0,1,0])[1]<.30);assert.ok(citrusPoint([0,-1,0])[1]>-.31);
  for(let i=0;i<1000;i++){
    const y=-1+2*(i+.5)/1000,a=i*2.399963,r=Math.sqrt(1-y*y),p=citrusPoint([r*Math.cos(a),y,r*Math.sin(a)],i*.017);
    assert.ok(p.every(Number.isFinite));assert.ok((p[0]/.39)**2+(p[1]/.3276)**2+(p[2]/.39)**2<=1.000001,'fruit cannot protrude outside the nominal physics proxy');
  }
  await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url=process.env.MIKAN_TEST_URL||`http://127.0.0.1:${server.address().port}/mikan-inspection-v02/index.html`;
  await page.goto(url+(url.includes('?')?'&':'?')+'detector=color');await page.waitForFunction(()=>globalThis.mikanDebug,null,{timeout:90000});await page.evaluate(()=>mikanDebug.setAutoSpawn(false));await page.evaluate(()=>mikanDebug.setPaused(true));await page.waitForFunction(()=>!mikanDebug.busy);
  const info=await page.evaluate(async()=>{
    const d=mikanDebug,B=BABYLON,{FRUIT_VARIANTS}=await import('./fruit.js?v=20261109-natural');d.reset();const baselineTextures=d.scene.textures.length;
    const rows=FRUIT_VARIANTS.map((v,i)=>{const f=d.spawn(v.type,true,new B.Vector3(-4+i,.5,0),v.id),m=f.meshes[0],p=m.getVerticesData(B.VertexBuffer.PositionKind),n=m.getVerticesData(B.VertexBuffer.NormalKind);return {id:v.id,material:m.material.getClassName(),wax:m.material.clearCoat.isEnabled,emissive:m.material.emissiveColor.asArray(),scale:f.visual.scaling.asArray(),calyx:f.meshes.some(m=>m.name.startsWith('calyx-')),finite:[...p,...n].every(Number.isFinite),maxX:Math.max(...p.filter((v,i)=>i%3===0))*.9,dynamic:f.body.getMotionType()===B.PhysicsMotionType.DYNAMIC,patches:f.meshes.filter(m=>m.name.startsWith('surface-defect-')).length};});
    const fruitLight=d.scene.getLightByName('citrus-soft-light'),onlyFruit=fruitLight.canAffectMesh(d.fruits[0].meshes[0])&&!fruitLight.canAffectMesh(d.scene.getMeshByName('roller'));
    d.reset();const afterTextures=d.scene.textures.length;return {rows,baselineTextures,afterTextures,onlyFruit};
  });
  assert.equal(info.rows.length,8);for(const r of info.rows){assert.equal(r.material,'PBRMaterial');assert.equal(r.wax,false);assert.deepEqual(r.emissive,[0,0,0]);assert.deepEqual(r.scale,[.9,.9,.9]);assert.ok(r.calyx&&r.finite&&r.dynamic);assert.ok(r.maxX<=.351001&&r.maxX>.34);}
  assert.equal(info.rows.find(r=>r.id==='mold-spots').patches,4);assert.ok(info.onlyFruit);assert.equal(info.baselineTextures,info.afterTextures,'per-fruit defect textures must be released on reset');
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  console.log('PASS recessed citrus shape within physics envelope, PBR without wax or emission, calyx, all appearances, shared texture cleanup and mobile',JSON.stringify(info));
}finally{await browser?.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
