# Decisions — LR-20260920-GLASS-P2I

## D-000 — digest定義

`TASK_PACKET_SNAPSHOT.md` のファイルbytesに対するSHA-256。
Phase 2D〜2Hと同一。Resume時に再計算して一致を確認する。

```text
901afdc2317e0b38ca90dcb69ba1fb8d8b271b1e073acd40e20d0e784c8f229e
```

## D-001 — Reportは計算しない。呼ぶだけにする（§5 / §9 / AC-05 / AC-07 / AC-08）

- 実測: `WorkspaceCore.summarize()` は §10 が要求する項目を過不足なく返し、
  `evaluateCase()` の結果は §12 の case table 列を**すべて**持っている。
- **決定**: review-package.js は summary を `WorkspaceCore.summarize()` から、
  grouping を `groupByRecommended()` から、行を `evaluateWorkspace()` の結果から取る。
  自前で数えない、自前で最小marginを探さない、自前で設計風圧を出さない。
- governing の定義は Phase 2G のまま（OK行の marginRatio 最小、無ければ designPressure 最大）。
  reportが別定義を持った瞬間、画面とreportで支配ケースが食い違う。
  同じ関数を呼ぶ以上、食い違いようがない、という形にする。
- test: 同じworkspaceに対する review.summary と `WorkspaceCore.summarize()` の
  deepEqual を固定する。片方だけ直る余地を残さない。

## D-002 — traceが無いcaseで、traceを作らない（§14 / 実測）

- 実測: `ProjectInput.windTraceFor()` は
  `manual` でも `registered_preset` でも **null** を返す。
  告示算定を通っていないのだから、Er も qBar も存在しない。
- **決定**: detail section は trace が無いことをそのまま表示する。
  「風条件の内訳はありません（この入力は告示算定を経ていません）」と書く。
  別経路で組み立てない。組み立てた時点で、それは Report builder による再実装であり、
  §6 の非責務に入る。
- 表示が空になるのを嫌ってそれらしい数字を置くのが、この種のツールで最も危険な失敗である。
  無いものは無いと出す。

## D-003 — Workspaceのcaseは、どのProfileから来たかを知らない（§17 / Phase 2H §14の帰結）

- 実測: `workspace.listCases()` が持つのは `{ caseId, label, inputPackage }` だけ。
  Profile への参照は**無い**。Phase 2H の snapshot semantics が、
  Workspaceへ追加した時点で Profile との縁を意図的に切っているためである。
- **決定**: report は「このcaseはProfile Xから生成された」と書かない。書けない。
  PIPが名乗る `sourceKind: notification_calculation` /
  `verificationStatus: unverified` をそのまま出す（これは §17 の要求と一致する）。
- 現在の Runtime Profile を後付けで結び付けると、
  snapshot後にProfileを変更した場合に**嘘の出所**を印刷することになる。
  Phase 2H が snapshot にした理由をreportで壊さない。

## D-004 — escapeの対象はユーザー入力だけではない（§31 / §32 / 実測）

- 実測: trace文字列そのものに `<` が含まれる。
  `GpeBranch: "5<Z<40 (linear interpolation)"`
- **決定**: Markdown escape も DOM 経路も、
  「ユーザー由来かどうか」で分岐させない。reportへ出る文字列は等しく扱う。
  分岐させると、内部由来だから安全という前提が、
  内部文字列の変更1回で崩れる。

## D-005 — source snapshot を成果物へ載せない（実測で見つけたredaction漏れ）

- **実測**: `sourceSnapshot` に `WorkspaceCore.serializeWorkspace()` の出力を
  そのまま入れて export objectへ載せていたため、redacted modeで
  model側は `（非表示）` に伏せているのに、Review JSON には
  **全caseのlabelと入力package一式**が素のまま出ていた。
  自分のtest Z（redacted）が落ちて気づいた。§44 の Redacted mode leak に当たる。
