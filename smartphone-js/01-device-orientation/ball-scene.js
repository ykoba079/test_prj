(function () {
  "use strict";

  const DEG = Math.PI / 180;
  const MAX_UPWARD_SPEED = 2.2;

  class BallScene {
    constructor(canvas, { onStatus, onGoal }) {
      this.canvas = canvas;
      this.onStatus = onStatus;
      this.onGoal = onGoal;
      this.engine = null;
      this.scene = null;
      this.camera = null;
      this.light = null;
      this.ball = null;
      this.ballAggregate = null;
      this.ballShadow = null;
      this.ready = false;
      this.initializing = null;
      this.goalReached = false;
      this.outOfBounds = false;
      this.startedAt = null;
      this.startLocal = { x: 0, z: -5.8 };
      this.motionInput = { x: 0, z: 0 };
      this.mazeOffset = { x: 0, y: 0, z: 0 };
      this.mazeVelocity = { x: 0, y: 0, z: 0 };
      this.mazeRotation = null;
      this.mazePose = null;
      this.mazeAnchor = null;
      this.movableBodies = [];
      this.mazeVisuals = [];
      this.cameraLocalPosition = null;
      this.cameraLocalUp = null;
      this.lightLocalDirection = null;
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

        const camera = new BABYLON.FreeCamera("camera", new BABYLON.Vector3(0, 19.1, -5.91), scene);
        this.camera = camera;
        this.cameraLocalPosition = new BABYLON.Vector3(0, 19.1, -5.91);
        this.cameraLocalUp = new BABYLON.Vector3(0, 0.296, 0.955);
        this.mazeRotation = BABYLON.Quaternion.Identity();
        this.mazePose = {
          origin: BABYLON.Vector3.Zero(),
          rotation: BABYLON.Quaternion.Identity()
        };
        camera.inputs.clear();
        camera.fovMode = BABYLON.Camera.FOVMODE_HORIZONTAL_FIXED;
        camera.fov = 0.82;
        camera.upVector.copyFrom(this.cameraLocalUp);
        camera.setTarget(BABYLON.Vector3.Zero());

        const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(-0.4, 1, -0.2), scene);
        this.light = light;
        this.lightLocalDirection = new BABYLON.Vector3(-0.4, 1, -0.2).normalize();
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

        const registerMovableBody = (mesh, friction, restitution) => {
          mesh.rotationQuaternion = mesh.rotationQuaternion || BABYLON.Quaternion.Identity();
          const aggregate = new BABYLON.PhysicsAggregate(
            mesh,
            BABYLON.PhysicsShapeType.BOX,
            { mass: 0, friction, restitution },
            scene
          );
          aggregate.body.setMotionType(BABYLON.PhysicsMotionType.ANIMATED);
          this.movableBodies.push({
            mesh,
            body: aggregate.body,
            basePosition: mesh.position.clone(),
            targetPosition: mesh.position.clone()
          });
          return aggregate;
        };

        const board = BABYLON.MeshBuilder.CreateBox("board", { width: 9, height: 0.35, depth: 14 }, scene);
        board.position.y = -0.25;
        board.material = boardMat;
        // 慣性差を残しつつ、床で自然に転がる摩擦と低い反発にする。
        registerMovableBody(board, 0.18, 0.01);
        this.mazeAnchor = board;

        const createWall = (name, width, depth, x, z, height = 1.55, material = wallMat) => {
          const wall = BABYLON.MeshBuilder.CreateBox(name, { width, height, depth }, scene);
          wall.position.set(x, -0.075 + height / 2, z);
          wall.material = material;
          registerMovableBody(wall, 0.65, 0.03);
        };
        createWall("north", 9.4, 0.32, 0, 7.12);
        createWall("south", 9.4, 0.32, 0, -7.12);
        createWall("east", 0.32, 14, 4.62, 0);
        createWall("west", 0.32, 14, -4.62, 0);

        // 縦方向へ進みながら、中央付近だけを小さく左右へ避けるスラローム。
        // 端から端への往復をなくし、画面が横向きになるほど端末を傾けずに遊べる。
        createWall("mazeH1", 4.2, 0.24, -1.65, -4.1);
        createWall("mazeV1", 0.24, 0.9, 0.45, -3.65);
        createWall("mazeH2", 4.2, 0.24, 1.65, -1.6);
        createWall("mazeV2", 0.24, 0.9, -0.45, -1.15);
        createWall("mazeH3", 4.2, 0.24, -1.65, 0.9);
        createWall("mazeV3", 0.24, 0.9, 0.45, 1.35);
        createWall("mazeH4", 4.2, 0.24, 1.65, 3.4);
        createWall("mazeV4", 0.24, 0.9, -0.45, 3.85);

        // 最後は中央のゴールへ自然に収束する短い進入路。
        createWall("goalLaneL", 0.24, 1.15, -1.45, 5.55);
        createWall("goalLaneR", 0.24, 1.15, 1.45, 5.55);

        const goalMat = new BABYLON.StandardMaterial("goalMat", scene);
        goalMat.diffuseColor = BABYLON.Color3.FromHexString("#d7ff4f");
        goalMat.emissiveColor = BABYLON.Color3.FromHexString("#344500");
        goalMat.specularColor = BABYLON.Color3.Black();
        const goal = BABYLON.MeshBuilder.CreateCylinder("goal", { diameter: 1.55, height: 0.04, tessellation: 48 }, scene);
        goal.position.set(0, -0.04, 6.05);
        goal.material = goalMat;
        this.mazeVisuals.push({ mesh: goal, basePosition: goal.position.clone() });

        const startMat = new BABYLON.StandardMaterial("startMat", scene);
        startMat.diffuseColor = BABYLON.Color3.FromHexString("#5ccfe6");
        startMat.emissiveColor = BABYLON.Color3.FromHexString("#123b45");
        startMat.specularColor = BABYLON.Color3.Black();
        const start = BABYLON.MeshBuilder.CreateCylinder("start", { diameter: 1.35, height: 0.035, tessellation: 48 }, scene);
        start.position.set(this.startLocal.x, -0.045, this.startLocal.z);
        start.material = startMat;
        this.mazeVisuals.push({ mesh: start, basePosition: start.position.clone() });

        const ballMat = new BABYLON.StandardMaterial("ballMat", scene);
        ballMat.diffuseColor = BABYLON.Color3.FromHexString("#ff775f");
        ballMat.emissiveColor = BABYLON.Color3.FromHexString("#35120d");
        ballMat.specularColor = BABYLON.Color3.Black();
        this.ball = BABYLON.MeshBuilder.CreateSphere("ball", { diameter: 0.85, segments: 28 }, scene);
        this.ball.material = ballMat;
        this.ball.position.set(this.startLocal.x, 0.75, this.startLocal.z);
        this.ballAggregate = new BABYLON.PhysicsAggregate(this.ball, BABYLON.PhysicsShapeType.SPHERE, { mass: 1, friction: 0.16, restitution: 0.02 }, scene);

        const shadowMat = new BABYLON.StandardMaterial("shadowMat", scene);
        shadowMat.diffuseColor = BABYLON.Color3.Black();
        shadowMat.emissiveColor = BABYLON.Color3.Black();
        shadowMat.specularColor = BABYLON.Color3.Black();
        shadowMat.alpha = 0.34;
        this.ballShadow = BABYLON.MeshBuilder.CreateCylinder("ballShadow", { diameter: 0.72, height: 0.012, tessellation: 32 }, scene);
        this.ballShadow.material = shadowMat;
        this.ballShadow.position.y = -0.065;

        scene.onBeforeRenderObservable.add(() => {
          this.updateMazeMotion(Math.min(this.engine.getDeltaTime() / 1000, 0.034));
          this.limitBallRise();
          const ballLocal = this.worldToMazeLocal(this.ball.position);
          const airHeight = Math.max(0, ballLocal.y - 0.35);
          const shadowScale = Math.max(0.45, 1 - airHeight * 0.28);
          const shadowWorld = this.mazeLocalToWorld(new BABYLON.Vector3(ballLocal.x, -0.065, ballLocal.z));
          this.ballShadow.position.copyFrom(shadowWorld);
          this.ballShadow.rotationQuaternion = this.ballShadow.rotationQuaternion || BABYLON.Quaternion.Identity();
          this.ballShadow.rotationQuaternion.copyFrom(this.mazePose.rotation);
          this.ballShadow.scaling.x = shadowScale;
          this.ballShadow.scaling.z = shadowScale;
          this.ballShadow.visibility = Math.max(0.12, 0.8 - airHeight * 0.32);
          if (!this.goalReached && !this.outOfBounds && BABYLON.Vector3.DistanceSquared(this.ball.position, goal.position) < 0.62) {
            this.goalReached = true;
            const elapsedSeconds = this.startedAt === null ? 0 : (performance.now() - this.startedAt) / 1000;
            this.onGoal(`GOAL　${elapsedSeconds.toFixed(1)}秒`);
          }
          if (!this.outOfBounds && ballLocal.y < -8) {
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

    rotateVector(vector, quaternion) {
      const tx = 2 * (quaternion.y * vector.z - quaternion.z * vector.y);
      const ty = 2 * (quaternion.z * vector.x - quaternion.x * vector.z);
      const tz = 2 * (quaternion.x * vector.y - quaternion.y * vector.x);
      return new BABYLON.Vector3(
        vector.x + quaternion.w * tx + quaternion.y * tz - quaternion.z * ty,
        vector.y + quaternion.w * ty + quaternion.z * tx - quaternion.x * tz,
        vector.z + quaternion.w * tz + quaternion.x * ty - quaternion.y * tx
      );
    }

    inverseRotateVector(vector, quaternion) {
      return this.rotateVector(vector, new BABYLON.Quaternion(-quaternion.x, -quaternion.y, -quaternion.z, quaternion.w));
    }

    mazeLocalToWorld(localPosition) {
      return this.rotateVector(localPosition, this.mazePose.rotation).add(this.mazePose.origin);
    }

    worldToMazeLocal(worldPosition) {
      return this.inverseRotateVector(worldPosition.subtract(this.mazePose.origin), this.mazePose.rotation);
    }

    limitBallRise() {
      if (!this.ready || !this.ballAggregate) return;
      const velocity = this.ballAggregate.body.getLinearVelocity();
      if (!velocity) return;
      const mazeUp = this.rotateVector(new BABYLON.Vector3(0, 1, 0), this.mazePose.rotation).normalize();
      const upwardSpeed = BABYLON.Vector3.Dot(velocity, mazeUp);
      if (upwardSpeed <= MAX_UPWARD_SPEED) return;
      velocity.subtractInPlace(mazeUp.scale(upwardSpeed - MAX_UPWARD_SPEED));
      this.ballAggregate.body.setLinearVelocity(velocity);
    }

    setOrientation(xDegrees, yDegrees, headingDegrees = 0) {
      if (!this.ready) return;
      const x = Math.max(-35, Math.min(35, xDegrees)) * DEG;
      const y = Math.max(-35, Math.min(35, yDegrees)) * DEG;
      const heading = Math.max(-180, Math.min(180, headingDegrees)) * DEG;
      this.mazeRotation.copyFrom(
        BABYLON.Quaternion.RotationYawPitchRoll(-heading, -y, -x)
      );
      // 姿勢変化時に、静止したボールを起こして動く迷路との衝突を反映させる。
      this.ballAggregate.body.applyImpulse(new BABYLON.Vector3(0, -1e-8, 0), this.ball.getAbsolutePosition());
    }

    setMotion(xAcceleration, yAcceleration) {
      if (!this.ready || this.outOfBounds) return;
      const deadZone = 0.18;
      const x = Math.abs(xAcceleration) < deadZone ? 0 : xAcceleration;
      const y = Math.abs(yAcceleration) < deadZone ? 0 : yAcceleration;
      this.motionInput.x = Math.max(-15, Math.min(15, x));
      this.motionInput.z = Math.max(-15, Math.min(15, -y));
    }

    updateMazeMotion(deltaSeconds) {
      if (!this.ready || !this.camera) return;
      const accelerationGain = 24;
      const drag = Math.exp(-1.2 * deltaSeconds);
      const worldAcceleration = this.rotateVector(
        new BABYLON.Vector3(this.motionInput.x, 0, this.motionInput.z),
        this.mazeRotation
      );
      // 端末の平行移動は画面内の慣性だけに使い、迷路を上下させてボールを跳ね上げない。
      worldAcceleration.y = 0;
      this.mazeVelocity.x = (this.mazeVelocity.x + worldAcceleration.x * accelerationGain * deltaSeconds) * drag;
      this.mazeVelocity.z = (this.mazeVelocity.z + worldAcceleration.z * accelerationGain * deltaSeconds) * drag;
      this.mazeVelocity.x = Math.max(-36, Math.min(36, this.mazeVelocity.x));
      this.mazeVelocity.y = 0;
      this.mazeVelocity.z = Math.max(-36, Math.min(36, this.mazeVelocity.z));
      this.mazeOffset.x = Math.max(-48, Math.min(48, this.mazeOffset.x + this.mazeVelocity.x * deltaSeconds));
      this.mazeOffset.y = 0;
      this.mazeOffset.z = Math.max(-56, Math.min(56, this.mazeOffset.z + this.mazeVelocity.z * deltaSeconds));

      for (const item of this.movableBodies) {
        const rotatedPosition = this.rotateVector(item.basePosition, this.mazeRotation);
        item.targetPosition.set(
          rotatedPosition.x + this.mazeOffset.x,
          rotatedPosition.y + this.mazeOffset.y,
          rotatedPosition.z + this.mazeOffset.z
        );
        item.body.setTargetTransform(item.targetPosition, this.mazeRotation);
      }

      const anchorItem = this.movableBodies[0];
      const actualRotation = this.mazeAnchor.rotationQuaternion || this.mazeRotation;
      const rotatedAnchorBase = this.rotateVector(anchorItem.basePosition, actualRotation);
      this.mazePose.origin.set(
        this.mazeAnchor.position.x - rotatedAnchorBase.x,
        this.mazeAnchor.position.y - rotatedAnchorBase.y,
        this.mazeAnchor.position.z - rotatedAnchorBase.z
      );
      this.mazePose.rotation.copyFrom(actualRotation);

      for (const item of this.mazeVisuals) {
        const worldPosition = this.mazeLocalToWorld(item.basePosition);
        item.mesh.position.copyFrom(worldPosition);
        item.mesh.rotationQuaternion = item.mesh.rotationQuaternion || BABYLON.Quaternion.Identity();
        item.mesh.rotationQuaternion.copyFrom(this.mazePose.rotation);
      }

      this.camera.position.copyFrom(this.mazeLocalToWorld(this.cameraLocalPosition));
      this.camera.upVector.copyFrom(this.rotateVector(this.cameraLocalUp, this.mazePose.rotation).normalize());
      this.camera.setTarget(this.mazePose.origin);
      this.light.direction.copyFrom(this.rotateVector(this.lightLocalDirection, this.mazePose.rotation).normalize());
    }

    reset() {
      if (!this.ready || !this.ballAggregate) return;
      this.goalReached = false;
      this.outOfBounds = false;
      this.startedAt = performance.now();
      this.motionInput = { x: 0, z: 0 };
      this.mazeVelocity = { x: 0, y: 0, z: 0 };
      this.onGoal("");
      this.ballAggregate.body.setLinearVelocity(BABYLON.Vector3.Zero());
      this.ballAggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
      this.ball.position.copyFrom(this.mazeLocalToWorld(new BABYLON.Vector3(this.startLocal.x, 0.75, this.startLocal.z)));
      this.ball.computeWorldMatrix(true);
      this.ballAggregate.body.disablePreStep = false;
      window.setTimeout(() => {
        if (this.ballAggregate?.body) this.ballAggregate.body.disablePreStep = true;
      }, 0);
    }
  }

  window.BallScene = BallScene;
})();
