# Smartphone × JavaScript #2 — Camera Code Reader

スマートフォンのWebブラウザからカメラまたは写真を利用し、QRコードと一次元バーコードを読み取るデモです。

## 公開予定URL

https://ykoba079.github.io/test_prj/smartphone-js/02-camera-code-reader/

`index.html`をHTTPSまたはlocalhostで開いて使用します。カメラの利用にはHTTPSが必要です。

## 実装予定

- カメラの開始・停止
- 画像ライブラリからの写真選択
- QRコードの読み取り
- 一次元バーコードの読み取り
- 1枚の画像に含まれる複数コードの検出
- 検出位置、コード形式、読み取り値の表示
- 画像を外部へ送信しないブラウザ内処理
- `zxing-wasm/reader` 3.1.3の固定バージョンによるローカル配信

## セキュリティ・ライセンス方針

- 読み取ったURLを自動的に開かない
- 読み取り結果はHTMLとして解釈せず、文字列として表示する
- 入力画像のファイルサイズと解像度を制限する
- JavaScriptとWASMは外部CDNから実行時取得せず、このサイト内から配信する
- 使用するOSSの名称、バージョン、ライセンスを`THIRD_PARTY_NOTICES.md`に記録する
