# Fluid Lab / 流体実験室

Babylon.js **9.26.1** のFluid Rendererを使った静的なデモページです。
サイトの `fluid-lab/` を開いて利用できます。ビルドは不要です。

## ローカルで開く

リポジトリのルートで `python -m http.server 8000` を実行し、
`http://localhost:8000/fluid-lab/` を開きます。
Babylon.jsはバージョンを固定したjsDelivr CDNから読み込むため、インターネット接続が必要です。
直接HTMLを開く場合はWeb Workerを使わずメインスレッドで計算します。

## 操作

- 水槽への落下：球・箱、大きさ、高さ、横方向の位置を選んで落下。最大8個。
- ダム崩壊：仕切りを外し、水が広がる様子を観察。
- 操作パネル上部の「水槽に落とす」「リセット」で実験を操作。
- 水量・計算品質は標準、粘性は水に近い値（8）に固定。液体表示・通常速度で再生。
- ドラッグで視点を回転、ホイールまたはピンチで拡大。

## 実装と制約

`solver.js` は固定時間刻み（1/90秒）、空間格子による近傍探索、
3回の密度拘束補正、XSPHによる速度平滑化を行う簡易PBF実装です。
CPUの流体計算をWeb Workerに分離し、位置バッファを描画側へ転送します。
WebGPUは描画に使用し、利用できない環境ではWebGL 2に切り替えます。
`?webgl=1` でWebGL 2を明示的に選べます。
v9.25以降の粒子別サイズバッファを液体描画に使用しています。

物体は重力で落下し、水中では簡易減速します。水の粒子は球・軸に沿った箱に
衝突しますが、流体の力を物体へ返す双方向連成・浮力・箱の回転は未実装です。
水槽側面は上方にも衝突を適用するため、縁からの流出は扱いません。
低解像度のデモ用計算であり、工学的な検証には利用できません。
計算が追いつかない場合はシミュレーションの進行が遅くなることがあります。

参照：
- [Fluid Renderer](https://doc.babylonjs.com/features/featuresDeepDive/particles/fluid_renderer/)
- [Babylon.js 9.26.1](https://github.com/BabylonJS/Babylon.js/releases/tag/9.26.1)
- [Position Based Fluids (Macklin & Müller)](https://mmacklin.com/pbf_sig_preprint.pdf)
