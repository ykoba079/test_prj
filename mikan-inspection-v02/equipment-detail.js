// Equipment appearance adapted from https://playground.babylonjs.com/#KK480H#3.
// Existing conveyor, robot and container collision dimensions are preserved.
const B=globalThis.BABYLON;
function pbr(scene,name,color,metallic=0,roughness=.5){
  const m=new B.PBRMaterial(name,scene);m.albedoColor=B.Color3.FromHexString(color).toLinearSpace();m.metallic=metallic;m.roughness=roughness;return m;
}
function installStudioReflections(scene){
  const n=32,faces=[];
  for(let face=0;face<6;face++){
    const data=new Uint8Array(n*n*4);
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const u=x/(n-1)*2-1,v=y/(n-1)*2-1,panel=Math.max(0,1-Math.abs(u)*1.1)*Math.max(0,1-Math.abs(v)*2.5);
      const value=face===2?210:face===3?40:95+140*panel,i=(y*n+x)*4;
      data[i]=value;data[i+1]=value;data[i+2]=Math.min(255,value+3);data[i+3]=255;
    }faces.push(data);
  }
  const env=new B.RawCubeTexture(scene,faces,n,B.Engine.TEXTUREFORMAT_RGBA,B.Engine.TEXTURETYPE_UNSIGNED_BYTE,true,false,B.Texture.TRILINEAR_SAMPLINGMODE);
  env.gammaSpace=true;env.coordinatesMode=B.Texture.CUBIC_MODE;scene.environmentTexture=env;scene.environmentIntensity=.65;
}

