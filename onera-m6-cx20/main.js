// Standalone HTML host for CX20's Playground scene. Physics is unchanged.
const canvas = document.getElementById('canvas');
const diagnostics = { errors: [], scene: null, engine: null };
window.cx20Viewer = diagnostics;
function fail(error) {
  diagnostics.errors.push(String(error));
  document.getElementById('errorMessage').textContent = 'WebGL 2対応のブラウザーで開き、通信環境を確認してください。' + String(error);
  document.getElementById('error').hidden = false;
}
document.getElementById('retry').addEventListener('click', () => location.reload());
window.addEventListener('error', event => fail(event.message));
window.addEventListener('unhandledrejection', event => fail(event.reason));
try {
  if (!window.BABYLON?.GUI) throw new Error('Babylon.js / GUI の読み込みに失敗しました。');
  if (typeof DecompressionStream === 'undefined') throw new Error('SPZ解凍に必要なDecompressionStreamが利用できません。');
  const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  diagnostics.engine = engine;
  if (engine.webGLVersion < 2) throw new Error('WebGL 2が必要です。');
  engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.5));
  const { default: createScene } = await import('./demo.js?v=cx20-20261003');
  const scene = createScene(engine, canvas);
  diagnostics.scene = scene;
  diagnostics.demo = scene.metadata.cx20;
  let panel = null;
  const mobile = () => innerWidth <= 850;
  function panels() {
    const { layout } = diagnostics.demo;
    layout.toolCard.isVisible = !mobile() || panel === 'analysis';
    layout.panelCard.isVisible = !mobile() || panel === 'display';
    document.getElementById('analysisPanel').setAttribute('aria-pressed', String(panel === 'analysis'));
    document.getElementById('displayPanel').setAttribute('aria-pressed', String(panel === 'display'));
  }
  document.getElementById('analysisPanel').addEventListener('click', () => { panel = panel === 'analysis' ? null : 'analysis'; panels(); });
  document.getElementById('displayPanel').addEventListener('click', () => { panel = panel === 'display' ? null : 'display'; panels(); });
  document.getElementById('closePanel').addEventListener('click', () => { panel = null; panels(); });
  function resize() {
    engine.resize();
    const { layout } = diagnostics.demo;
    // A minimum logical GUI size keeps all original controls accessible on phones.
    diagnostics.demo.ui.idealHeight = mobile() ? 950 : 0;
    layout.header.width = mobile() ? '300px' : '420px';
    layout.header.top = mobile() ? '55px' : '20px';
    layout.panelCard.top = mobile() ? '60px' : '22px';
    layout.hint.isVisible = !mobile();
    layout.legendStack.isVertical = mobile();
    layout.legendStack.width = mobile() ? '252px' : '504px';
    layout.legendStack.height = mobile() ? '156px' : '78px';
    layout.legendStack.top = mobile() ? '-50px' : '-14px';
    layout.legendStack.children.forEach(card => {
      card.adaptHeightToChildren = false;
      card.height = '68px';
      // StackPanel retains offsets from its previous orientation.
      card.left = '0px';
      card.top = '0px';
    });
    diagnostics.demo.status.width = mobile() ? '90%' : '48%';
    diagnostics.demo.status.left = mobile() ? '0px' : '-22px';
    diagnostics.demo.status.top = mobile() ? '-48px' : '-22px';
    diagnostics.demo.status.fontSize = mobile() ? 10 : 11;
    panels();
  }
  window.addEventListener('resize', resize);
  resize();
  engine.runRenderLoop(() => { if (!scene.isDisposed) scene.render(); });
} catch (error) { fail(error); }
