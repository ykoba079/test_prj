// Procedural harvest-crate geometry adapted from the reviewed Playground KK480H / 3.
// No external GLB/OBJ asset is loaded. Dimensions describe the unscaled reference shape.
export const FLOOR_TOP=-3.60;
export const HARVEST_CRATE_SCALE=3.15/.535;
export const HARVEST_CRATE_SPEC={width:3.15,depth:.370*HARVEST_CRATE_SCALE,wallHeight:(.305-.0195)*HARVEST_CRATE_SCALE,footDepth:.0195*HARVEST_CRATE_SCALE,innerHalfX:(.2615-.0035)*HARVEST_CRATE_SCALE,innerHalfZ:(.179-.0035)*HARVEST_CRATE_SCALE,wallThickness:.04};
export function harvestCrateSpec(width){const ratio=width/HARVEST_CRATE_SPEC.width;return Object.fromEntries(Object.entries(HARVEST_CRATE_SPEC).map(([key,value])=>[key,key==='wallThickness'?value:value*ratio]));}
export const GOOD_CRATE_SPEC=harvestCrateSpec(5.0),REJECT_CRATE_SPEC=GOOD_CRATE_SPEC,GOOD_BIN_X=10.2;
export function createHarvestCrate(scene, hex = '#58734d') {
    // ---------------- 寸法 ----------------
    const L = 0.535, W = 0.370, H = 0.305;   // 外寸（リム外形）
    const RIM_H = 0.022;                      // リム（上縁）の高さ
    const HF = 0.016;                         // 底の脚（スタッキング用）高さ
    const T = 0.0035;                         // 格子の肉厚
    const AX = 0.2615, AZ = 0.179;            // 側壁外面の半寸法（リムが6mm張り出す）
    const R = 0.018;                          // 角の丸み
    const HW = H - HF - RIM_H;                // 側壁の高さ（リム下まで）
    // 格子は参考先より粗くし、3箱の常時描画が搬送・把持を圧迫しないようにする。
    const PITCH = 0.030, BAR = 0.003;         // ダイヤ格子のピッチと桟幅
    const FEET = 0.008;                       // 段積み時に下のコンテナへ入り込む深さ

    // ---------------- ジオメトリバッファ ----------------
    const P = [], N = [], IDX = [], panels={positions:[],normals:[],uvs:[],indices:[]};
    const I4 = BABYLON.Matrix.Identity();
    const tv = new BABYLON.Vector3(), tn = new BABYLON.Vector3();
    const vOut = new BABYLON.Vector3(), nOut = new BABYLON.Vector3();

    function pushV(M, x, y, z, nx, ny, nz) {
        tv.set(x, y, z); tn.set(nx, ny, nz);
        BABYLON.Vector3.TransformCoordinatesToRef(tv, M, vOut);
        BABYLON.Vector3.TransformNormalToRef(tn, M, nOut);
        nOut.normalize();
        P.push(vOut.x, vOut.y, vOut.z);
        N.push(nOut.x, nOut.y, nOut.z);
    }
    // 凸多角形の面（n は面法線、または頂点ごとの法線配列）
    function face(M, pts, n) {
        const b = P.length / 3;
        const per = Array.isArray(n[0]);
        for (let k = 0; k < pts.length; k++) {
            const q = pts[k], nn = per ? n[k] : n;
            pushV(M, q[0], q[1], q[2], nn[0], nn[1], nn[2]);
        }
        const a=pts[0],u=pts[1].map((v,i)=>v-a[i]),v=pts[2].map((q,i)=>q-a[i]),normal=per?n[0]:n;
        const flip=(u[1]*v[2]-u[2]*v[1])*normal[0]+(u[2]*v[0]-u[0]*v[2])*normal[1]+(u[0]*v[1]-u[1]*v[0])*normal[2]<0;
        for (let k = 1; k < pts.length - 1; k++) IDX.push(b, b + (flip?k+1:k), b + (flip?k:k+1));
    }
    function box(M, x0, x1, y0, y1, z0, z1) {
        face(M, [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0]);
        face(M, [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]], [-1, 0, 0]);
        face(M, [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, 1, 0]);
        face(M, [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]], [0, -1, 0]);
        face(M, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]);
        face(M, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1]);
    }
    // x 軸方向の円柱（取っ手の丸み）
    function cylX(M, x0, x1, cy, cz, r, seg) {
        const cap0 = [], cap1 = [];
        for (let k = 0; k < seg; k++) {
            const a0 = k / seg * Math.PI * 2, a1 = (k + 1) / seg * Math.PI * 2;
            const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
            face(M, [[x0, cy + r * c0, cz + r * s0], [x1, cy + r * c0, cz + r * s0],
                     [x1, cy + r * c1, cz + r * s1], [x0, cy + r * c1, cz + r * s1]],
                 [[0, c0, s0], [0, c0, s0], [0, c1, s1], [0, c1, s1]]);
            cap0.push([x0, cy + r * c0, cz + r * s0]);
            cap1.push([x1, cy + r * c0, cz + r * s0]);
        }
        face(M, cap0, [-1, 0, 0]);
        face(M, cap1, [1, 0, 0]);
    }
    // ダイヤ格子パネル（ローカル XY 平面、z: 0〜-T）
    function lattice(M, x0, y0, w, h) {
        // Alpha-tested panels retain visible openings without thousands of tiny solids.
        const base=panels.positions.length/3,n=BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0,0,1),M).normalize();
        for(const [x,y] of [[x0,y0],[x0+w,y0],[x0+w,y0+h],[x0,y0+h]]){
            const p=BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(x,y,-T/2),M);panels.positions.push(p.x,p.y,p.z);panels.normals.push(n.x,n.y,n.z);
        }
        const nx=Math.max(1,Math.round(w/PITCH)),ny=Math.max(1,Math.round(h/PITCH));
        panels.uvs.push(0,0,nx,0,nx,ny,0,ny);panels.indices.push(base,base+1,base+2,base,base+2,base+3);
    }
    function rrect(hx, hz, r, seg) {
        const out = [];
        const cs = [[hx - r, hz - r, 0], [-(hx - r), hz - r, Math.PI / 2],
                    [-(hx - r), -(hz - r), Math.PI], [hx - r, -(hz - r), Math.PI * 1.5]];
        for (const [cx, cz, a0] of cs) for (let k = 0; k <= seg; k++) {
            const a = a0 + k / seg * Math.PI / 2;
            out.push({ x: cx + r * Math.cos(a), z: cz + r * Math.sin(a), nx: Math.cos(a), nz: Math.sin(a) });
        }
        return out;
    }
    // 角丸リング（外形 o と内形 i の間、y0〜y1）
    function ring(o, i, y0, y1) {
        const n = o.length;
        for (let a = 0; a < n; a++) {
            const b = (a + 1) % n;
            face(I4, [[o[a].x, y1, o[a].z], [o[b].x, y1, o[b].z], [i[b].x, y1, i[b].z], [i[a].x, y1, i[a].z]], [0, 1, 0]);
            face(I4, [[o[a].x, y0, o[a].z], [o[b].x, y0, o[b].z], [i[b].x, y0, i[b].z], [i[a].x, y0, i[a].z]], [0, -1, 0]);
            face(I4, [[o[a].x, y0, o[a].z], [o[b].x, y0, o[b].z], [o[b].x, y1, o[b].z], [o[a].x, y1, o[a].z]],
                 [[o[a].nx, 0, o[a].nz], [o[b].nx, 0, o[b].nz], [o[b].nx, 0, o[b].nz], [o[a].nx, 0, o[a].nz]]);
            face(I4, [[i[a].x, y0, i[a].z], [i[b].x, y0, i[b].z], [i[b].x, y1, i[b].z], [i[a].x, y1, i[a].z]],
                 [[-i[a].nx, 0, -i[a].nz], [-i[b].nx, 0, -i[b].nz], [-i[b].nx, 0, -i[b].nz], [-i[a].nx, 0, -i[a].nz]]);
        }
    }
    // 角の柱（1/4円筒シェル）
    function arcShell(cx, cz, ro, ri, a0, a1, y0, y1, seg) {
        for (let k = 0; k < seg; k++) {
            const t0 = a0 + (a1 - a0) * k / seg, t1 = a0 + (a1 - a0) * (k + 1) / seg;
            const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
            face(I4, [[cx + ro * c0, y0, cz + ro * s0], [cx + ro * c1, y0, cz + ro * s1],
                      [cx + ro * c1, y1, cz + ro * s1], [cx + ro * c0, y1, cz + ro * s0]],
                 [[c0, 0, s0], [c1, 0, s1], [c1, 0, s1], [c0, 0, s0]]);
            face(I4, [[cx + ri * c0, y0, cz + ri * s0], [cx + ri * c1, y0, cz + ri * s1],
                      [cx + ri * c1, y1, cz + ri * s1], [cx + ri * c0, y1, cz + ri * s0]],
                 [[-c0, 0, -s0], [-c1, 0, -s1], [-c1, 0, -s1], [-c0, 0, -s0]]);
            face(I4, [[cx + ro * c0, y1, cz + ro * s0], [cx + ro * c1, y1, cz + ro * s1],
                      [cx + ri * c1, y1, cz + ri * s1], [cx + ri * c0, y1, cz + ri * s0]], [0, 1, 0]);
            face(I4, [[cx + ro * c0, y0, cz + ro * s0], [cx + ro * c1, y0, cz + ro * s1],
                      [cx + ri * c1, y0, cz + ri * s1], [cx + ri * c0, y0, cz + ri * s0]], [0, -1, 0]);
        }
    }

    // ---------------- 側壁 ----------------
    // ローカル座標: x=壁に沿う, y=上(底=0), z=外向き（外面 z=0、内面 z=-T）
    function wall(M, Ls, short) {
        const e = 0.004, rib = 0.010;
        const fz0 = -T - 0.0006, fz1 = 0.0018, rz1 = 0.0045;
        const top = HW + RIM_H - 0.004;           // リム天板の裏まで立ち上げる
        const bandB = 0.018;
        const bandT = 0.060;
        const yTopB = HW - bandT;
        const mh = 0.005;
        // 3段：下帯〜上帯の間を3分割（中帯2本）
        const rowH = (yTopB - bandB - 4 * mh) / 3;
        const yb1 = bandB + rowH + mh, yb2 = yb1 + 2 * mh + rowH + mh;   // 中帯の中心
        // 列幅：中央は銘板（ラベル面）、その上に手掛け穴
        const inner = Ls - 2 * e;
        const colW = short
            ? (() => { const c = 0.114, s = (inner - 2 * rib - c) / 2; return [s, c, s]; })()
            : (() => { const u = (inner - 4 * rib) / 6; return [u, u, 2 * u, u, u]; })();
        const ncol = colW.length, mid = (ncol - 1) / 2;
        const colX = [];
        { let x = -Ls / 2 + e; for (const w of colW) { colX.push(x); x += w + rib; } }

        box(M, -Ls / 2, Ls / 2, 0, bandB, fz0, fz1);                  // 下帯
        box(M, -Ls / 2, -Ls / 2 + e, 0, top, fz0, fz1);               // 端
        box(M, Ls / 2 - e, Ls / 2, 0, top, fz0, fz1);

        // ---- 上帯：中央に手掛け穴＋肉抜き（外面を凹ませ、縁だけ厚くする） ----
        const sy1 = HW - 0.010, sy0 = sy1 - 0.032;     // 手掛け穴の上下
        const sw = colW[mid] - 0.016;                  // 穴幅（銘板幅より少し狭く）
        const slots = [[-sw / 2, sw / 2]];
        const zb = -0.0008;                            // 凹部の外面（薄肉 約3mm）
        const fw = 0.005;                              // 縁の幅

        // 薄肉の背板（穴の部分を除く）
        box(M, -Ls / 2, Ls / 2, yTopB, sy0, fz0, zb);
        box(M, -Ls / 2, Ls / 2, sy1, top, fz0, zb);
        let xs = -Ls / 2;
        for (const [a, b] of slots) { box(M, xs, a, sy0, sy1, fz0, zb); xs = b; }
        box(M, xs, Ls / 2, sy0, sy1, fz0, zb);

        // 縁（外側に厚い部分）
        box(M, -Ls / 2, Ls / 2, yTopB, yTopB + fw, zb, fz1);   // 下の縁
        box(M, -Ls / 2, Ls / 2, HW - fw, HW, zb, fz1);         // リム直下の縁
        for (const [a, b] of slots) {
            // 穴まわりの枠（外側）
            box(M, a - fw, a, sy0 - fw, sy1 + fw, zb, fz1);
            box(M, b, b + fw, sy0 - fw, sy1 + fw, zb, fz1);
            box(M, a, b, sy0 - fw, sy0, zb, fz1);
            box(M, a, b, sy1, sy1 + fw, zb, fz1);
            // 穴まわりの枠（内側）
            box(M, a - 0.003, a, sy0, sy1, -T - 0.004, fz0);
            box(M, b, b + 0.003, sy0, sy1, -T - 0.004, fz0);
            box(M, a, b, sy0 - 0.003, sy0, -T - 0.004, fz0);
            // 握り部：内側だけ丸く（中身は詰めない）
            cylX(M, a - 0.003, b + 0.003, sy1 + 0.003, -T - 0.0015, 0.0035, 12);
        }

        for (let c = 0; c < ncol; c++) {
            const x = colX[c], w = colW[c];
            // 下段は全列格子
            lattice(M, x, bandB, w, yb1 - mh - bandB);
            box(M, x, x + w, yb1 - mh, yb1 + mh, fz0, fz1 + 0.0015);  // 中帯1
            if (c === mid) {
                // 中央列の上2段は銘板（平らな板、外周に細い縁）
                box(M, x, x + w, yb1 + mh, yTopB, fz0, 0.0004);
                box(M, x, x + w, yb1 + mh, yb1 + mh + 0.003, 0.0004, fz1);
            } else {
                lattice(M, x, yb1 + mh, w, yb2 - mh - (yb1 + mh));
                box(M, x, x + w, yb2 - mh, yb2 + mh, fz0, fz1 + 0.0015); // 中帯2
                lattice(M, x, yb2 + mh, w, yTopB - (yb2 + mh));
            }
            if (c < ncol - 1) {
                // 外側に張り出した縦リブ（リム下まで通す）
                box(M, x + w, x + w + rib, 0, top, -T - 0.0006, rz1);
            }
        }
    }
    const mk = (ry, tx, tz) => BABYLON.Matrix.RotationY(ry).multiply(BABYLON.Matrix.Translation(tx, HF, tz));
    wall(mk(0, 0, AZ), 2 * (AX - R), false);
    wall(mk(Math.PI, 0, -AZ), 2 * (AX - R), false);
    wall(mk(Math.PI / 2, AX, 0), 2 * (AZ - R), true);
    wall(mk(-Math.PI / 2, -AX, 0), 2 * (AZ - R), true);

    // ---------------- 角柱 ----------------
    const cxA = AX - R, czA = AZ - R, yA0 = HF, yA1 = H - 0.004;
    arcShell(cxA, czA, R, R - 0.006, 0, Math.PI / 2, yA0, yA1, 10);
    arcShell(-cxA, czA, R, R - 0.006, Math.PI / 2, Math.PI, yA0, yA1, 10);
    arcShell(-cxA, -czA, R, R - 0.006, Math.PI, Math.PI * 1.5, yA0, yA1, 10);
    arcShell(cxA, -czA, R, R - 0.006, Math.PI * 1.5, Math.PI * 2, yA0, yA1, 10);

    // ---------------- 底面 ----------------
    const fx = AX - 0.014, fzz = AZ - 0.014, frib = 0.010, fc = 4, fr = 3;
    const fpw = (2 * fx - (fc - 1) * frib) / fc, fph = (2 * fzz - (fr - 1) * frib) / fr;
    const Mf = BABYLON.Matrix.RotationX(Math.PI / 2).multiply(BABYLON.Matrix.Translation(0, HF, 0));
    for (let c = 0; c < fc; c++) for (let r = 0; r < fr; r++)
        lattice(Mf, -fx + c * (fpw + frib), -fzz + r * (fph + frib), fpw, fph);
    for (let c = 0; c < fc - 1; c++) {
        const x = -fx + c * (fpw + frib) + fpw;
        box(I4, x, x + frib, HF - 0.008, HF + T, -fzz, fzz);
    }
    for (let r = 0; r < fr - 1; r++) {
        const z = -fzz + r * (fph + frib) + fph;
        box(I4, -fx, fx, HF - 0.008, HF + T, z, z + frib);
    }
    ring(rrect(AX - 0.0005, AZ - 0.0005, R, 6), rrect(fx, fzz, 0.002, 6), HF - 0.008, HF + T);
    // スタッキング用の脚（下のコンテナのリム内に入る）
    ring(rrect(AX - 0.008, AZ - 0.008, 0.012, 6), rrect(AX - 0.015, AZ - 0.015, 0.006, 6), 0, FEET + 0.0005);

    // ---------------- リム（上縁、下側は中空の溝） ----------------
    // 天板は4mm厚、外スカートと壁の間は中空、内側は小さな返しだけ
    const rimIn = rrect(AX - T - 0.002, AZ - T - 0.002, R - T - 0.002, 6);
    ring(rrect(L / 2, W / 2, R + 0.006, 6), rimIn, H - 0.004, H);                                    // 天板
    ring(rrect(L / 2, W / 2, R + 0.006, 6), rrect(L / 2 - 0.0025, W / 2 - 0.0025, R + 0.0035, 6),
         H - RIM_H, H - 0.004);                                                                     // 外スカート
    ring(rrect(AX - T + 0.0005, AZ - T + 0.0005, R - T + 0.0005, 6), rimIn, H - 0.012, H - 0.004); // 内側の返し

    // ---------------- メッシュ化 ----------------
    const crate = new BABYLON.Mesh("harvestCrate", scene);
    const vd = new BABYLON.VertexData();
    vd.positions = P; vd.normals = N; vd.indices = IDX;
    vd.applyToMesh(crate);

    const mat = new BABYLON.PBRMaterial("polypropylene crate", scene);
    mat.albedoColor = BABYLON.Color3.FromHexString(hex).toLinearSpace();
    mat.metallic = 0;
    mat.roughness = 0.45;
    mat.backFaceCulling = true;
    crate.material = mat;
    crate.receiveShadows = true;
    const grille=new BABYLON.Mesh('crate-diamond-panels',scene),gd=new BABYLON.VertexData();
    Object.assign(gd,panels);gd.applyToMesh(grille);grille.parent=crate;grille.layerMask=3;grille.isPickable=false;
    const tex=new BABYLON.DynamicTexture('crate-diamond-pattern',128,scene,true),c=tex.getContext();
    c.clearRect(0,0,128,128);c.strokeStyle='#ffffff';c.lineWidth=128*BAR/PITCH;c.lineJoin='round';c.beginPath();c.moveTo(64,0);c.lineTo(128,64);c.lineTo(64,128);c.lineTo(0,64);c.closePath();c.stroke();tex.hasAlpha=true;tex.wrapU=tex.wrapV=BABYLON.Texture.WRAP_ADDRESSMODE;tex.update();
    const grilleMat=mat.clone('perforated polypropylene');grilleMat.albedoTexture=tex;grilleMat.useAlphaFromAlbedoTexture=true;grilleMat.transparencyMode=BABYLON.PBRMaterial.PBRMATERIAL_ALPHATEST;grilleMat.backFaceCulling=false;grilleMat.twoSidedLighting=true;grille.material=grilleMat;

    return {
        mesh: crate,
        setColor(h) { mat.albedoColor = BABYLON.Color3.FromHexString(h).toLinearSpace();grilleMat.albedoColor=mat.albedoColor.clone(); },
        ringHalfL: AX - 0.0005,   // 底の外周リング（いちばん外側の接地部）の長辺方向半寸法
        ringY: HF - 0.008,        // 同リングの下面高さ
        floorTop: HF + T,         // 内側の底面（格子の上面）
        innerX: AX - T, innerZ: AZ - T,   // 内壁の半寸法（長辺 x / 短辺 z）
        rimY: H,
        height: H,
    };
}
