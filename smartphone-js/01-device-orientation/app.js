(function () {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const elements = {
    status: $("#sensor-status"),
    statusDot: $("#status-dot"),
    overlay: $("#start-overlay"),
    calibrate: $("#calibrate-button"),
    clearCalibration: $("#clear-calibration-button"),
    alpha: $("#alpha-value"), beta: $("#beta-value"), gamma: $("#gamma-value"),
    tiltX: $("#tilt-x-value"), tiltY: $("#tilt-y-value"),
    screenAngle: $("#screen-angle-value"), reference: $("#reference-label"),
    physicsStatus: $("#physics-status"), resetBall: $("#reset-ball-button"),
    goalMessage: $("#goal-message"), manualToggle: $("#manual-toggle-button"),
    manualClose: $("#manual-close-button"), manualControls: $("#manual-controls"),
    manualX: $("#manual-x"), manualY: $("#manual-y"),
    manualXOutput: $("#manual-x-output"), manualYOutput: $("#manual-y-output"),
    manualCenter: $("#manual-center-button"),
    startManual: $("#start-manual-button"), acceleration: $("#acceleration-value"),
    motionState: $("#motion-state")
  };

  let latest = null;

  function formatAngle(value) {
    return `${value >= 0 ? "+" : ""}${value.toFixed(1)}°`;
  }

  function screenName(angle) {
    if (angle === 90) return "Landscape →";
    if (angle === 270) return "Landscape ←";
    if (angle === 180) return "Portrait ↓";
    return "Portrait ↑";
  }

  function setStatus(kind, message) {
    elements.status.textContent = message;
    elements.statusDot.classList.toggle("is-live", ["live", "manual"].includes(kind));
    elements.statusDot.classList.toggle("is-error", ["denied", "unsupported", "silent"].includes(kind));
  }

  async function tryAutoPortraitLock() {
    let enteredFullscreen = false;
    try {
      if (typeof window.screen.orientation?.lock !== "function") return false;
      const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
      if (!document.fullscreenElement && !standalone) {
        if (typeof document.documentElement.requestFullscreen !== "function") return false;
        await document.documentElement.requestFullscreen({ navigationUI: "hide" });
        enteredFullscreen = true;
      }
      await window.screen.orientation.lock("portrait-primary");
      return true;
    } catch (error) {
      console.info("Automatic portrait lock was not available.", error);
      if (enteredFullscreen && document.fullscreenElement && typeof document.exitFullscreen === "function") {
        try { await document.exitFullscreen(); } catch (_) { /* 通常表示を継続する */ }
      }
      return false;
    }
  }

  function update(reading) {
    latest = reading;
    const { raw, x, y, heading, calibrated } = reading;
    elements.alpha.textContent = `${raw.alpha.toFixed(1)}°`;
    elements.beta.textContent = `${raw.beta.toFixed(1)}°`;
    elements.gamma.textContent = `${raw.gamma.toFixed(1)}°`;
    elements.tiltX.textContent = formatAngle(x);
    elements.tiltY.textContent = formatAngle(y);
    elements.screenAngle.textContent = reading.source === "manual" ? "Manual input" : screenName(reading.screenAngle);
    elements.reference.textContent = calibrated ? "設定姿勢を基準" : "端末水平を基準";
    elements.calibrate.disabled = false;
    elements.clearCalibration.disabled = !calibrated;
    ballScene.setOrientation(x, y, heading);
  }

  const ballScene = new window.BallScene($("#ball-canvas"), {
    onStatus: (message) => { elements.physicsStatus.textContent = message; },
    onGoal: (message) => { elements.goalMessage.textContent = message; }
  });

  const sensor = new window.SensorController({
    onUpdate: update,
    onStatus: setStatus,
    onMotion: ({ magnitude, available, motionX = 0, motionY = 0 }) => {
      elements.acceleration.textContent = available ? magnitude.toFixed(1) : "--";
      if (available) ballScene.setMotion(motionX, motionY);
      if (!available) elements.motionState.textContent = "N/A";
      else {
        if (magnitude <= 0.8) elements.motionState.textContent = "READY";
        else if (Math.abs(motionX) >= Math.abs(motionY)) elements.motionState.textContent = motionX >= 0 ? "MOVE →" : "MOVE ←";
        else elements.motionState.textContent = motionY >= 0 ? "MOVE ↑" : "MOVE ↓";
      }
    }
  });

  ballScene.init().then(() => {
    if (latest) ballScene.setOrientation(latest.x, latest.y, latest.heading);
  });

  async function startSensor(event) {
    const button = event.currentTarget;
    button.disabled = true;
    // どちらも開始ボタンのユーザー操作中に呼び出し、対応端末だけ縦固定する。
    const sensorPromise = sensor.start();
    void tryAutoPortraitLock();
    const started = await sensorPromise;
    button.disabled = false;
    if (started) {
      await ballScene.init();
      ballScene.reset();
      elements.overlay.classList.add("is-hidden");
    }
  }

  document.querySelectorAll("[data-start-sensor]").forEach((button) => button.addEventListener("click", startSensor));
  elements.calibrate.addEventListener("click", () => sensor.calibrate());
  elements.clearCalibration.addEventListener("click", () => sensor.clearCalibration());
  elements.resetBall.addEventListener("click", () => ballScene.reset());

  function updateManual() {
    const x = Number(elements.manualX.value);
    const y = Number(elements.manualY.value);
    elements.manualXOutput.textContent = formatAngle(x);
    elements.manualYOutput.textContent = formatAngle(y);
    sensor.useManual(x, y);
  }

  function setManualOpen(open) {
    elements.manualControls.hidden = !open;
    elements.manualToggle.setAttribute("aria-expanded", String(open));
    if (open) updateManual();
  }

  elements.manualToggle.addEventListener("click", () => setManualOpen(elements.manualControls.hidden));
  elements.manualClose.addEventListener("click", () => setManualOpen(false));
  elements.startManual.addEventListener("click", async () => {
    await ballScene.init();
    ballScene.reset();
    elements.overlay.classList.add("is-hidden");
    setManualOpen(true);
  });
  elements.manualX.addEventListener("input", updateManual);
  elements.manualY.addEventListener("input", updateManual);
  elements.manualCenter.addEventListener("click", () => {
    elements.manualX.value = "0";
    elements.manualY.value = "0";
    updateManual();
  });
})();
