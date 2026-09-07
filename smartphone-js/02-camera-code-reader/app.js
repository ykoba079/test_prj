"use strict";

(() => {
  const MAX_FILE_BYTES = 15 * 1024 * 1024;
  const MAX_SOURCE_DIMENSION = 20000;
  const CAMERA_SCAN_INTERVAL_MS = 350;
  const CAMERA_PROCESSING_MAX_SIDE = 1280;
  const PHOTO_PROCESSING_MAX_SIDE = 1800;
  const MAX_DISPLAY_TEXT_LENGTH = 512;

  const video = document.querySelector("#camera-video");
  const canvas = document.querySelector("#preview-canvas");
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  const scanCanvas = document.createElement("canvas");
  const scanContext = scanCanvas.getContext("2d", { alpha: false, willReadFrequently: true });
  const previewPanel = document.querySelector(".preview-panel");
  const previewMessage = document.querySelector("#preview-message");
  const scanGuide = document.querySelector("#scan-guide");
  const startCameraButton = document.querySelector("#start-camera-button");
  const stopCameraButton = document.querySelector("#stop-camera-button");
  const imageInput = document.querySelector("#image-input");
  const statusChip = document.querySelector(".status-chip");
  const statusText = document.querySelector("#status-text");
  const resultCount = document.querySelector("#result-count");
  const resultList = document.querySelector("#result-list");
  const modeInputs = [...document.querySelectorAll('input[name="scan-mode"]')];

  const camera = new window.CameraController(video);
  const reader = new window.CodeReader("./vendor/zxing-wasm/zxing_reader.wasm");

  let sourceType = "none";
  let photoImage = null;
  let animationFrameId = 0;
  let scanTimerId = 0;
  let scanBusy = false;
  let detections = [];

  function currentMode() {
    return modeInputs.find((input) => input.checked)?.value ?? "qr";
  }

  function setStatus(message, state = "idle") {
    statusText.textContent = message;
    statusChip.classList.toggle("is-live", state === "live");
    statusChip.classList.toggle("is-busy", state === "busy");
    statusChip.classList.toggle("is-error", state === "error");
  }

  function setPreviewActive(active) {
    previewPanel.classList.toggle("is-active", active);
    previewMessage.classList.toggle("is-hidden", active);
  }

  function scaledSize(width, height, maxSide) {
    const scale = Math.min(1, maxSide / Math.max(width, height));
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale))
    };
  }

  function resizeCanvases(width, height) {
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    if (scanCanvas.width !== width || scanCanvas.height !== height) {
      scanCanvas.width = width;
      scanCanvas.height = height;
    }
  }

  function drawDetection(result, index) {
    const points = [
      result.position.topLeft,
      result.position.topRight,
      result.position.bottomRight,
      result.position.bottomLeft
    ];
    if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return;

    const lineWidth = Math.max(3, Math.round(Math.min(canvas.width, canvas.height) / 180));
    context.save();
    context.strokeStyle = "#d7ff4f";
    context.lineWidth = lineWidth;
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    context.closePath();
    context.stroke();

    const badgeRadius = Math.max(13, lineWidth * 3);
    context.fillStyle = "#d7ff4f";
    context.beginPath();
    context.arc(points[0].x, points[0].y, badgeRadius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#142000";
    context.font = `900 ${Math.round(badgeRadius * 1.05)}px sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(index + 1), points[0].x, points[0].y);
    context.restore();
  }

  function drawSource(source) {
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    detections.forEach(drawDetection);
  }

  function renderResults(results) {
    resultList.replaceChildren();
    resultCount.textContent = `${results.length}件`;

    if (results.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty-result";
      empty.textContent = "コードはまだ見つかっていません。";
      resultList.append(empty);
      return;
    }

    results.forEach((result, index) => {
      const item = document.createElement("li");
      item.className = "result-item";

      const number = document.createElement("span");
      number.className = "result-number";
      number.textContent = String(index + 1);

      const body = document.createElement("div");
      body.className = "result-body";
      const format = document.createElement("p");
      format.className = "result-format";
      format.textContent = result.format;
      const value = document.createElement("p");
      value.className = "result-text";
      value.textContent = safeDisplayText(result.text);
      body.append(format, value);

      const copyButton = document.createElement("button");
      copyButton.className = "copy-button";
      copyButton.type = "button";
      copyButton.textContent = "コピー";
      copyButton.addEventListener("click", () => copyResult(result.text, copyButton));

      item.append(number, body, copyButton);
      resultList.append(item);
    });
  }

  function safeDisplayText(value) {
    const text = String(value ?? "");
    return text.length > MAX_DISPLAY_TEXT_LENGTH
      ? `${text.slice(0, MAX_DISPLAY_TEXT_LENGTH)}…`
      : text;
  }

  async function copyResult(text, button) {
    try {
      await navigator.clipboard.writeText(String(text));
      button.textContent = "コピー済み";
      window.setTimeout(() => { button.textContent = "コピー"; }, 1200);
    } catch {
      setStatus("クリップボードへコピーできませんでした", "error");
    }
  }

  async function analyzeCurrentFrame(thorough = false) {
    if (scanBusy || sourceType === "none") return;
    scanBusy = true;

    try {
      const source = sourceType === "camera" ? video : photoImage;
      scanContext.drawImage(source, 0, 0, scanCanvas.width, scanCanvas.height);
      const imageData = scanContext.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
      detections = await reader.read(imageData, currentMode(), thorough);
      renderResults(detections);
      setStatus(detections.length ? `${detections.length}件読み取りました` : "コードを探しています", "live");

      if (sourceType === "photo" && photoImage) {
        drawSource(photoImage);
      }
    } catch (error) {
      console.error(error);
      setStatus("コードの解析に失敗しました", "error");
    } finally {
      scanBusy = false;
    }
  }

  function cameraRenderLoop() {
    if (sourceType !== "camera" || !camera.isActive) return;
    drawSource(video);
    animationFrameId = requestAnimationFrame(cameraRenderLoop);
  }

  function scheduleCameraScan() {
    window.clearTimeout(scanTimerId);
    if (sourceType !== "camera" || !camera.isActive) return;

    scanTimerId = window.setTimeout(async () => {
      await analyzeCurrentFrame(false);
      scheduleCameraScan();
    }, CAMERA_SCAN_INTERVAL_MS);
  }

  function stopCamera({ showMessage = true } = {}) {
    camera.stop();
    cancelAnimationFrame(animationFrameId);
    window.clearTimeout(scanTimerId);
    animationFrameId = 0;
    scanTimerId = 0;

    if (sourceType === "camera") {
      sourceType = "none";
      detections = [];
      renderResults([]);
      setPreviewActive(false);
      if (showMessage) {
        previewMessage.textContent = "カメラを停止しました";
        setStatus("カメラを停止しました");
      }
    }
    startCameraButton.disabled = false;
    stopCameraButton.disabled = true;
  }

  async function startCamera() {
    startCameraButton.disabled = true;
    setStatus("カメラの利用許可を確認しています", "busy");

    try {
      photoImage = null;
      await camera.start();
      const size = scaledSize(video.videoWidth, video.videoHeight, CAMERA_PROCESSING_MAX_SIDE);
      resizeCanvases(size.width, size.height);
      sourceType = "camera";
      detections = [];
      renderResults([]);
      previewMessage.textContent = "カメラを起動するか、写真を選択してください";
      setPreviewActive(true);
      stopCameraButton.disabled = false;
      setStatus("カメラでコードを探しています", "live");
      cameraRenderLoop();
      scheduleCameraScan();
    } catch (error) {
      console.error(error);
      startCameraButton.disabled = false;
      stopCameraButton.disabled = true;
      setPreviewActive(false);
      previewMessage.textContent = "カメラを利用できません。許可設定を確認するか、写真を選択してください。";
      setStatus("カメラを利用できません", "error");
    }
  }

  function validateImageFile(file) {
    if (!file.type.startsWith("image/")) {
      throw new Error("画像ファイルを選択してください。");
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new Error("15MB以下の画像を選択してください。");
    }
  }

  async function loadPhoto(file) {
    stopCamera({ showMessage: false });
    validateImageFile(file);
    setStatus("写真を読み込んでいます", "busy");

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    try {
      await new Promise((resolve, reject) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", () => reject(new Error("画像を読み込めませんでした。")), { once: true });
        image.src = objectUrl;
      });

      if (image.naturalWidth > MAX_SOURCE_DIMENSION || image.naturalHeight > MAX_SOURCE_DIMENSION) {
        throw new Error("画像の解像度が大きすぎます。");
      }

      const size = scaledSize(image.naturalWidth, image.naturalHeight, PHOTO_PROCESSING_MAX_SIDE);
      resizeCanvases(size.width, size.height);
      sourceType = "photo";
      photoImage = image;
      detections = [];
      setPreviewActive(true);
      drawSource(image);
      setStatus("写真からコードを探しています", "busy");
      await analyzeCurrentFrame(true);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  startCameraButton.addEventListener("click", startCamera);
  stopCameraButton.addEventListener("click", () => stopCamera());

  imageInput.addEventListener("change", async () => {
    const [file] = imageInput.files;
    imageInput.value = "";
    if (!file) return;

    try {
      await loadPhoto(file);
    } catch (error) {
      console.error(error);
      setPreviewActive(false);
      previewMessage.textContent = error.message || "写真を読み込めませんでした。";
      setStatus(error.message || "写真を読み込めませんでした", "error");
    }
  });

  modeInputs.forEach((input) => {
    input.addEventListener("change", async () => {
      scanGuide.dataset.mode = currentMode();
      detections = [];
      renderResults([]);
      if (sourceType === "photo") {
        drawSource(photoImage);
        setStatus("選択した形式で解析しています", "busy");
        await analyzeCurrentFrame(true);
      } else if (sourceType === "camera") {
        setStatus("選択した形式でコードを探しています", "live");
      }
    });
  });

  window.addEventListener("pagehide", () => stopCamera({ showMessage: false }));
})();
