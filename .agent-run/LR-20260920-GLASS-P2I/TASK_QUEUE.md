# Task Queue — LR-20260920-GLASS-P2I

## Wave Plan（packet §46）

| Wave | 内容 | 状態 |
|---|---|---|
| 0 | Fresh Gate / Run Artifact / Phase 2H closeout / baseline | DONE |
| 1 | architecture inventory / Review Package contract / privacy contract | PENDING |
| 2 | review-package.js / snapshot / summary / case table / detail selection | DONE |
| 3 | comparison / Evidence・trust display / Markdown / JSON | DONE |
| 4 | Review UI / print view / print CSS / redacted mode / stale warning | DONE |
| 5 | security / privacy / injection / mutation / size limits | PENDING |
| 6 | full regression / browser / independent verifier / repair | PENDING |
| 7 | README / Run Artifact convergence / Draft PR / Completion Report | PENDING |

## Acceptance Criteria（packet §38）

| AC | 内容 | 状態 | 実測 |
|---|---|---|---|
| AC-01 | Single regressionなし | PENDING | |
| AC-02 | Batch regressionなし | PENDING | |
| AC-03 | Profile/Scenario regressionなし | PENDING | |
| AC-04 | Review Package v1成立 | PASS | Review Package v1（schemaVersion 1 / reportType glass_design_review）成立。Workspace/PIPに見えるtypeを名乗らない |
| AC-05 | Reviewはderived-only | PASS | buildReviewPackage()は計算済みの結論を引数で受け取らない（results/summary/governingCase等を名指しで拒否） |
| AC-06 | Review import pathなし | PASS | import系API 0件。Review JSONは Workspace / PIP のどちらのdeserializeでも失敗する |
| AC-07 | SummaryはWorkspaceCoreと一致 | PASS | review.summary が WorkspaceCore.summarize() と deepEqual。mutation M1 KILLED |
| AC-08 | governing definition一致 | PASS | governingCaseId / basis は summarize() の答えをそのまま使う。mutation M2 KILLED |
| AC-09 | 全case table成立 | PASS | OK / NO_SOLUTION / INVALID を含む全件table。INVALID行の計算値はnull |
| AC-10 | selected detail成立 | PASS | detail選択: 未知ID / 重複 / 上限51 / INVALID診断 をすべて拒否。上限50ちょうどは通る |
| AC-11 | Notification trace再利用 | PASS | notification detail の trace が windTraceFor() と deepEqual（Er / qBar 一致） |
| AC-12 | formula/input verification分離 | PASS | formulaVerificationStatus と inputVerificationStatus を別々に保持。統合badgeを作らない |
| AC-13 | Evidence status非退行 | PENDING | |
| AC-14 | two-case factual comparison成立 | PASS | 2ケースの事実差分のみ。delta = B - A。winner/better/safer を model / JSON / Markdown のどこにも持たない |
| AC-15 | print preview成立 | PASS | Review Report Preview を Batch view に追加。描画元は activeReview のみ（mutation U6 KILLED） |
| AC-16 | print CSS成立 | PASS | @media print で操作要素を全て隠し #review-report だけ残す。break-inside: avoid（mutation U9 KILLED） |
| AC-17 | Markdown export成立 | PASS | toMarkdown() 成立。table / heading / code fence / link / script / 改行 いずれの注入も不活性 |
| AC-18 | Review JSON export成立 | PASS | serializeReviewPackage() 成立。key順固定・決定的・sourceSnapshot非出力 |
| AC-19 | Redacted mode成立 | PASS | redacted は model 側で伏せ、JSON と Markdown の両方で marker が出ないことを実測 |
| AC-20 | stale detection成立 | PASS | NO_REPORT / FRESH / WORKSPACE_STALE / SETTINGS_DIRTY / BOTH_STALE。自動再生成なし。export / print はFRESHのみ |
| AC-21 | diagnostic privacy成立 | PASS | Phase 2G が伏せた秘密らしき値は JSON / Markdown のどちらにも出ない |
| AC-22 | HTML/Markdown injection防止 | PASS | escapeは出所で分岐しない。内部traceの 5<Z<40 も同じ扱い |
| AC-23 | no storage/network | PASS | network / storage API を1つも持たない（source contract） |
| AC-24 | Evidence/verifiedCases不変 | PENDING | |
| AC-25 | README / Run Artifact actual sync | PENDING | |

