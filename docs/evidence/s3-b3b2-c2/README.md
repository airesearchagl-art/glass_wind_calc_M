# S3-B3B2-C2 Pack Review の印刷・PDF — 合成の画像

S3-B3B2-C2（Pack Review の印刷・PDF）のレビュー用の画像です。値はすべて合成です（`tests/fixtures/project-pack/` の fixture と、
`tests/support/synthetic-pack.js` がその場で作る 2000 ケースの Pack）。実案件のデータ・資料は含みません。印刷・PDF は未レビュー
（pack_unreviewed）・計算済み ≠ 検証済み（calculated_not_verified）で、正式な案件承認の資料ではありません。PDF そのものは commit
していません（画像は数ページだけを低解像度にしたものです）。

## 画面（Chromium・`file://`・この branch の index.html）

告示 fixture（`synthetic-notification1458.json`）で全ケース計算をして「Pack Reviewを生成」を押した後に、印刷の欄
（`#pack-review-print-section`）が見える位置まで送って撮りました。印刷の event はこの撮影用の script が合成しています
（ネイティブの印刷はしていません。DENY_PENDING の画像は、`beforeprint` だけを送って `afterprint` を送らずに戻した後のものです）。

| 画像 | 内容 |
|---|---|
| `1280x800-print-ready.png` | Review を生成した直後（ボタンが押せる。信頼・共有・用紙・ヘッダーとフッター OFF・再読み込みの注意はボタンの前に常に見える） |
| `1280x800-print-deny-pending.png` | DENY_PENDING（ボタンは押せない。再読み込みでだけ戻ること、再読み込みで Pack と Review も消えること、自動では再読み込みしないことを状態の欄に表示） |
| `390x844-print-ready.png` | 390×844 の幅で、Review を生成した直後（横にはみ出さない） |

## 印刷された PDF（ネイティブの経路）

`tools/browser-checks/project-pack-review-print.mjs` を `PACK_PRINT_EVIDENCE_DIR` 付きで実行し、仮想ディスプレイのヘッド付き
Chromium 141（`--kiosk-printing`・送信先「PDF に保存」・ヘッダーとフッター OFF）で画面のボタン → 製品の `window.print()` から
保存した PDF の 1 ページを、Poppler の `pdftoppm -png -r 50` で画像にしました。

| 画像 | 内容 |
|---|---|
| `pack-print-notification-p1.png` | 告示 fixture（3 ケース・詳細 G002・比較 G001 / G003）の 1 ページ目（題・未レビューの信頼の行・固定の注意・丸めの注記・共有の注意・出力の情報・集計・グループ。下の余白に全ページの未レビューの表示とページ番号） |
| `pack-print-2000-cases-p10.png` | 2000 ケース・詳細 50・比較の PDF の 10 ページ目（ケース一覧の途中。表の見出しの繰り返し・黒い文字・下の余白の表示） |
| `pack-print-deny-pending.png` | DENY_PENDING の印刷（固定の拒否文だけ。Pack の本文・Workspace の資料・アプリのヘッダーは出ない） |
| `pack-print-ctrl-p-hint.png` | Project Pack 画面での素の Ctrl+P（仮想ディスプレイの XTest で送った実際のキー入力。案内文だけ） |

A3 横・本文 10pt は、読みやすさを確かめる前の第一候補です。紙面の最終の採用は目視と Human の判断で、ヘッド付きの Chrome / Edge の
実際の印刷ダイアログ（保存・キャンセル・非同期の印刷・ブラウザのヘッダーとフッター）の確認は手動の項目（U-7）として残っています。