- **決定**: snapshotは `Object.defineProperty(..., { enumerable: false })` で持つ。
  - `isReviewStale()` は今までどおり**厳密比較**を続けられる（弱いhashを作らずに済む）
  - `JSON.stringify` / Markdown / print のどの出口にも出ない
  - export側には free text を含まない `sourceSummary`
    （caseCount / diagnosticCount / schemaVersion）だけを載せる
- **§7のshapeからの逸脱**: packet §7 は `sourceSnapshot` を package内に描いているが、
  §9（redactionはmodel側で行う）と §44（Redacted mode leak）が優先する。
  §7自身も "Exact naming may differ if cleaner" としている。
- 加えて、reportは derived snapshot であって入力の複製ではない。
  入力一式を成果物へ同梱すること自体が、この phase の趣旨に反する。

## D-006 — mutation M10（detach(cases)）は survivor のまま残す

- `detach(cases)` を外してもtestは全部通る（SURVIVED）。
- **理由の実測**: case rowは `pick()` で作った新しいobjectで、
  現在 `REVIEW_CASE_KEYS` はすべて primitive 値である
  （nested object-valued field は 0 件と実測）。
  したがって今のcopyは**観測できる効果を持たない**。
- **決定**: 消さずに残す。ただし coverage を主張しない。
  - これは「別のguardが拾った生存」（D-010）ではなく、
    「構成要素が既に新品なので、copyが今は見えない」種類の生存である
  - `REVIEW_CASE_KEYS` に nested field が1つ加わった瞬間に load-bearing になる
  - 外から観測できる不変条件（生成後にsourceを変えてもreportは変わらない）は
    test U / V / W / X と deepFreeze で既に固定されている
- survivorを黙って消すことも、testが無いのに「覆われている」と言うこともしない。

## D-007 — Review coreに案件のEvidence状態を書かない（Required Fix / Wave 2H）

- **指摘（正当）**: `buildEvidenceSummary()` が
  `verifiedCaseCount: 0` / `projectSpecificPromotion: 'NONE'` /
  `explicitUnresolvedItemCount: 4` を固定値で返していた。
  現在の案件のEvidence状態としては正しい。だが Review core は generic であり、
  **この3つを知り得る立場にない**。
- **実測**: 手入力1件だけのWorkspaceでreportを作ると、
  preset caseが1件も無いのに「未解決4件」「promotion NONE」と報告した。
  偶然正しい値が書いてあるだけで、これは false report である。
- **決定**: 自分の結果集合から導出できる事実だけにする。
  ```text
  bySourceKind             : allResultsから数える
  byVerificationStatus     : allResultsから数える
  reportChangesVerification: false（製品としての固定文）
  note                     : 出力しても検証状況は変わらない
  ```
- 案件のEvidence状態が要るなら、presentation層が
  該当する registered preset を見つけたときだけ Phase 2F の public-safe API を呼ぶ。
  Phase 2F のlogicをここへ複製しない。複製した時点で正が2つになる。
- testは**exportされたobject**を見る。ソースgrepは
  `explicitUnresolvedItemCount` 等の識別子に絞り、説明コメントに当たらないよう
  コメント除去後のコードだけを対象にする。

## D-008 — exporterは「builderが作ったobject」しか受け取らない（§7）

- 形だけ合わせたobjectを exporter へ渡せると、
  `serializeReviewPackage({ reportType:'glass_design_review', summary:{好きな数字} })`
  が本ツール名義のreportとして出てしまう。
- **決定**: module-privateな `WeakSet` に build 結果を登録し、
  `serializeReviewPackage` / `toMarkdown` / `isReviewStale` が印を要求する。
  reportは一方向なので、作り直したobjectを受け取る理由が無い。
  parseして戻したJSONも当然通らない（printした資料を再export用の入力に使わせない）。
- WeakSetなのでreportを捨てれば印も消える。保持も漏洩もしない。

