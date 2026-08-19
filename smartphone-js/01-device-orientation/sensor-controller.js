(function () {
  "use strict";

  const DEG = Math.PI / 180;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function circularDelta(current, previous) {
    return ((current - previous + 540) % 360) - 180;
  }

  class SensorController {
    constructor({ onUpdate, onStatus }) {
      this.onUpdate = onUpdate;
      this.onStatus = onStatus;
      this.reference = null;
      this.filtered = null;
      this.lastReading = null;
      this.listening = false;
      this.manual = false;
      this.eventTimeout = 0;
      this.receivedSensorReading = false;
      this.filterStrength = 0.18;
      this.handleOrientation = this.handleOrientation.bind(this);
      this.handleScreenChange = this.handleScreenChange.bind(this);
    }

    async start() {
      this.manual = false;
      this.receivedSensorReading = false;
      this.onStatus("requesting", "センサーの利用許可を確認しています");

      if (typeof window.DeviceOrientationEvent === "undefined") {
        this.onStatus("unsupported", "この環境では端末姿勢を取得できません。手動操作を利用できます");
        return false;
      }

      try {
        if (typeof window.DeviceOrientationEvent.requestPermission === "function") {
          const permission = await window.DeviceOrientationEvent.requestPermission();
          if (permission !== "granted") {
            this.onStatus("denied", "センサーの利用が許可されませんでした");
            return false;
          }
        }
      } catch (error) {
        console.warn("Device orientation permission request failed.", error);
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

      clearTimeout(this.eventTimeout);
      this.eventTimeout = window.setTimeout(() => {
        if (!this.lastReading && !this.manual) {
          this.onStatus("silent", "センサー値を受信できません。手動操作を利用できます");
        }
      }, 2500);
      this.onStatus("waiting", "センサー値を待っています");
      return true;
    }

    handleOrientation(event) {
      if (this.manual || (event.alpha === null && event.beta === null && event.gamma === null)) return;

      clearTimeout(this.eventTimeout);
      const raw = {
        alpha: Number.isFinite(event.alpha) ? event.alpha : 0,
        beta: Number.isFinite(event.beta) ? event.beta : 0,
        gamma: Number.isFinite(event.gamma) ? event.gamma : 0
      };
      const screen = this.toScreenCoordinates(raw.beta, raw.gamma);
      this.consume(raw, screen.x, screen.y, "sensor");
      if (!this.receivedSensorReading) {
        this.receivedSensorReading = true;
        this.onStatus("live", "センサー取得中");
      }
    }

    toScreenCoordinates(beta, gamma) {
      const angle = this.getScreenAngle() * DEG;
      return {
        x: gamma * Math.cos(angle) + beta * Math.sin(angle),
        y: beta * Math.cos(angle) - gamma * Math.sin(angle)
      };
    }

    consume(raw, screenX, screenY, source) {
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
      this.lastReading = {
        raw,
        x: clamp(Math.abs(x) < 0.15 ? 0 : x, -45, 45),
        y: clamp(Math.abs(y) < 0.15 ? 0 : y, -45, 45),
        screenAngle: this.getScreenAngle(),
        calibrated: Boolean(this.reference),
        source
      };
      this.onUpdate(this.lastReading);
    }

    calibrate() {
      if (!this.filtered) return false;
      this.reference = { x: this.filtered.x, y: this.filtered.y };
      if (this.lastReading) {
        this.lastReading.x = 0;
        this.lastReading.y = 0;
        this.lastReading.calibrated = true;
        this.onUpdate(this.lastReading);
      }
      this.onStatus("live", "現在位置を基準に設定しました");
      return true;
    }

    clearCalibration() {
      this.reference = null;
      if (this.filtered && this.lastReading) {
        this.lastReading.x = clamp(this.filtered.x, -45, 45);
        this.lastReading.y = clamp(this.filtered.y, -45, 45);
        this.lastReading.calibrated = false;
        this.onUpdate(this.lastReading);
      }
      this.onStatus(this.manual ? "manual" : "live", this.manual ? "手動操作中" : "基準位置を解除しました");
    }

    useManual(x, y) {
      this.manual = true;
      clearTimeout(this.eventTimeout);
      const raw = { alpha: 0, beta: y, gamma: x };
      this.filtered = { alpha: 0, x, y };
      const relativeX = x - (this.reference?.x ?? 0);
      const relativeY = y - (this.reference?.y ?? 0);
      this.lastReading = {
        raw,
        x: relativeX,
        y: relativeY,
        screenAngle: 0,
        calibrated: Boolean(this.reference),
        source: "manual"
      };
      this.onUpdate(this.lastReading);
      this.onStatus("manual", "手動操作中");
    }

    handleScreenChange() {
      this.filtered = null;
      this.reference = null;
      this.receivedSensorReading = false;
      this.onStatus(this.manual ? "manual" : "waiting", "画面の向きが変わりました。必要に応じて基準を再設定してください");
    }

    getScreenAngle() {
      const angle = window.screen.orientation?.angle ?? window.orientation ?? 0;
      return ((Number(angle) % 360) + 360) % 360;
    }
  }

  window.SensorController = SensorController;
})();
