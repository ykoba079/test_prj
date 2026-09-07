"use strict";

/** QR、一次元バーコード、それらの両方に対応する形式一覧。 */
const CODE_FORMATS = Object.freeze({
  qr: ["QRCode", "MicroQRCode", "RMQRCode"],
  barcode: ["EAN13", "EAN8", "UPCA", "UPCE", "Code128", "Code39", "ITF", "ITF14", "Codabar"]
});

/**
 * zxing-wasmのReader版を初期化して画像を解析する。
 * WASMは外部CDNではなく、このデモと同じオリジンから取得する。
 */
class CodeReader {
  constructor(wasmPath) {
    this.wasmPath = wasmPath;
    this.readyPromise = null;
  }

  initialize() {
    if (!window.ZXingWASM) {
      return Promise.reject(new Error("コード解析ライブラリを読み込めませんでした。"));
    }

    if (!this.readyPromise) {
      this.readyPromise = window.ZXingWASM.prepareZXingModule({
        overrides: {
          locateFile: (path, prefix) => path.endsWith(".wasm") ? this.wasmPath : `${prefix}${path}`
        },
        fireImmediately: true
      });
    }
    return this.readyPromise;
  }

  async read(imageData, mode, thorough = false) {
    await this.initialize();

    const formats = mode === "both"
      ? [...CODE_FORMATS.qr, ...CODE_FORMATS.barcode]
      : CODE_FORMATS[mode];

    return window.ZXingWASM.readBarcodes(imageData, {
      formats,
      tryHarder: thorough,
      tryRotate: true,
      tryInvert: true,
      maxNumberOfSymbols: 10,
      returnErrors: false,
      textMode: "HRI"
    });
  }
}

window.CodeReader = CodeReader;
