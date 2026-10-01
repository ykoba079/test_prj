/* All physics and streamline integration are computed offline. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const canvas = byId('canvas');
  const status = byId('status');
  const controls = ['flow', 'forces', 'surface', 'mirror', 'reset', 'top'];
  const state = { ready: false, errors: [], flow: [], forces: [], wing: [], manifest: null,
    cases: [], activeCaseIndex: null, loading: false, lastSwitchError: null };
  let selectionSerial = 0;
  let speedTimer;
  window.oneraViewer = state;
  function fail(error) {
    state.errors.push(String(error));
    status.textContent = '読み込めませんでした。通信環境を確認してページを再読込してください。';
    status.classList.add('error');
    console.error(error);
  }
  if (!window.BABYLON) { fail(new Error('Babylon.js is unavailable')); return; }
  const engine = new BABYLON.Engine(canvas, true, { stencil: false });
  engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.5));
  const scene = new BABYLON.Scene(engine);
  scene.useRightHandedSystem = true;
  scene.clearColor = new BABYLON.Color4(0.031, 0.059, 0.094, 1);
  const camera = new BABYLON.ArcRotateCamera('camera', -1.1, 1.05, 4.7, new BABYLON.Vector3(0.85, 0, 0), scene);
  camera.attachControl(canvas, true);
  camera.fov = 1.1;
  camera.fovMode = BABYLON.Camera.FOVMODE_HORIZONTAL_FIXED;
  camera.minZ = 0.01;
  camera.maxZ = 80;
  camera.lowerRadiusLimit = 0.3;
  camera.upperRadiusLimit = 15;
  camera.wheelDeltaPercentage = 0.015;
  camera.pinchDeltaPercentage = 0.015;
  camera.panningSensibility = 900;
  camera.lowerBetaLimit = 0.015;
  camera.upperBetaLimit = Math.PI - 0.015;
  const light = new BABYLON.HemisphericLight('light', new BABYLON.Vector3(-0.5, 1, 0.3), scene);
  light.intensity = 0.95;
  light.groundColor = new BABYLON.Color3(0.2, 0.27, 0.35);
  const metal = new BABYLON.StandardMaterial('wing-material', scene);
  metal.diffuseColor = new BABYLON.Color3(0.56, 0.65, 0.73);
  metal.specularColor = new BABYLON.Color3(0.35, 0.42, 0.48);
  metal.specularPower = 64;
  metal.backFaceCulling = false;
  const pressure = new BABYLON.StandardMaterial('pressure-material', scene);
  pressure.disableLighting = true;
  pressure.emissiveColor = BABYLON.Color3.White();
  pressure.backFaceCulling = false;
  engine.runRenderLoop(() => scene.render());
  function resize() {
    engine.resize();
    camera.viewport = innerWidth < 650
      ? new BABYLON.Viewport(0, 0.32, 1, 0.68)
      : new BABYLON.Viewport(0, 0, 1, 1);
  }
  window.addEventListener('resize', resize);
  resize();

  async function getJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
  }

  function makeWing(data, mirrored) {
    const mesh = new BABYLON.Mesh(mirrored ? 'wing-mirrored' : 'wing-computed', scene);
    const count = data.positions.length / 6;
    const vertexOffset = mirrored ? count : 0;
    const halfIndexCount = data.indices.length / 2;
    const geometry = new BABYLON.VertexData();
    geometry.positions = data.positions.slice(vertexOffset * 3, (vertexOffset + count) * 3);
    geometry.indices = data.indices.slice(mirrored ? halfIndexCount : 0, mirrored ? data.indices.length : halfIndexCount).map(i => i - vertexOffset);
    geometry.normals = [];
    BABYLON.VertexData.ComputeNormals(geometry.positions, geometry.indices, geometry.normals, { useRightHandedSystem: true });
    geometry.colors = data.colors.slice(vertexOffset * 4, (vertexOffset + count) * 4);
    geometry.applyToMesh(mesh, true);
    mesh.material = metal;
    mesh.useVertexColors = false;
    return mesh;
  }

  async function loadSplat(url) {
    const result = await BABYLON.ImportMeshAsync(url, scene, { pluginExtension: '.spz', pluginOptions: { splat: { flipY: false } } });
    const meshes = result.meshes.filter(mesh => mesh instanceof BABYLON.GaussianSplattingMesh);
    if (meshes.length !== 1) throw new Error(`Expected one GaussianSplattingMesh in ${url}`);
    return meshes[0];
  }

  function sync() {
    const mirrored = byId('mirror').checked;
    const wingStyle = byId('surface').value;
    state.wing.forEach((mesh, i) => {
      mesh.setEnabled(wingStyle !== 'hidden' && (i === 0 || mirrored));
      mesh.material = wingStyle === 'pressure' ? pressure : metal;
      mesh.useVertexColors = wingStyle === 'pressure';
    });
    // The files contain both mirrored halves; clip the reflected half at z=0.
    scene.clipPlane = mirrored ? null : new BABYLON.Plane(0, 0, 1, 0);
    state.flow.forEach(mesh => mesh.setEnabled(byId('flow').checked));
    state.forces.forEach(mesh => mesh.setEnabled(byId('forces').checked));
    const pressureLegend = wingStyle === 'pressure' || (!byId('flow').checked && byId('forces').checked);
    byId('legendTitle').textContent = pressureLegend ? '圧力係数 Cp · 周囲との差' : '流速 · m/s';
    byId('low').textContent = pressureLegend ? '−1.2' : '180';
    byId('high').textContent = pressureLegend ? '+0.6' : '420';
    byId('gradient').style.background = pressureLegend
      ? 'linear-gradient(90deg,#3b4cc0,#8db0fe,#dddcdc,#f4987a,#b40426)'
      : 'linear-gradient(90deg,#4565ce,#2cbed6,#75e958,#f4d044,#e23a21)';
    byId('legend').hidden = !byId('flow').checked && !pressureLegend;
  }

  controls.slice(0, 4).forEach(id => byId(id).addEventListener('change', sync));
  byId('reset').addEventListener('click', () => {
    camera.inertialAlphaOffset = camera.inertialBetaOffset = camera.inertialRadiusOffset = 0;
    camera.setTarget(new BABYLON.Vector3(0.85, 0, 0));
    camera.alpha = -1.1; camera.beta = 1.05; camera.radius = 4.7;
  });
  byId('top').addEventListener('click', () => {
    camera.inertialAlphaOffset = camera.inertialBetaOffset = camera.inertialRadiusOffset = 0;
    camera.setTarget(new BABYLON.Vector3(0.9, 0, 0));
    camera.alpha = -Math.PI / 2; camera.beta = 0.02; camera.radius = 4.4;
  });

  function selectedSpeedLabel(index) {
    const text = `${Math.round(state.cases[index].velocity_m_s)} m/s`;
    byId('speedLabel').textContent = text;
    byId('speed').setAttribute('aria-valuetext', text);
    return text;
  }

  async function selectSpeed(index) {
    const serial = ++selectionSerial;
    if (index === state.activeCaseIndex) {
      state.loading = false;
      byId('speed').setAttribute('aria-busy', 'false');
      status.classList.remove('error');
      status.textContent = '静止した解析結果 · 速度ごとの計算済み結果';
      return;
    }
    state.loading = true;
    state.lastSwitchError = null;
    byId('speed').setAttribute('aria-busy', 'true');
    status.classList.remove('error');
    status.textContent = `${selectedSpeedLabel(index)} の解析結果を読み込んでいます…（表示は直前の結果）`;
    const entry = state.cases[index];
    const pending = [];
    try {
      const [manifest, data] = await Promise.all([
        getJson(`${entry.base_url}/manifest.json`),
        getJson(`${entry.base_url}/pressure.json?v=${entry.pressure_sha256}`)
      ]);
      if (serial !== selectionSerial) return;
      if (manifest.mach !== entry.mach || data.colors.length !== state.wing[0].getTotalVertices() * 8)
        throw new Error('Speed-case pressure data does not match the wing');
      // Release superseded imports as soon as they finish.
      const flow = await loadSplat(`${entry.base_url}/flow.spz?v=${manifest.flow_spz.sha256}`);
      flow.setEnabled(false);
      pending.push(flow);
      if (serial !== selectionSerial) return;
      const forces = await loadSplat(`${entry.base_url}/pressure-force.spz?v=${manifest.wing.pressure_force_spz.sha256}`);
      forces.setEnabled(false);
      pending.push(forces);
      if (serial !== selectionSerial) return;
      if (flow.getTotalVertices() !== manifest.flow_spz.count || flow.getTotalVertices() !== 150000 ||
          forces.getTotalVertices() !== manifest.wing.pressure_force_spz.count)
        throw new Error('Speed-case SPZ does not match its manifest');
      const outgoing = [...state.flow, ...state.forces];
      const half = data.colors.length / 2;
      state.wing.forEach((mesh, i) => mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, data.colors.slice(i * half, (i + 1) * half)));
      state.flow = [flow];
      state.forces = [forces];
      pending.length = 0;
      state.manifest = manifest;
      state.activeCaseIndex = index;
      outgoing.forEach(mesh => mesh.dispose());
      sync();
      byId('mach').textContent = manifest.mach.toFixed(4);
      byId('aoa').textContent = `${manifest.angle_of_attack_degrees.toFixed(2)}°`;
      byId('count').textContent = flow.getTotalVertices().toLocaleString('ja-JP');
      byId('velocity').textContent = `${Math.round(manifest.freestream_velocity_m_s)} m/s`;
      byId('recordLink').href = `${entry.base_url}/manifest.json`;
      await scene.whenReadyAsync();
      if (serial !== selectionSerial) return;
      status.textContent = '静止した解析結果 · 速度ごとの計算済み結果';
    } catch (error) {
      if (serial !== selectionSerial) return;
      if (state.activeCaseIndex === null) throw error;
      state.lastSwitchError = String(error);
      byId('speed').value = state.activeCaseIndex;
      selectedSpeedLabel(state.activeCaseIndex);
      status.textContent = '切り替えられませんでした。直前の結果を表示しています。速度を選び直すと再試行できます。';
      status.classList.add('error');
    } finally {
      pending.forEach(mesh => mesh.dispose());
      if (serial === selectionSerial) {
        state.loading = false;
        byId('speed').setAttribute('aria-busy', 'false');
      }
    }
  }

  byId('speed').addEventListener('input', () => {
    clearTimeout(speedTimer);
    // Invalidate in-flight work immediately, before the debounce expires.
    ++selectionSerial;
    selectedSpeedLabel(Number(byId('speed').value));
    speedTimer = setTimeout(() => selectSpeed(Number(byId('speed').value)), 180);
  });
  byId('speed').addEventListener('change', () => {
    clearTimeout(speedTimer);
    selectSpeed(Number(byId('speed').value));
  });

  (async () => {
    try {
      if (engine.webGLVersion < 2) throw new Error('This viewer requires WebGL 2');
      const [registry, meshData] = await Promise.all([getJson('assets/speeds.json'), getJson('assets/wing.json')]);
      state.cases = registry.cases;
      state.wing.push(makeWing(meshData, false), makeWing(meshData, true));
      byId('speed').max = registry.cases.length - 1;
      byId('speed').value = registry.default_index;
      await selectSpeed(registry.default_index);
      [...controls, 'speed'].forEach(id => { byId(id).disabled = false; });
      state.ready = true;
    } catch (error) { fail(error); }
  })();
})();
