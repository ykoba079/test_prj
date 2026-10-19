# YOLOv9 カメラ物体検出デモ

入口: `detectsample_camera_yolo.html`。既存のCOCO-SSD版はそのまま残しています。

## 起動

リポジトリのルートで以下を実行します。

```powershell
python yolo-camera/serve.py
```

PCで `http://127.0.0.1:8002/yolo-camera/detectsample_camera_yolo.html` を開きます。
専用サーバーは `.mjs` をJavaScriptとして配信します。Windowsの標準 `python -m http.server` では環境によって `text/plain` になり、WASMエンジンの読み込みが失敗します。
「カメラ開始」で許可すると検出します。「画像で試す」ならカメラなしでも利用できます。
スマートフォンから使う際はHTTPSでホストしてください。ファイルをダブルクリックする `file://` 起動には対応しません。
初回の読み込みにはモデル約8.5 MBとWASM約11.2 MBが必要です。
映像のアップロード処理はありません。WASMを1スレッドで実行するため、COOP/COEPヘッダーは不要です。
ページを非表示にしたときはカメラを停止します。

## モデルと出典

- モデル: LibreYOLO9t ONNX。MultimediaTechLab/YOLOのMIT版 `v9-t.pt` 由来。
- 配布元: https://huggingface.co/LibreYOLO/LibreYOLO9t
- 固定リビジョン: `models/source.json`。同梱したモデルカードとMITライセンスも参照。
- ONNX Runtime Web 1.22.0、WASM専用ビルド。`vendor/ort.min.js` の配布元ファイル名は `ort.wasm.min.js`。
- vendor配布元: `https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/`
- COCOクラス順: https://github.com/MultimediaTechLab/YOLO/blob/main/yolo/config/dataset/coco.yaml

## 独自学習モデルへの差し替え

`model.json` でモデル名、ONNXファイル、入力サイズ、クラス名の配列、座標形式を指定します。
URLはこのJSONの場所を基準に解決します。

対応する入出力契約:

- 入力: RGB / float32 / 0～1 / `[1,3,H,W]`。縦横比を維持し、余白を114で埋めるletterbox。
- 出力: NMS前の `[1,4+C,N]` または `[1,N,4+C]`。先頭4値は座標、続くC値はクラスごとの確率。
- 座標は入力画像のピクセル単位。`boxFormat` は `xyxy` または `cxcywh`。
- objectnessを別に出すモデル、NMS内蔵モデル、マスク出力モデルは変換処理の追加が必要です。
- クラス名は必ず学習時のクラスID順に指定します。

今回のモデルはCOCO 80種類の汎用検出用です。`orange` はミカン専用でも品質判定用でもありません。
後のミカン学習では、何に枠を付けるかを先に決めます。

1. ミカン全体を分類する場合: `normal_mikan`, `moldy_mikan`, `damaged_mikan` など。同じ実にカビと傷がある場合のラベル規則を決める必要があります。
2. 欠陥の位置も示す場合: `mikan`, `mold`, `damage` とし、実全体と欠陥部分に別々の枠を付けます。

欠陥の面積や輪郭まで測る場合はセグメンテーションが候補となり、この物体検出ページの拡張が必要です。
学習・評価用の写真は実物単位で分離し、同じミカンを撮った連写が両方に混ざらないようにします。

## 検証

```powershell
node --check yolo-camera/app.js
node yolo-camera/verify.cjs
```

共有の座標変換・クラス別NMSと、同梱WASMエンジンによる実モデル推論を確認します。
`tmp/yolo-input.bin` と `tmp/yolo-geometry.json` があればバス画像の検出も確認します。
これらがない環境ではゼロ入力によるモデル実行を確認します。
カメラ権限と速度は実際のブラウザー・端末で確認してください。
