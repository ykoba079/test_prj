const assert = require('node:assert/strict');
require('./solver.js');
for (const mode of ['tank','dam']) {
  const sim = new FluidSimulation({quality:'low', mode});
  for (let i=0;i<60;i++) sim.step();
  if(mode==='dam') {
    assert(sim.positions.every((x,i)=>i%3!==0 || x<0));
    sim.release();
  } else {
    sim.drop({shape:'sphere',size:.95,height:3});
    sim.drop({shape:'box',size:.7,x:1.5});
  }
  for(let i=0;i<240;i++) sim.step();
  assert(sim.positions.every(Number.isFinite));
  assert(sim.renderSizes.every(s=>Number.isFinite(s)&&s>0));
  for(let i=0;i<sim.count;i++) {
    assert(sim.positions[i*3]>=-3+sim.radius-.001);
    assert(sim.positions[i*3]<=3-sim.radius+.001);
    assert(sim.positions[i*3+1]>=sim.radius-.001);
    assert(Math.abs(sim.positions[i*3+2])<=1.8-sim.radius+.001);
  }
  if(mode==='dam')assert(sim.positions.some((x,i)=>i%3===0&&x>1));
}
// Separate a particle from the water and verify the actual support-dependent
// render-size calculation through full timesteps, rather than a fixed flag.
const sim=new FluidSimulation({quality:'low'});
sim.positions.set([0,5,0],0);
for(let i=0;i<12;i++)sim.step();
assert(sim.renderSizes[0]<sim.spacing*.25,'isolated spray should be a small droplet');
assert(sim.renderSizes.some(s=>s>sim.spacing*1.5),'bulk water should stay connected');
assert(sim.positions[1]>4,'droplet remains separated during the check');
console.log('PASS: fluid collisions, dam flow, finite positions/sizes, isolated droplets, bulk water.');
