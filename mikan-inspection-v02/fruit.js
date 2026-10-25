const B=globalThis.BABYLON;
export function random(seed){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
function texture(name,size,scene,paint){const t=new B.DynamicTexture(name,size,scene,false);paint(t.getContext(),size.width,size.height);t.update();return t;}
function paintBlueGreenMold(c,w,h,r){
  const gridSize=17,grid=Float32Array.from({length:gridSize*gridSize},()=>r());
  function cloud(x,y){const gx=Math.max(0,Math.min(15.999,x)),gy=Math.max(0,Math.min(15.999,y)),ix=Math.floor(gx),iy=Math.floor(gy),u=gx-ix,v=gy-iy;const smooth=t=>t*t*(3-2*t),sx=smooth(u),sy=smooth(v);return (grid[iy*gridSize+ix]*(1-sx)+grid[iy*gridSize+ix+1]*sx)*(1-sy)+(grid[(iy+1)*gridSize+ix]*(1-sx)+grid[(iy+1)*gridSize+ix+1]*sx)*sy;}
  const image=c.createImageData(w,h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const u=x/w-.5,v=y/h-.5,d=Math.hypot(u,v),macro=cloud(x/w*7,y/h*7),fine=cloud(x/w*16,y/h*16),grain=(r()-.5)*20;
    const edge=Math.max(0,Math.min(1,(d-(.29+(macro-.5)*.07+(fine-.5)*.025))/.095)),white=edge*edge*(3-2*edge);
    const tone=(macro-.5)*32+(fine-.5)*11,core=[77+tone,127+tone,133+tone],rim=[225+tone*.3,229+tone*.3,217+tone*.3],p=(y*w+x)*4;
    for(let channel=0;channel<3;channel++)image.data[p+channel]=core[channel]*(1-white)+rim[channel]*white+grain;
    // Small pale grains and darker spores give a dry, powdery texture.
    if(r()<.055){const delta=r()<.5?23:-22;for(let channel=0;channel<3;channel++)image.data[p+channel]+=delta;}
    image.data[p+3]=255;
  }
  c.putImageData(image,0,0);
}
export function createFruitFactory(scene){
  const rng=random(803);
  const peel=texture('peel',{width:512,height:256},scene,(c,w,h)=>{c.fillStyle='#fa961d';c.fillRect(0,0,w,h);for(let i=0;i<14000;i++){const x=rng()*w,y=rng()*h;c.fillStyle=rng()>.5?'rgba(192,93,8,.12)':'rgba(255,226,115,.19)';c.beginPath();c.ellipse(x,y,.3+rng()*.8,.3+rng()*.8,0,0,Math.PI*2);c.fill();}});
  const bump=texture('pores',{width:512,height:256},scene,(c,w,h)=>{c.fillStyle='#888';c.fillRect(0,0,w,h);for(let i=0;i<10000;i++){c.fillStyle=rng()>.5?'#aaa':'#555';c.fillRect(rng()*w,rng()*h,1,1);}});
  const skin=new B.StandardMaterial('citrus-peel',scene);skin.diffuseTexture=peel;skin.bumpTexture=bump;skin.bumpTexture.level=.13;skin.emissiveColor=new B.Color3(.3,.13,.02);skin.specularColor=new B.Color3(.07,.06,.03);
  const stem=new B.StandardMaterial('stem',scene);stem.diffuseColor=B.Color3.FromHexString('#b9aa76');stem.emissiveColor=new B.Color3(.15,.14,.08);
  function defectMaterial(kind,seed){const r=random(seed),size=kind==='mold'?256:128,t=texture(kind+'-texture',{width:size,height:size},scene,(c,w,h)=>{
    c.fillStyle='#75432b';c.fillRect(0,0,w,h);
    if(kind==='mold')paintBlueGreenMold(c,w,h,r);
    else {for(let i=0;i<50;i++){const x=r()*w,y=r()*h;c.strokeStyle=i%3?'#58301f':'#c98a53';c.lineWidth=.5+r()*3;c.beginPath();c.moveTo(x,y);c.bezierCurveTo(x+10,y-12,x+20,y+6,x+35+r()*35,y-10+r()*20);c.stroke();}for(let i=0;i<180;i++){c.fillStyle=r()>.5?'#95613b':'#5a3020';c.fillRect(r()*w,r()*h,r()*3+1,r()*2+1);}}
    c.globalAlpha=1;
  });const m=new B.StandardMaterial(kind+'-'+seed,scene);if(kind!=='mold')m.diffuseTexture=t;m.emissiveTexture=t;m.disableLighting=true;m.backFaceCulling=false;return m;}
  return function create({id,type=0,hidden=false,seed=id*717}){
    const r=random(seed),root=new B.TransformNode('fruit-'+id,scene),visual=new B.TransformNode('orientation-'+id,scene);visual.parent=root;visual.rotationQuaternion=B.Quaternion.Identity();
    const sphere=B.MeshBuilder.CreateSphere('mikan-'+id,{diameter:.78,segments:28},scene);sphere.scaling.y=.84;sphere.material=skin;sphere.parent=visual;sphere.layerMask=3;
    const cap=B.MeshBuilder.CreateCylinder('stem-'+id,{height:.035,diameter:.1,tessellation:8},scene);cap.position.y=.329;cap.material=stem;cap.parent=visual;cap.layerMask=3;
    const meshes=[sphere,cap],ownedMaterials=[];
    if(type){
      // A surface-fixed irregular patch, projected onto the fruit's ellipsoid.
      const normal=hidden?new B.Vector3(0,-1,0):new B.Vector3(r()-.5,r()-.5,r()-.5).normalize();
      const tangent=B.Vector3.Cross(normal,Math.abs(normal.y)>.9?B.Axis.X:B.Axis.Y).normalize(),bitangent=B.Vector3.Cross(normal,tangent).normalize();
      const positions=[],uvs=[],indices=[],ring=64,bands=10,radius=type===1?.76+r()*.16:.44;
      function point(u,v){const p=normal.add(tangent.scale(u)).add(bitangent.scale(v)).normalize().scale(.396);positions.push(p.x,p.y*.84,p.z);uvs.push(.5+u/(radius*2.4),.5+v/(radius*2.4));}
      point(0,0);
      for(let band=1;band<=bands;band++)for(let i=0;i<=ring;i++){const a=i/ring*Math.PI*2,rough=.88+.12*Math.sin(a*5)+.07*Math.cos(a*9),rho=radius*rough*band/bands;point(Math.cos(a)*rho,Math.sin(a)*rho*(type===2?.62:1));}
      for(let i=0;i<ring;i++)indices.push(0,1+i,2+i);
      for(let band=1;band<bands;band++)for(let i=0;i<ring;i++){const a=1+(band-1)*(ring+1)+i,b=a+ring+1;indices.push(a,b,a+1,a+1,b,b+1);}
      const patch=new B.Mesh('surface-defect-'+id,scene),vd=new B.VertexData();vd.positions=positions;vd.indices=indices;vd.uvs=uvs;vd.normals=[];B.VertexData.ComputeNormals(positions,indices,vd.normals);vd.applyToMesh(patch);patch.parent=visual;patch.layerMask=3;patch.material=defectMaterial(type===1?'mold':'damage',seed);meshes.push(patch);ownedMaterials.push(patch.material);
    }
    root.position.set(-6.6,.42,0);
    return {id,root,visual,meshes,ownedMaterials,angle:0,frames:0,lastFrame:-1,directions:new Set(),evidence:{mold:0,damage:0},lastEvidence:{mold:-1,damage:-1},defects:new Set(),events:[],state:'observing',picked:false,observed:false};
  };
}
