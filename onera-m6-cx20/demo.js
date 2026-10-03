// ONERA M6 · Airflow in splats — Babylon.js Playground port (analysis edition)
// Original: https://ykoba079.github.io/test_prj/onera-m6/ (github.com/ykoba079/test_prj)
// All physics and streamline integration are computed offline (SU2 3-D steady Euler).
// The CFD assets are fetched from the original GitHub Pages site and decoded here.
//
// Additions over the original viewer:
//   1. Spanwise slab section (pick a span station and look at the airfoil-section flow side-on)
//   2. Local Mach number on the wing with iso-Mach lines and the sonic line (M = 1)
//   3. Speed-band filter for the flow splats and particles
//   4. Animated particles advected through a velocity field reconstructed from the splat packets
// The SPZ files are decoded in this script, so splats can be filtered per packet.
// NOTE: the animated field is an approximation rebuilt in the browser from the published packets
// (position / direction / speed), not the SU2 solution itself.

const BASE = new URL('../onera-m6/', import.meta.url).href;
const GAMMA = 1.4;
const FLOW_LO = 180, FLOW_HI = 420;          // turbo colour range used by build_assets.py
const PACKET = 7;                             // 1 bright head + 6 upstream tail splats
const MACH_LO = 0.4, MACH_HI = 1.6;           // wing Mach colour range
const CP_STOPS = ['#3b4cc0', '#8db0fe', '#dddcdc', '#f4987a', '#b40426'];
const MACH_STOPS = [[0.4, '#163a73'], [0.75, '#1f7a8c'], [0.999, '#d6ecea'],
                    [1.0, '#ffd23f'], [1.25, '#ff8c1a'], [1.45, '#e63946'], [1.6, '#8e1b5a']];
// matplotlib "turbo", 256 entries (same palette the author used to colour the splats)
const TURBO_HEX = '30123b32154333184a341b51351e5836215f37246638276d392a733a2d793b2f803c32863d358b3e38913f3b973f3e9c4040a24143a74146ac4249b1424bb5434eba4451bf4454c34456c74559cb455ccf455ed34661d64664da4666dd4669e0466be3476ee64771e94773eb4776ee4778f0477bf2467df44680f64682f84685fa4687fb458afc458cfd448ffe4391fe4294ff4196ff4099ff3e9bfe3d9efe3ba0fd3aa3fc38a5fb37a8fa35abf833adf731aff52fb2f42eb4f22cb7f02ab9ee28bceb27bee925c0e723c3e422c5e220c7df1fc9dd1ecbda1ccdd81bd0d51ad2d21ad4d019d5cd18d7ca18d9c818dbc518ddc218dec018e0bd19e2bb19e3b91ae4b61ce6b41de7b21fe9af20eaac22ebaa25eca727eea42aefa12cf09e2ff19b32f29835f39438f4913cf58e3ff68a43f78746f8844af8804ef97d52fa7a55fa7659fb735dfc6f61fc6c65fd6969fd666dfe6271fe5f75fe5c79fe597dff5680ff5384ff5188ff4e8bff4b8fff4992ff4796fe4499fe429cfe409ffd3fa1fd3da4fc3ca7fc3aa9fb39acfb38affa37b1f936b4f836b7f735b9f635bcf534bef434c1f334c3f134c6f034c8ef34cbed34cdec34d0ea34d2e935d4e735d7e535d9e436dbe236dde037dfdf37e1dd37e3db38e5d938e7d739e9d539ebd339ecd13aeecf3aefcd3af1cb3af2c93af4c73af5c53af6c33af7c13af8be39f9bc39faba39fbb838fbb637fcb336fcb136fdae35fdac34fea933fea732fea431fea130fe9e2ffe9b2dfe992cfe962bfe932afe9029fd8d27fd8a26fc8725fc8423fb8122fb7e21fa7b1ff9781ef9751df8721cf76f1af66c19f56918f46617f36315f26014f15d13f05b12ef5811ed5510ec530feb500eea4e0de84b0ce7490ce5470be4450ae2430ae14109df3f08dd3d08dc3b07da3907d83706d63506d43305d23105d02f05ce2d04cc2b04ca2a04c82803c52603c32503c12302be2102bc2002b91e02b71d02b41b01b21a01af1801ac1701a91601a71401a41301a112019e10019b0f01980e01950d01920b018e0a018b09028808028507028106027e05027a0403';

// ===================== pure helpers (no Babylon) =====================
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
function invertTurbo(r, g, b) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < TURBO_N; i++) {
        const dr = TURBO[3 * i] - r, dg = TURBO[3 * i + 1] - g, db = TURBO[3 * i + 2] - b;
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) { bestD = d; best = i; }
    }
    return best / (TURBO_N - 1);
}

async function gunzip(buffer) {
    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).arrayBuffer();
}

// SPZ v2 (SH degree 0) -> Babylon .splat layout (32 bytes/splat), no Y flip.
function decodeSpz(raw) {
    const u8 = new Uint8Array(raw), dv = new DataView(raw);
    const magic = dv.getUint32(0, true), version = dv.getUint32(4, true), n = dv.getUint32(8, true);
    if (magic !== 0x5053474e || version !== 2 || u8[12] !== 0) throw new Error('Unsupported SPZ file');
    const inv = 1 / (1 << u8[13]);
    const splat = new ArrayBuffer(n * 32);
    const f32 = new Float32Array(splat), b8 = new Uint8ClampedArray(splat);
    const pos = new Float32Array(n * 3), rgb = new Float32Array(n * 3);
    let o = 16;
    for (let i = 0; i < n; i++) {
        for (let k = 0; k < 3; k++, o += 3) {
            let v = u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16);
            if (v & 0x800000) v -= 0x1000000;
            v *= inv;
            pos[3 * i + k] = v;
            f32[8 * i + k] = v;
        }
    }
    const oA = o, oC = oA + n, oS = oC + 3 * n, oR = oS + 3 * n;
    for (let i = 0; i < n; i++) {
        for (let k = 0; k < 3; k++) {
            const c = 0.5 + 0.28209479177387814 * ((u8[oC + 3 * i + k] - 127.5) / 38.25);
            rgb[3 * i + k] = c;
            b8[32 * i + 24 + k] = c * 255;
            f32[8 * i + 3 + k] = Math.exp(u8[oS + 3 * i + k] / 16 - 10);
        }
        b8[32 * i + 27] = u8[oA + i];
        const x = u8[oR + 3 * i] / 127.5 - 1, y = u8[oR + 3 * i + 1] / 127.5 - 1, z = u8[oR + 3 * i + 2] / 127.5 - 1;
        b8[32 * i + 28] = 127.5 + 127.5 * Math.sqrt(Math.max(0, 1 - x * x - y * y - z * z));
        b8[32 * i + 29] = u8[oR + 3 * i];
        b8[32 * i + 30] = u8[oR + 3 * i + 1];
        b8[32 * i + 31] = u8[oR + 3 * i + 2];
    }
    return { n, half: n / 2, splat, u32: new Uint32Array(splat), pos, rgb };
}

// Speed of each flow packet, recovered from the tail colour (tails carry the raw turbo colour).
function packetSpeeds(spz) {
    const speed = new Float32Array(spz.n), half = spz.half, rgb = spz.rgb;
    for (let base = 0; base < half; base += PACKET) {
        const ref = base + 1 < half ? base + 1 : base;
        let r = rgb[3 * ref], g = rgb[3 * ref + 1], b = rgb[3 * ref + 2];
        if (ref === base) { r = (r - 0.5) * 2; g = (g - 0.5) * 2; b = (b - 0.5) * 2; } // head = rgb*0.5+0.5
        const v = FLOW_LO + (FLOW_HI - FLOW_LO) * invertTurbo(r, g, b);
        for (let i = base; i < Math.min(base + PACKET, half); i++) { speed[i] = v; speed[i + half] = v; }
    }
    return speed;
}

