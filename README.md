# ものがたり英単語（Story Eitango）

英検の級に合わせた単語と熟語を、連続ストーリーの例文で覚える無料の単語学習アプリです。

**▶ サイト: https://hiro0149.github.io/story-eitango/**

- 準2級「放課後ミステリー英単語」（ストーリー「7番ロッカー」全100話・単語 約1,250・熟語 約350）
- タップで意味と発音／音声読み上げ／単語クイズ／覚えたかの記録
- 無料・登録不要・広告なし。学習記録は端末のブラウザ内にだけ保存されます

## 構成
- `index.html` … トップページ（級・ストーリーの一覧）
- `locker7.html` … 準2級アプリ本体
- `engine/` … 学習エンジン（ストーリーに依存しない共通部分）
- `packs/<id>/` … ストーリーごとのデータ（pack.json・挿絵・BGM）
- `tools/` … パック作成・検査・1ファイル版作成のスクリプト（Node.js）

ローカルで動かす場合: `node tools/serve.mjs` を実行し、表示されたアドレスを開きます。
オフライン用の1ファイル版: `node tools/build-standalone.mjs out.html`

## ライセンス・クレジット
- プログラム（engine/・tools/）は MIT License（LICENSE を参照）
- ストーリー本文・挿絵・BGM はライセンスの対象外です（© 2026 Front Softworks／各権利者）。無断転載・再配布はご遠慮ください
- 単語の選定: The CEFR-J Wordlist Version 1.5. Compiled by Yukio Tono, Tokyo University of Foreign Studies.
- 英検®は、公益財団法人 日本英語検定協会の登録商標です。このアプリは、協会の承認や推奨を受けたものではありません
- 挿絵は AI で作成しています

© 2026 Front Softworks
