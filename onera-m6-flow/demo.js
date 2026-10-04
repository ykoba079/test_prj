// Particle-only viewer: direct numerical CFD input, no Gaussian/SPZ rendering.
const BASE = new URL('./', import.meta.url).href;
const GAMMA = 1.4, FLOW_LO = 180, FLOW_HI = 420, MACH_LO = 0.4, MACH_HI = 1.8;
const CP_STOPS = ['#3b4cc0','#8db0fe','#dddcdc','#f4987a','#b40426'];
const FIELD_BOX = {x0:-.27,x1:2.64,y0:-.33,y1:.486,z0:-1.65,z1:0,hx:.03,hy:.012,hz:.03};
const TURBO_HEX = '30123b32154333184a341b51351e5836215f37246638276d392a733a2d793b2f803c32863d358b3e38913f3b973f3e9c4040a24143a74146ac4249b1424bb5434eba4451bf4454c34456c74559cb455ccf455ed34661d64664da4666dd4669e0466be3476ee64771e94773eb4776ee4778f0477bf2467df44680f64682f84685fa4687fb458afc458cfd448ffe4391fe4294ff4196ff4099ff3e9bfe3d9efe3ba0fd3aa3fc38a5fb37a8fa35abf833adf731aff52fb2f42eb4f22cb7f02ab9ee28bceb27bee925c0e723c3e422c5e220c7df1fc9dd1ecbda1ccdd81bd0d51ad2d21ad4d019d5cd18d7ca18d9c818dbc518ddc218dec018e0bd19e2bb19e3b91ae4b61ce6b41de7b21fe9af20eaac22ebaa25eca727eea42aefa12cf09e2ff19b32f29835f39438f4913cf58e3ff68a43f78746f8844af8804ef97d52fa7a55fa7659fb735dfc6f61fc6c65fd6969fd666dfe6271fe5f75fe5c79fe597dff5680ff5384ff5188ff4e8bff4b8fff4992ff4796fe4499fe429cfe409ffd3fa1fd3da4fc3ca7fc3aa9fb39acfb38affa37b1f936b4f836b7f735b9f635bcf534bef434c1f334c3f134c6f034c8ef34cbed34cdec34d0ea34d2e935d4e735d7e535d9e436dbe236dde037dfdf37e1dd37e3db38e5d938e7d739e9d539ebd339ecd13aeecf3aefcd3af1cb3af2c93af4c73af5c53af6c33af7c13af8be39f9bc39faba39fbb838fbb637fcb336fcb136fdae35fdac34fea933fea732fea431fea130fe9e2ffe9b2dfe992cfe962bfe932afe9029fd8d27fd8a26fc8725fc8423fb8122fb7e21fa7b1ff9781ef9751df8721cf76f1af66c19f56918f46617f36315f26014f15d13f05b12ef5811ed5510ec530feb500eea4e0de84b0ce7490ce5470be4450ae2430ae14109df3f08dd3d08dc3b07da3907d83706d63506d43305d23105d02f05ce2d04cc2b04ca2a04c82803c52603c32503c12302be2102bc2002b91e02b71d02b41b01b21a01af1801ac1701a91601a71401a41301a112019e10019b0f01980e01950d01920b018e0a018b09028808028507028106027e05027a0403';
const TURBO = (() => {
    const a = new Float32Array(TURBO_HEX.length / 2);
    for (let i = 0; i < a.length; i++) a[i] = parseInt(TURBO_HEX.substr(i * 2, 2), 16) / 255;
    return a;
})();
const TURBO_N = TURBO.length / 3;
const turboAt = t => {
    const i = Math.max(0, Math.min(TURBO_N - 1, Math.round(t * (TURBO_N - 1))));
    return [TURBO[3 * i], TURBO[3 * i + 1], TURBO[3 * i + 2]];
};