## D-009 — export size cap の値と、その根拠（§19）

- 実測（1000 case / detail 50 / label 200字 / note 2000字）:
  ```text
  Review JSON : 1.02 MiB
  Markdown    : 0.17 MiB
  build       : 71 ms / export 27 ms
  ```
- **決定**: JSON / Markdown ともに上限 **8 MiB**。
  正当な最大reportに対して約8倍の余裕があり、
  「valid な1000-case reportを止めない」という §19 の条件を満たす。
- **正直な但し書き**: core自身が 1000 case / detail 50 / label 200 を
  既に縛っているため、**この上限は現状では到達しない**。
  mutationでcapを外してもtestは落ちない（M15 SURVIVED）。
  §19 が core-side の上限を要求しているので残すが、
  「今効いているguard」ではなく「将来の肥大に対する外枠」である。
  代わりに *最大構成 < 上限の半分* という関係をtestで固定した。
  余裕が消えたらtestが落ち、その時点で値を見直す。

## D-010 — Markdown escapeは出所で分岐しない（§11 / §12）

- traceの中に既に `5<Z<40 (linear interpolation)` がある。
  「ユーザー入力だけescape」にすると、内部文字列の変更1回で前提が崩れる。
- **決定**: report本文へ出る文字列は、出所に関係なく同じ関数を通す。
- escape集合に `-` と `=` も入れた。**理由**: subtitle / note は行頭に置かれるため、
  `- item` や `===` がそのまま箇条書き・setext見出しになる（実測で確認）。
  改行は ` ⏎ ` へ正規化するので、それ以外の行頭文字は発生しない。
- ユーザー文字列から Markdown link を作らない。`[x](javascript:...)` は
  角括弧と丸括弧をescapeするため、linkにならずただの文字として残る。

## D-011 — source contractは「実行コード」だけを見る（§23）

- Markdown exporterには `'- Er / qBar: '` のような**見出し文字列**があり、
  traceからは `t.positive.Er` を**読み出す**。どちらも再実装ではない。
- **決定**: scanの前に (1) string literal と (2) property access を除去し、
  残った裸の識別子だけを「自前の計算」とみなす。
  加えて `Math.pow(` / `Math.sqrt(` / `Math.log(` / `Math.exp(` の不在も確認する。
- 実際に `recomputeEr()` を仕込んで、この narrowed scan が落ちることを確認してから
  採用した（広すぎず、狭すぎないことを実測した）。

## D-012 — 鮮度は旗で持たず、その場で計算し直す（§30 / §31）

- 変更listenerで `reportSettingsDirty = true` を立てる方式にしない。
  listenerを1つ付け忘れた瞬間、**Fullで作った資料をRedactedへ切り替えただけの状態で
  exportできてしまう**。これは §44 の Redacted mode leak に直結する。
- **決定**: `getReviewFreshness()` が呼ばれるたびに
  - Workspace側は `ReviewPackage.isReviewStale()` を呼ぶ（UIで再実装しない）
  - 設定側は `readCurrentReportSettings()` を読み直して厳密比較する
  listenerは表示を早く更新するための便宜であって、境界ではない。
- **実測（mutation U3）**: `settingsDirty = false` に落とすと、browserで
  Full資料のmarkerがRedacted切り替え後にexportされた。
  guardを戻すと export はブロックされmarkerは出ない。
  source contractだけでなく、挙動でも確かめた。

## D-013 — 生成後はWorkspaceを読み直さない（§4）

- preview / Markdown / JSON / print はすべて `activeReview` だけを読む。
  `batchResults` / `batchWorkspace` / `activeProfile` / `scenarioMatrix` を
  report描画に使わない（test UI-4 で固定）。
- 読み直すと、画面に出ている資料とexportした資料が静かに食い違う。
  Workspaceを使うのは「新しく作るとき」と「古いかどうか調べるとき」だけ。

## D-014 — 印刷は現在のページのsafe DOMだけを使う（§25 / §27）

