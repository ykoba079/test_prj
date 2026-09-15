/* Simplified Position Based Fluids. Unit-mass poly6 density constraints,
 * spatial hash neighbors, fixed timesteps and XSPH velocity smoothing.
 * Rendering is independent of this CPU solver. */
/* global globalThis */
class FluidSimulation {
  constructor(options = {}) { this.reset(options); }
  reset({ quality = 'medium', layers = 7, mode = 'tank', viscosity = 8 } = {}) {
    this.mode = mode; this.viscosity = viscosity; this.released = false;
    this.spacing = { low: 0.30, medium: 0.24, high: 0.20 }[quality] || 0.24;
    this.radius = this.spacing * 0.46; this.h = this.spacing * 2;
    this.h2 = this.h * this.h; this.dt = 1 / 90; this.time = 0;
    this.accumulator = 0; this.bodies = []; this.nextId = 1;
    this.bounds = { x: 3, z: 1.8, height: 3.6 };
    const positions = [], s = this.spacing;
    const nx = Math.floor(5.6 / s), nz = Math.floor(3.2 / s);
    const ny = Math.round(layers * 0.24 / s);
    if (mode === 'tank') {
      for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++)
        positions.push((x - (nx - 1) / 2) * s, this.radius + y * s, (z - (nz - 1) / 2) * s);
    } else {
      const dx = Math.floor(nx / 2), dy = Math.min(Math.floor(3.35 / s), ny * 2);
      for (let y = 0; y < dy; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < dx; x++)
        positions.push(-2.8 + this.radius + x * s, this.radius + y * s, (z - (nz - 1) / 2) * s);
    }
    this.positions = new Float32Array(positions); this.count = positions.length / 3;
    this.velocities = new Float32Array(positions.length); this.previous = new Float32Array(positions.length);
    this.lambda = new Float32Array(this.count); this.delta = new Float32Array(positions.length);
    this.nextVelocity = new Float32Array(positions.length);
    this.maxNeighbors = 100; this.neighbors = new Uint16Array(this.count * this.maxNeighbors);
    this.neighborCount = new Uint8Array(this.count); this.links = new Int32Array(this.count);
    this.gx = Math.ceil(6 / this.h) + 2; this.gy = Math.ceil(7 / this.h) + 2; this.gz = Math.ceil(3.6 / this.h) + 2;
    this.heads = new Int32Array(this.gx * this.gy * this.gz);
    // Rest density for an infinite lattice at the selected particle spacing.
    this.restDensity = 0;
    for (let x = -2; x <= 2; x++) for (let y = -2; y <= 2; y++) for (let z = -2; z <= 2; z++) {
      const q = 1 - (x*x + y*y + z*z) * s*s / this.h2;
      if (q > 0) this.restDensity += q*q*q;
    }
    this.surface = this.radius + (ny - 1) * s;
  }
  drop({ shape = 'sphere', size = 0.65, height = 2, x = 0 } = {}) {
    if (this.bodies.length >= 8) return false;
    this.bodies.push({ id: this.nextId++, shape, size, x, y: this.surface + size + height, z: 0, vy: 0 });
    return true;
  }
  release() { this.released = true; }
  buildNeighbors() {
    const p = this.positions, h = this.h, gx = this.gx, gy = this.gy, gz = this.gz;
    this.heads.fill(-1);
    for (let i = 0; i < this.count; i++) {
      const a = i*3, x = Math.max(0, Math.min(gx-1, Math.floor((p[a]+3)/h)+1));
      const y = Math.max(0, Math.min(gy-1, Math.floor(p[a+1]/h)+1));
      const z = Math.max(0, Math.min(gz-1, Math.floor((p[a+2]+1.8)/h)+1));
      const cell = x + gx*(y + gy*z); this.links[i] = this.heads[cell]; this.heads[cell] = i;
    }
    for (let i = 0; i < this.count; i++) {
      const a = i*3, x = Math.max(0, Math.min(gx-1, Math.floor((p[a]+3)/h)+1));
      const y = Math.max(0, Math.min(gy-1, Math.floor(p[a+1]/h)+1));
      const z = Math.max(0, Math.min(gz-1, Math.floor((p[a+2]+1.8)/h)+1));
      let count = 0;
      for (let zz = Math.max(0,z-1); zz <= Math.min(gz-1,z+1); zz++)
        for (let yy = Math.max(0,y-1); yy <= Math.min(gy-1,y+1); yy++)
          for (let xx = Math.max(0,x-1); xx <= Math.min(gx-1,x+1); xx++) {
            let j = this.heads[xx + gx*(yy + gy*zz)];
            while (j !== -1) {
              if (j !== i && count < this.maxNeighbors) {
                const b = j*3, dx = p[a]-p[b], dy = p[a+1]-p[b+1], dz = p[a+2]-p[b+2];
                if (dx*dx+dy*dy+dz*dz < this.h2) this.neighbors[i*this.maxNeighbors + count++] = j;
              }
              j = this.links[j];
            }
          }
      this.neighborCount[i] = count;
    }
  }
  collide(i) {
    const p = this.positions, a = i*3, r = this.radius;
    p[a] = Math.max(-3+r, Math.min(3-r, p[a]));
    p[a+2] = Math.max(-1.8+r, Math.min(1.8-r, p[a+2]));
    p[a+1] = Math.max(r, Math.min(6.8, p[a+1]));
    if (this.mode === 'dam' && !this.released) p[a] = Math.min(-0.06-r, p[a]);
    for (const b of this.bodies) {
      let dx = p[a]-b.x, dy = p[a+1]-b.y, dz = p[a+2]-b.z;
      if (b.shape === 'sphere') {
        const length = Math.sqrt(dx*dx+dy*dy+dz*dz), limit = b.size+r;
        if (length < limit) {
          if (length < 0.00001) { dy = 0.00001; dx = dz = 0; }
          const scale = limit / Math.max(length, 0.00001);
          p[a] = b.x+dx*scale; p[a+1] = b.y+dy*scale; p[a+2] = b.z+dz*scale;
        }
      } else {
        const limit = b.size+r;
        if (Math.abs(dx)<limit && Math.abs(dy)<limit && Math.abs(dz)<limit) {
          const px = limit-Math.abs(dx), py = limit-Math.abs(dy), pz = limit-Math.abs(dz);
          if (px < py && px < pz) p[a] = b.x+(dx>=0?limit:-limit);
          else if (py < pz) p[a+1] = b.y+(dy>=0?limit:-limit);
          else p[a+2] = b.z+(dz>=0?limit:-limit);
        }
      }
    }
    p[a+1] = Math.max(r, p[a+1]);
  }
  advance(seconds) {
    this.accumulator += Math.min(0.05, Math.max(0, seconds));
    let steps = 0;
    while (this.accumulator >= this.dt && steps < 5) { this.step(); this.accumulator -= this.dt; steps++; }
    return steps;
  }
  step() {
    const dt = this.dt, p = this.positions, v = this.velocities, invRho = 1/this.restDensity;
    this.previous.set(p);
    for (const b of this.bodies) {
      b.vy -= 9.81*dt;
      if (b.y < this.surface+b.size) b.vy *= 0.985;
      b.y += b.vy*dt;
      if (b.y < b.size+0.035) { b.y = b.size+0.035; b.vy = 0; }
    }
    for (let i = 0; i < this.count; i++) {
      const a=i*3; v[a+1] -= 9.81*dt;
      for (let c=0;c<3;c++) p[a+c] += v[a+c]*dt;
      this.collide(i);
    }
    for (let iteration=0; iteration<3; iteration++) {
      this.buildNeighbors();
      for (let i=0;i<this.count;i++) {
        const a=i*3; let density=1, sx=0, sy=0, sz=0, grad2=0;
        for (let k=0;k<this.neighborCount[i];k++) {
          const j=this.neighbors[i*this.maxNeighbors+k], b=j*3;
          const dx=p[a]-p[b], dy=p[a+1]-p[b+1], dz=p[a+2]-p[b+2];
          const q=Math.max(0,1-(dx*dx+dy*dy+dz*dz)/this.h2);
          density += q*q*q;
          const g=-6/this.h2*q*q*invRho, x=g*dx, y=g*dy, z=g*dz;
          sx+=x; sy+=y; sz+=z; grad2+=x*x+y*y+z*z;
        }
        const constraint=Math.max(0,density*invRho-1);
        this.lambda[i]=-constraint/(grad2+sx*sx+sy*sy+sz*sz+0.1);
      }
      this.delta.fill(0);
      for (let i=0;i<this.count;i++) {
        const a=i*3;
        for (let k=0;k<this.neighborCount[i];k++) {
          const j=this.neighbors[i*this.maxNeighbors+k], b=j*3;
          const dx=p[a]-p[b], dy=p[a+1]-p[b+1], dz=p[a+2]-p[b+2];
          const q=Math.max(0,1-(dx*dx+dy*dy+dz*dz)/this.h2), w=q*q*q;
          const ratio=w/0.753571;
          const tensile=-0.00015*ratio*ratio*ratio*ratio;
          const g=(this.lambda[i]+this.lambda[j]+tensile)*(-6/this.h2)*q*q*invRho;
          this.delta[a]+=g*dx; this.delta[a+1]+=g*dy; this.delta[a+2]+=g*dz;
        }
      }
      for (let i=0;i<this.count;i++) {
        const a=i*3;
        for (let c=0;c<3;c++) p[a+c]+=Math.max(-this.spacing*.2,Math.min(this.spacing*.2,this.delta[a+c]));
        this.collide(i);
      }
    }
    for (let a=0;a<p.length;a++) v[a]=Math.max(-14,Math.min(14,(p[a]-this.previous[a])/dt));
    const smooth=0.003+this.viscosity/100*0.15;
    for (let i=0;i<this.count;i++) {
      const a=i*3; let dx=0,dy=0,dz=0,weight=0;
      for (let k=0;k<this.neighborCount[i];k++) {
        const b=this.neighbors[i*this.maxNeighbors+k]*3;
        const x=p[a]-p[b],y=p[a+1]-p[b+1],z=p[a+2]-p[b+2];
        const q=Math.max(0,1-(x*x+y*y+z*z)/this.h2), w=q*q*q;
        dx+=(v[b]-v[a])*w;dy+=(v[b+1]-v[a+1])*w;dz+=(v[b+2]-v[a+2])*w;weight+=w;
      }
      const factor=smooth/Math.max(1,weight);
      this.nextVelocity[a]=(v[a]+dx*factor)*0.999;
      this.nextVelocity[a+1]=(v[a+1]+dy*factor)*0.999;
      this.nextVelocity[a+2]=(v[a+2]+dz*factor)*0.999;
    }
    v.set(this.nextVelocity); this.time+=dt;
  }
}
globalThis.FluidSimulation = FluidSimulation;
