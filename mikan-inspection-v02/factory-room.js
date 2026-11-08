// Lightweight, open-front factory backdrop. All parts share the inspection scene.
const B=globalThis.BABYLON;
export function createFactoryRoom(scene,floor){
  const root=new B.TransformNode('factory-room',scene),meshes=[];
  function material(name,color,metallic=0,roughness=.8){
    if(metallic>0){const m=new B.PBRMaterial(name,scene);m.albedoColor=B.Color3.FromHexString(color).toLinearSpace();m.metallic=metallic;m.roughness=roughness;return m;}
    const m=new B.StandardMaterial(name,scene);m.diffuseColor=B.Color3.FromHexString(color).toLinearSpace();m.specularColor=new B.Color3(.015,.015,.015);m.specularPower=8;return m;
  }
  function texture(mat,value){if(mat instanceof B.PBRMaterial)mat.albedoTexture=value;else mat.diffuseTexture=value;}
  const wallMat=material('factory-wall-paint','#c3cbc5'),bandMat=material('factory-wall-band','#82948b'),concrete=material('factory-concrete','#a5afa8'),jointMat=material('factory-panel-joints','#8f9e95'),plinthMat=material('factory-plinth','#52645a'),metal=material('factory-hardware','#c1c7c5',.65,.35);
  function register(m,mat){m.parent=root;m.material=mat;m.layerMask=3;m.isPickable=false;m.metadata={factoryBackground:true};meshes.push(m);return m;}
  function box(name,w,h,d,x,y,z,mat){const m=register(B.MeshBuilder.CreateBox('factory-'+name,{width:w,height:h,depth:d},scene),mat);m.position.set(x,y,z);return m;}
  function panel(name,w,h,x,y,z,mat,rotation=0){const m=register(B.MeshBuilder.CreatePlane('factory-'+name,{width:w,height:h},scene),mat);m.position.set(x,y,z);m.rotation.y=rotation;return m;}
  function text(name,value,w,h,x,y,z,bg,fg='#ffffff'){
    const tex=new B.DynamicTexture('factory-'+name+'-text',{width:384,height:128},scene,true),c=tex.getContext();c.fillStyle=bg;c.fillRect(0,0,384,128);c.fillStyle=fg;c.font='bold 60px "Yu Gothic",Meiryo,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(value,192,65);tex.update();
    const mat=material('factory-'+name+'-ink','#ffffff',0,.8);texture(mat,tex);mat.emissiveColor=new B.Color3(.12,.12,.12);return panel(name,w,h,x,y,z,mat);
  }

  // Matte epoxy, with restrained grain and expansion joints instead of a flat color.
  const floorMat=material('factory-epoxy','#ffffff',0,.93),floorTex=new B.DynamicTexture('factory-floor-grain',512,scene,true),c=floorTex.getContext();
  c.fillStyle='#606d65';c.fillRect(0,0,512,512);let seed=1907;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<12000;i++){c.fillStyle=i%2?'rgba(255,255,255,.035)':'rgba(20,31,25,.04)';c.fillRect(random()*512,random()*512,1+random()*2,1+random()*2);}
  c.strokeStyle='rgba(31,44,36,.22)';c.lineWidth=1.5;c.strokeRect(.75,.75,510.5,510.5);floorTex.wrapU=floorTex.wrapV=B.Texture.WRAP_ADDRESSMODE;floorTex.uScale=9;floorTex.vScale=6;floorTex.update();texture(floorMat,floorTex);floor.material=floorMat;

  // Two single-sided walls leave the front and right open for viewing the equipment.
  panel('rear-wall',31,12,1.5,6,9.5,wallMat);
  panel('left-wall',19.5,12,-14,6,-.25,wallMat,-Math.PI/2);
  panel('rear-lower-band',31,2.2,1.5,1.6,9.48,bandMat);
  panel('left-lower-band',19.5,2.2,-13.98,1.6,-.25,bandMat,-Math.PI/2);
  box('rear-plinth',31,.5,.10,1.5,.25,9.42,plinthMat);
  box('left-plinth',.10,.5,19.5,-13.92,.25,-.25,plinthMat);
  for(const x of [-10.2,-2.25,5.25,13.1])box('rear-panel-joint',.018,9.2,.012,x,7.4,9.47,jointMat);
  for(const z of [-4.0,3.6])box('left-panel-joint',.012,9.2,.018,-13.97,7.4,z,jointMat);

  const guard=material('factory-column-guard','#ffffff',.05,.75),guardTex=new B.DynamicTexture('factory-guard-stripes',128,scene,true),g=guardTex.getContext();
  g.fillStyle='#b8a568';g.fillRect(0,0,128,128);g.strokeStyle='#414b43';g.lineWidth=22;for(let i=-128;i<256;i+=64){g.beginPath();g.moveTo(i,0);g.lineTo(i+128,128);g.stroke();}guardTex.wrapU=guardTex.wrapV=B.Texture.WRAP_ADDRESSMODE;guardTex.update();texture(guard,guardTex);
  function column(x,z){box('column',.48,12,.48,x,6,z,concrete);box('column-base',.70,.14,.70,x,.07,z,plinthMat);box('column-guard',.60,1.05,.60,x,.665,z,guard);}
  for(const x of [-13.75,-6,1.5,9,16.75])column(x,9.18);
  for(const z of [-7.5,0,7.5])column(-13.75,z);
  box('rear-beam',31,.42,.52,1.5,11.75,9.17,concrete);
  box('left-beam',.52,.42,19.5,-13.75,11.75,-.25,concrete);

  const marking=material('factory-floor-marking','#b7bba8',0,.95);
  // A quiet aisle marking in front of the line, outside the working area.
  for(const z of [-5.7,-4.0])box('aisle-line',25,.008,.06,2.5,.010,z,marking);

  const red=material('factory-hydrant-red','#b93430',.18,.45),doorRed=material('factory-hydrant-door','#cb4439',.14,.50),recess=material('factory-hydrant-recess','#762924',0,.8);
  box('hydrant-cabinet',1.94,2.25,.40,6.2,3.60,9.08,red);
  for(const x of [5.74,6.66])box('hydrant-door',.89,2.07,.045,x,3.60,8.85,doorRed);
  box('hydrant-door-joint',.025,2.05,.014,6.2,3.60,8.817,recess);
  text('hydrant-sign','消火栓',1.46,.48,6.2,4.14,8.79,'#cb4439');
  for(const x of [6.05,6.35]){box('hydrant-handle',.045,.35,.07,x,3.49,8.78,metal);for(const y of [3.35,3.63])box('hydrant-handle-foot',.08,.04,.035,x,y,8.805,metal);}
  for(let i=0;i<4;i++)box('hydrant-vent',.45,.022,.012,5.74,2.79+i*.06,8.816,recess);
  const lampMat=material('factory-hydrant-indicator','#e95038',.05,.3);lampMat.emissiveColor=new B.Color3(.45,.025,.012);
  const lamp=register(B.MeshBuilder.CreateSphere('factory-hydrant-indicator',{diameter:.12,segments:8},scene),lampMat);lamp.position.set(6.92,4.52,8.78);

  // Batch the static backdrop by material to avoid dozens of extra draw calls.
  const groups=new Map();for(const m of meshes){m.metadata.factoryParts=[m.name];const group=groups.get(m.material)||[];group.push(m);groups.set(m.material,group);}
  for(const [mat,group] of groups){
    if(group.length<2)continue;
    const names=group.map(m=>m.name),batch=B.Mesh.MergeMeshes(group,true,true,undefined,false,false);batch.name=mat.name+'-batch';batch.parent=root;batch.material=mat;batch.layerMask=3;batch.isPickable=false;batch.metadata={factoryBackground:true,factoryParts:names};meshes.push(batch);
  }
  for(let i=meshes.length-1;i>=0;i--)if(meshes[i].isDisposed())meshes.splice(i,1);
  function syncFloor(y){root.position.y=y;root.computeWorldMatrix(true);for(const m of meshes){m.unfreezeWorldMatrix();m.computeWorldMatrix(true);m.freezeWorldMatrix();}}
  syncFloor(floor.position.y+.05);
  return {root,meshes,syncFloor};
}
