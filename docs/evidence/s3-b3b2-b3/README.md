# S3-B3B2-B3 Pack Review の画面 — Before / After（合成のスクリーンショット）

S3-B3B2-B3（Project Pack 画面への Pack Review の接続）のレビュー用の画像です。Before は main `5c5a352` の Project Pack 画面
（Pack Review の欄はまだ無い）、After はこの branch の RF-30-01 の commit `e151693`（信頼の文言の本文を 12px・
--text2、集計の見出しを --text2 にした後）を、Chromium で `file://` から開いて撮りました。Before の画像は main のままなので撮り直していません。

- 値はすべて合成です（`tests/fixtures/project-pack/` の合成 fixture と `tests/support/synthetic-pack.js` の合成 Pack）。実案件のデータ・資料は含みません。
- 画面の内容は撮った時点の index.html のものです。計算の値・Evidence / Closure の判定の根拠ではありません（計算済み ≠ 検証済み。Review は正式な案件承認の資料ではありません）。
- 告示 fixture では、詳細に G002、比較に A = G001 / B = G003 を選んでから「Pack Reviewを生成」を押しています。

| 画像 | 内容 |
|---|---|
| `1280x800-pack-after-batch-before.jpg` / `390x844-pack-after-batch-before.jpg` | Before: main で全ケース計算をした後の Pack 画面（派生レポートの欄まで。Review の欄は無い） |
| `1280x800-review-ready-after.jpg` / `390x844-review-ready-after.jpg` | After: 全ケース計算の後、まだ生成していない状態（信頼の文言・詳細と比較の選択・生成のボタン。Review は無い） |
| `1280x800-review-generated-after.jpg` / `390x844-review-generated-after.jpg` | After: 生成した直後の画面（信頼の文言・選択・ボタン・状態の文・集計の始まり） |
| `1280x800-review-summary-after.jpg` / `390x844-review-summary-after.jpg` | After: 集計（最大設計風圧と最小余裕比は別の項目）とグループの始まり |
| `1280-review-section-details-open-after.jpg` / `390-review-section-details-open-after.jpg` | After: Pack Review の欄の全体（選んだケースの詳細と 2 ケースの比較を開いた状態。候補の一覧は閉じたまま） |
| `1280x800-review-2000-summary-after.jpg` / `390x844-review-2000-summary-after.jpg` | After: 2000 ケースの合成 Pack（pressure map）の集計とグループ（同じ最大設計風圧の 667 件は件数を出し、一覧は開いて読む） |
| `1280x800-review-2000-rows-after.jpg` / `390x844-review-2000-rows-after.jpg` | After: 2000 ケースの一覧の 1 ページ目（50 行。390 では表が欄の中で横スクロールする） |
