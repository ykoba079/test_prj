# 学習プログラムの配置

公開しているプログラムには、ミカンの画像と正解ラベルを使って学習し、ONNXモデルへ変換するプログラムが入っています。
Python本体、ライブラリ、YOLOの元ソースと事前学習重み、学習画像は含みません。ライブラリ等は環境準備のコマンドで取得します。

## 1. GitHubからプログラムを取得する

事前にGit for WindowsとPython 3.10をインストールしてください。
ソース：[yolo-camera](https://github.com/ykoba079/test_prj/tree/main/yolo-camera)

保存先にしたいフォルダをエクスプローラーで開き、アドレスバーに `powershell` と入力してEnterを押します。
以下を1行ずつ実行します。新しく `mikan-yolo` フォルダを作り、このデモに必要な `yolo-camera` を取得します。

```powershell
git clone --depth 1 --filter=blob:none --sparse https://github.com/ykoba079/test_prj.git mikan-yolo
Set-Location mikan-yolo
git sparse-checkout set yolo-camera
```

以後は、この `mikan-yolo` が作業フォルダです。すでに同名のフォルダがある場合は、新しい保存先で始めてください。
プログラムは以下の位置に配置されます。

```text
mikan-yolo/
└─ yolo-camera/
   └─ training/
      ├─ GETTING-STARTED.md
      ├─ requirements.txt
      ├─ classes.json
      ├─ common.py
      ├─ setup_upstream.py
      ├─ prepare_dataset.py
      ├─ train.py
      ├─ export_onnx.py
      └─ evaluate.py
```

## 2. 作業フォルダでPowerShellを開く

上のコマンドを続けて実行している場合は、すでに作業フォルダにいます。別の日に再開するときは、エクスプローラーで `mikan-yolo` を開き、アドレスバーに `powershell` と入力してEnterを押します。

次のコマンドが `True` になることを確認します。

```powershell
Test-Path yolo-camera/training/requirements.txt
```

`False` の場合は、まだ別のフォルダを開いています。取得した `yolo-camera` が直接見える場所へ移動します。

## 3. 環境を準備する

WindowsにPython 3.10をインストールしたうえで、以下を1行ずつ実行します。エラーが出た場合は、その行を解決してから次へ進みます。

```powershell
py -3.10 -m venv yolo-camera/training/.venv
$trainPython = "yolo-camera/training/.venv/Scripts/python.exe"
& $trainPython -m pip install --upgrade pip --index-url https://pypi.org/simple
& $trainPython -m pip install typing-extensions==4.9.0 numpy==1.26.3 --index-url https://pypi.org/simple
& $trainPython -m pip install torch==2.1.2 torchvision==0.16.2 --index-url https://download.pytorch.org/whl/cpu
& $trainPython -m pip install -r yolo-camera/training/requirements.txt --index-url https://pypi.org/simple
& $trainPython yolo-camera/training/setup_upstream.py
```

`setup_upstream.py` が、固定したMIT版YOLOv9のソースと事前学習重みを取得します。

## 4. 自分の画像と正解ラベルを配置する

プログラムとは別に、以下のデータを用意します。名前は例です。

```text
yolo-camera/training/data/labeled-manual/
├─ images/
│  ├─ train/mikan001.png
│  ├─ val/mikan081.png
│  └─ test/mikan091.png
└─ labels/
   ├─ train/mikan001.txt
   ├─ val/mikan081.txt
   └─ test/mikan091.txt
```

同じ名前の画像とテキストを対応させます。検出対象のラベルは `mikan` 1種類、番号は `0`。テキストはYOLOの物体検出形式です。
ミカンがない画像には同名の空のテキストを用意します。
CVATのZIPを展開しただけでは上の配置と異なるため、画像とテキストを用途ごとに振り分けて配置します。

## 5. データ変換・学習・ONNX変換

以下の入力・出力名は、プログラムを新しく取得した場合の例です。出力先が存在するときは別の名前を指定します。

```powershell
& $trainPython yolo-camera/training/prepare_dataset.py yolo-camera/training/data/labeled-manual yolo-camera/training/data/prepared-manual
& $trainPython yolo-camera/training/train.py yolo-camera/training/data/prepared-manual --output yolo-camera/training/runs/mikan-manual-320 --epochs 25 --size 320 --batch 4 --device cpu
& $trainPython yolo-camera/training/export_onnx.py yolo-camera/training/runs/mikan-manual-320/best.pt --output yolo-camera/models/mikan-manual
& $trainPython yolo-camera/training/evaluate.py yolo-camera/models/mikan-manual/model.json yolo-camera/training/data/prepared-manual --output yolo-camera/training/runs/mikan-manual-320/test --confidence 0.4
```

ONNX変換後の `yolo-camera/models/mikan-manual/` に、`mikan.onnx`、`model.json`、ライセンス文、変換の確認記録ができます。
取得した `yolo-camera` には画像検出のHTMLデモも含まれます。ブラウザーで試す場合は、作業フォルダで `py -3.10 yolo-camera/serve.py` を実行し、以下を開きます。

http://127.0.0.1:8002/yolo-camera/detectsample_camera_yolo.html?model=models/mikan-manual/model.json

このURLは自分のPCでサーバーを起動している間に利用できます。画面の「画像で試す」から、評価用の元画像を選択します。
