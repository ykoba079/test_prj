const B=globalThis.BABYLON;
export function random(seed){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
function texture(name,size,scene,paint){const t=new B.DynamicTexture(name,size,scene,false);paint(t.getContext(),size.width,size.height);t.update();return t;}
export function createFruitFactory(scene){
  const rng=random(803);
  const peel=texture('peel',{width:512,height:256},scene,(c,w,h)=>{c.fillStyle='#fa961d';c.fillRect(0,0,w,h);for(let i=0;i<14000;i++){const x=rng()*w,y=rng()*h;c.fillStyle=rng()>.5?'rgba(192,93,8,.12)':'rgba(255,226,115,.19)';c.beginPath();c.ellipse(x,y,.3+rng()*.8,.3+rng()*.8,0,0,Math.PI*2);c.fill();}});
  const bump=texture('pores',{width:512,height:256},scene,(c,w,h)=>{c.fillStyle='#888';c.fillRect(0,0,w,h);for(let i=0;i<10000;i++){c.fillStyle=rng()>.5?'#aaa':'#555';c.fillRect(rng()*w,rng()*h,1,1);}});
  const skin=new B.StandardMaterial('citrus-peel',scene);skin.diffuseTexture=peel;skin.bumpTexture=bump;skin.bumpTexture.level=.13;skin.emissiveColor=new B.Color3(.3,.13,.02);skin.specularColor=new B.Color3(.07,.06,.03);
  const stem=new B.StandardMaterial('stem',scene);stem.diffuseColor=B.Color3.FromHexString('#b9aa76');stem.emissiveColor=new B.Color3(.15,.14,.08);
  function defectMaterial(kind,seed){const r=random(seed),t=texture(kind+'-texture',{width:128,height:128},scene,(c,w,h)=>{
    c.fillStyle=kind==='mold'?'#3e7651':'#75432b';c.fillRect(0,0,w,h);
    if(kind==='mold'){for(let i=0;i<260;i++){c.fillStyle=['#4b9968','#326044','#689b77','#9eae8b','#dcdbb4'][Math.floor(r()*5)];c.globalAlpha=.4+r()*.55;c.beginPath();c.arc(r()*w,r()*h,1+r()*9,0,Math.PI*2);c.fill();}}
    else {for(let i=0;i<50;i++){const x=r()*w,y=r()*h;c.strokeStyle=i%3?'#58301f':'#c98a53';c.lineWidth=.5+r()*3;c.beginPath();c.moveTo(x,y);c.bezierCurveTo(x+10,y-12,x+20,y+6,x+35+r()*35,y-10+r()*20);c.stroke();}for(let i=0;i<180;i++){c.fillStyle=r()>.5?'#95613b':'#5a3020';c.fillRect(r()*w,r()*h,r()*3+1,r()*2+1);}}
    c.globalAlpha=1;
  });const m=new B.StandardMaterial(kind+'-'+seed,scene);m.diffuseTexture=t;m.emissiveTexture=t;m.disableLighting=true;m.backFaceCulling=false;return m;}
  return function create({id,type=0,hidden=false,seed=id*717}){
    const r=random(seed),root=new B.TransformNode('fruit-'+id,scene),visual=new B.TransformNode('orientation-'+id,scene);visual.parent=root;visual.rotationQuaternion=B.Quaternion.Identity();
    const sphere=B.MeshBuilder.CreateSphere('mikan-'+id,{diameter:.78,segments:28},scene);sphere.scaling.y=.84;sphere.material=skin;sphere.parent=visual;sphere.layerMask=3;
    const cap=B.MeshBuilder.CreateCylinder('stem-'+id,{height:.035,diameter:.1,tessellation:8},scene);cap.position.y=.329;cap.material=stem;cap.parent=visual;cap.layerMask=3;
    const meshes=[sphere,cap],ownedMaterials=[];
    if(type){
      // A surface-fixed irregular patch, projected onto the fruit's ellipsoid.
      const normal=hidden?new B.Vector3(0,-1,0):new B.Vector3(r()-.5,r()-.5,r()-.5).normalize();
      const tangent=B.Vector3.Cross(normal,Math.abs(normal.y)>.9?B.Axis.X:B.Axis.Y).normalize(),bitangent=B.Vector3.Cross(normal,tangent).normalize();
      const positions=[],uvs=[],indices=[],ring=32,radius=type===1?.52:.44;
      function point(u,v){const p=normal.add(tangent.scale(u)).add(bitangent.scale(v)).normalize().scale(.396);positions.push(p.x,p.y*.84,p.z);uvs.push(.5+u/(radius*2.4),.5+v/(radius*2.4));}
      point(0,0);for(let i=0;i<=ring;i++){const a=i/ring*Math.PI*2,rough=.88+.12*Math.sin(a*5)+.07*Math.cos(a*9);point(Math.cos(a)*radius*rough,Math.sin(a)*radius*rough*(type===2?.62:1));if(i>0)indices.push(0,i,i+1);}
      const patch=new B.Mesh('surface-defect-'+id,scene),vd=new B.VertexData();vd.positions=positions;vd.indices=indices;vd.uvs=uvs;vd.normals=[];B.VertexData.ComputeNormals(positions,indices,vd.normals);vd.applyToMesh(patch);patch.parent=visual;patch.layerMask=3;patch.material=defectMaterial(type===1?'mold':'damage',seed);meshes.push(patch);ownedMaterials.push(patch.material);
    }
    root.position.set(-6.6,.42,0);
    return {id,root,visual,meshes,ownedMaterials,angle:0,frames:0,lastFrame:-1,directions:new Set(),evidence:{mold:0,damage:0},lastEvidence:{mold:-1,damage:-1},defects:new Set(),events:[],state:'observing',picked:false,observed:false};
  };
}
