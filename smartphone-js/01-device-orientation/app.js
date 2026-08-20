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
    manualCenter: $("#manual-center-button"), manualJump: $("#manual-jump-button"),
    startManual: $("#start-manual-button"), acceleration: $("#acceleration-value"),
    motionState: $("#motion-state"), jumpMessage: $("#jump-message")
  };

  let latest = null;
  let jumpIndicatorTimer = 0;

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

  function update(reading) {
    latest = reading;
    const { raw, x, y, calibrated } = reading;
    elements.alpha.textContent = `${raw.alpha.toFixed(1)}°`;
    elements.beta.textContent = `${raw.beta.toFixed(1)}°`;
    elements.gamma.textContent = `${raw.gamma.toFixed(1)}°`;
    elements.tiltX.textContent = formatAngle(x);
    elements.tiltY.textContent = formatAngle(y);
    elements.screenAngle.textContent = reading.source === "manual" ? "Manual input" : screenName(reading.screenAngle);
    elements.reference.textContent = calibrated ? "設定姿勢を基準" : "端末水平を基準";
    elements.calibrate.disabled = false;
    elements.clearCalibration.disabled = !calibrated;
    ballScene.setTilt(x, y);
  }

  const ballScene = new window.BallScene($("#ball-canvas"), {
    onStatus: (message) => { elements.physicsStatus.textContent = message; },
    onGoal: (message) => { elements.goalMessage.textContent = message; }
  });

  function showJump() {
    elements.motionState.textContent = "JUMP!";
    elements.motionState.classList.add("is-jumping");
    elements.jumpMessage.classList.remove("is-visible");
    void elements.jumpMessage.offsetWidth;
    elements.jumpMessage.classList.add("is-visible");
    clearTimeout(jumpIndicatorTimer);
    jumpIndicatorTimer = window.setTimeout(() => {
      elements.motionState.textContent = "READY";
      elements.motionState.classList.remove("is-jumping");
      elements.jumpMessage.classList.remove("is-visible");
    }, 650);
  }

  function jump() {
    if (ballScene.jump()) showJump();
  }

  const sensor = new window.SensorController({
    onUpdate: update,
    onStatus: setStatus,
    onMotion: ({ magnitude, available, jumpRequested }) => {
      elements.acceleration.textContent = available ? magnitude.toFixed(1) : "--";
      if (!available) elements.motionState.textContent = "N/A";
      else if (jumpRequested) jump();
      else if (!elements.motionState.classList.contains("is-jumping")) elements.motionState.textContent = "READY";
    }
  });

  ballScene.init().then(() => {
    if (latest) ballScene.setTilt(latest.x, latest.y);
  });

  async function startSensor(event) {
    const button = event.currentTarget;
    button.disabled = true;
    const started = await sensor.start();
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
  elements.manualJump.addEventListener("click", () => jump());
})();
