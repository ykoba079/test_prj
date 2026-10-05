# MIKAN LAB v0.1：画像検査と3Dロボット選別

BabylonJSでミカンを搬送し、真上から描画した画像で良品・カビ・傷を検出して、3Dアームで不良品を取り除く社内ナレッジシェア向けサンプルです。

## バージョン0.1（2026-10-05）

初版として3D搬送、色・連結領域による画像検査、座標変換、アーム排除、専用YOLO ONNXモデルの読込を実装。カビ・傷の検出と排除、良品通過、停止・リセット、モバイル幅の表示を確認済みです。専用モデルでの推論精度は未検証です。

この時点のファイル一式は `releases/mikan-inspection-v0.1.zip` に保存しています。展開後、HTTPサーバー経由で起動できます。CDNライブラリーはアーカイブに含まれません。

今後の検討：実物に近い傷・カビの外観表現、実画像の収集とアノテーション、専用YOLOモデルの学習と品質判定精度の評価。

## 起動

リポジトリーのルートで `python -m http.server 8000` を実行し、http://localhost:8000/mikan-inspection/ を開きます。GitHub Pagesでも静的ファイルとして動きます。BabylonJSとONNX RuntimeはCDNから取得するためインターネット接続が必要です。

## デモの流れ

1. ミカンを良品・カビ・傷の外観でランダム投入します。
2. BabylonJSのRenderTargetTextureと正投影カメラで640×320の検査画像を生成します。
3. 初期モードは画像のオレンジ色の連結領域を検出し、領域内の緑や茶色の面積で不良判定します。ミカン生成時の不良ラベルを判定に渡していません。
4. バウンディングボックスの中心を `x = u / 640 × 12 − 6`、`z = 3 − v / 320 × 6` でワールド座標に戻します。撮影時の各ミカン位置と照合しIDに対応付けます。
5. 不良判定を記憶し、ミカンが排除位置に到達したらアームが排除箱に移します。アームは1個ずつ処理します。排除しきれない場合はログに記録します。

画像解析は教材用ヒューリスティックです。信頼度を持つAI推論ではありません。茎の緑をカビと誤認しないため、最小面積を設定しています。実物・照明変化・見えない裏面の不良には対応しません。

## YOLOへ切り替える

専用モデルは含まれていません。標準COCOモデルだけではミカンのカビ・傷を品質判定できません。実画像をgood / mold / damageの3クラスでアノテーションし、ミカン全体を枠で囲んで学習します。傷部分だけを囲むモデルはこの座標照合方式の対象外です。

UltralyticsのYOLOv8 / YOLO11のdetectモデルを使用する例：

```yaml
# dataset.yaml
path: /absolute/path/to/dataset
train: images/train
val: images/val
names:
  0: good
  1: mold
  2: damage
```

```sh
pip install ultralytics onnx
yolo detect train model=yolo11n.pt data=dataset.yaml imgsz=640 epochs=100
yolo export model=runs/detect/train/weights/best.pt format=onnx imgsz=640 batch=1 dynamic=False nms=False opset=17
```

画面の「YOLOモデルを読み込む」でbest.onnxを選択します。ブラウザー内のONNX Runtime WASMで実際に推論します。入力はRGB / float32 / 0〜1 / NCHW / `[1,3,640,640]`。640×320画像を上下160pxの灰色余白でletterboxします。出力は `[1,7,N]` または `[1,N,7]` のxywh + 3クラス確率を想定。閾値0.45で候補を選び、IoU 0.45のNMSを行います。YOLO26、YOLOv5、seg、NMS組込みモデルなど別の出力仕様は非対応です。

実物の検査へ進む場合は、撮影条件と実運用の速度を合わせ、別撮影日の評価データで良品誤排除率・不良見逃し率・推論時間を検証してください。3D生成画像から実物へ移行するには再学習が必要です。本サンプルのアームは位置補間の可視化で、実機の逆運動学やPLC制御ではありません。

## ファイル

- `app.js`：3Dシーン、検査画像取得、追跡、アーム、ONNX推論
- `vision.js`：画像解析とYOLO出力のデコード・NMS
- `test-browser.cjs`：Edge / Playwrightで不良排除、良品通過、停止、リセット、モバイル幅を確認（Playwrightのパスは環境に合わせて変更）

## 公式資料

- [Ultralytics ONNXエクスポート](https://docs.ultralytics.com/modes/export/)
- [ONNX Runtime Web](https://onnxruntime.ai/docs/get-started/with-javascript/web.html)
