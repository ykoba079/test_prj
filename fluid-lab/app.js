/* global BABYLON, FluidSimulation */
(async () => {
  'use strict';
  const $ = id => document.getElementById(id), canvas = $('canvas');
  if (!window.BABYLON) return;
  let engine, scene, camera, fluidRenderer, fluidObject, latest;
  let worker, localSim, busy = false, generation = 0, ready = false;
  let mode = 'tank', shape = 'sphere', released = false;
  let lastFrame = performance.now(), pendingSeconds = 0, lastStats = 0;
  let cameraFit = 1;
  const meshes = new Map(), palette = ['#f1b678', '#e79484', '#cbb4ed', '#e3cc8e'];
  function notice(message) { $('notice').textContent = message; }
  function resize() {
    engine.resize();
    const rect=canvas.getBoundingClientRect(),fit=Math.max(1,1.12/(rect.width/Math.max(1,rect.height)));
    camera.radius*=fit/cameraFit;cameraFit=fit;
    camera.lowerRadiusLimit=6.5*fit;camera.upperRadiusLimit=20*fit;
  }
  function options() { return { mode, quality: 'low', layers: 7, viscosity: 8 }; }
  function send(type, extra = {}) {
    const message = { type, generation, ...extra };
    if (worker) { worker.postMessage(message); return; }
    if (type === 'reset') localSim = new FluidSimulation(message.options);
    else if (type === 'advance') localSim.advance(message.seconds);
    else if (type === 'drop') localSim.drop(message.options);
    else if (type === 'release') localSim.release();
    else if (type === 'viscosity') { localSim.viscosity = message.value; return; }
    receive({ generation, type, positions: localSim.positions, sizes: localSim.renderSizes, bodies: localSim.bodies, count: localSim.count, radius: localSim.radius, spacing: localSim.spacing, time: localSim.time });
  }
  function receive(data) {
    if (data.generation !== generation) return;
    if (data.type === 'advance' || data.type === 'reset') busy = false;
    latest = data;
    if (data.type === 'reset') {
      buildFluid(data); ready = true;
      $('loading').hidden = true;
      for (const id of ['action','reset']) $(id).disabled = false;
      notice(mode === 'tank' ? '「水槽に落とす」で実験開始。位置や大きさを変えて比較できます。' : '水は仕切りの左側にあります。「仕切りを外す」で流れを観察。');
    }
    updateVisuals(data);
  }
  function reset() {
    generation++; ready = false; busy = true; released = false;
    pendingSeconds = 0; lastFrame = performance.now();
    for (const mesh of meshes.values()) { mesh.material.dispose(); mesh.dispose(); } meshes.clear();
    for (const id of ['action','reset']) $(id).disabled = true;
    $('action').innerHTML = mode === 'tank' ? '<span>↓</span> 水槽に落とす' : '<span>→</span> 仕切りを外す';
    scene.getMeshByName('partition').setEnabled(mode === 'dam');
    send('reset', { options: options() });
  }
  function material(name, color, emissive = 0) {
    const mat = new BABYLON.StandardMaterial(name, scene);
    mat.diffuseColor = BABYLON.Color3.FromHexString(color);
    mat.specularColor = new BABYLON.Color3(.3,.4,.4);
    mat.emissiveColor = mat.diffuseColor.scale(emissive); return mat;
  }
  function buildScene() {
    scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(.033,.076,.10,1);
    camera = new BABYLON.ArcRotateCamera('camera', -Math.PI/2+.48, 1.12, 11.8, new BABYLON.Vector3(0,1.3,0),scene);
    camera.attachControl(canvas,true); camera.lowerRadiusLimit = 6.5; camera.upperRadiusLimit = 20;
    camera.lowerBetaLimit = .25; camera.upperBetaLimit = 1.48; camera.wheelPrecision = 35;
    camera.pinchPrecision = 70; camera.panningSensibility = 0; camera.minZ = .05;
    new BABYLON.HemisphericLight('sky',new BABYLON.Vector3(0,1,0),scene).intensity = .9;
    const key = new BABYLON.DirectionalLight('key',new BABYLON.Vector3(-.4,-1,.6),scene); key.intensity = 1.8;
    const ground = BABYLON.MeshBuilder.CreateGround('ground',{width:200,height:200},scene);
    ground.position.y=-.35; ground.material=material('ground-mat','#0b1b24');
    const base = BABYLON.MeshBuilder.CreateBox('plinth',{width:6.65,height:.24,depth:4.22},scene);
    base.position.y=-.18; base.material=material('plinth-mat','#29424c');
    const floor = BABYLON.MeshBuilder.CreateBox('tank-floor',{width:6.1,height:.08,depth:3.7},scene);
    floor.position.y=-.035;
    const texture = new BABYLON.DynamicTexture('tiles',{width:1024,height:640},scene,false);
    const ctx=texture.getContext();ctx.fillStyle='#789d9f';ctx.fillRect(0,0,1024,640);
    ctx.strokeStyle='#a5c2be';ctx.lineWidth=2;
    for(let x=0;x<=1024;x+=64){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,640);ctx.stroke();}
    for(let y=0;y<=640;y+=64){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1024,y);ctx.stroke();}
    texture.update();const floorMat=material('floor-mat','#ffffff');floorMat.diffuseTexture=texture;floor.material=floorMat;
    const glass=material('glass','#8acfcf');glass.alpha=.055;glass.backFaceCulling=false;glass.disableDepthWrite=true;
    const rim=material('rim','#86bbbe',.12);
    for(const z of [-1.85,1.85]){
      const wall=BABYLON.MeshBuilder.CreateBox('glass-wall',{width:6.1,height:3.6,depth:.035},scene);wall.position.set(0,1.8,z);wall.material=glass;
      for(const y of [0,3.6]){const rail=BABYLON.MeshBuilder.CreateBox('rail',{width:6.17,height:.025,depth:.025},scene);rail.position.set(0,y,z);rail.material=rim;}
    }
    for(const x of [-3.05,3.05]){
      const wall=BABYLON.MeshBuilder.CreateBox('glass-side',{width:.035,height:3.6,depth:3.7},scene);wall.position.set(x,1.8,0);wall.material=glass;
      for(const y of [0,3.6]){const rail=BABYLON.MeshBuilder.CreateBox('rail',{width:.025,height:.025,depth:3.7},scene);rail.position.set(x,y,0);rail.material=rim;}
      for(const z of [-1.85,1.85]){const rail=BABYLON.MeshBuilder.CreateBox('corner',{width:.025,height:3.6,depth:.025},scene);rail.position.set(x,1.8,z);rail.material=rim;}
    }
    const partition=BABYLON.MeshBuilder.CreateBox('partition',{width:.09,height:3.55,depth:3.55},scene);
    partition.position.set(0,1.8,0); const partitionMat=material('partition-mat','#c9a276');partitionMat.alpha=.48;partition.material=partitionMat;partition.setEnabled(false);
    // Gauge markings help show the change in water height.
    const lines=[];
    for(let y=.3;y<3.5;y+=.3)lines.push([new BABYLON.Vector3(3.07,y,1.65),new BABYLON.Vector3(3.07,y,1.8)]);
    const gauge=BABYLON.MeshBuilder.CreateLineSystem('gauge',{lines},scene);gauge.color=BABYLON.Color3.FromHexString('#a1c5c6');
    const gridLines=[];for(let i=-8;i<=8;i++){
      gridLines.push([new BABYLON.Vector3(i,-.34,-8),new BABYLON.Vector3(i,-.34,8)]);
      gridLines.push([new BABYLON.Vector3(-8,-.34,i),new BABYLON.Vector3(8,-.34,i)]);
    }
    const grid=BABYLON.MeshBuilder.CreateLineSystem('ground-grid',{lines:gridLines},scene);grid.color=BABYLON.Color3.FromHexString('#1a333d');
    fluidRenderer=scene.enableFluidRenderer();
    // Optional environment: simulation and rendering still work if this asset fails.
    scene.environmentTexture=BABYLON.CubeTexture.CreateFromPrefilteredData('https://assets.babylonjs.com/environments/environmentSpecular.env',scene);
    scene.environmentIntensity=.65;
  }
  function buildFluid(data) {
    if(fluidObject) fluidRenderer.removeRenderObject(fluidObject,true);
    BABYLON.FluidRenderingObject.UsePerParticleSizeAttribute=true;
    fluidObject=fluidRenderer.addCustomParticles({position:data.positions,size:data.sizes},data.count);
    fluidObject.object.particleSize=data.spacing*1.65;
    const target=fluidObject.targetRenderer;
    target.depthMapSize=Math.min(engine.getRenderWidth(),512);
    target.thicknessMapSize=Math.min(engine.getRenderWidth(),256);
    target.fluidColor=new BABYLON.Color3(.12,.56,.65);target.density=1.7;
    target.refractionStrength=.035;target.fresnelClamp=.6;target.specularPower=120;
    target.blurDepthFilterSize=12;target.blurDepthMaxFilterSize=32;
    target.blurDepthNumIterations=2;target.blurThicknessNumIterations=1;
    target.dirLight=new BABYLON.Vector3(.4,-1,-.6).normalize();
    $('particle-count').textContent=data.count.toLocaleString('ja-JP');
  }
  function updateVisuals(data) {
    if(!fluidObject) return;
    fluidObject.object.vertexBuffers.position.update(data.positions);
    fluidObject.object.vertexBuffers.size.update(data.sizes);
    for(const body of data.bodies){
      let mesh=meshes.get(body.id);
      if(!mesh){
        mesh=body.shape==='sphere'?BABYLON.MeshBuilder.CreateSphere('dropped-sphere',{diameter:body.size*2,segments:24},scene):BABYLON.MeshBuilder.CreateBox('dropped-box',{size:body.size*2},scene);
        mesh.material=material('object-'+body.id,palette[(body.id-1)%palette.length]);meshes.set(body.id,mesh);
      }
      mesh.position.set(body.x,body.y,body.z);
    }
  }
  function bind(){
    for(const [id,format] of Object.entries({size:v=>(+v).toFixed(2),height:v=>(+v).toFixed(1),position:v=>+v===0?'中央':`${+v<0?'左':'右'} ${Math.abs(+v).toFixed(1)}`})){
      $(id).addEventListener('input',()=>{$(id+'-value').textContent=format($(id).value);});
    }
    document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{
      mode=button.dataset.mode;
      document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',b===button);});
      $('drop-controls').hidden=mode==='dam';
      $('mode-help').textContent=mode==='tank'?'水を張った水槽に、物体を落とします。':'仕切りを外すと、水が右へ流れ出します。';
      $('scene-description').textContent=mode==='tank'?'球や箱を落として、水の押しのけと波を観察。':'仕切りを外して、流れ・衝突・揺り戻しを観察。';
      document.querySelector('.scale-label').textContent=mode==='tank'?'SIMULATION / 01':'SIMULATION / 02';reset();
    }));
    document.querySelectorAll('[data-shape]').forEach(button=>button.addEventListener('click',()=>{
      shape=button.dataset.shape;
      document.querySelectorAll('[data-shape]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',b===button);});
    }));
    $('action').addEventListener('click',()=>{
      if(!ready)return;
      if(mode==='dam'){
        if(released)return;released=true;send('release');scene.getMeshByName('partition').setEnabled(false);
        $('action').textContent='仕切りを外しました';$('action').disabled=true;notice('水が右側へ流れます。リセットで同じ条件を再現できます。');
      }else{
        if(latest.bodies.length>=8){notice('物体は8個までです。リセットして次の実験を始めてください。');return;}
        send('drop',{options:{shape,size:+$('size').value,height:+$('height').value,x:+$('position').value}});
        notice(`${shape==='sphere'?'球':'箱'}を落としました。水の押しのけと波を観察してください。`);
      }
    });
    $('reset').addEventListener('click',reset);
    $('camera-reset').addEventListener('click',()=>{camera.alpha=-Math.PI/2+.48;camera.beta=1.12;camera.radius=11.8*cameraFit;camera.target.set(0,1.3,0);});
    $('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.querySelector('.viewport').requestFullscreen();}catch{notice('このブラウザでは全画面表示を利用できません。');}});
    window.addEventListener('resize',resize);new ResizeObserver(resize).observe(canvas.parentElement);resize();
    document.addEventListener('visibilitychange',()=>{lastFrame=performance.now();pendingSeconds=0;});
  }
  try{
    let webgpu=false;
    if(!new URLSearchParams(location.search).has('webgl')){
      try{if(await BABYLON.WebGPUEngine.IsSupportedAsync){engine=new BABYLON.WebGPUEngine(canvas,{antialias:true});await engine.initAsync();webgpu=true;}}catch{engine?.dispose();engine=null;}
    }
    if(!engine)engine=new BABYLON.Engine(canvas,true,{preserveDrawingBuffer:false,stencil:true});
    if(!webgpu&&engine.webGLVersion<2)throw new Error('WebGL 2またはWebGPU対応のブラウザが必要です。');
    engine.setHardwareScalingLevel(Math.max(1.25,window.devicePixelRatio/1.25));
    buildScene();
    try{
      if(location.protocol==='file:')throw new Error('Local file');
      worker=new Worker('worker.js?v=2');worker.onmessage=event=>receive(event.data);
      worker.onerror=()=>{worker.terminate();worker=null;localSim=null;reset();$('engine-label').textContent=`${webgpu?'WebGPU':'WebGL 2'} · CPU`;};
    }catch{worker=null;}
    $('engine-label').textContent=`${webgpu?'WebGPU':'WebGL 2'} · CPU${worker?' Worker':''}`;
    bind();reset();
    engine.runRenderLoop(()=>{
      const now=performance.now(),seconds=Math.min(.05,(now-lastFrame)/1000);lastFrame=now;
      if(ready&&!document.hidden){
        pendingSeconds=Math.min(.05,pendingSeconds+seconds);
        if(!busy&&pendingSeconds>=1/60){const elapsed=pendingSeconds;pendingSeconds=0;busy=true;send('advance',{seconds:elapsed});}
      }
      scene.render();
      if(now-lastStats>600){$('fps').textContent=Math.round(engine.getFps());lastStats=now;}
    });
    // Read-only inspection aid for reproducible smoke checks.
    window.fluidLab={getSnapshot:()=>({mode,released,worker:!!worker,engine:webgpu?'WebGPU':'WebGL 2',count:latest?.count,time:latest?.time,bodies:latest?.bodies.map(b=>({...b})),positions:latest?.positions.slice(),sizes:latest?.sizes.slice(),fps:engine.getFps()})};
  }catch(error){
    console.error(error);$('loading').hidden=false;$('loading').textContent=`実験室を起動できませんでした。${error.message}`;notice('ページを再読み込みしてください。WebGPUの問題はURLに ?webgl=1 を付けて切り替えられます。');
  }
})();