- PDF libraryを入れない。standalone HTMLも書き出さない。
  `@media print` で操作要素を全部隠し、`#review-report` だけを残す。
  ブラウザの「印刷 → PDFとして保存」がそのまま成果物になる。
- 小さなdetail cardは `break-inside: avoid`、長いケース一覧は自然に流す。
  全行を1ページずつに割らない。

## D-015 — Wave 4のtestで見つけた自分の欠陥2件

```text
1. innerText はCSSの text-transform を反映する
   .card-title が大文字化するため、preview の literal 検査が
   '<script>' に一致しなかった。DOMの中身は正しい。
   → 文字列の検査は textContent で行う。

2. 攻撃testが redacted の資料に対して実行されており、何も確かめていなかった
   直前の節で privacy を redacted にしたまま攻撃文字列を入れたため、
   title/note が既定値へ置き換わり、攻撃文字列が資料へ到達していなかった。
   diagnosticsを足して初めて分かった（Markdownの表題が既定値だった）。
   → 攻撃前に privacy を full へ戻す。
     「攻撃が届いたこと」自体をassertする行を足した。
   Phase 2G / Wave 3 と同じ「通ってしまうtest」の系列なので、経緯ごと残す。
```

## D-016 — RF-P1: 印刷の既定を「出さない」にする

- **指摘（正当・実測で再現）**: `printReview()` はアプリのボタンしか守っていなかった。
  print CSS が `#review-report { display: block !important; }` を無条件で当てていたため、
  Ctrl+P / ブラウザメニューからの印刷は鮮度ゲートを素通りした。
  ```text
  再現: Full資料を作成 → privacyをRedactedへ変更 → 再生成しない → 印刷媒体
        freshness      : SETTINGS_DIRTY
        #review-report : display: block
        Fullのmarker   : 印刷媒体に存在
  ```
  §44 の「silent stale report」「Redacted mode leak」に当たる。
- **決定**: 二層にする。
  - Layer A（表示）: `renderReviewFreshness()` が `review-print-allowed` を同期する。UXのため。
  - Layer B（境界）: `beforeprint` が**その場で** `getReviewFreshness()` を計算し直し、印を付け直す。
    こちらが正である。listenerの網羅性を privacy の境界にしない。
  - `afterprint` で許可を落とし、次の印刷でもう一度確かめさせる。
- print CSS の既定は `#review-report { display: none !important; }`。
  許可の印が付いたときだけ表示する。警告は `display` の切り替えで出すので、
  **警告の裏に古い内容が残らない**。
- **実測（修正後）**: 変更イベントを一切出さずに control の値だけ書き換えても、
  `beforeprint` の時点で SETTINGS_DIRTY になり、Fullのmarkerは印刷媒体に現れない。

## D-017 — RF-P2: 比較の片側状態を潰さない

- **指摘（正当・実測で再現）**: `(a && b) ? [a, b] : []` が
  「未選択 / Aのみ / Bのみ」を同じ `[]` に畳んでいた。
  ```text
  再現: 比較なしで作成 → FRESH
        Aだけ選択      → FRESH（本来は SETTINGS_DIRTY）
  ```
  Wave 4 の「比較セレクタの変更は SETTINGS_DIRTY」という契約と矛盾していた。
- **決定**: 設定モデルは `comparisonA` / `comparisonB` を**別々に**持つ。
  snapshotも別々に含めるので、none/none・A/none・none/B・A/B が区別できる。
- 生成時に片側だけなら **fail closed**（「比較する場合は Case A / Case B の両方を選択してください。」）。
  黙って「比較なし」に読み替えない。読み替えると、利用者が選んだつもりの比較が
  資料に出ないまま完成してしまう。

## D-018 — 古いexport出力を画面に残さない（§13 / §14）

