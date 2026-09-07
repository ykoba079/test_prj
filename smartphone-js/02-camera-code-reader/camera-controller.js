"use strict";

/**
 * カメラの権限要求、開始、停止を一か所にまとめる。
 * 画面を離れたときにもMediaStreamのトラックを確実に停止する。
 */
class CameraController {
  constructor(videoElement) {
    this.video = videoElement;
    this.stream = null;
  }

  get isActive() {
    return Boolean(this.stream?.getVideoTracks().some((track) => track.readyState === "live"));
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("このブラウザはカメラ機能に対応していません。");
    }

    this.stop();

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });

    this.video.srcObject = this.stream;
    await new Promise((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("カメラ映像を開始できませんでした。"));
      };
      const cleanup = () => {
        this.video.removeEventListener("loadedmetadata", onReady);
        this.video.removeEventListener("error", onError);
      };
      this.video.addEventListener("loadedmetadata", onReady, { once: true });
      this.video.addEventListener("error", onError, { once: true });
    });
    await this.video.play();
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
    }
    this.stream = null;
    this.video.pause();
    this.video.srcObject = null;
  }
}

window.CameraController = CameraController;