function buildWingHeight(pos, tris) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < pos.length; i += 3) {
        x0 = Math.min(x0, pos[i]); x1 = Math.max(x1, pos[i]);
        z0 = Math.min(z0, pos[i + 2]); z1 = Math.max(z1, pos[i + 2]);
    }
    const hx = 0.004, hz = 0.008;
    const nx = Math.ceil((x1 - x0) / hx) + 1, nz = Math.ceil((z1 - z0) / hz) + 1;
    const up = new Float32Array(nx * nz).fill(-Infinity), lo = new Float32Array(nx * nz).fill(Infinity);
    for (let t = 0; t < tris.length; t += 3) {
        const a = 3 * tris[t], b = 3 * tris[t + 1], c = 3 * tris[t + 2];
        const ax = pos[a], az = pos[a + 2], bx = pos[b], bz = pos[b + 2], cx = pos[c], cz = pos[c + 2];
        const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (Math.abs(det) < 1e-12) continue;
        const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / hx)), i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx, cx) - x0) / hx));
        const k0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - z0) / hz)), k1 = Math.min(nz - 1, Math.ceil((Math.max(az, bz, cz) - z0) / hz));
        for (let k = k0; k <= k1; k++) {
            const pz = z0 + k * hz;
            for (let i = i0; i <= i1; i++) {
                const px = x0 + i * hx;
                const l1 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / det;
                const l2 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / det;
                const l3 = 1 - l1 - l2;
                if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
                const y = l1 * pos[a + 1] + l2 * pos[b + 1] + l3 * pos[c + 1];
                const cell = k * nx + i;
                if (y > up[cell]) up[cell] = y;
                if (y < lo[cell]) lo[cell] = y;
            }
        }
    }
    return { x0, z0, hx, hz, nx, nz, up, lo };
}
function wingCell(H, x, z) {
    const i = Math.round((x - H.x0) / H.hx), k = Math.round((z - H.z0) / H.hz);
    if (i < 0 || k < 0 || i >= H.nx || k >= H.nz) return -1;
    const c = k * H.nx + i;
    return H.up[c] >= H.lo[c] ? c : -1;
}


function sampleField(F, x, y, z, out) {
    const B = FIELD_BOX;
    const gx = (x - B.x0) / B.hx, gy = (y - B.y0) / B.hy, gz = (z - B.z0) / B.hz;
    if (gx < 0 || gy < 0 || gz < 0 || gx >= F.nx - 1 || gy >= F.ny - 1 || gz >= F.nz - 1) return false;
    const i = gx | 0, j = gy | 0, k = gz | 0, tx = gx - i, ty = gy - j, tz = gz - k;
    const n = k * F.sxy + j * F.nx + i;
    const c = [n, n + 1, n + F.nx, n + F.nx + 1, n + F.sxy, n + F.sxy + 1, n + F.sxy + F.nx, n + F.sxy + F.nx + 1];
    const wts = [(1 - tx) * (1 - ty) * (1 - tz), tx * (1 - ty) * (1 - tz), (1 - tx) * ty * (1 - tz), tx * ty * (1 - tz),
                 (1 - tx) * (1 - ty) * tz, tx * (1 - ty) * tz, (1 - tx) * ty * tz, tx * ty * tz];
    let ax = 0, ay = 0, az = 0;
    for (let q = 0; q < 8; q++) { if (!wts[q]) continue; if (![F.vx[c[q]],F.vy[c[q]],F.vz[c[q]]].every(Number.isFinite)) return false; ax += wts[q] * F.vx[c[q]]; ay += wts[q] * F.vy[c[q]]; az += wts[q] * F.vz[c[q]]; }
    out[0] = ax; out[1] = ay; out[2] = az;
    return true;
}


