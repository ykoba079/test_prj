const B=globalThis.BABYLON;
// Appearance recipes are for generating images, never for authorizing robot picks.
export const FRUIT_VARIANTS=[
  {id:'standard',type:0,label:'正常：標準'},
  {id:'mottled',type:0,label:'正常：果皮の色むら'},
  {id:'mold-large',type:1,label:'カビ：広い病斑',legacy:true,radius:.76,count:1,aspect:1},
  {id:'mold-small',type:1,label:'カビ：小さい病斑',radius:.16,count:1,aspect:1},
  {id:'mold-spots',type:1,label:'カビ：点在する病斑',radius:.11,count:4,aspect:1},
  {id:'damage',type:2,label:'傷：従来の傷',legacy:true,radius:.44,count:1,aspect:.62},
  {id:'scratch',type:2,label:'傷：細い線状の傷',radius:.58,count:1,aspect:.10},
  {id:'scuff',type:2,label:'傷：淡い擦り傷',radius:.56,count:1,aspect:.68}
];
export const APPEARANCE_MIX={legacyDefectShare:.70};
export function chooseFruitAppearance(type,rng=Math.random){
  const choices=FRUIT_VARIANTS.filter(v=>v.type===type);
  if(!choices.length)throw new RangeError('Unknown fruit category');
  const legacy=type!==0&&rng()<APPEARANCE_MIX.legacyDefectShare;
  const pool=type===0?choices:choices.filter(v=>!!v.legacy===legacy);
  return pool[Math.floor(rng()*pool.length)].id;
}
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
  const mottled=new B.StandardMaterial('mottled-citrus-peel',scene);mottled.bumpTexture=bump;mottled.emissiveColor=skin.emissiveColor.clone();mottled.specularColor=skin.specularColor.clone();mottled.diffuseTexture=texture('mottled-peel',{width:512,height:256},scene,(c,w,h)=>{
    c.drawImage(peel.getContext().canvas,0,0);const r=random(1903);
    for(let i=0;i<28;i++){const x=r()*w,y=r()*h,rad=14+r()*30,g=c.createRadialGradient(x,y,0,x,y,rad);g.addColorStop(0,i%3?'rgba(219,179,42,.25)':'rgba(143,159,44,.22)');g.addColorStop(1,'rgba(240,172,35,0)');c.fillStyle=g;c.fillRect(x-rad,y-rad,rad*2,rad*2);}
  });
  const stem=new B.StandardMaterial('stem',scene);stem.diffuseColor=B.Color3.FromHexString('#b9aa76');stem.emissiveColor=new B.Color3(.15,.14,.08);
  function defectMaterial(kind,seed,style){const r=random(seed),size=kind==='mold'?256:128,t=texture(kind+'-texture',{width:size,height:size},scene,(c,w,h)=>{
    c.fillStyle=style==='scuff'?'#b9854e':'#75432b';c.fillRect(0,0,w,h);
    if(kind==='mold')paintBlueGreenMold(c,w,h,r);
    else {for(let i=0;i<50;i++){const x=r()*w,y=r()*h;c.strokeStyle=style==='scuff'?(i%3?'#cd9f66':'#976b40'):(i%3?'#58301f':'#c98a53');c.lineWidth=.5+r()*(style==='scuff'?1:3);c.beginPath();c.moveTo(x,y);c.bezierCurveTo(x+10,y-12,x+20,y+6,x+35+r()*35,y-10+r()*20);c.stroke();}for(let i=0;i<180;i++){c.fillStyle=style==='scuff'?'#c49661':r()>.5?'#95613b':'#5a3020';c.fillRect(r()*w,r()*h,r()*3+1,r()*2+1);}}
    c.globalAlpha=1;
  });const m=new B.StandardMaterial(kind+'-'+seed,scene);if(kind!=='mold')m.diffuseTexture=t;m.emissiveTexture=t;m.disableLighting=true;m.backFaceCulling=false;return m;}
  return function create({id,type=0,hidden=false,seed=id*717,variant=null}){
    const recipe=FRUIT_VARIANTS.find(v=>v.id===variant)||FRUIT_VARIANTS.find(v=>v.type===type);type=recipe.type;
    const r=random(seed),root=new B.TransformNode('fruit-'+id,scene),visual=new B.TransformNode('orientation-'+id,scene);visual.parent=root;visual.rotationQuaternion=B.Quaternion.Identity();
    const sphere=B.MeshBuilder.CreateSphere('mikan-'+id,{diameter:.78,segments:28},scene);sphere.scaling.y=.84;sphere.material=recipe.id==='mottled'?mottled:skin;sphere.parent=visual;sphere.layerMask=3;
    const cap=B.MeshBuilder.CreateCylinder('stem-'+id,{height:.035,diameter:.1,tessellation:8},scene);cap.position.y=.329;cap.material=stem;cap.parent=visual;cap.layerMask=3;
    const meshes=[sphere,cap],ownedMaterials=[];
    if(type){
      // A surface-fixed irregular patch, projected onto the fruit's ellipsoid.
      const normal=hidden?new B.Vector3(0,-1,0):new B.Vector3(r()-.5,r()-.5,r()-.5).normalize();
      const tangent=B.Vector3.Cross(normal,Math.abs(normal.y)>.9?B.Axis.X:B.Axis.Y).normalize(),bitangent=B.Vector3.Cross(normal,tangent).normalize();
      const mat=defectMaterial(type===1?'mold':'damage',seed,recipe.id);ownedMaterials.push(mat);
      for(let spot=0;spot<recipe.count;spot++){
        const positions=[],uvs=[],indices=[],ring=recipe.radius<.2?28:64,bands=recipe.radius<.2?4:10,radius=recipe.radius+(type===1?r()*(recipe.radius<.2?.035:.16):0);
        const a=spot*Math.PI*2/recipe.count,center=recipe.count===1?normal:normal.add(tangent.scale(Math.cos(a)*.42)).add(bitangent.scale(Math.sin(a)*.42)).normalize();
        const tx=B.Vector3.Cross(center,Math.abs(center.y)>.9?B.Axis.X:B.Axis.Y).normalize(),ty=B.Vector3.Cross(center,tx).normalize();
        function point(u,v){const p=center.add(tx.scale(u)).add(ty.scale(v)).normalize().scale(.396);positions.push(p.x,p.y*.84,p.z);uvs.push(.5+u/(radius*2.4),.5+v/(radius*2.4));}
        point(0,0);
        for(let band=1;band<=bands;band++)for(let i=0;i<=ring;i++){const a=i/ring*Math.PI*2,rough=.88+.12*Math.sin(a*5)+.07*Math.cos(a*9),rho=radius*rough*band/bands;point(Math.cos(a)*rho,Math.sin(a)*rho*recipe.aspect);}
        for(let i=0;i<ring;i++)indices.push(0,1+i,2+i);
        for(let band=1;band<bands;band++)for(let i=0;i<ring;i++){const a=1+(band-1)*(ring+1)+i,b=a+ring+1;indices.push(a,b,a+1,a+1,b,b+1);}
        const patch=new B.Mesh('surface-defect-'+id,scene),vd=new B.VertexData();vd.positions=positions;vd.indices=indices;vd.uvs=uvs;vd.normals=[];B.VertexData.ComputeNormals(positions,indices,vd.normals);vd.applyToMesh(patch);patch.parent=visual;patch.layerMask=3;patch.material=mat;meshes.push(patch);
      }
    }
    root.position.set(-6.6,.42,0);
    return {id,root,visual,meshes,ownedMaterials,angle:0,frames:0,lastFrame:-1,directions:new Set(),evidence:{mold:0,damage:0},lastEvidence:{mold:-1,damage:-1},defects:new Set(),events:[],state:'observing',picked:false,observed:false};
  };
}
