// Reproducible single-pose image review; this does not train or replace the YOLO model.
const {chromium}=require('C:/Users/ddydd/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=__dirname,repo=path.resolve(root,'..'),output=path.join(root,'appearance-review');
const server=http.createServer((req,res)=>{const file=path.resolve(repo,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(repo+path.sep))return res.writeHead(403).end();fs.readFile(file,(e,data)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.html':'text/html','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{let browser;try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.MIKAN_TEST_URL||`http://127.0.0.1:${server.address().port}/mikan-inspection-v02/index.html`);await page.waitForFunction(()=>globalThis.mikanDebug,null,{timeout:90000});await page.locator('#autoSpawn').uncheck();await page.evaluate(()=>mikanDebug.setPaused(true));await page.waitForFunction(()=>!mikanDebug.busy);
  const review=await page.evaluate(async()=>{
    const {FRUIT_VARIANTS}=await import('./fruit.js?v=20261109-natural'),d=mikanDebug,rows=[];
    const iou=(a,b)=>{const area=Math.max(0,Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0))*Math.max(0,Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0));return area/Math.max(1,(a.x1-a.x0)*(a.y1-a.y0)+(b.x1-b.x0)*(b.y1-b.y0)-area);};
    for(const recipe of FRUIT_VARIANTS){
      d.reset();const f=d.spawn(recipe.type,true,new BABYLON.Vector3(2.4,d.fruitHeight(2.4),0),recipe.id);if(recipe.type)f.visual.rotationQuaternion=BABYLON.Quaternion.RotationAxis(BABYLON.Axis.X,Math.PI);
      const deadline=performance.now()+10000;
      while(!f.meshes.every(m=>m.material.isReady(m))){d.scene.render();if(performance.now()>deadline)throw new Error('Appearance material not ready: '+recipe.id);await new Promise(r=>setTimeout(r,20));}d.scene.render();
      const views=[];
      for(const view of d.views){
        view.rt.resetRefreshCounter();d.scene.render();const raw=await view.rt.readPixels(),frame=new ImageData(640,480);for(let y=0;y<480;y++)frame.data.set(raw.subarray((479-y)*2560,(480-y)*2560),y*2560);
        const detection=await d.detector.detectFrame(frame,.25,view.id==='A'?0:1),matrix=view.camera.getViewMatrix().multiply(view.camera.getProjectionMatrix());f.meshes[0].computeWorldMatrix(true);
        const points=f.meshes[0].getBoundingInfo().boundingBox.vectorsWorld.map(p=>BABYLON.Vector3.Project(p,BABYLON.Matrix.Identity(),matrix,new BABYLON.Viewport(0,0,640,480))),bounds={x0:Math.min(...points.map(p=>p.x)),y0:Math.min(...points.map(p=>p.y)),x1:Math.max(...points.map(p=>p.x)),y1:Math.max(...points.map(p=>p.y))};
        const matched=detection.fruits.filter(box=>box.score>=.65&&iou(box,bounds)>.35),defects=[...new Set(matched.flatMap(box=>box.defects))];
        const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;const c=canvas.getContext('2d'),source=document.createElement('canvas');source.width=640;source.height=480;source.getContext('2d').putImageData(frame,0,0);
        if(view.id==='B'){c.translate(0,480);c.scale(1,-1);}c.drawImage(source,0,0);c.resetTransform();
        function draw(box,color,text){const y=view.id==='B'?480-box.y1:box.y0;c.strokeStyle=color;c.lineWidth=2;c.strokeRect(box.x0,y,box.x1-box.x0,box.y1-box.y0);c.font='14px sans-serif';c.fillStyle='#101918';c.fillRect(box.x0,Math.max(0,y-19),Math.max(78,text.length*8),19);c.fillStyle=color;c.fillText(text,box.x0+3,Math.max(14,y-5));}
        for(const box of detection.fruits){draw(box,'#a4df8f',`mikan ${(box.score*100).toFixed(0)}%`);for(const defect of box.defectBoxes||[])draw(defect,'#ff8678',`${defect.kind} ${((defect.score||0)*100).toFixed(0)}%`);}
        views.push({camera:view.id,matched:matched.length,defects,detections:detection,png:canvas.toDataURL('image/png')});
      }
      rows.push({id:recipe.id,label:recipe.label,expected:recipe.type===0?[]:[recipe.type===1?'mold':'damage'],patches:f.meshes.filter(m=>m.name.startsWith('surface-defect-')).length,simulatorClassExposed:f.type!==undefined,views});
    }
    return {date:'2026-11-09',appearance:'natural-citrus-no-wax',model:d.detector.name,confidence:.25,input:640,slopeDegrees:d.line.degrees,rows};
  });
  assert.equal(review.rows.length,8);assert.ok(review.rows.every(r=>!r.simulatorClassExposed));assert.deepEqual(errors,[]);fs.mkdirSync(output,{recursive:true});
  for(const row of review.rows)for(const view of row.views){view.image=`${row.id}-${view.camera}.png`;fs.writeFileSync(path.join(output,view.image),Buffer.from(view.png.split(',')[1],'base64'));delete view.png;}
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({...review,errors},null,2));
  const label=v=>!v.matched?'果実候補なし':v.defects.length?v.defects.map(k=>k==='mold'?'カビ':'傷').join('・'):'不良検出なし';
  fs.writeFileSync(path.join(output,'index.html'),`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ミカン外観8種類・固定画像レビュー</title><style>body{background:#101918;color:#e7eee9;font:16px/1.8 system-ui,sans-serif;max-width:1200px;margin:auto;padding:24px}a{color:#b6dfb0}h1{font-size:28px}p{color:#b3c4b8}section{border:1px solid #3b5145;border-radius:12px;padding:20px;margin:24px 0}h2{margin:0 0 12px;font-size:21px}.views{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}img{width:100%;display:block;border-radius:6px}figcaption{padding:8px 0}.note{font-size:14px}@media(max-width:700px){.views{grid-template-columns:1fr}}</style><h1>ミカン外観8種類・固定画像レビュー</h1><p><a href="../">選別デモへ戻る</a> ／ 2026-11-09</p><p>上下のくぼみ・ヘタ・PBR果皮（ワックス層なし）へ変更し、従来の学習済みYOLOv9-Tで撮影画像を判定しました。再学習はしていません。緑枠は果実候補、赤枠は不良部分です。</p><p class="note">傾斜5度・640入力・不良信頼度25%・不良面が上を向く固定1姿勢での参考結果です。各見出しは生成した外観の名前で、AIの判定とは別です。画像内の対象ミカンの投影枠に重なる候補（果実信頼度65%以上、IoU &gt; 0.35）の不良ラベルを表示します。通常のアーム制御の対応付けとは別のレビュー用集計です。不良検出なしは正常の保証ではありません。2回確定条件や搬送成功率、全方向の検出率は評価していません。B画像はデモと同じ上下反転表示です。</p>${review.rows.map(row=>`<section><h2>${row.label}</h2><div class="views">${row.views.map(v=>`<figure><img src="${v.image}" alt="${row.label} カメラ${v.camera}"><figcaption>カメラ${v.camera}：${label(v)}</figcaption></figure>`).join('')}</div></section>`).join('')}<p><a href="results.json">検出結果JSON</a></p></html>`);
  console.log(JSON.stringify({model:review.model,rows:review.rows.map(r=>({id:r.id,patches:r.patches,views:r.views.map(v=>({camera:v.camera,matched:v.matched,defects:v.defects}))})),errors}));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
