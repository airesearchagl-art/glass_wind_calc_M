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