- Hard Gateではないが、紛らわしい状態だった。
  Full → Redacted へ切り替えた直後、「設定が変更されています」の警告の横に
  前回のFull出力がそのまま残り、現在の内容のような顔をしていた。
- **決定**: `renderReviewFreshness()` が FRESH 以外を返した時点で、
  export bufferを隠し、値も消す。同じ再計算が print 可否と buffer の両方を守る。
- 既にexport済みのテキストを取り消すものではない。
  古い出力が「現在の内容」を名乗り続けるのを止めるだけである。

## D-019 — 継承した値を契約の値として消費しない（Wave 5 / §40 残り1件）

- **実測（修正前）**: 3つの入口すべてが継承値を採用していた。
  ```text
  metadata   : Object.create({title:'…'})        → 継承titleが資料の表題になった
  options    : Object.create({workspace, privacyMode}) → 継承workspaceで資料が作れた
  diagnostic : Object.create({status:'INVALID',…}) → 偽の診断行が資料に載った
  ```
  原因は単純で、`Object.keys` / `hasOwnProperty` が継承を見ないため、
  「未知のfieldは無い」と判断したあとで、値だけが prototype から読まれていた。
- **これは prototype pollution ではない**。`Object.prototype` はどの経路でも汚れていない。
  起きていたのは「利用者が用意した prototype の値を契約値として消費する」ことである。
  名前を混ぜると、対策の位置を間違える。
- **§6 の3形態は別物**（実測で分けて記録した）:
  ```text
  A  Object.create({...})          → 構造ゲートで拒否
  B  {__proto__: {...}}（リテラル） → prototypeの差し替えなのでAと同じ形
  C  JSON.parse('{"__proto__":…}') → **own** の "__proto__" が出来る
                                     → 未知fieldとして以前から拒否されていた
  ```
- **決定**: `assertOrdinaryObject()` を1つ置き、
  build options / metadata / 各diagnostic の3入口で呼ぶ。
  `Object.getPrototypeOf(v) === Object.prototype || null` のみ通す。
  field単位の継承チェックを足さない（Phase 2H D-010 と同じ理由。
  重複させると前段が生きている限り後段が発火せず、どちらが効いているか分からなくなる）。
- **null prototype は通す**と決めた。継承元が無いので継承値が入り得ず、
  `Object.prototype` 付きより素直なデータである。この選択自体をtestで固定した。
- mutation 5件（ゲート本体の削除 / 3入口からの削除 / 判定条件の骨抜き）すべて KILLED。

## D-020 — surfaceごとに表記がずれていた（Wave 5で発見）

- 比較表の見出しが preview では `差分 (B − A)`、Markdown では `差分 (B - A)` と
  別の文字だった（U+2212 と ASCII hyphen）。
- 機能上の害は無いが、同じ資料の別surfaceとして読むものなので preview 側へそろえた。
- 自分のtestが拾った。3面を同じ基準で突き合わせると、こういう差が出る。

## D-021 — 値そのものを確かめる test が無かった（verifier F1）

- **指摘（正当・再現済み）**: summary / groups / governing の**集計**は固定していたが、
  行と詳細の**値**を確かめる test が1つも無かった。
  実測で、次の6つを仕込んでも 499 件すべて緑のまま通った。
  ```text
  detail の input.widthMm を 1 に      / case行の widthMm を 1 に
  case行の allowablePressure を 1 に   / detail の allowablePressure を 1 に
  detail の status を 'OK' に固定       / detail の designPressure を 0 に
  ```
  最後の2つは Hard Gate（wrong calculation / verified・unverified display inversion）に
  触れる形で、NO_SOLUTION の詳細が OK として印刷されうる状態だった。
- **実装は正しかった**。verifier が自分で書いた照合でも値は完全一致していた。
  欠けていたのは**証明**であり、次の編集で静かに壊れる状態だった。
