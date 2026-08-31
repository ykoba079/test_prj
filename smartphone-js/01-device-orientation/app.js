(function () {
  "use strict";

  const $ = (selector) => document.querySelector(selector);

  // DOM参照を一か所に集約し、センサー処理と表示更新を分離する。
  const elements = {
    status: $("#sensor-status"),
    statusDot: $("#status-dot"),
    overlay: $("#start-overlay"),
    calibrate: $("#calibrate-button"),
    alpha: $("#alpha-value"), beta: $("#beta-value"), gamma: $("#gamma-value"),
    accelerationX: $("#acceleration-x-value"),
    accelerationY: $("#acceleration-y-value"),
    accelerationZ: $("#acceleration-z-value"),
    screenAngle: $("#screen-angle-value"), reference: $("#reference-label"),
    physicsStatus: $("#physics-status"), resetBall: $("#reset-ball-button"),
    goalMessage: $("#goal-message")
  };

  let latest = null;

  function formatAcceleration(value) {
    return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
  }

  function screenName(angle) {
    if (angle === 90) return "Landscape →";
    if (angle === 270) return "Landscape ←";
    if (angle === 180) return "Portrait ↓";
    return "Portrait ↑";
  }

  function setStatus(kind, message) {
    elements.status.textContent = message;
    elements.statusDot.classList.toggle("is-live", kind === "live");
    elements.statusDot.classList.toggle("is-error", ["denied", "unsupported", "silent"].includes(kind));
  }

  // Androidなど対応ブラウザだけ縦向き固定を試す。
  // 非対応端末では例外を画面へ出さず、そのまま通常表示を継続する。
  async function tryAutoPortraitLock() {
    let enteredFullscreen = false;
    try {
      if (typeof window.screen.orientation?.lock !== "function") return;
      const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
      if (!document.fullscreenElement && !standalone) {
        if (typeof document.documentElement.requestFullscreen !== "function") return;
        await document.documentElement.requestFullscreen({ navigationUI: "hide" });
        enteredFullscreen = true;
      }
      await window.screen.orientation.lock("portrait-primary");
    } catch (error) {
      console.info("Automatic portrait lock was not available.", error);
      if (enteredFullscreen && document.fullscreenElement && typeof document.exitFullscreen === "function") {
        try { await document.exitFullscreen(); } catch (_) { /* 通常表示を継続する */ }
      }
    }
  }

  // 生の姿勢値を表示し、補正後のX/Y/方位は表示せず3D迷路だけへ渡す。
  function update(reading) {
    latest = reading;
    const { raw, x, y, heading, calibrated } = reading;
    elements.alpha.textContent = `${raw.alpha.toFixed(1)}°`;
    elements.beta.textContent = `${raw.beta.toFixed(1)}°`;
    elements.gamma.textContent = `${raw.gamma.toFixed(1)}°`;
    elements.screenAngle.textContent = screenName(reading.screenAngle);
    elements.reference.textContent = calibrated ? "この傾きを水平に設定済み" : "端末の水平を基準";
    elements.calibrate.disabled = false;
    ballScene.setOrientation(x, y, heading);
  }

  const ballScene = new window.BallScene($("#ball-canvas"), {
    onStatus: (message) => { elements.physicsStatus.textContent = message; },
    onGoal: (message) => { elements.goalMessage.textContent = message; }
  });

  const sensor = new window.SensorController({
    onUpdate: update,
    onStatus: setStatus,
    // 加速度3軸は学習用に表示し、画面方向へ変換した値は迷路の慣性表現に使う。
    onMotion: ({ acceleration, available, motionX = 0, motionY = 0 }) => {
      const values = available ? acceleration : null;
      elements.accelerationX.textContent = values ? formatAcceleration(values.x) : "N/A";
      elements.accelerationY.textContent = values ? formatAcceleration(values.y) : "N/A";
      elements.accelerationZ.textContent = values ? formatAcceleration(values.z) : "N/A";
      if (available) ballScene.setMotion(motionX, motionY);
    }
  });

  ballScene.init().then(() => {
    // 3D初期化中にセンサー値を受信していた場合は、最後の姿勢を反映する。
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
  elements.resetBall.addEventListener("click", () => ballScene.reset());
})();
