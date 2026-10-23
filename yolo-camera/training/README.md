# ミカンを学習してYOLOで検出する

画像と正解ラベルを用意し、MIT版YOLOv9-Tの追加学習、ONNX変換、評価まで実行するプログラムです。

**最初に [取得・配置・実行の手順](GETTING-STARTED.md) を参照してください。**

Windows / Python 3.10、CPUでの学習を確認しています。モデルは1クラス `mikan` を検出します。

| ファイル | 処理 |
|---|---|
| setup_upstream.py | 固定したMIT版YOLOv9ソースと事前学習重みの取得 |
| prepare_dataset.py | 画像・ラベルの検査と学習用形式への変換 |
| train.py | 学習と、検証成績に基づくモデル選択 |
| export_onnx.py | ブラウザー用ONNXモデルへの変換と出力の比較 |
| evaluate.py | 未使用のtest画像による評価と結果画像の保存 |
| evaluation_review.py | 評価画像一覧の作成 |
| review_dataset.py | 合成画像の生成記録がある場合のデータ検査・確認ページ作成 |
| summarize_run.py | 学習ログからグラフを作成 |
| test_pipeline.py | データ変換の検査 |
| common.py / classes.json / requirements.txt | 共通処理、クラス名、依存ライブラリ |

## 使用するYOLO

[MultimediaTechLab/YOLO](https://github.com/MultimediaTechLab/YOLO) のMIT版を使用します。
ソースのコミットは `c4cb5f6f56102eceeaa7d75e23e1125cd0373eaf` に固定し、取得した事前学習重みのチェックサムを確認します。

今回の固定実装は枠を頂点列として読み込むため、一般的なYOLOの物体検出ラベル（class_id, center_x, center_y, width, height）をprepare_dataset.pyで長方形の4頂点に変換します。
枠は見えている範囲で統一してください。変換は輪郭検出用の学習を意味するものではありません。

## データと出力先

自分の画像や正解ラベルは `data/`、学習結果は `runs/` に配置します。
これらのフォルダと、仮想環境・取得したYOLOソースはGitの対象外です。学習済みモデルの出力先も毎回新しいフォルダを指定します。
学習データはこのリポジトリに含めていません。

検証成績に基づき選んだモデルがbest.ptです。test画像は学習やモデル選びには使わず、最後の評価に使用します。

## 検査コマンド

環境を準備した後、作業フォルダで実行します。

```powershell
& $trainPython -m unittest discover -s yolo-camera/training -p test_pipeline.py
```