// Local Mach number from Cp (isentropic relation with free-stream total pressure).
function machFromCp(cp, mInf) {
    const p0 = Math.pow(1 + 0.5 * (GAMMA - 1) * mInf * mInf, GAMMA / (GAMMA - 1));
    const out = new Float32Array(cp.length);
    for (let i = 0; i < cp.length; i++) {
        const ratio = p0 / Math.max(1e-6, 1 + 0.5 * GAMMA * mInf * mInf * cp[i]);
        out[i] = ratio <= 1 ? 0 : Math.sqrt(2 / (GAMMA - 1) * (Math.pow(ratio, (GAMMA - 1) / GAMMA) - 1));
    }
    return out;
}
const criticalCp = m => 2 / (GAMMA * m * m) *
    (Math.pow((2 + (GAMMA - 1) * m * m) / (GAMMA + 1), GAMMA / (GAMMA - 1)) - 1);

function machColor(M) {
    const s = MACH_STOPS;
    if (M <= s[0][0]) return BABYLON.Color3.FromHexString(s[0][1]);
    for (let i = 1; i < s.length; i++) {
        if (M <= s[i][0]) {
            const t = (M - s[i - 1][0]) / (s[i][0] - s[i - 1][0]);
            return BABYLON.Color3.Lerp(BABYLON.Color3.FromHexString(s[i - 1][1]), BABYLON.Color3.FromHexString(s[i][1]), t);
        }
    }
    return BABYLON.Color3.FromHexString(s[s.length - 1][1]);
}

// ===================== velocity-field reconstruction & particle advection (pure) =====================
const FIELD_BOX = { x0: -0.27, x1: 2.64, y0: -0.33, y1: 0.48, z0: -1.65, z1: 0.0, hx: 0.03, hy: 0.012, hz: 0.03 };
const KERNEL = { sx: 0.06, sy: 0.011, sz: 0.03 };   // anisotropic: long along the stream, thin across

// Upper/lower wing surface as a height map over the (x, z) plane (computed half only).
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

// Velocity field on a grid, splatted from the streamline packets (separable Gaussian kernel),
// never mixing the upper and lower side of the wing; holes are filled from the free stream.
function buildField(flow, speed, H, vInf, aoaDeg) {
    const B = FIELD_BOX;
    const nx = Math.round((B.x1 - B.x0) / B.hx) + 1, ny = Math.round((B.y1 - B.y0) / B.hy) + 1, nz = Math.round((B.z1 - B.z0) / B.hz) + 1;
    const N = nx * ny * nz, sxy = nx * ny;
    const vx = new Float32Array(N), vy = new Float32Array(N), vz = new Float32Array(N), w = new Float32Array(N);
    // wing mid-surface at each (x, z) grid column
    const colMid = new Float32Array(nx * nz).fill(NaN), colUp = new Float32Array(nx * nz), colLo = new Float32Array(nx * nz);
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
        const c = wingCell(H, B.x0 + i * B.hx, B.z0 + k * B.hz);
        if (c >= 0) { colMid[k * nx + i] = 0.5 * (H.up[c] + H.lo[c]); colUp[k * nx + i] = H.up[c]; colLo[k * nx + i] = H.lo[c]; }
    }
    const ex = 2.5 * KERNEL.sx, ey = 2.5 * KERNEL.sy, ez = 2.5 * KERNEL.sz;
    const wx = [], wy = [], wz = [];
    const P = flow.pos, half = flow.half;
    for (let base = 0; base < half; base += 7) {
        const cnt = Math.min(7, half - base);
        for (let j = 0; j < cnt; j++) {
            const i = base + j, a = j > 0 ? i - 1 : i, b = j + 1 < cnt ? i + 1 : i;   // a: downstream, b: upstream
            let dx = P[3 * a] - P[3 * b], dy = P[3 * a + 1] - P[3 * b + 1], dz = P[3 * a + 2] - P[3 * b + 2];
            const len = Math.hypot(dx, dy, dz);
            if (len < 1e-6) continue;
            const s = speed[i] / len; dx *= s; dy *= s; dz *= s;
            const px = P[3 * i], py = P[3 * i + 1], pz = P[3 * i + 2];
            const i0 = Math.max(0, Math.ceil((px - ex - B.x0) / B.hx)), i1 = Math.min(nx - 1, Math.floor((px + ex - B.x0) / B.hx));
            const j0 = Math.max(0, Math.ceil((py - ey - B.y0) / B.hy)), j1 = Math.min(ny - 1, Math.floor((py + ey - B.y0) / B.hy));
            const k0 = Math.max(0, Math.ceil((pz - ez - B.z0) / B.hz)), k1 = Math.min(nz - 1, Math.floor((pz + ez - B.z0) / B.hz));
            for (let q = i0; q <= i1; q++) { const d = (B.x0 + q * B.hx - px) / KERNEL.sx; wx[q - i0] = Math.exp(-0.5 * d * d); }
            for (let q = j0; q <= j1; q++) { const d = (B.y0 + q * B.hy - py) / KERNEL.sy; wy[q - j0] = Math.exp(-0.5 * d * d); }
            for (let q = k0; q <= k1; q++) { const d = (B.z0 + q * B.hz - pz) / KERNEL.sz; wz[q - k0] = Math.exp(-0.5 * d * d); }
            for (let k = k0; k <= k1; k++) {
                for (let ii = i0; ii <= i1; ii++) {
                    const col = k * nx + ii, mid = colMid[col], hasWing = mid === mid;
                    const sampleAbove = py > mid;
                    const wxz = wx[ii - i0] * wz[k - k0];
                    for (let jj = j0; jj <= j1; jj++) {
                        if (hasWing) {
                            const ny_ = B.y0 + jj * B.hy;
                            if ((ny_ > mid) !== sampleAbove) continue;
                            if (ny_ > colLo[col] && ny_ < colUp[col]) continue;
                        }
                        const wt = wxz * wy[jj - j0];
                        const n = k * sxy + jj * nx + ii;
                        vx[n] += wt * dx; vy[n] += wt * dy; vz[n] += wt * dz; w[n] += wt;
                    }
                }
            }
        }
    }
    const a = aoaDeg * Math.PI / 180, fx = vInf * Math.cos(a), fy = vInf * Math.sin(a);
    const known = new Uint8Array(N);
    for (let n = 0; n < N; n++) {
        if (w[n] > 0.05) { vx[n] /= w[n]; vy[n] /= w[n]; vz[n] /= w[n]; known[n] = 1; }
        else { vx[n] = fx; vy[n] = fy; vz[n] = 0; }
    }
    // smooth the seams between sampled flow and free-stream fill
    for (let it = 0; it < 8; it++) {
        for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
            const n = k * sxy + j * nx + i;
            if (known[n]) continue;
            vx[n] = (vx[n - 1] + vx[n + 1] + vx[n - nx] + vx[n + nx] + vx[n - sxy] + vx[n + sxy]) / 6;
            vy[n] = (vy[n - 1] + vy[n + 1] + vy[n - nx] + vy[n + nx] + vy[n - sxy] + vy[n + sxy]) / 6;
            vz[n] = (vz[n - 1] + vz[n + 1] + vz[n - nx] + vz[n + nx] + vz[n - sxy] + vz[n + sxy]) / 6;
        }
    }
    return { nx, ny, nz, sxy, vx, vy, vz, vInf, fx, fy };
}

// Trilinear sample; returns false outside the grid.
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
    for (let q = 0; q < 8; q++) { ax += wts[q] * F.vx[c[q]]; ay += wts[q] * F.vy[c[q]]; az += wts[q] * F.vz[c[q]]; }
    out[0] = ax; out[1] = ay; out[2] = az;
    return true;
}

