# S3-B3B2-C1-B Pack Review の出力の画面 — 合成のスクリーンショット

S3-B3B2-C1-B（Project Pack 画面への Pack Review の Markdown / JSON 出力の接続）のレビュー用の画像です。この branch の
index.html を Chromium で `file://` から開き、`#pack-review-export-section` が見える位置まで送って撮りました（1280×800 と 390×844）。

- 値はすべて合成です（`tests/fixtures/project-pack/synthetic-notification1458.json`）。実案件のデータ・資料は含みません。
- 画面の内容は撮った時点の index.html のものです。計算の値・Evidence / Closure の判定の根拠ではありません（計算済み ≠ 検証済み。
  出力は正式な案件承認の資料ではありません）。
- 告示 fixture で全ケース計算をした後、詳細に G002、比較に A = G001 / B = G003 を選んでから「Pack Reviewを生成」を押しています。

| 画像 | 内容 |
|---|---|
| `1280x800-export-before-review.jpg` / `390x844-export-before-review.jpg` | 全ケース計算の後、Review を生成する前（出力のボタンは押せない。信頼と共有の注意は見えている） |
| `1280x800-export-ready-after.jpg` / `390x844-export-ready-after.jpg` | Review を生成した直後（出力のボタンが押せるが、出力は自動では作らない） |
| `1280x800-export-markdown-after.jpg` / `390x844-export-markdown-after.jpg` | 「Markdownを表示」を押した後（読み取り専用の欄に Markdown。冒頭に trust と固定の注意 4 件） |
| `1280x800-export-json-after.jpg` / `390x844-export-json-after.jpg` | 「JSONを表示」を押した後（Markdown を完全に置き換える。外枠は exportType・exportSchemaVersion・notices など） |
| `1280x800-export-cleared-after.jpg` / `390x844-export-cleared-after.jpg` | 全ケース計算をやり直した後（Review が消え、出力も消えた。「Pack Review が消えたので、出力も消しました。」） |
