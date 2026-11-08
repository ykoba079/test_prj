// Equipment appearance adapted from https://playground.babylonjs.com/#KK480H#3.
// Conveyor and robot dimensions are preserved; crate collision proxies follow the reference shape.
import {createHarvestCrate,HARVEST_CRATE_SCALE,HARVEST_CRATE_SPEC,GOOD_CRATE_SPEC,REJECT_CRATE_SPEC,GOOD_BIN_X,FLOOR_TOP} from './harvest-crate.js?v=20261108-standard-bins';
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
  const floorSupports=[],floorFeet=[],cameraMounts=[];
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
    const plane=B.MeshBuilder.CreatePlane('nameplate',{width:w,height:h,sideOrientation:B.Mesh.DOUBLESIDE},scene);plane.material=mat;plane.parent=parent;plane.position.copyFromFloats(...pos);plane.rotation.y=Math.PI;plane.layerMask=3;return plane;
  }
  function roller(mesh,diameter){
    mesh.material=steel;
    for(const y of [-1.30,1.30]){const hub=cyl('roller-endcap',.055,diameter*.91,[0,y,0],alloy,mesh);cyl('roller-shaft',.24,.08,[0,y+Math.sign(y)*.085,0],alloy,mesh);}
    // Narrow end band communicates drive role without coloring the whole metal roller.
    const ring=cyl('roller-drive-band',.035,diameter*1.008,[0,1.2,0],mesh.driveRole==='fast'?fastBand:mesh.driveRole==='slow'?slowBand:rubber,mesh);
  }
  function crate(name,x,z,color,spec=GOOD_CRATE_SPEC){
    const model=createHarvestCrate(scene,color),mesh=model.mesh,k=HARVEST_CRATE_SCALE*spec.width/HARVEST_CRATE_SPEC.width;
    // Local y=0 is the inside floor; feet project below it to rest on the room floor.
    const transform=B.Matrix.Translation(0,-model.floorTop,0).multiply(B.Matrix.Scaling(k,k,k));
    for(const part of [mesh,...mesh.getChildMeshes()])part.bakeTransformIntoVertices(transform);
    mesh.name=name+'-crate-detail';mesh.position.set(x,FLOOR_TOP+spec.footDepth,z);mesh.layerMask=3;mesh.isPickable=false;
    mesh.metadata={crate:{...spec,referenceMm:[535,370,305]}};
    for(const side of [-1,1]){
      const plate=label(mesh,name==='良品'?'GOOD':name==='不良'?'REJECT':'UNKNOWN',1.2,.22,[0,spec.wallHeight-.15,side*(spec.depth/2+.012)],color);if(side<0)plate.rotation.y+=Math.PI;
    }
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
  function railShell(rail){
    const side=Math.sign(rail.position.z),p=[[-.3,-.06],[-.3,.06],[.3,.06],[.3,-.06],[.275,-.06],[.275,.035],[-.275,.035],[-.275,-.06]].map(([y,z])=>[y,z*side]);
    const positions=[],normals=[],indices=[];
    function face(points,normal){
      let vertices=points.map(p=>new B.Vector3(...p));const n=B.Vector3.FromArray(normal).normalize();
      if(B.Vector3.Dot(B.Vector3.Cross(vertices[1].subtract(vertices[0]),vertices[2].subtract(vertices[0])),n)<0)vertices=vertices.reverse();
      const start=positions.length/3;for(const v of vertices){positions.push(v.x,v.y,v.z);normals.push(n.x,n.y,n.z);}indices.push(start,start+1,start+2,start,start+2,start+3);
    }
    const area=p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-b[0]*a[1];},0),sign=Math.sign(area);
    for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];face([[-7,...a],[7,...a],[7,...b],[-7,...b]],[0,(b[1]-a[1])*sign,-(b[0]-a[0])*sign]);}
    for(const x of [-7,7])for(const ids of [[0,1,6,7],[1,2,5,6],[2,3,4,5]])face(ids.map(i=>[x,...p[i]]),[Math.sign(x),0,0]);
    const mesh=new B.Mesh('folded-rail-shell',scene),data=new B.VertexData();data.positions=positions;data.normals=normals;data.indices=indices;data.applyToMesh(mesh);mesh.material=steel;mesh.parent=rail;mesh.layerMask=3;
    rail.isVisible=false; // Keep the original box only as the existing Havok collision proxy.
    return mesh;
  }
  function visionFrame(){
    const rear=-2.3,top=4.8;
    for(const x of [-.8,4.8]){
      const post=box('vision-gantry-post',.16,1,.16,[x,0,rear],alloy);floorSupports.push({mesh:post,top,height:1});
      const foot=box('vision-gantry-base',.48,.05,.44,[x,0,rear],steel);floorFeet.push(foot);
      for(const dx of [-.16,.16])for(const dz of [-.14,.14])bolt(foot,[dx,.035,dz],'y',.065);
    }
    box('vision-gantry-top',5.76,.16,.16,[2,top,rear],alloy);
    box('vision-light-support-rail',5.76,.12,.12,[2,2.8,rear],alloy);
    for(const x of [-.8,4.8])tube('vision-gantry-gusset',[[x,top-.6,rear],[x+(x<2?.6:-.6),top,rear]],.045,alloy);
    const anchors=[scene.getMeshByName('top-camera'),scene.getMeshByName('oblique-camera')].map(cam=>B.Vector3.TransformCoordinates(new B.Vector3(0,.4,0),cam.computeWorldMatrix(true)));
    const endZ=3.5;box('vision-camera-crossarm',.14,.14,endZ-rear+.12,[2,top,(rear+endZ)/2],alloy);
    for(const [i,a] of anchors.entries()){
      const hanger=box('camera-hanger',.10,1,.10,[a.x,(top+a.y)/2,a.z],alloy);
      const plate=box('camera-adjustment-plate',.22,.06,.22,[a.x,a.y+.03,a.z],steel);
      cameraMounts.push({hanger,plate,top});
      tube('camera-frame-cable',[[a.x+.08,a.y,a.z],[a.x+.08,top+.1,a.z],[a.x+.08,top+.1,rear],[4.8,top+.1,rear],[4.8,2.6,rear]],.018,rubber);
    }
  }
  function syncCameraMounts(views){
    for(const [i,v] of views.entries()){
      const housing=scene.getMeshByName(v.id==='A'?'top-camera':'oblique-camera');
      // The model's lens points along local -Y; align it with the actual sensor ray.
      housing.rotationQuaternion=B.Quaternion.FromUnitVectorsToRef(B.Vector3.Down(),v.camera.getForwardRay().direction,new B.Quaternion());
      const a=B.Vector3.TransformCoordinates(new B.Vector3(0,.4,0),housing.computeWorldMatrix(true)),m=cameraMounts[i];
      m.hanger.scaling.y=m.top-a.y;m.hanger.position.set(a.x,(m.top+a.y)/2,a.z);m.plate.position.set(a.x,a.y+.03,a.z);
    }
  }
  function exitChute(){
    const dx=1.15,drop=.55,length=Math.hypot(dx,drop),angle=Math.atan2(drop,dx),center=new B.Vector3(7.575,-.275,0),taper=.53;
    const floor=new B.Mesh('exit-chute-floor',scene),data=new B.VertexData(),a=length/2,t=.025;
    data.positions=[-a,-t,-1.35,-a,-t,1.35,a,-t,.82,a,-t,-.82,-a,t,-1.35,-a,t,1.35,a,t,.82,a,t,-.82];
    data.indices=[4,5,6,4,6,7,0,2,1,0,3,2,0,1,5,0,5,4,3,7,6,3,6,2,0,4,7,0,7,3,1,2,6,1,6,5];
    data.normals=[];B.VertexData.ComputeNormals(data.positions,data.indices,data.normals);data.applyToMesh(floor);floor.convertToFlatShadedMesh();floor.material=steel;floor.layerMask=3;floor.position.copyFrom(center);floor.rotationQuaternion=B.Quaternion.RotationAxis(B.Axis.Z,-angle);floor.metadata={chuteCollider:'hull'};lineMeshes.push(floor);
    for(const side of [-1,1]){
      const wall=box('exit-chute-wall',Math.hypot(length,taper),.32,.055,[center.x+Math.sin(angle)*.17,center.y+Math.cos(angle)*.17,side*1.085],steel);
      wall.rotationQuaternion=B.Quaternion.RotationAxis(B.Axis.Z,-angle).multiply(B.Quaternion.RotationAxis(B.Axis.Y,side*Math.atan2(taper,length)));wall.metadata={chuteCollider:'box'};lineMeshes.push(wall);
    }
  }
  function decorate(){
    const floor=scene.getMeshByName('floor');floor.material=pbr(scene,'epoxy-floor','#344641',.05,.88);
    scene.getMeshByName('inspection-background').material=rubber;
    for(const rail of scene.meshes.filter(m=>m.name==='rail')){
      rail.material=steel;const side=Math.sign(rail.position.z);railShell(rail);
      box('rail-channel',13.7,.07,.014,[0,-.08,side*.071],rubber,rail);
      for(let x=-6.7;x<7;x+=.63){bolt(rail,[x,.18,side*.075]);bolt(rail,[x,-.2,side*.075]);}
      if(side>0){label(rail,'MIKAN / VISION SORTER',2.4,.19,[-3.5,.04,.095]);}
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
    exitChute();
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
    visionFrame();
    for(const x of [-.1,3.9]){
      const lamp=box('inspection-light-bar',.36,.14,2.5,[x,4.55,0],alloy);
      const diffuser=pbr(scene,'led-diffuser','#fcfcf1',0,.65);diffuser.emissiveColor=new B.Color3(.8,.85,.9);
      box('light-diffuser',.30,.018,2.34,[0,-.08,0],diffuser,lamp);
      for(const side of [-1,1]){
        box('light-edge-diffuser',.014,.065,2.34,[side*.185,-.035,0],diffuser,lamp);
        const plate=label(lamp,'LED',.32,.11,[0,0,side*1.26],'#17212a');if(side<0)plate.rotation.y+=Math.PI;
      }
      box('light-mount',.1,.25,.1,[x,4.675,-2.3],alloy);
      box('light-support',.10,.1,1.1,[x,4.55,-1.775],alloy);
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
    floorSupports.push({mesh:box('robot-base-stand',.62,1,.62,[3,-1,2.1],paint),top:-.125,height:1});
    const baseFoot=box('robot-base-foot',.95,.05,.95,[3,0,2.1],steel);floorFeet.push(baseFoot);
    for(const x of [-.3,.3])for(const z of [-.3,.3])bolt(pedestal,[x,.19,z],'y',.085);
    syncFloor(floor.position.y+.05);
    return lineMeshes;
  }
  function syncFloor(floorY){for(const {mesh,top,height} of floorSupports){mesh.scaling.y=(top-floorY)/height;mesh.position.y=(top+floorY)/2;}for(const mesh of floorFeet)mesh.position.y=floorY+.025;}
  return {steel,rubber,alloy,paint,blue,box,cyl,bolt,tube,label,roller,decorate,crate,crateSpec:GOOD_CRATE_SPEC,goodCrateSpec:GOOD_CRATE_SPEC,rejectCrateSpec:REJECT_CRATE_SPEC,goodBinX:GOOD_BIN_X,floorTop:FLOOR_TOP,armLink,armJoint,syncFloor,syncCameraMounts};
}