export function createEquipmentDetails(scene){
  installStudioReflections(scene);
  const floorSupports=[];
  const steel=pbr(scene,'brushed-stainless','#b6bdc4',.86,.28),rubber=pbr(scene,'black-rubber','#222831',0,.78),alloy=pbr(scene,'machined-alloy','#d1d5d9',.82,.22),paint=pbr(scene,'powder-coat','#e7ebed',.12,.37),blue=pbr(scene,'motor-blue','#284c65',.25,.42);
  const slowBand=pbr(scene,'slow-band','#648fbc',.1,.5),fastBand=pbr(scene,'fast-band','#c5ab6c',.1,.5);
  const lineMeshes=[];
  function box(name,w,h,d,pos,mat=steel,parent=null){const m=B.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);m.position.copyFromFloats(...pos);m.material=mat;m.parent=parent;m.layerMask=3;return m;}
  function cyl(name,h,d,pos,mat=alloy,parent=null,tessellation=24){const m=B.MeshBuilder.CreateCylinder(name,{height:h,diameter:d,tessellation},scene);m.position.copyFromFloats(...pos);m.material=mat;m.parent=parent;m.layerMask=3;return m;}
  function bolt(parent,pos,axis='z',size=.052){const m=cyl('hex-fastener',.025,size,pos,alloy,parent,6);if(axis==='z')m.rotation.x=Math.PI/2;return m;}
  function tube(name,points,r,mat= rubber,parent=null){const m=B.MeshBuilder.CreateTube(name,{path:points.map(p=>new B.Vector3(...p)),radius:r,tessellation:10},scene);m.material=mat;m.parent=parent;m.layerMask=3;return m;}
  function label(parent,text,w,h,pos,bg='#203340',fg='#e5edf0'){
    const tex=new B.DynamicTexture('plate-'+text,{width:512,height:128},scene,true),c=tex.getContext();c.fillStyle=bg;c.fillRect(0,0,512,128);c.fillStyle=fg;c.font='bold 44px Arial';c.textAlign='center';c.textBaseline='middle';c.fillText(text,256,64);tex.update();
    const mat=pbr(scene,'label-'+text,'#ffffff',0,.7);mat.albedoTexture=tex;mat.emissiveColor=new B.Color3(.08,.08,.08);
    const plane=B.MeshBuilder.CreatePlane('nameplate',{width:w,height:h,sideOrientation:B.Mesh.DOUBLESIDE},scene);plane.material=mat;plane.parent=parent;plane.position.copyFromFloats(...pos);plane.layerMask=3;return plane;
  }
  function roller(mesh,diameter){
    mesh.material=steel;
    for(const y of [-1.30,1.30]){const hub=cyl('roller-endcap',.055,diameter*.91,[0,y,0],alloy,mesh);cyl('roller-shaft',.24,.08,[0,y+Math.sign(y)*.085,0],alloy,mesh);}
    // Narrow end band communicates drive role without coloring the whole metal roller.
    const ring=cyl('roller-drive-band',.035,diameter*1.008,[0,1.2,0],mesh.driveRole==='fast'?fastBand:mesh.driveRole==='slow'?slowBand:rubber,mesh);
  }
  function crate(name,x,z,color){
    // Match the existing solid collision container: bottom top -1.19, wall top -.12.
    const mat=pbr(scene,name+'-crate-plastic',color,0,.72),parts=[];
    const bar=(w,h,d,pos)=>{const m=box('crate-part',w,h,d,pos,mat);parts.push(m);};
    const width=1.7,depth=1.8,height=1.07;
    for(const sx of [-1,1])for(const sz of [-1,1])bar(.09,height,.09,[sx*width/2,height/2,sz*depth/2]);
    for(const side of [-1,1]){
      for(const y of [.12,.35,.58,.81,height])bar(width+.09,.055,.065,[0,y,side*depth/2]);
      for(let px=-.64;px<=.65;px+=.21)bar(.04,height,.045,[px,height/2,side*depth/2]);
      for(const y of [.12,.35,.58,.81,height])bar(.065,.055,depth+.09,[side*width/2,y,0]);
      for(let pz=-.67;pz<=.68;pz+=.22)bar(.045,height,.04,[side*width/2,height/2,pz]);
      // A thicker grip along each end; the opening remains visible beneath the rim.
      bar(.095,.10,.65,[side*width/2,height-.03,0]);
    }
    for(let px=-.65;px<=.66;px+=.22)bar(.045,.025,depth,[px,.015,0]);
    const mesh=B.Mesh.MergeMeshes(parts,true,true);mesh.name=name+'-crate-detail';mesh.position.set(x,-1.19,z);mesh.layerMask=3;mesh.isPickable=false;
    label(mesh,name, .55,.18,[0,.61,depth/2+.035],color);
    return mesh;
  }
  function armLink(link,length,index){
    const before=new Set(link.getChildMeshes());
    box('arm-service-cover',index?.15:.19,length*.66,.018,[0,0,-(index?.14:.17)],rubber,link);
    for(const y of [-.34,.34])bolt(link,[0,y*length,-(index?.16:.19)]);
    tube('arm-cable-loom',[[.14,-length*.39,.02],[.22,-length*.25,.02],[.22,length*.25,.02],[.12,length*.40,.02]],.025,rubber,link);
    return link.getChildMeshes().filter(m=>!before.has(m));
  }
  function armJoint(joint,index){
    const before=new Set(joint.getChildMeshes()),half=index===1?.19:.16;
    for(const side of [-1,1]){
      cyl('joint-servo-cover',.045,.31,[0,side*(half+.02),0],rubber,joint);
      cyl('joint-machined-face',.048,.21,[0,side*(half+.04),0],alloy,joint);
      for(let i=0;i<6;i++){const a=i*Math.PI/3;bolt(joint,[Math.cos(a)*.122,side*(half+.05),Math.sin(a)*.122],'y',.035);}
    }
    return joint.getChildMeshes().filter(m=>!before.has(m));
  }
  function decorate(){
    const floor=scene.getMeshByName('floor');floor.material=pbr(scene,'epoxy-floor','#344641',.05,.88);
    scene.getMeshByName('inspection-background').material=rubber;
    for(const rail of scene.meshes.filter(m=>m.name==='rail')){
      rail.material=steel;const side=Math.sign(rail.position.z);
      box('folded-top-flange',14,.05,.16,[0,.275,side*.02],alloy,rail);
      box('folded-bottom-flange',14,.045,.16,[0,-.2775,side*.02],steel,rail);
      box('rail-channel',13.7,.07,.014,[0,-.08,side*.067],rubber,rail);
      for(let x=-6.7;x<7;x+=.63){bolt(rail,[x,.18,side*.078]);bolt(rail,[x,-.2,side*.078]);}
      if(side>0){label(rail,'MIKAN / VISION SORTER',2.4,.19,[-3.5,.04,.074]);}
    }
    for(const leg of scene.meshes.filter(m=>m.name==='leg')){
      leg.material=alloy;
      for(const z of [-.083,.083])box('extrusion-slot',.028,.98,.008,[0,0,z],rubber,leg);
      cyl('leveling-thread',.15,.07,[0,-.55,0],steel,leg);
      cyl('leveling-foot',.06,.32,[0,-.59,0],rubber,leg);
    }
    for(const x of [-5,0,5]){const brace=box('cross-brace',.12,.14,2.9,[x,-.93,0],steel);lineMeshes.push(brace);}
    const drive=box('drive-gearbox',.55,.48,.38,[-6.2,-.31,-1.77],alloy);lineMeshes.push(drive);
    const motor=cyl('drive-motor',.83,.40,[0,0,-.55],blue,drive);motor.rotation.x=Math.PI/2;
    for(let z=-.9;z<-.2;z+=.09){const fin=cyl('motor-cooling-fin',.025,.45,[0,0,z],blue,drive);fin.rotation.x=Math.PI/2;}
    box('motor-terminal-box',.24,.14,.26,[0,.28,-.55],blue,drive);
    const cable=tube('motor-power',[[0,.2,-.55],[0,.4,-.55],[.6,.4,-.55],[.9,.15,-.1]],.025,rubber,drive);
    for(const cam of [scene.getMeshByName('top-camera'),scene.getMeshByName('oblique-camera')]){
      cam.material=paint;
      const barrel=cyl('camera-lens-barrel',.22,.23,[0,-.2,0],rubber,cam);
      cyl('camera-lens-bezel',.035,.26,[0,-.30,0],alloy,cam);
      const lens=cyl('camera-lens-glass',.01,.18,[0,-.322,0],pbr(scene,'optical-glass','#173749',.55,.08),cam);
      box('camera-mount',.16,.30,.15,[0,.25,0],alloy,cam);
      bolt(cam,[-.19,0,.28]);bolt(cam,[.19,0,.28]);
      tube('camera-cable',[[.14,.15,0],[.25,.4,.08],[.40,.48,.1],[.5,.35,.1]],.018,rubber,cam);
    }
    // Supported top camera bridge, positioned above the fruit's optical volume.
    box('camera-overhead-boom',.12,.12,2.0,[2,3.27,-.95],alloy);
    const post=box('oblique-camera-support',.10,3.7,.10,[2,1.1,2.7],alloy);
    floorSupports.push({mesh:post,top:2.95,height:3.7});
    box('oblique-camera-bracket',.1,.12,.38,[2,2.9,2.55],alloy);
    for(const x of [-.1,3.9]){
      const lamp=box('inspection-light-bar',.16,.09,2.5,[x,2.35,0],alloy);
      const diffuser=pbr(scene,'led-diffuser','#fcfcf1',0,.65);diffuser.emissiveColor=new B.Color3(.8,.85,.9);
      box('light-diffuser',.12,.012,2.34,[0,-.05,0],diffuser,lamp);
      box('light-mount',.1,.65,.1,[x,2.63,-1.75],alloy);
      box('light-support',.10,.1,1.9,[x,2.34,-.9],alloy);
    }
    const cabinet=box('electrical-cabinet',1.05,1.25,.55,[-3.6,-.65,-2.15],paint);
    floorSupports.push({mesh:box('cabinet-stand',.88,1,.42,[-3.6,-1.4,-2.15],alloy),top:-1.275,height:1});
    box('cabinet-door',.95,1.13,.025,[0,0,.287],alloy,cabinet);
    box('door-handle',.055,.24,.055,[.32,.05,.32],rubber,cabinet);
    label(cabinet,'VISION CONTROL',.76,.16,[0,.36,.31]);
    for(let y=-.42;y<-.15;y+=.055)box('vent-slot',.5,.015,.008,[-.08,y,.31],rubber,cabinet);
    const estop=cyl('emergency-stop',.07,.13,[-.28,.1,.34],pbr(scene,'stop-red','#ad2524',0,.5),cabinet);estop.rotation.x=Math.PI/2;
    lineMeshes.push(tube('conveyor-conduit',[[-3.6,0,-2.15],[-3.6,-.12,-1.9],[-5,-.38,-1.9],[-6.2,-.38,-1.9]],.035,rubber));
    
    const pedestal=scene.getMeshByName('robot-base');pedestal.material=paint;
    for(const x of [-.3,.3])for(const z of [-.3,.3])bolt(pedestal,[x,.19,z],'y',.085);
    return lineMeshes;
  }
  return {steel,rubber,alloy,paint,blue,box,cyl,bolt,tube,label,roller,decorate,crate,armLink,armJoint,syncFloor(floorY){for(const {mesh,top,height} of floorSupports){mesh.scaling.y=(top-floorY)/height;mesh.position.y=(top+floorY)/2;}}};
}
