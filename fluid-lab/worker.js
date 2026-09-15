/* global FluidSimulation */
importScripts('solver.js');
let sim;
self.onmessage = ({ data }) => {
  if (data.type === 'reset') { sim = new FluidSimulation(data.options); }
  else if (data.type === 'advance') sim.advance(data.seconds);
  else if (data.type === 'drop') sim.drop(data.options);
  else if (data.type === 'release') sim.release();
  else if (data.type === 'viscosity') { sim.viscosity = data.value; return; }
  else return;
  const positions = sim.positions.slice();
  self.postMessage({ generation: data.generation, type: data.type, positions, bodies: sim.bodies, count: sim.count, radius: sim.radius, spacing: sim.spacing, time: sim.time }, [positions.buffer]);
};