## Next Action

```text
Wave 5: security / privacy / injection / mutation / size limits
（Wave 4で先行実施した分は RUN_STATE に実測済み）
```

Ready化・merge・Productionは本CampaignのNext Actionに含めない（Human Gate専管 / §47）。

## §40 攻撃セット突合 — 最終（§43。未分類・推測の行を残さない）

| Attack | 最初のevidence | 以後に境界が変わったか | Wave 5で再実行 | 最終状態 |
|---|---|---|---|---|
| `<script>` in title/note/label | W3 md / W4 §41 | NO | YES（§19 print media） | RE-RUN PASS |
| `<img onerror>` | W3 / W4 §41 | NO | YES（§19） | RE-RUN PASS |
| `5<Z<40`（内部trace由来） | W3 / W4 | NO | YES（§19 print で literal 維持） | RE-RUN PASS |
| `\|` / backtick / `# heading` / code fence | W3 / W4 §41 | NO | YES（§19 構造不変を確認） | RE-RUN PASS |
| `javascript:` link構文 | W3 / W4 §41 | NO | YES（§19 anchor 0件） | RE-RUN PASS |
| file path風 / URL風 text | W4 §41 | NO | YES（§19 subtitle / note） | RE-RUN PASS |
| 秘密らしき診断値 | W2 §26 / W3 / W4 §34 | NO | YES（§12 / §32 4面） | RE-RUN PASS |
| prototype 経由の入力 | （W5まで未測定） | YES（W5で入口を追加） | YES | **FIXED IN W5** |
| unknown / duplicate caseId | W2 J/K | NO | NO（境界不変） | PASS |
| INVALID を detail に選択 | W2 M / W4 | NO | NO（境界不変） | PASS |
| 生成後のWorkspace変更 | W2 U/V / W4 §33 | YES（4H で beforeprint 追加） | YES（§20 / §21） | RE-RUN PASS |
| Redacted漏れ | W2（漏れ→修正）/ W3 / 4H | YES（4H RF-P1） | YES（§10 / §33 / §19） | RE-RUN PASS |
| report JSON の再取り込み | W2 R/S / W3 W3-8..10 | NO | NO（境界不変） | PASS |

未分類なし。`unknown` / `assumed` / `probably covered` は使用していない。

## mutation 集計（§44。campaignごとに分けて記録する）

| campaign | KILLED | SURVIVED | PATCH-MISS |
|---|---|---|---|
| Wave 2（Review core） | 11 | 1 | 0 |
| Wave 2H（evidenceSummary genericity） | 4 | 0 | 0 |
| Wave 3（exporters） | 14 | 1 | 0 |
| Wave 4（Review UI） | 10 | 0 | 0 |
| Wave 4H（print / comparison boundary） | 8 | 0 | 0 |
| Wave 5 prototype gate | 5 | 0 | 0 |
| Wave 5 residual | 5 | 0 | 0 |

生存2件の正体（名前を付け替えない）:

```text
M10  detach(cases)
     case行が primitive のみで構成されるため、copyの効果が観測できない。
     Wave 4 / 5 で REVIEW_CASE_KEYS に nested field は入っていない（testで確認）。
     よって理由は変わらず SURVIVED のまま。

M15  export size cap 8 MiB
     core側の上限（1000 case / detail 50 / label 200 / note 2000）の下では到達しない。
     §19が core-side の上限を要求するため残す。防御的な外枠であり、
     「今効いているguard」ではない。
```

Wave 5 residual の内訳:

```text
W5-07 診断の生reasonを通す                KILLED
W5-09 previewが支配ケースを選び直す        SURVIVED → test追加後 KILLED（下記）
W5-10 比較の差分を A−B へ反転              KILLED
W5-12 Report操作に fetch を仕込む          KILLED
W5-13 Review生成に localStorage を仕込む   KILLED
```

W5-01〜W5-04（ordinary-object gate）は prototype campaign として別掲。
W5-05 / W5-06（Redacted復活）は Wave 3 M10 / M11、
W5-08（formula/input 統合）は Wave 3 M12、
W5-11（beforeprint 迂回）は Wave 4H P1 / P2、
W5-14（sourceSnapshot を JSON へ）は Wave 3 M3 で既に KILLED 済み。
対象コードが Wave 5 で変わっていないため再実行していない（§36の指示どおり）。