const byId = id => document.getElementById(id);
function cpColor(cp) {
    const t = Math.max(0,Math.min(1,(cp+1.2)/1.8))*4;
    const i = Math.min(3,Math.floor(t));
    return BABYLON.Color3.Lerp(BABYLON.Color3.FromHexString(CP_STOPS[i]),BABYLON.Color3.FromHexString(CP_STOPS[i+1]),t-i);
}
function machColor(m) {
    const stops=[[.4,'#163a73'],[.75,'#1f7a8c'],[.999,'#d6ecea'],[1,'#ffd23f'],[1.25,'#ff8c1a'],[1.45,'#e63946'],[1.8,'#8e1b5a']];
    for(let i=1;i<stops.length;i++) if(m<=stops[i][0])
        return BABYLON.Color3.Lerp(BABYLON.Color3.FromHexString(stops[i-1][1]),BABYLON.Color3.FromHexString(stops[i][1]),Math.max(0,(m-stops[i-1][0])/(stops[i][0]-stops[i-1][0])));
    return BABYLON.Color3.FromHexString(stops.at(-1)[1]);
}
export default function createScene(engine,canvas) {
    const scene=new BABYLON.Scene(engine);
    scene.useRightHandedSystem=true;
    scene.clearColor=new BABYLON.Color4(.031,.059,.094,1);
    const HOME={target:new BABYLON.Vector3(.85,0,0),alpha:-1.1,beta:1.05,radius:4.7};
    const camera=new BABYLON.ArcRotateCamera('camera',HOME.alpha,HOME.beta,HOME.radius,HOME.target.clone(),scene);
    camera.attachControl(canvas,true);camera.fov=1.1;camera.fovMode=BABYLON.Camera.FOVMODE_HORIZONTAL_FIXED;
    camera.minZ=.01;camera.maxZ=80;camera.lowerRadiusLimit=.15;camera.upperRadiusLimit=15;
    camera.wheelDeltaPercentage=.015;camera.pinchDeltaPercentage=.015;camera.panningSensibility=900;
    camera.lowerBetaLimit=.015;camera.upperBetaLimit=Math.PI-.015;
    const setView=v=>{camera.inertialAlphaOffset=camera.inertialBetaOffset=camera.inertialRadiusOffset=0;camera.setTarget(v.target.clone());camera.alpha=v.alpha;camera.beta=v.beta;camera.radius=v.radius;};
    const light=new BABYLON.HemisphericLight('light',new BABYLON.Vector3(-.5,1,.3),scene);light.intensity=.95;
    const metal=new BABYLON.StandardMaterial('wing-metal',scene);metal.diffuseColor=new BABYLON.Color3(.56,.65,.73);metal.backFaceCulling=false;
    const pressure=new BABYLON.StandardMaterial('wing-pressure',scene);pressure.disableLighting=true;pressure.emissiveColor=BABYLON.Color3.White();pressure.backFaceCulling=false;
    const lut=new BABYLON.DynamicTexture('mach-colors',{width:1024,height:4},scene,false);
    const ctx=lut.getContext();
    for(let x=0;x<1024;x++){ctx.fillStyle=machColor(MACH_LO+(x+.5)/1024*(MACH_HI-MACH_LO)).toHexString();ctx.fillRect(x,0,1,4);}
    ctx.fillStyle='#08101c70';
    for(let n=9;n<36;n++)if(n!==20)ctx.fillRect(Math.round((n*.05-MACH_LO)/(MACH_HI-MACH_LO)*1024)-1,0,2,4);
    ctx.fillStyle='#ffffff';ctx.fillRect(Math.round((1-MACH_LO)/(MACH_HI-MACH_LO)*1024)-3,0,6,4);
    lut.update(false);lut.wrapU=lut.wrapV=BABYLON.Texture.CLAMP_ADDRESSMODE;
    const machMaterial=new BABYLON.StandardMaterial('wing-mach',scene);machMaterial.disableLighting=true;machMaterial.emissiveTexture=lut;machMaterial.backFaceCulling=false;
    const state={ready:false,errors:[],wing:[],cases:[],activeCaseIndex:null,data:null,field:null,H:null,geom:null,loading:false,shownParticles:0};
    const opts={surface:'pressure',paused:false,animSpeed:1,forces:false,band:'all'};
    const N=8000,K=.35/286,S={p:new Float32Array(N*3),d:new Float32Array(N*3),v:new Float32Array(N),age:new Float32Array(N)};
    const cache=new Map();let serial=0,speedTimer,recording=false;
    const matrix=new Float32Array(N*2*16),colors=new Float32Array(N*2*4);
    const arrowMatrix=new Float32Array(900*16),arrowColors=new Float32Array(900*4);
    function arrowMesh(name,m,c){
        const mesh=BABYLON.MeshBuilder.CreateCylinder(name,{height:1,diameterTop:1,diameterBottom:.15,tessellation:6},scene);
        mesh.rotation.z=-Math.PI/2;mesh.bakeCurrentTransformIntoVertices();mesh.position.x=-.5;mesh.bakeCurrentTransformIntoVertices();
        const material=new BABYLON.StandardMaterial(name+'-material',scene);material.disableLighting=true;material.diffuseColor=BABYLON.Color3.Black();material.emissiveColor=BABYLON.Color3.White();material.backFaceCulling=false;mesh.material=material;
        mesh.isPickable=false;mesh.alwaysSelectAsActiveMesh=true;mesh.thinInstanceSetBuffer('matrix',m,16,false);mesh.thinInstanceSetBuffer('color',c,4,false);return mesh;
    }
    const particles=arrowMesh('moving-particles',matrix,colors),arrows=arrowMesh('pressure-arrows',arrowMatrix,arrowColors);
    function hide(m,i){m.fill(0,i*16,i*16+15);m[i*16+15]=1;}
    function write(m,i,x,y,z,dx,dy,dz,L,w,mirror=false){
        let ex=-dz,ez=dx;const el=Math.hypot(ex,ez)||1;ex/=el;ez/=el;
        const fx=-ez*dy,fy=ez*dx-ex*dz,fz=ex*dy,s=mirror?-1:1,o=i*16;
        m.set([dx*L,dy*L,s*dz*L,0,fx*w,fy*w,s*fz*w,0,ex*w,0,s*ez*w,0,x,y,s*z,1],o);
    }
    function spawn(i,scatter=false){
        S.p[i*3]=scatter?FIELD_BOX.x0+.02+Math.random()*(FIELD_BOX.x1-FIELD_BOX.x0-.1):FIELD_BOX.x0+.02+Math.random()*.06;
        S.p[i*3+1]=-.22+Math.random()*.44;
        S.p[i*3+2]=-(.01+Math.random()*1.55);
        S.age[i]=0;S.v[i]=0;
    }
    function inside(x,y,z){const c=wingCell(state.H,x,z);return c>=0&&y>state.H.lo[c]&&y<state.H.up[c];}
    function step(dt){
        const a=[0,0,0],b=[0,0,0];
        for(let i=0;i<N;i++){
            let x=S.p[i*3],y=S.p[i*3+1],z=S.p[i*3+2];
            let ok=!inside(x,y,z)&&sampleField(state.field,x,y,z,a);
            if(ok)ok=sampleField(state.field,x+.5*dt*K*a[0],y+.5*dt*K*a[1],z+.5*dt*K*a[2],b);
            const speed=ok?Math.hypot(...b):0;
            const xx=x+dt*K*b[0],yy=y+dt*K*b[1],zz=z+dt*K*b[2];
            if(!ok||speed<5||xx>FIELD_BOX.x1-.06||S.age[i]>30||inside(xx,yy,zz)){spawn(i);continue;}
            S.p.set([xx,yy,zz],i*3);S.d.set(b.map(v=>v/speed),i*3);S.v[i]=speed;S.age[i]+=dt;
        }
    }
    function filter(v){
        if(opts.band==='all')return true;
        const free=state.data?.manifest.freestream_velocity_m_s||286;
        if(opts.band==='fast')return v>=free*1.05;
        if(opts.band==='slow')return v<=free*.95;
        return true;
    }
    function writeParticles(){
        let shown=0;
        for(let i=0;i<N;i++){
            if(S.v[i]<=0||!filter(S.v[i])){hide(matrix,i);hide(matrix,i+N);continue;}
            shown+=2;
            const p=Array.from(S.p.subarray(i*3,i*3+3)),d=Array.from(S.d.subarray(i*3,i*3+3)),L=.012+.04*S.v[i]/286;
            write(matrix,i,...p,...d,L,.0042);write(matrix,i+N,...p,...d,L,.0042,true);
            const c=turboAt((S.v[i]-FLOW_LO)/(FLOW_HI-FLOW_LO));
            for(const j of [i,i+N])colors.set([.15+.85*c[0],.15+.85*c[1],.15+.85*c[2],1],j*4);
        }
        particles.thinInstanceBufferUpdated('matrix');particles.thinInstanceBufferUpdated('color');
        if(shown!==state.shownParticles){state.shownParticles=shown;byId('particleCount').textContent=shown.toLocaleString('ja-JP');}
    }
    function writePressureArrows(){
        const a=state.data?.surface.arrows;if(!a)return;
        const qref=.5*1.4*101325*.8395**2;
        for(let i=0;i<450;i++){
            const p=a.centers.slice(i*3,i*3+3),n=a.normals.slice(i*3,i*3+3),dp=a.delta_pressure_Pa[i],L=.015+.12*Math.min(Math.abs(dp)/qref,1.2);
            const d=n.map(v=>v*(dp>0?-1:1)),head=p.map((v,k)=>v+n[k]*(.006+(dp>0?0:L)));
            write(arrowMatrix,i,...head,...d,L,.0035);write(arrowMatrix,i+450,...head,...d,L,.0035,true);
            const c=cpColor(a.cp[i]);for(const j of [i,i+450])arrowColors.set([c.r,c.g,c.b,1],j*4);
        }
        arrows.thinInstanceBufferUpdated('matrix');arrows.thinInstanceBufferUpdated('color');
    }
    function reseed(){if(!state.field)return;for(let i=0;i<N;i++)spawn(i,true);for(let k=0;k<3;k++)step(1/60);writeParticles();}
    function sync(){
        state.wing.forEach(m=>{m.setEnabled(true);m.material=opts.surface==='pressure'?pressure:opts.surface==='mach'?machMaterial:metal;m.useVertexColors=opts.surface==='pressure';});
        particles.setEnabled(true);arrows.setEnabled(opts.forces);
        for(const id of ['pause','animSpeed','reseed','fast','slow','all','surface'])byId(id).disabled=!state.ready;
        byId('pause').textContent=opts.paused?'再生':'一時停止';
        byId('cpLegend').hidden=opts.surface!=='pressure'&&!opts.forces;
        byId('cpLegendTitle').textContent=opts.surface==='pressure'?'圧力係数 Cp':'圧力差の矢印 · Cp';
        byId('machLegend').hidden=opts.surface!=='mach';
        byId('animSpeedLabel').textContent=opts.animSpeed.toFixed(2)+'×（スロー再生）';
        byId('filterLabel').textContent=opts.band==='fast'?'自由流速より5%以上速い':opts.band==='slow'?'自由流速より5%以上遅い':'すべて表示';
        writePressureArrows();writeParticles();
    }
    function setRelativeBand(mode){opts.band=mode;sync();}
    function status(message,error=false){byId('status').textContent=message;byId('status').classList.toggle('error-text',error);}
    async function json(url){const r=await fetch(BASE+url,{cache:'no-store'});if(!r.ok)throw Error(url+': HTTP '+r.status);return r.json();}
    async function loadCase(index){
        if(cache.has(index))return cache.get(index);
        const entry=state.cases[index],manifest=await json(entry.base_url+'/manifest.json');
        if(manifest.mach!==entry.mach)throw Error('Condition mismatch');
        const [surface,r]=await Promise.all([json(entry.base_url+'/surface.json?v='+manifest.surface_sha256),fetch(BASE+entry.base_url+'/velocity.bin.gz?v='+manifest.velocity_sha256)]);
        if(!r.ok)throw Error('Velocity field HTTP '+r.status);
        const bytes=await r.arrayBuffer();
        if(crypto.subtle){const digest=await crypto.subtle.digest('SHA-256',bytes);const hash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');if(hash!==manifest.velocity_sha256)throw Error('Velocity checksum mismatch');}
        const raw=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
        const b=manifest.grid,count=b.nx*b.ny*b.nz;
        if(raw.byteLength!==count*12||surface.mach.length!==state.geom.count||surface.colors.length!==state.geom.count*8)throw Error('Numerical field size mismatch');
        const xyz=new Float32Array(raw),vx=new Float32Array(count),vy=new Float32Array(count),vz=new Float32Array(count);
        for(let i=0;i<count;i++){vx[i]=xyz[i*3];vy[i]=xyz[i*3+1];vz[i]=xyz[i*3+2];}
        const field={nx:b.nx,ny:b.ny,nz:b.nz,sxy:b.nx*b.ny,vx,vy,vz};
        const uvs=new Float32Array(state.geom.count*2);
        for(let i=0;i<surface.mach.length;i++){uvs[i*2]=Math.max(.001,Math.min(.999,(surface.mach[i]-MACH_LO)/(MACH_HI-MACH_LO)));uvs[i*2+1]=.5;}
        const data={manifest,surface,field,uvs};cache.set(index,data);
        while(cache.size>2){const key=cache.keys().next().value;cache.delete(key);}
        return data;
    }
    async function selectSpeed(index){
        const token=++serial;if(index===state.activeCaseIndex){state.loading=false;status('定常解析の速度場を補間 · 粒子はスロー再生');return;}
        state.loading=true;status(Math.round(state.cases[index].velocity_m_s)+' m/s を読込中（画面は直前の条件）');
        try{const data=await loadCase(index);if(token!==serial||scene.isDisposed)return;
            state.data=data;state.field=data.field;state.activeCaseIndex=index;
            const half=data.surface.colors.length/2;
            state.wing.forEach((m,i)=>{m.updateVerticesData(BABYLON.VertexBuffer.ColorKind,data.surface.colors.slice(i*half,(i+1)*half));m.updateVerticesData(BABYLON.VertexBuffer.UVKind,data.uvs);});
            const m=data.manifest;
            byId('conditionInfo').textContent='Mach '+m.mach.toFixed(4)+' · '+Math.round(m.freestream_velocity_m_s)+' m/s · 迎角3.06°';
            byId('clcd').textContent='CL '+m.convergence.CL.toFixed(3)+' / CD '+m.convergence.CD.toFixed(4)+'（非粘性）';
            byId('machMax').textContent=Math.max(...data.surface.mach).toFixed(2);
            const cpStar=2/(GAMMA*m.mach*m.mach)*(Math.pow((2+(GAMMA-1)*m.mach*m.mach)/(GAMMA+1),GAMMA/(GAMMA-1))-1);
            byId('criticalCp').textContent=cpStar.toFixed(3);
            let supersonicArea=0;
            for(let t=0;t<state.geom.area.length;t++){
                const values=state.geom.tris.slice(t*3,t*3+3).map(i=>data.surface.mach[i]);
                const above=values.filter(v=>v>1),below=values.filter(v=>v<=1);let fraction=0;
                if(above.length===3)fraction=1;
                else if(above.length===1)fraction=(above[0]-1)**2/((above[0]-below[0])*(above[0]-below[1]));
                else if(above.length===2)fraction=1-(1-below[0])**2/((above[0]-below[0])*(above[1]-below[0]));
                supersonicArea+=state.geom.area[t]*fraction;
            }
            byId('supersonicArea').textContent=(supersonicArea/state.geom.totalArea*100).toFixed(1)+'%';
            byId('recordLink').href=entryUrl(index)+'/manifest.json';
            reseed();sync();await scene.whenReadyAsync();if(token!==serial)return;
            status('定常解析の速度場を補間 · 粒子はスロー再生');
        }catch(error){if(token!==serial)return;
            if(state.activeCaseIndex===null){state.errors.push(String(error));throw error;}
            byId('speed').value=state.activeCaseIndex;speedLabel(state.activeCaseIndex);
            status('読み込めませんでした。直前の条件を表示しています。選び直して再試行できます。',true);
        }finally{if(token===serial)state.loading=false;}
    }
    function entryUrl(i){return state.cases[i].base_url;}
    function speedLabel(i){const t=Math.round(state.cases[i].velocity_m_s)+' m/s';byId('speedLabel').textContent=t;byId('speed').setAttribute('aria-valuetext',t);}
    byId('speed').addEventListener('input',()=>{clearTimeout(speedTimer);++serial;const i=Number(byId('speed').value);speedLabel(i);speedTimer=setTimeout(()=>selectSpeed(i),180);});
    byId('speed').addEventListener('change',()=>{clearTimeout(speedTimer);selectSpeed(Number(byId('speed').value));});
    byId('forces').addEventListener('change',()=>{opts.forces=byId('forces').checked;sync();});
    byId('surface').addEventListener('change',()=>{opts.surface=byId('surface').value;sync();});
    byId('pause').addEventListener('click',()=>{opts.paused=!opts.paused;sync();});
    byId('animSpeed').addEventListener('input',()=>{opts.animSpeed=Number(byId('animSpeed').value);sync();});
    byId('reseed').addEventListener('click',reseed);
    byId('fast').addEventListener('click',()=>setRelativeBand('fast'));
    byId('slow').addEventListener('click',()=>setRelativeBand('slow'));
    byId('all').addEventListener('click',()=>setRelativeBand('all'));
    byId('home').addEventListener('click',()=>setView(HOME));
    byId('top').addEventListener('click',()=>setView({target:new BABYLON.Vector3(.9,0,0),alpha:-Math.PI/2,beta:.02,radius:4.4}));
    async function recordGif(){
        if(recording||!state.ready)return;recording=true;byId('gif').disabled=true;byId('gif').textContent='GIF保存中…';
        try{const lib=await import('https://cdn.jsdelivr.net/npm/gifenc@1.0.3/+esm');
            const c=document.createElement('canvas');c.width=640;c.height=480;const g=c.getContext('2d',{willReadFrequently:true}),frames=[];
            const start=performance.now();await new Promise(resolve=>{
                const observer=scene.onAfterRenderObservable.add(()=>{
                    const now=performance.now();if(now-start>=frames.length*100){
                        const src=engine.getRenderingCanvas();let w=src.width,h=w*.75;if(h>src.height){h=src.height;w=h/.75;}
                        g.drawImage(src,(src.width-w)/2,(src.height-h)/2,w,h,0,0,640,480);
                        g.fillStyle='#080f18cc';g.fillRect(10,446,460,24);g.font='14px sans-serif';g.fillStyle='#eef4fc';g.fillText('ONERA M6 · M '+state.data.manifest.mach+' · 定常速度場のスロー表示',18,463);
                        frames.push(g.getImageData(0,0,640,480).data);
                    }
                    if(now-start>=3000){scene.onAfterRenderObservable.remove(observer);resolve();}
                });
            });
            let bytes;
            for(const [stride,n] of [[1,128],[2,64],[3,32]]){
                const enc=lib.GIFEncoder();
                for(let i=0;i<frames.length;i+=stride){const palette=lib.quantize(frames[i],n);enc.writeFrame(lib.applyPalette(frames[i],palette),640,480,{palette,delay:100*stride});await new Promise(r=>setTimeout(r,0));}
                enc.finish();bytes=enc.bytes();if(bytes.length<5*1024*1024)break;
            }
            const url=URL.createObjectURL(new Blob([bytes],{type:'image/gif'})),a=document.createElement('a');a.href=url;a.download='onera-m6-flow-'+Math.round(state.data.manifest.freestream_velocity_m_s)+'ms.gif';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
            status('GIFを保存しました（640×480・3秒）');
        }catch(error){status('GIFを保存できませんでした。通信環境を確認して再試行してください。',true);}
        finally{recording=false;byId('gif').disabled=false;byId('gif').textContent='GIFを保存（3秒）';}
    }
    byId('gif').addEventListener('click',recordGif);
    scene.onBeforeRenderObservable.add(()=>{if(!state.ready||opts.paused)return;step(Math.min(engine.getDeltaTime()/1000,1/30)*opts.animSpeed);writeParticles();});
    scene.onDisposeObservable.add(()=>{clearTimeout(speedTimer);++serial;});
    (async()=>{try{
        const [registry,geometry]=await Promise.all([json('assets/speeds.json'),json('assets/wing.json')]);
        state.cases=registry.cases;const count=geometry.positions.length/6,indices=geometry.indices.slice(0,geometry.indices.length/2);
        let span=0;for(let i=0;i<count;i++)span=Math.max(span,-geometry.positions[i*3+2]);
        const positions=geometry.positions.slice(0,count*3),area=new Float32Array(indices.length/3);let totalArea=0;
        for(let t=0;t<area.length;t++){
            const a=indices[t*3]*3,b=indices[t*3+1]*3,c=indices[t*3+2]*3;
            const u=[0,1,2].map(k=>positions[b+k]-positions[a+k]),v=[0,1,2].map(k=>positions[c+k]-positions[a+k]);
            area[t]=.5*Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]);totalArea+=area[t];
        }
        state.geom={count,positions,tris:indices,span,area,totalArea};
        state.H=buildWingHeight(state.geom.positions,indices);
        for(let half=0;half<2;half++){
            const mesh=new BABYLON.Mesh('wing-'+half,scene),v=new BABYLON.VertexData();
            v.positions=geometry.positions.slice(half*count*3,(half+1)*count*3);
            v.indices=geometry.indices.slice(half*geometry.indices.length/2,(half+1)*geometry.indices.length/2).map(i=>i-half*count);
            v.normals=[];BABYLON.VertexData.ComputeNormals(v.positions,v.indices,v.normals,{useRightHandedSystem:true});
            v.colors=new Array(count*4).fill(1);v.uvs=new Array(count*2).fill(.5);v.applyToMesh(mesh,true);state.wing.push(mesh);
        }
        byId('speed').max=registry.cases.length-1;byId('speed').value=registry.default_index;speedLabel(registry.default_index);
        await selectSpeed(registry.default_index);state.ready=true;
        document.querySelectorAll('[data-ready]').forEach(e=>e.disabled=false);sync();
    }catch(error){state.errors.push(String(error));status('起動できませんでした。通信環境を確認して再読み込みしてください。',true);}})();
    scene.metadata={flow:{state,opts,S,selectSpeed,sync,setRelativeBand,reseed,recordGif,filter}};
    return scene;
}
