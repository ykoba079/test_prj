# Babylon.js コードだけで作る自然ドキュメンタリー

Babylon.js のプリミティブ、カスタムメッシュ、シェーダー、マテリアル、頂点アニメーションだけで作る自然風景サンプルです。

## ファイル

- `index.html`: GitHub Pages でそのまま表示できるHTMLページ
- `documentary-nature.js`: シーン生成、地形、海、川、森、空、雲、霧、鳥、カメラアニメーション
- `.nojekyll`: GitHub Pages のJekyll処理を無効化するための空ファイル

## 表示方法

このフォルダの中身をGitHub Pagesで公開するブランチ、または `docs/` フォルダに配置してください。

リポジトリ直下に置く場合:

```text
index.html
documentary-nature.js
.nojekyll
README.md
```

サブフォルダとして置く場合:

```text
babylon-code-nature-documentary/
  index.html
  documentary-nature.js
  .nojekyll
  README.md
```

サブフォルダで公開した場合のURL例:

```text
https://ユーザー名.github.io/リポジトリ名/babylon-code-nature-documentary/
```

Babylon.js本体と一部テクスチャはHTTPSのCDNから読み込みます。