// Particle pool (computed half only; mirrored at draw time).
function createParticles(n) {
    return { n, p: new Float32Array(3 * n), d: new Float32Array(3 * n), v: new Float32Array(n), age: new Float32Array(n) };
}
function spawn(S, i, region, scatter) {
    const B = FIELD_BOX;
    S.p[3 * i] = scatter ? B.x0 + 0.02 + Math.random() * (B.x1 - B.x0 - 0.1) : B.x0 + 0.02 + Math.random() * 0.06;
    S.p[3 * i + 1] = -0.22 + Math.random() * 0.44;
    S.p[3 * i + 2] = region.slab ? region.zc + (2 * Math.random() - 1) * region.hw : -(0.01 + Math.random() * 1.55);
    S.age[i] = scatter ? Math.random() * 4 : 0;
}
// dtSim: seconds of animation time; k: display metres per real metre-per-second.
function stepParticles(S, F, H, dtSim, k, region, stats) {
    const v1 = [0, 0, 0], v2 = [0, 0, 0], B = FIELD_BOX;
    for (let i = 0; i < S.n; i++) {
        let x = S.p[3 * i], y = S.p[3 * i + 1], z = S.p[3 * i + 2];
        let ok = sampleField(F, x, y, z, v1);
        if (ok) ok = sampleField(F, x + 0.5 * dtSim * k * v1[0], y + 0.5 * dtSim * k * v1[1], z + 0.5 * dtSim * k * v1[2], v2);
        const sp = ok ? Math.hypot(v2[0], v2[1], v2[2]) : 0;
        if (!ok || sp < 5 || x > B.x1 - 0.06 || S.age[i] > 30 ||
            (region.slab && Math.abs(z - region.zc) > 1.5 * region.hw)) {
            if (stats) stats.respawn++;
            spawn(S, i, region, false);
            continue;
        }
        const ny = y + dtSim * k * v2[1];
        x += dtSim * k * v2[0]; z += dtSim * k * v2[2];
        let yy = ny;
        const c = wingCell(H, x, z);
        if (c >= 0 && yy < H.up[c] && yy > H.lo[c]) {          // keep particles outside the wing
            yy = y >= 0.5 * (H.up[c] + H.lo[c]) ? H.up[c] + 0.0015 : H.lo[c] - 0.0015;
            if (stats) stats.pushed++;
        }
        S.p[3 * i] = x; S.p[3 * i + 1] = yy; S.p[3 * i + 2] = z;
        S.d[3 * i] = v2[0] / sp; S.d[3 * i + 1] = v2[1] / sp; S.d[3 * i + 2] = v2[2] / sp;
        S.v[i] = sp; S.age[i] += dtSim;
    }
}

