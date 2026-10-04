/* Babylon.js viewer. Positions and architecture come from the original office sample. */
'use strict';
window.OfficeV2Scene = function (ctx) {
  const { state, equipment, byId, chain, affected, color, matches, visible, render } = ctx;
  const canvas = document.getElementById('map');
  if (!window.BABYLON) {
    document.getElementById('mapnote').textContent = '3Dライブラリを読み込めませんでした。ネットワーク接続を確認して再読み込みしてください。';
    return { update() {}, focus() {}, home() {}, ready: false };
  }
  const B = BABYLON, engine = new B.Engine(canvas, true, { preserveDrawingBuffer: true });
  const scene = new B.Scene(engine);
  scene.clearColor = new B.Color4(.94, .965, .952, 1);
  const camera = new B.ArcRotateCamera('office-camera', -Math.PI / 2.5, 1.02, 130, new B.Vector3(85, 0, 22), scene);
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 5; camera.upperRadiusLimit = 230;
  camera.minZ = .1; camera.wheelDeltaPercentage = .015; camera.panningSensibility = 65;
  new B.HemisphericLight('office-light', new B.Vector3(0, 1, 0), scene).intensity = 1;
  const C = hex => B.Color3.FromHexString(hex);
  function mat(name, hex, alpha = 1) {
    const m = new B.StandardMaterial(name, scene); m.diffuseColor = C(hex);
    m.specularColor = B.Color3.Black(); m.alpha = alpha; return m;
  }
  const floorMat = mat('raised-floor', '#dae7df', .18), deskMat = mat('desks', '#f8f2e5'), legMat = mat('legs', '#a0b3aa');
  const wallMat = mat('walls', '#adc2b5', .23), pillarMat = mat('pillars', '#b6c9bd', .55);
  const floor = B.MeshBuilder.CreateBox('original-160x46-floor', { width: 160, depth: 46, height: .08 }, scene);
  floor.position.set(80, 0, 23); floor.material = floorMat; floor.isPickable = false;
  const structure = [], deskProxies = [];
  function box(name, width, height, depth, x, y, z, material) {
    const m = B.MeshBuilder.CreateBox(name, { width, height, depth }, scene);
    m.position.set(x, y, z); m.material = material; m.isPickable = false; return m;
  }
  for (const d of OFFICE_LAYOUT.desk) {
    const top = box('desk-' + d.id, 1.4, .12, 1.65, d.x, .52, d.z, deskMat); top.rotation.y = d.rt;
    structure.push(top); deskProxies.push(top);
    for (const dx of [-.48, .48]) {
      const leg = box('desk-leg', .08, .5, .08, d.x + dx, .25, d.z, legMat);
      structure.push(leg); deskProxies.push(leg);
    }
  }
  // The original booth boxes overlap the desk models; omit these translucent proxies.
  for (const [list, material] of [[OFFICE_LAYOUT.wall, wallMat], [OFFICE_LAYOUT.door, mat('doors', '#c9aa72', .5)]]) {
    for (const d of list) structure.push(box('office-structure', Math.max(.12, Math.abs(d.x2 - d.x1)), Math.abs(d.y2 - d.y1), Math.max(.12, Math.abs(d.z2 - d.z1)), (d.x1 + d.x2) / 2, (d.y1 + d.y2) / 2, (d.z1 + d.z2) / 2, material));
  }
  for (const d of OFFICE_LAYOUT.pillar) {
    const m = d.shape === 'circle' ? B.MeshBuilder.CreateCylinder('pillar', { diameter: d.r, height: d.h, tessellation: 12 }, scene) : B.MeshBuilder.CreateBox('pillar', { width: d.r, depth: d.r, height: d.h }, scene);
    m.position.set(d.x, d.y + d.h / 2, d.z); m.material = pillarMat; m.isPickable = false; structure.push(m);
  }
  const nodes = [], labels = [], cables = [], guides = [];
  const modelStatus = { loaded: [], errors: [], pending: 3 };
  function height(y) { return y; }
  function textPlane(text, width, fontSize = 44) {
    const texture = new B.DynamicTexture('label-' + text, { width: 512, height: 96 }, scene, false);
    texture.hasAlpha = true; texture.drawText(text, null, 66, `bold ${fontSize}px sans-serif`, '#213c35', '#f6faf2', true);
    const material = mat('label-material', '#ffffff'); material.diffuseTexture = texture; material.emissiveColor = B.Color3.White(); material.backFaceCulling = false;
    const m = B.MeshBuilder.CreatePlane('label', { width, height: width * 96 / 512 }, scene); m.material = material; m.billboardMode = B.Mesh.BILLBOARDMODE_ALL; m.isPickable = false; return m;
  }
  for (const d of equipment) {
    const material = mat('device-' + d.id, color(d));
    const dimensions = d.kind === 'pc' ? { width: .85, height: .5, depth: .12 } : d.kind === 'hub' ? { width: 2.4, height: .35, depth: 1.2 } : d.kind === 'ap' ? { width: 1.3, height: .15, depth: 1.3 } : { width: 1.6, height: 1.1, depth: 1.3 };
    const mesh = B.MeshBuilder.CreateBox(d.id, dimensions, scene); mesh.material = material; mesh.metadata = { id: d.id };
    mesh.rotation.y = d.rotation || 0; nodes.push({ d, mesh, material });
    if (d.kind === 'pc') {
      const base = box('pc-base-' + d.id, .85, .05, .55, d.x, d.h - .28, d.y, material); base.rotation.y = d.rotation || 0; base.metadata = { id: d.id }; base.isPickable = true;
      nodes.push({ d, mesh: base, material, base: true });
    } else { const label = textPlane(d.id + (d.kind === 'hub' ? ' / ' + d.panel : ''), 9); labels.push({ d, mesh: label }); }
  }
  const haloMat = mat('fault-halo', '#ed5549', .25);
  const halo = B.MeshBuilder.CreateSphere('failed-hub-halo', { diameter: 4, segments: 16 }, scene); halo.material = haloMat; halo.isPickable = false;
  const selection = B.MeshBuilder.CreateTorus('selection-ring', { diameter: 3, thickness: .1, tessellation: 32 }, scene); selection.material = mat('selection', '#172e28'); selection.isPickable = false;
  const selectedLabel = textPlane('', 8);
  function cable(d, u, field, category, points) {
    const material = mat('cable-' + field + '-' + d.id, '#619d92'); material.emissiveColor = new B.Color3(.1, .1, .1);
    const mesh = B.MeshBuilder.CreateTube('route-' + field + '-' + d.id + '-' + category, { path: points.map(p => new B.Vector3(...p)), radius: category === 'wifi' ? .045 : .065, tessellation: 4, updatable: true }, scene);
    mesh.material = material; mesh.isPickable = false; cables.push({ d, u, field, category, points, mesh, material });
  }
  for (const d of equipment) for (const field of ['up', 'power']) {
    const u = byId[d[field]]; if (!u) continue;
    if (field === 'up' && d.wifi) {
      for (let i = 0; i < 12; i += 2) {
        const lerp = t => [d.x + (u.x - d.x) * t, d.h + (u.h - d.h) * t, d.y + (u.y - d.y) * t];
        cable(d, u, field, 'wifi', [lerp(i / 12), lerp((i + 1) / 12)]);
      }
    } else if (d.kind === 'ap') {
      cable(d, u, field, 'ceiling', [[d.x, d.h, d.y], [d.x, 3.8, 7], [u.x, 3.8, 7], [u.x, u.h, u.y]]);
    } else {
      const trunk = d.kind === 'hub' && field === 'up', level = field === 'power' ? -1.4 : trunk ? -.9 : -.45;
      cable(d, u, field, field === 'power' ? 'power' : 'lan', [[d.x, d.h, d.y], [d.x, level, d.y], [d.x, level, u.y], [u.x, level, u.y], [u.x, u.h, u.y]]);
    }
  }
  function home() {
    camera.setTarget(new B.Vector3(87, 0, 22)); camera.radius = 115;
    camera.alpha = -Math.PI / 2.35; camera.beta = state.iso ? 1.08 : .025;
  }
  function focus(id) { const d = byId[id]; if (!d) return; camera.setTarget(new B.Vector3(d.x, height(d.h), d.y + (d.kind === 'hub' ? 7 : 0))); camera.radius = d.kind === 'pc' ? 17 : 48; }
  function update() {
    const related = {};
    for (const field of ['up', 'power']) {
      related[field] = new Set(equipment.filter(d => chain(d.id, field).includes(state.selected)).map(d => d.id).concat(chain(state.selected, field)));
    }
    floorMat.alpha = state.floor ? .13 : .97;
    const showArchitecture = !state.underOnly;
    structure.forEach(m => m.setEnabled(showArchitecture)); floor.setEnabled(showArchitecture);
    for (const n of nodes) {
      if (n.model) {
        n.mesh.position.set(n.d.x, n.d.modelY, n.d.y);
        n.mesh.setEnabled(visible(n.d) && !state.underOnly);
        const tint = C(color(n.d)), needsPatch = n.d.patch === 'missing', marked = affected(n.d) || needsPatch;
        for (const { material, baseColor } of n.materials) {
          material.alpha = matches(n.d) ? 1 : .12;
          const displayedColor = needsPatch ? tint : marked ? B.Color3.Lerp(baseColor, tint, .75) : baseColor;
          if ('albedoColor' in material) material.albedoColor = displayedColor;
          else material.diffuseColor = displayedColor;
          material.emissiveColor = tint.scale(needsPatch ? .32 : n.d.id === state.selected ? .22 : marked ? .12 : 0);
        }
        continue;
      }
      n.mesh.position.set(n.d.x, height(n.d.h) - (n.base ? .28 : 0), n.d.y);
      n.material.diffuseColor = C(color(n.d)); n.material.emissiveColor = n.d.id === state.selected ? C(color(n.d)).scale(.35) : B.Color3.Black();
      n.material.alpha = matches(n.d) ? 1 : .1;
      n.mesh.setEnabled(visible(n.d) && (!state.underOnly || n.d.h < 0));
    }
    for (const l of labels) { l.mesh.position.set(l.d.x, height(l.d.h) + 1.4, l.d.y); l.mesh.setEnabled(visible(l.d) && matches(l.d) && (!state.underOnly || l.d.h < 0)); }
    for (const c of cables) {
      const enabled = state.layers[c.category] && (c.field !== 'power' || state.layers.power) && (state.floor || c.category === 'ceiling' || c.category === 'wifi') && (!state.underOnly || !['wifi','ceiling'].includes(c.category));
      c.mesh.setEnabled(!!enabled);
      if (!enabled) continue;
      B.MeshBuilder.CreateTube(c.mesh.name, { path: c.points.map(([x, y, z]) => new B.Vector3(x, height(y), z)), instance: c.mesh });
      const highlight = related[c.field].has(c.d.id) && related[c.field].has(c.u.id), fault = c.field === 'up' && affected(c.d);
      const hex = c.field === 'power' ? '#b38d58' : fault ? '#e55243' : c.category === 'wifi' || c.category === 'ceiling' ? '#9485be' : '#439d8b';
      c.material.diffuseColor = C(hex); c.material.emissiveColor = C(hex).scale(highlight ? .4 : .1); c.material.alpha = highlight || fault ? 1 : .23;
    }
    const d = byId[state.selected]; selection.position.set(d.x, height(d.h) + .4, d.y); selection.setEnabled(visible(d) && (!state.underOnly || d.h < 0));
    selectedLabel.position.set(d.x, height(d.h) + 2.5, d.y); selectedLabel.setEnabled(d.kind === 'pc' && !state.underOnly);
    if (d.kind === 'pc') selectedLabel.material.diffuseTexture.drawText(d.id + ' / ' + d.user, null, 66, 'bold 24px sans-serif', '#213c35', '#f6faf2', true);
    halo.position.set(byId['HUB-A'].x, height(byId['HUB-A'].h), byId['HUB-A'].y); halo.setEnabled(state.failed);
    document.getElementById('mapnote').textContent = '左ドラッグ：回転 / 右ドラッグ：移動 / ホイール：拡大。' + (modelStatus.pending ? '3Dモデルを読み込み中…' : modelStatus.errors.length ? '一部の3Dモデルを読み込めませんでした。' : '元版の机・PCモデルを表示。') + ' 配線は登録位置で表示（デモ用の経路）。';
    engine.resize();
  }
  async function loadModels(file, kind) {
    try {
      const result = await B.SceneLoader.ImportMeshAsync('', './models/', file, scene);
      const source = result.meshes[0]; source.setEnabled(false);
      if (kind === 'desk') {
        for (const d of OFFICE_LAYOUT.desk) {
          const root = source.clone('desk-model-' + d.id, null, false);
          root.scaling.set(1.2, 1.2, .94); root.position.set(d.x, d.y, d.z);
          root.rotate(B.Axis.Y, d.rt, B.Space.WORLD); root.setEnabled(!state.underOnly);
          root.getChildMeshes().forEach(m => m.isPickable = false); structure.push(root);
        }
        for (const mesh of deskProxies) { structure.splice(structure.indexOf(mesh), 1); mesh.dispose(); }
      } else {
        for (const d of equipment.filter(d => d.kind === 'pc' && d.modelType === kind)) {
          const root = source.clone('pc-model-' + d.id, null, false), materials = [], materialMap = new Map();
          root.rotate(B.Axis.Y, d.rotation, B.Space.WORLD); root.metadata = { id: d.id };
          root.getChildMeshes().forEach(mesh => {
            mesh.metadata = { id: d.id }; mesh.isPickable = true;
            if (!mesh.material) return;
            if (!materialMap.has(mesh.material)) {
              const material = mesh.material.clone('model-material-' + d.id + '-' + mesh.material.name);
              const baseColor = (material.albedoColor || material.diffuseColor || B.Color3.White()).clone();
              materialMap.set(mesh.material, material); materials.push({ material, baseColor });
            }
            mesh.material = materialMap.get(mesh.material);
          });
          for (let i = nodes.length - 1; i >= 0; i--) if (nodes[i].d.id === d.id) { nodes[i].mesh.dispose(); nodes.splice(i, 1); }
          nodes.push({ d, mesh: root, materials, model: true }); root.setEnabled(true);
        }
      }
      modelStatus.loaded.push(file);
    } catch (error) { modelStatus.errors.push({ file, message: error.message }); }
    finally { modelStatus.pending--; update(); }
  }
  let pressedDevice = null;
  scene.onPointerObservable.add(info => {
    if (info.type === B.PointerEventTypes.POINTERDOWN) {
      pressedDevice = info.event.button === 0 ? info.pickInfo?.pickedMesh?.metadata?.id : null;
    }
    if (info.type === B.PointerEventTypes.POINTERTAP) {
      if (pressedDevice) {
        state.selected = pressedDevice; render();
      }
      pressedDevice = null;
    }
  });
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  engine.runRenderLoop(() => {
    if (!reducedMotion) halo.scaling.setAll(1 + .06 * Math.sin(performance.now() / 450));
    // Keep labels readable without letting nearby AP labels cover the selected PC.
    const screenScale = 2 * Math.tan(camera.fov / 2) / engine.getRenderHeight();
    for (const l of labels) {
      const distance = B.Vector3.Distance(camera.position, l.mesh.position);
      l.mesh.scaling.setAll(Math.max(.02, screenScale * distance * 135 / 9));
    }
    selectedLabel.scaling.setAll(Math.max(.02, screenScale * B.Vector3.Distance(camera.position, selectedLabel.position) * 220 / 8));
    scene.render();
  });
  new ResizeObserver(() => engine.resize()).observe(canvas.parentElement);
  home(); focus('HUB-A');
  const modelsReady = Promise.all([loadModels('officeDesk3.glb', 'desk'), loadModels('nootbookpcL.glb', '1'), loadModels('desktoppcL.glb', '2')]);
  return { update, focus, home, ready: true, scene, camera, nodes, cables, guides, modelStatus, modelsReady };
};
