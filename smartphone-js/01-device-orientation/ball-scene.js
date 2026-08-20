(function () {
  "use strict";

  const DEG = Math.PI / 180;

  class BallScene {
    constructor(canvas, { onStatus, onGoal }) {
      this.canvas = canvas;
      this.onStatus = onStatus;
      this.onGoal = onGoal;
      this.engine = null;
      this.scene = null;
      this.ball = null;
      this.ballAggregate = null;
      this.ballShadow = null;
      this.ready = false;
      this.initializing = null;
      this.goalReached = false;
      this.outOfBounds = false;
      this.startedAt = null;
      this.lastJumpAt = 0;
      this.jumpPlanar = { x: 0, z: 0 };
      this.resizeObserver = null;
    }

    async init() {
      if (this.ready) return true;
      if (this.initializing) return this.initializing;
      this.initializing = this.create();
      return this.initializing;
    }

    async create() {
      this.onStatus("物理演算を準備しています…");
      try {
        if (!window.BABYLON || !window.HavokPhysics) throw new Error("3Dライブラリを読み込めませんでした");

        this.engine = new BABYLON.Engine(this.canvas, true, { preserveDrawingBuffer: true, stencil: true });
        const scene = new BABYLON.Scene(this.engine);
        scene.clearColor = new BABYLON.Color4(0.025, 0.055, 0.06, 1);
        this.scene = scene;

        const camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2, 0.3, 20, new BABYLON.Vector3(0, 0, 0), scene);
        camera.inputs.clear();
        camera.fovMode = BABYLON.Camera.FOVMODE_HORIZONTAL_FIXED;
        camera.fov = 0.82;

        const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(-0.4, 1, -0.2), scene);
        light.intensity = 0.92;
        light.groundColor = BABYLON.Color3.FromHexString("#102326");

        const havok = await window.HavokPhysics();
        const plugin = new BABYLON.HavokPlugin(true, havok);
        scene.enablePhysics(new BABYLON.Vector3(0, -9.81, 0), plugin);

        const boardMat = new BABYLON.StandardMaterial("boardMat", scene);
        boardMat.diffuseColor = BABYLON.Color3.FromHexString("#28574b");
        boardMat.specularColor = BABYLON.Color3.Black();
        const wallMat = new BABYLON.StandardMaterial("wallMat", scene);
        wallMat.diffuseColor = BABYLON.Color3.FromHexString("#d7e5d8");
        wallMat.specularColor = BABYLON.Color3.Black();

        const board = BABYLON.MeshBuilder.CreateBox("board", { width: 9, height: 0.35, depth: 14 }, scene);
        board.position.y = -0.25;
        board.material = boardMat;
        new BABYLON.PhysicsAggregate(board, BABYLON.PhysicsShapeType.BOX, { mass: 0, friction: 0.28, restitution: 0.06 }, scene);

        const createWall = (name, width, depth, x, z, height = 1.55, material = wallMat) => {
          const wall = BABYLON.MeshBuilder.CreateBox(name, { width, height, depth }, scene);
          wall.position.set(x, -0.075 + height / 2, z);
          wall.material = material;
          new BABYLON.PhysicsAggregate(wall, BABYLON.PhysicsShapeType.BOX, { mass: 0, friction: 0.65, restitution: 0.18 }, scene);
        };
        createWall("north", 9.4, 0.32, 0, 7.12);
        createWall("south", 9.4, 0.32, 0, -7.12);
        createWall("east", 0.32, 14, 4.62, 0);
        createWall("west", 0.32, 14, -4.62, 0);

        // 下段は広い練習路、中段は左右の判断、上段は狭いゴール進入路。
        // 一本の正解ルートを保ちつつ、壁の枝と脇道で迷路らしさを加える。
        createWall("mazeH1", 6.25, 0.24, -1.38, -4.75);
        createWall("mazeV1", 0.24, 1.05, -1.85, -4.22);
        createWall("mazeH2", 6.25, 0.24, 1.38, -2.25);
        createWall("mazeV2", 0.24, 1.05, 1.85, -1.72);
        createWall("mazeH3", 5.75, 0.24, -1.63, 0.25);
        createWall("mazeV3", 0.24, 1.05, -1.55, 0.78);
        createWall("mazeH4", 5.75, 0.24, 1.63, 2.75);
        createWall("mazeV4", 0.24, 1.05, 1.55, 3.28);
        createWall("mazeH5", 6.65, 0.24, -1.18, 5.15);

        // 外壁から伸びる短い壁は袋小路の目印。主経路は塞がない。
        createWall("pocketR1", 1.2, 0.24, 4.0, -5.85);
        createWall("pocketL1", 1.25, 0.24, -3.98, -3.45);
        createWall("pocketR2", 1.25, 0.24, 3.98, -0.95);
        createWall("pocketL2", 1.25, 0.24, -3.98, 1.55);
        createWall("pocketR3", 1.25, 0.24, 3.98, 4.0);

        const jumpMat = new BABYLON.StandardMaterial("jumpMat", scene);
        jumpMat.diffuseColor = BABYLON.Color3.FromHexString("#d7ff4f");
        jumpMat.emissiveColor = BABYLON.Color3.FromHexString("#344500");
        jumpMat.specularColor = BABYLON.Color3.Black();
        // 最初の折り返しに、加速度ジャンプでだけ越えられる低いゲートを置く。
        createWall("jumpGate", 8.75, 0.34, 0, -3.55, 0.72, jumpMat);

        const goalMat = new BABYLON.StandardMaterial("goalMat", scene);
        goalMat.diffuseColor = BABYLON.Color3.FromHexString("#d7ff4f");
        goalMat.emissiveColor = BABYLON.Color3.FromHexString("#344500");
        goalMat.specularColor = BABYLON.Color3.Black();
        const goal = BABYLON.MeshBuilder.CreateCylinder("goal", { diameter: 1.55, height: 0.04, tessellation: 48 }, scene);
        goal.position.set(3.25, -0.04, 6.05);
        goal.material = goalMat;

        const startMat = new BABYLON.StandardMaterial("startMat", scene);
        startMat.diffuseColor = BABYLON.Color3.FromHexString("#5ccfe6");
        startMat.emissiveColor = BABYLON.Color3.FromHexString("#123b45");
        startMat.specularColor = BABYLON.Color3.Black();
        const start = BABYLON.MeshBuilder.CreateCylinder("start", { diameter: 1.35, height: 0.035, tessellation: 48 }, scene);
        start.position.set(-3.35, -0.045, -5.75);
        start.material = startMat;

        const ballMat = new BABYLON.StandardMaterial("ballMat", scene);
        ballMat.diffuseColor = BABYLON.Color3.FromHexString("#ff775f");
        ballMat.emissiveColor = BABYLON.Color3.FromHexString("#35120d");
        ballMat.specularColor = BABYLON.Color3.Black();
        this.ball = BABYLON.MeshBuilder.CreateSphere("ball", { diameter: 0.85, segments: 28 }, scene);
        this.ball.material = ballMat;
        this.ball.position.set(-3.35, 0.75, -5.75);
        this.ballAggregate = new BABYLON.PhysicsAggregate(this.ball, BABYLON.PhysicsShapeType.SPHERE, { mass: 1, friction: 0.22, restitution: 0.16 }, scene);

        const shadowMat = new BABYLON.StandardMaterial("shadowMat", scene);
        shadowMat.diffuseColor = BABYLON.Color3.Black();
        shadowMat.emissiveColor = BABYLON.Color3.Black();
        shadowMat.specularColor = BABYLON.Color3.Black();
        shadowMat.alpha = 0.34;
        this.ballShadow = BABYLON.MeshBuilder.CreateCylinder("ballShadow", { diameter: 0.72, height: 0.012, tessellation: 32 }, scene);
        this.ballShadow.material = shadowMat;
        this.ballShadow.position.y = -0.065;

        scene.onBeforeRenderObservable.add(() => {
          const airHeight = Math.max(0, this.ball.position.y - 0.35);
          const shadowScale = Math.max(0.45, 1 - airHeight * 0.28);
          this.ballShadow.position.x = this.ball.position.x;
          this.ballShadow.position.z = this.ball.position.z;
          this.ballShadow.scaling.x = shadowScale;
          this.ballShadow.scaling.z = shadowScale;
          this.ballShadow.visibility = Math.max(0.12, 0.8 - airHeight * 0.32);
          if (!this.goalReached && !this.outOfBounds && BABYLON.Vector3.DistanceSquared(this.ball.position, goal.position) < 0.62) {
            this.goalReached = true;
            const elapsedSeconds = this.startedAt === null ? 0 : (performance.now() - this.startedAt) / 1000;
            this.onGoal(`GOAL　${elapsedSeconds.toFixed(1)}秒`);
          }
          if (!this.outOfBounds && (
            Math.abs(this.ball.position.x) > 5.6
            || Math.abs(this.ball.position.z) > 8.1
            || this.ball.position.y < -3
          )) {
            this.outOfBounds = true;
            this.onGoal("OUT　「リトライ」で再開");
          }
        });

        this.engine.runRenderLoop(() => scene.render());
        const resize = () => this.engine?.resize();
        window.addEventListener("resize", resize);
        window.visualViewport?.addEventListener("resize", resize);
        if (window.ResizeObserver) {
          this.resizeObserver = new ResizeObserver(resize);
          this.resizeObserver.observe(this.canvas);
        }
        // iOS Safariでは初回レイアウト後に表示領域が確定するため、数フレーム後にも同期する。
        requestAnimationFrame(() => {
          resize();
          requestAnimationFrame(resize);
        });
        window.setTimeout(resize, 250);
        window.setTimeout(resize, 800);
        this.ready = true;
        this.onStatus("Physics V2 / Havok 準備完了");
        return true;
      } catch (error) {
        console.error(error);
        this.onStatus(`3Dの準備に失敗しました: ${error.message}`);
        return false;
      }
    }

    setTilt(xDegrees, yDegrees) {
      if (!this.ready) return;
      const x = Math.max(-25, Math.min(25, xDegrees)) * DEG;
      const y = Math.max(-25, Math.min(25, yDegrees)) * DEG;
      const horizontalScale = 27;
      const direction = new BABYLON.Vector3(
        Math.sin(x) * horizontalScale,
        -9.81,
        -Math.sin(y) * horizontalScale
      );
      const planarLength = Math.hypot(direction.x, direction.z);
      this.jumpPlanar = planarLength > 0.05
        ? { x: direction.x / planarLength, z: direction.z / planarLength }
        : { x: 0, z: 0 };
      this.scene.getPhysicsEngine().setGravity(direction);
      // Havokで静止した剛体はスリープするため、重力方向の変更時に起こす。
      this.ballAggregate.body.applyImpulse(direction.scale(1e-8), this.ball.getAbsolutePosition());
    }

    jump(motionX = 0, motionY = 0) {
      if (!this.ready || !this.ballAggregate || this.goalReached || this.outOfBounds) return false;
      const now = performance.now();
      const isGrounded = this.ball.position.y < 0.72;
      if (!isGrounded || now - this.lastJumpAt < 850) return false;
      this.lastJumpAt = now;
      const motionLength = Math.hypot(motionX, motionY);
      const planar = motionLength > 1
        ? { x: motionX / motionLength, z: -motionY / motionLength }
        : this.jumpPlanar;
      const impulse = new BABYLON.Vector3(planar.x * 9, 10.5, planar.z * 9);
      this.ballAggregate.body.applyImpulse(impulse, this.ball.getAbsolutePosition());
      return true;
    }

    reset() {
      if (!this.ready || !this.ballAggregate) return;
      this.goalReached = false;
      this.outOfBounds = false;
      this.startedAt = performance.now();
      this.lastJumpAt = 0;
      this.onGoal("");
      this.ballAggregate.body.setLinearVelocity(BABYLON.Vector3.Zero());
      this.ballAggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
      this.ball.position.set(-3.35, 0.75, -5.75);
      this.ball.computeWorldMatrix(true);
      this.ballAggregate.body.disablePreStep = false;
      window.setTimeout(() => {
        if (this.ballAggregate?.body) this.ballAggregate.body.disablePreStep = true;
      }, 0);
    }
  }

  window.BallScene = BallScene;
})();
