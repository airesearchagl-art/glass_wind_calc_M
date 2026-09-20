# Task Queue — LR-20260920-GLASS-P2I

## Wave Plan（packet §46）

| Wave | 内容 | 状態 |
|---|---|---|
| 0 | Fresh Gate / Run Artifact / Phase 2H closeout / baseline | DONE |
| 1 | architecture inventory / Review Package contract / privacy contract | PENDING |
| 2 | review-package.js / snapshot / summary / case table / detail selection | DONE |
| 3 | comparison / Evidence・trust display / Markdown / JSON | DONE |
| 4 | Review UI / print view / print CSS / redacted mode / stale warning | PENDING |
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
| AC-15 | print preview成立 | PENDING | |
| AC-16 | print CSS成立 | PENDING | |
| AC-17 | Markdown export成立 | PASS | toMarkdown() 成立。table / heading / code fence / link / script / 改行 いずれの注入も不活性 |
| AC-18 | Review JSON export成立 | PASS | serializeReviewPackage() 成立。key順固定・決定的・sourceSnapshot非出力 |
| AC-19 | Redacted mode成立 | PASS | redacted は model 側で伏せ、JSON と Markdown の両方で marker が出ないことを実測 |
| AC-20 | stale detection成立 | PENDING | |
| AC-21 | diagnostic privacy成立 | PASS | Phase 2G が伏せた秘密らしき値は JSON / Markdown のどちらにも出ない |
| AC-22 | HTML/Markdown injection防止 | PASS | escapeは出所で分岐しない。内部traceの 5<Z<40 も同じ扱い |
| AC-23 | no storage/network | PASS | network / storage API を1つも持たない（source contract） |
| AC-24 | Evidence/verifiedCases不変 | PENDING | |
| AC-25 | README / Run Artifact actual sync | PENDING | |

## Next Action

```text
Wave 4: Review UI / print preview / @media print /
redacted toggle / stale warning / regeneration
```

Ready化・merge・Productionは本CampaignのNext Actionに含めない（Human Gate専管 / §47）。
