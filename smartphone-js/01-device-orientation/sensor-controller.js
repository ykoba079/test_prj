(function () {
  "use strict";

  const DEG = Math.PI / 180;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function circularDelta(current, previous) {
    // 359°→0°のような境界でも、最短方向の差分を返す。
    return ((current - previous + 540) % 360) - 180;
  }

  class SensorController {
    constructor({ onUpdate, onStatus, onMotion }) {
      this.onUpdate = onUpdate;
      this.onStatus = onStatus;
      this.onMotion = onMotion;
      this.reference = null;
      this.filtered = null;
      this.lastReading = null;
      this.listening = false;
      this.eventTimeout = 0;
      this.receivedSensorReading = false;
      this.filterStrength = 0.18;
      this.motionListening = false;
      this.gravityEstimate = null;
      this.filteredMotion = 0;
      this.alphaOrigin = null;
      this.handleOrientation = this.handleOrientation.bind(this);
      this.handleMotion = this.handleMotion.bind(this);
      this.handleScreenChange = this.handleScreenChange.bind(this);
    }

    async start() {
      this.receivedSensorReading = false;
      this.onStatus("requesting", "センサーの利用許可を確認しています");

      if (typeof window.DeviceOrientationEvent === "undefined") {
        this.onStatus("unsupported", "この環境では傾きセンサーを利用できません");
        return false;
      }

      // iOS Safariは、クリックなどのユーザー操作中にrequestPermission()を呼ぶ必要がある。
      const orientationPermission = typeof window.DeviceOrientationEvent.requestPermission === "function"
        ? window.DeviceOrientationEvent.requestPermission()
        : Promise.resolve("granted");
      const hasMotion = typeof window.DeviceMotionEvent !== "undefined";
      const motionPermission = hasMotion && typeof window.DeviceMotionEvent.requestPermission === "function"
        ? window.DeviceMotionEvent.requestPermission()
        : Promise.resolve(hasMotion ? "granted" : "unsupported");
      const [orientationResult, motionResult] = await Promise.allSettled([orientationPermission, motionPermission]);

      if (orientationResult.status !== "fulfilled" || orientationResult.value !== "granted") {
        console.warn("Device orientation permission request failed.", orientationResult.reason);
        this.onStatus("denied", "センサーの利用許可を取得できませんでした");
        return false;
      }

      if (!this.listening) {
        window.addEventListener("deviceorientation", this.handleOrientation, true);
        window.addEventListener("orientationchange", this.handleScreenChange);
        if (window.screen.orientation) {
          window.screen.orientation.addEventListener("change", this.handleScreenChange);
        }
        this.listening = true;
      }
      if (!this.motionListening && motionResult.status === "fulfilled" && motionResult.value === "granted") {
        window.addEventListener("devicemotion", this.handleMotion, true);
        this.motionListening = true;
      } else if (!this.motionListening) {
        this.onMotion?.({ magnitude: null, available: false });
      }

      clearTimeout(this.eventTimeout);
      this.eventTimeout = window.setTimeout(() => {
        if (!this.lastReading) {
          this.onStatus("silent", "センサー値を受信できません。もう一度お試しください");
        }
      }, 2500);
      this.onStatus("waiting", "センサー値を待っています");
      return true;
    }

    handleMotion(event) {
      const linear = event.acceleration;
      let values = null;

      if ([linear?.x, linear?.y, linear?.z].every(Number.isFinite)) {
        values = { x: linear.x, y: linear.y, z: linear.z };
      } else {
        // accelerationがない端末では、重力込みの値をローパス処理して重力成分を差し引く。
        const gravity = event.accelerationIncludingGravity;
        if (![gravity?.x, gravity?.y, gravity?.z].every(Number.isFinite)) return;
        if (!this.gravityEstimate) {
          this.gravityEstimate = { x: gravity.x, y: gravity.y, z: gravity.z };
          return;
        }
        const smoothing = 0.14;
        this.gravityEstimate.x += (gravity.x - this.gravityEstimate.x) * smoothing;
        this.gravityEstimate.y += (gravity.y - this.gravityEstimate.y) * smoothing;
        this.gravityEstimate.z += (gravity.z - this.gravityEstimate.z) * smoothing;
        values = {
          x: gravity.x - this.gravityEstimate.x,
          y: gravity.y - this.gravityEstimate.y,
          z: gravity.z - this.gravityEstimate.z
        };
      }

      const magnitude = Math.sqrt(values.x ** 2 + values.y ** 2 + values.z ** 2);
      // 端末座標を画面座標へ直してから渡す。Xは迷路の見た目と合うよう符号を反転する。
      const screenMotion = this.toScreenCoordinates(values.y, values.x);
      this.filteredMotion += (magnitude - this.filteredMotion) * 0.32;
      this.onMotion?.({
        magnitude: this.filteredMotion,
        available: true,
        motionX: -screenMotion.x,
        motionY: screenMotion.y
      });
    }

    handleOrientation(event) {
      if (event.alpha === null && event.beta === null && event.gamma === null) return;

      clearTimeout(this.eventTimeout);
      const raw = {
        alpha: Number.isFinite(event.alpha) ? event.alpha : 0,
        beta: Number.isFinite(event.beta) ? event.beta : 0,
        gamma: Number.isFinite(event.gamma) ? event.gamma : 0
      };
      const screen = this.toScreenCoordinates(raw.beta, raw.gamma);
      this.consume(raw, screen.x, screen.y);
      if (!this.receivedSensorReading) {
        this.receivedSensorReading = true;
        this.onStatus("live", "センサー取得中");
      }
    }

    toScreenCoordinates(beta, gamma) {
      // 縦画面・横画面の回転角を吸収し、常に画面基準の左右(X)・前後(Y)にそろえる。
      const angle = this.getScreenAngle() * DEG;
      return {
        x: gamma * Math.cos(angle) + beta * Math.sin(angle),
        y: beta * Math.cos(angle) - gamma * Math.sin(angle)
      };
    }

    consume(raw, screenX, screenY) {
      // センサーの細かな揺れを一次遅れフィルターで滑らかにする。
      if (!this.filtered) {
        this.filtered = { alpha: raw.alpha, x: screenX, y: screenY };
      } else {
        this.filtered.alpha += circularDelta(raw.alpha, this.filtered.alpha) * this.filterStrength;
        this.filtered.alpha = (this.filtered.alpha + 360) % 360;
        this.filtered.x += (screenX - this.filtered.x) * this.filterStrength;
        this.filtered.y += (screenY - this.filtered.y) * this.filterStrength;
      }

      const x = this.filtered.x - (this.reference?.x ?? 0);
      const y = this.filtered.y - (this.reference?.y ?? 0);
      // alphaは0°/360°をまたぐため、単純な引き算ではなく循環差分を使う。
      if (this.alphaOrigin === null) this.alphaOrigin = this.filtered.alpha;
      const heading = circularDelta(this.filtered.alpha, this.reference?.alpha ?? this.alphaOrigin);
      this.lastReading = {
        raw,
        x: clamp(Math.abs(x) < 0.15 ? 0 : x, -45, 45),
        y: clamp(Math.abs(y) < 0.15 ? 0 : y, -45, 45),
        heading,
        screenAngle: this.getScreenAngle(),
        calibrated: Boolean(this.reference)
      };
      this.onUpdate(this.lastReading);
    }

    calibrate() {
      if (!this.filtered) return false;
      // 現在の姿勢を原点として保存し、以後はその姿勢からの相対角度を返す。
      this.reference = { x: this.filtered.x, y: this.filtered.y, alpha: this.filtered.alpha };
      if (this.lastReading) {
        this.lastReading.x = 0;
        this.lastReading.y = 0;
        this.lastReading.heading = 0;
        this.lastReading.calibrated = true;
        this.onUpdate(this.lastReading);
      }
      this.onStatus("live", "今の角度を0°にしました");
      return true;
    }

    handleScreenChange() {
      this.filtered = null;
      this.reference = null;
      this.alphaOrigin = null;
      this.receivedSensorReading = false;
      this.onStatus("waiting", "画面の向きが変わりました。必要なら今の角度を0°にしてください");
    }

    getScreenAngle() {
      const angle = window.screen.orientation?.angle ?? window.orientation ?? 0;
      return ((Number(angle) % 360) + 360) % 360;
    }
  }

  window.SensorController = SensorController;
})();
