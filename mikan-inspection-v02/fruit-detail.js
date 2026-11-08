// Procedural citrus inspired by the shape/skin approach in Babylon Playground KK480H#3.
// No clear-coat/wax layer. Keep the nominal 0.39 x 0.3276 envelope for the physics proxy.
const B=globalThis.BABYLON;
export function citrusPoint(direction,phase=0,offset=0){
  const n=Math.hypot(...direction),[x,y,z]=direction.map(v=>v/n),rho=Math.hypot(x,z),phi=Math.atan2(z,x);
  const ribs=1-.008*(1+Math.cos(9*phi+phase))*rho**2;
  const dimple=(y>0?.043:.026)*Math.exp(-((rho/.29)**2));
  return [(.39*ribs+offset)*x,.3276*y-Math.sign(y)*dimple+offset*y,(.39*ribs+offset)*z];
}
function noiseTexture(name,w,h,scene,paint){
  const texture=new B.DynamicTexture(name,{width:w,height:h},scene,false);paint(texture.getContext(),w,h);texture.update();texture.wrapU=B.Texture.WRAP_ADDRESSMODE;return texture;
}
export function createPeelKit(scene,rng){
  // A broad directional key reveals the peel relief. Bit 4 restricts it to
  // fruit meshes; the factory/rollers keep their existing lighting.
  const key=new B.DirectionalLight('citrus-soft-light',new B.Vector3(.35,-1,.45),scene);key.intensity=.9;key.includeOnlyWithLayerMask=4;
  // Shared textures: a broad colour variation plus shallow, irregular oil-gland pits.
  const W=1024,H=512,heights=new Float32Array(W*H),tones=new Float32Array(W*H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const i=y*W+x;
    tones[i]=Math.sin(x/W*Math.PI*6+Math.sin(y/H*8))*.5+Math.cos(x/W*Math.PI*10-y/H*12)*.25;
    heights[i]=(rng()-.5)*.025;
  }
  const cols=155,rows=77;
  for(let gy=0;gy<rows;gy++)for(let gx=0;gx<cols;gx++){
    const cx=(gx+.2+rng()*.6)*W/cols,cy=(gy+.2+rng()*.6)*H/rows,r=1.2+rng()*1.2,depth=.2+rng()*.28;
    for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){
      const x=(Math.round(cx)+dx+W)%W,y=Math.round(cy)+dy;if(y<0||y>=H)continue;
      const d=Math.hypot(dx,dy)/r,i=y*W+x;
      heights[i]+=-depth*Math.exp(-d*d*1.6)+depth*.12*Math.exp(-(((d-1.3)/.4)**2));
    }
  }
  const peel=noiseTexture('natural-citrus-peel',W,H,scene,(c,w,h)=>{
    const image=c.createImageData(w,h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=y*w+x,j=i*4,t=tones[i],pit=heights[i],grain=(rng()-.5)*5;
      image.data[j]=235+t*7+pit*13+grain;image.data[j+1]=132+t*12+pit*15+grain;image.data[j+2]=20+t*5+pit*7+grain;image.data[j+3]=255;
    }c.putImageData(image,0,0);
  });
  const normal=noiseTexture('citrus-oil-gland-normal',W,H,scene,(c,w,h)=>{
    const image=c.createImageData(w,h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const dx=(heights[y*w+(x+1)%w]-heights[y*w+(x+w-1)%w])*1.7;
      const dy=(heights[Math.min(h-1,y+1)*w+x]-heights[Math.max(0,y-1)*w+x])*1.7;
      const n=Math.hypot(dx,dy,1),j=(y*w+x)*4;image.data[j]=128-dx/n*127;image.data[j+1]=128-dy/n*127;image.data[j+2]=128+127/n;image.data[j+3]=255;
    }c.putImageData(image,0,0);
  });normal.gammaSpace=false;
  const rough=noiseTexture('citrus-roughness',W,H,scene,(c,w,h)=>{
    const image=c.createImageData(w,h);for(let i=0;i<w*h;i++){const j=i*4;image.data[j]=255;image.data[j+1]=Math.min(245,205+tones[i]*9-heights[i]*24);image.data[j+2]=0;image.data[j+3]=255;}c.putImageData(image,0,0);
  });rough.gammaSpace=false;
  function skin(name,albedo){
    const m=new B.PBRMaterial(name,scene);m.albedoTexture=albedo;m.metallic=0;m.roughness=1;m.metallicTexture=rough;m.useRoughnessFromMetallicTextureAlpha=false;m.useRoughnessFromMetallicTextureGreen=true;m.useMetallnessFromMetallicTextureBlue=true;m.bumpTexture=normal;m.bumpTexture.level=.75;m.directIntensity=.7;m.clearCoat.isEnabled=false;return m;
  }
  const mottledPeel=noiseTexture('natural-mottled-peel',W,H,scene,(c,w,h)=>{
    c.drawImage(peel.getContext().canvas,0,0);for(let i=0;i<24;i++){const x=rng()*w,y=rng()*h,r=20+rng()*55,g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,i%3?'rgba(223,178,38,.22)':'rgba(126,145,37,.24)');g.addColorStop(1,'rgba(223,178,38,0)');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);}
  });
  const calyx=new B.PBRMaterial('natural-calyx',scene);calyx.albedoColor=B.Color3.FromHexString('#667337').toLinearSpace();calyx.metallic=0;calyx.roughness=.9;calyx.backFaceCulling=false;
  const stem=new B.PBRMaterial('natural-stem',scene);stem.albedoColor=B.Color3.FromHexString('#85734c').toLinearSpace();stem.metallic=0;stem.roughness=.95;
  return {skin:skin('natural-citrus-skin',peel),mottled:skin('natural-mottled-skin',mottledPeel),calyx,stem};
}
export function shapeCitrus(mesh,phase){
  const positions=mesh.getVerticesData(B.VertexBuffer.PositionKind),indices=mesh.getIndices();
  for(let i=0;i<positions.length;i+=3){const p=citrusPoint([positions[i],positions[i+1],positions[i+2]],phase);positions[i]=p[0];positions[i+1]=p[1];positions[i+2]=p[2];}
  const normals=[];B.VertexData.ComputeNormals(positions,indices,normals);mesh.updateVerticesData(B.VertexBuffer.PositionKind,positions,true);mesh.updateVerticesData(B.VertexBuffer.NormalKind,normals);
}
export function createCalyx(scene,id,phase,material){
  const mesh=new B.Mesh('calyx-'+id,scene),positions=[],indices=[],uvs=[];
  // A five-lobed, gently curled star seated in the stem-end depression.
  for(let leaf=0;leaf<5;leaf++){
    const angle=phase+leaf*Math.PI*2/5,start=positions.length/3;
    for(let ring=0;ring<=4;ring++)for(const side of [-1,1]){
      const t=ring/4,r=.008+t*.085,w=Math.sin(Math.PI*t)*.024,a=angle+Math.sin(t*Math.PI)*.13;
      const x=Math.cos(a)*r-Math.sin(a)*w*side,z=Math.sin(a)*r+Math.cos(a)*w*side;
      const y=citrusPoint([x/.39,Math.sqrt(Math.max(0,1-(x*x+z*z)/(.39**2))),z/.39],phase)[1]+.004+Math.sin(t*Math.PI)*.006;
      positions.push(x,y,z);uvs.push((side+1)/2,t);
    }
    for(let ring=0;ring<4;ring++){const a=start+ring*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
  }
  const data=new B.VertexData();data.positions=positions;data.indices=indices;data.uvs=uvs;data.normals=[];B.VertexData.ComputeNormals(positions,indices,data.normals);data.applyToMesh(mesh);mesh.material=material;return mesh;
}