// ===================== scene =====================
var createScene = function (engine, canvas) {
    const scene = new BABYLON.Scene(engine);
    scene.useRightHandedSystem = true;
    scene.clearColor = new BABYLON.Color4(0.031, 0.059, 0.094, 1);

    const HOME = { target: new BABYLON.Vector3(0.85, 0, 0), alpha: -1.1, beta: 1.05, radius: 4.7 };
    const TOP  = { target: new BABYLON.Vector3(0.9, 0, 0), alpha: -Math.PI / 2, beta: 0.02, radius: 4.4 };
    const camera = new BABYLON.ArcRotateCamera('camera', HOME.alpha, HOME.beta, HOME.radius, HOME.target.clone(), scene);
    camera.attachControl(canvas, true);
    camera.fov = 1.1;
    camera.fovMode = BABYLON.Camera.FOVMODE_HORIZONTAL_FIXED;
    camera.minZ = 0.01; camera.maxZ = 80;
    camera.lowerRadiusLimit = 0.15; camera.upperRadiusLimit = 15;
    camera.wheelDeltaPercentage = 0.015; camera.pinchDeltaPercentage = 0.015;
    camera.panningSensibility = 900;
    camera.lowerBetaLimit = 0.015; camera.upperBetaLimit = Math.PI - 0.015;
    const setView = v => {
        camera.inertialAlphaOffset = camera.inertialBetaOffset = camera.inertialRadiusOffset = 0;
        camera.setTarget(v.target.clone());
        camera.alpha = v.alpha; camera.beta = v.beta; camera.radius = v.radius;
    };

    const light = new BABYLON.HemisphericLight('light', new BABYLON.Vector3(-0.5, 1, 0.3), scene);
    light.intensity = 0.95;
    light.groundColor = new BABYLON.Color3(0.2, 0.27, 0.35);

    const metal = new BABYLON.StandardMaterial('wing-material', scene);
    metal.diffuseColor = new BABYLON.Color3(0.56, 0.65, 0.73);
    metal.specularColor = new BABYLON.Color3(0.35, 0.42, 0.48);
    metal.specularPower = 64;
    metal.backFaceCulling = false;
    const pressureMat = new BABYLON.StandardMaterial('pressure-material', scene);
    pressureMat.disableLighting = true;
    pressureMat.emissiveColor = BABYLON.Color3.White();
    pressureMat.backFaceCulling = false;

    // 1-D lookup texture: Mach colour + iso-Mach lines every 0.05 + bold sonic line.
    // UVs carry the Mach number, so the lines stay sharp across interpolated triangles.
    const LUT_W = 1024;
    const machLut = new BABYLON.DynamicTexture('mach-lut', { width: LUT_W, height: 4 }, scene, false,
        BABYLON.Texture.BILINEAR_SAMPLINGMODE);
    {
        const ctx = machLut.getContext();
        for (let x = 0; x < LUT_W; x++) {
            ctx.fillStyle = machColor(MACH_LO + (x + 0.5) / LUT_W * (MACH_HI - MACH_LO)).toHexString();
            ctx.fillRect(x, 0, 1, 4);
        }
        const xOf = m => (m - MACH_LO) / (MACH_HI - MACH_LO) * LUT_W;
        ctx.fillStyle = 'rgba(8,16,28,0.45)';
        for (let k = 9; k < 32; k++) if (k !== 20) ctx.fillRect(Math.round(xOf(k * 0.05)) - 1, 0, 2, 4);
        const xs = Math.round(xOf(1));
        ctx.fillStyle = '#08101c'; ctx.fillRect(xs - 5, 0, 10, 4);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(xs - 3, 0, 6, 4);
        machLut.update(false);
        machLut.wrapU = machLut.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
    }
    const machMat = new BABYLON.StandardMaterial('mach-material', scene);
    machMat.disableLighting = true;
    machMat.emissiveTexture = machLut;
    machMat.backFaceCulling = false;

    // ---------- state ----------
    const state = { ready: false, wing: [], cases: [], activeCaseIndex: null, data: null,
                    flowMesh: null, forceMesh: null, geom: null, H: null, field: null, particles: null };
    const opts = { flow: false, forces: false, surface: 'mach', mirror: true,
                   slab: false, eta: 0.44, thick: 0.03, vmin: FLOW_LO, vmax: FLOW_HI,
                   anim: true, animSpeed: 1, paused: false };
    const PARTICLES = 8000;                    // simulated on the computed half, mirrored when drawn
    const K_DISPLAY = 0.35 / 286;              // on-screen m/s per real m/s (free stream ≈ 0.35 m/s)
    const cache = new Map();
    let selectionSerial = 0, speedTimer = null, rebuildTimer = null;
    scene.onDisposeObservable.add(() => { clearTimeout(speedTimer); clearTimeout(rebuildTimer); ++selectionSerial; });

    // ===================== GUI =====================
    const G = BABYLON.GUI;
    const ui = G.AdvancedDynamicTexture.CreateFullscreenUI('ui', true, scene);
    const ACCENT = '#59d5de', TEXT = '#eef4fc', SUB = '#91a5bb', FONT = 'Segoe UI, system-ui, sans-serif';
    const LEFT = G.Control.HORIZONTAL_ALIGNMENT_LEFT, RIGHT = G.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    const CENTER = G.Control.HORIZONTAL_ALIGNMENT_CENTER;

    const text = (parent, str, o = {}) => {
        const t = new G.TextBlock();
        t.text = str; t.fontFamily = FONT; t.fontSize = o.size || 12; t.color = o.color || TEXT;
        t.height = (o.h || 20) + 'px';
        if (o.w) t.width = o.w + 'px';
        if (o.bold) t.fontWeight = '600';
        t.textHorizontalAlignment = o.align ?? LEFT;
        t.textWrapping = !!o.wrap;
        parent.addControl(t);
        return t;
    };
    const vstack = (parent, width) => { const s = new G.StackPanel(); if (width) s.width = width + 'px'; parent.addControl(s); return s; };
    const hstack = (parent, h) => {
        const s = new G.StackPanel(); s.isVertical = false; s.height = h + 'px'; s.horizontalAlignment = LEFT;
        parent.addControl(s); return s;
    };
    const spacer = (parent, h) => { const r = new G.Rectangle(); r.height = h + 'px'; r.thickness = 0; parent.addControl(r); };
    const card = (parent, w) => {
        const r = new G.Rectangle();
        r.width = w + 'px'; r.adaptHeightToChildren = true; r.thickness = 1; r.color = '#263849';
        r.background = 'rgba(14,25,38,0.9)'; r.cornerRadius = 14;
        parent.addControl(r);
        return r;
    };
    const button = (parent, label, w, onClick) => {
        const b = G.Button.CreateSimpleButton('btn-' + label, label);
        b.width = w + 'px'; b.height = '30px'; b.fontFamily = FONT; b.fontSize = 12;
        b.color = '#344657'; b.background = '#172637'; b.cornerRadius = 8; b.textBlock.color = TEXT;
        b.paddingRight = '4px';
        b.pointerEnterAnimation = () => { if (b.background !== ACCENT) b.background = '#233e51'; };
        b.pointerOutAnimation = () => { if (b.background !== ACCENT) b.background = '#172637'; };
        b.onPointerClickObservable.add(() => { if (state.ready) onClick(); });
        parent.addControl(b);
        return b;
    };
    const toggle = (parent, label, key, onChange) => {
        const row = hstack(parent, 28);
        text(row, label, { w: 196 });
        const cb = new G.Checkbox();
        cb.width = '17px'; cb.height = '17px'; cb.color = ACCENT; cb.background = '#172637';
        cb.isChecked = opts[key];
        cb.onIsCheckedChangedObservable.add(v => { opts[key] = v; onChange ? onChange(v) : sync(); });
        row.addControl(cb);
        return cb;
    };
    const slider = (parent, min, max, step, value) => {
        const s = new G.Slider();
        s.minimum = min; s.maximum = max; s.step = step; s.value = value;
        s.height = '22px'; s.color = ACCENT; s.background = '#263849';
        s.thumbColor = ACCENT; s.borderColor = 'transparent';
        s.isThumbCircle = true; s.thumbWidth = '16px'; s.barOffset = '8px';
        parent.addControl(s);
        return s;
    };
    const labelRow = (parent, label, value) => {
        const row = hstack(parent, 20);
        text(row, label, { w: 110 });
        return text(row, value, { w: 109, color: '#75d8e7', align: RIGHT });
    };

    // ----- header (top-left) -----
    const header = new G.StackPanel();
    header.width = '420px'; header.horizontalAlignment = LEFT;
    header.verticalAlignment = G.Control.VERTICAL_ALIGNMENT_TOP;
    header.left = '24px'; header.top = '20px'; header.isHitTestVisible = false;
    ui.addControl(header);
    text(header, 'Computed flow · Static splats', { size: 11, color: '#75d8e7', h: 16 });
    text(header, 'ONERA M6', { size: 36, bold: true, h: 46 });
    text(header, '有限翼を回り込む空気を、頭と尾のある粒子で。', { color: '#a3b1c4', h: 18 });
    text(header, '明るい頭が下流側、薄い尾が上流側です。', { color: '#a3b1c4', h: 18 });

    // ----- analysis tools (left) -----
    const toolCard = card(ui, 255);
    toolCard.horizontalAlignment = LEFT;
    toolCard.verticalAlignment = G.Control.VERTICAL_ALIGNMENT_TOP;
    toolCard.left = '22px'; toolCard.top = '140px';
    const tools = vstack(toolCard, 219);
    tools.paddingTop = '12px'; tools.paddingBottom = '12px';
    text(tools, '断面スラブ', { color: '#b6c5d7', h: 22 });
    toggle(tools, 'スラブだけを表示', 'slab', on => { if (!state.geom) return; rebuildSplats(); reseed(); sync(); if (on) sectionView(); });
    const etaText = labelRow(tools, '断面位置', '44% スパン');
    const etaSlider = slider(tools, 0.05, 0.98, 0.01, opts.eta);
    const thickText = labelRow(tools, 'スラブ厚', '±3.0 cm');
    const thickSlider = slider(tools, 0.01, 0.08, 0.005, opts.thick);
    spacer(tools, 4);
    const secRow = hstack(tools, 30);
    button(secRow, '断面を横から見る', 219, () => { if (!opts.slab) { opts.slab = true; slabCheck.isChecked = true; } else sectionView(); });
    spacer(tools, 12);
    text(tools, '速度帯で絞り込み（粒子・スプラット）', { color: '#b6c5d7', h: 22 });
    const bandText = labelRow(tools, '表示する流速', '180–420 m/s');
    const vminSlider = slider(tools, FLOW_LO, FLOW_HI, 5, opts.vmin);
    const vmaxSlider = slider(tools, FLOW_LO, FLOW_HI, 5, opts.vmax);
    spacer(tools, 4);
    const bandRow = hstack(tools, 30);
    button(bandRow, '加速域', 73, () => setBand(320, FLOW_HI));
    button(bandRow, '減速域', 73, () => setBand(FLOW_LO, 250));
    button(bandRow, '解除', 73, () => setBand(FLOW_LO, FLOW_HI));
    spacer(tools, 12);
    text(tools, '粒子アニメーション', { color: '#b6c5d7', h: 22 });
    toggle(tools, '粒子を流す', 'anim', () => sync());
    const animSpeedText = labelRow(tools, '再生速度', '');
    const animSlider = slider(tools, 0.1, 3, 0.05, opts.animSpeed);
    spacer(tools, 4);
    const animRow = hstack(tools, 30);
    const pauseBtn = button(animRow, '一時停止', 109, () => {
        opts.paused = !opts.paused;
        pauseBtn.textBlock.text = opts.paused ? '再生' : '一時停止';
    });
    button(animRow, '粒子をリセット', 109, () => reseed());
    text(tools, '公開スプラットから復元した近似速度場で移流', { size: 9, color: SUB, h: 16 });
    const slabCheck = toolCard.getDescendants(false, c => c instanceof G.Checkbox)[0];

    // ----- control panel (top-right) -----
    const panelCard = card(ui, 255);
    panelCard.horizontalAlignment = RIGHT;
    panelCard.verticalAlignment = G.Control.VERTICAL_ALIGNMENT_TOP;
    panelCard.left = '-22px'; panelCard.top = '22px';
    const panel = vstack(panelCard, 219);
    panel.paddingTop = '14px'; panel.paddingBottom = '14px';
    const speedLabel = labelRow(panel, '自由流速', '— m/s');
    const speedSlider = slider(panel, 0, 4, 1, 3);
    speedSlider.isEnabled = false;
    const tickRow = hstack(panel, 14);
    const ticks = [];
    for (let i = 0; i < 5; i++) ticks.push(text(tickRow, '—', { w: 43.8, size: 9, color: SUB, h: 14, align: CENTER }));
    text(panel, '5段階の計算済み結果を切替 · m/s', { size: 10, color: SUB, h: 15 });
    text(panel, '連続的な再計算ではありません', { size: 10, color: SUB, h: 15 });
    spacer(panel, 10);
    text(panel, '表示レイヤー', { color: '#b6c5d7', h: 22 });
    toggle(panel, '気流のスプラット', 'flow');
    toggle(panel, '圧力差による力の向き', 'forces');
    text(panel, '翼の表面', { h: 24 });
    const surfRow = hstack(panel, 30);
    const surfButtons = {};
    [['solid', '単色'], ['pressure', 'Cp'], ['mach', 'マッハ'], ['hidden', '非表示']].forEach(([key, label]) => {
        surfButtons[key] = button(surfRow, label, 54, () => { opts.surface = key; sync(); });
    });
    spacer(panel, 4);
    toggle(panel, '全翼を表示（対称に反映）', 'mirror', () => { rebuildSplats(); sync(); });
    spacer(panel, 6);
    const viewRow = hstack(panel, 30);
    button(viewRow, '視点を戻す', 109, () => setView(HOME));
    button(viewRow, '上から見る', 109, () => setView(TOP));
    spacer(panel, 6);
    const gifRow = hstack(panel, 30);
    const gifBtn = button(gifRow, 'GIF撮影（640×480・3秒）', 219, () => recordGif());
    spacer(panel, 10);
    const statGrid = new G.Grid();
    statGrid.height = '138px';
    statGrid.addColumnDefinition(0.5); statGrid.addColumnDefinition(0.5);
    for (let r = 0; r < 3; r++) statGrid.addRowDefinition(1 / 3);
    panel.addControl(statGrid);
    const stat = (label, r, c) => {
        const s = new G.StackPanel();
        statGrid.addControl(s, r, c);
        text(s, label, { size: 10, color: '#8da2b9', h: 16 });
        return text(s, '—', { size: 15, h: 24 });
    };
    const machText = stat('Mach / 迎角', 0, 0);
    const clcdText = stat('CL / CD', 0, 1);
    const cpsText = stat('臨界 Cp*', 1, 0);
    const supText = stat('超音速域（翼面積）', 1, 1);
    const countText = stat('表示中 splats', 2, 0);
    const particleText = stat('粒子（片翼）', 2, 1);
    text(panel, 'SU2 3次元定常Euler · 粘性・剥離・失速は扱いません。マッハ数はCpから等エントロピー換算。粒子の速度場は復元した近似です', { size: 9, color: SUB, h: 70, wrap: true });

    // ----- legends (bottom-left) -----
    const legendStack = new G.StackPanel();
    legendStack.isVertical = false; legendStack.height = '78px';
    legendStack.horizontalAlignment = CENTER;
    legendStack.verticalAlignment = G.Control.VERTICAL_ALIGNMENT_BOTTOM;
    legendStack.top = '-14px';
    ui.addControl(legendStack);
    const makeLegend = () => {
        const c = card(legendStack, 252);
        c.cornerRadius = 12; c.paddingLeft = '6px'; c.paddingRight = '6px';
        c.verticalAlignment = G.Control.VERTICAL_ALIGNMENT_BOTTOM;
        const s = vstack(c, 212);
        s.paddingTop = '8px'; s.paddingBottom = '8px';
        const title = text(s, '', { size: 11, color: '#c4d2e1', h: 18 });
        const row = hstack(s, 8);
        const segs = [];
        for (let i = 0; i < 53; i++) {
            const r = new G.Rectangle(); r.width = '4px'; r.height = '8px'; r.thickness = 0;
            row.addControl(r); segs.push(r);
        }
        const range = hstack(s, 18);
        const lo = text(range, '', { w: 70, size: 10, color: '#a7bad0' });
        const mid = text(range, '', { w: 72, size: 10, color: '#a7bad0', align: CENTER });
        const hi = text(range, '', { w: 70, size: 10, color: '#a7bad0', align: RIGHT });
        return { card: c, title, segs, lo, mid, hi };
    };
    const surfLegend = makeLegend();
    const flowLegend = makeLegend();
    const paint = (lg, fn) => lg.segs.forEach((r, i) => { r.background = fn(i / (lg.segs.length - 1)); r.alpha = 1; });
    const hex = c => BABYLON.Color3.FromArray(c).toHexString();
    const stopsFn = stops => {
        const cols = stops.map(h => BABYLON.Color3.FromHexString(h));
        return t => {
            const x = t * (cols.length - 1), k = Math.min(Math.floor(x), cols.length - 2);
            return BABYLON.Color3.Lerp(cols[k], cols[k + 1], x - k).toHexString();
        };
    };

    const hint = new G.StackPanel();
    hint.width = '300px'; hint.horizontalAlignment = LEFT;
    hint.verticalAlignment = G.Control.VERTICAL_ALIGNMENT_BOTTOM;
    hint.left = '24px'; hint.top = '-16px'; hint.isHitTestVisible = false;
    ui.addControl(hint);
    text(hint, 'ドラッグ：回転　ホイール / ピンチ：拡大・縮小', { size: 11, color: '#8da2b9', h: 16 });
    text(hint, '右ドラッグ / Ctrl+ドラッグ：平行移動', { size: 11, color: '#8da2b9', h: 16 });

    const status = new G.TextBlock();
    status.text = '翼と解析結果を読み込んでいます…';
    status.fontFamily = FONT; status.fontSize = 11; status.color = '#8fb4c8';
    status.width = '48%'; status.height = '20px';
    status.horizontalAlignment = RIGHT; status.verticalAlignment = G.Control.VERTICAL_ALIGNMENT_BOTTOM;
    status.textHorizontalAlignment = RIGHT;
    status.left = '-22px'; status.top = '-22px';
    ui.addControl(status);
    const setStatus = (msg, error = false) => { status.text = msg; status.color = error ? '#ffb5b5' : '#8fb4c8'; };

    // ===================== data =====================
    async function getJson(url) {
        const r = await fetch(BASE + url, { cache: 'no-store' });
        if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
        return r.json();
    }
    async function getBin(url) {
        const r = await fetch(BASE + url);
        if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
        return r.arrayBuffer();
    }

    function makeWing(data, mirrored) {
        const mesh = new BABYLON.Mesh(mirrored ? 'wing-mirrored' : 'wing-computed', scene);
        const count = data.positions.length / 6;
        const off = mirrored ? count : 0;
        const halfIdx = data.indices.length / 2;
        const g = new BABYLON.VertexData();
        g.positions = data.positions.slice(off * 3, (off + count) * 3);
        g.indices = data.indices.slice(mirrored ? halfIdx : 0, mirrored ? data.indices.length : halfIdx).map(i => i - off);
        g.normals = [];
        BABYLON.VertexData.ComputeNormals(g.positions, g.indices, g.normals, { useRightHandedSystem: true });
        g.colors = data.colors.slice(off * 4, (off + count) * 4);
        g.uvs = new Array(count * 2).fill(0.5);
        g.applyToMesh(mesh, true);
        mesh.material = metal;
        mesh.useVertexColors = false;
        return mesh;
    }

    // Geometry shared by all cases: computed-half triangles (areas) and semispan.
    function buildGeometry(data) {
        const count = data.positions.length / 6, P = data.positions, I = data.indices.slice(0, data.indices.length / 2);
        const area = new Float32Array(I.length / 3);
        let total = 0, span = 0;
        for (let t = 0; t < area.length; t++) {
            const a = 3 * I[3 * t], b = 3 * I[3 * t + 1], c = 3 * I[3 * t + 2];
            const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
            const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
            const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
            area[t] = 0.5 * Math.hypot(cx, cy, cz); total += area[t];
        }
        for (let i = 0; i < count; i++) span = Math.max(span, -P[3 * i + 2]);
        return { count, positions: P.slice(0, count * 3), tris: I, area, total, span };
    }

    function sectionInfo() {
        const g = state.geom, zc = -opts.eta * g.span, w = Math.max(opts.thick, 0.015);
        let xmin = Infinity, xmax = -Infinity;
        for (let i = 0; i < g.count; i++) {
            if (Math.abs(g.positions[3 * i + 2] - zc) <= w) {
                xmin = Math.min(xmin, g.positions[3 * i]); xmax = Math.max(xmax, g.positions[3 * i]);
            }
        }
        if (!isFinite(xmin)) { xmin = 0.6; xmax = 1.1; }
        return { zc, cx: 0.5 * (xmin + xmax), chord: xmax - xmin };
    }
    function sectionView() {
        const s = sectionInfo();
        setView({ target: new BABYLON.Vector3(s.cx + 0.1 * s.chord, 0.02, s.zc),
                  alpha: Math.PI / 2, beta: Math.PI / 2, radius: Math.max(0.5, 2.4 * s.chord) });
    }
    function followSection() {
        if (!opts.slab) return;
        const s = sectionInfo();
        camera.setTarget(new BABYLON.Vector3(s.cx + 0.1 * s.chord, camera.target.y, s.zc), false, false, true);
    }

    async function loadCase(index) {
        if (cache.has(index)) return cache.get(index);
        const entry = state.cases[index];
        const [manifest, pressure] = await Promise.all([
            getJson(`${entry.base_url}/manifest.json`),
            getJson(`${entry.base_url}/pressure.json?v=${entry.pressure_sha256}`)
        ]);
        if (manifest.mach !== entry.mach || pressure.colors.length !== state.geom.count * 8 ||
            pressure.cp.length !== state.geom.count * 2)
            throw new Error('Speed-case pressure data does not match the wing');
        const [flowRaw, forceRaw] = await Promise.all([
            getBin(`${entry.base_url}/flow.spz?v=${manifest.flow_spz.sha256}`),
            getBin(`${entry.base_url}/pressure-force.spz?v=${manifest.wing.pressure_force_spz.sha256}`)
        ]);
        const flow = decodeSpz(await gunzip(flowRaw));
        const forces = decodeSpz(await gunzip(forceRaw));
        if (flow.n !== manifest.flow_spz.count || forces.n !== manifest.wing.pressure_force_spz.count)
            throw new Error('Speed-case SPZ does not match its manifest');
        flow.speed = packetSpeeds(flow);

        const g = state.geom;
        const mach = machFromCp(pressure.cp.slice(0, g.count), manifest.mach);
        const uvs = new Float32Array(g.count * 2);
        for (let i = 0; i < g.count; i++) {
            uvs[2 * i] = Math.min(0.999, Math.max(0.001, (mach[i] - MACH_LO) / (MACH_HI - MACH_LO)));
            uvs[2 * i + 1] = 0.5;
        }
        let sup = 0;
        for (let t = 0; t < g.area.length; t++) {
            const m = (mach[g.tris[3 * t]] + mach[g.tris[3 * t + 1]] + mach[g.tris[3 * t + 2]]) / 3;
            if (m > 1) sup += g.area[t];
        }
        const data = { manifest, colors: pressure.colors, uvs, flow, forces,
                       supFrac: sup / g.total, cpStar: criticalCp(manifest.mach), machMax: Math.max(...mach) };
        cache.set(index, data);
        return data;
    }

    // ===================== splat filtering =====================
    function pack(spz, keep) {
        const idx = new Uint32Array(spz.n);
        let count = 0;
        for (let i = 0; i < spz.n; i++) if (keep(i)) idx[count++] = i;
        const out = new Uint32Array(count * 8), src = spz.u32;
        for (let k = 0; k < count; k++) {
            const o = idx[k] * 8, d = k * 8;
            for (let j = 0; j < 8; j++) out[d + j] = src[o + j];
        }
        return { buffer: out.buffer, count };
    }
    function makeSplatMesh(name, packed) {
        if (!packed.count) return null;
        const m = new BABYLON.GaussianSplattingMesh(name, null, scene);
        m.updateData(packed.buffer, undefined, { flipY: false });
        return m;
    }
    function rebuildSplats() {
        const d = state.data;
        if (!d) return;
        const zc = -opts.eta * state.geom.span, hw = opts.thick;
        const inSlab = z => !opts.slab || Math.abs(z - zc) <= hw;
        const f = d.flow, lo = opts.vmin - 0.5, hi = opts.vmax + 0.5;
        const flowPacked = pack(f, i => (opts.mirror || i < f.half) && inSlab(f.pos[3 * i + 2]) &&
            f.speed[i] >= lo && f.speed[i] <= hi);
        const p = d.forces;
        const forcePacked = pack(p, i => (opts.mirror || i < p.half) && inSlab(p.pos[3 * i + 2]));
        state.flowMesh?.dispose();
        state.forceMesh?.dispose();
        state.flowMesh = makeSplatMesh('flow', flowPacked);
        state.forceMesh = makeSplatMesh('forces', forcePacked);
        countText.text = flowPacked.count.toLocaleString('ja-JP');
        sync();
    }
    const scheduleRebuild = () => {
        clearTimeout(rebuildTimer);
        rebuildTimer = setTimeout(() => { if (!scene.isDisposed) rebuildSplats(); }, 140);
    };
    function setBand(lo, hi) {
        opts.vmin = lo; opts.vmax = hi;
        vminSlider.value = lo; vmaxSlider.value = hi;
        updateBandText();
        rebuildSplats();
    }
    const updateBandText = () => { bandText.text = `${opts.vmin}–${opts.vmax} m/s`; };

    // ===================== view sync =====================
    function sync() {
        state.wing.forEach((mesh, i) => {
            mesh.setEnabled(opts.surface !== 'hidden' && (i === 0 || opts.mirror));
            mesh.material = opts.surface === 'pressure' ? pressureMat : opts.surface === 'mach' ? machMat : metal;
            mesh.useVertexColors = opts.surface === 'pressure';
        });
        if (opts.slab) {
            const zc = -opts.eta * (state.geom ? state.geom.span : 1.2), hw = opts.thick;
            scene.clipPlane = new BABYLON.Plane(0, 0, 1, -(zc + hw));
            scene.clipPlane2 = new BABYLON.Plane(0, 0, -1, zc - hw);
        } else {
            scene.clipPlane = null; scene.clipPlane2 = null;
        }
        state.flowMesh?.setEnabled(opts.flow);
        state.forceMesh?.setEnabled(opts.forces);
        comet.setEnabled(opts.anim);
        if (state.particles) writeInstances();

        Object.entries(surfButtons).forEach(([key, b]) => {
            const on = key === opts.surface;
            b.background = on ? ACCENT : '#172637';
            b.textBlock.color = on ? '#08202a' : TEXT;
        });

        // flow legend (dims the hidden speed band)
        flowLegend.card.isVisible = opts.flow || opts.anim;
        flowLegend.title.text = '流速 · m/s';
        flowLegend.lo.text = '180'; flowLegend.mid.text = '300'; flowLegend.hi.text = '420';
        paint(flowLegend, t => hex(turboAt(t)));
        flowLegend.segs.forEach((r, i) => {
            const v = FLOW_LO + (FLOW_HI - FLOW_LO) * i / (flowLegend.segs.length - 1);
            r.alpha = v >= opts.vmin - 2.5 && v <= opts.vmax + 2.5 ? 1 : 0.18;
        });
        // surface legend
        const showCp = opts.surface === 'pressure' || (opts.surface !== 'mach' && !opts.flow && opts.forces);
        surfLegend.card.isVisible = opts.surface === 'mach' || showCp;
        if (opts.surface === 'mach') {
            surfLegend.title.text = '翼面の局所マッハ数 · 白線 = 音速線 M=1';
            surfLegend.lo.text = '0.4'; surfLegend.mid.text = '1.0'; surfLegend.hi.text = '1.6';
            const n = surfLegend.segs.length;
            paint(surfLegend, t => machColor(MACH_LO + t * (MACH_HI - MACH_LO)).toHexString());
            surfLegend.segs[Math.round((1 - MACH_LO) / (MACH_HI - MACH_LO) * (n - 1))].background = '#ffffff';
        } else if (showCp) {
            surfLegend.title.text = '圧力係数 Cp · 周囲との差';
            surfLegend.lo.text = '−1.2'; surfLegend.mid.text = ''; surfLegend.hi.text = '+0.6';
            paint(surfLegend, stopsFn(CP_STOPS));
        }
    }

    // ===================== slider wiring =====================
    etaSlider.onValueChangedObservable.add(v => {
        opts.eta = Math.round(v * 100) / 100;
        etaText.text = `${Math.round(opts.eta * 100)}% スパン`;
        if (!state.ready) return;
        sync(); followSection(); if (opts.slab) { scheduleRebuild(); reseed(); }
    });
    thickSlider.onValueChangedObservable.add(v => {
        opts.thick = v;
        thickText.text = `±${(v * 100).toFixed(1)} cm`;
        if (!state.ready) return;
        sync(); if (opts.slab) { scheduleRebuild(); reseed(); }
    });
    vminSlider.onValueChangedObservable.add(v => {
        opts.vmin = Math.round(v);
        if (opts.vmin > opts.vmax - 10) { opts.vmax = Math.min(FLOW_HI, opts.vmin + 10); vmaxSlider.value = opts.vmax; }
        updateBandText();
        if (state.ready) { sync(); scheduleRebuild(); }
    });
    vmaxSlider.onValueChangedObservable.add(v => {
        opts.vmax = Math.round(v);
        if (opts.vmax < opts.vmin + 10) { opts.vmin = Math.max(FLOW_LO, opts.vmax - 10); vminSlider.value = opts.vmin; }
        updateBandText();
        if (state.ready) { sync(); scheduleRebuild(); }
    });

    const updateAnimSpeedText = () => {
        const slow = 1 / (K_DISPLAY * opts.animSpeed);
        animSpeedText.text = `${opts.animSpeed.toFixed(2)}× · 1/${Math.round(slow)}`;
    };
    animSlider.onValueChangedObservable.add(v => { opts.animSpeed = v; updateAnimSpeedText(); });
    updateAnimSpeedText();

    // ===================== particles =====================
    const comet = BABYLON.MeshBuilder.CreateCylinder('comet',
        { height: 1, diameterTop: 1, diameterBottom: 0.15, tessellation: 6 }, scene);
    comet.rotation.z = -Math.PI / 2;                  // axis along +x, wide end (head) at +x
    comet.bakeCurrentTransformIntoVertices();
    comet.position.x = -0.5;                          // head at 0, tail at -1 (upstream)
    comet.bakeCurrentTransformIntoVertices();
    const cometMat = new BABYLON.StandardMaterial('comet-material', scene);
    // With lighting disabled the diffuse term is zero, so the colour must come through the
    // emissive term: final = emissive * baseColor, and baseColor is multiplied by the instance colour.
    cometMat.disableLighting = true;
    cometMat.diffuseColor = BABYLON.Color3.Black();
    cometMat.specularColor = BABYLON.Color3.Black();
    cometMat.emissiveColor = BABYLON.Color3.White();
    cometMat.backFaceCulling = false;
    comet.material = cometMat;
    comet.isPickable = false;
    comet.alwaysSelectAsActiveMesh = true;
    const instMatrix = new Float32Array(16 * 2 * PARTICLES), instColor = new Float32Array(4 * 2 * PARTICLES);
    comet.thinInstanceSetBuffer('matrix', instMatrix, 16, false);
    comet.thinInstanceSetBuffer('color', instColor, 4, false);
    comet.setEnabled(false);

    const region = () => ({ slab: opts.slab, zc: -opts.eta * (state.geom ? state.geom.span : 1.2), hw: opts.thick });
    function reseed() {
        const S = state.particles;
        if (!S) return;
        const r = region();
        for (let i = 0; i < S.n; i++) spawn(S, i, r, true);
        // let the scattered particles settle onto the flow before the next frame
        if (state.field) for (let k = 0; k < 3; k++) stepParticles(S, state.field, state.H, 1 / 60, K_DISPLAY, r, null);
        writeInstances();
    }
    function writeComet(idx, px, py, pz, dx, dy, dz, L, w, mirror) {
        let ex = -dz, ez = dx;                         // e1 = normalize(d × up)
        const el = Math.hypot(ex, ez) || 1; ex /= el; ez /= el;
        const fx = -ez * dy, fy = ez * dx - ex * dz, fz = ex * dy;   // e2 = e1 × d
        const s = mirror ? -1 : 1, m = instMatrix, o = 16 * idx;
        m[o] = dx * L;  m[o + 1] = dy * L; m[o + 2] = s * dz * L;  m[o + 3] = 0;
        m[o + 4] = fx * w; m[o + 5] = fy * w; m[o + 6] = s * fz * w; m[o + 7] = 0;
        m[o + 8] = ex * w; m[o + 9] = 0;      m[o + 10] = s * ez * w; m[o + 11] = 0;
        m[o + 12] = px; m[o + 13] = py; m[o + 14] = s * pz; m[o + 15] = 1;
    }
    function hideComet(idx) { instMatrix.fill(0, 16 * idx, 16 * idx + 15); instMatrix[16 * idx + 15] = 1; }
    function writeInstances() {
        const S = state.particles;
        if (!S) return;
        const mirror = opts.mirror && !opts.slab;
        let shown = 0;
        for (let i = 0; i < S.n; i++) {
            const v = S.v[i];
            const visible = v > 0 && v >= opts.vmin - 0.5 && v <= opts.vmax + 0.5;
            if (!visible) { hideComet(i); hideComet(i + S.n); continue; }
            shown++;
            const L = 0.012 + 0.04 * v / 286, w = 0.0042;
            const px = S.p[3 * i], py = S.p[3 * i + 1], pz = S.p[3 * i + 2];
            const dx = S.d[3 * i], dy = S.d[3 * i + 1], dz = S.d[3 * i + 2];
            writeComet(i, px, py, pz, dx, dy, dz, L, w, false);
            if (mirror) writeComet(i + S.n, px, py, pz, dx, dy, dz, L, w, true); else hideComet(i + S.n);
            const c = turboAt((v - FLOW_LO) / (FLOW_HI - FLOW_LO));
            for (const j of [i, i + S.n]) {
                instColor[4 * j] = 0.15 + 0.85 * c[0]; instColor[4 * j + 1] = 0.15 + 0.85 * c[1];
                instColor[4 * j + 2] = 0.15 + 0.85 * c[2]; instColor[4 * j + 3] = 1;
            }
        }
        comet.thinInstanceBufferUpdated('matrix');
        comet.thinInstanceBufferUpdated('color');
        particleText.text = shown.toLocaleString('ja-JP');
    }
    scene.onBeforeRenderObservable.add(() => {
        if (!opts.anim || opts.paused || !state.field || !state.particles) return;
        const dt = Math.min(engine.getDeltaTime() / 1000, 1 / 30) * opts.animSpeed;
        stepParticles(state.particles, state.field, state.H, dt, K_DISPLAY, region(), null);
        writeInstances();
    });

    // ===================== GIF capture =====================
    // 640x480 centre crop of the 3-D view (GUI hidden while recording), ~12.5 fps for 3 s.
    // If the file exceeds 5 MB it is re-encoded with fewer colours / frames.
    const GIF_W = 640, GIF_H = 480, GIF_MS = 3000, GIF_FRAME_MS = 80, GIF_LIMIT = 5 * 1024 * 1024;
    const GIFENC_URL = 'https://cdn.jsdelivr.net/npm/gifenc@1.0.3/+esm';
    const gifCanvas = document.createElement('canvas');
    gifCanvas.width = GIF_W; gifCanvas.height = GIF_H;
    const gctx = gifCanvas.getContext('2d', { willReadFrequently: true });
    let rec = null;

    function grabFrame() {
        const src = engine.getRenderingCanvas(), W0 = src.width, H0 = src.height;
        let sw = W0, sh = W0 * GIF_H / GIF_W;
        if (sh > H0) { sh = H0; sw = H0 * GIF_W / GIF_H; }
        gctx.imageSmoothingEnabled = true; gctx.imageSmoothingQuality = 'high';
        gctx.drawImage(src, (W0 - sw) / 2, (H0 - sh) / 2, sw, sh, 0, 0, GIF_W, GIF_H);
        // small caption instead of the GUI
        const m = state.data?.manifest;
        gctx.font = '600 15px "Segoe UI", system-ui, sans-serif';
        gctx.fillStyle = 'rgba(8,15,24,0.65)'; gctx.fillRect(10, GIF_H - 34, 300, 24);
        gctx.fillStyle = '#eef4fc';
        gctx.fillText(`ONERA M6 · M ${m ? m.mach.toFixed(3) : '—'} · α ${m ? m.angle_of_attack_degrees.toFixed(2) : '—'}°`, 18, GIF_H - 17);
        return gctx.getImageData(0, 0, GIF_W, GIF_H).data;
    }
    scene.onAfterRenderObservable.add(() => {
        if (!rec || rec.done) return;
        if (rec.skip > 0) { rec.skip--; return; }           // let the hidden GUI disappear first
        const now = performance.now();
        if (rec.start === null) rec.start = now;
        if (now - rec.start >= rec.frames.length * GIF_FRAME_MS) rec.frames.push(grabFrame());
        if (now - rec.start >= GIF_MS) { rec.done = true; rec.resolve(); }
    });

    async function encodeGif(lib, frames, step, colors, label) {
        const enc = lib.GIFEncoder();
        for (let i = 0; i < frames.length; i += step) {
            const palette = lib.quantize(frames[i], colors);
            const index = lib.applyPalette(frames[i], palette);
            enc.writeFrame(index, GIF_W, GIF_H, { palette, delay: GIF_FRAME_MS * step });
            setStatus(`GIFを書き出し中${label}… ${Math.min(i + 1, frames.length)}/${frames.length}`);
            await new Promise(r => setTimeout(r, 0));
            if (scene.isDisposed) return null;
        }
        enc.finish();
        return enc.bytes();
    }

    async function recordGif() {
        if (rec) return;
        rec = { frames: [], start: null, skip: 2, done: false, resolve: null };
        gifBtn.textBlock.text = '撮影中…';
        try {
            const libPromise = import(GIFENC_URL);
            const captured = new Promise(r => { rec.resolve = r; });
            ui.layer.isEnabled = false;
            await captured;
            ui.layer.isEnabled = true;
            if (scene.isDisposed) return;
            const lib = await libPromise;
            const tries = [[1, 256, ''], [1, 128, '（128色）'], [2, 128, '（128色・間引き）'], [2, 64, '（64色・間引き）']];
            let bytes = null;
            for (const [step, colors, label] of tries) {
                bytes = await encodeGif(lib, rec.frames, step, colors, label);
                if (!bytes || bytes.length < GIF_LIMIT) break;
            }
            if (!bytes) return;
            const blob = new Blob([bytes], { type: 'image/gif' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `onera-m6-${state.activeCaseIndex !== null ? Math.round(state.cases[state.activeCaseIndex].velocity_m_s) : 'x'}ms.gif`;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 10000);
            setStatus(`GIFを保存しました（${(bytes.length / 1048576).toFixed(2)} MB・${rec.frames.length}コマ）`);
        } catch (error) {
            console.error(error);
            setStatus('GIFを作成できませんでした（エンコーダの読み込みに失敗した可能性があります）', true);
        } finally {
            ui.layer.isEnabled = true;
            gifBtn.textBlock.text = 'GIF撮影（640×480・3秒）';
            rec = null;
        }
    }

    // ===================== speed switching =====================
    const speedText = i => `${Math.round(state.cases[i].velocity_m_s)} m/s`;
    async function selectSpeed(index) {
        const serial = ++selectionSerial;
        const stale = () => serial !== selectionSerial || scene.isDisposed;
        if (index === state.activeCaseIndex) { setStatus('静止した解析結果 · 速度ごとの計算済み結果'); return; }
        setStatus(`${speedText(index)} の解析結果を読み込んでいます…（表示は直前の結果）`);
        try {
            const data = await loadCase(index);
            if (stale()) return;
            if (!data.field) {
                setStatus(`${speedText(index)} の速度場を再構成しています…`);
                await new Promise(r => setTimeout(r, 30));      // let the status render first
                if (stale()) return;
                const m = data.manifest;
                data.field = buildField(data.flow, data.flow.speed, state.H, m.freestream_velocity_m_s, m.angle_of_attack_degrees);
            }
            state.field = data.field;
            const half = data.colors.length / 2;
            state.wing.forEach((mesh, i) => {
                mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, data.colors.slice(i * half, (i + 1) * half));
                mesh.updateVerticesData(BABYLON.VertexBuffer.UVKind, data.uvs);
            });
            state.data = data;
            state.activeCaseIndex = index;
            rebuildSplats();
            const m = data.manifest, c = m.convergence;
            machText.text = `${m.mach.toFixed(3)} / ${m.angle_of_attack_degrees.toFixed(2)}°`;
            clcdText.text = `${c.CL.toFixed(3)} / ${c.CD.toFixed(4)}`;
            cpsText.text = data.cpStar.toFixed(3);
            supText.text = `${(data.supFrac * 100).toFixed(1)}%`;
            await scene.whenReadyAsync();
            if (stale()) return;
            setStatus(`静止した解析結果 · 翼面の最大マッハ数 約${data.machMax.toFixed(2)}`);
        } catch (error) {
            if (stale()) return;
            console.error(error);
            if (state.activeCaseIndex === null) throw error;
            speedSlider.value = state.activeCaseIndex;
            speedLabel.text = speedText(state.activeCaseIndex);
            setStatus('切り替えられませんでした。直前の結果を表示しています。', true);
        }
    }
    let lastSpeedIndex = 3;
    speedSlider.onValueChangedObservable.add(v => {
        if (!state.ready) return;
        const i = Math.round(v);
        if (i === lastSpeedIndex) return;
        lastSpeedIndex = i;
        clearTimeout(speedTimer);
        ++selectionSerial;
        speedLabel.text = speedText(i);
        speedTimer = setTimeout(() => selectSpeed(i), 180);
    });
    speedSlider.onPointerUpObservable.add(() => {
        if (!state.ready) return;
        clearTimeout(speedTimer);
        selectSpeed(Math.round(speedSlider.value));
    });

    // ===================== boot =====================
    (async () => {
        try {
            if (typeof DecompressionStream === 'undefined') throw new Error('DecompressionStream is unavailable');
            const [registry, wingData] = await Promise.all([getJson('assets/speeds.json'), getJson('assets/wing.json')]);
            if (scene.isDisposed) return;
            state.cases = registry.cases;
            registry.cases.forEach((c, i) => { if (ticks[i]) ticks[i].text = String(Math.round(c.velocity_m_s)); });
            state.geom = buildGeometry(wingData);
            state.H = buildWingHeight(state.geom.positions, state.geom.tris);
            state.particles = createParticles(PARTICLES);
            state.wing.push(makeWing(wingData, false), makeWing(wingData, true));
            speedSlider.maximum = registry.cases.length - 1;
            speedSlider.value = lastSpeedIndex = registry.default_index;
            speedLabel.text = speedText(registry.default_index);
            sync();
            await selectSpeed(registry.default_index);
            reseed();
            sync();
            state.ready = true;
            speedSlider.isEnabled = true;
            // Prefetch the other cases in the background so switching is instant.
            for (let i = 0; i < state.cases.length; i++) {
                if (scene.isDisposed) break;
                if (!cache.has(i)) await loadCase(i).catch(() => {});
            }
        } catch (error) {
            console.error(error);
            setStatus('読み込めませんでした。通信環境を確認して再実行してください。', true);
        }
    })();

    sync();
    // HTML integration: diagnostics and access to the original controls.
    scene.metadata = { cx20: { state, opts, selectSpeed, setBand, sync, reseed,
        rebuildSplats, sectionView, recordGif, ui, status,
        controls: { speedSlider, etaSlider, thickSlider, vminSlider, vmaxSlider, animSlider, slabCheck },
        layout: { header, toolCard, panelCard, legendStack, hint } } };
    return scene;
};

export default createScene;