- **決定**: 値の一致を直接固定する test を4本置く。
  - case行の全項目 == `mergeEvaluationResults()` の対応する値
  - detail.input.* == `workspace.getCase().inputPackage`
  - detail.result.* == `evaluateWorkspace()` の結果
  - 同じ値が Markdown / JSON にも出ること
  すべて「値が実在すること」も併せて確かめる（全部 null でも通る形にしない）。
- 6つの mutant を再実行して全て KILLED を確認した。

## D-022 — 面ごとに**項目立て**がずれていた（verifier F2 / F3）

- Wave 5 の突合（D-020）は**文言**を比べており（U+2212 と `-` の差を拾った）、
  **項目の有無**を比べていなかった。そのため2件が残っていた。
  ```text
  F2  publicLabel  : Markdown / JSON には出るが、preview / print には出ない
                     registered preset では案件名にあたる文字列である
  F3  診断の理由    : preview（15列）/ print / JSON にはあるが、
                     Markdown の表（14列）に無い
  ```
- F2 は **redaction違反ではない**（packet §20 が registered preset の publicLabel の
  表示を明示的に許している）。問題は、画面で承認する人が
  「配る資料に何が載っているか」を見ないまま配れてしまうことである。
- F3 は「なぜこの行が落ちたのか」が議事録へ貼った先でだけ消えることになる。
- **決定**: preview に表示名を出し、Markdown の表に備考列を足して、
  4面の項目立てをそろえた。どちらも mutant で固定した。

## D-023 — 印刷の関門を fail closed にする（verifier F4）

- `beforeprint` が `applyPrintEligibility(getReviewFreshness() === FRESH)` の1行だったため、
  鮮度計算が例外を投げると **applyPrintEligibility が呼ばれず、前回の許可が残った**。
  verifier の再現（control要素を外して null 参照させる）は人工的だが、
  構造としてはコメントが主張する「最終関門」の逆だった。
- **決定**: まず `applyPrintEligibility(false)` で落とし、確かめられたときだけ与え直す。
  例外時も落としたままにする。`afterprint` と同じ形にそろえた。

## D-024 — 「生存2件」という書き方が実態より狭かった（verifier の artifact 指摘）

- `QUALITY_DEBT.md` / `TASK_QUEUE.md` に「生存2件」「防御的事実2件」と書いていた。
  各 wave の battery は**その wave の guard に対して** SURVIVED 0 であり、その範囲では正しい。
  しかし全体として「生存は2件」と読める書き方になっており、
  実際には値系の7件（F1）が生き残っていた。
- **決定**: 集計の書き方を変える。
  - 各 campaign の数字は範囲付きで残す（何を対象にした battery かを明記）
  - 「全 corpus に対する生存」は別項目として、verifier の45件の結果を採用する
  - F1 修理後の再測で、値系7件は KILLED になった
- 数字を後から良く見せないための書き方であって、過去の数字を消すものではない。

## D-025 — export上限の余裕は多バイト文字で測る（verifier F5 / F6）

- capは UTF-8 bytes で測っているのに、headroom の test は `.length`（UTF-16 code units）で
  測っていた。日本語ラベルでは両者が1.2〜1.9倍ずれる。
- 記録していた「最大構成 1.21 MiB」も、ラベルが英字の場合の値だった。
  日本語ラベル（このツールの実際の使われ方）で測り直すと **1.33 MiB**。
- **決定**: test も記録も UTF-8 bytes で測る。cap 8 MiB は据え置き
  （余裕は約6.0倍で、動かす実測上の理由が無い）。

## D-026 — repo外の資産に Hard Gate を依存させない（verifier の durability 指摘）

- privacyMode を設定snapshotから落とす mutant を殺していたのは browser suite だけで、
  それは session の scratchpad にあり repository には無い。
  「npm test 500件」を関門として引用すると、この Hard Gate は守られていないことになる。
- **決定**: snapshot が6系統すべてを含むことを `npm test` 側の contract test で固定した。
  同じ mutant を npm test だけで KILLED にできることを実測で確認した。
